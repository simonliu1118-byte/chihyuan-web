/**
 * 自訂中國貨採購 (user 2026-11-10) under /api/business/ordering/orders/:id/cn-purchase. Each section is
 * saved on its own (訂購, 對帳, 運費, 營業稅, 退貨) through the 叫貨單's version lock, so every save is one
 * new 版本 in the 修改紀錄. 採購數量 replaces the line's 數量 (到貨 counts against it); the 原定 stays in
 * original_quantity.
 */
import {CN_LIMITS,CN_STAGE_LABELS,fenText,qtyText,type CnCharge,type CnPurchase,type CnReturn} from "../../shared/cn-purchase";
import {orderStatus} from "../../shared/ordering";

type Ord={id:number;source_id:number;status:string;version:number;revision:number};
type LineRow={id:number;sort_order:number;item_code:string;item_name:string;vendor_item_name:string;spec:string;unit:string;note:string;quantity:number|null;quantity_text:string;
 original_quantity:number|null;purchase_added:number;cn_discontinued:number;closed_as:string|null;received:number};
export interface CnDeps{
 db:D1Database;actor:number;now:string;
 bad:(code:string,message:string,status?:number)=>Error;
 mutate:(o:Ord,expected:number,stmts:D1PreparedStatement[],summary:string,action:string)=>Promise<unknown>;
 getOrder:(id:number)=>Promise<unknown>;
}

const rowsOf=async<T>(db:D1Database,sql:string,...args:unknown[])=>((await db.prepare(sql).bind(...args).all<T>()).results??[]) as T[];
const newId=()=>Number.parseInt(crypto.randomUUID().replaceAll("-","").slice(0,13),16);
const label=(l:Pick<LineRow,"item_name"|"vendor_item_name"|"item_code">)=>l.item_name||l.vendor_item_name||l.item_code;
const ntd=(n:number|null)=>n===null?"待補":n.toLocaleString("en-US");
const md=(d:string|null)=>d?d.slice(5).replace("-","/"):"";

export async function loadCnPurchase(db:D1Database,orderId:number):Promise<CnPurchase>{
 const [head,pieces,charges,returns]=await Promise.all([
  db.prepare("SELECT p.ordered_at,COALESCE(m.display_name,m.employee_no,'') ordered_by FROM ordering_cn_purchases p LEFT JOIN app_members m ON m.id=p.ordered_by WHERE p.order_id=?").bind(orderId).first<{ordered_at:string|null;ordered_by:string}>(),
  rowsOf<{id:number;line_id:number;sort_order:number;quantity:number;rmb_price:number|null;charge_id:number|null;note:string}>(db,"SELECT * FROM ordering_cn_pieces WHERE order_id=? ORDER BY sort_order,id LIMIT 1001",orderId),
  rowsOf<{id:number;kind:CnCharge["kind"];sort_order:number;charged_on:string|null;amount:number|null;fee:number|null;shipping:number|null;note:string}>(db,"SELECT * FROM ordering_cn_charges WHERE order_id=? ORDER BY kind,sort_order,id LIMIT 251",orderId),
  rowsOf<{line_id:number;quantity:number;rmb_amount:number|null;ntd_amount:number|null;fee:number|null;reason:string}>(db,"SELECT * FROM ordering_cn_returns WHERE order_id=? LIMIT 501",orderId),
 ]);
 return {orderedAt:head?.ordered_at??null,orderedBy:head?.ordered_by??"",
  pieces:pieces.map(p=>({id:p.id,lineId:p.line_id,sortOrder:p.sort_order,quantity:p.quantity,rmbPrice:p.rmb_price,chargeId:p.charge_id,note:p.note??""})),
  charges:charges.map(c=>({id:c.id,kind:c.kind,sortOrder:c.sort_order,chargedOn:c.charged_on,amount:c.amount,fee:c.fee,shipping:c.shipping??null,note:c.note})),
  returns:returns.map(r=>({lineId:r.line_id,quantity:r.quantity,rmbAmount:r.rmb_amount,ntdAmount:r.ntd_amount,fee:r.fee,reason:r.reason}))};
}

/** Line ids that already have 採購 pieces: their 數量 is owned by 採購, not by 修改叫貨單. */
export async function cnPurchasedLineIds(db:D1Database,orderId:number):Promise<Set<number>>{
 return new Set((await rowsOf<{line_id:number}>(db,"SELECT DISTINCT line_id FROM ordering_cn_pieces WHERE order_id=? LIMIT 501",orderId)).map(x=>x.line_id));
}

export async function handleCnPurchase(d:CnDeps,o:Ord,sourceKind:string,action:string,method:string,request:Request):Promise<{order:unknown;purchase:CnPurchase}>{
 const {db,bad}=d;
 if(sourceKind!=="CN_CUSTOM")throw bad("ORDERING_INVALID","只有自訂中國貨可以使用採購");
 if(o.status!=="SENT")throw bad("ORDERING_INVALID","叫貨單送出後才能採購",409);
 if(action==="cn-purchase"&&method==="GET")return {order:await d.getOrder(o.id),purchase:await loadCnPurchase(db,o.id)};
 const v=await request.json().catch(()=>null) as Record<string,unknown>|null;
 if(!v||typeof v!=="object"||Array.isArray(v))throw bad("ORDERING_INVALID","請提供有效資料");
 const expected=Number(v.expectedVersion);
 if(!Number.isSafeInteger(expected)||expected!==o.version)throw bad("ORDERING_VERSION_CONFLICT","已被其他人修改，請重新載入",409);
 const lines=await rowsOf<LineRow>(db,"SELECT l.*,COALESCE((SELECT SUM(quantity) FROM ordering_receipt_lines WHERE line_id=l.id),0) received FROM ordering_lines l WHERE order_id=? ORDER BY sort_order,id LIMIT 501",o.id);
 const purchase=await loadCnPurchase(db,o.id);
 const closed=orderStatus("SENT",lines.map(l=>({quantity:l.quantity,received:l.received,closedAs:l.closed_as as never})))==="CLOSED";
 const sub=action.slice("cn-purchase/".length);
 if(closed&&sub!=="restore")throw bad("ORDERING_INVALID","已結案的叫貨單不能再修改採購",409);
 const lineOf=(id:unknown)=>{const l=lines.find(x=>x.id===Number(id));if(!l)throw bad("ORDERING_NOT_FOUND","找不到明細",404);return l};
 const text=(value:unknown,name:string,max:number,required=false)=>{
  if(value===undefined||value===null)value="";
  if(typeof value!=="string"||value.trim().length>max||(required&&!value.trim()))throw bad("ORDERING_INVALID",name+(required?"必填":"不正確"));
  return value.trim();
 };
 const money=(value:unknown,name:string,max:number,required=false)=>{
  if(value===null||value===undefined||value===""){if(required)throw bad("ORDERING_INVALID",name+"必填");return null}
  if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>max)throw bad("ORDERING_INVALID",name+"不正確");
  return Number(value);
 };
 const day=(value:unknown,name:string,required=true)=>{
  if(!value){if(required)throw bad("ORDERING_INVALID",name+"必填");return null}
  const s=String(value),t=new Date(s+"T00:00:00Z");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==s)throw bad("ORDERING_INVALID",name+"不正確");
  return s;
 };
 const quantity=(value:unknown,name:string)=>{
  const n=Number(value);
  if(typeof value!=="number"||!Number.isFinite(n)||n<=0||n>CN_LIMITS.quantity||Math.round(n*10000)!==n*10000)throw bad("ORDERING_INVALID",name+"數量不正確");
  return n;
 };
 const list=(value:unknown,name:string,max:number)=>{
  if(!Array.isArray(value)||value.length>max||value.some(x=>!x||typeof x!=="object"||Array.isArray(x)))throw bad("ORDERING_INVALID",name+"不正確");
  return value as Record<string,unknown>[];
 };
 const stmts:D1PreparedStatement[]=[],changes:string[]=[];
 const ensureHead=()=>stmts.push(db.prepare("INSERT OR IGNORE INTO ordering_cn_purchases(order_id,created_at,updated_at) VALUES(?,?,?)").bind(o.id,d.now,d.now));
 const finish=async(summary:string,actionName:string)=>{
  if(!stmts.length)return {order:await d.getOrder(o.id),purchase};
  stmts.push(db.prepare("UPDATE ordering_cn_purchases SET updated_at=? WHERE order_id=?").bind(d.now,o.id));
  const order=await d.mutate(o,expected,stmts,summary,"cn_"+actionName);
  return {order,purchase:await loadCnPurchase(db,o.id)};
 };
 const cards=purchase.charges.filter(c=>c.kind==="CARD");

 if(sub==="order"&&method==="PUT"){
  // 訂購: 採購數量, 人民幣單價, 拆分, 刷卡分組 and the purchaser's own items, saved as a whole.
  const added=list(v.lines??[],"新增項目",200),removed=list(v.deletedLines===undefined?[]:Array.isArray(v.deletedLines)?v.deletedLines.map(x=>({id:x})):null,"刪除項目",200);
  const cardInput=list(v.cards??[],"刷卡",CN_LIMITS.charges),pieceInput=list(v.pieces,"採購明細",CN_LIMITS.pieces);
  const lineKey=new Map<string,{id:number;row:LineRow|null;name:string}>();
  for(const l of lines)lineKey.set("L"+l.id,{id:l.id,row:l,name:label(l)});
  const deleted=new Set<number>();
  for(const r of removed){const l=lineOf(r.id);
   if(!l.purchase_added)throw bad("ORDERING_INVALID",label(l)+" 是叫貨單原有項目，不能在採購刪除");
   if(l.received>0)throw bad("ORDERING_INVALID",label(l)+" 已有到貨，不能刪除");
   deleted.add(l.id);lineKey.delete("L"+l.id);
   stmts.push(db.prepare("DELETE FROM ordering_cn_returns WHERE line_id=?").bind(l.id),db.prepare("DELETE FROM ordering_cn_pieces WHERE line_id=?").bind(l.id),
    db.prepare("DELETE FROM ordering_lines WHERE id=? AND order_id=? AND purchase_added=1").bind(l.id,o.id));
   changes.push("刪除新增項目 "+label(l));
  }
  // 絕版／停產 and 恢復採購 from the 訂購 table's ⋯ (user 2026-11-11), saved with the rest of the step.
  const stopping=new Map<number,string>(),restoring=new Set<number>();
  for(const raw of list(v.discontinued??[],"絕版／停產",200)){const l=lineOf(raw.lineId),reason=text(raw.reason,"原因",CN_LIMITS.reason)||"絕版／停產";
   if(l.cn_discontinued)continue;
   if(l.closed_as)throw bad("ORDERING_INVALID",label(l)+" 已指定結案");
   if(l.received>0)throw bad("ORDERING_INVALID",label(l)+" 已有到貨，不能標記"+reason);
   // Once paid on a card the goods are bought: what cannot be delivered goes through 退貨 (user 2026-11-11).
   if(purchase.pieces.some(p=>p.lineId===l.id&&p.chargeId!==null))throw bad("ORDERING_INVALID",label(l)+" 已刷卡，不能標記"+reason+"，請用退貨處理");
   if(purchase.returns.some(r=>r.lineId===l.id))throw bad("ORDERING_INVALID",label(l)+" 有退貨紀錄，不能標記"+reason);
   stopping.set(l.id,reason);
  }
  for(const raw of list(v.restored===undefined?[]:Array.isArray(v.restored)?v.restored.map(x=>({id:x})):null,"恢復採購",200)){const l=lineOf(raw.id);
   if(!l.cn_discontinued)throw bad("ORDERING_INVALID",label(l)+" 沒有標記絕版／停產");
   restoring.add(l.id);
  }
  const stopped=(l:LineRow|null|undefined)=>!!l&&(stopping.has(l.id)||(!!l.cn_discontinued&&!restoring.has(l.id)));
  if(lines.length-deleted.size+added.filter(x=>!x.lineId).length>500)throw bad("ORDERING_LIMIT","單張叫貨單最多 500 列",409);
  const lineEdits:{id:number;old:LineRow|null;name:string;spec:string;unit:string;note:string}[]=[];
  let nextSort=lines.reduce((m,l)=>Math.max(m,l.sort_order),0);
  for(const raw of added){
   const name=text(raw.itemName,"品名",200,true),spec=text(raw.spec,"規格",200),unit=text(raw.unit,"單位",10),note=text(raw.note,"備註",300);
   if(raw.lineId){const l=lineOf(raw.lineId);if(!l.purchase_added||deleted.has(l.id))throw bad("ORDERING_INVALID","只能修改採購新增的項目");
    lineEdits.push({id:l.id,old:l,name,spec,unit,note});lineKey.set("L"+l.id,{id:l.id,row:l,name});continue}
   const key=text(raw.key,"項目代號",40,true);if(lineKey.has(key))throw bad("ORDERING_INVALID","項目代號重複");
   const id=newId();lineKey.set(key,{id,row:null,name});lineEdits.push({id,old:null,name,spec,unit,note});
  }
  const cardKey=new Map<string,number>(),cardRows:{id:number;old:CnCharge|null;chargedOn:string|null;amount:number|null;fee:number|null;shipping:number|null;sortOrder:number}[]=[];
  cardInput.forEach((raw,i)=>{
   const old=raw.id?cards.find(c=>c.id===Number(raw.id))??null:null;
   if(raw.id&&!old)throw bad("ORDERING_NOT_FOUND","找不到刷卡紀錄",404);
   const key=old?"C"+old.id:text(raw.key,"刷卡代號",40,true);
   if(cardKey.has(key))throw bad("ORDERING_INVALID","刷卡代號重複");
   const id=old?.id??newId();cardKey.set(key,id);
   cardRows.push({id,old,chargedOn:day(raw.chargedOn,"刷卡日期"),amount:money(raw.amount,"刷卡台幣",CN_LIMITS.ntd),fee:money(raw.fee,"手續費",CN_LIMITS.ntd),shipping:money(raw.shipping,"刷卡運費",CN_LIMITS.ntd),sortOrder:(i+1)*10});
  });
  const totals=new Map<number,number>(),usedCards=new Set<number>(),pieces:{lineId:number;quantity:number;rmbPrice:number|null;chargeId:number|null;sortOrder:number;note:string}[]=[];
  pieceInput.forEach((raw,i)=>{
   const target=lineKey.get(String(raw.lineKey??""));if(!target)throw bad("ORDERING_INVALID","採購明細的項目不正確");
   if(stopped(target.row))throw bad("ORDERING_INVALID",target.name+" 已標記絕版／停產，請先恢復");
   const q=quantity(raw.quantity,target.name),price=money(raw.rmbPrice,target.name+" 人民幣單價",CN_LIMITS.rmbFen);
   const card=raw.cardKey?cardKey.get(String(raw.cardKey)):null;if(raw.cardKey&&!card)throw bad("ORDERING_INVALID","採購明細的刷卡不正確");
   if(card)usedCards.add(card);
   const sortOrder=Number(raw.sortOrder??i);if(!Number.isSafeInteger(sortOrder)||sortOrder<0)throw bad("ORDERING_INVALID","排序不正確");
   totals.set(target.id,(totals.get(target.id)??0)+q);pieces.push({lineId:target.id,quantity:q,rmbPrice:price,chargeId:card??null,sortOrder,note:text(raw.note,target.name+" 備註",200)});
  });
  const returns=new Map(purchase.returns.map(r=>[r.lineId,r]));
  for(const [,t] of lineKey){
   const l=t.row;if(stopped(l))continue;
   const total=Math.round((totals.get(t.id)??0)*10000)/10000;
   if(!total)throw bad("ORDERING_INVALID",t.name+"：請填採購數量（買不到請用「絕版／停產」）");
   if(l&&total<l.received)throw bad("ORDERING_INVALID",t.name+"：採購數量不可少於已到貨 "+qtyText(l.received));
   if(returns.has(t.id)&&total<returns.get(t.id)!.quantity)throw bad("ORDERING_INVALID",t.name+"：採購數量不可少於退貨數量");
  }
  ensureHead();
  for(const [id,reason] of stopping){const l=lineOf(id);
   stmts.push(db.prepare("UPDATE ordering_lines SET closed_as='OTHER',closed_note=?,closed_at=?,closed_by=?,cn_discontinued=1 WHERE id=? AND order_id=? AND closed_as IS NULL").bind(reason,d.now,d.actor,id,o.id));
   changes.push(label(l)+" 標記"+reason+"（指定結案）");
  }
  for(const id of restoring){
   stmts.push(db.prepare("UPDATE ordering_lines SET closed_as=NULL,closed_note='',closed_at=NULL,closed_by=NULL,cn_discontinued=0 WHERE id=? AND order_id=? AND cn_discontinued=1").bind(id,o.id));
   changes.push(label(lineOf(id))+" 恢復採購");
  }
  // Pieces first: the card rows they point to are then free to change or go.
  stmts.push(db.prepare("DELETE FROM ordering_cn_pieces WHERE order_id=?").bind(o.id));
  const kept=cardRows.filter(c=>c.old).map(c=>c.id);
  stmts.push(db.prepare("DELETE FROM ordering_cn_charges WHERE order_id=? AND kind='CARD' AND id NOT IN (SELECT value FROM json_each(?))").bind(o.id,JSON.stringify(kept)));
  for(const e of lineEdits){
   const total=totals.get(e.id)??0;
   if(e.old){
    stmts.push(db.prepare("UPDATE ordering_lines SET item_name=?,vendor_item_name=?,spec=?,unit=?,note=? WHERE id=? AND order_id=?").bind(e.name,e.name,e.spec,e.unit,e.note,e.id,o.id));
    if(e.old.item_name!==e.name||e.old.spec!==e.spec||e.old.unit!==e.unit||e.old.note!==e.note)changes.push("修改新增項目 "+e.name);
   }else{
    nextSort+=10;
    stmts.push(db.prepare("INSERT INTO ordering_lines(id,order_id,section,sort_order,item_code,item_name,vendor_item_code,vendor_item_name,vendor_name_follows,spec,quantity_text,quantity,unit,note,purchase_added) VALUES(?,?,'',?,'',?,'',?,1,?,?,?,?,?,1)")
     .bind(e.id,o.id,nextSort,e.name,e.name,e.spec,qtyText(total),total,e.unit,e.note));
    changes.push("採購新增 "+e.name+" "+qtyText(total)+e.unit);
   }
  }
  for(const c of cardRows){
   if(c.old)stmts.push(db.prepare("UPDATE ordering_cn_charges SET sort_order=?,charged_on=?,amount=?,fee=?,shipping=? WHERE id=? AND order_id=? AND kind='CARD'").bind(c.sortOrder,c.chargedOn,c.amount,c.fee,c.shipping,c.id,o.id));
   else stmts.push(db.prepare("INSERT INTO ordering_cn_charges(id,order_id,kind,sort_order,charged_on,amount,fee,shipping) VALUES(?,?,'CARD',?,?,?,?,?)").bind(c.id,o.id,c.sortOrder,c.chargedOn,c.amount,c.fee,c.shipping));
  }
  pieces.forEach(p=>stmts.push(db.prepare("INSERT INTO ordering_cn_pieces(id,order_id,line_id,sort_order,quantity,rmb_price,charge_id,note) VALUES(?,?,?,?,?,?,?,?)").bind(newId(),o.id,p.lineId,p.sortOrder,p.quantity,p.rmbPrice,p.chargeId,p.note)));
  // 採購數量 becomes the line's 數量; the first change keeps the 原定.
  for(const l of lines){
   if(deleted.has(l.id)||stopped(l))continue;
   const total=Math.round((totals.get(l.id)??0)*10000)/10000;
   if(total!==l.quantity){
    stmts.push(db.prepare("UPDATE ordering_lines SET original_quantity=CASE WHEN purchase_added=1 THEN NULL ELSE COALESCE(original_quantity,quantity) END,quantity=?,quantity_text=? WHERE id=? AND order_id=?").bind(total,qtyText(total),l.id,o.id));
    changes.push(label(l)+" 採購數量 "+(l.quantity===null?l.quantity_text||"空白":qtyText(l.quantity))+" → "+qtyText(total));
   }
   const before=purchase.pieces.filter(p=>p.lineId===l.id),after=pieces.filter(p=>p.lineId===l.id);
   const prices=(ps:{rmbPrice:number|null}[])=>[...new Set(ps.map(p=>p.rmbPrice===null?"":fenText(p.rmbPrice)))].join("/");
   if(before.length&&prices(before)!==prices(after))changes.push(label(l)+" 人民幣單價 "+(prices(before)||"空白")+" → "+(prices(after)||"空白"));
   else if(!before.length&&prices(after))changes.push(label(l)+" 人民幣單價 ¥"+prices(after));
   if(before.length&&before.length!==after.length)changes.push(label(l)+" 拆成 "+after.length+" 段");
   const notes=(ps:{note?:string}[])=>ps.map(p=>p.note??"").filter(Boolean).join("／");
   if(notes(before)!==notes(after))changes.push(label(l)+" 備註 "+(notes(before)||"空白")+" → "+(notes(after)||"空白"));
  }
  const cardNo=(id:number)=>cardRows.findIndex(c=>c.id===id)+1;
  for(const c of cardRows){
   if(!c.old){changes.push("新增刷卡 #"+cardNo(c.id)+" "+md(c.chargedOn)+" 台幣 "+ntd(c.amount)+" 手續費 "+ntd(c.fee)+(c.shipping?" 運費 "+ntd(c.shipping):""));continue}
   const diff:string[]=[];
   if(c.old.chargedOn!==c.chargedOn)diff.push("日期 "+md(c.old.chargedOn)+" → "+md(c.chargedOn));
   if(c.old.amount!==c.amount)diff.push("台幣 "+ntd(c.old.amount)+" → "+ntd(c.amount));
   if(c.old.fee!==c.fee)diff.push("手續費 "+ntd(c.old.fee)+" → "+ntd(c.fee));
   if((c.old.shipping??null)!==c.shipping)diff.push("運費 "+(c.old.shipping==null?"空白":ntd(c.old.shipping))+" → "+(c.shipping==null?"空白":ntd(c.shipping)));
   if(diff.length)changes.push("刷卡 #"+cardNo(c.id)+" "+diff.join("、"));
  }
  const gone=cards.filter(c=>!kept.includes(c.id)).length;if(gone)changes.push("刪除刷卡 "+gone+" 筆");
  const regroup=purchase.pieces.length!==pieces.length||purchase.pieces.some(p=>p.chargeId!==null&&!kept.includes(p.chargeId))||cardRows.some(c=>!c.old)
   ||[...usedCards].some(id=>purchase.pieces.filter(p=>p.chargeId===id).length!==pieces.filter(p=>p.chargeId===id).length);
  if(regroup&&!changes.some(x=>x.includes("刷卡")))changes.push("調整刷卡分組");
  const sig=(ps:{lineId:number;quantity:number;rmbPrice:number|null;chargeId:number|null;sortOrder:number;note?:string}[])=>JSON.stringify(ps.map(p=>[p.lineId,p.quantity,p.rmbPrice,p.chargeId,p.sortOrder,p.note??""]).sort());
  if(!changes.length&&sig(purchase.pieces)===sig(pieces))return {order:await d.getOrder(o.id),purchase};
  return finish("採購："+(changes.join("；")||"調整拆分或順序"),"ordered_items");
 }

 if(sub==="reconcile"&&method==="PUT"){
  // 對帳: only each card's 台幣 and 手續費.
  for(const raw of list(v.cards,"刷卡",CN_LIMITS.charges)){
   const old=cards.find(c=>c.id===Number(raw.id));if(!old)throw bad("ORDERING_NOT_FOUND","找不到刷卡紀錄",404);
   const amount=money(raw.amount,"刷卡台幣",CN_LIMITS.ntd),fee=money(raw.fee,"手續費",CN_LIMITS.ntd);
   const shipping="shipping" in raw?money(raw.shipping,"刷卡運費",CN_LIMITS.ntd):old.shipping??null;
   if(amount===old.amount&&fee===old.fee&&shipping===(old.shipping??null))continue;
   const no=cards.findIndex(c=>c.id===old.id)+1,diff:string[]=[];
   if(amount!==old.amount)diff.push("台幣 "+ntd(old.amount)+" → "+ntd(amount));
   if(fee!==old.fee)diff.push("手續費 "+ntd(old.fee)+" → "+ntd(fee));
   if(shipping!==(old.shipping??null))diff.push("運費 "+(old.shipping==null?"空白":ntd(old.shipping))+" → "+(shipping==null?"空白":ntd(shipping)));
   stmts.push(db.prepare("UPDATE ordering_cn_charges SET amount=?,fee=?,shipping=? WHERE id=? AND order_id=? AND kind='CARD'").bind(amount,fee,shipping,old.id,o.id));
   changes.push("刷卡 #"+no+" "+diff.join("、"));
  }
  return finish("對帳："+changes.join("；"),"reconciled");
 }

 if(sub==="shipping"&&method==="PUT"){
  if(!purchase.orderedAt)throw bad("ORDERING_INVALID","完成訂購後才能填運費");
  const items=list(v.items,"運費",CN_LIMITS.shipping).map(raw=>({chargedOn:day(raw.chargedOn,"運費日期"),amount:money(raw.amount,"運費",CN_LIMITS.ntd,true),fee:money(raw.fee,"運費手續費",CN_LIMITS.ntd)}));
  if(!items.length&&purchase.charges.some(c=>c.kind==="TAX"))throw bad("ORDERING_INVALID","已有營業稅，至少要保留一筆運費");
  const old=purchase.charges.filter(c=>c.kind==="SHIPPING"),sig=(x:{chargedOn:string|null;amount:number|null;fee:number|null}[])=>JSON.stringify(x.map(c=>[c.chargedOn,c.amount,c.fee]));
  if(sig(old)===sig(items))return {order:await d.getOrder(o.id),purchase};
  stmts.push(db.prepare("DELETE FROM ordering_cn_charges WHERE order_id=? AND kind='SHIPPING'").bind(o.id));
  items.forEach((c,i)=>stmts.push(db.prepare("INSERT INTO ordering_cn_charges(id,order_id,kind,sort_order,charged_on,amount,fee) VALUES(?,?,'SHIPPING',?,?,?,?)").bind(newId(),o.id,(i+1)*10,c.chargedOn,c.amount,c.fee)));
  const show=(x:typeof items)=>x.map(c=>md(c.chargedOn)+" "+ntd(c.amount)+(c.fee?"＋"+c.fee:"")).join("、")||"無";
  return finish("運費："+show(old)+" → "+show(items),"shipping");
 }

 if(sub==="tax"&&method==="PUT"){
  if(!purchase.charges.some(c=>c.kind==="SHIPPING"))throw bad("ORDERING_INVALID","先填運費，再填營業稅");
  const raw=v.tax as Record<string,unknown>|null|undefined;
  const next=raw?{chargedOn:day(raw.chargedOn,"營業稅日期"),amount:money(raw.amount,"營業稅",CN_LIMITS.ntd,true)}:null;
  const old=purchase.charges.find(c=>c.kind==="TAX")??null;
  if((old?.chargedOn??null)===(next?.chargedOn??null)&&(old?.amount??null)===(next?.amount??null))return {order:await d.getOrder(o.id),purchase};
  stmts.push(db.prepare("DELETE FROM ordering_cn_charges WHERE order_id=? AND kind='TAX'").bind(o.id));
  if(next)stmts.push(db.prepare("INSERT INTO ordering_cn_charges(id,order_id,kind,sort_order,charged_on,amount) VALUES(?,?,'TAX',10,?,?)").bind(newId(),o.id,next.chargedOn,next.amount));
  const show=(x:{chargedOn:string|null;amount:number|null}|null)=>x?md(x.chargedOn)+" "+ntd(x.amount):"無";
  return finish("營業稅："+show(old)+" → "+show(next),"tax");
 }

 if(sub==="returns"&&method==="PUT"){
  const seen=new Set<number>(),items:CnReturn[]=[];
  for(const raw of list(v.items,"退貨",500)){
   const l=lineOf(raw.lineId);if(seen.has(l.id))throw bad("ORDERING_INVALID",label(l)+" 退貨重複");seen.add(l.id);
   if(l.cn_discontinued)throw bad("ORDERING_INVALID",label(l)+" 已標記絕版／停產");
   const q=quantity(raw.quantity,label(l)+" 退貨");
   if(q>l.received)throw bad("ORDERING_INVALID",label(l)+"：退貨數量不可多於已到貨 "+qtyText(l.received));
   items.push({lineId:l.id,quantity:q,rmbAmount:money(raw.rmbAmount,"退貨人民幣",CN_LIMITS.rmbFen),ntdAmount:money(raw.ntdAmount,"台幣刷退",CN_LIMITS.ntd),fee:money(raw.fee,"刷退手續費",CN_LIMITS.ntd),reason:text(raw.reason,"退貨原因",CN_LIMITS.reason)});
  }
  const show=(r:CnReturn)=>label(lineOf(r.lineId))+" "+qtyText(r.quantity)+"（¥"+fenText(r.rmbAmount)+"／刷退 "+ntd(r.ntdAmount)+(r.fee?"／手續費 "+r.fee:"")+(r.reason?"／"+r.reason:"")+"）";
  const before=new Map(purchase.returns.map(r=>[r.lineId,r]));
  for(const r of items){const old=before.get(r.lineId);if(!old)changes.push("新增退貨 "+show(r));else if(JSON.stringify(old)!==JSON.stringify(r))changes.push("修改退貨 "+show(old)+" → "+show(r))}
  for(const r of purchase.returns)if(!seen.has(r.lineId))changes.push("刪除退貨 "+show(r));
  if(!changes.length)return {order:await d.getOrder(o.id),purchase};
  stmts.push(db.prepare("DELETE FROM ordering_cn_returns WHERE order_id=?").bind(o.id));
  items.forEach(r=>stmts.push(db.prepare("INSERT INTO ordering_cn_returns(line_id,order_id,quantity,rmb_amount,ntd_amount,fee,reason) VALUES(?,?,?,?,?,?,?)").bind(r.lineId,o.id,r.quantity,r.rmbAmount,r.ntdAmount,r.fee,r.reason)));
  return finish("退貨："+changes.join("；"),"returns");
 }

 if(sub==="complete"&&method==="POST"){
  if(purchase.orderedAt)throw bad("ORDERING_INVALID","已完成訂購");
  const missing=lines.filter(l=>!l.cn_discontinued&&!purchase.pieces.some(p=>p.lineId===l.id));
  if(missing.length)throw bad("ORDERING_INVALID","請先儲存訂購內容："+missing.slice(0,5).map(label).join("、")+(missing.length>5?" 等 "+missing.length+" 項":"")+" 尚未填採購");
  stmts.push(db.prepare("UPDATE ordering_cn_purchases SET ordered_at=?,ordered_by=? WHERE order_id=? AND ordered_at IS NULL").bind(d.now,d.actor,o.id));
  return finish("採購："+CN_STAGE_LABELS.ORDERING+" → "+CN_STAGE_LABELS.ORDERED,"completed");
 }

 if(sub==="discontinue"&&method==="POST"){
  const l=lineOf(v.lineId),reason=text(v.reason,"原因",CN_LIMITS.reason)||"絕版／停產";
  if(l.closed_as)throw bad("ORDERING_INVALID",label(l)+" 已指定結案");
  if(purchase.pieces.some(p=>p.lineId===l.id&&p.chargeId!==null))throw bad("ORDERING_INVALID",label(l)+" 已刷卡，不能標記絕版／停產，請用退貨處理");
  if(purchase.returns.some(r=>r.lineId===l.id))throw bad("ORDERING_INVALID",label(l)+" 有退貨紀錄，不能標記停產");
  stmts.push(db.prepare("UPDATE ordering_lines SET closed_as='OTHER',closed_note=?,closed_at=?,closed_by=?,cn_discontinued=1 WHERE id=? AND order_id=? AND closed_as IS NULL").bind(reason,d.now,d.actor,l.id,o.id));
  return finish(label(l)+" 標記絕版／停產（"+reason+"），指定結案","discontinued");
 }

 if(sub==="restore"&&method==="POST"){
  const l=lineOf(v.lineId);
  if(!l.cn_discontinued)throw bad("ORDERING_INVALID",label(l)+" 沒有標記絕版／停產");
  stmts.push(db.prepare("UPDATE ordering_lines SET closed_as=NULL,closed_note='',closed_at=NULL,closed_by=NULL,cn_discontinued=0 WHERE id=? AND order_id=? AND cn_discontinued=1").bind(l.id,o.id));
  return finish(label(l)+" 恢復採購（取消絕版／停產）","restored");
 }
 throw bad("NOT_FOUND","找不到採購功能",404);
}
