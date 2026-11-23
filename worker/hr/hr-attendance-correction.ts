import {AuditService} from '../audit/audit-service';
import {evaluateAttendance,normalizePunchTime} from '../../shared/hr-attendance';
import {HrValidationError,date,integer,object,required} from './hr-validation';
import {payrollMonth} from './hr-payroll-service';
import type {HrContext} from './hr-service';
type Role='SUPER_ADMIN'|'ADMIN'|'USER';
const scope="EXISTS(SELECT 1 FROM hr_attendance_correction_grants g JOIN hr_employee_current e ON e.store_id=g.store_id WHERE e.id=? AND g.member_id=? AND g.is_active=1)";
export class HrAttendanceCorrectionService {
 constructor(private db:D1Database,private actor:number,private role:Role){}
 async capabilities(){if(this.role==='SUPER_ADMIN')return {payroll:true,stores:(await this.db.prepare('SELECT id,name FROM hr_stores ORDER BY sort_order,id LIMIT 101').all()).results??[]};
  if(this.role!=='ADMIN')return {payroll:false,stores:[]};return {payroll:false,stores:(await this.db.prepare('SELECT s.id,s.name FROM hr_stores s JOIN hr_attendance_correction_grants g ON g.store_id=s.id WHERE g.member_id=? AND g.is_active=1 ORDER BY s.sort_order,s.id LIMIT 101').bind(this.actor).all()).results??[]};}
 private async allowedStore(store:number){if(this.role==='SUPER_ADMIN')return;if(this.role!=='ADMIN'||!(await this.db.prepare('SELECT id FROM hr_attendance_correction_grants WHERE member_id=? AND store_id=? AND is_active=1').bind(this.actor,store).first()))throw new HrValidationError('permission','沒有此門市的出勤更正授權',403);}
 async list(store:number,month:string){await this.allowedStore(store);payrollMonth(month);const rows=(await this.db.prepare("SELECT e.id AS employeeId,e.employee_no,e.name,a.work_date,a.out1,a.out2,a.revision FROM hr_attendance_days a JOIN hr_employee_current e ON e.id=a.employee_id WHERE e.store_id=? AND a.work_date LIKE ? AND (?=1 OR EXISTS(SELECT 1 FROM hr_attendance_correction_grants g WHERE g.store_id=e.store_id AND g.member_id=? AND g.is_active=1)) ORDER BY a.work_date,e.employee_no LIMIT 3101").bind(store,month+'-%',this.role==='SUPER_ADMIN'?1:0,this.actor).all()).results??[];if(rows.length>3100)throw new HrValidationError('limit','本次出勤超過安全上限');return rows;}
 async correct(raw:unknown,ctx:HrContext){
  const v=object(raw),employee=integer(v.employeeId,'employeeId',true),at=date(v.date,'date'),revision=integer(v.revision,'revision',true),reason=required(v.reason,'reason',1000);
  const before=await this.db.prepare('SELECT a.*,e.store_id FROM hr_attendance_days a JOIN hr_employee_current e ON e.id=a.employee_id WHERE a.employee_id=? AND a.work_date=?').bind(employee,at).first<{in1:string|null;in2:string|null;out1:string|null;out2:string|null;revision:number;store_id:number}>();
  if(!before)throw new HrValidationError('date','沒有可更正的既有出勤紀錄',404);
  await this.allowedStore(before.store_id);
  if(before.revision!==revision)throw new HrValidationError('revision','打卡資料已更動，請重讀',409);
  const out1=v.out1===null||v.out1===''?null:normalizePunchTime(required(v.out1,'out1',5)),out2=v.out2===null||v.out2===''?null:normalizePunchTime(required(v.out2,'out2',5));
  evaluateAttendance(null,null,{in1:before.in1,in2:before.in2,out1,out2});
  if(out1===before.out1&&out2===before.out2)return {saved:true,changed:false};
  const statements:D1PreparedStatement[]=[];
  if(this.role!=='SUPER_ADMIN')statements.push(this.db.prepare(`SELECT CASE WHEN ${scope} THEN 1 ELSE json('') END`).bind(employee,this.actor));
  statements.push(this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_attendance_days WHERE employee_id=? AND work_date=? AND revision=?) THEN 1 ELSE json('') END").bind(employee,at,revision));
  statements.push(this.db.prepare('UPDATE hr_attendance_days SET out1=?,out2=?,revision=revision+1,updated_at=?,updated_by=? WHERE employee_id=? AND work_date=? AND revision=?').bind(out1,out2,ctx.now,ctx.actor,employee,at,revision));
  statements.push(new AuditService(this.db).prepareRecord({entityType:'hr_attendance',entityKey:employee+'|'+at,action:'hr_attendance.corrected',actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:{out1:before.out1,out2:before.out2,revision},after:{out1,out2,revision:revision+1,reason}}));
  await this.db.batch(statements);return {saved:true,changed:true};
 }
 async grants(){return (await this.db.prepare('SELECT g.*,m.employee_no,m.display_name,s.name AS store_name FROM hr_attendance_correction_grants g JOIN app_members m ON m.id=g.member_id JOIN hr_stores s ON s.id=g.store_id ORDER BY g.id LIMIT 201').all()).results??[];}
 async grant(raw:unknown,ctx:HrContext){
  if(this.role!=='SUPER_ADMIN')throw new HrValidationError('permission','僅超級管理員可指定授權',403);
  const v=object(raw),member=integer(v.memberId,'memberId',true),store=integer(v.storeId,'storeId',true),revision=integer(v.revision,'revision'),reason=required(v.reason,'reason',1000);
  if(typeof v.enabled!=='boolean')throw new HrValidationError('enabled','請明確選擇啟停狀態');
  if(v.enabled&&!(await this.db.prepare('SELECT id FROM app_members WHERE id=? AND is_active=1').bind(member).first()))throw new HrValidationError('memberId','請選擇有效帳號');
  const before=await this.db.prepare('SELECT is_active,revision FROM hr_attendance_correction_grants WHERE member_id=? AND store_id=?').bind(member,store).first();
  await this.db.batch([
   this.db.prepare("SELECT CASE WHEN COALESCE((SELECT revision FROM hr_attendance_correction_grants WHERE member_id=? AND store_id=?),0)=? THEN 1 ELSE json('') END").bind(member,store,revision),
   this.db.prepare('INSERT INTO hr_attendance_correction_grants(member_id,store_id,is_active,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(member_id,store_id) DO UPDATE SET is_active=excluded.is_active,revision=hr_attendance_correction_grants.revision+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(member,store,v.enabled?1:0,ctx.now,ctx.actor),
   new AuditService(this.db).prepareRecord({entityType:'hr_attendance_grant',entityKey:member+'|'+store,action:'hr_attendance_grant.updated',actorEmployeeId:ctx.actor,requestId:ctx.requestId,before,after:{enabled:v.enabled,reason}}),
  ]);return this.grants();
 }
}
