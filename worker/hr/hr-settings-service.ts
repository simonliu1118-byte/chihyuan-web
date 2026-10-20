import { AuditService } from "../audit/audit-service";
import { HrValidationError,date,integer,object,optional,required } from "./hr-validation";
import type { HrContext } from "./hr-service";
export type HrSettingName="stores"|"job-titles"|"shift-types";
const tables:Record<HrSettingName,string>={"stores":"hr_stores","job-titles":"hr_job_titles","shift-types":"hr_shift_types"};
function clock(value:unknown,key:string):string {
 const s=required(value,key,5);
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw new HrValidationError(key,"時間格式須為 HH:mm");
 return s;
}
const mins=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
export function shiftPayload(raw:unknown) {
 const v=object(raw),start=clock(v.startTime,"startTime"),end=clock(v.endTime,"endTime");
 const a=mins(start),b=mins(end);
 const breakStart=v.breakStart?clock(v.breakStart,"breakStart"):null,breakEnd=v.breakEnd?clock(v.breakEnd,"breakEnd"):null;
 if(b<=a||(breakStart===null)!==(breakEnd===null))throw new HrValidationError("startTime","班別時段錯誤");
 let rest=0;
 if(breakStart&&breakEnd){const c=mins(breakStart),d=mins(breakEnd);
  if(c<a||d>b||c>=d)throw new HrValidationError("breakStart","休息必須位於班別內");rest=d-c;
 }
 const normalMinutes=b-a-rest;
 if(normalMinutes<0||normalMinutes>600)throw new HrValidationError("normalMinutes","正常工時超過 10 小時");
 if(v.normalMinutes!==undefined&&Number(v.normalMinutes)!==normalMinutes)
   throw new HrValidationError("normalMinutes","正常工時應等於班別長度減休息");
 return {start,end,breakStart,breakEnd,normalMinutes};
}
export function mondayAnchor(input:unknown):string {
 const d=date(input,"cycleAnchorDate");
 if(new Date(d+"T00:00:00Z").getUTCDay()!==1)throw new HrValidationError("cycleAnchorDate","起算日須為星期一");
 return d;
}
function config(type:HrSettingName,raw:unknown) {
 const v=object(raw),name=required(v.name,"name",100);
 const sort=integer(v.sortOrder??0,"sortOrder"),active=v.isActive===false?0:1;
 if(type==="stores")return {fields:["name","sort_order","is_active","cycle_anchor_date","rules_template"],
  args:[name,sort,active,mondayAnchor(v.cycleAnchorDate),optional(v.rulesTemplate,"rulesTemplate",3000)??""]};
 if(type==="job-titles")return {fields:["name","sort_order","is_active"],args:[name,sort,active]};
 const t=shiftPayload(v),code=required(v.code,"code",2);
 return {fields:["code","name","start_time","end_time","break_start","break_end","normal_minutes","sort_order","is_active"],
  args:[code,name,t.start,t.end,t.breakStart,t.breakEnd,t.normalMinutes,sort,active]};
}
export class HrSettingsService {
 constructor(private db:D1Database){}
 private audit(ctx:HrContext,key:string,before:Record<string,unknown>|null,after:Record<string,unknown>|null) {
  return new AuditService(this.db).prepareRecord({entityType:"hr_setting",entityKey:key,action:"hr_setting.updated",actorEmployeeId:ctx.actor,requestId:ctx.requestId,before,after});
 }
 async list(type:HrSettingName) {return (await this.db.prepare("SELECT * FROM "+tables[type]+" ORDER BY sort_order,id LIMIT 100").all()).results??[];}
 async write(type:HrSettingName,body:unknown,ctx:HrContext,id?:number) {
  const table=tables[type];if(!table)throw new HrValidationError("type","設定項目不正確");
  const v=config(type,body),previous=id?await this.db.prepare("SELECT * FROM "+table+" WHERE id=?").bind(id).first<Record<string,unknown>>():null;
  if(id&&!previous)throw new HrValidationError("id","設定項目不存在",404);
  const args=[...v.args,ctx.now];
  const sql=id?"UPDATE "+table+" SET "+v.fields.map(x=>x+"=?").join(",")+",updated_at=? WHERE id=?":
   "INSERT INTO "+table+" ("+v.fields.join(",")+",updated_at"+(type==="stores"?",created_at":"")+") VALUES ("+
    v.fields.map(()=>"?").join(",")+",?"+(type==="stores"?",?":"")+")";
  if(id)args.push(id);else if(type==="stores")args.push(ctx.now);
  await this.db.batch([this.db.prepare(sql).bind(...args),
   this.audit(ctx,type+(id?":"+id:""),previous,Object.fromEntries(v.fields.map((key,i)=>[key,v.args[i]])))]);
  return {saved:true};
 }
 async holidays(year:number) {
  if(!Number.isInteger(year)||year<2000||year>2200)throw new HrValidationError("year","年度超出範圍");
  return (await this.db.prepare("SELECT date,name FROM hr_holidays WHERE date>=? AND date<? ORDER BY date LIMIT 400")
    .bind(year+"-01-01",(year+1)+"-01-01").all()).results??[];
 }
 async saveHoliday(raw:unknown,ctx:HrContext) {
  const v=object(raw),day=date(v.date,"date"),name=required(v.name,"name",100);
  const before=await this.db.prepare("SELECT * FROM hr_holidays WHERE date=?").bind(day).first<Record<string,unknown>>();
  await this.db.batch([this.db.prepare("INSERT INTO hr_holidays(date,name) VALUES(?,?) ON CONFLICT(date) DO UPDATE SET name=excluded.name").bind(day,name),
   this.audit(ctx,"holidays:"+day,before,{date:day,name})]);
  return {saved:true};
 }
 async deleteHoliday(input:string,ctx:HrContext) {
  const day=date(input,"date"),before=await this.db.prepare("SELECT * FROM hr_holidays WHERE date=?").bind(day).first<Record<string,unknown>>();
  if(!before)throw new HrValidationError("date","假日不存在",404);
  await this.db.batch([this.db.prepare("DELETE FROM hr_holidays WHERE date=?").bind(day),this.audit(ctx,"holidays:"+day,before,null)]);
  return {deleted:true};
 }
}
