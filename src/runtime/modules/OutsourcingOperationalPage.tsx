import {useEffect,useMemo,useState,type FormEvent} from "react";
import {RecordSheet,RecordRows,type RowColumn} from "../../ui/forms/RecordSheet";
import {EntryTable,EntryHeading} from "../../ui/forms/EntryTable";
import {Field} from "../../ui/forms/Field";
import {DateInput} from "../../ui/forms/DateInput";
import {Dialog} from "../../ui/overlays/Dialog";
import {ModuleSections} from "../../ui/mobile/ModuleSections";
import {OverflowMenu} from "../../ui/mobile/OverflowMenu";
import {EntityPicker} from "../../ui/pickers/EntityPicker";
import {StockGauge,ProductionGauge} from "../../ui/data/StockGauge";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {taipeiToday} from "../../../shared/erp-query-history";
import {formatScaled4,formatMoney2} from "../../../shared/fixed-point";
import {loadOutsourcingLookups,searchContractors,searchBoms,loadBomDetail} from "../api/outsourcing-runtime-client";
import {flowApi,type FlowOrder,type FlowStock,type Statement} from "../api/outsourcing-flow-client";
import {ContractorWorkspace,BomWorkspace,outsourcingErrorMessage} from "./OutsourcingMasterData";
import type {BomSummary,ContractorSummary} from "../../../shared/contractor-outsourcing";
import type {OutsourcingItemOption} from "../../../shared/business-lookups";
import "./outsourcing-operational.css";

type Tab="orders"|"statements"|"stock"|"contractors"|"boms";
type ItemDraft={key:number;item:OutsourcingItemOption|null;quantity:string;unit:string;bomId:number|null};
type OrderDraft={contractorId:number|null;orderDate:string;note:string;products:ItemDraft[]};
type Action="issue"|"receipt"|"return"|"adjust"|"statement-create"|"statement-edit"|"payment"|"close"|null;
type MaterialDraft={key:number;item:OutsourcingItemOption|null;quantity:string;unit:string};
type DeliveryDraft={orderProductId:number;quantity:string;unit:string;bomId:number|null};
const tabs:readonly {key:Tab;label:string}[]=[
 {key:"orders",label:"代工單"},{key:"statements",label:"對帳付款"},{key:"stock",label:"代工庫存"},
 {key:"contractors",label:"協力廠商／單價"},{key:"boms",label:"BOM"}
];
const statusLabel:Record<string,string>={pending_issue:"待發料",in_production:"生產中",delivered:"已交齊",closed:"已結案",
 draft:"草稿",confirmed:"已確認",partial:"部分付款",paid:"已付清"};
const searchItems=async(q:string)=>(await loadOutsourcingLookups({itemQuery:q,limit:30})).items;
const number=(n:number)=>new Intl.NumberFormat("zh-TW",{maximumFractionDigits:4}).format(n/10000);
const money=(n:number|null|undefined)=>n==null?"—":new Intl.NumberFormat("zh-TW",{minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
let nextKey=0;
const newLine=():ItemDraft=>({key:++nextKey,item:null,quantity:"",unit:"",bomId:null});
const newMaterial=():MaterialDraft=>({key:++nextKey,item:null,quantity:"",unit:""});
const button=(text:string,fn:()=>void,busy:boolean,primary=false)=><button type="button" className={"cy-op-button mini "+(primary?"primary":"soft")} disabled={busy} onClick={fn}>{text}</button>;
function Grid({label,headers,children}:{label:string;headers:readonly string[];children:React.ReactNode}){
 return <EntryTable label={label}><thead><tr>{headers.map(h=><th key={h} scope="col"><EntryHeading>{h}</EntryHeading></th>)}</tr></thead><tbody><tr>{children}</tr></tbody></EntryTable>;
}
function Cell({label,children}:{label:string;children:React.ReactElement}){
 return <td><Field label={label} presentation="cell">{children}</Field></td>;
}
function ItemSelect({value,onChange,disabled=false}:{value:OutsourcingItemOption|null;onChange:(v:OutsourcingItemOption|null)=>void;disabled?:boolean}){
 return <EntityPicker label="商品" value={value} onSelect={onChange} search={searchItems}
 getKey={r=>r.id} getLabel={r=>r.itemNo+" "+r.name} disabled={disabled} minQueryLength={0}/>;
}
function unitSelect(item:OutsourcingItemOption|null,unit:string,change:(s:string)=>void,busy:boolean){
 return <select className="cy-sheet-input" disabled={busy||!item} value={unit} onChange={e=>change(e.target.value)}>
 {(item?.allowedUnits??[]).map(u=><option key={u} value={u}>{u}</option>)}</select>;
}

export function OutsourcingOperationalPage(){
 const [tab,setTab]=useState<Tab>("orders");
 const [epoch,refresh]=useState(0);
 const [contractors,setContractors]=useState<ContractorSummary[]>([]);
 const [boms,setBoms]=useState<BomSummary[]>([]);
 const [orders,setOrders]=useState<FlowOrder[]>([]);
 const [order,setOrder]=useState<FlowOrder|null>(null);
 const [orderId,setOrderId]=useState<number|null>(null);
 const [orderSearch,setOrderSearch]=useState("");
 const [draft,setDraft]=useState<OrderDraft|null>(null);
 const [stock,setStock]=useState<FlowStock[]>([]);
 const [showAllStock,setShowAllStock]=useState(false);
 const [stockSearch,setStockSearch]=useState("");
 const [stockContractor,setStockContractor]=useState<number|null>(null);
 const [statements,setStatements]=useState<Statement[]>([]);
 const [statement,setStatement]=useState<Statement|null>(null);
 const [statementId,setStatementId]=useState<number|null>(null);
 const [action,setAction]=useState<Action>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [entryDate,setEntryDate]=useState(taipeiToday());
 const [entryNote,setEntryNote]=useState("");
 const [erpNo,setErpNo]=useState("");
 const [materials,setMaterials]=useState<MaterialDraft[]>([]);
 const [deliveries,setDeliveries]=useState<DeliveryDraft[]>([]);
 const [stockKind,setStockKind]=useState<"return"|"adjust">("return");
 const [stockReason,setStockReason]=useState("盤點差異");
 const [stockActual,setStockActual]=useState(true);
 const [statementVendor,setStatementVendor]=useState<number|null>(null);
 const [statementMonth,setStatementMonth]=useState(taipeiToday().slice(0,7));
 const [unbilled,setUnbilled]=useState<Record<string,any>[]>([]);
 const [selectedUnbilled,setSelectedUnbilled]=useState<number[]>([]);
 const [priceRows,setPriceRows]=useState<{id:number;unitPrice:string}[]>([]);
 const [adjustments,setAdjustments]=useState<{key:number;description:string;amount:string}[]>([]);
 const [paymentAmount,setPaymentAmount]=useState("");
 const [paymentMethod,setPaymentMethod]=useState("transfer");

 useEffect(()=>{
  let live=true;
  Promise.all([searchContractors({limit:100}),searchBoms({limit:100}),flowApi.listOrders(),flowApi.statements(),flowApi.stock(undefined,showAllStock)])
   .then(([c,b,o,s,g])=>{if(!live)return;setContractors([...c.items]);setBoms([...b.items]);setOrders(o.items);
    setStatements(s.items);setStock(g.items);}).catch(e=>{if(live)setError(outsourcingErrorMessage(e));});
  return()=>{live=false;};
 },[epoch,showAllStock]);
 useEffect(()=>{
  if(orderId==null){setOrder(null);return;}
  let live=true;flowApi.order(orderId).then(o=>{if(live)setOrder(o);}).catch(e=>{if(live)setError(outsourcingErrorMessage(e));});
  return()=>{live=false;};
 },[orderId,epoch]);
 useEffect(()=>{
  if(statementId==null){setStatement(null);return;}
  let live=true;flowApi.statement(statementId).then(s=>{if(live)setStatement(s);}).catch(e=>{if(live)setError(outsourcingErrorMessage(e));});
  return()=>{live=false;};
 },[statementId,epoch]);
 useEffect(()=>{
  if(action!=="statement-create"||statementVendor==null)return;
  let live=true;flowApi.unbilled(statementVendor,statementMonth||undefined).then(x=>{
   if(!live)return;setUnbilled(x.items);setSelectedUnbilled(x.items.map(i=>i.receipt_item_id));
  }).catch(e=>{if(live)setError(outsourcingErrorMessage(e));});
  return()=>{live=false;};
 },[action,statementVendor,statementMonth]);

 const reload=()=>refresh(e=>e+1);
 const run=async(task:()=>Promise<unknown>,after?:()=>void)=>{
  if(busy)return;setBusy(true);setError("");
  try{await task();setMessage("已儲存");setAction(null);after?.();reload();}
  catch(e){setError(outsourcingErrorMessage(e));}finally{setBusy(false);}
 };
 function openOrderCreate(){setDraft({contractorId:contractors[0]?.id??null,orderDate:taipeiToday(),note:"",products:[newLine()]});setOrderId(null);setOrder(null);}
 function patchLine(index:number,value:Partial<ItemDraft>){setDraft(d=>d?{...d,products:d.products.map((p,i)=>i===index?{...p,...value}:p)}:d);}
 function selectFinished(index:number,item:OutsourcingItemOption|null){
  const options=boms.filter(b=>b.isActive&&b.finishedItemId===item?.id);
  patchLine(index,{item,unit:item?.baseUnit??"",bomId:options.length===1?options[0].id:null});
 }
 const orderColumns:RowColumn<ItemDraft>[]=[
  {label:"成品",view:p=>p.item?.name??"—",edit:(p,i)=><ItemSelect value={p.item} onChange={v=>selectFinished(i,v)}/>},
  {label:"BOM",view:p=>boms.find(b=>b.id===p.bomId)?.recipeRef??"—",edit:(p,i)=><select className="cy-sheet-input" value={p.bomId??""} onChange={e=>patchLine(i,{bomId:e.target.value?Number(e.target.value):null})}>
    <option value="">不指定</option>{boms.filter(b=>b.isActive&&b.finishedItemId===p.item?.id).map(b=><option key={b.id} value={b.id}>{b.recipeRef}</option>)}</select>},
  {label:"預計數量",width:"120px",view:p=>p.quantity,edit:(p,i)=><input className="cy-sheet-input" inputMode="decimal" value={p.quantity} onChange={e=>patchLine(i,{quantity:e.target.value})}/>},
  {label:"單位",width:"110px",view:p=>p.unit,edit:(p,i)=>unitSelect(p.item,p.unit,v=>patchLine(i,{unit:v}),busy)}
 ];
 const active=order?.products??[];
 const productsColumns:RowColumn<FlowOrder["products"][number]>[]=[
  {label:"成品",view:p=>p.item_no+" "+p.item_name,edit:()=> <span/>},
  {label:"BOM",view:p=>p.recipe_ref??"—",edit:()=> <span/>},
  {label:"預計",view:p=>number(p.planned_quantity)+" "+p.unit,edit:()=> <span/>},
  {label:"已交",view:p=>number(p.delivered_quantity)+" "+p.unit,edit:()=> <span/>},
  {label:"進度",view:p=><ProductionGauge planned={p.planned_quantity} delivered={p.delivered_quantity}/>,edit:()=> <span/>}
 ];
 function begin(actionName:Action){
  setAction(actionName);setEntryDate(taipeiToday());setEntryNote("");setErpNo("");setError("");
  setMaterials([newMaterial()]);
  if(actionName==="receipt"&&order)setDeliveries(order.products.map(p=>({orderProductId:p.id,quantity:"",unit:p.unit,bomId:p.bom_recipe_id})));
  if(actionName==="statement-create"){const vendor=statementVendor??contractors[0]?.id??null;setStatementVendor(vendor);}
  if(actionName==="statement-edit"&&statement){
   setPriceRows(statement.lines.map(l=>({id:l.id,unitPrice:l.unit_price==null?"":formatScaled4(l.unit_price)})));
   setAdjustments(statement.adjustments.map(a=>({key:++nextKey,description:a.description,amount:formatMoney2(a.amount)})));
  }
 }
 function patchMaterial(index:number,update:Partial<MaterialDraft>){setMaterials(rows=>rows.map((r,i)=>i===index?{...r,...update}:r));}
 const materialColumns:RowColumn<MaterialDraft>[]=[
  {label:"料件",view:p=>p.item?.name??"",edit:(p,i)=><ItemSelect value={p.item} onChange={v=>patchMaterial(i,{item:v,unit:v?.baseUnit??""})}/>},
  {label:action==="adjust"?(stockActual?"實際數量":"增減量"):"數量",width:"150px",view:p=>p.quantity,edit:(p,i)=><input className="cy-sheet-input" inputMode="decimal" value={p.quantity} onChange={e=>patchMaterial(i,{quantity:e.target.value})}/>},
  {label:"單位",width:"120px",view:p=>p.unit,edit:(p,i)=>unitSelect(p.item,p.unit,v=>patchMaterial(i,{unit:v}),busy)}
 ];
 const grouped=useMemo(()=>{
  const map=new Map<number,FlowStock[]>();
  for(const item of stock.filter(x=>(stockContractor==null||x.contractorId===stockContractor)&&
    (!stockSearch||[x.contractorName,x.itemNo,x.itemName].some(y=>y.includes(stockSearch))))){
   map.set(item.contractorId,[...(map.get(item.contractorId)??[]),item]);}
  return [...map.entries()];
 },[stock,stockContractor,stockSearch]);
 async function submitAction(e:FormEvent){
  e.preventDefault();
  if(action==="issue"&&order)await run(()=>flowApi.issue(order.id,{expectedRevision:order.revision,date:entryDate,note:entryNote,
    items:materials.filter(x=>x.item&&x.quantity).map(x=>({itemId:x.item!.id,quantity:x.quantity,unit:x.unit}))}));
  if(action==="receipt"&&order)await run(()=>flowApi.receive(order.id,{expectedRevision:order.revision,date:entryDate,erpNo,note:entryNote,
    items:deliveries.filter(x=>x.quantity).map(x=>({orderProductId:x.orderProductId,quantity:x.quantity,unit:x.unit,bomRecipeId:x.bomId}))}));
  if((action==="return"||action==="adjust")&&stockContractor)
   await run(()=>flowApi.stockEvent({contractorId:stockContractor,type:action,date:entryDate,reason:stockReason,note:entryNote,
    items:materials.filter(x=>x.item&&x.quantity).map(x=>({itemId:x.item!.id,unit:x.unit,
      ...(action==="return"?{quantity:x.quantity}:stockActual?{actualQuantity:x.quantity}:{delta:x.quantity})}))}));
  if(action==="close"&&order)await run(()=>flowApi.close(order.id,order.revision,entryNote));
  if(action==="statement-create"&&statementVendor)await run(async()=>{
   const s=await flowApi.createStatement({contractorId:statementVendor,date:entryDate,month:statementMonth||null,receiptItemIds:selectedUnbilled});
   setStatementId(s.id);setTab("statements");
  });
  if(action==="statement-edit"&&statement)await run(()=>flowApi.editStatement(statement.id,{expectedRevision:statement.revision,
   lines:priceRows.map(r=>({id:r.id,unitPrice:r.unitPrice})),adjustments:adjustments.map(a=>({description:a.description,amount:a.amount}))}));
  if(action==="payment"&&statement)await run(()=>flowApi.addPayment(statement.id,{expectedRevision:statement.revision,date:entryDate,method:paymentMethod,amount:paymentAmount,note:entryNote}));
 }

 return <div className="cy-op-module cy-outsourcing-op">
  <ModuleSections label="委外代工" sections={tabs} value={tab} onChange={setTab}/>
  {error?<p className="cy-op-error" role="alert">{error}</p>:null}{message?<p className="cy-op-hint">{message}</p>:null}
  {tab==="orders"?<div className="cy-op-master-detail">
    <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>代工單</h2>{button("＋ 新增",openOrderCreate,busy,true)}</div>
     <input className="cy-op-input" role="searchbox" placeholder="搜尋廠商／單號" value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}/>
     {orders.filter(o=>!orderSearch||o.outsourcing_ref.includes(orderSearch)||o.contractor_name_snapshot.includes(orderSearch)).map(o=>
      <button key={o.id} className={"cy-op-list-row "+(o.id===orderId?"active":"")} onClick={()=>{setDraft(null);setOrderId(o.id);}}>
       <strong>{o.contractor_name_snapshot}</strong><small>{o.outsourcing_ref} · {o.order_date}</small><span>{statusLabel[o.statusCode]??o.statusCode}</span>
      </button>)}
    </section>
    <section className="cy-op-panel">
     {draft?<form onSubmit={e=>{e.preventDefault();void run(async()=>{const created=await flowApi.createOrder({
       contractorId:draft.contractorId,orderDate:draft.orderDate,note:draft.note,products:draft.products.map(p=>({
         itemId:p.item?.id,bomRecipeId:p.bomId,quantity:p.quantity,unit:p.unit}))});setOrderId(created.id);setDraft(null);});}} onKeyDown={enterAdvancesFields}>
       <div className="cy-op-panel-header"><h2>新增代工單</h2></div>
       <RecordSheet label="代工單資料" editing rows={[
        {columns:"2fr 1fr",cells:[
         {label:"協力廠商",required:true,view:"",edit:<select className="cy-sheet-input" value={draft.contractorId??""} onChange={e=>setDraft({...draft,contractorId:Number(e.target.value)||null})}><option value="">請選擇</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select>},
         {label:"工單日期",required:true,view:"",edit:<DateInput value={draft.orderDate} onChange={v=>setDraft({...draft,orderDate:v})}/>}
        ]},
        {columns:"1fr",cells:[{label:"備註",view:"",edit:<input className="cy-sheet-input" value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/>}]}
       ]}/>
       <RecordRows title="成品" editing columns={orderColumns} rows={draft.products} rowKey={p=>p.key} onInsert={i=>setDraft(d=>d?{...d,products:[...d.products.slice(0,i+1),newLine(),...d.products.slice(i+1)]}:d)} onRemove={i=>setDraft(d=>d?{...d,products:d.products.filter((_,j)=>i!==j)}:d)}/>
       <div className="cy-op-form-footer"><button type="button" className="cy-op-button soft" onClick={()=>setDraft(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div>
      </form>:order?<div>
       <div className="cy-record-header"><div><h2>{order.contractor_name_snapshot}</h2><small>{order.outsourcing_ref} · {statusLabel[order.statusCode]}</small></div>
        <div className="cy-record-actions">{!order.closed_at?<>
          {button("＋ 發料",()=>begin("issue"),busy,true)}{button("＋ 交貨入庫",()=>begin("receipt"),busy,true)}
          {button("結案",()=>begin("close"),busy)}
         </>:button("重新開啟",()=>void run(()=>flowApi.reopen(order.id,order.revision)),busy)}
         <OverflowMenu items={[{label:"刪除空白代工單",danger:true,disabled:busy,onClick:()=>void run(()=>flowApi.deleteOrder(order.id,order.revision),()=>setOrderId(null))}]}/>
        </div></div>
       <RecordSheet label="代工單資料" editing={false} rows={[
        {columns:"2fr 1fr 1fr",cells:[{label:"廠商",view:order.contractor_name_snapshot},{label:"工單日期",view:order.order_date},{label:"狀態",view:statusLabel[order.statusCode]}]},
        {columns:"1fr",cells:[{label:"備註",view:order.note}]}
       ]}/>
       <RecordRows title="成品" editing={false} columns={productsColumns} rows={active} rowKey={p=>p.id} onInsert={()=>{}} onRemove={()=>{}}/>
       <RecordRows title="發料紀錄" editing={false} rows={order.issues} rowKey={r=>r.id} onInsert={()=>{}} onRemove={()=>{}} columns={[
        {label:"日期",view:r=>r.issued_date,edit:()=> <span/>},
        {label:"料件",view:r=>r.items.map(i=>i.item_no+" "+i.name+" "+number(i.quantity)+" "+i.unit).join("、"),edit:()=> <span/>},
        {label:"備註",view:r=>r.cancelled_at?"已取消":r.note??"",edit:()=> <span/>},
        {label:"操作",view:r=>r.cancelled_at?"—":button("取消發料",()=>void run(()=>flowApi.cancelIssue(order.id,r.id,order.revision)),busy),edit:()=> <span/>}
       ]}/>
       <RecordRows title="交貨入庫" editing={false} rows={order.receipts} rowKey={r=>r.id} onInsert={()=>{}} onRemove={()=>{}} columns={[
        {label:"日期",view:r=>r.received_date,edit:()=> <span/>},
        {label:"ERP 單號",view:r=>r.erp_no,edit:()=> <span/>},
        {label:"成品",view:r=>r.items.map(i=>i.name+" "+number(i.quantity)+" "+i.unit).join("、"),edit:()=> <span/>},
        {label:"對帳狀態",view:r=>r.cancelled_at?"已取消":r.items.some(i=>i.statement_status==="confirmed")?"已確認":r.items.some(i=>i.statement_status==="draft")?"對帳中":"待對帳",edit:()=> <span/>},
        {label:"操作",view:r=>r.cancelled_at?"—":button("取消交貨",()=>void run(()=>flowApi.cancelReceipt(order.id,r.id,order.revision)),busy),edit:()=> <span/>}
       ]}/>
      </div>:<p>請選擇代工單，或新增代工單。</p>}
    </section>
   </div>:null}

  {tab==="stock"?<section className="cy-op-panel">
   <div className="cy-op-panel-header"><h2>代工庫存</h2><div className="cy-record-actions">
    {button("退料",()=>{setStockKind("return");begin("return");},busy)}
    {button("盤點調整",()=>{setStockKind("adjust");begin("adjust");},busy)}
    {button("異動紀錄",()=>begin("stock-history" as Action),busy)}
   </div></div>
   <div className="cy-op-toolbar"><input className="cy-op-input" placeholder="搜尋廠商／料件" value={stockSearch} onChange={e=>setStockSearch(e.target.value)}/>
    <select className="cy-op-input" value={stockContractor??""} onChange={e=>setStockContractor(Number(e.target.value)||null)}>
      <option value="">全部廠商</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select>
    <label><input type="checkbox" checked={showAllStock} onChange={e=>setShowAllStock(e.target.checked)}/> 顯示零庫存</label>
   </div>
   {grouped.map(([vendor,rows])=><details key={vendor} open><summary><strong>{rows[0].contractorName}</strong> · {rows[0].billingMethod==="monthly"?"月結":"單次"} · {rows.length} 種料件</summary>
     <table className="cy-op-table cy-rt"><thead><tr><th>品號</th><th>料件</th><th>電池條</th><th>現有</th><th>基準（補料後）</th><th>操作</th></tr></thead><tbody>
      {rows.map(r=><tr key={r.itemId}><td>{r.itemNo}</td><td data-priority="title">{r.itemName}</td>
       <td><StockGauge quantity={r.quantity} baseline={r.baseline} percentage={r.percentage} tone={r.tone}/></td>
       <td className={Number(r.quantity)<0?"cy-op-error":""}>{r.quantity} {r.unit}</td><td>{r.baseline} {r.unit}</td>
       <td>{button("退料",()=>{setStockContractor(vendor);begin("return");},busy)} {button("盤點調整",()=>{setStockContractor(vendor);begin("adjust");},busy)}</td></tr>)}
     </tbody></table>
   </details>)}{!grouped.length?<p>沒有符合條件的庫存。</p>:null}
  </section>:null}

  {tab==="statements"?<div className="cy-op-master-detail">
    <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>對帳付款</h2>{button("＋ 建立對帳單",()=>begin("statement-create"),busy,true)}</div>
      {statements.map(s=><button key={s.id} className={"cy-op-list-row "+(s.id===statementId?"active":"")} onClick={()=>setStatementId(s.id)}>
       <strong>{s.contractor_name}</strong><small>{s.period_month??s.statement_date}</small><span>NT$ {money(s.total_amount)} · {statusLabel[s.paymentStatus]}</span></button>)}
    </section>
    <section className="cy-op-panel">{statement?<div>
      <div className="cy-record-header"><h2>{statement.contractor_name} · {statusLabel[statement.paymentStatus]}</h2>
      <div className="cy-record-actions">{statement.status_code==="draft"?<>
        {button("修改單價與費用",()=>begin("statement-edit"),busy)}
        {button("確認對帳",()=>void run(()=>flowApi.confirmStatement(statement.id,statement.revision)),busy,true)}
        {button("刪除草稿",()=>void run(()=>flowApi.deleteStatement(statement.id,statement.revision),()=>setStatementId(null)),busy)}
      </>:<>
        {button("＋ 付款",()=>begin("payment"),busy,true)}
        {statement.payments.length===0?button("取消確認",()=>void run(()=>flowApi.unconfirmStatement(statement.id,statement.revision)),busy):null}
      </>}</div></div>
      <RecordSheet label="對帳單表頭" editing={false} rows={[{columns:"2fr 1fr 1fr",cells:[
       {label:"廠商",view:statement.contractor_name},{label:"對帳日期",view:statement.statement_date},{label:"對帳月份",view:statement.period_month??"單次"}
      ]}]}/>
      <table className="cy-op-table cy-rt"><thead><tr>{["日期","代工單","ERP 單號","成品","數量","計價單位","單價","金額"].map(h=><th key={h}>{h}</th>)}</tr></thead>
       <tbody>{statement.lines.map(l=><tr key={l.id}><td>{l.received_date}</td><td>{l.outsourcing_ref}</td><td>{l.erp_no??"—"}</td><td>{l.item_no} {l.item_name}</td>
        <td className="num">{number(l.quantity)}</td><td>{l.pricing_unit}</td><td className="num">{l.unit_price==null?"待填":formatScaled4(l.unit_price)}</td><td className="num">{money(l.amount)}</td></tr>)}</tbody></table>
      <table className="cy-op-table"><thead><tr><th>其他費用／折讓</th><th>金額</th></tr></thead><tbody>
       {statement.adjustments.map(a=><tr key={a.id}><td>{a.description}</td><td className="num">{money(a.amount)}</td></tr>)}
       <tr><th>合計（四捨五入到元）</th><td className="num"><strong>NT$ {money(statement.total_amount)}</strong></td></tr>
      </tbody></table>
      <h3>付款紀錄</h3><table className="cy-op-table cy-rt"><thead><tr><th>日期</th><th>方式</th><th>金額</th><th>備註</th><th>操作</th></tr></thead><tbody>
       {statement.payments.map(p=><tr key={p.id}><td>{p.payment_date}</td><td>{({cash:"現金",transfer:"匯款",cheque:"支票",other:"其他"} as Record<string,string>)[p.method]}</td>
        <td>{money(p.amount)}</td><td>{p.note}</td><td>{button("刪除",()=>void run(()=>flowApi.deletePayment(statement.id,p.id,statement.revision)),busy)}</td></tr>)}
      </tbody></table><p>已付款 NT$ {money(statement.paid_amount)}／應付款 NT$ {money(statement.total_amount)}</p>
    </div>:<p>請選擇對帳單。</p>}</section>
   </div>:null}

  {tab==="contractors"?<ContractorWorkspace contractors={contractors} onChanged={reload} onEditingChange={()=>{}} notify={setMessage} reportError={setError}/>:null}
  {tab==="boms"?<BomWorkspace boms={boms} onChanged={reload} onEditingChange={()=>{}} notify={setMessage} reportError={setError}/>:null}

  <Dialog open={action!==null} title={{
    issue:"新增發料",receipt:"新增交貨入庫",return:"退料",adjust:"盤點調整","statement-create":"建立對帳單",
    "statement-edit":"修改對帳單",payment:"登記付款",close:"結案"
  }[action??"issue"]??"異動紀錄"} size={action==="close"?"small":action==="payment"?"medium":"large"} onClose={()=>setAction(null)}>
   <form onSubmit={e=>void submitAction(e)} onKeyDown={enterAdvancesFields}>
    {action==="issue"||action==="receipt"||action==="return"||action==="adjust"||action==="payment"||action==="statement-create"?<Grid label="日期資料" headers={action==="receipt"?["日期","ERP 單號"]:["日期","備註"]}>
      <Cell label="日期"><DateInput value={entryDate} onChange={setEntryDate}/></Cell>
      <Cell label={action==="receipt"?"ERP 單號":"備註"}><input className="cy-sheet-input" value={action==="receipt"?erpNo:entryNote} onChange={e=>action==="receipt"?setErpNo(e.target.value):setEntryNote(e.target.value)}/></Cell>
     </Grid>:null}
    {action==="issue"||action==="return"||action==="adjust"?<>
     {action==="adjust"?<Grid label="調整設定" headers={["調整原因","數量方式"]}>
      <Cell label="調整原因"><select className="cy-sheet-input" value={stockReason} onChange={e=>setStockReason(e.target.value)}>
       {["損耗","盤點差異","其他"].map(s=><option key={s}>{s}</option>)}</select></Cell>
      <Cell label="數量方式"><select className="cy-sheet-input" value={stockActual?"actual":"delta"} onChange={e=>setStockActual(e.target.value==="actual")}>
       <option value="actual">實際數量</option><option value="delta">增減量</option></select></Cell>
     </Grid>:null}
     {action!=="issue"?<Grid label="代工庫存廠商" headers={["協力廠商"]}><Cell label="協力廠商"><select className="cy-sheet-input" value={stockContractor??""} onChange={e=>setStockContractor(Number(e.target.value)||null)}>
      <option value="">選擇廠商</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></Cell></Grid>:null}
     <RecordRows title="料件" editing columns={materialColumns} rows={materials} rowKey={m=>m.key} onInsert={i=>setMaterials(m=>[...m.slice(0,i+1),newMaterial(),...m.slice(i+1)])} onRemove={i=>setMaterials(m=>m.filter((_,j)=>j!==i))}/>
    </>:null}
    {action==="receipt"&&order?<RecordRows title="本批成品" editing rows={deliveries} rowKey={d=>d.orderProductId} onInsert={()=>{}} onRemove={i=>setDeliveries(d=>d.filter((_,j)=>j!==i))}
      columns={[
       {label:"成品",view:d=>order.products.find(p=>p.id===d.orderProductId)?.item_name,edit:d=><span>{order.products.find(p=>p.id===d.orderProductId)?.item_name}</span>},
       {label:"未交",view:d=>{const p=order.products.find(p=>p.id===d.orderProductId);return p?number(Math.max(0,p.planned_quantity-p.delivered_quantity)):"";},edit:d=><span>{number(Math.max(0,(order.products.find(p=>p.id===d.orderProductId)?.planned_quantity??0)-(order.products.find(p=>p.id===d.orderProductId)?.delivered_quantity??0)))}</span>},
       {label:"本次數量",view:d=>d.quantity,edit:d=><input className="cy-sheet-input" value={d.quantity} inputMode="decimal" onChange={e=>setDeliveries(ds=>ds.map(r=>r.orderProductId===d.orderProductId?{...r,quantity:e.target.value}:r))}/>},
       {label:"單位",view:d=>d.unit,edit:d=><select className="cy-sheet-input" value={d.unit} onChange={e=>setDeliveries(ds=>ds.map(r=>r.orderProductId===d.orderProductId?{...r,unit:e.target.value}:r))}>
        <option value={d.unit}>{d.unit}</option></select>},
       {label:"BOM",view:d=>boms.find(b=>b.id===d.bomId)?.recipeRef??"—",edit:d=><select className="cy-sheet-input" value={d.bomId??""} onChange={e=>setDeliveries(ds=>ds.map(r=>r.orderProductId===d.orderProductId?{...r,bomId:Number(e.target.value)||null}:r))}>
        <option value="">不扣料</option>{boms.filter(b=>b.isActive&&b.finishedItemId===order.products.find(p=>p.id===d.orderProductId)?.item_id).map(b=><option key={b.id} value={b.id}>{b.recipeRef}</option>)}</select>}
      ]}/>:null}
    {action==="statement-create"?<><Grid label="廠商與結算月份" headers={["協力廠商","結算月份"]}>
      <Cell label="協力廠商"><select className="cy-sheet-input" value={statementVendor??""} onChange={e=>setStatementVendor(Number(e.target.value)||null)}>
       <option value="">請選擇</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></Cell>
      <Cell label="結算月份"><input className="cy-sheet-input" type="month" value={statementMonth} onChange={e=>setStatementMonth(e.target.value)}/></Cell>
     </Grid><h3>未對帳交貨明細</h3>
     <table className="cy-op-table"><thead><tr><th>選取</th><th>交貨日期</th><th>代工單</th><th>成品</th><th>數量</th></tr></thead><tbody>
      {unbilled.map(r=><tr key={r.receipt_item_id}><td><input type="checkbox" checked={selectedUnbilled.includes(r.receipt_item_id)} onChange={e=>setSelectedUnbilled(ids=>e.target.checked?[...ids,r.receipt_item_id]:ids.filter(id=>id!==r.receipt_item_id))}/></td>
       <td>{r.received_date}</td><td>{r.outsourcing_ref}</td><td>{r.item_name}</td><td>{number(r.quantity)} {r.unit}</td></tr>)}
     </tbody></table></>:null}
    {action==="statement-edit"&&statement?<><h3>修改單價</h3><table className="cy-op-table cy-sheet-table editing"><thead><tr><th>成品</th><th>單價</th></tr></thead><tbody>{statement.lines.map(l=><tr key={l.id}><td>{l.item_name}</td><td><Field label="單價" presentation="cell"><input className="cy-sheet-input" inputMode="decimal" value={priceRows.find(r=>r.id===l.id)?.unitPrice??""} onChange={e=>setPriceRows(rows=>rows.map(r=>r.id===l.id?{...r,unitPrice:e.target.value}:r))}/></Field></td></tr>)}</tbody></table>
     <h3>其他費用／折讓</h3>{adjustments.map((a,i)=><Grid key={a.key} label="費用或折讓" headers={["說明","金額（可負數）"]}>
      <Cell label="說明"><input className="cy-sheet-input" value={a.description} onChange={e=>setAdjustments(rows=>rows.map((r,j)=>i===j?{...r,description:e.target.value}:r))}/></Cell>
      <Cell label="金額"><input className="cy-sheet-input" inputMode="decimal" value={a.amount} onChange={e=>setAdjustments(rows=>rows.map((r,j)=>i===j?{...r,amount:e.target.value}:r))}/></Cell>
     </Grid>)}{button("＋ 其他費用／折讓",()=>setAdjustments(a=>[...a,{key:++nextKey,description:"",amount:"0"}]),busy)}
    </>:null}
    {action==="payment"?<Grid label="付款" headers={["付款方式","金額"]}>
     <Cell label="付款方式"><select className="cy-sheet-input" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>
       <option value="cash">現金</option><option value="transfer">匯款</option><option value="cheque">支票</option><option value="other">其他</option></select></Cell>
     <Cell label="金額"><input className="cy-sheet-input" inputMode="decimal" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></Cell>
    </Grid>:null}
    {action==="close"?<Grid label="結案原因" headers={["原因"]}><Cell label="原因"><input className="cy-sheet-input" required value={entryNote} onChange={e=>setEntryNote(e.target.value)}/></Cell></Grid>:null}
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button soft" onClick={()=>setAction(null)}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy}>確認</button></div>
   </form>
  </Dialog>
 </div>;
}
