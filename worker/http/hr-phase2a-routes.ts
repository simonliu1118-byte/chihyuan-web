import {HrSettingsService,type HrSettingName} from "../hr/hr-settings-service";
import {HrRosterService,HrRosterError} from "../hr/hr-roster-service";
import {HrAttendanceService} from "../hr/hr-attendance-service";
import {HrValidationError,integer,object} from "../hr/hr-validation";
import type {HrContext} from "../hr/hr-service";
import {success,failure,json} from "./response";

/** Invoked only after CYID SUPER_ADMIN validation in handleHrRoute. */
export async function handleHrPhase2aRoute(request:Request,db:D1Database,ctx:HrContext):Promise<Response|null>{
 const url=new URL(request.url),pathname=url.pathname,id=ctx.requestId;
 const setting=/^\/api\/business\/hr\/settings\/(stores|job-titles|shift-types)$/.exec(pathname);
 const holidays=pathname==="/api/business/hr/settings/holidays";
 const roster=/^\/api\/business\/hr\/rosters\/(\d+)\/(20\d\d-\d\d)$/.exec(pathname);
 const staff=/^\/api\/business\/hr\/rosters\/(\d+)\/(20\d\d-\d\d)\/staff$/.exec(pathname);
 const attendance=/^\/api\/business\/hr\/employees\/(\d+)\/attendance$/.exec(pathname);
 const anomalies=pathname==="/api/business/hr/attendance/anomalies";
 if(!setting&&!holidays&&!roster&&!staff&&!attendance&&!anomalies)return null;
 const body=async()=>object(await request.json().catch(()=>null));
 try{
  if(setting){
   const svc=new HrSettingsService(db),name=setting[1] as HrSettingName;
   if(request.method==="GET")return success(await svc.list(name),id);
   if(request.method==="POST")return success(await svc.write(name,await body(),ctx),id);
   if(request.method==="PATCH"){const v=await body();return success(await svc.write(name,v,ctx,integer(v.id,"id",true)),id)}
  }
  if(holidays){
   const svc=new HrSettingsService(db);
   if(request.method==="GET")return success(await svc.holidays(Number(url.searchParams.get("year"))),id);
   if(request.method==="POST")return success(await svc.saveHoliday(await body(),ctx),id);
   if(request.method==="DELETE")return success(await svc.deleteHoliday(url.searchParams.get("date")??"",ctx),id);
  }
  if(staff && request.method==="PATCH")return success(await new HrRosterService(db).updateStaff(Number(staff[1]),await body(),ctx),id);
  if(roster){
   const svc=new HrRosterService(db),storeId=Number(roster[1]),month=roster[2];
   if(request.method==="GET")return success(await svc.get(storeId,month),id);
   if(request.method==="PUT")return success(await svc.put(storeId,month,await body(),ctx),id);
  }
  if(attendance){
   const svc=new HrAttendanceService(db),employeeId=Number(attendance[1]),month=url.searchParams.get("month")??"";
   if(request.method==="GET")return success(await svc.get(employeeId,month),id);
   if(request.method==="PUT")return success(await svc.put(employeeId,month,await body(),ctx),id);
  }
  if(anomalies&&request.method==="GET"){
   const storeId=Number(url.searchParams.get("storeId")),month=url.searchParams.get("month")??"";
   if(!Number.isSafeInteger(storeId)||storeId<=0)throw new HrValidationError("storeId","門市 ID 錯誤");
   return success(await new HrAttendanceService(db).anomalies(storeId,month),id);
  }
  return failure({code:"METHOD_NOT_ALLOWED",message:"不支援此操作"},id,405);
 }catch(err){
  if(err instanceof HrRosterError)
   return json({ok:false,error:{code:err.code,message:err.code==="HR_ROSTER_VIOLATION"?"未來排班違規":err.code==="HR_LEAVE_FORM_EXISTS"?"已有正式假單，請先銷假":"此排班須主管核准",items:err.items},requestId:id},{status:409});
  if(err instanceof HrValidationError)
   return failure({code:err.status===409?"HR_CONFLICT":"HR_VALIDATION_ERROR",message:err.message,fields:{[err.field]:err.message}},id,err.status);
  if(err instanceof Error&&/UNIQUE constraint failed|FOREIGN KEY constraint failed/.test(err.message))
   return failure({code:"HR_CONFLICT",message:"資料重複或仍被使用"},id,409);
  return failure({code:"HR_UNAVAILABLE",message:"人事資料處理失敗"},id,500);
 }
}
