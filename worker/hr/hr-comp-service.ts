import {compBalances,nextMonthEnd,extendMonth,compBalances as balance,type CompCredit,type CompUse,type CompSettlement} from "../../shared/hr-overtime";
import {AuditService} from "../audit/audit-service";
import {date,HrValidationError,integer,object,required} from "./hr-validation";
import type {HrContext} from "./hr-service";
export class HrCompService{
 constructor(private db:D1Database){}
 async get(id:number,asOf:string){
  const [ot,grants,settles,used]=await Promise.all([
   this.db.prepare("SELECT * FROM hr_overtime_days WHERE employee_id=? ORDER BY work_date LIMIT 501").bind(id).all<Record<string,unknown>>(),
   this.db.prepare("SELECT * FROM hr_comp_time_grants WHERE employee_id=? ORDER BY expires_on LIMIT 501").bind(id).all<Record<string,unknown>>(),
   this.db.prepare("SELECT * FROM hr_comp_time_settlements WHERE employee_id=? LIMIT 501").bind(id).all<Record<string,unknown>>(),
   this.db.prepare("SELECT r.work_date,r.minutes,t.comp_kind FROM hr_leave_records r JOIN hr_leave_types t ON t.id=r.leave_type_id WHERE r.employee_id=? AND r.cancelled_at IS NULL AND t.comp_kind IS NOT NULL LIMIT 2001").bind(id).all<Record<string,unknown>>()
  ]);
  if([ot,grants,settles].some(x=>(x.results??[]).length>500)||(used.results??[]).length>2000)
   throw new HrValidationError("limit","補休帳戶超過單次安全上限，不能以不完整資料計算");
  const credits:CompCredit[]=[
   ...(ot.results??[]).filter(x=>x.settlement==="comp").map(x=>({id:Number(x.id),kind:"overtime" as const,minutes:Number(x.minutes),issuedOn:String(x.work_date),expiresOn:String(x.comp_expires_on)})),
   ...(grants.results??[]).map(x=>({id:Number(x.id)+100000000,kind:x.kind as "holiday"|"grant",minutes:Number(x.minutes),issuedOn:String(x.created_at).slice(0,10),expiresOn:String(x.expires_on)}))
  ];
  const uses:CompUse[]=(used.results??[]).map(x=>({workDate:String(x.work_date),minutes:Number(x.minutes),kind:x.comp_kind==="holiday"?"holiday":"overtime"}));
  const settlements:CompSettlement[]=(settles.results??[]).map(x=>({creditId:Number(x.overtime_day_id),minutes:Number(x.minutes)}));
  return {balances:balance(credits,uses,settlements,asOf),overtime:ot.results??[],grants:grants.results??[],settlements:settles.results??[]};
 }
 async grant(id:number,input:unknown,ctx:HrContext){
  const v=object(input),kind=v.kind;
  if(kind!=="holiday"&&kind!=="grant")throw new HrValidationError("kind","補休種類錯誤");
  const minutes=integer(v.minutes,"minutes",true);
  if(minutes%30||minutes>48000)throw new HrValidationError("minutes","補休時數須為 30 分鐘倍數");
  const holidayDate=kind==="holiday"?date(v.holidayDate,"holidayDate"):null;
  const holidayName=kind==="holiday"?required(v.holidayName,"holidayName",100):null;
  const expiresOn=nextMonthEnd(ctx.now.slice(0,10));
  await this.db.batch([
   this.db.prepare("INSERT INTO hr_comp_time_grants(employee_id,kind,minutes,holiday_date,holiday_name,expires_on,note,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,kind,minutes,holidayDate,holidayName,expiresOn,String(v.note??"").slice(0,1000),ctx.now,ctx.actor),
   new AuditService(this.db).prepareRecord({entityType:"hr_comp_time",entityKey:String(id),action:"hr_comp_time.granted",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{kind,minutes,holidayDate,expiresOn}})
  ]);
  return {saved:true};
 }
 async extend(kind:"overtime"|"grant",id:number,ctx:HrContext){
  const table=kind==="overtime"?"hr_overtime_days":"hr_comp_time_grants",field=kind==="overtime"?"comp_expires_on":"expires_on",counter=kind==="overtime"?"comp_extended_count":"extended_count";
  const row=await this.db.prepare("SELECT id,employee_id,"+field+" AS expiry,"+counter+" AS extended_count FROM "+table+" WHERE id=?").bind(id).first<{id:number;employee_id:number;expiry:string;extended_count:number}>();
  if(!row)throw new HrValidationError("id","補休項目不存在",404);
  const to=extendMonth(row.expiry);
  await this.db.batch([
   this.db.prepare("UPDATE "+table+" SET "+field+"=?,"+counter+"="+counter+"+1 WHERE id=?").bind(to,id),
   new AuditService(this.db).prepareRecord({entityType:"hr_comp_time",entityKey:String(id),action:"hr_comp_time.extended",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{kind,from:row.expiry,to}})
  ]);
  return {expiresOn:to};
 }
 async settle(id:number,ctx:HrContext){
  const row=await this.db.prepare("SELECT id,employee_id,work_date,minutes,comp_expires_on,settlement FROM hr_overtime_days WHERE id=?").bind(id).first<{id:number;employee_id:number;work_date:string;minutes:number;comp_expires_on:string;settlement:string}>();
  if(!row||row.settlement!=="comp")throw new HrValidationError("id","非加班補休",404);
  if(row.comp_expires_on>=ctx.now.slice(0,10))throw new HrValidationError("id","未到期");
  const account=await this.get(row.employee_id,ctx.now.slice(0,10));
  const credit=account.balances.credits.find(x=>x.kind==="overtime"&&x.id===id);
  if(!credit||credit.remainingMinutes<=0)throw new HrValidationError("id","額度已使用或已結清");
  await this.db.batch([
   this.db.prepare("INSERT INTO hr_comp_time_settlements(employee_id,overtime_day_id,minutes,created_at,created_by) VALUES(?,?,?,?,?)").bind(row.employee_id,id,credit.remainingMinutes,ctx.now,ctx.actor),
   new AuditService(this.db).prepareRecord({entityType:"hr_comp_time",entityKey:String(id),action:"hr_comp_time.settled",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{minutes:credit.remainingMinutes}})
  ]);
  return {settledMinutes:credit.remainingMinutes};
 }
}
