import {requireIdentity} from "../auth/guard";
import {checkModuleAccess,resolveAppMember,type AppMemberRecord} from "../auth/app-access";
import {identityClient,type IdentityRuntimeEnv} from "./auth-routes";
import {readJsonObject,RequestInputError} from "./request";
import {failure,success} from "./response";
import type {IdentityPrincipal} from "../identity/contract";
import type {HubNotice,HubReminder,HubReminderCounts,HubPage,HubRecipient,HubReadReceipt,HubSummary,NoticeKind,PersonalTodo} from "../../shared/home-hub";

type Arg = string|number|null;
type Db = D1Database;
class Problem extends Error {constructor(readonly code:string,message:string,readonly status=400){super(message)}}
const many=async<T>(db:Db,sql:string,...args:Arg[]):Promise<T[]>=>((await db.prepare(sql).bind(...args).all<T>()).results??[]) as T[];
const one=<T>(db:Db,sql:string,...args:Arg[]):Promise<T|null>=>db.prepare(sql).bind(...args).first<T>();
const idOf=(raw:string|null):number=>{
 if(!raw||!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Problem("HUB_INVALID_ID","項目編號不正確");
 return Number(raw);
};
const uuid=(value:string):string=>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new Problem("HUB_INVALID_ID","通知編號不正確");
 return value.toLowerCase();
};
const text=(v:unknown,label:string,max:number,required=false):string=>{
 if(typeof v!=="string")throw new Problem("HUB_INVALID",label+"格式不正確");
 const s=v.trim();
 if([...s].length>max||(required&&!s))throw new Problem("HUB_INVALID",label+"長度不正確");
 return s;
};
const limit=(raw:string|null,fallback:number,max:number):number=>{
 if(!raw)return fallback;
 if(!/^\d{1,3}$/.test(raw))throw new Problem("HUB_INVALID","分頁數量不正確");
 const n=Number(raw);
 if(n<1||n>max)throw new Problem("HUB_INVALID","分頁數量不正確");
 return n;
};
function taipeiDay(now=new Date()):string{
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now).map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;
}
function todoDate(value:unknown):string|null{
 if(value===null||value==="")return null;
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Problem("HUB_INVALID","到期日期不正確");
 const t=new Date(value+"T00:00:00.000Z");
 if(!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==value)throw new Problem("HUB_INVALID","到期日期不正確");
 return value;
}
function todoTime(value:unknown):string|null{
 if(value===null||value==="")return null;
 if(typeof value!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Problem("HUB_INVALID","到期時間不正確");
 return value;
}
function todoPriority(value:unknown):"normal"|"important"{
 if(value!=="normal"&&value!=="important")throw new Problem("HUB_INVALID","優先程度不正確");
 return value;
}
function kindOf(value:string|null):NoticeKind{
 if(value!=="company"&&value!=="personal")throw new Problem("HUB_INVALID","通知頁籤不正確");
 return value;
}
function noticeCursor(value:string|null):[string,string]|null{
 if(!value)return null;
 const i=value.indexOf("|"),at=value.slice(0,i),id=value.slice(i+1);
 if(i<0||!/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(at))throw new Problem("HUB_INVALID","分頁位置不正確");
 return [at,uuid(id)];
}
type TodoRow={id:number;title:string;detail:string;due_date:string|null;due_time:string|null;priority:"normal"|"important";completed_at:string|null;created_at:string;updated_at:string};
const todo=(r:TodoRow):PersonalTodo=>({id:r.id,title:r.title,detail:r.detail,dueDate:r.due_date,dueTime:r.due_time,priority:r.priority,completedAt:r.completed_at,createdAt:r.created_at,updatedAt:r.updated_at});
type NoticeRow={id:string;kind:NoticeKind;title:string;body:string;author_name:string;created_at:string;read_at:string|null;revoked_at:string|null;recipient_count:number;read_count:number};
const notice=(r:NoticeRow):HubNotice=>({id:r.id,kind:r.kind,title:r.title,body:r.body,authorName:r.author_name,createdAt:r.created_at,readAt:r.read_at,revokedAt:r.revoked_at,recipientCount:r.recipient_count,readCount:r.read_count});
const TODO_SELECT="SELECT id,title,detail,due_date,due_time,priority,completed_at,created_at,updated_at FROM personal_todos";
const NOTICE_SELECT="SELECT n.id,n.kind,n.title,n.body,n.author_name,n.created_at,n.revoked_at,rr.read_at,"+
 " (SELECT COUNT(*) FROM hub_notice_recipients rc WHERE rc.notice_id=n.id) AS recipient_count,"+
 " (SELECT COUNT(*) FROM hub_notice_reads rd WHERE rd.notice_id=n.id) AS read_count FROM hub_notices n"+
 " LEFT JOIN hub_notice_reads rr ON rr.notice_id=n.id AND rr.member_id=?";
async function permission(db:Db,principal:IdentityPrincipal,kind:NoticeKind):Promise<boolean>{
 const code=kind==="company"?"ANNOUNCEMENT_PUBLISH":"PERSONAL_NOTICE_SEND";
 return (await checkModuleAccess(db,principal,code)).allowed;
}
async function counts(db:Db,memberId:number,day:string):Promise<HubReminderCounts>{
 const result=await one<{overdue:number;today:number;personal:number;company:number}>(db,
 "SELECT"+
 " (SELECT COUNT(*) FROM personal_todos t WHERE t.member_id=? AND t.completed_at IS NULL AND t.due_date < ?) AS overdue,"+
 " (SELECT COUNT(*) FROM personal_todos t WHERE t.member_id=? AND t.completed_at IS NULL AND t.due_date=?) AS today,"+
 " (SELECT COUNT(*) FROM hub_notices n JOIN hub_notice_recipients r ON r.notice_id=n.id WHERE n.kind='personal' AND r.member_id=? AND n.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM hub_notice_reads rd WHERE rd.notice_id=n.id AND rd.member_id=?)) AS personal,"+
 " (SELECT COUNT(*) FROM hub_notices n WHERE n.kind='company' AND n.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM hub_notice_reads rd WHERE rd.notice_id=n.id AND rd.member_id=?)) AS company",
 memberId,day,memberId,day,memberId,memberId,memberId);
 const c={overdue:result?.overdue??0,today:result?.today??0,personal:result?.personal??0,company:result?.company??0};
 return {...c,total:c.overdue+c.today+c.personal+c.company};
}
function remindersCursor(raw:string|null):[number,string,string]|null{
 if(!raw)return null;
 const match=/^([0-3])\|([^|]{1,50})\|([0-9a-f-]{1,36})$/.exec(raw);
 if(!match)throw new Problem("HUB_INVALID","提醒清單位置不正確");
 return [Number(match[1]),match[2],match[3]];
}
async function reminderPage(db:Db,memberId:number,day:string,raw:string|null,n:number){
 const cursor=remindersCursor(raw),tier=cursor?.[0]??-1,at=cursor?.[1]??"",id=cursor?.[2]??"";
 // One bounded UNION query, indexed by each source. No history downloads or whole-table JS merge.
 const sql="SELECT tier,kind,item_id,title,sort_at,subtitle FROM ("+
  " SELECT 0 AS tier,'todo' AS kind,CAST(t.id AS TEXT) AS item_id,t.title AS title,t.due_date||'T'||COALESCE(t.due_time,'23:59') AS sort_at,'逾期待辦' AS subtitle FROM personal_todos t WHERE t.member_id=? AND t.completed_at IS NULL AND t.due_date<?"+
  " UNION ALL SELECT 1 AS tier,'personal' AS kind,n.id AS item_id,n.title AS title,n.created_at AS sort_at,n.author_name AS subtitle FROM hub_notices n JOIN hub_notice_recipients r ON r.notice_id=n.id WHERE r.member_id=? AND n.kind='personal' AND n.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM hub_notice_reads rd WHERE rd.notice_id=n.id AND rd.member_id=?)"+
  " UNION ALL SELECT 2 AS tier,'company' AS kind,n.id AS item_id,n.title AS title,n.created_at AS sort_at,n.author_name AS subtitle FROM hub_notices n WHERE n.kind='company' AND n.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM hub_notice_reads rd WHERE rd.notice_id=n.id AND rd.member_id=?)"+
  " UNION ALL SELECT 3 AS tier,'todo' AS kind,CAST(t.id AS TEXT) AS item_id,t.title AS title,t.due_date||'T'||COALESCE(t.due_time,'23:59') AS sort_at,'今日到期待辦' AS subtitle FROM personal_todos t WHERE t.member_id=? AND t.completed_at IS NULL AND t.due_date=?"+
  ") x WHERE (?=-1 OR tier>? OR (tier=? AND (sort_at<? OR (sort_at=? AND item_id<?)))) ORDER BY tier ASC,sort_at DESC,item_id DESC LIMIT ?";
 const rows=await many<{tier:number;kind:"todo"|"personal"|"company";item_id:string;title:string;sort_at:string;subtitle:string}>(db,sql,
   memberId,day,memberId,memberId,memberId,memberId,day,tier,tier,tier,at,at,id,n+1);
 const more=rows.length>n,visible=rows.slice(0,n),last=visible.at(-1);
 const items:HubReminder[]=visible.map(r=>({tier:r.tier,kind:r.kind,id:r.item_id,title:r.title,sortAt:r.sort_at,subtitle:r.subtitle}));
 return {items,more,nextCursor:more&&last?last.tier+"|"+last.sort_at+"|"+last.item_id:null,counts:await counts(db,memberId,day)};
}
async function todoPage(db:Db,memberId:number,status:string,before:number,n=30):Promise<HubPage<PersonalTodo>>{
 if(status!=="open"&&status!=="done")throw new Problem("HUB_INVALID","待辦篩選不正確");
 const rows=await many<TodoRow>(db,TODO_SELECT+" WHERE member_id=? AND completed_at IS "+(status==="open"?"NULL":"NOT NULL")+" AND (?=0 OR id<?) ORDER BY id DESC LIMIT ?",memberId,before,before,n+1);
 const more=rows.length>n,visible=rows.slice(0,n);
 return {items:visible.map(todo),more,nextCursor:more?String(visible.at(-1)?.id):null};
}
async function noticePage(db:Db,memberId:number,kind:NoticeKind,mode:string,before:[string,string]|null,n=30):Promise<HubPage<HubNotice>>{
 if(mode!=="inbox"&&mode!=="sent")throw new Problem("HUB_INVALID","通知清單類型不正確");
 const scope=mode==="sent"?"n.created_by=?":"(n.kind='company' OR EXISTS(SELECT 1 FROM hub_notice_recipients rec WHERE rec.notice_id=n.id AND rec.member_id=?))";
 const sql=NOTICE_SELECT+" WHERE n.kind=? AND "+scope+(mode==="sent"?"":" AND n.revoked_at IS NULL")+
  " AND (?='' OR n.created_at<? OR (n.created_at=? AND n.id<?)) ORDER BY n.created_at DESC,n.id DESC LIMIT ?";
 const rows=await many<NoticeRow>(db,sql,memberId,kind,memberId,before?.[0]??"",before?.[0]??"",before?.[0]??"",before?.[1]??"",n+1);
 const more=rows.length>n,visible=rows.slice(0,n),last=visible.at(-1);
 return {items:visible.map(notice),more,nextCursor:more&&last?last.created_at+"|"+last.id:null};
}
async function noticeDetail(db:Db,memberId:number,id:string):Promise<HubNotice|null>{
 const row=await one<NoticeRow>(db,NOTICE_SELECT+" WHERE n.id=? AND (n.created_by=? OR (n.revoked_at IS NULL AND (n.kind='company' OR EXISTS(SELECT 1 FROM hub_notice_recipients r WHERE r.notice_id=n.id AND r.member_id=?))))",memberId,id,memberId,memberId);
 return row?notice(row):null;
}
async function handleAuthorized(request:Request,db:Db,member:AppMemberRecord,principal:IdentityPrincipal,url:URL,requestId:string):Promise<Response>{
 const path=url.pathname,method=request.method,memberId=member.id,day=taipeiDay();
 if(method==="GET"&&path==="/api/hub/reminders")return success(await reminderPage(db,memberId,day,url.searchParams.get("before"),limit(url.searchParams.get("limit"),5,20)),requestId);
 if(method==="GET"&&path==="/api/hub/summary"){
  const [todoData,company,personal,c]=await Promise.all([
   many<TodoRow>(db,TODO_SELECT+" WHERE member_id=? AND completed_at IS NULL ORDER BY (due_date IS NULL),due_date,id DESC LIMIT 5",memberId),
   noticePage(db,memberId,"company","inbox",null,2),
   noticePage(db,memberId,"personal","inbox",null,2),
   counts(db,memberId,day),
  ]);
  const summary:HubSummary={counts:c,todos:todoData.map(todo),company:company.items,personal:personal.items};
  return success(summary,requestId);
 }
 if(method==="GET"&&path==="/api/hub/todos")return success(await todoPage(db,memberId,url.searchParams.get("status")??"open",url.searchParams.get("before")?idOf(url.searchParams.get("before")):0),requestId);
 if(method==="POST"&&path==="/api/hub/todos"){
  const input=await readJsonObject(request,8192),title=text(input.title,"事項",160,true),detail=text(input.detail??"","詳情",3000),dueDate=todoDate(input.dueDate??null),dueTime=todoTime(input.dueTime??null),priority=todoPriority(input.priority??"normal");
  if(dueTime&&!dueDate)throw new Problem("HUB_INVALID","請先設定到期日期");
  const now=new Date().toISOString();
  const result=await db.prepare("INSERT INTO personal_todos(member_id,title,detail,due_date,due_time,priority,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?)").bind(memberId,title,detail,dueDate,dueTime,priority,now,now).run();
  const id=Number(result.meta.last_row_id);
  const row=await one<TodoRow>(db,TODO_SELECT+" WHERE id=? AND member_id=?",id,memberId);
  return success(row?todo(row):null,requestId,{status:201});
 }
 let match=/^\/api\/hub\/todos\/(\d+)$/.exec(path);
 if(match){
  const id=idOf(match[1]),old=await one<TodoRow>(db,TODO_SELECT+" WHERE id=? AND member_id=?",id,memberId);
  if(!old)return failure({code:"HUB_NOT_FOUND",message:"找不到此待辦"},requestId,404);
  if(method==="GET")return success(todo(old),requestId);
  if(method==="DELETE"){await db.prepare("DELETE FROM personal_todos WHERE id=? AND member_id=?").bind(id,memberId).run();return success({deleted:true},requestId)}
  if(method==="PATCH"){
   const input=await readJsonObject(request,8192);
   const title="title" in input?text(input.title,"事項",160,true):old.title;
   const detail="detail" in input?text(input.detail,"詳情",3000):old.detail;
   const dueDate="dueDate" in input?todoDate(input.dueDate):old.due_date;
   const dueTime="dueTime" in input?todoTime(input.dueTime):old.due_time;
   const priority="priority" in input?todoPriority(input.priority):old.priority;
   if(dueTime&&!dueDate)throw new Problem("HUB_INVALID","請先設定到期日期");
   if("completed" in input&&typeof input.completed!=="boolean")throw new Problem("HUB_INVALID","完成狀態不正確");
   const completed="completed" in input?(input.completed?old.completed_at??new Date().toISOString():null):old.completed_at;
   const now=new Date().toISOString();
   await db.prepare("UPDATE personal_todos SET title=?,detail=?,due_date=?,due_time=?,priority=?,completed_at=?,updated_at=? WHERE id=? AND member_id=?").bind(title,detail,dueDate,dueTime,priority,completed,now,id,memberId).run();
   return success(todo((await one<TodoRow>(db,TODO_SELECT+" WHERE id=? AND member_id=?",id,memberId))!),requestId);
  }
 }
 if(method==="GET"&&path==="/api/hub/recipients"){
  if(!await permission(db,principal,"personal"))return failure({code:"ACCESS_DENIED",message:"沒有發送個人通知的權限"},requestId,403);
  // Directory is limited to locally projected active CYWEB members; never expose addresses or credentials.
  const rows=await many<{id:number;employee_no:string|null;display_name:string|null}>(db,"SELECT id,employee_no,display_name FROM app_members WHERE is_active=1 ORDER BY employee_no,id LIMIT 500");
  const people:HubRecipient[]=rows.map(r=>({id:r.id,employeeNo:r.employee_no,name:r.display_name??r.employee_no??"使用者"}));
  return success(people,requestId);
 }
 if(method==="GET"&&path==="/api/hub/notices"){
  const kind=kindOf(url.searchParams.get("kind")),mode=url.searchParams.get("mode")??"inbox";
  if(mode==="sent"&&!await permission(db,principal,kind))return failure({code:"ACCESS_DENIED",message:"沒有查看發送紀錄的權限"},requestId,403);
  return success(await noticePage(db,memberId,kind,mode,noticeCursor(url.searchParams.get("before"))),requestId);
 }
 if(method==="POST"&&path==="/api/hub/notices"){
  const input=await readJsonObject(request,32_768),kind=kindOf(typeof input.kind==="string"?input.kind:null);
  if(!await permission(db,principal,kind))return failure({code:"ACCESS_DENIED",message:"沒有此頁籤的發布權限"},requestId,403);
  const title=text(input.title,"標題",160,true),body=text(input.body,"內容",5000,true);
  const ids=kind==="personal"?input.recipients:[];
  if(!Array.isArray(ids)||ids.length>(kind==="personal"?50:0)||(kind==="personal"&&!ids.length)||ids.some(id=>!Number.isSafeInteger(id)||id<1))
   throw new Problem("HUB_INVALID","收件人不正確，個人通知至少指定一人且最多 50 人");
  const recipients=[...new Set(ids as number[])];
  if(kind==="personal"){
   const valid=await many<{id:number}>(db,"SELECT id FROM app_members WHERE is_active=1 AND id IN (SELECT value FROM json_each(?))",JSON.stringify(recipients));
   if(valid.length!==recipients.length)throw new Problem("HUB_INVALID","部分收件人不存在或已停用");
  }
  const id=crypto.randomUUID(),now=new Date().toISOString(),author=(member.displayName??principal.displayName??member.employeeNo??"使用者").trim().slice(0,120)||"使用者";
  const statements=[
    db.prepare("INSERT INTO hub_notices(id,kind,title,body,created_by,author_name,created_at) VALUES(?,?,?,?,?,?,?)").bind(id,kind,title,body,memberId,author,now),
    ...recipients.map(target=>db.prepare("INSERT INTO hub_notice_recipients(notice_id,member_id) VALUES(?,?)").bind(id,target)),
    db.prepare("INSERT INTO audit_events(entity_type,entity_key,action,actor_employee_id,occurred_at,request_id,metadata_json) VALUES('hub_notice',?,'hub_notice.sent',?,?,?,?)").bind(id,memberId,now,requestId,JSON.stringify({kind,recipientCount:recipients.length})),
  ];
  await db.batch(statements);
  const created=await noticeDetail(db,memberId,id);
  return success(created,requestId,{status:201});
 }
 match=/^\/api\/hub\/notices\/([0-9a-f-]{36})(?:\/(read|receipts|revoke))?$/.exec(path);
 if(match){
  const id=uuid(match[1]),operation=match[2]??"";
  const item=await noticeDetail(db,memberId,id);
  if(!item)return failure({code:"HUB_NOT_FOUND",message:"找不到此通知或沒有存取權限"},requestId,404);
  if(method==="GET"&&!operation)return success(item,requestId);
  if(method==="POST"&&operation==="read"){
   if(item.revokedAt)return failure({code:"HUB_NOT_FOUND",message:"通知已撤回"},requestId,404);
   await db.prepare("INSERT INTO hub_notice_reads(notice_id,member_id,read_at) VALUES(?,?,?) ON CONFLICT(notice_id,member_id) DO NOTHING").bind(id,memberId,new Date().toISOString()).run();
   return success({read:true},requestId);
  }
  const owned=await one<{created_by:number|null}>(db,"SELECT created_by FROM hub_notices WHERE id=?",id);
  const canManage=!!owned&&(owned.created_by===memberId||principal.workspaceRole==="SUPER_ADMIN")&&await permission(db,principal,item.kind);
  if(!canManage)return failure({code:"ACCESS_DENIED",message:"沒有管理此通知的權限"},requestId,403);
  if(method==="GET"&&operation==="receipts"){
   const rows=await many<{id:number;employee_no:string|null;display_name:string|null;read_at:string|null}>(db,
    item.kind==="personal"?
    "SELECT m.id,m.employee_no,m.display_name,r.read_at FROM hub_notice_recipients nr JOIN app_members m ON m.id=nr.member_id LEFT JOIN hub_notice_reads r ON r.notice_id=nr.notice_id AND r.member_id=m.id WHERE nr.notice_id=? ORDER BY m.employee_no,m.id":
    "SELECT m.id,m.employee_no,m.display_name,r.read_at FROM hub_notice_reads r JOIN app_members m ON m.id=r.member_id WHERE r.notice_id=? ORDER BY r.read_at DESC LIMIT 500",id);
   const receipts:HubReadReceipt[]=rows.map(r=>({id:r.id,employeeNo:r.employee_no,name:r.display_name??r.employee_no??"使用者",readAt:r.read_at}));
   return success(receipts,requestId);
  }
  if(method==="POST"&&operation==="revoke"){
   if(item.revokedAt)return failure({code:"HUB_CONFLICT",message:"通知已撤回"},requestId,409);
   const now=new Date().toISOString();
   await db.batch([
     db.prepare("UPDATE hub_notices SET revoked_at=?,revoked_by=? WHERE id=? AND revoked_at IS NULL").bind(now,memberId,id),
     db.prepare("INSERT INTO audit_events(entity_type,entity_key,action,actor_employee_id,occurred_at,request_id,metadata_json) VALUES('hub_notice',?,'hub_notice.revoked',?,?,?,?)").bind(id,memberId,now,requestId,JSON.stringify({kind:item.kind})),
   ]);
   return success({revoked:true},requestId);
  }
 }
 return failure({code:"NOT_FOUND",message:"此功能不存在"},requestId,404);
}
export async function handleHomeHubRoute(request:Request,env:IdentityRuntimeEnv,requestId:string):Promise<Response|null>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith("/api/hub/"))return null;
 const provider=identityClient(env);
 if(!provider)return failure({code:"IDENTITY_UNAVAILABLE",message:"帳號服務目前無法使用"},requestId,503);
 const gate=await requireIdentity(provider,request);
 if(!gate.ok)return failure({code:gate.code,message:"需要有效的登入身分"},requestId,gate.status);
 try{
  const member=await resolveAppMember(env.DB,gate.principal);
  if(!member.isActive)return failure({code:"ACCESS_DENIED",message:"使用者已停用"},requestId,403);
  return await handleAuthorized(request,env.DB,member,gate.principal,url,requestId);
 }catch(error){
  if(error instanceof RequestInputError||error instanceof Problem)return failure({code:error.code,message:error.message},requestId,error.status);
  throw error;
 }
}
