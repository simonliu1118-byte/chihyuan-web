import {requireModuleAccess} from "../auth/guard";
import {identityClient,type IdentityRuntimeEnv} from "./auth-routes";
import {success,failure} from "./response";
import {AuditService} from "../audit/audit-service";
import {STORE_BLACKLIST_ACTIONS,STORE_ORDER_STATUSES,STORE_STEPS,STORE_MILESTONES,STORE_CANCEL_REASONS,STORE_EDIT_REASONS,normalizePhone,orderTotal,type StoreBlacklistAction,type StoreOrderStatus,type StoreMilestone} from "../../shared/store";

type Context={db:D1Database;actor:number;now:string;requestId:string};
type OrderRow={id:number;order_date:string;customer_name:string;phone:string;mobile:string;line_name:string;deposit:number;note:string;status:StoreOrderStatus;notified_at:string|null;ordered_date:string|null;arrived_date:string|null;notified_date:string|null;picked_up_date:string|null;has_ever_ordered:number;legacy:number;cancel_kind:string;cancel_reason:string;version:number;created_at:string;updated_at:string};
type LineRow={id:number;order_id:number;sort_order:number;item_code:string;item_name:string;quantity:number;unit_price:number};
type BlacklistRow={id:number;name:string;phone:string;mobile:string;line_name:string;reason:string;action:StoreBlacklistAction;version:number;active:number;event_count?:number;created_at:string;updated_at:string};
class Bad extends Error{constructor(public code:string,message:string,public status=422){super(message)}}
const text=(v:unknown,name:string,max:number,required=false)=>{
 if(v===undefined||v===null)v="";
 if(typeof v!=="string"||[...v.trim()].length>max)throw new Bad("STORE_INVALID",name+"不正確");
 if(required&&!v.trim())throw new Bad("STORE_INVALID",name+"必填");return v.trim();
};
const numberOf=(v:unknown)=>{const raw=text(v,"電話／手機",30),p=normalizePhone(raw);if(raw&&(p.length<6||p.length>20||!/^[\d\s()+-]+$/.test(raw)))throw new Bad("STORE_INVALID","電話／手機需為 6 到 20 位數字");return p};
function contacts(v:Record<string,unknown>){const f={phone:numberOf(v.phone),mobile:numberOf(v.mobile),lineName:text(v.lineName,"LINE 名稱",60)};if(!f.phone&&!f.mobile&&!f.lineName)throw new Bad("STORE_INVALID","電話、手機或 LINE 名稱至少填寫一項");return f}
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const dateOf=(v:unknown)=>{const d=text(v,"日期",10,true),t=new Date(d+"T00:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==d||d>today())throw new Bad("STORE_INVALID","請選擇有效日期，不可晚於今天");return d};
const money=(v:unknown,name:string)=>{const n=Number(v??0);if(!Number.isSafeInteger(n)||n<0||n>100_000_000)throw new Bad("STORE_INVALID",name+"需為 0 以上的整數");return n};
const body=async(req:Request)=>{const raw=await req.text();if(raw.length>100_000)throw new Bad("STORE_INVALID","資料過大");let b;try{b=JSON.parse(raw)}catch{throw new Bad("STORE_INVALID","請提供有效資料")};if(!b||typeof b!=="object"||Array.isArray(b))throw new Bad("STORE_INVALID","請提供有效資料");return b as Record<string,unknown>};
const audit=(c:Context,type:string,id:number,action:string,after:Record<string,unknown>)=>new AuditService(c.db).prepareRecord({entityType:type,entityKey:String(id),action,actorEmployeeId:c.actor,requestId:c.requestId,after});
const rows=async<T>(db:D1Database,sql:string,...args:unknown[])=>((await db.prepare(sql).bind(...args).all<T>()).results??[]) as T[];
const one=async<T>(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args).first<T>();
function parseLines(v:unknown){
 if(!Array.isArray(v)||!v.length||v.length>50)throw new Bad("STORE_INVALID","訂購需有 1 至 50 個品項");
 return v.map((raw,i)=>{if(!raw||typeof raw!=="object")throw new Bad("STORE_INVALID","品項不正確");const x=raw as Record<string,unknown>,quantity=Number(x.quantity);if(!Number.isFinite(quantity)||quantity<=0||quantity>1_000_000)throw new Bad("STORE_INVALID","第 "+(i+1)+" 個品項數量不正確");return {itemCode:text(x.itemCode,"品號",40),itemName:text(x.itemName,"品名",200,true),quantity,unitPrice:money(x.unitPrice,"單價")}});
}
const dateColumns:Record<StoreMilestone,"ordered_date"|"arrived_date"|"notified_date"|"picked_up_date">={ORDERED:"ordered_date",ARRIVED:"arrived_date",NOTIFIED:"notified_date",PICKED_UP:"picked_up_date"};
const dates=(o:OrderRow)=>Object.fromEntries(STORE_MILESTONES.map(s=>[s,o[dateColumns[s]]]));
function orderJson(o:OrderRow,lines:LineRow[]){const items=lines.filter(l=>l.order_id===o.id).sort((a,b)=>a.sort_order-b.sort_order||a.id-b.id).map(l=>({id:l.id,itemCode:l.item_code,itemName:l.item_name,quantity:l.quantity,unitPrice:l.unit_price}));return {id:o.id,orderDate:o.order_date,customerName:o.customer_name,phone:o.phone,mobile:o.mobile,lineName:o.line_name,deposit:o.deposit,note:o.note,status:o.status,dates:dates(o),hasEverOrdered:!!o.has_ever_ordered,legacy:!!o.legacy,notifiedAt:o.notified_date?o.notified_date+"T00:00:00+08:00":null,cancelReason:o.cancel_reason,version:o.version,createdAt:o.created_at,updatedAt:o.updated_at,lines:items,total:orderTotal(items)}}
const blacklistJson=(b:BlacklistRow)=>({id:b.id,name:b.name,phone:b.phone,mobile:b.mobile,lineName:b.line_name,reason:b.reason,action:b.action,version:b.version,eventCount:b.event_count??0,createdAt:b.created_at,updatedAt:b.updated_at});
async function getOrder(c:Context,id:number){const o=await one<OrderRow>(c.db,"SELECT * FROM store_customer_orders WHERE id=?",id);if(!o)throw new Bad("STORE_NOT_FOUND","訂購不存在",404);return orderJson(o,await rows<LineRow>(c.db,"SELECT * FROM store_customer_order_lines WHERE order_id=?",id))}
function fields(v:Record<string,unknown>){const lines=parseLines(v.lines),total=orderTotal(lines),deposit=money(v.deposit,"訂金");if(deposit>total)throw new Bad("STORE_INVALID","訂金不可超過金額合計");return {orderDate:dateOf(v.orderDate),customerName:text(v.customerName,"顧客姓名",40,true),...contacts(v),deposit,note:text(v.note,"備註",300),lines,total}}
const lineInserts=(c:Context,id:number,lines:ReturnType<typeof parseLines>)=>lines.map((l,i)=>c.db.prepare("INSERT INTO store_customer_order_lines(order_id,sort_order,item_code,item_name,quantity,unit_price) VALUES(?,?,?,?,?,?)").bind(id,(i+1)*10,l.itemCode,l.itemName,l.quantity,l.unitPrice));
const guard=(c:Context,table:"store_customer_orders"|"store_blacklist",id:number,version:number)=>c.db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE id=? AND version=?) THEN 1 ELSE json('') END`).bind(id,version);
const keyOf=(v:Record<string,unknown>)=>{const k=text(v.requestKey,"操作識別",80,true);if(!/^[\w-]{8,80}$/.test(k))throw new Bad("STORE_INVALID","操作識別不正確");return k};
const event=(c:Context,id:number,key:string,kind:string,before:unknown,after:unknown,reason:string)=>c.db.prepare("INSERT INTO store_order_events(order_id,actor,at,kind,before_json,after_json,reason,request_key) VALUES(?,?,?,?,?,?,?,?)").bind(id,c.actor,c.now,kind,JSON.stringify(before),JSON.stringify(after),reason,key);
function reasonOf(v:Record<string,unknown>,allowed:readonly string[]){const kind=text(v.reasonKind,"理由類別",40,true),detail=text(v.reason,"理由補充",240,kind==="其他");if(!allowed.includes(kind))throw new Bad("STORE_INVALID","理由類別不正確");return detail?kind+"："+detail:kind}
const blackSql="SELECT b.*,(SELECT COUNT(*) FROM store_blacklist_events e WHERE e.blacklist_id=b.id) event_count FROM store_blacklist b WHERE b.active=1";
async function contactState(c:Context,f:{phone:string;mobile:string;lineName:string}){
 const all=await rows<BlacklistRow>(c.db,blackSql+" ORDER BY b.id LIMIT 1001");if(all.length>1000)throw new Bad("STORE_LIMIT","黑名單資料過多，請先整理",409);
 const nums=[f.phone,f.mobile].filter(Boolean),matches=all.filter(b=>nums.includes(b.phone)&&!!b.phone||nums.includes(b.mobile)&&!!b.mobile);
 const lineCandidates=f.lineName?all.filter(b=>b.line_name===f.lineName&&!matches.some(m=>m.id===b.id)):[];
 // Guard the exact versioned snapshot at mutation time, including concurrent new matches.
 const snapshot=JSON.stringify(all.map(b=>[b.id,b.version]));
 const check=c.db.prepare("SELECT CASE WHEN (SELECT json_group_array(json_array(id,version)) FROM (SELECT id,version FROM store_blacklist WHERE active=1 ORDER BY id))=? THEN 1 ELSE json('') END").bind(snapshot);
 return {matches,lineCandidates,check};
}
function resolvedMatches(state:Awaited<ReturnType<typeof contactState>>,v:Record<string,unknown>){
 const decisions=Array.isArray(v.lineDecisions)?v.lineDecisions as {id:number;version:number;same:boolean}[]:[];
 for(const b of state.lineCandidates)if(!decisions.some(d=>d.id===b.id&&d.version===b.version&&typeof d.same==="boolean"))throw new Bad("STORE_CONTACT_REVIEW","LINE 名稱可能同名，請核對黑名單候選",409);
 return [...state.matches,...state.lineCandidates.filter(b=>decisions.some(d=>d.id===b.id&&d.same))];
}
function enforceBlacklist(matches:BlacklistRow[],deposit:number,total:number){for(const b of matches){if(b.action==="REFUSE")throw new Bad("STORE_BLACKLIST_REFUSED","黑名單：拒絕訂購。理由："+b.reason,409);if(b.action==="FULL_PAYMENT"&&deposit!==total)throw new Bad("STORE_FULL_PAYMENT_REQUIRED","黑名單：須全額預付，訂金必須等於金額 "+total+" 元。",422)}}
function blacklistFields(v:Record<string,unknown>){const action=text(v.action,"處置",20,true) as StoreBlacklistAction;if(!(STORE_BLACKLIST_ACTIONS as readonly string[]).includes(action))throw new Bad("STORE_INVALID","處置不正確");return {name:text(v.name,"顧客姓名",40,true),...contacts(v),reason:text(v.reason,"理由",300,true),action}}
const blackInsert=(c:Context,id:number,f:ReturnType<typeof blacklistFields>)=>c.db.prepare("INSERT INTO store_blacklist(id,name,phone,mobile,line_name,reason,action,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,f.name,f.phone,f.mobile,f.lineName,f.reason,f.action,c.now,c.actor,c.now,c.actor);
const randomId=()=>Number.parseInt(crypto.randomUUID().replaceAll("-","").slice(0,13),16);
function validateDates(o:OrderRow,step:StoreMilestone,value:string|null,status:StoreOrderStatus=o.status,orderDate=o.order_date){const limit=Math.max(STORE_STEPS.indexOf(status as typeof STORE_STEPS[number]),STORE_STEPS.indexOf(step));let prior=orderDate;for(const s of STORE_MILESTONES){if(STORE_STEPS.indexOf(s)>limit)break;const d=s===step?value:o[dateColumns[s]];if(d){if(d<prior)throw new Bad("STORE_DATE_ORDER","進度日期不可早於前一步日期");prior=d}}}
export async function handleStoreRoute(request:Request,env:IdentityRuntimeEnv,requestId:string):Promise<Response|null>{
 const url=new URL(request.url);if(!url.pathname.startsWith("/api/business/store"))return null;
 const provider=identityClient(env);if(!provider)return failure({code:"IDENTITY_UNAVAILABLE",message:"身分服務無法使用"},requestId,503);
 const gate=await requireModuleAccess(provider,env.DB,request,"STORE_CUSTOMER_ORDERS");if(!gate.ok)return failure({code:gate.code,message:"沒有門市顧客訂購權限"},requestId,gate.status);
 const c:Context={db:env.DB,actor:gate.member.id,now:new Date().toISOString(),requestId};const path=url.pathname.replace(/^\/api\/business\/store\/?/,""),method=request.method;
 try{
  if(path==="orders"&&method==="GET"){
   const status=url.searchParams.get("status");if(status&&!(STORE_ORDER_STATUSES as readonly string[]).includes(status))throw new Bad("STORE_INVALID","狀態不正確");
   const q=(url.searchParams.get("q")??"").trim().slice(0,40),like="%"+q.replace(/[\\%_]/g,m=>"\\"+m)+"%",digits=normalizePhone(q);
   const orders=await rows<OrderRow>(c.db,`SELECT o.* FROM store_customer_orders o WHERE (?='' OR o.status=?) AND (?='' OR o.customer_name LIKE ? ESCAPE '\\' OR o.line_name LIKE ? ESCAPE '\\' OR o.note LIKE ? ESCAPE '\\' OR (?<>'' AND (o.phone LIKE ? OR o.mobile LIKE ?)) OR EXISTS(SELECT 1 FROM store_customer_order_lines l WHERE l.order_id=o.id AND (l.item_code LIKE ? ESCAPE '\\' OR l.item_name LIKE ? ESCAPE '\\'))) ORDER BY o.order_date DESC,o.id DESC LIMIT 501`,status??"",status??"",q,like,like,like,digits,"%"+digits+"%","%"+digits+"%",like,like);
   if(orders.length>500)throw new Bad("STORE_LIMIT","符合的訂購超過 500 筆，請縮小搜尋條件",409);
   const lines=orders.length?await rows<LineRow>(c.db,"SELECT * FROM store_customer_order_lines WHERE order_id IN (SELECT value FROM json_each(?))",JSON.stringify(orders.map(o=>o.id))):[];return success(orders.map(o=>orderJson(o,lines)),requestId);
  }
  if(path==="orders"&&method==="POST"){
   const v=await body(request),f=fields(v),key=keyOf(v);
   const duplicate=await one<{order_id:number}>(c.db,"SELECT order_id FROM store_order_events WHERE kind='建立' AND request_key=? AND actor=?",key,c.actor);if(duplicate)return success(await getOrder(c,duplicate.order_id),requestId);
   const state=await contactState(c,f);enforceBlacklist(resolvedMatches(state,v),f.deposit,f.total);const id=randomId();
   await c.db.batch([state.check,c.db.prepare("INSERT INTO store_customer_orders(id,order_date,customer_name,phone,mobile,line_name,deposit,note,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,f.orderDate,f.customerName,f.phone,f.mobile,f.lineName,f.deposit,f.note,c.now,c.actor,c.now,c.actor),...lineInserts(c,id,f.lines),event(c,id,key,"建立",{},f,""),audit(c,"store_order",id,"store_order.created",{items:f.lines.length})]);return success(await getOrder(c,id),requestId);
  }
  let m=/^orders\/(\d+)(?:\/(status|date|history))?$/.exec(path);
  if(m){
   const id=Number(m[1]),o=await one<OrderRow>(c.db,"SELECT * FROM store_customer_orders WHERE id=?",id);if(!o)throw new Bad("STORE_NOT_FOUND","訂購不存在",404);
   if(method==="GET"&&m[2]==="history"){
    const cursor=Number(url.searchParams.get("cursor")??0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new Bad("STORE_INVALID","紀錄游標不正確");
    const events=await rows<{id:number;actor_name:string;at:string;kind:string;before_json:string;after_json:string;reason:string}>(c.db,"SELECT e.*,m.display_name actor_name FROM store_order_events e JOIN app_members m ON m.id=e.actor WHERE e.order_id=? AND (?=0 OR e.id<?) ORDER BY e.id DESC LIMIT 21",id,cursor,cursor);return success({rows:events.slice(0,20).map(e=>({id:e.id,actorName:e.actor_name,at:e.at,kind:e.kind,before:JSON.parse(e.before_json),after:JSON.parse(e.after_json),reason:e.reason})),nextCursor:events.length>20?events[19].id:null},requestId);
   }
   if(!m[2]&&method==="GET")return success(await getOrder(c,id),requestId);
   if(!((method==="PATCH"&&!m[2])||(method==="POST"&&m[2]==="status")||(method==="PATCH"&&m[2]==="date")))throw new Bad("STORE_INVALID","操作方法不正確");
   const v=await body(request),key=keyOf(v),expected=Number(v.expectedVersion);
   if(await one(c.db,"SELECT id FROM store_order_events WHERE order_id=? AND request_key=? AND actor=?",id,key,c.actor))return success(await getOrder(c,id),requestId);
   if(expected!==o.version)throw new Bad("STORE_VERSION_CONFLICT","已被其他人修改，請重新載入",409);
   const stmts=[guard(c,"store_customer_orders",id,expected)];let kind="",reason="",after:unknown={},before:unknown={};
   if(!m[2]){
    if(o.status==="PICKED_UP"||o.status==="CANCELLED")throw new Bad("STORE_INVALID","已取貨或已取消的訂購不能修改",409);
    const f=fields(v),old=await getOrder(c,id);before={orderDate:old.orderDate,customerName:old.customerName,phone:old.phone,mobile:old.mobile,lineName:old.lineName,deposit:old.deposit,note:old.note,lines:old.lines.map(({id:_,...l})=>l),total:old.total};after=f;
    if(JSON.stringify(before)===JSON.stringify(after))return success(old,requestId);
    reason=o.has_ever_ordered?reasonOf(v,STORE_EDIT_REASONS):"";validateDates(o,"ORDERED",o.ordered_date??f.orderDate,o.status,f.orderDate);
    const state=await contactState(c,f);enforceBlacklist(resolvedMatches(state,v),f.deposit,f.total);stmts.push(state.check,
     c.db.prepare("UPDATE store_customer_orders SET order_date=?,customer_name=?,phone=?,mobile=?,line_name=?,deposit=?,note=?,version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(f.orderDate,f.customerName,f.phone,f.mobile,f.lineName,f.deposit,f.note,c.now,c.actor,id),
     c.db.prepare("DELETE FROM store_customer_order_lines WHERE order_id=?").bind(id),...lineInserts(c,id,f.lines));kind="修改訂購";
   }else if(m[2]==="date"){
    const step=String(v.step) as StoreMilestone;if(!STORE_MILESTONES.includes(step)||o.status==="CANCELLED"||!o[dateColumns[step]]&&STORE_STEPS.indexOf(step)>STORE_STEPS.indexOf(o.status as typeof STORE_STEPS[number]))throw new Bad("STORE_INVALID","此步驟尚未到達或不可修改");
    const d=step==="ORDERED"&&(v.milestoneDate===null||v.milestoneDate==="")?null:dateOf(v.milestoneDate);validateDates(o,step,d);before=dates(o);after={...dates(o),[step]:d};if(o[dateColumns[step]]===d)return success(await getOrder(c,id),requestId);
    stmts.push(c.db.prepare(`UPDATE store_customer_orders SET ${dateColumns[step]}=?,version=version+1,updated_at=?,updated_by=? WHERE id=?`).bind(d,c.now,c.actor,id));kind="更正日期";
   }else{
    const action=v.action;if(o.status==="CANCELLED")throw new Bad("STORE_INVALID","已取消不可再操作",409);const index=STORE_STEPS.indexOf(o.status as typeof STORE_STEPS[number]);let target:StoreOrderStatus=o.status;
    before={status:o.status,dates:dates(o)};
    if(action==="advance"){
     if(index<0||index>=STORE_STEPS.length-1)throw new Bad("STORE_INVALID","沒有下一步");target=STORE_STEPS[index+1];if(v.status&&v.status!==target)throw new Bad("STORE_INVALID","不可跳階");const step=target as StoreMilestone,d=step==="ORDERED"&&(v.milestoneDate==null||v.milestoneDate==="")?null:dateOf(v.milestoneDate);validateDates(o,step,d,target);
     stmts.push(c.db.prepare(`UPDATE store_customer_orders SET status=?,${dateColumns[step]}=?,has_ever_ordered=1,version=version+1,updated_at=?,updated_by=? WHERE id=?`).bind(target,d,c.now,c.actor,id));kind="推進";after={status:target,date:d};
    }else if(action==="rollback"){
     if(index<=0)throw new Bad("STORE_INVALID","無法退回");reason=text(v.reason,"退回理由",300,true);target=STORE_STEPS[index-1];stmts.push(c.db.prepare("UPDATE store_customer_orders SET status=?,version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(target,c.now,c.actor,id));kind="退回";after={status:target,dates:dates(o)};
    }else if(action==="cancel"){
     if(o.status==="PICKED_UP")throw new Bad("STORE_INVALID","結案請先退回後再取消",409);reason=reasonOf(v,STORE_CANCEL_REASONS);const eligible=v.reasonKind==="顧客取消"||v.reasonKind==="其他";
     stmts.push(c.db.prepare("UPDATE store_customer_orders SET status='CANCELLED',cancel_kind=?,cancel_reason=?,version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(v.reasonKind,reason,c.now,c.actor,id));kind="取消";after={status:"CANCELLED"};
     if(eligible){const state=await contactState(c,{phone:o.phone,mobile:o.mobile,lineName:o.line_name}),matches=resolvedMatches(state,v);stmts.push(state.check);let hit:BlacklistRow|undefined;
      if(matches.length===1)hit=matches[0];else if(matches.length>1){hit=matches.find(b=>b.id===Number(v.blacklistId));if(!hit)throw new Bad("STORE_CONTACT_REVIEW","多筆黑名單命中，請選擇本次事件對象",409)}
      let blackId=hit?.id;
      if(!hit&&v.blacklist){if(typeof v.blacklist!=="object")throw new Bad("STORE_INVALID","黑名單不正確");const f=blacklistFields(v.blacklist as Record<string,unknown>);if(f.phone!==o.phone||f.mobile!==o.mobile||f.lineName!==o.line_name)throw new Bad("STORE_INVALID","請先修改訂購聯絡方式再建立黑名單");blackId=randomId();stmts.push(blackInsert(c,blackId,f),audit(c,"store_blacklist",blackId,"store_blacklist.created_from_order",{orderId:id}))}
      if(blackId){const summary=await getOrder(c,id);stmts.push(c.db.prepare("INSERT INTO store_blacklist_events(blacklist_id,order_id,actor,at,reason,summary_json) VALUES(?,?,?,?,?,?)").bind(blackId,id,c.actor,c.now,reason,JSON.stringify({customerName:o.customer_name,orderDate:o.order_date,lines:summary.lines})));after={status:"CANCELLED",blacklistId:blackId,blacklistEvent:"追加訂購原因"}}
     }
    }else throw new Bad("STORE_INVALID","請使用逐步進度操作");
   }
   stmts.push(event(c,id,key,kind,before,after,reason),audit(c,"store_order",id,"store_order.changed",{kind}));await c.db.batch(stmts);return success(await getOrder(c,id),requestId);
  }
  if(path==="blacklist"&&method==="GET")return success((await rows<BlacklistRow>(c.db,blackSql+" ORDER BY b.updated_at DESC,b.id DESC LIMIT 1000")).map(blacklistJson),requestId);
  if(path==="blacklist/check"&&method==="GET"){
   const f={phone:numberOf(url.searchParams.get("phone")),mobile:numberOf(url.searchParams.get("mobile")),lineName:text(url.searchParams.get("lineName"),"LINE 名稱",60)},state=await contactState(c,f);return success({matches:state.matches.map(blacklistJson),lineCandidates:state.lineCandidates.map(blacklistJson)},requestId);
  }
  if(path==="blacklist"&&method==="POST"){
   const v=await body(request),f=blacklistFields(v),state=await contactState(c,f);if(resolvedMatches(state,v).length)throw new Bad("STORE_DUPLICATE","此顧客已在黑名單，請修改既有資料",409);const id=randomId();await c.db.batch([state.check,blackInsert(c,id,f),audit(c,"store_blacklist",id,"store_blacklist.created",{action:f.action})]);return success({id},requestId);
  }
  m=/^blacklist\/(\d+)(?:\/(history))?$/.exec(path);
  if(m){const id=Number(m[1]),b=await one<BlacklistRow>(c.db,"SELECT * FROM store_blacklist WHERE id=? AND active=1",id);if(!b)throw new Bad("STORE_NOT_FOUND","黑名單不存在",404);
   if(m[2]&&method==="GET"){
    const cursor=Number(url.searchParams.get("cursor")??0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new Bad("STORE_INVALID","紀錄游標不正確");const events=await rows<{id:number;at:string;reason:string;order_id:number;summary_json:string;actor_name:string}>(c.db,"SELECT e.*,m.display_name actor_name FROM store_blacklist_events e JOIN app_members m ON m.id=e.actor WHERE e.blacklist_id=? AND (?=0 OR e.id<?) ORDER BY e.id DESC LIMIT 21",id,cursor,cursor);return success({rows:events.slice(0,20).map(e=>({id:e.id,at:e.at,kind:"訂購取消",actorName:e.actor_name,reason:e.reason,before:{},after:{orderId:e.order_id,...JSON.parse(e.summary_json)}})),nextCursor:events.length>20?events[19].id:null},requestId);
   }
   const v=await body(request);if(Number(v.expectedVersion)!==b.version)throw new Bad("STORE_VERSION_CONFLICT","黑名單已被修改，請重新載入",409);
   const stmts=[guard(c,"store_blacklist",id,b.version)];if(method==="DELETE")stmts.push(c.db.prepare("UPDATE store_blacklist SET active=0,version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(c.now,c.actor,id));
   else if(method==="PATCH"){
    const f=blacklistFields(v),state=await contactState(c,f);if(resolvedMatches({...state,lineCandidates:state.lineCandidates.filter(m=>m.id!==id)},v).some(m=>m.id!==id))throw new Bad("STORE_DUPLICATE","此聯絡方式已在其他黑名單",409);const reason=text(v.changeReason,"修改處置理由",300,f.action!==b.action);stmts.push(state.check,c.db.prepare("UPDATE store_blacklist SET name=?,phone=?,mobile=?,line_name=?,reason=?,action=?,version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(f.name,f.phone,f.mobile,f.lineName,f.reason,f.action,c.now,c.actor,id),audit(c,"store_blacklist",id,"store_blacklist.updated",{from:b.action,to:f.action,reason}));
   }else throw new Bad("STORE_INVALID","操作方法不正確");
   stmts.push(audit(c,"store_blacklist",id,method==="DELETE"?"store_blacklist.removed":"store_blacklist.saved",{}));await c.db.batch(stmts);return success({saved:true},requestId);
  }
  if(path==="item"&&method==="GET")return success(await one(c.db,"SELECT item_name,unit FROM erp_sales_items WHERE item_code=? LIMIT 1",text(url.searchParams.get("itemCode"),"品號",40,true)),requestId);
  return failure({code:"NOT_FOUND",message:"找不到門市功能"},requestId,404);
 }catch(e){if(e instanceof Bad)return failure({code:e.code,message:e.message},requestId,e.status);if(String(e).includes("malformed JSON")||String(e).includes("UNIQUE constraint"))return failure({code:"STORE_VERSION_CONFLICT",message:"資料已變更或操作已送出，請重新載入",},requestId,409);return failure({code:"STORE_UNAVAILABLE",message:"門市操作失敗"},requestId,500)}
}
