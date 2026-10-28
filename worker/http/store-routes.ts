import {requireModuleAccess} from "../auth/guard";
import {identityClient,type IdentityRuntimeEnv} from "./auth-routes";
import {success,failure} from "./response";
import {AuditService} from "../audit/audit-service";
import {STORE_BLACKLIST_ACTIONS,STORE_ORDER_STATUSES,normalizePhone,orderTotal,type StoreBlacklistAction,type StoreOrderStatus} from "../../shared/store";

// 門市 顧客訂購 (user 2026-10-28). Orders, their items and the 黑名單; one grant: STORE_CUSTOMER_ORDERS.
type Context={db:D1Database;actor:number;now:string;requestId:string};
type OrderRow={id:number;order_date:string;customer_name:string;phone:string;line_name:string;deposit:number;note:string;status:StoreOrderStatus;notified_at:string|null;cancel_reason:string;version:number;created_at:string;updated_at:string};
type LineRow={id:number;order_id:number;sort_order:number;item_code:string;item_name:string;quantity:number;unit_price:number};
type BlacklistRow={id:number;name:string;phone:string;reason:string;action:StoreBlacklistAction;created_at:string;updated_at:string};
class Bad extends Error{constructor(public code:string,message:string,public status=422){super(message)}}
const text=(v:unknown,name:string,max:number,required=false)=>{
 if(v===undefined||v===null)v="";
 if(typeof v!=="string"||[...v.trim()].length>max)throw new Bad("STORE_INVALID",name+"不正確");
 if(required&&!v.trim())throw new Bad("STORE_INVALID",name+"必填");
 return v.trim();
};
const phoneOf=(v:unknown)=>{const p=normalizePhone(text(v,"電話",30,true));if(p.length<6||p.length>20)throw new Bad("STORE_INVALID","電話需為 6 到 20 位數字");return p};
const dateOf=(v:unknown)=>{const d=text(v,"訂購日期",10,true),t=new Date(d+"T00:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==d)throw new Bad("STORE_INVALID","訂購日期無效");return d};
const money=(v:unknown,name:string)=>{const n=Number(v??0);if(!Number.isSafeInteger(n)||n<0||n>100_000_000)throw new Bad("STORE_INVALID",name+"需為 0 以上的整數");return n};
const body=async(req:Request)=>{const b=await req.json().catch(()=>null);if(!b||typeof b!=="object"||Array.isArray(b))throw new Bad("STORE_INVALID","請提供有效資料");return b as Record<string,unknown>};
const audit=(ctx:Context,type:string,id:number,action:string,after:Record<string,unknown>)=>new AuditService(ctx.db).prepareRecord({entityType:type,entityKey:String(id),action,actorEmployeeId:ctx.actor,requestId:ctx.requestId,after});
const rows=async<T>(db:D1Database,sql:string,...args:unknown[])=>((await db.prepare(sql).bind(...args).all<T>()).results??[]) as T[];
const one=async<T>(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args).first<T>();

function parseLines(v:unknown){
 if(!Array.isArray(v)||!v.length)throw new Bad("STORE_INVALID","至少需要一個訂購品項");
 if(v.length>50)throw new Bad("STORE_INVALID","單筆訂購最多 50 個品項");
 return v.map((raw,i)=>{
  if(!raw||typeof raw!=="object")throw new Bad("STORE_INVALID","第 "+(i+1)+" 個品項不正確");
  const x=raw as Record<string,unknown>,quantity=Number(x.quantity);
  if(!Number.isFinite(quantity)||quantity<=0||quantity>1_000_000)throw new Bad("STORE_INVALID","第 "+(i+1)+" 個品項的數量需大於 0");
  return {itemCode:text(x.itemCode,"品號",40),itemName:text(x.itemName,"第 "+(i+1)+" 個品項的品名",200,true),quantity,unitPrice:money(x.unitPrice,"單價")};
 });
}
function orderJson(o:OrderRow,lines:LineRow[]){
 const items=lines.filter(l=>l.order_id===o.id).sort((a,b)=>a.sort_order-b.sort_order||a.id-b.id).map(l=>({id:l.id,itemCode:l.item_code,itemName:l.item_name,quantity:l.quantity,unitPrice:l.unit_price}));
 return {id:o.id,orderDate:o.order_date,customerName:o.customer_name,phone:o.phone,lineName:o.line_name,deposit:o.deposit,note:o.note,status:o.status,
  notifiedAt:o.notified_at,cancelReason:o.cancel_reason,version:o.version,createdAt:o.created_at,updatedAt:o.updated_at,lines:items,total:orderTotal(items)};
}
const blacklistJson=(b:BlacklistRow)=>({id:b.id,name:b.name,phone:b.phone,reason:b.reason,action:b.action,createdAt:b.created_at,updatedAt:b.updated_at});
async function getOrder(ctx:Context,id:number){
 const o=await one<OrderRow>(ctx.db,"SELECT * FROM store_customer_orders WHERE id=?",id);if(!o)throw new Bad("STORE_NOT_FOUND","訂購不存在",404);
 return orderJson(o,await rows<LineRow>(ctx.db,"SELECT * FROM store_customer_order_lines WHERE order_id=? LIMIT 51",id));
}
/** The 黑名單 rule for an order being saved: 拒絕訂購 refuses it, 收全款 needs 訂金 = 金額. */
async function checkBlacklist(ctx:Context,phone:string,deposit:number,total:number){
 const hit=await one<BlacklistRow>(ctx.db,"SELECT * FROM store_blacklist WHERE phone=?",phone);
 if(!hit)return;
 if(hit.action==="REFUSE")throw new Bad("STORE_BLACKLIST_REFUSED","此電話在黑名單（"+hit.name+"）：拒絕訂購。理由："+hit.reason,409);
 if(deposit<total)throw new Bad("STORE_FULL_PAYMENT_REQUIRED","此電話在黑名單（"+hit.name+"）：需收全款，訂金必須等於金額 "+total+" 元。理由："+hit.reason);
}
function orderFields(v:Record<string,unknown>){
 const lines=parseLines(v.lines);
 return {orderDate:dateOf(v.orderDate),customerName:text(v.customerName,"姓名",40,true),phone:phoneOf(v.phone),lineName:text(v.lineName,"LINE 名稱",60),
  deposit:money(v.deposit,"訂金"),note:text(v.note,"備註",300),lines,total:orderTotal(lines)};
}
const lineInserts=(ctx:Context,orderId:number,lines:ReturnType<typeof parseLines>)=>lines.map((l,i)=>
 ctx.db.prepare("INSERT INTO store_customer_order_lines(order_id,sort_order,item_code,item_name,quantity,unit_price) VALUES(?,?,?,?,?,?)").bind(orderId,(i+1)*10,l.itemCode,l.itemName,l.quantity,l.unitPrice));
// A failed guard aborts the whole batch (malformed JSON), so a stale save never half-applies.
const versionGuard=(ctx:Context,id:number,version:number)=>ctx.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM store_customer_orders WHERE id=? AND version=?) THEN 1 ELSE json('') END").bind(id,version);

export async function handleStoreRoute(request:Request,env:IdentityRuntimeEnv,requestId:string):Promise<Response|null>{
 const url=new URL(request.url);if(!url.pathname.startsWith("/api/business/store"))return null;
 const provider=identityClient(env);if(!provider)return failure({code:"IDENTITY_UNAVAILABLE",message:"身分服務無法使用"},requestId,503);
 const gate=await requireModuleAccess(provider,env.DB,request,"STORE_CUSTOMER_ORDERS");
 if(!gate.ok)return failure({code:gate.code,message:"沒有門市顧客訂購權限"},requestId,gate.status);
 const ctx:Context={db:env.DB,actor:gate.member.id,now:new Date().toISOString(),requestId};
 const path=url.pathname.replace(/^\/api\/business\/store\/?/,""),method=request.method;
 try{
  if(path==="orders"&&method==="GET"){
   const where:string[]=[],args:unknown[]=[];
   const status=url.searchParams.get("status");
   if(status){if(!(STORE_ORDER_STATUSES as readonly string[]).includes(status))throw new Bad("STORE_INVALID","狀態不正確");where.push("o.status=?");args.push(status)}
   const q=(url.searchParams.get("q")??"").trim().slice(0,40);
   if(q){const like="%"+q.replace(/[\\%_]/g,m=>"\\"+m)+"%",digits=normalizePhone(q);
    where.push("(o.customer_name LIKE ? ESCAPE '\\' OR o.line_name LIKE ? ESCAPE '\\'"+(digits?" OR o.phone LIKE ?":"")+" OR EXISTS(SELECT 1 FROM store_customer_order_lines l WHERE l.order_id=o.id AND (l.item_code LIKE ? ESCAPE '\\' OR l.item_name LIKE ? ESCAPE '\\')))");
    args.push(like,like,...(digits?["%"+digits+"%"]:[]),like,like)}
   const orders=await rows<OrderRow>(ctx.db,"SELECT o.* FROM store_customer_orders o"+(where.length?" WHERE "+where.join(" AND "):"")+" ORDER BY o.order_date DESC,o.id DESC LIMIT 501",...args);
   if(orders.length>500)throw new Bad("STORE_LIMIT","符合的訂購超過 500 筆，請縮小搜尋條件",409);
   const ids=orders.map(o=>o.id);
   const lines=ids.length?await rows<LineRow>(ctx.db,"SELECT * FROM store_customer_order_lines WHERE order_id IN (SELECT value FROM json_each(?)) LIMIT 25001",JSON.stringify(ids)):[];
   return success(orders.map(o=>orderJson(o,lines)),requestId);
  }
  if(path==="orders"&&method==="POST"){
   const f=orderFields(await body(request));
   await checkBlacklist(ctx,f.phone,f.deposit,f.total);
   // The id is chosen here so the order and its items go in one batch (all or nothing).
   const id=Number.parseInt(crypto.randomUUID().replaceAll("-","").slice(0,13),16);
   await ctx.db.batch([
    ctx.db.prepare("INSERT INTO store_customer_orders(id,order_date,customer_name,phone,line_name,deposit,note,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
     .bind(id,f.orderDate,f.customerName,f.phone,f.lineName,f.deposit,f.note,ctx.now,ctx.actor,ctx.now,ctx.actor),
    ...lineInserts(ctx,id,f.lines),
    audit(ctx,"store_order",id,"store_order.created",{customerName:f.customerName,items:f.lines.length,total:f.total,deposit:f.deposit})]);
   return success(await getOrder(ctx,id),requestId);
  }
  let m=/^orders\/(\d+)(?:\/(status))?$/.exec(path);
  if(m){
   const id=Number(m[1]),o=await one<OrderRow>(ctx.db,"SELECT * FROM store_customer_orders WHERE id=?",id);
   if(!o)throw new Bad("STORE_NOT_FOUND","訂購不存在",404);
   if(!m[2]&&method==="GET")return success(await getOrder(ctx,id),requestId);
   const v=await body(request),expected=Number(v.expectedVersion);
   if(expected!==o.version)throw new Bad("STORE_VERSION_CONFLICT","已被其他人修改，請重新載入",409);
   if(!m[2]&&method==="PATCH"){
    if(o.status==="PICKED_UP"||o.status==="CANCELLED")throw new Bad("STORE_INVALID","已取貨或已取消的訂購不能修改",409);
    const f=orderFields(v);
    await checkBlacklist(ctx,f.phone,f.deposit,f.total);
    await ctx.db.batch([versionGuard(ctx,id,expected),
     ctx.db.prepare("UPDATE store_customer_orders SET order_date=?,customer_name=?,phone=?,line_name=?,deposit=?,note=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?")
      .bind(f.orderDate,f.customerName,f.phone,f.lineName,f.deposit,f.note,ctx.now,ctx.actor,id,expected),
     ctx.db.prepare("DELETE FROM store_customer_order_lines WHERE order_id=?").bind(id),
     ...lineInserts(ctx,id,f.lines),
     audit(ctx,"store_order",id,"store_order.updated",{items:f.lines.length,total:f.total,deposit:f.deposit})]);
    return success(await getOrder(ctx,id),requestId);
   }
   if(m[2]==="status"&&method==="POST"){
    const status=v.status as StoreOrderStatus;
    if(!(STORE_ORDER_STATUSES as readonly string[]).includes(status))throw new Bad("STORE_INVALID","狀態不正確");
    const reason=status==="CANCELLED"?text(v.reason,"取消理由",300,true):"";
    const toBlacklist=status==="CANCELLED"&&v.blacklistAction!==undefined&&v.blacklistAction!==null&&v.blacklistAction!=="";
    if(toBlacklist&&!(STORE_BLACKLIST_ACTIONS as readonly string[]).includes(String(v.blacklistAction)))throw new Bad("STORE_INVALID","黑名單處置不正確");
    // 通知 starts the 7-day pickup clock; going back to an earlier step clears it.
    const notifiedAt=status==="NOTIFIED"?(o.status==="NOTIFIED"?o.notified_at:ctx.now):status==="PICKED_UP"||status==="CANCELLED"?o.notified_at:null;
    const stmts:D1PreparedStatement[]=[versionGuard(ctx,id,expected),
     ctx.db.prepare("UPDATE store_customer_orders SET status=?,notified_at=?,cancel_reason=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?")
      .bind(status,notifiedAt,reason,ctx.now,ctx.actor,id,expected),
     audit(ctx,"store_order",id,"store_order.status_changed",{from:o.status,to:status,...(reason?{reason}:{})})];
    if(toBlacklist){
     stmts.push(ctx.db.prepare("INSERT INTO store_blacklist(name,phone,reason,action,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,reason=excluded.reason,action=excluded.action,updated_at=excluded.updated_at,updated_by=excluded.updated_by")
      .bind(o.customer_name,o.phone,reason,String(v.blacklistAction),ctx.now,ctx.actor,ctx.now,ctx.actor),
      audit(ctx,"store_blacklist",id,"store_blacklist.added_from_order",{action:v.blacklistAction}));
    }
    await ctx.db.batch(stmts);
    return success(await getOrder(ctx,id),requestId);
   }
  }
  if(path==="blacklist"&&method==="GET")
   return success((await rows<BlacklistRow>(ctx.db,"SELECT * FROM store_blacklist ORDER BY updated_at DESC,id DESC LIMIT 1000")).map(blacklistJson),requestId);
  if(path==="blacklist/check"&&method==="GET"){
   const phone=normalizePhone(url.searchParams.get("phone")??"");
   const hit=phone.length>=6?await one<BlacklistRow>(ctx.db,"SELECT * FROM store_blacklist WHERE phone=?",phone):null;
   return success(hit?blacklistJson(hit):null,requestId);
  }
  const blacklistFields=(v:Record<string,unknown>)=>{
   const action=String(v.action) as StoreBlacklistAction;
   if(!(STORE_BLACKLIST_ACTIONS as readonly string[]).includes(action))throw new Bad("STORE_INVALID","處置不正確");
   return {name:text(v.name,"姓名",40,true),phone:phoneOf(v.phone),reason:text(v.reason,"理由",300,true),action};
  };
  if(path==="blacklist"&&method==="POST"){
   const f=blacklistFields(await body(request));
   const created=await ctx.db.prepare("INSERT INTO store_blacklist(name,phone,reason,action,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?) RETURNING id")
    .bind(f.name,f.phone,f.reason,f.action,ctx.now,ctx.actor,ctx.now,ctx.actor).first<{id:number}>();
   await audit(ctx,"store_blacklist",created!.id,"store_blacklist.created",{name:f.name,action:f.action}).run();
   return success({id:created!.id},requestId);
  }
  m=/^blacklist\/(\d+)$/.exec(path);
  if(m&&(method==="PATCH"||method==="DELETE")){
   const id=Number(m[1]);
   if(method==="DELETE"){
    const gone=await ctx.db.prepare("DELETE FROM store_blacklist WHERE id=?").bind(id).run();
    if(!gone.meta.changes)throw new Bad("STORE_NOT_FOUND","黑名單資料不存在",404);
    await audit(ctx,"store_blacklist",id,"store_blacklist.deleted",{}).run();
    return success({deleted:true},requestId);
   }
   const f=blacklistFields(await body(request));
   const changed=await ctx.db.prepare("UPDATE store_blacklist SET name=?,phone=?,reason=?,action=?,updated_at=?,updated_by=? WHERE id=?").bind(f.name,f.phone,f.reason,f.action,ctx.now,ctx.actor,id).run();
   if(!changed.meta.changes)throw new Bad("STORE_NOT_FOUND","黑名單資料不存在",404);
   await audit(ctx,"store_blacklist",id,"store_blacklist.updated",{name:f.name,action:f.action}).run();
   return success({saved:true},requestId);
  }
  if(path==="item"&&method==="GET"){
   // 品名 for a typed 品號, from the ERP sales copy that 進貨輔助 keeps (none: the person types it).
   const code=text(url.searchParams.get("itemCode"),"品號",40,true);
   return success(await one<{item_name:string;unit:string}>(ctx.db,"SELECT item_name,unit FROM erp_sales_items WHERE item_code=? LIMIT 1",code),requestId);
  }
  return failure({code:"NOT_FOUND",message:"找不到門市功能"},requestId,404);
 }catch(e){
  if(e instanceof Bad)return failure({code:e.code,message:e.message},requestId,e.status);
  if(String(e).includes("UNIQUE constraint"))return failure({code:"STORE_DUPLICATE",message:"此電話已在黑名單"},requestId,409);
  if(String(e).includes("malformed JSON"))return failure({code:"STORE_VERSION_CONFLICT",message:"已被其他人修改，請重新載入"},requestId,409);
  return failure({code:"STORE_UNAVAILABLE",message:"門市操作失敗"},requestId,500);
 }
}
