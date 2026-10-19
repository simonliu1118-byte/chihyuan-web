import { HrService } from "../hr/hr-service";
import { handleHrRoute } from "../http/hr-routes";
import { AuditService } from "../audit/audit-service";
import { maskTaiwanId, isValidTaiwanId } from "../../shared/national-id";
import { annualLeaveSchedule } from "../../shared/hr-annual-leave";

function check(condition:unknown,code:string):asserts condition { if(!condition)throw Error(code); }
export async function acceptHrPhase1(db:D1Database):Promise<void>{
 check(isValidTaiwanId("A123456789") && !isValidTaiwanId("A123456780") && maskTaiwanId("A123456789")==="A12****789","ACCEPT_HR_ID_CHECKSUM");
 check(annualLeaveSchedule("2026-01-01",[],"2026-06-30").length===0,"ACCEPT_HR_LEAVE_BEFORE_HALF_YEAR");
 const first=annualLeaveSchedule("2026-01-01",[],"2027-01-01");
 check(first[0]?.days===3 && first[1]?.days===7,"ACCEPT_HR_HALF_YEAR_AND_ONE_YEAR");
 for (const [years,days] of [[2,10],[3,14],[4,14],[5,15],[10,16],[24,30],[30,30]]) {
  const rows=annualLeaveSchedule("2026-01-01",[],"2057-01-01");
  check(rows.find(x=>x.serviceYearsLabel==="滿 "+years+" 年")?.days===days,"ACCEPT_HR_LEAVE_YEAR_"+years);
 }
 check(annualLeaveSchedule("2025-08-31",[],"2026-03-01")[0]?.periodStart==="2026-03-01","ACCEPT_HR_AUGUST_31");
 check(annualLeaveSchedule("2024-02-29",[],"2025-02-28").at(-1)?.periodStart==="2025-03-01","ACCEPT_HR_LEAP_DAY");
 const svc=new HrService(db), now="2026-10-19T00:00:00.000Z";
 const ctx={actor:1,requestId:"accept-hr-phase1",now};
 let role:"USER"|"ADMIN"|"SUPER_ADMIN"="USER";
 const env={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",
  IDENTITY:{async fetch(){return Response.json({ok:true,principal:{
   workspaceId:"workspace-test",employeeId:"hr-acceptance-user",employeeNo:"0097",displayName:"測試管理員",
   workspaceRole:role,isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:role==="SUPER_ADMIN",
   credentialVersion:1,employeeRevision:1,
  },session:{expiresAt:"2999-01-01T00:00:00.000Z"}});}} as unknown as Fetcher};
 async function call(path:string,method="GET",body?:unknown){
  const response=await handleHrRoute(new Request("https://acceptance.test/api/business/hr/"+path,{
   method,headers:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64),"content-type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  }),env,"accept-hr-http");check(response,"ACCEPT_HR_ROUTE_MISSING");return response;
 }
 for(const userRole of ["USER","ADMIN"] as const){
  role=userRole;
  for(const path of ["employees","employees/1","employees/1/annual-leave","employees/1/national-id/reveal","settings/minimum-wages","settings/salary-item-types"]){
   const method=path.endsWith("reveal")?"POST":"GET";
   check((await call(path,method)).status===403,"ACCEPT_HR_FORBIDDEN_"+userRole+"_"+path);
  }
  check((await call("employees","POST",{employeeNo:"FORBIDDEN",name:"測試員工甲",hireDate:"2025-01-01"})).status===403,"ACCEPT_HR_FORBIDDEN_POST");
 }
 role="SUPER_ADMIN";
 const input={employeeNo:"HRTEST001",name:"測試員工甲",hireDate:"2025-01-01",seniorityStartDate:"2025-01-01",status:"active",nationalId:"A123456789",
  contacts:[{name:"測試聯絡甲",relationship:"家人",phone:"0900000000"}],
  education:[{school:"虛構學校",department:"測試科",degree:"學士",graduationMonth:"2024/06"}],
  workHistory:[{company:"測試公司",jobTitle:"測試職務",startMonth:"2024/07",endMonth:"2024/12",note:"測試"}]};
 const created=await svc.create(input,ctx) as Record<string,unknown>;
 check(typeof created.id==="number","ACCEPT_HR_CREATE");
 check(created.nationalIdMasked===maskTaiwanId(input.nationalId),"ACCEPT_HR_ID_MASKED");
 check(!JSON.stringify(created).includes(input.nationalId),"ACCEPT_HR_ID_RESPONSE_PRIVATE");
 check(Array.isArray(created.contacts)&&created.contacts.length===1,"ACCEPT_HR_CONTACT");
 check(Array.isArray(created.education)&&created.education.length===1,"ACCEPT_HR_EDUCATION");
 check(Array.isArray(created.workHistory)&&created.workHistory.length===1,"ACCEPT_HR_WORK_HISTORY");
 const id=created.id as number;
 check((await call("employees","POST",input)).status===409,"ACCEPT_HR_EMPLOYEE_NO_UNIQUE");
 const owner=await db.prepare("SELECT id FROM app_members ORDER BY id LIMIT 1").first<{id:number}>();
 if(owner){
   const linked=await svc.create({...input,employeeNo:"HRTEST002",nationalId:null,memberId:owner.id},ctx) as Record<string,unknown>;
   check(linked.member_id===owner.id,"ACCEPT_HR_MEMBER_LINK");
   check((await call("employees","POST",{...input,employeeNo:"HRTEST003",nationalId:null,memberId:owner.id})).status===409,"ACCEPT_HR_MEMBER_UNIQUE");
 }
 check((await call("employees","POST",{...input,employeeNo:"HRTEST004",status:"terminated"})).status===422,"ACCEPT_HR_TERMINATION_REQUIRES_EVENT");
 check((await call("employees/"+id+"/national-id/reveal","POST")).status===200,"ACCEPT_HR_REVEAL_ALLOWED");
 const audit=await db.prepare("SELECT before_json,after_json,metadata_json FROM audit_events WHERE entity_type LIKE 'hr_%'").all<Record<string,string|null>>();
 check(!(audit.results??[]).some(x=>JSON.stringify(x).includes(input.nationalId)),"ACCEPT_HR_AUDIT_NO_FULL_ID");
 const adminEvents=await new AuditService(db).listDetailedPage({includeHrEvents:false});
 check(adminEvents.events.every(x=>!x.entityType.startsWith("hr_")),"ACCEPT_HR_AUDIT_ADMIN_HIDDEN");
 const superEvents=await new AuditService(db).listDetailedPage({includeHrEvents:true});
 check(superEvents.events.some(x=>x.entityType==="hr_employee"),"ACCEPT_HR_AUDIT_SUPER_VISIBLE");
 await svc.statusChange(id,{effectiveDate:"2026-01-01",nextStatus:"leave",reason:"測試留職"},ctx);
 const updated=await svc.get(id) as Record<string,unknown>;
 check(updated.status==="leave","ACCEPT_HR_STATUS_CHANGE");
 check(Array.isArray(updated.statusChanges)&&updated.statusChanges.length>=2,"ACCEPT_HR_STATUS_HISTORY");
 await svc.addExclusion(id,{startDate:"2025-04-01",endDate:"2025-04-10",reason:"測試不計年資"},ctx);
 const leave=await svc.leave(id,"2026-10-19");
 check(leave.length>=1&&leave[0].periodStart==="2025-07-11","ACCEPT_HR_LEAVE_EXCLUSION");
 await db.prepare("INSERT INTO hr_minimum_wages(effective_date,monthly_amount,hourly_amount,created_at) VALUES('2026-01-01',30000,200,?)").bind(now).run();
 let rejected=false;
 try{await svc.salary(id,{effectiveDate:"2026-02-01",paymentType:"monthly",baseAmount:10000,reason:"測試低於最低工資"},ctx);}catch{rejected=true;}
 check(rejected,"ACCEPT_HR_MINIMUM_WAGE_BLOCK");
 const save=await svc.salary(id,{effectiveDate:"2025-12-01",paymentType:"monthly",baseAmount:10000,reason:"未設定最低工資期間測試"},ctx);
 check(save.minimumWageConfigured===false,"ACCEPT_HR_UNSET_WAGE_WARN");
}
