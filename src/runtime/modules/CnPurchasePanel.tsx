/**
 * 自訂中國貨採購 (user 2026-11-10): one table, read-only until a step is opened from the buttons above
 * it (訂購／對帳／運費／營業稅／退貨). Each step unlocks only its own cells and saves on its own; the
 * whole table is recomputed on every change (shared/cn-purchase.ts).
 */
import {useEffect,useMemo,useRef,useState,type DragEvent,type ReactNode} from "react";
import {apiRequest,ApiClientError} from "../../api/client";
import {DateInput} from "../../ui/forms/DateInput";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {SegmentedControl} from "../../ui/primitives/SegmentedControl";
import {OverflowMenu,type OverflowItem} from "../../ui/mobile/OverflowMenu";
import {IconButton} from "../../ui/actions/IconButton";
import {Icons} from "../../ui/actions/icons";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {CN_STAGE_LABELS,cnStage,cnTableRows,computeCnPurchase,summarizeCnLines,fenText,ntdText,parseNtd,parseRmbFen,qtyText,rmbText,
 type CnCharge,type CnLineRef,type CnPiece,type CnPurchase,type CnReturn,type CnStage} from "../../../shared/cn-purchase";
import {orderingTaipeiDateTime,type OrderingLine,type OrderingOrder} from "../../../shared/ordering";
import "./cn-purchase.css";

type Line=OrderingLine&{originalQuantity?:number|null;purchaseAdded?:boolean;cnDiscontinued?:boolean};
export type CnOrder=OrderingOrder&{storedStatus:"DRAFT"|"SENT"|"VOID";lines:Line[]};
type Mode="order"|"reconcile"|"shipping"|"tax"|"returns";
interface DPiece{key:string;lineKey:string;quantity:string;price:string;cardKey:string|null;note:string}
interface DCard{key:string;id?:number;chargedOn:string;amount:string;fee:string;shipping:string}
interface DLine{key:string;lineId?:number;itemName:string;spec:string;unit:string}
interface OrderDraft{pieces:DPiece[];cards:DCard[];lines:DLine[];deleted:number[]}
interface DShipping{chargedOn:string;amount:string;fee:string}
interface DReturn{lineId:string;quantity:string;rmb:string;ntd:string;fee:string;reason:string}
interface Drafts{order?:OrderDraft;reconcile?:Record<number,{amount:string;fee:string;shipping:string}>;shipping?:DShipping[];tax?:{chargedOn:string;amount:string}|null;returns?:DReturn[]}

const ROOT="/api/business/ordering/orders/";
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const md=(d:string|null|undefined)=>d?d.replaceAll("-","/"):"";
/** Table dates are MM/DD (the year is in the tooltip) so the four card columns stay narrow. */
const mdShort=(d:string|null|undefined)=>d?<span title={md(d)}>{d.slice(5).replace("-","/")}</span>:"";
const numText=(n:number|null|undefined)=>n===null||n===undefined?"":String(n);
const MODE_LABELS:Record<Mode,string>={order:"訂購",reconcile:"對帳",shipping:"回台灣運費",tax:"營業稅",returns:"退貨"};
const MODE_HINTS:Record<Mode,string>={
 order:"填採購數量、人民幣單價與備註；勾選列後按「刷卡」成為一筆刷卡，按刷卡編號旁的 × 可取消整筆重新處理；⠿ 拖曳調整順序；⋯ 可拆分。",
 reconcile:"對帳單到了再補每筆刷卡的台幣、手續費與該筆刷卡的運費。",
 shipping:"回台灣的運費，每筆一列（含手續費），依各品項成本攤給全部品項。刷卡時另付的運費請填在該筆刷卡的「運費」欄。",
 tax:"到台灣後填營業稅。",
 returns:"退貨數量、人民幣、台幣刷退、刷退手續費；退的部分扣回成本並整表重算。",
};
const errorText=(e:unknown)=>e instanceof ApiClientError&&e.code==="ORDERING_VERSION_CONFLICT"?"已被其他人修改，請重新載入":e instanceof Error?e.message:"採購操作失敗";
const VIRTUAL=2e15,DRAFT_PIECE=1e15,NEW_LINE=-1e14,NEW_CARD=-2e14;

export function CnPurchasePanel({order,onSaved,onError,onNotice,confirm,dirtyRef,canReceive,onReceive,photoOf}:{
 order:CnOrder;onSaved:(order:CnOrder)=>void;onError:(message:string)=>void;onNotice:(message:string)=>void;
 confirm:(c:{title:string;description:string;confirmLabel?:string;cancelLabel?:string;confirmTone?:"danger"})=>Promise<boolean>;
 dirtyRef:{current:boolean};canReceive:boolean;onReceive:()=>void;
 /** 自訂中國貨 照片 cell of a line (shared with 叫貨明細). */
 photoOf?:(lineId:number)=>ReactNode;
}){
 const [purchase,setPurchase]=useState<CnPurchase|null>(null),[loading,setLoading]=useState(true);
 const [mode,setMode]=useState<Mode|null>(null),[drafts,setDrafts]=useState<Drafts>({});
 // 品項合計 (pieces folded into one row per item; the default, user 2026-11-11: what 入庫 reads) or
 // 刷卡明細 (one row per card piece; every editing step shows it).
 const [grouping,setGrouping]=useState<"card"|"item">("item");
 const [selectedRows,setSelectedRows]=useState<ReadonlySet<string>>(new Set());
 const [saving,setSaving]=useState(false);
 const [discontinue,setDiscontinue]=useState<{lineId:number;name:string;reason:string}|null>(null);
 const dragging=useRef<string|null>(null),sequence=useRef(0);
 const baseline=useRef("");
 const dirty=mode!==null&&JSON.stringify(drafts)!==baseline.current;
 dirtyRef.current=dirty;
 useUnsavedChangesGuard({active:dirty,blocked:saving,message:"採購資料尚未儲存，確定離開？"});

 async function load(){
  const n=++sequence.current;setLoading(true);
  try{const data=await apiRequest<{order:CnOrder;purchase:CnPurchase}>(ROOT+order.id+"/cn-purchase");if(n!==sequence.current)return;setPurchase(data.purchase);if(data.order.version!==order.version)onSaved(data.order)}
  catch(e){if(n===sequence.current)onError(errorText(e))}finally{if(n===sequence.current)setLoading(false)}
 }
 useEffect(()=>{setMode(null);setDrafts({});void load()},[order.id]);

 const lines=order.lines;
 const stage:CnStage=purchase?cnStage(purchase,order.status==="CLOSED"):"ORDERING";
 const anyReceived=lines.some(l=>l.received>0);

 // ---- What the table shows: the saved purchase, or the open step's draft over it. ----
 const view=useMemo(()=>{
  const info=new Map<number,{seq:number;name:string;full:string;spec:string;unit:string;planned:number|null;line:Line|null;added:boolean;discontinued:boolean;key:string}>();
  const refs:CnLineRef[]=[];
  const od=mode==="order"?drafts.order:undefined;
  const keyToLine=new Map<string,number>();
  lines.filter(l=>!od?.deleted.includes(l.id)).forEach(l=>{
   const draft=od?.lines.find(x=>x.lineId===l.id);
   // 品名／規格 (書籍: 品名／出版社／作者) in one column (user 2026-11-11), as the 叫貨單 wrote them.
   const full=[draft?.itemName??(l.itemName||l.vendorItemName||l.itemCode),...(l.section==="OTHER"?[l.publisher??"",l.author??""]:[draft?.spec??l.spec])].map(x=>x.trim()).filter(Boolean).join("／");
   info.set(l.id,{seq:0,name:draft?.itemName??(l.itemName||l.vendorItemName||l.itemCode),full,spec:l.spec,unit:draft?.unit??l.unit,
    planned:l.purchaseAdded?null:l.originalQuantity??l.quantity,line:l,added:!!l.purchaseAdded,discontinued:!!l.cnDiscontinued,key:"L"+l.id});
   keyToLine.set("L"+l.id,l.id);refs.push({id:l.id,discontinued:!!l.cnDiscontinued});
  });
  od?.lines.filter(x=>!x.lineId).forEach((x,i)=>{const id=NEW_LINE-i;
   info.set(id,{seq:0,name:x.itemName||"（新項目）",full:[x.itemName,x.spec].filter(Boolean).join("／")||"（新項目）",spec:x.spec,unit:x.unit,planned:null,line:null,added:true,discontinued:false,key:x.key});
   keyToLine.set(x.key,id);refs.push({id,discontinued:false});
  });
  refs.forEach((r,i)=>info.get(r.id)!.seq=i+1);
  let pieces:CnPiece[],charges:CnCharge[]=purchase?.charges??[],returns:CnReturn[]=purchase?.returns??[];
  const pieceKey=new Map<number,string>(),cardKeyOf=new Map<number,string>();
  if(od){
   const cardId=new Map<string,number>();
   od.cards.forEach((c,i)=>{const id=c.id??NEW_CARD-i;cardId.set(c.key,id);cardKeyOf.set(id,c.key)});
   charges=[...od.cards.filter(c=>od.pieces.some(p=>p.cardKey===c.key)).map((c,i)=>({id:cardId.get(c.key)!,kind:"CARD" as const,sortOrder:i,chargedOn:c.chargedOn||null,amount:num(parseNtd(c.amount)),fee:num(parseNtd(c.fee)),shipping:num(parseNtd(c.shipping)),note:""})),
    ...(purchase?.charges??[]).filter(c=>c.kind!=="CARD")];
   pieces=od.pieces.map((p,i)=>{const id=DRAFT_PIECE+i;pieceKey.set(id,p.key);
    return {id,lineId:keyToLine.get(p.lineKey)??0,sortOrder:i,quantity:Number(p.quantity)||0,rmbPrice:num(parseRmbFen(p.price)),chargeId:p.cardKey?cardId.get(p.cardKey)??null:null,note:p.note}});
  }else{
   pieces=[...(purchase?.pieces??[])];
   for(const l of lines)if(!l.cnDiscontinued&&!pieces.some(p=>p.lineId===l.id))pieces.push({id:VIRTUAL+l.id,lineId:l.id,sortOrder:0,quantity:l.quantity??0,rmbPrice:null,chargeId:null});
   if(mode==="reconcile"&&drafts.reconcile)charges=charges.map(c=>{const d=drafts.reconcile![c.id];return d?{...c,amount:num(parseNtd(d.amount)),fee:num(parseNtd(d.fee)),shipping:num(parseNtd(d.shipping))}:c});
   if(mode==="shipping"&&drafts.shipping)charges=[...charges.filter(c=>c.kind!=="SHIPPING"),...drafts.shipping.map((s,i)=>({id:-(i+1),kind:"SHIPPING" as const,sortOrder:i,chargedOn:s.chargedOn||null,amount:num(parseNtd(s.amount)),fee:num(parseNtd(s.fee)),note:""}))];
   if(mode==="tax"&&drafts.tax!==undefined)charges=[...charges.filter(c=>c.kind!=="TAX"),...(drafts.tax?[{id:-99,kind:"TAX" as const,sortOrder:0,chargedOn:drafts.tax.chargedOn||null,amount:num(parseNtd(drafts.tax.amount)),fee:null,note:""}]:[])];
   if(mode==="returns"&&drafts.returns)returns=drafts.returns.filter(r=>Number(r.lineId)&&Number(r.quantity)>0).map(r=>({lineId:Number(r.lineId),quantity:Number(r.quantity),rmbAmount:num(parseRmbFen(r.rmb)),ntdAmount:num(parseNtd(r.ntd)),fee:num(parseNtd(r.fee)),reason:r.reason}));
  }
  const calc=computeCnPurchase(refs,{pieces,charges,returns});
  const rows=cnTableRows(refs,{pieces,charges});
  return {info,refs,pieces,charges,returns,calc,rows,pieceKey,cardKeyOf};
 },[lines,purchase,mode,drafts]);

 // ---- Opening, cancelling and saving a step ----
 function open(next:Mode){
  if(!purchase)return;
  const d:Drafts={};
  if(next==="order"){
   const cards=purchase.charges.filter(c=>c.kind==="CARD");
   const pieces:DPiece[]=purchase.pieces.filter(p=>lines.some(l=>l.id===p.lineId&&!l.cnDiscontinued))
    .map((p,i)=>({key:"P"+i,lineKey:"L"+p.lineId,quantity:qtyText(p.quantity),price:fenText(p.rmbPrice),cardKey:p.chargeId?"C"+p.chargeId:null,note:p.note??""}));
   for(const l of lines)if(!l.cnDiscontinued&&!pieces.some(p=>p.lineKey==="L"+l.id))pieces.push({key:"V"+l.id,lineKey:"L"+l.id,quantity:l.quantity===null?"":qtyText(l.quantity),price:"",cardKey:null,note:""});
   d.order={pieces,cards:cards.map(c=>({key:"C"+c.id,id:c.id,chargedOn:c.chargedOn??"",amount:numText(c.amount),fee:numText(c.fee),shipping:numText(c.shipping)})),
    lines:lines.filter(l=>l.purchaseAdded).map(l=>({key:"L"+l.id,lineId:l.id,itemName:l.itemName,spec:l.spec,unit:l.unit})),deleted:[]};
  }
  if(next==="reconcile")d.reconcile=Object.fromEntries(purchase.charges.filter(c=>c.kind==="CARD").map(c=>[c.id,{amount:numText(c.amount),fee:numText(c.fee),shipping:numText(c.shipping)}]));
  if(next==="shipping"){const s=purchase.charges.filter(c=>c.kind==="SHIPPING").map(c=>({chargedOn:c.chargedOn??"",amount:numText(c.amount),fee:numText(c.fee)}));d.shipping=s.length?s:[{chargedOn:today(),amount:"",fee:""}]}
  if(next==="tax"){const t=purchase.charges.find(c=>c.kind==="TAX");d.tax={chargedOn:t?.chargedOn??today(),amount:numText(t?.amount)}}
  if(next==="returns"){const r=purchase.returns.map(x=>({lineId:String(x.lineId),quantity:qtyText(x.quantity),rmb:fenText(x.rmbAmount),ntd:numText(x.ntdAmount),fee:numText(x.fee),reason:x.reason}));
   d.returns=r.length?r:[{lineId:"",quantity:"",rmb:"",ntd:"",fee:"",reason:""}]}
  baseline.current=JSON.stringify(d);setDrafts(d);setSelectedRows(new Set());setMode(next);
 }
 async function cancel(){
  if(dirty&&!await confirm({title:"放棄"+MODE_LABELS[mode!]+"修改？",description:"這一段的修改還沒儲存。",confirmLabel:"放棄修改",cancelLabel:"繼續編輯",confirmTone:"danger"}))return;
  setMode(null);setDrafts({});
 }
 async function send(path:string,method:string,body:Record<string,unknown>,done:string){
  setSaving(true);
  try{
   const data=await apiRequest<{order:CnOrder;purchase:CnPurchase}>(ROOT+order.id+"/cn-purchase"+path,{method,json:{...body,expectedVersion:order.version}});
   setPurchase(data.purchase);onSaved(data.order);setMode(null);setDrafts({});onNotice(done);return true;
  }catch(e){onError(errorText(e));if(e instanceof ApiClientError&&e.code==="ORDERING_VERSION_CONFLICT")void load();return false}
  finally{setSaving(false)}
 }
 async function save(){
  if(!mode)return;
  const bad=(message:string)=>{onError(message);return false};
  if(mode==="order"){
   const d=drafts.order!;
   for(const p of d.pieces){const name=view.info.get(view.pieces[d.pieces.indexOf(p)].lineId)?.name??"";
    if(!(Number(p.quantity)>0))return bad(name+"：採購數量要大於 0");
    if(Number.isNaN(parseRmbFen(p.price)))return bad(name+"：人民幣單價格式不正確");}
   for(const c of d.cards){if(Number.isNaN(parseNtd(c.amount))||Number.isNaN(parseNtd(c.fee))||Number.isNaN(parseNtd(c.shipping)))return bad("刷卡金額請填整數");if(!c.chargedOn)return bad("刷卡日期必填")}
   for(const l of d.lines)if(!l.itemName.trim())return bad("新增項目的品名必填");
   const used=new Set(d.pieces.map(p=>p.cardKey).filter(Boolean));
   await send("/order","PUT",{
    lines:d.lines.map(l=>l.lineId?{lineId:l.lineId,itemName:l.itemName,spec:l.spec,unit:l.unit}:{key:l.key,itemName:l.itemName,spec:l.spec,unit:l.unit}),
    deletedLines:d.deleted,
    cards:d.cards.filter(c=>used.has(c.key)).map(c=>({...(c.id?{id:c.id}:{key:c.key}),chargedOn:c.chargedOn,amount:parseNtd(c.amount),fee:parseNtd(c.fee),shipping:parseNtd(c.shipping)})),
    pieces:d.pieces.map((p,i)=>({lineKey:p.lineKey,quantity:Number(p.quantity),rmbPrice:parseRmbFen(p.price),cardKey:p.cardKey&&used.has(p.cardKey)?p.cardKey:null,sortOrder:i,note:p.note.trim()})),
   },"訂購已儲存");return;
  }
  if(mode==="reconcile"){
   const cards=Object.entries(drafts.reconcile!).map(([id,v])=>({id:Number(id),amount:parseNtd(v.amount),fee:parseNtd(v.fee),shipping:parseNtd(v.shipping)}));
   if(cards.some(c=>Number.isNaN(c.amount)||Number.isNaN(c.fee)||Number.isNaN(c.shipping)))return bad("台幣與手續費請填整數");
   await send("/reconcile","PUT",{cards},"對帳已儲存");return;
  }
  if(mode==="shipping"){
   const items=drafts.shipping!.filter(s=>s.amount||s.fee).map(s=>({chargedOn:s.chargedOn,amount:parseNtd(s.amount),fee:parseNtd(s.fee)}));
   if(items.some(s=>!s.chargedOn||s.amount===null||Number.isNaN(s.amount)||Number.isNaN(s.fee)))return bad("每筆運費要有日期與整數金額");
   await send("/shipping","PUT",{items},"運費已儲存");return;
  }
  if(mode==="tax"){
   const t=drafts.tax;const amount=t?parseNtd(t.amount):null;
   if(t&&amount!==null&&(Number.isNaN(amount)||!t.chargedOn))return bad("營業稅要有日期與整數金額");
   await send("/tax","PUT",{tax:t&&amount!==null?{chargedOn:t.chargedOn,amount}:null},"營業稅已儲存");return;
  }
  const items=drafts.returns!.filter(r=>r.lineId||r.quantity).map(r=>({lineId:Number(r.lineId),quantity:Number(r.quantity),rmbAmount:parseRmbFen(r.rmb),ntdAmount:parseNtd(r.ntd),fee:parseNtd(r.fee),reason:r.reason}));
  if(items.some(r=>!r.lineId||!(r.quantity>0)))return bad("退貨要選品項並填數量");
  if(items.some(r=>Number.isNaN(r.rmbAmount)||Number.isNaN(r.ntdAmount)||Number.isNaN(r.fee)))return bad("退貨金額格式不正確");
  await send("/returns","PUT",{items},"退貨已儲存");
 }
 async function complete(){
  if(!await confirm({title:"完成訂購",description:"進入「已訂購」。之後仍可修改訂購，每次修改都會留下紀錄。",confirmLabel:"完成訂購"}))return;
  await send("/complete","POST",{},"已完成訂購");
 }
 async function markDiscontinued(lineId:number,name:string,reason:string){
  if(!await confirm({title:"標記"+reason,description:"「"+name+"」整列劃掉、備註寫「"+reason+"」並指定結案，不發提醒。之後買得到可以從 ⋯「恢復採購」。",confirmLabel:"標記"+reason,confirmTone:"danger"}))return;
  await send("/discontinue","POST",{lineId,reason},"已標記"+reason);
 }
 async function restore(lineId:number,name:string){
  if(!await confirm({title:"恢復採購",description:"「"+name+"」取消絕版／停產，回到未結案。",confirmLabel:"恢復"}))return;
  await send("/restore","POST",{lineId},"已恢復");
 }

 // ---- 訂購 step editing ----
 const od=drafts.order;
 const setOrder=(f:(d:OrderDraft)=>OrderDraft)=>setDrafts(prev=>({...prev,order:f(prev.order!)}));
 const pieceOf=(row:{piece:CnPiece})=>od?view.pieceKey.get(row.piece.id):undefined;
 const patchPiece=(key:string,patch:Partial<DPiece>)=>setOrder(d=>({...d,pieces:d.pieces.map(p=>p.key===key?{...p,...patch}:p)}));
 const patchCard=(key:string,patch:Partial<DCard>)=>setOrder(d=>({...d,cards:d.cards.map(c=>c.key===key?{...c,...patch}:c)}));
 const seqKey=useRef(0);const fresh=(p:string)=>p+"n"+(++seqKey.current)+"-"+Date.now();
 function groupSelected(cardKey:string|null){
  if(!selectedRows.size)return;
  setOrder(d=>{
   let cards=d.cards,target=cardKey;
   if(target==="new"){target=fresh("N");cards=[...cards,{key:target,chargedOn:today(),amount:"",fee:"",shipping:""}]}
   const chosen=d.pieces.filter(p=>selectedRows.has(p.key)),rest=d.pieces.filter(p=>!selectedRows.has(p.key));
   return {...d,cards,pieces:[...rest,...chosen.map(p=>({...p,cardKey:target}))]};
  });
  setSelectedRows(new Set());
 }
 /** 取消整筆刷卡: every row of that card goes back to 未刷卡 to be charged again. */
 function cancelCard(cardKey:string){setOrder(d=>({...d,pieces:d.pieces.map(p=>p.cardKey===cardKey?{...p,cardKey:null}:p)}))}
 function dropOn(targetKey:string){
  const from=dragging.current;dragging.current=null;if(!from||from===targetKey)return;
  setOrder(d=>{
   const moving=d.pieces.find(p=>p.key===from),target=d.pieces.find(p=>p.key===targetKey);if(!moving||!target)return d;
   const rest=d.pieces.filter(p=>p.key!==from),at=rest.findIndex(p=>p.key===targetKey);
   // Reorder only (user 2026-11-11): a row keeps its card; 刷卡／取消刷卡 decide the card.
   rest.splice(at,0,moving);return {...d,pieces:rest};
  });
 }
 /** 拆分: the row becomes two rows of the same item (half each); the quantities are then typed in the table. */
 function splitPiece(key:string){
  setOrder(d=>{const i=d.pieces.findIndex(x=>x.key===key);if(i<0)return d;const p=d.pieces[i],total=Number(p.quantity)||0;
   const half=total>=2?Math.floor(total/2):total/2;const next=[...d.pieces];
   next.splice(i,1,{...p,quantity:qtyText(total-half)},{...p,key:fresh("S"),quantity:qtyText(half),cardKey:null,note:""});return {...d,pieces:next}});
 }
 function addLine(){
  const key=fresh("N");
  setOrder(d=>({...d,lines:[...d.lines,{key,itemName:"",spec:"",unit:""}],pieces:[...d.pieces,{key:fresh("P"),lineKey:key,quantity:"1",price:"",cardKey:null,note:""}]}));
 }
 function removeLine(lineKey:string){
  setOrder(d=>{const line=d.lines.find(l=>l.key===lineKey);
   return {...d,lines:d.lines.filter(l=>l.key!==lineKey),pieces:d.pieces.filter(p=>p.lineKey!==lineKey),deleted:line?.lineId?[...d.deleted,line.lineId]:d.deleted}});
 }

 if(loading&&!purchase)return <p className="cy-op-empty">載入採購資料…</p>;
 if(!purchase)return <p className="cy-op-empty">無法載入採購資料。<button type="button" className="cy-op-button compact soft" onClick={()=>void load()}>重新載入</button></p>;

 const {calc,rows,info}=view,t=calc.totals;
 const closed=stage==="CLOSED";
 const cardsShown=view.charges.filter(c=>c.kind==="CARD");
 const steps:Mode[]=closed?[]:["order",...(purchase.orderedAt?["reconcile","shipping"] as Mode[]:[]),
  ...(purchase.charges.some(c=>c.kind==="SHIPPING")?["tax"] as Mode[]:[]),...(anyReceived?["returns"] as Mode[]:[])];
 const unit=(v:number|null,d:number)=>v===null?<span className="cy-cn-mut">—</span>:ntdText(v,d);

 // ---- One table row per piece ----
 // 商品／書籍 (user 2026-11-11): a heavy line where the 書籍 begin, outside any card group.
 const isBook=(lineId:number)=>info.get(lineId)?.line?.section==="OTHER";
 const bookStarts=new Set(rows.filter((r,k)=>k>0&&!r.card&&!rows[k-1].card&&isBook(r.piece.lineId)&&!isBook(rows[k-1].piece.lineId)).map(r=>r.piece.id));
 const body=rows.map(row=>{
  const i=info.get(row.piece.lineId)!,r=calc.pieces.get(row.piece.id),key=pieceOf(row),editing=mode==="order"&&!!key&&!row.discontinued;
  const dp=key?od!.pieces.find(p=>p.key===key):undefined;
  const ret=view.returns.find(x=>x.lineId===row.piece.lineId);
  const purchased=view.pieces.filter(p=>p.lineId===row.piece.lineId).reduce((s,p)=>s+p.quantity,0);
  const derived=row.discontinued?(i.line?.closedNote||"絕版／停產"):!row.firstOfLine?"拆分自項次 "+i.seq
   :[i.planned!==null&&purchased!==i.planned?(purchased>i.planned?"多訂 ":"少訂 ")+qtyText(Math.abs(purchased-i.planned)):"",i.line?.note??""].filter(Boolean).join("；");
  const note=[row.piece.note??"",derived].filter(Boolean).join("；");
  const card=row.card,cardKey=card?view.cardKeyOf.get(card.id):undefined,dc=cardKey?od?.cards.find(c=>c.key===cardKey):undefined;
  const rc=card&&mode==="reconcile"?drafts.reconcile?.[card.id]:undefined;
  const menu:OverflowItem[]=[];
  if(editing&&dp){menu.push({label:"拆分",onClick:()=>splitPiece(dp.key)});
   if(od!.pieces.filter(p=>p.lineKey===dp.lineKey).length>1)menu.push({label:"刪除這段",onClick:()=>setOrder(d=>({...d,pieces:d.pieces.filter(p=>p.key!==dp.key)})),danger:true});
   if(i.added)menu.push({label:"刪除這個新增項目",onClick:()=>removeLine(dp.lineKey),danger:true});}
  if(!mode&&!closed&&row.firstOfLine&&i.line){
   if(i.discontinued)menu.push({label:"恢復採購",onClick:()=>void restore(i.line!.id,i.name)});
   else if(!i.line.closedAs)for(const reason of ["絕版","停產"])menu.push({label:"標記"+reason,onClick:()=>void markDiscontinued(i.line!.id,i.name,reason),danger:true});
  }
  // Only the ⠿ handle drags (user 2026-11-11: a draggable row could not have its text selected); the row is the drop target.
  const dragProps=editing&&dp?{
   onDragOver:(e:DragEvent)=>{if(dragging.current){e.preventDefault();e.dataTransfer.dropEffect="move"}},onDrop:(e:DragEvent)=>{e.preventDefault();dropOn(dp.key)}}:{};
  const newLine=od?.lines.find(l=>l.key===dp?.lineKey&&!l.lineId);
  let group:ReactNode=null;
  if(row.discontinued)group=<td className="cy-cn-grp is-none" colSpan={5}>—</td>;
  else if(row.cardSpan&&card)group=<>
   <td className="cy-cn-grp is-no" rowSpan={row.cardSpan}>#{row.cardNo}{dc?<button type="button" className="cy-cn-card-cancel" title="取消這筆刷卡，品項回到未刷卡" aria-label={"取消刷卡 #"+row.cardNo} onClick={()=>cancelCard(dc.key)}>×</button>:null}</td>
   <td className="cy-cn-grp" rowSpan={row.cardSpan}>{dc?<DateInput className="cy-ordering-cell" aria-label={"刷卡 #"+row.cardNo+" 日期"} value={dc.chargedOn} onChange={v=>patchCard(dc.key,{chargedOn:v})}/>:mdShort(card.chargedOn)}</td>
   <td className="cy-cn-grp is-n" rowSpan={row.cardSpan}>{dc?<input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"刷卡 #"+row.cardNo+" 台幣"} value={dc.amount} onChange={e=>patchCard(dc.key,{amount:e.target.value})}/>
    :rc?<input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"刷卡 #"+row.cardNo+" 台幣"} value={rc.amount} onChange={e=>setDrafts(p=>({...p,reconcile:{...p.reconcile!,[card.id]:{...rc,amount:e.target.value}}}))}/>
    :card.amount===null?<span className="cy-cn-todo">待補</span>:ntdText(card.amount)}</td>
   <td className={"cy-cn-grp is-n"+(card.fee===null&&!rc?" cy-cn-todo":"")} rowSpan={row.cardSpan}>{rc?<input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"刷卡 #"+row.cardNo+" 手續費"} value={rc.fee} onChange={e=>setDrafts(p=>({...p,reconcile:{...p.reconcile!,[card.id]:{...rc,fee:e.target.value}}}))}/>
    :card.fee===null?"待補":ntdText(card.fee)}</td>
   <td className="cy-cn-grp is-n" rowSpan={row.cardSpan} title="這筆刷卡專屬的運費，只攤給這筆刷卡的品項">{dc?<input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"刷卡 #"+row.cardNo+" 運費"} value={dc.shipping} onChange={e=>patchCard(dc.key,{shipping:e.target.value})}/>
    :rc?<input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"刷卡 #"+row.cardNo+" 運費"} value={rc.shipping} onChange={e=>setDrafts(p=>({...p,reconcile:{...p.reconcile!,[card.id]:{...rc,shipping:e.target.value}}}))}/>
    :card.shipping?ntdText(card.shipping):<span className="cy-cn-mut">—</span>}</td></>;
  else if(row.unchargedSpan)group=<td className="cy-cn-grp is-none" colSpan={5} rowSpan={row.unchargedSpan}>未刷卡</td>;
  const checked=!!dp&&selectedRows.has(dp.key);
  return <tr key={row.piece.id} className={(row.discontinued?"cy-row-struck ":"")+(row.cardNo%2===1?"is-band":"")+(checked?" is-picked":"")+(bookStarts.has(row.piece.id)?" is-book-start":"")} {...dragProps}>
   {mode==="order"?<td className="cy-cn-lead">{editing&&dp?<><span className="cy-cn-handle" draggable title="拖曳調整順序" aria-label={"拖曳 "+i.name}
     onDragStart={e=>{dragging.current=dp.key;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",dp.key);const tr=(e.currentTarget as HTMLElement).closest("tr");if(tr)e.dataTransfer.setDragImage(tr,12,12)}}
     onDragEnd={()=>{dragging.current=null}}>{Icons.grip}</span>
    <input type="checkbox" checked={checked} aria-label={"選取 "+i.name} onChange={e=>setSelectedRows(prev=>{const n=new Set(prev);if(e.target.checked)n.add(dp.key);else n.delete(dp.key);return n})}/></>:null}</td>:null}
   <td className="is-c cy-cn-seq">{i.seq}</td>
   <td className="cy-cn-name">{newLine&&row.firstOfLine?<input className="cy-ordering-cell" aria-label="新增項目品名" placeholder="品名" value={newLine.itemName} onChange={e=>setOrder(d=>({...d,lines:d.lines.map(l=>l.key===newLine.key?{...l,itemName:e.target.value}:l)}))}/>
    :<span className="cy-cn-name-in">{row.firstOfLine&&i.line&&photoOf?photoOf(i.line.id):null}<span className="cy-cn-name-text" title={i.full}>{i.full}</span>{i.added&&row.firstOfLine?<span className="cy-cn-tag">採購新增</span>:null}</span>}</td>
   <td className="is-n cy-cn-mut">{row.firstOfLine?(i.planned===null?"—":qtyText(i.planned)):""}</td>
   <td className="is-n">{editing&&dp?<input className="cy-ordering-cell is-n" inputMode="decimal" aria-label={i.name+" 採購數量"} value={dp.quantity} onChange={e=>patchPiece(dp.key,{quantity:e.target.value})}/>:qtyText(row.piece.quantity)}{i.unit&&!editing?<small className="cy-cn-unit">{i.unit}</small>:null}</td>
   <td className="is-n">{editing&&dp?<input className="cy-ordering-cell is-n" inputMode="decimal" aria-label={i.name+" 人民幣單價"} value={dp.price} onChange={e=>patchPiece(dp.key,{price:e.target.value})}/>:rmbText(row.piece.rmbPrice)}</td>
   <td className="is-n">{rmbText(r?.rmbSubtotal)}</td>
   {group}
   <td className="is-n">{unit(r?.ntdUnit??null,1)}</td>
   <td className="is-n cy-cn-mut">{unit(r?.rate??null,2)}</td>
   <td className="is-n">{row.firstOfLine&&ret?<span>{qtyText(ret.quantity)}・{ret.ntdAmount===null?"—":ntdText(ret.ntdAmount)}</span>:<span className="cy-cn-mut">—</span>}</td>
   <td className="is-n"><b>{unit(r?.landedUnit??null,1)}</b></td>
   <td className="is-n cy-cn-mut">{unit(r?.totalRate??null,2)}</td>
   <td className="cy-cn-note" title={note||undefined}>{editing&&dp?<input className="cy-ordering-cell" maxLength={200} aria-label={i.name+" 備註"} placeholder={derived||undefined} value={dp.note} onChange={e=>patchPiece(dp.key,{note:e.target.value})}/>:note}</td>
   <td className="is-c cy-cn-act">{menu.length?<OverflowMenu label={"更多操作："+i.name} items={menu}/>:null}</td>
  </tr>;
 });

 // ---- Footer: 刷卡小計, 運費, 營業稅, 退貨刷退, 總計 ----
 const lead=mode==="order"?<td className="cy-cn-lead"/>:null;
 const shippingRows=mode==="shipping"?drafts.shipping!.map((s,k)=><tr key={"s"+k} className="cy-cn-sub is-edit">{lead}
   <td colSpan={6} className="cy-cn-lab is-r">{k===0?"回台灣運費":""}</td><td/>
   <td><DateInput className="cy-ordering-cell" aria-label={"運費 "+(k+1)+" 日期"} value={s.chargedOn} onChange={v=>setDrafts(p=>({...p,shipping:p.shipping!.map((x,j)=>j===k?{...x,chargedOn:v}:x)}))}/></td>
   <td className="is-n"><input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"運費 "+(k+1)+" 金額"} value={s.amount} onChange={e=>setDrafts(p=>({...p,shipping:p.shipping!.map((x,j)=>j===k?{...x,amount:e.target.value}:x)}))}/></td>
   <td className="is-n"><input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"運費 "+(k+1)+" 手續費"} value={s.fee} onChange={e=>setDrafts(p=>({...p,shipping:p.shipping!.map((x,j)=>j===k?{...x,fee:e.target.value}:x)}))}/></td>
   <td colSpan={7} className="is-n">{ntdText((num(parseNtd(s.amount))??0)+(num(parseNtd(s.fee))??0))}</td>
   <td className="is-c cy-cn-act"><IconButton icon={Icons.remove} label={"刪除運費 "+(k+1)} variant="table" tone="danger" onClick={()=>setDrafts(p=>({...p,shipping:p.shipping!.filter((_,j)=>j!==k)}))}/></td></tr>)
  :view.charges.filter(c=>c.kind==="SHIPPING").map((c,k)=><tr key={"s"+c.id} className="cy-cn-sub">{lead}
   <td colSpan={6} className="cy-cn-lab is-r">{k===0?"回台灣運費":""}</td><td/><td>{mdShort(c.chargedOn)}</td>
   <td className="is-n">{ntdText(c.amount)}</td><td className="is-n">{c.fee===null?"":ntdText(c.fee)}</td><td colSpan={8} className="is-n">{ntdText((c.amount??0)+(c.fee??0))}</td></tr>);
 const tax=view.charges.find(c=>c.kind==="TAX");
 const returnRows=mode==="returns"?[<tr key="rh" className="cy-cn-sub cy-cn-subhead"><td colSpan={6} className="cy-cn-lab is-r">退貨品項</td><td colSpan={2} className="is-n">數量</td>
   <td className="is-n">人民幣</td><td className="is-n">台幣刷退</td><td className="is-n">刷退手續費</td><td colSpan={6}>原因</td><td/></tr>,
  ...drafts.returns!.map((r,k)=>{
   const set=(patch:Partial<DReturn>)=>setDrafts(p=>({...p,returns:p.returns!.map((x,j)=>j===k?{...x,...patch}:x)}));
   return <tr key={"r"+k} className="cy-cn-sub is-edit">{lead}
    <td colSpan={6}><select className="cy-ordering-cell" aria-label={"退貨 "+(k+1)+" 品項"} value={r.lineId} onChange={e=>set({lineId:e.target.value})}>
     <option value="">選擇品項</option>{lines.filter(l=>l.received>0&&!l.cnDiscontinued).map(l=><option key={l.id} value={l.id}>{info.get(l.id)?.seq}. {l.itemName||l.vendorItemName}（已到 {qtyText(l.received)}）</option>)}</select></td>
    <td colSpan={2}><input className="cy-ordering-cell is-n" inputMode="decimal" aria-label={"退貨 "+(k+1)+" 數量"} value={r.quantity} onChange={e=>set({quantity:e.target.value})}/></td>
    <td><input className="cy-ordering-cell is-n" inputMode="decimal" aria-label={"退貨 "+(k+1)+" 人民幣"} value={r.rmb} onChange={e=>set({rmb:e.target.value})}/></td>
    <td><input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"退貨 "+(k+1)+" 台幣刷退"} value={r.ntd} onChange={e=>set({ntd:e.target.value})}/></td>
    <td><input className="cy-ordering-cell is-n" inputMode="numeric" aria-label={"退貨 "+(k+1)+" 刷退手續費"} value={r.fee} onChange={e=>set({fee:e.target.value})}/></td>
    <td colSpan={6}><input className="cy-ordering-cell" maxLength={200} aria-label={"退貨 "+(k+1)+" 原因"} value={r.reason} onChange={e=>set({reason:e.target.value})}/></td>
    <td className="is-c cy-cn-act"><IconButton icon={Icons.remove} label={"刪除退貨 "+(k+1)} variant="table" tone="danger" onClick={()=>setDrafts(p=>({...p,returns:p.returns!.filter((_,j)=>j!==k)}))}/></td></tr>})]
  :view.returns.map((r,k)=>{const name=info.get(r.lineId)?.name??"";return <tr key={"r"+r.lineId} className="cy-cn-sub">{lead}
   <td colSpan={6} className="cy-cn-lab is-r">{k===0?"退貨刷退":""}</td>
   <td colSpan={5} className="cy-cn-mut">{name} {qtyText(r.quantity)} {info.get(r.lineId)?.unit||"個"}{r.rmbAmount!==null?"，"+rmbText(r.rmbAmount):""}{r.reason?"（"+r.reason+"）":""}</td>
   <td colSpan={7} className="is-n">−{ntdText(r.ntdAmount??0)}{r.fee?<small className="cy-cn-mut">（手續費 ＋{ntdText(r.fee)}）</small>:null}</td></tr>});
 const footer=<tfoot>
  <tr className="cy-cn-sub">{lead}<td colSpan={5}/><td className="is-n">{rmbText(t.rmb)}</td><td colSpan={2} className="cy-cn-lab">刷卡小計</td>
   <td className="is-n">{ntdText(t.cardAmount)}</td><td className="is-n">{ntdText(t.cardFee)}</td><td className="is-n">{t.cardShipping?ntdText(t.cardShipping):""}</td><td colSpan={7} className="is-n">NT$ {ntdText(t.cardAmount+t.cardFee+t.cardShipping)}</td></tr>
  {shippingRows}
  {mode==="shipping"?<tr className="cy-cn-sub">{lead}<td colSpan={18}><button type="button" className="cy-op-button mini soft" onClick={()=>setDrafts(p=>({...p,shipping:[...p.shipping!,{chargedOn:today(),amount:"",fee:""}]}))}>＋ 新增運費</button></td></tr>:null}
  {mode==="tax"?<tr className="cy-cn-sub is-edit">{lead}<td colSpan={6} className="cy-cn-lab is-r">營業稅</td><td/>
   <td><DateInput className="cy-ordering-cell" aria-label="營業稅日期" value={drafts.tax?.chargedOn??""} onChange={v=>setDrafts(p=>({...p,tax:{chargedOn:v,amount:p.tax?.amount??""}}))}/></td>
   <td className="is-n"><input className="cy-ordering-cell is-n" inputMode="numeric" aria-label="營業稅金額" value={drafts.tax?.amount??""} onChange={e=>setDrafts(p=>({...p,tax:{chargedOn:p.tax?.chargedOn??today(),amount:e.target.value}}))}/></td>
   <td/><td colSpan={8} className="cy-cn-mut">清空金額後儲存＝刪除營業稅</td></tr>
   :tax?<tr className="cy-cn-sub">{lead}<td colSpan={6} className="cy-cn-lab is-r">營業稅</td><td/><td>{mdShort(tax.chargedOn)}</td><td className="is-n">{ntdText(tax.amount)}</td><td/><td colSpan={8} className="is-n">{ntdText(tax.amount)}</td></tr>:null}
  {returnRows}
  {mode==="returns"?<tr className="cy-cn-sub">{lead}<td colSpan={18}><button type="button" className="cy-op-button mini soft" onClick={()=>setDrafts(p=>({...p,returns:[...p.returns!,{lineId:"",quantity:"",rmb:"",ntd:"",fee:"",reason:""}]}))}>＋ 新增退貨</button></td></tr>:null}
  <tr className="cy-cn-grand">{lead}<td colSpan={6} className="is-r">含稅含運總計</td><td colSpan={5} className="cy-cn-mut">{t.grand===null&&t.missingCardAmount?"刷卡台幣待補 "+t.missingCardAmount+" 筆":t.unchargedPieces?"未含未刷卡 "+t.unchargedPieces+" 項":""}</td>
   <td colSpan={7} className="is-n">{t.grand===null?"—":"NT$ "+ntdText(t.grand)}</td></tr>
 </tfoot>;

 // ---- 品項合計: one row per item, card columns folded into 台幣小計 ----
 const byItem=!mode&&grouping==="item";
 const sums=byItem?summarizeCnLines(view.refs,view.pieces,calc.pieces):null;
 const itemRows=sums?view.refs.map(ref=>{
  const i=info.get(ref.id)!,x=sums.get(ref.id)!,ret=view.returns.find(r=>r.lineId===ref.id);
  const pieceNotes=view.pieces.filter(p=>p.lineId===ref.id).map(p=>p.note??"").filter(Boolean).join("；");
  const note=i.discontinued?(i.line?.closedNote||"絕版／停產"):[pieceNotes,i.planned!==null&&x.quantity!==i.planned?(x.quantity>i.planned?"多訂 ":"少訂 ")+qtyText(Math.abs(x.quantity-i.planned)):"",
   (()=>{const n=view.pieces.filter(p=>p.lineId===ref.id).length;return n>1?"分 "+n+" 筆刷卡":""})(),i.line?.note??""].filter(Boolean).join("；");
  const menu:OverflowItem[]=[];
  if(!closed&&i.line){if(i.discontinued)menu.push({label:"恢復採購",onClick:()=>void restore(i.line!.id,i.name)});
   else if(!i.line.closedAs)for(const reason of ["絕版","停產"])menu.push({label:"標記"+reason,onClick:()=>void markDiscontinued(i.line!.id,i.name,reason),danger:true});}
  const firstBook=i.line?.section==="OTHER"&&view.refs.find(r=>info.get(r.id)?.line?.section==="OTHER")?.id===ref.id&&view.refs[0]?.id!==ref.id;
  return <tr key={ref.id} className={(i.discontinued?"cy-row-struck":"")+(firstBook?" is-book-start":"")}>
   <td className="is-c">{i.seq}</td>
   <td className="cy-cn-name"><span className="cy-cn-name-in">{i.line&&photoOf?photoOf(i.line.id):null}<span className="cy-cn-name-text" title={i.full}>{i.full}</span>{i.added?<span className="cy-cn-tag">採購新增</span>:null}</span></td>
   <td className="is-n cy-cn-mut">{i.planned===null?"—":qtyText(i.planned)}</td>
   <td className="is-n">{qtyText(i.discontinued?0:x.quantity)}{i.unit?<small className="cy-cn-unit">{i.unit}</small>:null}</td>
   <td className="is-n" title={x.rmbUnit!==null?"人民幣小計 ÷ 採購數量":undefined}>{x.rmbUnit===null?<span className="cy-cn-mut">—</span>:"¥"+ntdText(x.rmbUnit/100,2)}</td>
   <td className="is-n">{rmbText(x.rmbSubtotal)}</td>
   <td className="is-n">{unit(x.ntdShare,0)}</td>
   <td className="is-n">{unit(x.ntdUnit,1)}</td>
   <td className="is-n cy-cn-mut">{unit(x.rate,2)}</td>
   <td className="is-n">{ret?<span>{qtyText(ret.quantity)}・{ret.ntdAmount===null?"—":ntdText(ret.ntdAmount)}</span>:<span className="cy-cn-mut">—</span>}</td>
   <td className="is-n">{unit(x.landedTotal,0)}</td>
   <td className="is-n"><b>{unit(x.landedUnit,1)}</b></td>
   <td className="is-n cy-cn-mut">{unit(x.totalRate,2)}</td>
   <td className="cy-cn-note" title={note||undefined}>{note}</td>
   <td className="is-c cy-cn-act">{menu.length?<OverflowMenu label={"更多操作："+i.name} items={menu}/>:null}</td>
  </tr>}):null;
 const shippingTotal=view.charges.filter(c=>c.kind==="SHIPPING").reduce((n,c)=>n+(c.amount??0)+(c.fee??0),0);
 // Every amount sits in the 台幣小計 column so the column adds up; 含稅含運小計 adds up to the same 總計.
 const itemFooter=<tfoot>
  <tr className="cy-cn-sub"><td colSpan={5} className="cy-cn-lab is-r">刷卡（含手續費）</td><td className="is-n">{rmbText(t.rmb)}</td><td className="is-n">{ntdText(t.cardAmount+t.cardFee)}</td>
   <td colSpan={8} className="cy-cn-mut">{cardsShown.length} 筆刷卡{t.missingFee?" · 手續費待補 "+t.missingFee+" 筆":""}</td></tr>
  {t.cardShipping?<tr className="cy-cn-sub"><td colSpan={6} className="cy-cn-lab is-r">刷卡運費</td><td className="is-n">{ntdText(t.cardShipping)}</td><td colSpan={8} className="cy-cn-mut">各自攤給同一筆刷卡的品項</td></tr>:null}
  {shippingTotal?<tr className="cy-cn-sub"><td colSpan={6} className="cy-cn-lab is-r">回台灣運費</td><td className="is-n">{ntdText(shippingTotal)}</td><td colSpan={8} className="cy-cn-mut">{view.charges.filter(c=>c.kind==="SHIPPING").length} 筆，依各品項成本分攤</td></tr>:null}
  {tax?<tr className="cy-cn-sub"><td colSpan={6} className="cy-cn-lab is-r">營業稅</td><td className="is-n">{ntdText(tax.amount)}</td><td colSpan={8} className="cy-cn-mut">依各品項成本分攤</td></tr>:null}
  {t.refund||t.refundFee?<tr className="cy-cn-sub"><td colSpan={6} className="cy-cn-lab is-r">退貨刷退</td><td className="is-n">−{ntdText(t.refund-t.refundFee)}</td>
   <td colSpan={8} className="cy-cn-mut">{view.returns.map(r=>(info.get(r.lineId)?.name??"")+" "+qtyText(r.quantity)).join("、")}{t.refundFee?"（刷退手續費 ＋"+ntdText(t.refundFee)+"）":""}</td></tr>:null}
  <tr className="cy-cn-grand"><td colSpan={6} className="is-r">含稅含運總計</td><td className="is-n">{t.grand===null?"—":ntdText(t.grand)}</td>
   <td colSpan={3} className="cy-cn-mut">{t.grand===null&&t.missingCardAmount?"刷卡台幣待補 "+t.missingCardAmount+" 筆":t.unchargedPieces?"未含未刷卡 "+t.unchargedPieces+" 項":""}</td>
   <td className="is-n">{t.grand===null?"—":ntdText(t.grand)}</td><td colSpan={4}/></tr>
 </tfoot>;

 const orderedText=purchase.orderedAt?(()=>{const p=orderingTaipeiDateTime(purchase.orderedAt);return "完成訂購 "+(p?.date??"")+(purchase.orderedBy?" · "+purchase.orderedBy:"")})():"";
 const stageTone=stage==="CLOSED"?"success":stage==="ORDERING"?"neutral":"info";
 return <section className="cy-cn" aria-label="中國貨採購">
  <div className="cy-cn-head">
   <div className="cy-cn-title"><StatusChip tone={stageTone}>{CN_STAGE_LABELS[stage]}</StatusChip>{orderedText?<span className="cy-cn-meta">{orderedText}</span>:null}
    {mode?null:<SegmentedControl compact label="採購表檢視" value={grouping} onChange={setGrouping} options={[{value:"card",label:"刷卡明細"},{value:"item",label:"品項合計"}]}/>}</div>
   {mode?<div className="cy-cn-acts"><span className="cy-cn-editing">編輯：{MODE_LABELS[mode]}</span>
     <button type="button" className="cy-op-button compact" disabled={saving} onClick={()=>void cancel()}>取消</button>
     <button type="button" className="cy-op-button compact primary" disabled={saving||!dirty} onClick={()=>void save()}>儲存</button></div>
    :<div className="cy-cn-acts">
     {steps.map(s=><button key={s} type="button" className="cy-op-button compact" disabled={saving} onClick={()=>open(s)}>{MODE_LABELS[s]}</button>)}
     {!closed&&!purchase.orderedAt?<button type="button" className="cy-op-button compact primary" disabled={saving||!purchase.pieces.length} title={purchase.pieces.length?undefined:"先在「訂購」填採購數量與單價"} onClick={()=>void complete()}>完成訂購</button>:null}
     {canReceive?<button type="button" className="cy-op-button compact primary" disabled={saving} onClick={onReceive}>登記到貨</button>:null}
     <button type="button" className="cy-op-button compact" onClick={print}>列印</button>
    </div>}
  </div>
  {mode?<p className="cy-cn-hint">{MODE_HINTS[mode]}</p>:null}
  {mode==="order"?<div className="cy-cn-bar">
   {/* user 2026-11-11: tick one row = one card, several rows = one combined card; 取消刷卡 sends them back. */}
   <span>{selectedRows.size?"已勾選 "+selectedRows.size+" 列":"勾選要刷卡的列（勾一列＝單筆，勾多列＝合併成一筆）"}</span>
   <button type="button" className="cy-op-button compact primary" disabled={!selectedRows.size} onClick={()=>groupSelected("new")}>刷卡</button>
   <button type="button" className="cy-op-button compact soft" disabled={!selectedRows.size} onClick={()=>groupSelected(null)}>取消刷卡</button>
   {selectedRows.size?<button type="button" className="cy-op-button compact soft" onClick={()=>setSelectedRows(new Set())}>取消勾選</button>:null}
   <span className="cy-cn-sp"/>
   <button type="button" className="cy-op-button compact soft" onClick={addLine}>＋ 新增項目</button>
  </div>:null}
  <div className="cy-cn-scroll cy-cn-print">
   <h2 className="cy-cn-print-title">{order.sourceName} · 採購 · {CN_STAGE_LABELS[stage]}</h2>
   {byItem?<table className="cy-ordering-grid cy-cn-table is-items">
    <colgroup><col className="w-seq"/><col/><col className="w-qty"/><col className="w-qty2"/><col className="w-rmb"/><col className="w-rmb2"/><col className="w-ntd2"/>
     <col className="w-unit"/><col className="w-rate"/><col className="w-ret"/><col className="w-ntd2"/><col className="w-land"/><col className="w-rate2"/><col className="w-note"/><col className="w-act"/></colgroup>
    <thead><tr><th className="is-c">項次</th><th>品名／規格（出版社／作者）</th><th className="is-n">原定</th><th className="is-n">採購數量</th><th className="is-n">人民幣單價</th><th className="is-n">人民幣小計</th>
     <th className="is-n">台幣小計</th><th className="is-n">台幣單價</th><th className="is-n">匯率</th><th className="is-n">退貨<br/><small>數量・刷退</small></th><th className="is-n">含稅含運<br/>小計</th><th className="is-n">含稅含運<br/>單價</th>
     <th className="is-n">總匯率</th><th>備註</th><th className="is-c"><span className="cy-visually-hidden">操作</span></th></tr></thead>
    <tbody>{itemRows}</tbody>
    {itemFooter}
   </table>:<table className={"cy-ordering-grid cy-cn-table"+(mode?" is-editing":"")}>
    <colgroup>{mode==="order"?<col className="w-lead"/>:null}<col className="w-seq"/><col/><col className="w-qty"/><col className="w-qty2"/><col className="w-rmb"/><col className="w-rmb2"/><col className="w-no"/><col className="w-date"/>
     <col className="w-ntd"/><col className="w-fee"/><col className="w-fee"/><col className="w-unit"/><col className="w-rate"/><col className="w-ret"/><col className="w-land"/><col className="w-rate2"/><col className="w-note"/><col className="w-act"/></colgroup>
    <thead><tr>{mode==="order"?<th className="cy-cn-lead" aria-label="拖曳與勾選"/>:null}<th className="is-c">項次</th><th>品名／規格（出版社／作者）</th><th className="is-n">原定</th><th className="is-n">採購數量</th><th className="is-n">人民幣單價</th><th className="is-n">人民幣小計</th>
     <th className="is-c">刷卡</th><th>刷卡日期</th><th className="is-n">台幣</th><th className="is-n">手續費</th><th className="is-n" title="這筆刷卡專屬的運費">運費</th><th className="is-n">台幣單價</th><th className="is-n">匯率</th>
     <th className="is-n">退貨<br/><small>數量・刷退</small></th><th className="is-n">含稅含運<br/>單價</th><th className="is-n">總匯率</th><th>備註</th><th className="is-c"><span className="cy-visually-hidden">操作</span></th></tr></thead>
    <tbody>{body}</tbody>
    {footer}
   </table>}
  </div>
  <p className="cy-cn-foot">{[t.unchargedPieces?"未刷卡 "+t.unchargedPieces+" 項":"",t.missingFee?"手續費待補 "+t.missingFee+" 筆":"",
   "算法：每筆刷卡的金額＋手續費、以及該筆刷卡的運費，依人民幣小計分給這筆刷卡的品項；回台灣運費與營業稅再依各品項成本（刷卡分攤＋刷卡運費－刷退＋刷退手續費）分給全部品項，只由留下的貨負擔。全部以整數台幣分配，各列加總剛好等於實際金額；單價＝小計 ÷ 數量。"].filter(Boolean).join(" · ")}</p>
 </section>;
}

function num(v:number|null):number|null{return v===null||Number.isNaN(v)?null:v}
function print(){
 document.body.classList.add("cy-cn-printing");
 window.addEventListener("afterprint",()=>document.body.classList.remove("cy-cn-printing"),{once:true});
 window.print();
}
