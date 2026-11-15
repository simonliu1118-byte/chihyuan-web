import {integer,object,required,HrValidationError} from './hr-validation';
import {AuditService} from '../audit/audit-service';
import type {HrContext} from './hr-service';
export const correctionLabels:Record<string,string>={salary_topup:'補發工資',salary_recovery:'追回溢領工資',insurance_charge:'補扣個人保費',insurance_refund:'退還個人保費',tax_charge:'補扣扣繳稅款',tax_refund:'退還扣繳稅款'};
export class HrPayrollCorrections {
 constructor(private db:D1Database){}
 async list(employee:number,month:string){const [entries,paid]=await Promise.all([
  this.db.prepare('SELECT c.*,r.month AS source_month,EXISTS(SELECT 1 FROM hr_payroll_correction_uses u WHERE u.correction_id=c.id AND u.is_active=1) AS claimed FROM hr_payroll_corrections c JOIN hr_payroll_runs r ON r.id=c.source_run_id WHERE c.employee_id=? AND c.target_month=? ORDER BY c.id LIMIT 201').bind(employee,month).all(),
  this.db.prepare("SELECT id,month,pay_date,result_json FROM hr_payroll_runs WHERE employee_id=? AND status='paid' AND month<? ORDER BY month DESC,id DESC LIMIT 501").bind(employee,month).all<{id:number;month:string;pay_date:string;result_json:string}>(),
 ]);if((entries.results??[]).length>200||(paid.results??[]).length>500)throw new HrValidationError('limit','更正紀錄超過單次上限');return {entries:entries.results??[],paidRuns:(paid.results??[]).map(r=>({id:r.id,month:r.month,payDate:r.pay_date,net:JSON.parse(r.result_json).net}))};}
 async create(employee:number,month:string,raw:unknown,ctx:HrContext){
  const v=object(raw),source=integer(v.sourceRunId,'sourceRunId',true),amount=integer(v.amount,'amount',true),kind=required(v.kind,'kind'),reference=required(v.reference,'reference',1000),reason=required(v.reason,'reason',1000),consent=typeof v.consentReference==='string'?v.consentReference.trim():'',key=required(v.requestKey,'requestKey',100);
  if(!correctionLabels[kind]||amount>10000000)throw new HrValidationError('kind','更正種類／金額不正確');
  if(kind==='salary_recovery'&&!consent)throw new HrValidationError('consentReference','追回工資必須有員工明確同意的抵扣依據，不能單方扣薪');
  const prior=await this.db.prepare('SELECT employee_id,source_run_id,target_month,kind,amount,reference,consent_reference,reason FROM hr_payroll_corrections WHERE request_key=?').bind(key).first<Record<string,unknown>>();
  if(prior){if(prior.employee_id!==employee||prior.source_run_id!==source||prior.target_month!==month||prior.kind!==kind||prior.amount!==amount||prior.reference!==reference||prior.consent_reference!==consent||prior.reason!==reason)throw new HrValidationError('requestKey','相同送出識別碼不能變更內容',409);return this.list(employee,month);}
  const original=await this.db.prepare("SELECT result_json,revision FROM hr_payroll_runs WHERE id=? AND employee_id=? AND status='paid' AND month<?").bind(source,employee,month).first<{result_json:string;revision:number}>();if(!original)throw new HrValidationError('sourceRunId','須連結同員工的前期已發薪快照');
  const result=JSON.parse(original.result_json),lines=result.lines as {kind:string;label:string;amount:number}[];
  const maximum=kind==='salary_recovery'?result.net:kind==='tax_refund'?lines.filter(l=>l.kind==='deduction'&&/所得稅|扣繳/.test(l.label)).reduce((n,l)=>n+l.amount,0):kind==='insurance_refund'?lines.filter(l=>l.kind==='deduction'&&/勞保|就保|健保|保費/.test(l.label)).reduce((n,l)=>n+l.amount,0):null;
  const sumQuery="SELECT COALESCE(SUM(amount),0) AS total FROM hr_payroll_corrections WHERE source_run_id=? AND kind=? AND is_active=1";
  if(maximum!=null){const sum=await this.db.prepare(sumQuery).bind(source,kind).first<{total:number}>();if((sum?.total??0)+amount>maximum)throw new HrValidationError('amount','累計更正超過原快照可追回／退還金額');}
  if(await this.db.prepare("SELECT id FROM hr_payroll_runs WHERE employee_id=? AND month=? AND status IN('confirmed','paid')").bind(employee,month).first())throw new HrValidationError('targetMonth','目標月份已確認／發薪，請先撤回未發薪確認或改列下一期',409);
  const statements=[this.db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hr_payroll_runs WHERE employee_id=? AND month=? AND status IN('confirmed','paid')) THEN 1 ELSE json('') END").bind(employee,month),this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_payroll_runs WHERE id=? AND employee_id=? AND status='paid' AND revision=?) THEN 1 ELSE json('') END").bind(source,employee,original.revision)];
  if(maximum!=null)statements.push(this.db.prepare(`SELECT CASE WHEN (${maximum}>=?+(${sumQuery.replace(' AS total','')})) THEN 1 ELSE json('') END`).bind(amount,source,kind));
  statements.push(this.db.prepare('INSERT INTO hr_payroll_corrections(employee_id,source_run_id,target_month,kind,amount,reference,consent_reference,reason,request_key,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(employee,source,month,kind,amount,reference,consent,reason,key,ctx.now,ctx.actor));
  statements.push(new AuditService(this.db).prepareRecord({entityType:'hr_payroll_correction',entityKey:employee+'|'+key,action:'hr_payroll_correction.created',actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{sourceRunId:source,targetMonth:month,kind,amount,reference,consentReference:consent,reason}}));await this.db.batch(statements);return this.list(employee,month);
 }
 async cancel(employee:number,month:string,raw:unknown,ctx:HrContext){const v=object(raw),id=integer(v.id,'id',true),revision=integer(v.revision,'revision',true),reason=required(v.reason,'reason',1000);
  const before=await this.db.prepare('SELECT * FROM hr_payroll_corrections WHERE id=? AND employee_id=? AND target_month=? AND revision=? AND is_active=1').bind(id,employee,month,revision).first();if(!before)throw new HrValidationError('revision','更正紀錄已異動',409);
  await this.db.batch([this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_payroll_corrections WHERE id=? AND revision=? AND is_active=1) AND NOT EXISTS(SELECT 1 FROM hr_payroll_correction_uses WHERE correction_id=? AND is_active=1) THEN 1 ELSE json('') END").bind(id,revision,id),this.db.prepare('UPDATE hr_payroll_corrections SET is_active=0,revision=revision+1,voided_at=?,voided_by=? WHERE id=? AND revision=?').bind(ctx.now,ctx.actor,id,revision),new AuditService(this.db).prepareRecord({entityType:'hr_payroll_correction',entityKey:String(id),action:'hr_payroll_correction.voided',actorEmployeeId:ctx.actor,requestId:ctx.requestId,before,after:{active:false,reason}})]);return this.list(employee,month);
 }
}
