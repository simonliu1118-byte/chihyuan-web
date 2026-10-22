import {requireModuleAccess} from "../auth/guard";
import {identityClient,type IdentityRuntimeEnv} from "./auth-routes";
import {success,failure} from "./response";
import {AuditService} from "../audit/audit-service";
import {lineIsOpen,lineState,orderStatus,orderingLineHasName,parseErpPurchaseNo,parseQuantity,pickDraft,vendorItemKey,type OrderingStoredStatus} from "../../shared/ordering";

type Context={db:D1Database;actor:number;name:string;now:string;requestId:string};
type Source={id:number;name:string;kind:"GENERAL"|"VENDOR"|"CN_REGULAR"|"CN_CUSTOM";conditions:string;sort_order:number;is_active:number};
type Ord={id:number;source_id:number;status:OrderingStoredStatus;planned_send_date:string|null;sent_at:string|null;note:string;version:number;revision:number;created_at:string;updated_at:string};
type Line={id:number;order_id:number;section:string;sort_order:number;item_code:string;item_name:string;vendor_item_code:string;vendor_item_name:string;vendor_name_follows:number;spec:string;quantity_text:string;quantity:number|null;unit:string;note:string;closed_as:"SHORTAGE"|"CANCELLED"|"OTHER"|null;closed_note:string;received:number};
const defaults:[string,Source["kind"],string][]=[
 ["台北","GENERAL",""],["台中","GENERAL",""],["洲美","GENERAL",""],
 ["定期中國貨","CN_REGULAR",""],["自訂中國貨","CN_CUSTOM",""],
 ["永全","VENDOR",""],["嘉品","VENDOR",""],["其他","VENDOR",""],
 ["坤日","VENDOR","網套最少30包／彈繃最少20包"],["東昇","VENDOR","滿$5000免運費"],
 ["長生堂","VENDOR","最低訂貨12罐"],["興基達","VENDOR","滿$5000免運費"],
 ["知音","VENDOR","滿$2000免運費"],["天德","VENDOR","舒軟最少3箱"],
 ["育德","VENDOR","滿$4000免運費"],["宏大","VENDOR","滿$3000/自取免運費"],
 ["宇晶","VENDOR","最少一件"],["大立信","VENDOR","最少10000支"],
 ["愛民","VENDOR","滿$3500免運"],["綠薰舒","VENDOR","20罐大罐出貨"],
 ["老謝","VENDOR",""],["小東","VENDOR","要提醒發票"]
];
class Bad extends Error{constructor(public code:string,message:string,public status=422){super(message)}}
const must=(v:unknown,n:string,max=200)=>{if(typeof v!=="string"||v.trim().length>max)throw new Bad("ORDERING_INVALID",n+"不正確");return v.trim()};
const int=(v:unknown,n:string)=>{if(!Number.isSafeInteger(v)||Number(v)<1)throw new Bad("ORDERING_INVALID",n+"不正確");return Number(v)};
const date=(v:unknown)=>{const d=must(v,"日期",10),t=new Date(d+"T00:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==d)throw new Bad("ORDERING_INVALID","日期無效");return d};
const body=async(req:Request)=>{const b=await req.json().catch(()=>null);if(!b||typeof b!=="object"||Array.isArray(b))throw new Bad("ORDERING_INVALID","請提供有效資料");return b as Record<string,unknown>};
const audit=(ctx:Context,id:number,action:string,after:Record<string,unknown>)=>new AuditService(ctx.db).prepareRecord({entityType:"ordering",entityKey:String(id),action:"ordering."+action,actorEmployeeId:ctx.actor,requestId:ctx.requestId,after});
const rows=async<T>(db:D1Database,sql:string,...args:unknown[])=>((await db.prepare(sql).bind(...args).all<T>()).results??[]) as T[];
const one=async<T>(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args).first<T>();
const run=async(ctx:Context,stmts:D1PreparedStatement[])=>{await ctx.db.batch(stmts)};
async function init(ctx:Context){
 const n=await one<{n:number}>(ctx.db,"SELECT COUNT(*) AS n FROM ordering_sources");
 if(n?.n)return;
 // INSERT OR IGNORE preserves concurrent first-open and is idempotent.
 await run(ctx,defaults.map(([name,kind,conditions],i)=>ctx.db.prepare("INSERT OR IGNORE INTO ordering_sources(name,kind,conditions,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(name,kind,conditions,i,ctx.now,ctx.now)));
}
async function getOrder(ctx:Context,id:number,knownOrder?:Ord){
 const o=knownOrder??await one<Ord>(ctx.db,"SELECT * FROM ordering_orders WHERE id=?",id);if(!o)throw new Bad("ORDERING_NOT_FOUND","叫貨單不存在",404);
 const draft=o.status==="DRAFT";
 const [source,lines,receipts,changes]=await Promise.all([
  one<Source>(ctx.db,"SELECT * FROM ordering_sources WHERE id=?",o.source_id),
  rows<Line>(ctx.db,"SELECT l.*,"+(draft?"0":"COALESCE((SELECT SUM(quantity) FROM ordering_receipt_lines WHERE line_id=l.id),0)")+" received FROM ordering_lines l WHERE order_id=? ORDER BY section,sort_order,id LIMIT 501",id),
  draft?Promise.resolve([]):rows<{id:number;erp_purchase_no:string;received_date:string;created_at:string}>(ctx.db,"SELECT * FROM ordering_receipts WHERE order_id=? ORDER BY id DESC LIMIT 101",id),
  draft?Promise.resolve([]):rows<{revision:number;changed_at:string;changed_by:number;actor_name:string|null;summary:string}>(ctx.db,"SELECT r.revision,r.changed_at,r.changed_by,COALESCE(m.display_name,m.employee_no) AS actor_name,r.summary FROM ordering_revisions r LEFT JOIN app_members m ON m.id=r.changed_by WHERE r.order_id=? ORDER BY r.revision DESC LIMIT 501",id),
 ]);
 if(lines.length>500)throw new Bad("ORDERING_LIMIT","單據超過 500 列",409);
 if(receipts.length>100)throw new Bad("ORDERING_LIMIT","到貨記錄超過上限",409);
 if(changes.length>500)throw new Bad("ORDERING_LIMIT","修改紀錄超過單次查詢安全上限",409);
 const receiptIds=receipts.map(x=>x.id);
 const receiptLines=receiptIds.length?await rows<{receipt_id:number;line_id:number;quantity:number}>(ctx.db,"SELECT receipt_id,line_id,quantity FROM ordering_receipt_lines WHERE receipt_id IN ("+receiptIds.map(()=>"?").join(",")+") ORDER BY receipt_id,line_id LIMIT 5001",...receiptIds):[];
 if(receiptLines.length>5000)throw new Bad("ORDERING_LIMIT","到貨明細超過單次查詢安全上限",409);
 return {id:o.id,sourceId:o.source_id,sourceName:source?.name??"",sourceKind:source?.kind??"GENERAL",status:orderStatus(o.status,lines.map(x=>({quantity:x.quantity,received:x.received,closedAs:x.closed_as}))),
  storedStatus:o.status,plannedSendDate:o.planned_send_date,sentAt:o.sent_at,note:o.note,version:o.version,revision:o.revision,createdAt:o.created_at,
  lines:lines.map(x=>({id:x.id,section:x.section,sortOrder:x.sort_order,itemCode:x.item_code,itemName:x.item_name,vendorItemCode:x.vendor_item_code,vendorItemName:x.vendor_item_name,vendorNameFollows:!!x.vendor_name_follows,spec:x.spec,quantityText:x.quantity_text,quantity:x.quantity,unit:x.unit,note:x.note,closedAs:x.closed_as,closedNote:x.closed_note,received:x.received,state:lineState({quantity:x.quantity,received:x.received,closedAs:x.closed_as})})),receipts:receipts.map(x=>({id:x.id,erpPurchaseNo:x.erp_purchase_no,receivedDate:x.received_date,createdAt:x.created_at,createdBy:"",lines:receiptLines.filter(l=>l.receipt_id===x.id).map(l=>({lineId:l.line_id,quantity:l.quantity}))})),
  revisions:changes.map(x=>({revision:x.revision,at:x.changed_at,by:x.actor_name??String(x.changed_by),summary:x.summary}))};
}
async function mutate(ctx:Context,o:Ord,expected:number,stmts:D1PreparedStatement[],summary:string,action:string,onBatchSuccess?:()=>void){
 if(o.version!==expected)throw new Bad("ORDERING_VERSION_CONFLICT","已被其他人修改，請重新載入",409);
 const sent=o.status==="SENT",revision=o.revision+(sent?1:0);
 const guard=ctx.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM ordering_orders WHERE id=? AND version=? AND status=?) THEN 1 ELSE json('') END AS match").bind(o.id,expected,o.status);
 const bump=ctx.db.prepare("UPDATE ordering_orders SET version=version+1,revision=?,updated_at=?,updated_by=? WHERE id=? AND version=?").bind(revision,ctx.now,ctx.actor,o.id,expected);
 const stm=[guard,...stmts,bump];
 if(sent)stm.push(ctx.db.prepare("INSERT INTO ordering_revisions(order_id,revision,changed_at,changed_by,summary) VALUES(?,?,?,?,?)").bind(o.id,revision,ctx.now,ctx.actor,summary.slice(0,500)));
 stm.push(audit(ctx,o.id,action,{summary,revision,version:expected+1}));
 try{await run(ctx,stm)}catch(e){if(o.version!==expected||String(e).includes("UNIQUE")||String(e).includes("malformed JSON"))throw new Bad("ORDERING_VERSION_CONFLICT","已被其他人修改，請重新載入",409);throw e}
 onBatchSuccess?.(); // The D1 batch committed: distinguish subsequent readback failure from failed persistence.
 return getOrder(ctx,o.id);
}
const currentStatusSql=`CASE WHEN o.status<>'SENT' THEN o.status
 WHEN EXISTS(SELECT 1 FROM ordering_lines l WHERE l.order_id=o.id)
  AND NOT EXISTS(SELECT 1 FROM ordering_lines l WHERE l.order_id=o.id AND l.closed_as IS NULL
   AND (l.quantity IS NULL OR COALESCE((SELECT SUM(rl.quantity) FROM ordering_receipt_lines rl WHERE rl.line_id=l.id),0)<l.quantity))
 THEN 'CLOSED'
 WHEN EXISTS(SELECT 1 FROM ordering_lines l WHERE l.order_id=o.id AND
  (l.closed_as IS NOT NULL OR EXISTS(SELECT 1 FROM ordering_receipt_lines rl WHERE rl.line_id=l.id)))
 THEN 'PARTIAL' ELSE 'SENT' END`;
export async function handleOrderingRoute(request:Request,env:IdentityRuntimeEnv,requestId:string):Promise<Response|null>{
 const url=new URL(request.url);if(!url.pathname.startsWith("/api/business/ordering"))return null;
 const provider=identityClient(env);if(!provider)return failure({code:"IDENTITY_UNAVAILABLE",message:"身分服務無法使用"},requestId,503);
 const gate=await requireModuleAccess(provider,env.DB,request,"ORDERING");
 if(!gate.ok)return failure({code:gate.code,message:"沒有叫貨權限"},requestId,gate.status);
 const ctx:Context={db:env.DB,actor:gate.member.id,name:gate.member.displayName??gate.member.employeeNo??"使用者",now:new Date().toISOString(),requestId};
 const path=url.pathname.replace(/^\/api\/business\/ordering\/?/,""),method=request.method;
 // Receipt requests track the commit/readback boundary; no retry or extra database query is introduced.
 const receiptPhase:{value:"preflight"|"persist"|"readback"|null}={value:/^orders\/\d+\/receipts$/.test(path)&&method==="POST"?"preflight":null};
 try{
  if(path==="sources"&&method==="GET"){await init(ctx);const items=await rows<Source>(ctx.db,"SELECT * FROM ordering_sources ORDER BY sort_order,id LIMIT 101");if(items.length>100)throw new Bad("ORDERING_LIMIT","來源超過100筆",409);return success(items.map(x=>({id:x.id,name:x.name,kind:x.kind,conditions:x.conditions,sortOrder:x.sort_order,isActive:!!x.is_active})),requestId)}
  if(path==="sources"&&method==="POST"){
   const v=await body(request),name=must(v.name,"來源",40),kind=v.kind==="VENDOR"?"VENDOR":"GENERAL";
   const result=await ctx.db.prepare("INSERT INTO ordering_sources(name,kind,conditions,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(name,kind,must(v.conditions??"","條件",500),Number(v.sortOrder??100),ctx.now,ctx.now).run();
   await run(ctx,[audit(ctx,Number(result.meta.last_row_id),"source_created",{name,kind})]);
   return success({id:Number(result.meta.last_row_id)},requestId);
  }
  let m=/^sources\/(\d+)$/.exec(path);
  if(m&&method==="PATCH"){const v=await body(request),id=int(Number(m[1]),"來源");const stm:string[]=[],args:unknown[]=[];
   for(const [key,col,max] of [["name","name",40],["conditions","conditions",500]] as const)if(key in v){stm.push(col+"=?");args.push(must(v[key],col,max))}
   if("sortOrder" in v){stm.push("sort_order=?");args.push(Number(v.sortOrder))}
   if("isActive" in v){stm.push("is_active=?");args.push(v.isActive?1:0)}
   if(!stm.length)throw new Bad("ORDERING_INVALID","沒有變更");
   const changed=await ctx.db.prepare("UPDATE ordering_sources SET "+stm.join(",")+",updated_at=? WHERE id=?").bind(...args,ctx.now,id).run();
   if(!changed.meta.changes)throw new Bad("ORDERING_NOT_FOUND","來源不存在",404);
   await run(ctx,[audit(ctx,id,"source_updated",{fields:stm})]);return success({saved:true},requestId);
  }
  if(path==="vendors/overview"&&method==="GET"){
   await init(ctx);
   const sources=await rows<Source>(ctx.db,"SELECT * FROM ordering_sources WHERE kind='VENDOR' AND is_active=1 ORDER BY sort_order,id LIMIT 101");
   if(sources.length>100)throw new Bad("ORDERING_LIMIT","廠商數量超過上限",409);
   const orders=await rows<{id:number;source_id:number;planned_send_date:string|null;created_at:string;version:number}>(ctx.db,
    "SELECT o.id,o.source_id,o.planned_send_date,o.created_at,o.version FROM ordering_orders o JOIN ordering_sources s ON s.id=o.source_id WHERE o.status='DRAFT' AND s.kind='VENDOR' AND s.is_active=1 ORDER BY o.id DESC LIMIT 501");
   if(orders.length>500)throw new Bad("ORDERING_LIMIT","廠商草稿超過500張",409);
   const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
   const selection=sources.map(s=>({source:s,order:pickDraft(orders.filter(o=>o.source_id===s.id).map(o=>({id:o.id,plannedSendDate:o.planned_send_date,createdAt:o.created_at})),today)}));
   const ids=selection.map(x=>x.order?.id).filter((x):x is number=>typeof x==="number");
   const lines=ids.length?await rows<Line>(ctx.db,
    "SELECT l.*,0 received FROM ordering_lines l WHERE l.order_id IN ("+ids.map(()=>"?").join(",")+") ORDER BY l.order_id,l.section,l.sort_order,l.id LIMIT 2501",...ids):[];
   if(lines.length>2500)throw new Bad("ORDERING_LIMIT","廠商合併明細超過2500列",409);
   return success(selection.map(x=>({sourceId:x.source.id,sourceName:x.source.name,conditions:x.source.conditions,orderId:x.order?.id??null,orderVersion:orders.find(o=>o.id===x.order?.id)?.version??null,
    lines:lines.filter(l=>l.order_id===x.order?.id).map(l=>({id:l.id,section:l.section,sortOrder:l.sort_order,itemCode:l.item_code,itemName:l.item_name,vendorItemCode:l.vendor_item_code,vendorItemName:l.vendor_item_name,spec:l.spec,quantityText:l.quantity_text,quantity:l.quantity,unit:l.unit,note:l.note}))})),requestId);
  }
  if(path==="orders"&&method==="GET"){
   const clauses:string[]=[],args:unknown[]=[];
   if(url.searchParams.has("sourceId")){clauses.push("o.source_id=?");args.push(int(Number(url.searchParams.get("sourceId")),"來源"))}
   if(url.searchParams.has("status")){const status=must(url.searchParams.get("status"),"狀態",20);if(!["DRAFT","SENT","PARTIAL","CLOSED","VOID"].includes(status))throw new Bad("ORDERING_INVALID","狀態錯誤");clauses.push("("+currentStatusSql+")=?");args.push(status)}
   // history=1: the 叫貨紀錄 list, which shows sent and voided orders only (drafts live on the source tabs).
   if(url.searchParams.get("history")==="1")clauses.push("o.status<>'DRAFT'");
   if(url.searchParams.has("from")){clauses.push("COALESCE(o.planned_send_date,substr(o.created_at,1,10))>=?");args.push(date(url.searchParams.get("from")))}
   if(url.searchParams.has("to")){clauses.push("COALESCE(o.planned_send_date,substr(o.created_at,1,10))<=?");args.push(date(url.searchParams.get("to")))}
   const q=must(url.searchParams.get("q")??"","搜尋",100);if(q){clauses.push("(s.name LIKE ? OR EXISTS(SELECT 1 FROM ordering_lines l WHERE l.order_id=o.id AND (l.item_name LIKE ? OR l.item_code LIKE ? OR l.vendor_item_name LIKE ? OR l.vendor_item_code LIKE ?)) OR EXISTS(SELECT 1 FROM ordering_receipts r WHERE r.order_id=o.id AND r.erp_purchase_no LIKE ?))");for(let i=0;i<6;i++)args.push("%"+q+"%")}
   const result=await rows<Ord&{source_name:string;source_kind:Source["kind"];current_status:string}>(ctx.db,"SELECT o.*,s.name AS source_name,s.kind AS source_kind,("+currentStatusSql+") AS current_status FROM ordering_orders o JOIN ordering_sources s ON s.id=o.source_id "+(clauses.length?"WHERE "+clauses.join(" AND "):"")+" ORDER BY o.created_at DESC,o.id DESC LIMIT 201",...args);
   if(result.length>200)throw new Bad("ORDERING_LIMIT","請縮小搜尋條件",409);
   return success(result.map(x=>({id:x.id,sourceId:x.source_id,sourceName:x.source_name,sourceKind:x.source_kind,status:x.current_status,plannedSendDate:x.planned_send_date,sentAt:x.sent_at,createdAt:x.created_at,version:x.version})),requestId);
  }
  if(path==="orders"&&method==="POST"){
   const v=await body(request),sourceId=int(v.sourceId,"來源");
   const source=await one<Source>(ctx.db,"SELECT * FROM ordering_sources WHERE id=? AND is_active=1",sourceId);if(!source)throw new Bad("ORDERING_INVALID","來源不存在或已停用");
   const planned=v.plannedSendDate?date(v.plannedSendDate):null;
   const row=await ctx.db.prepare("INSERT INTO ordering_orders(source_id,planned_send_date,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?)").bind(sourceId,planned,ctx.now,ctx.actor,ctx.now,ctx.actor).run();
   await run(ctx,[audit(ctx,Number(row.meta.last_row_id),"created",{sourceId})]);return success(await getOrder(ctx,Number(row.meta.last_row_id)),requestId);
  }
  if(path==="pending"&&method==="GET"){
   const all=await rows<{order_id:number;id:number;item_code:string;item_name:string;vendor_item_name:string;quantity:number|null;unit:string;closed_as:string|null;received:number;source_name:string;order_date:string}>(ctx.db,
    "SELECT l.id,l.order_id,l.item_code,l.item_name,l.vendor_item_name,l.quantity,l.unit,l.closed_as,COALESCE((SELECT SUM(quantity) FROM ordering_receipt_lines rl WHERE rl.line_id=l.id),0) received,s.name source_name,COALESCE(o.planned_send_date,substr(o.created_at,1,10)) order_date FROM ordering_lines l JOIN ordering_orders o ON o.id=l.order_id JOIN ordering_sources s ON s.id=o.source_id WHERE o.status='SENT' AND l.closed_as IS NULL ORDER BY o.sent_at DESC,l.id DESC LIMIT 1501");
   const result=all.filter(x=>x.quantity!==null&&x.received<x.quantity);
   if(all.length>1500)throw new Bad("ORDERING_LIMIT","未到貨查詢超過安全上限",409);
   return success(result.map(x=>({orderId:x.order_id,lineId:x.id,itemCode:x.item_code,itemName:x.item_name,vendorItemName:x.vendor_item_name,sourceName:x.source_name,orderDate:x.order_date,quantity:x.quantity,unit:x.unit,received:x.received,remaining:(x.quantity??0)-x.received})),requestId);
  }
  if(path==="vendor-memory"&&method==="GET"){
   const sourceId=int(Number(url.searchParams.get("sourceId")),"來源"),key=vendorItemKey(url.searchParams.get("itemCode")??"",url.searchParams.get("itemName")??"");if(!key)return success(null,requestId);
   return success(await one(ctx.db,"SELECT vendor_item_code,vendor_item_name FROM ordering_vendor_items WHERE source_id=? AND key_type=? AND item_key=?",sourceId,key.type,key.key),requestId);
  }
  if(path==="last-source"&&method==="GET")return success(await one(ctx.db,"SELECT source_id FROM ordering_item_last_source WHERE item_code=?",must(url.searchParams.get("itemCode"),"品號",40)),requestId);
  if(path==="last-source"&&method==="POST"){
   const v=await body(request),code=must(v.itemCode,"品號",40),sourceId=int(v.sourceId,"來源");
   if(!code||!await one(ctx.db,"SELECT id FROM ordering_sources WHERE id=? AND is_active=1",sourceId))throw new Bad("ORDERING_INVALID","無法記錄來源");
   await ctx.db.prepare("INSERT INTO ordering_item_last_source(item_code,source_id,updated_at) VALUES(?,?,?) ON CONFLICT(item_code) DO UPDATE SET source_id=excluded.source_id,updated_at=excluded.updated_at").bind(code,sourceId,ctx.now).run();
   return success({saved:true},requestId);
  }
  if(path==="item"&&method==="GET"){
   const code=must(url.searchParams.get("itemCode"),"品號",40);
   return success(await one(ctx.db,"SELECT item_name,unit FROM erp_sales_items WHERE item_code=? LIMIT 1",code),requestId);
  }
  m=/^orders\/(\d+)(?:\/(.*))?$/.exec(path);
  if(m){const id=int(Number(m[1]),"單據"),action=m[2]??"",o=await one<Ord>(ctx.db,"SELECT * FROM ordering_orders WHERE id=?",id);if(!o)throw new Bad("ORDERING_NOT_FOUND","叫貨單不存在",404);
   if(!action&&method==="GET")return success(await getOrder(ctx,id,o),requestId);
   const v=await body(request),expected=int(v.expectedVersion,"版本");if(expected!==o.version)throw new Bad("ORDERING_VERSION_CONFLICT","已被其他人修改，請重新載入",409);
   if(!action&&method==="PATCH"){
    if(o.status==="VOID")throw new Bad("ORDERING_INVALID","單據已作廢");
    const sets:string[]=[],vals:unknown[]=[],history:string[]=[];
    if("plannedSendDate" in v){
     const next=v.plannedSendDate?date(v.plannedSendDate):null;
     if(next!==o.planned_send_date){sets.push("planned_send_date=?");vals.push(next);
      history.push("預計送出日期 "+(o.planned_send_date??"空白")+" → "+(next??"空白"))}
    }
    if("note" in v){
     const next=must(v.note,"備註",300);
     if(next!==o.note){sets.push("note=?");vals.push(next);history.push("備註 "+(o.note||"空白")+" → "+(next||"空白"))}
    }
    if(!sets.length)return success(await getOrder(ctx,id),requestId);
    return success(await mutate(ctx,o,expected,[ctx.db.prepare("UPDATE ordering_orders SET "+sets.join(",")+" WHERE id=?").bind(...vals,id)],history.join("、"),"updated"),requestId);
   }
   if(action==="send"&&method==="POST"){
    if(o.status!=="DRAFT")throw new Bad("ORDERING_INVALID","只有草稿能送出");
    const lines=await rows<Line>(ctx.db,"SELECT * FROM ordering_lines WHERE order_id=? LIMIT 501",id);
    const source=await one<Source>(ctx.db,"SELECT * FROM ordering_sources WHERE id=?",o.source_id);
    if(!lines.length||lines.some(x=>!orderingLineHasName(source?.kind??"GENERAL",{itemName:x.item_name,vendorItemName:x.vendor_item_name})||!x.quantity_text.trim()))throw new Bad("ORDERING_INVALID","品名（一般／廠商來源亦可填廠商品名）、數量必填，至少需要一列");
    const guard=ctx.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM ordering_orders WHERE id=? AND version=? AND status='DRAFT') THEN 1 ELSE json('') END").bind(id,expected);
    await run(ctx,[guard,ctx.db.prepare("UPDATE ordering_orders SET status='SENT',sent_at=?,sent_by=?,revision=1,version=version+1,updated_at=? WHERE id=? AND version=?").bind(ctx.now,ctx.actor,ctx.now,id,expected),audit(ctx,id,"sent",{sourceId:o.source_id,items:lines.length})]);
    return success(await getOrder(ctx,id),requestId);
   }
   if(action==="void"&&method==="POST"){
    if(o.status==="VOID")throw new Bad("ORDERING_INVALID","已作廢");
    return success(await mutate(ctx,o,expected,[ctx.db.prepare("UPDATE ordering_orders SET status='VOID' WHERE id=?").bind(id)],"單據作廢","voided"),requestId);
   }
   if(action==="lines"&&method==="POST"){
    if(o.status==="VOID")throw new Bad("ORDERING_INVALID","已作廢");
    const input=String(v.operation??"save"),lineId=v.lineId?int(v.lineId,"明細"):null;
    let old:Line|null=null;if(lineId){old=await one<Line>(ctx.db,"SELECT * FROM ordering_lines WHERE id=? AND order_id=?",lineId,id);if(!old)throw new Bad("ORDERING_NOT_FOUND","找不到明細",404)}
    if(input==="delete"){if(!old)throw new Bad("ORDERING_INVALID","沒有選擇明細");
     const received=await one<{n:number}>(ctx.db,"SELECT COUNT(*) n FROM ordering_receipt_lines WHERE line_id=?",old.id);
     if(received?.n)throw new Bad("ORDERING_INVALID","已有到貨，不能刪除明細");
     return success(await mutate(ctx,o,expected,[ctx.db.prepare("DELETE FROM ordering_lines WHERE id=? AND order_id=?").bind(old.id,id)],(old.item_name||old.vendor_item_name)+" 刪除明細","line_deleted"),requestId);
    }
    const raw=(v.line??{}) as Record<string,unknown>;
    const field=(key:string,fallback:string,max:number)=>key in raw?must(raw[key],key,max):fallback;
    const itemCode=field("itemCode",old?.item_code??"",40),itemName=field("itemName",old?.item_name??"",200);
    const qt=field("quantityText",old?.quantity_text??"",40);
    if(!qt)throw new Bad("ORDERING_INVALID","數量必填");
    if(!old){const total=await one<{n:number}>(ctx.db,"SELECT COUNT(*) n FROM ordering_lines WHERE order_id=?",id);
     if((total?.n??0)>=500)throw new Bad("ORDERING_LIMIT","單張叫貨單最多 500 列",409);
    }
    const parsed=parseQuantity(qt);let unit=field("unit",old?.unit??"",10);if(!unit)unit=parsed.unit;
    // ERP lookup fills only missing values. Typed values always win.
    let finalName=itemName;
    if(itemCode&&(!finalName||!unit)){
     const erp=await one<{item_name:string;unit:string}>(ctx.db,"SELECT item_name,unit FROM erp_sales_items WHERE item_code=?",itemCode);
     if(!finalName)finalName=erp?.item_name??"";if(!unit)unit=erp?.unit??"";
    }
    const source=await one<Source>(ctx.db,"SELECT * FROM ordering_sources WHERE id=?",o.source_id);
    const section=source?.kind==="CN_REGULAR"?String(raw.section??old?.section??"OTHER"):"";
    if(!["","SINGLE","BAG","OTHER"].includes(section))throw new Bad("ORDERING_INVALID","區段不正確");
    // Empty draft fields are never treated as manually-entered vendor names.
    const manuallyNamed="vendorItemName" in raw&&String(raw.vendorItemName??"").trim().length>0;
    const remembered=vendorItemKey(itemCode,finalName);
    const memory=remembered?await one<{vendor_item_code:string;vendor_item_name:string}>(ctx.db,"SELECT vendor_item_code,vendor_item_name FROM ordering_vendor_items WHERE source_id=? AND key_type=? AND item_key=?",o.source_id,remembered.type,remembered.key):null;
    const vendorNameFollows=manuallyNamed?false:old?old.vendor_name_follows!==0:!memory?.vendor_item_name;
    const manualVendorCode="vendorItemCode" in raw&&String(raw.vendorItemCode??"").trim().length>0;
    const vendorItemName=vendorNameFollows?finalName:manuallyNamed?must(raw.vendorItemName,"vendorItemName",200):old?.vendor_item_name||memory?.vendor_item_name||finalName;
    if(!orderingLineHasName(source?.kind??"GENERAL",{itemName:finalName,vendorItemName}))throw new Bad("ORDERING_INVALID",source?.kind==="CN_REGULAR"||source?.kind==="CN_CUSTOM"?"請填寫品名及數量":"請填寫品名或廠商品名，以及數量");
    const vendorCode=manualVendorCode?must(raw.vendorItemCode,"vendorItemCode",200):old?.vendor_item_code||memory?.vendor_item_code||"";
    const spec=field("spec",old?.spec??"",200),note=field("note",old?.note??"",300);
    const sortOrder=Number(raw.sortOrder??old?.sort_order??Date.now());if(!Number.isSafeInteger(sortOrder)||sortOrder<0)throw new Bad("ORDERING_INVALID","排序不正確");
    const fields=[section,sortOrder,itemCode,finalName,vendorCode,vendorItemName,vendorNameFollows?1:0,spec,qt,parsed.quantity,unit,note];
    const sql=old?"UPDATE ordering_lines SET section=?,sort_order=?,item_code=?,item_name=?,vendor_item_code=?,vendor_item_name=?,vendor_name_follows=?,spec=?,quantity_text=?,quantity=?,unit=?,note=? WHERE id=? AND order_id=?":
      "INSERT INTO ordering_lines(section,sort_order,item_code,item_name,vendor_item_code,vendor_item_name,vendor_name_follows,spec,quantity_text,quantity,unit,note,id,order_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    const savedLineId=old?.id??Number.parseInt(crypto.randomUUID().replaceAll("-","").slice(0,13),16);
    const stmt=ctx.db.prepare(sql).bind(...fields,savedLineId,id);
    const oldKeys:Record<string,string>={itemCode:"item_code",itemName:"item_name",quantityText:"quantity_text",unit:"unit",vendorItemCode:"vendor_item_code",vendorItemName:"vendor_item_name",sortOrder:"sort_order",spec:"spec",section:"section",note:"note"};
    const labels:Record<string,string>={itemCode:"品號",itemName:"品名",quantityText:"數量",unit:"單位",vendorItemCode:"廠商品號",vendorItemName:"廠商品名",sortOrder:"排序",spec:"規格",section:"分類",note:"備註"};
    const updates=Object.entries(raw).filter(([key,value])=>key in oldKeys&&String(old?.[oldKeys[key] as keyof Line]??"")!==String(value??""));
    const summary=(old?.item_name||finalName||vendorItemName)+" "+(!old?"新增":updates.length?updates.map(([key,value])=>labels[key]+" "+String(old?.[oldKeys[key] as keyof Line]??"")+" → "+String(value)).join("、"):"編輯");
    const stmts:D1PreparedStatement[]=[stmt];
    if((String(raw.vendorItemCode??"").trim()||manuallyNamed)&&vendorItemKey(itemCode,finalName)){
     const key=vendorItemKey(itemCode,finalName)!;
     stmts.push(ctx.db.prepare("INSERT INTO ordering_vendor_items(source_id,key_type,item_key,vendor_item_code,vendor_item_name,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_id,key_type,item_key) DO UPDATE SET vendor_item_code=CASE WHEN excluded.vendor_item_code<>'' THEN excluded.vendor_item_code ELSE ordering_vendor_items.vendor_item_code END, vendor_item_name=CASE WHEN excluded.vendor_item_name<>'' THEN excluded.vendor_item_name ELSE ordering_vendor_items.vendor_item_name END,updated_at=excluded.updated_at").bind(o.source_id,key.type,key.key,String(raw.vendorItemCode??"").trim()?vendorCode:old?.vendor_item_code??"", manuallyNamed?vendorItemName:old?.vendor_item_name??"",ctx.now));
    }
    return success({...await mutate(ctx,o,expected,stmts,summary,"line_saved"),savedLineId},requestId);
   }
   if(action==="receipts"&&method==="POST"){
    if(o.status!=="SENT")throw new Bad("ORDERING_INVALID","尚未送出");
    const no=parseErpPurchaseNo(String(v.erpPurchaseNo??""));if(!no)throw new Bad("ORDERING_INVALID","進貨單號須為11碼，前8碼須為合法日期");
    const at=date(v.receivedDate),items=v.lines;if(!Array.isArray(items)||!items.length||items.length>100)throw new Bad("ORDERING_INVALID","本次到貨列數不正確");
    const all=await rows<Line>(ctx.db,"SELECT l.*,COALESCE((SELECT SUM(quantity) FROM ordering_receipt_lines WHERE line_id=l.id),0) received FROM ordering_lines l WHERE order_id=? LIMIT 501",id);
    const seen=new Set<number>(),stmts:D1PreparedStatement[]=[];
    // A 52-bit UUID-derived INTEGER key is unique per receipt even across concurrent transactions.
    // All master/detail records are still inserted in the same atomic D1 batch.
    receiptPhase.value="persist";
    const receiptId=Number.parseInt(crypto.randomUUID().replaceAll("-","").slice(0,13),16);
    stmts.push(ctx.db.prepare("INSERT INTO ordering_receipts(id,order_id,erp_purchase_no,received_date,created_at,created_by) VALUES(?,?,?,?,?,?)").bind(receiptId,id,no,at,ctx.now,ctx.actor));
    // Single latest-row lookup belongs to the same batch; no per-line read/write roundtrips.
    for(const raw of items){const x=raw as Record<string,unknown>,lineId=int(x.lineId,"明細"),qty=Number(x.quantity),line=all.find(a=>a.id===lineId);
     if(seen.has(lineId)||!line||line.closed_as||line.quantity===null||!Number.isFinite(qty)||qty<=0||qty>line.quantity-line.received)throw new Bad("ORDERING_INVALID","到貨數量超過剩餘或明細不正確");
     seen.add(lineId);
     stmts.push(ctx.db.prepare("INSERT INTO ordering_receipt_lines(receipt_id,line_id,quantity) VALUES(?,?,?)").bind(receiptId,lineId,qty));
    }
    return success(await mutate(ctx,o,expected,stmts,"到貨 "+no,"received",()=>{receiptPhase.value="readback"}),requestId);
   }
   if(action==="close"&&method==="POST"){
    if(o.status!=="SENT")throw new Bad("ORDERING_INVALID","尚未送出");
    const lineId=int(v.lineId,"明細"),closed=String(v.closedAs??"");
    if(!["SHORTAGE","CANCELLED","OTHER"].includes(closed))throw new Bad("ORDERING_INVALID","結案類型錯誤");
    const note=must(v.reason??"","原因",200);if(closed==="OTHER"&&!note)throw new Bad("ORDERING_INVALID","其他原因必填");
    const line=await one<Line>(ctx.db,"SELECT * FROM ordering_lines WHERE order_id=? AND id=?",id,lineId);
    if(!line||line.closed_as)throw new Bad("ORDERING_INVALID","明細不能結掉");
    return success(await mutate(ctx,o,expected,[ctx.db.prepare("UPDATE ordering_lines SET closed_as=?,closed_note=?,closed_at=?,closed_by=? WHERE order_id=? AND id=?").bind(closed,note,ctx.now,ctx.actor,id,lineId)],(line.item_name||line.vendor_item_name)+" "+closed,"closed"),requestId);
   }
  }
  return failure({code:"NOT_FOUND",message:"找不到叫貨功能"},requestId,404);
 }catch(e){
  if(receiptPhase.value && (receiptPhase.value==="readback" || !(e instanceof Bad))){
   // Worker logs are restricted; never log submitted receipt numbers, line values, or identity fields.
   console.error("[ordering_receipt_failure]",{
    requestId,phase:receiptPhase.value,
    errorName:e instanceof Error?e.name:"Unknown",
    errorMessage:String(e instanceof Error?e.message:e).slice(0,500),
   });
  }
  if(receiptPhase.value==="readback"){
   return failure({code:"ORDERING_RECEIPT_CONFIRMATION_REQUIRED",
    message:"到貨資料已寫入，但無法取得確認結果。請重新載入核對到貨紀錄，不要直接重複儲存。"},requestId,503);
  }
  if(e instanceof Bad)return failure({code:e.code,message:e.message},requestId,e.status);
  if(String(e).includes("UNIQUE constraint") && !receiptPhase.value)return failure({code:"ORDERING_DUPLICATE",message:"名稱或資料已存在"},requestId,409);
  if(receiptPhase.value)return failure({code:"ORDERING_UNAVAILABLE",message:"到貨結果尚未確認，請先重新載入核對紀錄。"},requestId,500);
  return failure({code:"ORDERING_UNAVAILABLE",message:"叫貨操作失敗"},requestId,500);
 }
}
