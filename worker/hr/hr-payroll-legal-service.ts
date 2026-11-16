import {AuditService} from '../audit/audit-service';
import {date,integer,object,required,HrValidationError} from './hr-validation';
import type {HrContext} from './hr-service';
export class HrPayrollLegalService {
 constructor(private db:D1Database){}
 async list(employee:number){const rows=(await this.db.prepare('SELECT * FROM hr_payroll_legal_cases WHERE employee_id=? ORDER BY id DESC LIMIT 501').bind(employee).all()).results??[];if(rows.length>500)throw new HrValidationError('limit','案件歷史超過查詢上限');return rows;}
 async save(employee:number,raw:unknown,ctx:HrContext){
  if(!await this.db.prepare('SELECT id FROM hr_employees WHERE id=?').bind(employee).first())throw new HrValidationError('employeeId','員工不存在',404);
  const v=object(raw),kind=required(v.kind,'kind'),event=date(v.eventDate,'eventDate'),from=date(v.from,'from'),to=date(v.to,'to'),reference=required(v.reference,'reference',1000),reason=required(v.reason,'reason',1000),expected=integer(v.expectedId,'expectedId'),basis=integer(v.monthlyBasis,'monthlyBasis'),average=Number(v.averageDaily);
  if(!['maternity','occupational'].includes(kind)||to<from||(Date.parse(to)-Date.parse(from))/86400000>730||!Number.isFinite(average)||average<0||average>10000000||Math.abs(average*100-Math.round(average*100))>1e-7||typeof v.active!=='boolean')throw new HrValidationError('case','案件種類／期間／日工資格式錯誤');
  const span=(Date.parse(to)-Date.parse(from))/86400000+1;if(kind==='maternity'&&![56,28,7,5].includes(span))throw new HrValidationError('to','產假須為連續56、28、7或5個曆日');
  const before=await this.db.prepare('SELECT id,offsets_json FROM hr_payroll_legal_cases WHERE employee_id=? AND kind=? AND event_date=? ORDER BY id DESC LIMIT 1').bind(employee,kind,event).first<{id:number;offsets_json:string}>();
  const offsets=before?JSON.parse(before.offsets_json) as Record<string,number>:{};
  const month=required(v.month,'month',7);if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||month<from.slice(0,7)||month>to.slice(0,7))throw new HrValidationError('month','抵充月份須在案件期間內');
  const offset=integer(v.offset,'offset');if(kind==='maternity'&&offset)throw new HrValidationError('offset','產假不可套公傷保險給付抵充');offsets[month]=offset;
  if(basis>10000000||offset>10000000)throw new HrValidationError('amount','金額超過安全範圍');
  await this.db.batch([
   this.db.prepare("SELECT CASE WHEN COALESCE((SELECT MAX(id) FROM hr_payroll_legal_cases WHERE employee_id=? AND kind=? AND event_date=?),0)=? THEN 1 ELSE json('') END").bind(employee,kind,event,expected),
   this.db.prepare('INSERT INTO hr_payroll_legal_cases(employee_id,kind,event_date,from_date,to_date,monthly_basis,average_daily,offsets_json,reference,reason,is_active,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(employee,kind,event,from,to,basis,average,JSON.stringify(offsets),reference,reason,v.active?1:0,ctx.now,ctx.actor),
   new AuditService(this.db).prepareRecord({entityType:'hr_payroll_legal',entityKey:employee+'|'+kind+'|'+event,action:'hr_payroll_legal.recorded',actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:{version:before?.id??0},after:{kind,event,from,to,monthlyBasis:basis,averageDaily:average,offsets,reference,reason,active:v.active}}),
  ]);return this.list(employee);
 }
}
