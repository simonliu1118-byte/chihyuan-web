import { requireIdentity } from "../auth/guard";
import { resolveAppMember } from "../auth/app-access";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { HrService } from "../hr/hr-service";
import { HrValidationError, date, integer, object, required } from "../hr/hr-validation";
import { AuditService } from "../audit/audit-service";
import { failure, success } from "./response";

function bad(message:string,requestId:string,status=422,code="HR_VALIDATION_ERROR"):Response {
 return failure({code,message},requestId,status);
}
export async function handleHrRoute(request:Request,env:IdentityRuntimeEnv,requestId:string):Promise<Response|null>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith("/api/business/hr/"))return null;
 // The identity gate is authoritative. HR never participates in CYWEB_MODULES or role-projected UI permissions.
 const provider=identityClient(env);
 if(!provider)return failure({code:"IDENTITY_UNAVAILABLE",message:"身分服務暫時不可用"},requestId,503);
 const gate=await requireIdentity(provider,request);
 if(!gate.ok)return failure({code:gate.code,message:"請先登入"},requestId,gate.status);
 if(gate.principal.workspaceRole!=="SUPER_ADMIN")
   return failure({code:"SUPER_ADMIN_REQUIRED",message:"此功能僅限超級管理員"},requestId,403);
 const member=await resolveAppMember(env.DB,gate.principal);
 if(!member.isActive)return failure({code:"ACCESS_DENIED",message:"使用者已停用"},requestId,403);
 const service=new HrService(env.DB);
 const ctx={actor:member.id,requestId,now:new Date().toISOString()};
 const body=async()=>object(await request.json().catch(()=>null));
 const idPath=/^\/api\/business\/hr\/employees\/(\d+)(?:\/(.*))?$/.exec(url.pathname);
 const employeeId=idPath?Number(idPath[1]):null;
 try{
  if(url.pathname==="/api/business/hr/employees"){
    if(request.method==="GET"){
      const q=url.searchParams.get("q")?.trim()??"";
      const status=url.searchParams.get("status")??undefined;
      const cursor=Number(url.searchParams.get("cursor")??0);
      const limit=Number(url.searchParams.get("limit")??40);
      if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return bad("分頁參數錯誤",requestId);
      return success(await service.list(q,status,cursor,limit),requestId);
    }
    if(request.method==="POST")return success(await service.create(await body(),ctx),requestId);
  }
  if(employeeId && Number.isSafeInteger(employeeId)){
    const path=idPath?.[2]??"";
    if(!path && request.method==="GET")return success(await service.get(employeeId),requestId);
    if(!path && request.method==="PATCH")return success(await service.update(employeeId,await body(),ctx),requestId);
    if(path==="status-changes" && request.method==="POST")return success(await service.statusChange(employeeId,await body(),ctx),requestId);
    if(path==="seniority-exclusions" && request.method==="POST")return success(await service.addExclusion(employeeId,await body(),ctx),requestId);
    const exclusion=/^seniority-exclusions\/(\d+)$/.exec(path);
    if(exclusion && request.method==="DELETE"){await service.removeExclusion(employeeId,Number(exclusion[1]),ctx);return success({deleted:true},requestId);}
    if(path==="salary-records" && request.method==="POST")return success(await service.salary(employeeId,await body(),ctx),requestId);
    if(path==="annual-leave" && request.method==="GET"){
      const asOf=url.searchParams.get("asOf")??ctx.now.slice(0,10);
      return success(await service.leave(employeeId,date(asOf,"asOf")),requestId);
    }
    if(path==="national-id/reveal" && request.method==="POST")
      return success(await service.reveal(employeeId,ctx),requestId);
  }
  if(url.pathname==="/api/business/hr/settings/salary-item-types"){
    if(request.method==="GET")return success((await env.DB.prepare("SELECT id,name,is_active FROM hr_salary_item_types ORDER BY id").all()).results??[],requestId);
    if(request.method==="POST"){
      const v=await body(),name=required(v.name,"name",100);
      const now=ctx.now;
      await env.DB.batch([
        env.DB.prepare("INSERT INTO hr_salary_item_types(name,created_at,updated_at) VALUES(?,?,?)").bind(name,now,now),
        new AuditService(env.DB).prepareRecord({entityType:"hr_setting",entityKey:"salary_item_types",action:"hr_setting.updated",actorEmployeeId:ctx.actor,requestId,after:{name}})
      ]);return success({saved:true},requestId);
    }
    if(request.method==="PATCH"){
      const v=await body(),id=integer(v.id,"id",true),name=required(v.name,"name",100),active=v.isActive===true?1:0;
      await env.DB.batch([
        env.DB.prepare("UPDATE hr_salary_item_types SET name=?,is_active=?,updated_at=? WHERE id=?").bind(name,active,ctx.now,id),
        new AuditService(env.DB).prepareRecord({entityType:"hr_setting",entityKey:"salary_item_types",action:"hr_setting.updated",actorEmployeeId:ctx.actor,requestId,after:{itemTypeId:id,name,isActive:!!active}})
      ]);return success({saved:true},requestId);
    }
  }
  if(url.pathname==="/api/business/hr/settings/minimum-wages"){
    if(request.method==="GET")return success((await env.DB.prepare("SELECT * FROM hr_minimum_wages ORDER BY effective_date DESC").all()).results??[],requestId);
    if(request.method==="POST"){
      const v=await body(),effective=date(v.effectiveDate,"effectiveDate"),monthly=integer(v.monthlyAmount,"monthlyAmount"),hourly=integer(v.hourlyAmount,"hourlyAmount");
      await env.DB.batch([
        env.DB.prepare("INSERT INTO hr_minimum_wages(effective_date,monthly_amount,hourly_amount,created_at,created_by) VALUES(?,?,?,?,?)").bind(effective,monthly,hourly,ctx.now,ctx.actor),
        new AuditService(env.DB).prepareRecord({entityType:"hr_setting",entityKey:"minimum_wages",action:"hr_setting.updated",actorEmployeeId:ctx.actor,requestId,after:{effectiveDate:effective,monthlyAmount:monthly,hourlyAmount:hourly}})
      ]);return success({saved:true},requestId);
    }
  }
  return failure({code:"METHOD_NOT_ALLOWED",message:"不支援此操作"},requestId,405);
 }catch(e){
   if(e instanceof HrValidationError)return bad(e.message,requestId,e.status);
   if(e instanceof Error && /UNIQUE constraint failed/.test(e.message))return bad("員工編號、使用者綁定或設定生效日已存在",requestId,409,"HR_DUPLICATE");
   // Never return SQL, names, IDs or other HR details in unexpected errors.
   return failure({code:"HR_UNAVAILABLE",message:"人事資料處理失敗，請稍後重試"},requestId,500);
 }
}
