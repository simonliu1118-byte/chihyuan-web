import {HrPayrollCorrections} from '../hr/hr-payroll-corrections';
import {HrBonusService} from '../hr/hr-bonus-service';
import {employerSupplement} from '../hr/hr-payroll-employer';
import {HrPayrollLegalService} from '../hr/hr-payroll-legal-service';
import {HrPayrollService,payrollMonth} from '../hr/hr-payroll-service';
import {payrollRuleStatus,syncPayrollRules} from '../hr/hr-payroll-import';
import {HrAttendanceCorrectionService} from '../hr/hr-attendance-correction';
import {HrValidationError,object,integer,required} from '../hr/hr-validation';
import {AuditService} from '../audit/audit-service';
import type {HrContext} from '../hr/hr-service';
import {failure,success} from './response';
export async function handleHrPayrollRoute(request:Request,db:D1Database,ctx:HrContext):Promise<Response|null>{
 const u=new URL(request.url),path=u.pathname.replace('/api/business/hr',''),id=ctx.requestId;
 if(!path.startsWith('/payroll')&&!path.startsWith('/settings/payroll')&&path!=='/settings/attendance-correction-grants')return null;
 const body=async()=>object(await request.json());
 try{
  const bonuses=new HrBonusService(db),bonus=/^\/payroll\/bonuses\/(\d+)$/.exec(path);
  if(path==='/payroll/bonuses'){
   if(request.method==='GET')return success(await bonuses.list(Number(u.searchParams.get('year')),u.searchParams.has('employeeId')?integer(Number(u.searchParams.get('employeeId')),'employeeId',true):null,u.searchParams.has('before')?integer(Number(u.searchParams.get('before')),'before',true):null),id);
   if(request.method==='POST')return success(await bonuses.save(await body(),ctx),id);
  }
  if(bonus){if(request.method==='GET')return success(await bonuses.get(+bonus[1]),id);if(request.method==='PUT')return success(await bonuses.save(await body(),ctx,+bonus[1]),id);if(request.method==='POST')return success(await bonuses.transition(+bonus[1],await body(),ctx),id);}
  const service=new HrPayrollService(db),profile=/^\/payroll\/profiles\/(\d+)$/.exec(path),run=/^\/payroll\/runs\/(\d+)$/.exec(path),review=/^\/payroll\/reviews\/(\d+)$/.exec(path);
  const legal=/^\/payroll\/legal-cases\/(\d+)$/.exec(path);if(legal){const l=new HrPayrollLegalService(db);if(request.method==='GET')return success(await l.list(+legal[1]),id);if(request.method==='POST')return success(await l.save(+legal[1],await body(),ctx),id);}
  if(path==='/payroll/employer-supplement'&&request.method==='GET')return success(await employerSupplement(db,payrollMonth(u.searchParams.get('month')),u.searchParams.get('unit')??''),id);
  const correction=/^\/payroll\/corrections\/(\d+)$/.exec(path);if(correction){const c=new HrPayrollCorrections(db),month=payrollMonth(u.searchParams.get('month'));if(request.method==='GET')return success(await c.list(+correction[1],month),id);if(request.method==='POST')return success(await c.create(+correction[1],month,await body(),ctx),id);if(request.method==='PATCH')return success(await c.cancel(+correction[1],month,await body(),ctx),id);}
  if(path==='/payroll/options'&&request.method==='GET'){
   const [members,stores]=await Promise.all([db.prepare('SELECT id,employee_no,display_name FROM app_members WHERE is_active=1 ORDER BY employee_no,id LIMIT 501').all(),db.prepare('SELECT id,name FROM hr_stores ORDER BY sort_order,id LIMIT 101').all()]);
   if((members.results??[]).length>500||(stores.results??[]).length>100)throw new HrValidationError('limit','選項超過單次安全上限');
   return success({members:members.results??[],stores:stores.results??[]},id);
  }
  if(profile){if(request.method==='GET')return success(await service.profiles(+profile[1]),id);if(request.method==='POST')return success(await service.saveProfile(+profile[1],await body(),ctx),id);}
  if(path==='/payroll/month'&&request.method==='GET')return success(await service.monthOverview(payrollMonth(u.searchParams.get('month'))),id);
  if(path==='/payroll/runs'&&request.method==='GET')return success(await service.list(payrollMonth(u.searchParams.get('month')),u.searchParams.has('employeeId')?integer(Number(u.searchParams.get('employeeId')),'employeeId',true):null),id);
  if(path==='/payroll/calculate'&&request.method==='POST')return success(await service.calculate(await body(),ctx),id);
  if(run){if(request.method==='GET')return success(await service.get(+run[1]),id);if(request.method==='POST')return success(await service.transition(+run[1],await body(),ctx),id);}
  if(review&&request.method==='GET')return success(await service.reviews(+review[1],payrollMonth(u.searchParams.get('month'))),id);
  if(review&&request.method==='POST')return success(await service.review(+review[1],await body(),ctx),id);
  if(path==='/settings/payroll-rules'){
   if(request.method==='GET')return success(await payrollRuleStatus(db),id);
   if(request.method==='POST')return success(await syncPayrollRules(db,ctx.now),id);
  }
  if(path==='/settings/attendance-correction-grants'){const service=new HrAttendanceCorrectionService(db,ctx.actor,'SUPER_ADMIN');if(request.method==='GET')return success(await service.grants(),id);if(request.method==='POST')return success(await service.grant(await body(),ctx),id);}
  if(path==='/payroll/leave-protection'&&request.method==='POST'){
   const v=await body(),record=integer(v.recordId,'recordId',true),protection=v.protection,reason=required(v.reason,'reason',1000);
   const before=await db.prepare('SELECT l.payroll_protection,t.code FROM hr_leave_records l JOIN hr_leave_types t ON t.id=l.leave_type_id WHERE l.id=? AND l.cancelled_at IS NULL').bind(record).first<{payroll_protection:string|null;code:string}>();
   if(!before)throw new HrValidationError('recordId','有效假單不存在',404);
   if(v.expectedProtection!==before.payroll_protection)throw new HrValidationError('revision','假單保護設定已更動，請重讀',409);
   if(!(protection===null||protection==='family_care'&&before.code==='事'||['pregnancy_loss','pregnancy_rest'].includes(String(protection))&&['病','院'].includes(before.code)))throw new HrValidationError('protection','保護類別與假別不符');
   await db.batch([
    db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_leave_records WHERE id=? AND payroll_protection IS ? AND cancelled_at IS NULL) THEN 1 ELSE json('') END").bind(record,before.payroll_protection),
    db.prepare('UPDATE hr_leave_records SET payroll_protection=? WHERE id=? AND payroll_protection IS ? AND cancelled_at IS NULL').bind(protection,record,before.payroll_protection),new AuditService(db).prepareRecord({entityType:'hr_leave',entityKey:String(record),action:'hr_leave.payroll_protection',actorEmployeeId:ctx.actor,requestId:id,before:{protection:before.payroll_protection},after:{protection,reason}})]);return success({saved:true},id);
  }
  return failure({code:'METHOD_NOT_ALLOWED',message:'不支援此薪資操作'},id,405);
 }catch(e){if(e instanceof HrValidationError)return failure({code:'HR_VALIDATION_ERROR',message:e.message},id,e.status);
  if(e instanceof Error&&/UNIQUE|malformed JSON/.test(e.message))return failure({code:'HR_CONFLICT',message:'資料或版本已更動，請重讀後再操作'},id,409);
  return failure({code:'HR_PAYROLL_UNAVAILABLE',message:'薪資處理失敗，請稍後重試'},id,500);}
}
export async function handleHrCorrectionRoute(request:Request,db:D1Database,ctx:HrContext,role:'SUPER_ADMIN'|'ADMIN'|'USER'){
 const u=new URL(request.url),service=new HrAttendanceCorrectionService(db,ctx.actor,role);
 try{
  if(u.pathname.endsWith('/capabilities')&&request.method==='GET')return success(await service.capabilities(),ctx.requestId);
  if(request.method==='GET')return success(await service.list(integer(Number(u.searchParams.get('storeId')),'storeId',true),payrollMonth(u.searchParams.get('month'))),ctx.requestId);
  if(request.method==='POST')return success(await service.correct(await request.json(),ctx),ctx.requestId);
  return failure({code:'METHOD_NOT_ALLOWED',message:'不支援此操作'},ctx.requestId,405);
 }catch(e){if(e instanceof HrValidationError)return failure({code:'HR_VALIDATION_ERROR',message:e.message},ctx.requestId,e.status);
  if(e instanceof Error&&/malformed JSON/.test(e.message))return failure({code:'HR_CONFLICT',message:'資料或授權已更動，請重讀'},ctx.requestId,409);
  return failure({code:'HR_CORRECTION_FAILED',message:'出勤更正失敗，請核對時間及重讀'},ctx.requestId,422);}
}
