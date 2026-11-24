import {BONUS_CATEGORIES,type BonusResult} from '../../shared/hr-bonus';
import {paymentTaxes,type PayrollPaidIncome} from '../../shared/hr-payroll-supplement';
import type {PayrollProfile,TaxTable} from '../../shared/hr-payroll';
import {AuditService} from '../audit/audit-service';
import {HrValidationError,object,integer,required,date} from './hr-validation';
import type {HrContext} from './hr-service';

type Row=Record<string,string|number|null>;
interface BatchRow extends Row {id:number;pay_date:string;category:string;attribution_year:number|null;status:'draft'|'paid'|'void';revision:number;void_reason:string}
interface PaymentRow extends Row {id:number;batch_id:number;employee_id:number;employee_no:string;name:string;amount:number;note:string;result_json:string}
// The same source snapshot is checked inside the atomic payment transaction.
const SOURCE=`SELECT json_object(
 'employee',json((SELECT json_object('id',id,'hire_date',hire_date) FROM hr_employees WHERE id=?1)),
 'profile',json((SELECT json_object('id',id,'settings',json(settings_json)) FROM hr_payroll_profiles WHERE employee_id=?1 AND effective_date<=?2 ORDER BY effective_date DESC,id DESC LIMIT 1)),
 'tax',json((SELECT json_object('id',id,'validUntil',valid_until,'data',json(payload_json)) FROM hr_payroll_rule_versions WHERE kind='tax' AND effective_date<=?2 ORDER BY effective_date DESC,id DESC LIMIT 1)),
 'policy',json((SELECT json_object('id',id,'effectiveDate',effective_date,'source',source_url,'data',json(payload_json)) FROM hr_payroll_supplement_versions WHERE effective_date<=?2 ORDER BY effective_date DESC,id DESC LIMIT 1)),
 'minimum',(SELECT monthly_amount FROM hr_minimum_wages WHERE effective_date<=?2 ORDER BY effective_date DESC LIMIT 1),
 'blocks',json((SELECT json_group_array(kind) FROM hr_payroll_sync_state WHERE blocking=1)),
 'paid',json((SELECT json_group_array(json_object('source',source,'id',id,'date',pay_date,'result',json_object('regularTaxable',json_extract(result_json,'$.regularTaxable'),'bonusGross',json_extract(result_json,'$.bonusGross'),'taxRegular',json_extract(result_json,'$.taxRegular'),'taxBonus',json_extract(result_json,'$.taxBonus'),'nhiPremium',json_extract(result_json,'$.nhiPremium'),'nhiIncome',json_extract(result_json,'$.nhiIncome')))) FROM (SELECT * FROM hr_paid_income WHERE employee_id=?1 AND pay_date BETWEEN substr(?2,1,4)||'-01-01' AND substr(?2,1,4)||'-12-31' ORDER BY pay_date,source,id LIMIT 501)))
)`;
interface Source {
 employee:{id:number;hire_date:string}|null;
 profile:{id:number;settings:PayrollProfile}|null;
 tax:{id:number;validUntil:string;data:TaxTable}|null;
 policy:{id:number;effectiveDate:string;source:string;data:{rate:number;cap:number;multiple:number}}|null;
 minimum:number|null;blocks:string[];
 paid:{source:string;id:number;date:string;result:Partial<BonusResult>}[];
}
interface Input {payDate:string;category:string;attributionYear:number|null;payments:{employeeId:number;amount:number;note:string}[]}
export class HrBonusService {
 constructor(private db:D1Database){}
 private input(raw:unknown):Input {
  const v=object(raw),payDate=date(v.payDate,'payDate'),kind=required(v.category,'category',100);
  if(!BONUS_CATEGORIES.includes(kind as typeof BONUS_CATEGORIES[number]))throw new HrValidationError('category','請選擇獎金項目');
  const category=kind==='其他'?required(v.customCategory,'customCategory',100):kind;
  const attributionYear=v.attributionYear==null||v.attributionYear===''?null:integer(v.attributionYear,'attributionYear',true);
  if(attributionYear!=null&&(attributionYear<1900||attributionYear>9999))throw new HrValidationError('attributionYear','歸屬年度須為四碼年份');
  if(!Array.isArray(v.payments)||!v.payments.length||v.payments.length>200)throw new HrValidationError('payments','請選擇1至200位員工');
  const payments=v.payments.map(raw=>{const p=object(raw),amount=integer(p.amount,'amount',true);if(amount>1_000_000_000)throw new HrValidationError('amount','金額超過上限');return {employeeId:integer(p.employeeId,'employeeId',true),amount,note:typeof p.note==='string'?p.note.trim():''};});
  if(new Set(payments.map(p=>p.employeeId)).size!==payments.length)throw new HrValidationError('payments','同一批次員工不可重複');
  if(payments.some(p=>p.note.length>1000))throw new HrValidationError('note','備註最多1000字');
  return {payDate,category,attributionYear,payments:payments.sort((a,b)=>a.employeeId-b.employeeId)};
 }
 private async sources(employeeIds:number[],payDate:string){
  const rows=await this.db.prepare(`SELECT ids.value AS employeeId,(${SOURCE.replaceAll('?1','ids.value')}) AS body FROM json_each(?1) ids`).bind(JSON.stringify(employeeIds),payDate).all<{employeeId:number;body:string}>();
  const result=new Map<number,{json:string;data:Source}>();let bytes=0;
  for(const row of rows.results??[]){const s=JSON.parse(row.body) as Source;bytes+=row.body.length;
   if(!s.employee)throw new HrValidationError('employeeId','員工不存在',404);
   if(s.paid.length>500||bytes>3_000_000)throw new HrValidationError('limit','給付來源超過本批上限，請拆批處理');
   result.set(row.employeeId,{json:row.body,data:s});
  }
  return result;
 }
 private compute(s:Source,payDate:string,amount:number):BonusResult {
  const issues:string[]=[],p=s.profile?.settings;
  if(!p)issues.push('請先建立給付日有效的計薪／投保設定');
  if(!s.tax||s.tax.validUntil<payDate)issues.push('缺少給付日有效的官方扣繳表');
  if(s.employee!.hire_date>payDate)issues.push('發放日期早於到職日');
  if(s.paid.some(r=>r.date>payDate))issues.push('已有較晚給付的已發薪／獎金，請先核對給付順序');
  if(s.paid.some(r=>r.result.regularTaxable==null||r.result.bonusGross==null))issues.push('年度已發薪資料缺少所得累計基準，須先核對');
  if(s.blocks.length)issues.push('官方資料驗證異常，須先處理更新狀態');
  const paid:PayrollPaidIncome[]=s.paid.filter(r=>r.date<=payDate).map(r=>({date:r.date,regular:r.result.regularTaxable??0,bonus:r.result.bonusGross??0,taxRegular:r.result.taxRegular??0,taxBonus:r.result.taxBonus??0,nhiPremium:r.result.nhiPremium??0,nhiIncome:r.result.nhiIncome??0}));
  const payment=p?paymentTaxes(payDate,0,amount,p,s.tax&&s.tax.validUntil>=payDate?s.tax.data:undefined,{requirePaymentFacts:true,policy:s.policy?{...s.policy,...s.policy.data}:null,paidIncome:paid,paymentMinimum:s.minimum??undefined},x=>issues.push(x)):{taxRegular:0,taxBonus:0,nhiPremium:0,nhiIncome:amount,bonusGross:amount,regularTaxable:0};
  const deductions=payment.taxRegular+payment.taxBonus+payment.nhiPremium;
  return {...payment,gross:amount,deductions,net:amount-deductions,nhiUnitKey:p?.nhiUnitKey??'',issues:[...new Set(issues)],profileId:s.profile?.id??null,taxRuleId:s.tax?.id??null,policyId:s.policy?.id??null};
 }
 async get(id:number){
  const batch=await this.db.prepare('SELECT id,pay_date,category,attribution_year,status,revision,void_reason FROM hr_bonus_batches WHERE id=?').bind(id).first<BatchRow>();
  if(!batch)throw new HrValidationError('id','獎金批次不存在',404);
  const rows=await this.db.prepare('SELECT p.id,p.employee_id,e.employee_no,e.name,p.amount,p.note,p.result_json FROM hr_bonus_payments p JOIN hr_employees e ON e.id=p.employee_id WHERE p.batch_id=? ORDER BY e.employee_no,p.id').bind(id).all<PaymentRow>();
  return {...batch,payments:(rows.results??[]).map(({result_json,...r})=>({...r,result:JSON.parse(String(result_json)) as BonusResult}))};
 }
 async list(year:number,employeeId:number|null=null,before:number|null=null){
  if(!Number.isInteger(year)||year<1900||year>9999)throw new HrValidationError('year','年度格式不正確');
  // Employee history is all years; otherwise an indexed payment-date range.
  const rows=await this.db.prepare(`SELECT p.id,p.batch_id,p.employee_id,e.employee_no,e.name,p.amount,p.note,p.result_json,b.pay_date,b.category,b.attribution_year,b.status FROM hr_bonus_payments p JOIN hr_bonus_batches b ON b.id=p.batch_id JOIN hr_employees e ON e.id=p.employee_id WHERE ${employeeId?'p.employee_id=?':'b.pay_date BETWEEN ? AND ?'} AND (? IS NULL OR p.id<?) ORDER BY p.id DESC LIMIT 101`).bind(...(employeeId?[employeeId]:[year+'-01-01',year+'-12-31']),before,before).all<PaymentRow>();
  const items=(rows.results??[]).slice(0,100).map(({result_json,...r})=>({...r,result:JSON.parse(String(result_json)) as BonusResult}));
  return {items,nextCursor:(rows.results??[]).length>100?items.at(-1)!.id:null};
 }
 async save(raw:unknown,ctx:HrContext,id?:number){
  const v=object(raw),input=this.input(v),key=required(v.requestKey,'requestKey',100);
  const existing=id?await this.get(id):null;
  if(existing&&(existing.status!=='draft'||existing.revision!==integer(v.revision,'revision',true)))throw new HrValidationError('revision','獎金批次已更動，請重新讀取',409);
  if(!existing){const prior=await this.db.prepare('SELECT id FROM hr_bonus_batches WHERE request_key=?').bind(key).first<{id:number}>();if(prior){
   const saved=await this.get(prior.id),payments=saved.payments.map(p=>({employeeId:p.employee_id,amount:p.amount,note:p.note})).sort((a,b)=>a.employeeId-b.employeeId);
   if(saved.pay_date!==input.payDate||saved.category!==input.category||saved.attribution_year!==input.attributionYear||JSON.stringify(payments)!==JSON.stringify(input.payments))throw new HrValidationError('requestKey','此筆已儲存其他內容，請關閉並重新開啟確認',409);
   return saved;
  }}
  const sources=await this.sources(input.payments.map(p=>p.employeeId),input.payDate);
  const calculated=input.payments.map(p=>{const source=sources.get(p.employeeId)!;return {...p,source:source.json,result:this.compute(source.data,input.payDate,p.amount)};});
  const payload=JSON.stringify(calculated);
  if(new TextEncoder().encode(payload).byteLength>1_800_000)throw new HrValidationError('limit','本批給付資料過大，請拆批處理');
  const statements:D1PreparedStatement[]=[];
  if(existing)statements.push(this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_bonus_batches WHERE id=? AND revision=? AND status='draft') THEN 1 ELSE json('') END").bind(id,existing.revision));
  statements.push(this.db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(?) selected JOIN hr_bonus_payments p ON p.employee_id=selected.value JOIN hr_bonus_batches b ON b.id=p.batch_id WHERE b.pay_date=? AND b.category=? AND b.attribution_year IS ? AND b.status!='void' AND b.id!=?) THEN 1 ELSE json('') END").bind(JSON.stringify(calculated.map(p=>p.employeeId)),input.payDate,input.category,input.attributionYear,id??0));
  if(existing){statements.push(this.db.prepare('UPDATE hr_bonus_batches SET pay_date=?,category=?,attribution_year=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=?').bind(input.payDate,input.category,input.attributionYear,ctx.now,ctx.actor,id));statements.push(this.db.prepare('DELETE FROM hr_bonus_payments WHERE batch_id=?').bind(id));}
  else statements.push(this.db.prepare('INSERT INTO hr_bonus_batches(request_key,pay_date,category,attribution_year,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)').bind(key,input.payDate,input.category,input.attributionYear,ctx.now,ctx.actor,ctx.now,ctx.actor));
  statements.push(this.db.prepare(`INSERT INTO hr_bonus_payments(batch_id,employee_id,amount,note,source_json,result_json) SELECT b.id,json_extract(p.value,'$.employeeId'),json_extract(p.value,'$.amount'),json_extract(p.value,'$.note'),json_extract(p.value,'$.source'),json_extract(p.value,'$.result') FROM json_each(?) p JOIN hr_bonus_batches b ON ${existing?'b.id=?':'b.request_key=?'}`).bind(payload,existing?id:key));
  statements.push(new AuditService(this.db).prepareRecord({entityType:'hr_bonus',entityKey:existing?String(id):key,action:'hr_bonus.saved',actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{payDate:input.payDate,category:input.category,count:calculated.length,total:calculated.reduce((n,p)=>n+p.amount,0)}}));
  await this.db.batch(statements);
  const saved=existing?{id:id!}:await this.db.prepare('SELECT id FROM hr_bonus_batches WHERE request_key=?').bind(key).first<{id:number}>();return this.get(saved!.id);
 }
 async transition(id:number,raw:unknown,ctx:HrContext){
  const v=object(raw),action=required(v.action,'action'),revision=integer(v.revision,'revision',true),batch=await this.get(id);
  if(action==='pay'&&batch.status==='paid')return batch;
  if(batch.revision!==revision)throw new HrValidationError('revision','獎金批次已更動，請重新讀取',409);
  if(!['pay','void'].includes(action)||batch.status==='void'||action==='pay'&&batch.status!=='draft')throw new HrValidationError('status','此狀態無法操作',409);
  const reason=action==='void'?required(v.reason,'reason',1000):'';
  const statements=[this.db.prepare('SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_bonus_batches WHERE id=? AND revision=? AND status=?) THEN 1 ELSE json(\'\') END').bind(id,revision,batch.status)];
  if(action==='pay'){
   const payments=await this.db.prepare('SELECT employee_id,source_json,result_json FROM hr_bonus_payments WHERE batch_id=? ORDER BY employee_id').bind(id).all<{employee_id:number;source_json:string;result_json:string}>();
   const sources=await this.sources((payments.results??[]).map(p=>p.employee_id),batch.pay_date);
   for(const p of payments.results??[]){if((JSON.parse(p.result_json) as BonusResult).issues.length)throw new HrValidationError('issues','仍有待補事項，請補齊並重新計算草稿',409);
    if(sources.get(p.employee_id)!.json!==p.source_json)throw new HrValidationError('source','給付累計或設定已異動，請重新計算草稿',409);
   }
   statements.push(this.db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hr_bonus_payments p WHERE p.batch_id=?1 AND p.source_json!=(${SOURCE.replaceAll('?1','p.employee_id')})) THEN 1 ELSE json('') END`).bind(id,batch.pay_date));
  }
  if(action==='void'&&batch.status==='paid'){
   // Do not silently change a later immutable payment's cumulative withholding.
   const dependent="SELECT 1 FROM hr_paid_income i,json_each(i.source_json,CASE i.source WHEN 'bonus' THEN '$.paid' ELSE '$.paidIncome' END) used WHERE i.employee_id IN(SELECT employee_id FROM hr_bonus_payments WHERE batch_id=?1) AND json_extract(used.value,'$.source')='bonus' AND json_extract(used.value,'$.id') IN(SELECT id FROM hr_bonus_payments WHERE batch_id=?1)";
   if(await this.db.prepare(dependent).bind(id).first())throw new HrValidationError('source','已有後續給付引用本筆獎金，須先核對後續扣繳，不可直接作廢',409);
   statements.push(this.db.prepare(`SELECT CASE WHEN NOT EXISTS(${dependent}) THEN 1 ELSE json('') END`).bind(id));
  }
  statements.push(this.db.prepare('UPDATE hr_bonus_batches SET status=?,revision=revision+1,updated_at=?,updated_by=?,paid_at=CASE WHEN ?=\'paid\' THEN ? ELSE paid_at END,void_reason=? WHERE id=?').bind(action==='pay'?'paid':'void',ctx.now,ctx.actor,action==='pay'?'paid':'void',ctx.now,reason,id));
  statements.push(new AuditService(this.db).prepareRecord({entityType:'hr_bonus',entityKey:String(id),action:'hr_bonus.'+action,actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:{status:batch.status},after:{status:action==='pay'?'paid':'void',reason}}));
  await this.db.batch(statements);return this.get(id);
 }
}
