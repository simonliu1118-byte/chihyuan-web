import {compBalances,nextMonthEnd,extendMonth,type CompCredit,type CompUse,type CompSettlement} from "../../shared/hr-overtime";
import {AuditService} from "../audit/audit-service";
import {date,HrValidationError,integer,object} from "./hr-validation";
import type {HrContext} from "./hr-service";

export interface CompInputs {credits:CompCredit[];uses:CompUse[];settlements:CompSettlement[]}
const GRANT_ID_OFFSET=100000000;

/** Loads every comp-time source for the given employees in four bounded queries (no per-employee SQL). */
export async function loadCompInputs(db:D1Database,employeeIds:readonly number[]):Promise<Map<number,CompInputs>>{
 const result=new Map<number,CompInputs>(employeeIds.map(id=>[id,{credits:[],uses:[],settlements:[]}]));
 if(!employeeIds.length)return result;
 const list=employeeIds.map(()=>"?").join(","),limit=500*employeeIds.length+1;
 const [ot,grants,settles,used]=await Promise.all([
  db.prepare("SELECT id,employee_id,minutes,work_date,comp_expires_on FROM hr_overtime_days WHERE settlement='comp' AND minutes>0 AND employee_id IN ("+list+") LIMIT ?").bind(...employeeIds,limit).all<{id:number;employee_id:number;minutes:number;work_date:string;comp_expires_on:string|null}>(),
  db.prepare("SELECT id,employee_id,kind,minutes,holiday_date,holiday_name,created_at,expires_on FROM hr_comp_time_grants WHERE employee_id IN ("+list+") LIMIT ?").bind(...employeeIds,limit).all<{id:number;employee_id:number;kind:"holiday"|"grant";minutes:number;holiday_date:string|null;holiday_name:string|null;created_at:string;expires_on:string}>(),
  db.prepare("SELECT employee_id,overtime_day_id,minutes FROM hr_comp_time_settlements WHERE employee_id IN ("+list+") LIMIT ?").bind(...employeeIds,limit).all<{employee_id:number;overtime_day_id:number;minutes:number}>(),
  db.prepare("SELECT r.employee_id,r.work_date,r.minutes,r.advance_holiday_date,r.advance_holiday_name FROM hr_leave_records r JOIN hr_leave_types t ON t.id=r.leave_type_id WHERE t.comp_kind IS NOT NULL AND r.cancelled_at IS NULL AND r.employee_id IN ("+list+") LIMIT ?").bind(...employeeIds,limit*3).all<{employee_id:number;work_date:string;minutes:number;advance_holiday_date:string|null;advance_holiday_name:string|null}>()
 ]);
 if([ot,grants,settles].some(x=>(x.results??[]).length>=limit)||(used.results??[]).length>=limit*3)
  throw new HrValidationError("limit","補休歷史資料超過單次安全上限，不能以不完整資料計算");
 for(const x of ot.results??[])result.get(x.employee_id)?.credits.push({id:x.id,kind:"overtime",minutes:x.minutes,issuedOn:x.work_date,expiresOn:x.comp_expires_on??nextMonthEnd(x.work_date)});
 // A holiday's comp time exists from the holiday itself; a manual grant from the day it was given.
 for(const x of grants.results??[])result.get(x.employee_id)?.credits.push({id:x.id+GRANT_ID_OFFSET,kind:x.kind,minutes:x.minutes,
  issuedOn:x.kind==="holiday"&&x.holiday_date?x.holiday_date:x.created_at.slice(0,10),expiresOn:x.expires_on,holidayDate:x.holiday_date,holidayName:x.holiday_name});
 for(const x of settles.results??[])result.get(x.employee_id)?.settlements.push({creditId:x.overtime_day_id,minutes:x.minutes});
 for(const x of used.results??[])result.get(x.employee_id)?.uses.push({workDate:x.work_date,minutes:x.minutes,advanceHolidayDate:x.advance_holiday_date,advanceHolidayName:x.advance_holiday_name});
 return result;
}

export class HrCompService{
 constructor(private db:D1Database){}
 async get(id:number,asOf:string){
  const inputs=(await loadCompInputs(this.db,[id])).get(id)!;
  return {balances:compBalances(inputs.credits,inputs.uses,inputs.settlements,asOf),...inputs};
 }
 /** Comp time from a national holiday (it repays any advance on that holiday first) or a manual grant. */
 async grant(id:number,input:unknown,ctx:HrContext){
  const v=object(input),kind=v.kind;
  if(kind!=="holiday"&&kind!=="grant")throw new HrValidationError("kind","補休來源錯誤");
  const minutes=integer(v.minutes,"minutes",true);
  if(minutes%30||minutes>48000)throw new HrValidationError("minutes","補休時數須為 30 分鐘倍數");
  let holidayDate:string|null=null,holidayName:string|null=null;
  if(kind==="holiday"){
   holidayDate=date(v.holidayDate,"holidayDate");
   const holiday=await this.db.prepare("SELECT name FROM hr_holidays WHERE date=?").bind(holidayDate).first<{name:string}>();
   if(!holiday)throw new HrValidationError("holidayDate","這天不在國定假日設定中");
   holidayName=holiday.name;
  }
  const expiresOn=nextMonthEnd(holidayDate??ctx.now.slice(0,10));
  await this.db.batch([
   this.db.prepare("INSERT INTO hr_comp_time_grants(employee_id,kind,minutes,holiday_date,holiday_name,expires_on,note,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,kind,minutes,holidayDate,holidayName,expiresOn,String(v.note??"").slice(0,1000),ctx.now,ctx.actor),
   new AuditService(this.db).prepareRecord({entityType:"hr_comp_time",entityKey:String(id),action:"hr_comp_time.granted",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{kind,minutes,holidayDate,holidayName,expiresOn}})
  ]);
  return {saved:true};
 }
 async extend(kind:"overtime"|"grant",id:number,ctx:HrContext){
  const table=kind==="overtime"?"hr_overtime_days":"hr_comp_time_grants",field=kind==="overtime"?"comp_expires_on":"expires_on",counter=kind==="overtime"?"comp_extended_count":"extended_count";
  const row=await this.db.prepare("SELECT id,employee_id,"+field+" AS expiry FROM "+table+" WHERE id=?").bind(id).first<{id:number;employee_id:number;expiry:string|null}>();
  if(!row?.expiry)throw new HrValidationError("id","補休項目不存在",404);
  const to=extendMonth(row.expiry);
  await this.db.batch([
   this.db.prepare("UPDATE "+table+" SET "+field+"=?,"+counter+"="+counter+"+1 WHERE id=?").bind(to,id),
   new AuditService(this.db).prepareRecord({entityType:"hr_comp_time",entityKey:String(id),action:"hr_comp_time.extended",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{kind,from:row.expiry,to}})
  ]);
  return {expiresOn:to};
 }
 async settle(id:number,ctx:HrContext){
  const row=await this.db.prepare("SELECT id,employee_id,comp_expires_on,settlement FROM hr_overtime_days WHERE id=?").bind(id).first<{id:number;employee_id:number;comp_expires_on:string;settlement:string}>();
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
