import {useEffect,useState,type FormEvent} from "react";
import {RecordSheet,RecordRows,type RowColumn} from "../../ui/forms/RecordSheet";
import {EntryTable,EntryHeading} from "../../ui/forms/EntryTable";
import {Field} from "../../ui/forms/Field";
import {DateInput} from "../../ui/forms/DateInput";
import {Dialog} from "../../ui/overlays/Dialog";
import {ModuleSections} from "../../ui/mobile/ModuleSections";
import {ListRow} from "../../ui/mobile/ListRow";
import {ActionBar} from "../../ui/mobile/ActionBar";
import {DataViewToolbar} from "../../ui/data/DataViewToolbar";
import {useCompactLayout} from "../../ui/foundation/useCompactLayout";
import {MasterDetailBack,useMasterDetailPane} from "../../ui/layout/MasterDetail";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {OverflowMenu} from "../../ui/mobile/OverflowMenu";
import {EntityPicker} from "../../ui/pickers/EntityPicker";
import {StockGauge,ProductionGauge} from "../../ui/data/StockGauge";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {formatDate} from "../../ui/foundation/format";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {StatusFilter} from "../../ui/data/StatusFilter";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {MasterDetailEmpty} from "../../ui/layout/MasterDetail";
import type {StatusTone} from "./status-flow";
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
type Action="issue"|"receipt"|"return"|"adjust"|"statement-create"|"statement-edit"|"payment"|"close"|"stock-history"|null;
type MaterialDraft={key:number;item:OutsourcingItemOption|null;quantity:string;unit:string};
type DeliveryDraft={orderProductId:number;quantity:string;unit:string;bomId:number|null};
const tabs:readonly {key:Tab;label:string}[]=[
 {key:"orders",label:"代工單"},{key:"statements",label:"對帳付款"},{key:"stock",label:"代工庫存"},
 {key:"contractors",label:"協力廠商／單價"},{key:"boms",label:"BOM"}
];
const statusLabel:Record<string,string>={pending_issue:"待發料",in_production:"生產中",delivered:"已交齊",closed:"已結案",
 draft:"草稿",confirmed:"已確認",partial:"部分付款",paid:"已付清"};
const statusTone:Record<string,StatusTone>={pending_issue:"warning",in_production:"info",delivered:"success",closed:"neutral",
 draft:"warning",confirmed:"info",partial:"info",paid:"success"};
const orderStatusOptions=(["pending_issue","in_production","delivered","closed"] as const).map(code=>({code,label:statusLabel[code],tone:statusTone[code]}));
const statementStatusOptions=(["draft","confirmed","partial","paid"] as const).map(code=>({code,label:statusLabel[code],tone:statusTone[code]}));
/** draft until confirmed; afterwards the payment state decides. */
const statementState=(s:{status_code:string;paymentStatus:string})=>s.status_code==="draft"?"draft":s.paymentStatus==="paid"||s.paymentStatus==="partial"?s.paymentStatus:"confirmed";
const chip=(code:string)=><StatusChip tone={statusTone[code]??"neutral"}>{statusLabel[code]??code}</StatusChip>;
const searchItems=async(q:string)=>(await loadOutsourcingLookups({itemQuery:q,limit:30})).items;
const number=(n:number)=>new Intl.NumberFormat("zh-TW",{maximumFractionDigits:4}).format(n/10000);
const money=(n:number|null|undefined)=>n==null?"—":new Intl.NumberFormat("zh-TW",{minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
let nextKey=0;
const newLine=():ItemDraft=>({key:++nextKey,item:null,quantity:"",unit:"",bomId:null});
const newMaterial=():MaterialDraft=>({key:++nextKey,item:null,quantity:"",unit:""});
/** Record header actions: same compact buttons as 叫貨／門市. */
const button=(text:string,fn:()=>void,busy:boolean,primary=false)=><button type="button" className={"cy-op-button compact"+(primary?" primary":"")} disabled={busy} onClick={fn}>{text}</button>;
/** Row-level actions inside tables: small soft buttons. */
const rowButton=(text:string,fn:()=>void,busy:boolean)=><button type="button" className="cy-op-button mini soft" disabled={busy} onClick={fn}>{text}</button>;
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
 const compact=useCompactLayout();
 const orderPane=useMasterDetailPane();
 const statementPane=useMasterDetailPane();
 const [masterEditing,setMasterEditing]=useState(false);
 const {confirm,confirmationDialog}=useConfirmation();
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
 const [stockGroups,setStockGroups]=useState<Awaited<ReturnType<typeof flowApi.groupedStock>>["items"]>([]);
 const [stockHistory,setStockHistory]=useState<Record<string,unknown>[]>([]);
 const [preview,setPreview]=useState<Awaited<ReturnType<typeof flowApi.consumptionPreview>>["items"]>([]);
 const [stockContractor,setStockContractor]=useState<number|null>(null);
 const [statements,setStatements]=useState<Statement[]>([]);
 const [statement,setStatement]=useState<Statement|null>(null);
 const [statementId,setStatementId]=useState<number|null>(null);
 const [action,setAction]=useState<Action>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessageRaw,reportError,messageTone]=useFeedbackMessage<string|null>(null);
 const setError=(value:string)=>{if(value)reportError(value);else setMessageRaw(null);};
 const setMessage=(value:string)=>setMessageRaw(value||null);
 const [orderStatus,setOrderStatus]=useState("");
 const [statementStatus,setStatementStatus]=useState("");
 const [collapsed,setCollapsed]=useState<Record<number,boolean>>({});
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
 const [statementMode,setStatementMode]=useState<"month"|"selection">("selection");
 const [unbilled,setUnbilled]=useState<Record<string,any>[]>([]);
 const [selectedUnbilled,setSelectedUnbilled]=useState<number[]>([]);
 const [priceRows,setPriceRows]=useState<{id:number;unitPrice:string}[]>([]);
 const [adjustments,setAdjustments]=useState<{key:number;description:string;amount:string}[]>([]);
 const [paymentAmount,setPaymentAmount]=useState("");
 const [paymentMethod,setPaymentMethod]=useState("transfer");

 useEffect(()=>{
  let live=true;
  Promise.all([searchContractors({limit:100}),searchBoms({limit:100}),flowApi.listOrders(),flowApi.statements(),flowApi.stock(undefined,showAllStock),flowApi.groupedStock(undefined,showAllStock)])
   .then(([c,b,o,s,g,groups])=>{if(!live)return;setContractors([...c.items]);setBoms([...b.items]);setOrders(o.items);
    setStatements(s.items);setStock(g.items);setStockGroups(groups.items);}).catch(e=>{if(live)setError(outsourcingErrorMessage(e));});
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
  let live=true;flowApi.unbilled(statementVendor,statementMode==="month"?statementMonth:undefined).then(x=>{
   if(!live)return;setUnbilled(x.items);setSelectedUnbilled(x.items.map(i=>i.receipt_item_id));
  }).catch(e=>{if(live)setError(outsourcingErrorMessage(e));});
  return()=>{live=false;};
 },[action,statementVendor,statementMonth,statementMode]);

 useEffect(()=>{
   if(action!=="receipt"||!order)return;
   const lines=deliveries.filter(d=>d.quantity&&Number(d.quantity)>0).map(d=>({
     orderProductId:d.orderProductId,bomRecipeId:d.bomId,quantity:d.quantity,unit:d.unit
   }));
   if(!lines.length){setPreview([]);return;}
   let live=true;flowApi.consumptionPreview(order.id,lines).then(result=>{if(live)setPreview(result.items);})
     .catch(e=>{if(live)setError(outsourcingErrorMessage(e));});
   return()=>{live=false;};
 },[action,order?.id,deliveries]);
 useEffect(()=>{
   if(action!=="stock-history")return;
   let live=true;flowApi.history(stockContractor??undefined).then(r=>{if(live)setStockHistory(r.items);})
     .catch(e=>{if(live)setError(outsourcingErrorMessage(e));});
   return()=>{live=false;};
 },[action,stockContractor,epoch]);
 async function switchTab(value:Tab){
   if(value===tab||busy)return;
   if(draft && !(await confirm({title:"放棄代工單修改",description:"代工單尚未儲存，確定放棄？",confirmLabel:"放棄修改",confirmTone:"danger"})))return;
   if(masterEditing && !(await confirm({title:"放棄主檔修改",description:"協力廠商或 BOM 尚未儲存，確定切換頁籤？",confirmLabel:"切換",confirmTone:"danger"})))return;
   setDraft(null);setAction(null);setTab(value);
   orderPane.close();statementPane.close();
 }
 const reload=()=>refresh(e=>e+1);
 const run=async(task:()=>Promise<unknown>,after?:()=>void)=>{
  if(busy)return;setBusy(true);setError("");
  try{await task();setMessage("已儲存");setAction(null);after?.();reload();}
  catch(e){setError(outsourcingErrorMessage(e));}finally{setBusy(false);}
 };
 function openOrderCreate(){setDraft({contractorId:contractors[0]?.id??null,orderDate:taipeiToday(),note:"",products:[newLine()]});setOrderId(null);setOrder(null);orderPane.open();}
 async function startOrderEdit(){
   if(!order||order.issues.length||order.receipts.length||order.closed_at)return;
   setBusy(true);setError("");
   try {
     const options=(await loadOutsourcingLookups({itemIds:order.products.map(p=>p.item_id),limit:100})).items;
     setDraft({contractorId:order.contractor_id,orderDate:order.order_date,note:order.note??"",
       products:order.products.map(p=>({key:++nextKey,item:options.find(x=>x.id===p.item_id)??null,
         bomId:p.bom_recipe_id,quantity:formatScaled4(p.planned_quantity),unit:p.unit}))});
   }catch(e){setError(outsourcingErrorMessage(e));}finally{setBusy(false);}
 }

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
  {label:"單位",width:"110px",view:p=>p.unit,edit:(p,i)=>unitSelect(p.item,p.unit,v=>patchLine(i,{unit:v}),busy)},
];
 const active=order?.products??[];
 const productsColumns:RowColumn<FlowOrder["products"][number]>[]=[
  {label:"成品",view:p=>p.item_no+" "+p.item_name,edit:()=> <span/>},
  {label:"BOM",view:p=>p.recipe_ref??"—",edit:()=> <span/>},
  {label:"預計數量",view:p=>number(p.planned_quantity),edit:()=> <span/>},
  {label:"單位",view:p=>p.unit,edit:()=> <span/>},
  {label:"已交",view:p=>number(p.delivered_quantity)+" "+p.unit,edit:()=> <span/>},
  {label:"進度",view:p=><ProductionGauge planned={p.planned_quantity} delivered={p.delivered_quantity}/>,edit:()=> <span/>}
 ];
 function begin(actionName:Action){
  setAction(actionName);setEntryDate(taipeiToday());setEntryNote("");setErpNo("");setError("");
  setMaterials([newMaterial()]);
  if(actionName==="issue"&&order){
    void flowApi.issueSuggestion(order.id).then(async suggestions=>{
      const choices=(await loadOutsourcingLookups({itemIds:suggestions.items.map(i=>i.itemId),limit:100})).items;
      setMaterials(suggestions.items.length?suggestions.items.map(i=>({key:++nextKey,
        item:choices.find(x=>x.id===i.itemId)??null,quantity:i.quantity,unit:i.unit})):[newMaterial()]);
    }).catch(e=>setError(outsourcingErrorMessage(e)));
  }
  if(actionName==="receipt"&&order)setDeliveries(order.products.map(p=>({orderProductId:p.id,quantity:"",unit:p.unit,bomId:p.bom_recipe_id})));
  if(actionName==="statement-create"){const vendor=statementVendor??contractors[0]?.id??null;setStatementVendor(vendor);setStatementMode(contractors.find(c=>c.id===vendor)?.billingMethod==="monthly"?"month":"selection");}
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
   const s=await flowApi.createStatement({contractorId:statementVendor,date:entryDate,month:statementMode==="month"?statementMonth:null,receiptItemIds:selectedUnbilled});
   setStatementId(s.id);setTab("statements");
  });
  if(action==="statement-edit"&&statement)await run(()=>flowApi.editStatement(statement.id,{expectedRevision:statement.revision,
   lines:priceRows.map(r=>({id:r.id,unitPrice:r.unitPrice})),adjustments:adjustments.map(a=>({description:a.description,amount:a.amount}))}));
  if(action==="payment"&&statement)await run(()=>flowApi.addPayment(statement.id,{expectedRevision:statement.revision,date:entryDate,method:paymentMethod,amount:paymentAmount,note:entryNote}));
 }

 const orderCounts:Record<string,number>={};for(const o of orders)orderCounts[o.statusCode]=(orderCounts[o.statusCode]??0)+1;
 const shownOrders=orders.filter(row=>(!orderStatus||row.statusCode===orderStatus)&&(!orderSearch||row.outsourcing_ref.includes(orderSearch)||row.contractor_name_snapshot.includes(orderSearch)));
 const orderFilter=<StatusFilter label="代工單狀態" value={orderStatus} onChange={setOrderStatus} counts={orderCounts} options={orderStatusOptions}/>;
 const statementCounts:Record<string,number>={};for(const st of statements){const k=statementState(st);statementCounts[k]=(statementCounts[k]??0)+1;}
 const shownStatements=statements.filter(st=>!statementStatus||statementState(st)===statementStatus);
 const statementFilter=<StatusFilter label="對帳狀態" value={statementStatus} onChange={setStatementStatus} counts={statementCounts} options={statementStatusOptions}/>;
 const matchStock=(name:string,r:{itemNo:string;itemName:string})=>!stockSearch||name.includes(stockSearch)||r.itemNo.includes(stockSearch)||r.itemName.includes(stockSearch);
 const visibleStock=stockGroups.filter(v=>(stockContractor==null||v.contractorId===stockContractor)&&v.groups.some(g=>g.items.some(r=>matchStock(v.contractorName,r))));
 /** Row actions open 退料／盤點調整 with that contractor and item already filled in. */
 async function beginStock(kind:"return"|"adjust",contractorId:number,itemId:number){
  setStockKind(kind);setStockContractor(contractorId);begin(kind);
  try{const item=(await loadOutsourcingLookups({itemIds:[itemId],limit:1})).items[0]??null;
   setMaterials([{key:++nextKey,item,quantity:"",unit:item?.baseUnit??""}]);}catch(e){setError(outsourcingErrorMessage(e));}
 }
 async function openOrder(id:number){
  if(draft&&!(await confirm({title:"放棄代工單修改",description:"代工單尚未儲存，確定放棄？",confirmLabel:"放棄修改",confirmTone:"danger"})))return;
  setDraft(null);setOrderId(id);orderPane.open();
 }
 /** Destructive or reversing actions always ask first (same as 叫貨／門市). */
 async function confirmRun(title:string,description:string,label:string,task:()=>Promise<unknown>,after?:()=>void){
  if(!(await confirm({title,description,confirmLabel:label,confirmTone:"danger"})))return;
  await run(task,after);
 }
 return <div className="cy-op-module cy-outsourcing-op">
  {confirmationDialog}
  <ModuleSections label="委外代工功能" sections={tabs} value={tab} onChange={value=>void switchTab(value)}/>
  <FeedbackBanner message={message} tone={messageTone}/>
  {tab==="orders"?<div className="cy-md cy-op-master-detail" data-pane={orderPane.pane}>
    <section className="cy-op-panel cy-md-list" aria-label="代工單清單">
     {compact?<DataViewToolbar searchValue={orderSearch} onSearchChange={setOrderSearch} searchLabel="搜尋代工單" searchPlaceholder="搜尋廠商、單號"
       filters={orderFilter} activeFilterCount={orderStatus?1:0}
       actions={<button type="button" className="cy-op-button primary" disabled={busy} onClick={openOrderCreate}>＋ 新增代工單</button>}
       resultSummary={"共 "+shownOrders.length+" 筆"}/>
     :<div className="cy-md-toolbar">
       <div className="cy-md-toolbar-lead">
        <button type="button" className="cy-op-button primary" disabled={busy} onClick={openOrderCreate}>＋ 新增代工單</button>
        <input className="cy-op-input" type="search" aria-label="搜尋代工單" placeholder="搜尋廠商、單號" value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}/>
       </div>
       {orderFilter}
       <div className="cy-md-count">共 {shownOrders.length} 筆</div>
     </div>}
     <div className="cy-op-list">
      {shownOrders.map(row=>compact?<ListRow key={row.id} title={row.contractor_name_snapshot}
         subtitle={row.outsourcing_ref+" · "+formatDate(row.order_date)} trailing={chip(row.statusCode)}
         selected={row.id===orderId} onClick={()=>void openOrder(row.id)}/>
       :<button type="button" key={row.id} className={"cy-op-list-row cy-status-row"+(row.id===orderId?" active":"")}
         aria-current={row.id===orderId?"true":undefined} onClick={()=>void openOrder(row.id)}>
         <strong>{row.contractor_name_snapshot}</strong><span><span className="cy-mono">{row.outsourcing_ref}</span> · {formatDate(row.order_date)}</span>{chip(row.statusCode)}
       </button>)}
      {!shownOrders.length?<div className="cy-op-empty">{orders.length?"沒有符合條件的代工單。":"尚無代工單。"}</div>:null}
     </div>
    </section>
    <section className="cy-op-panel cy-md-detail"><MasterDetailBack label="代工單清單" onBack={()=>{setDraft(null);orderPane.close();}} disabled={busy}/>
     {draft?<form onKeyDown={enterAdvancesFields} onSubmit={e=>{e.preventDefault();void run(async()=>{
       const payload={contractorId:draft.contractorId,orderDate:draft.orderDate,note:draft.note,
         products:draft.products.map(p=>({itemId:p.item?.id,bomRecipeId:p.bomId,quantity:p.quantity,unit:p.unit}))};
       const saved=orderId&&order?await flowApi.updateOrder(orderId,{...payload,expectedRevision:order.revision}):await flowApi.createOrder(payload);
       setOrderId(saved.id);setOrder(saved);setDraft(null);});}}>
       <div className="cy-record-header cy-edit-header"><div><h2>{orderId?"修改代工單":"新增代工單"}</h2></div>
        {compact?null:<div className="cy-record-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setDraft(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>{orderId?"儲存修改":"建立代工單"}</button></div>}</div>
       <RecordSheet label="代工單資料" editing rows={[
        {columns:"2fr 1fr 1fr",cells:[
         {label:"協力廠商",required:true,view:contractors.find(c=>c.id===draft.contractorId)?.displayName??"",edit:<select className="cy-sheet-input" value={draft.contractorId??""} onChange={e=>setDraft({...draft,contractorId:Number(e.target.value)||null})}><option value="">請選擇</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select>},
         {label:"工單日期",required:true,view:draft.orderDate,edit:<DateInput value={draft.orderDate} onChange={v=>setDraft({...draft,orderDate:v})}/>},
         {label:"狀態",view:"待發料"}
        ]},
        {columns:"1fr",cells:[{label:"備註",view:draft.note,edit:<input className="cy-sheet-input" value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/>}]}
       ]}/>
       <RecordRows title="成品" editing columns={orderColumns} rows={draft.products} rowKey={p=>p.key} onInsert={i=>setDraft(d=>d?{...d,products:[...d.products.slice(0,i+1),newLine(),...d.products.slice(i+1)]}:d)} onRemove={i=>setDraft(d=>d?{...d,products:d.products.filter((_,j)=>i!==j)}:d)}/>
       {compact?<ActionBar><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setDraft(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>{orderId?"儲存修改":"建立代工單"}</button></ActionBar>:null}
      </form>:order?<div>
       <div className="cy-record-header"><div><h2>{order.contractor_name_snapshot} {chip(order.statusCode)}</h2><p><span className="cy-mono">{order.outsourcing_ref}</span> · 工單日期 {formatDate(order.order_date)}{order.closed_reason?" · 結案原因："+order.closed_reason:""}</p></div>
        {compact?(order.issues.length===0&&order.receipts.length===0?<OverflowMenu items={[...(!order.closed_at?[{label:"修改",disabled:busy,onClick:()=>void startOrderEdit()}]:[]),{label:"刪除代工單",danger:true,disabled:busy,onClick:()=>void confirmRun("刪除代工單","刪除後無法復原，確定刪除這張代工單？","刪除",()=>flowApi.deleteOrder(order.id,order.revision),()=>{setOrderId(null);orderPane.close();})}]}/>:null)
        :<div className="cy-record-actions">{!order.closed_at?<>
          {order.issues.length===0&&order.receipts.length===0?button("修改",()=>void startOrderEdit(),busy):null}
   {button("＋ 發料",()=>begin("issue"),busy,true)}{button("＋ 交貨入庫",()=>begin("receipt"),busy,true)}
          {button("結案",()=>begin("close"),busy)}
         </>:button("重新開啟",()=>void confirmRun("重新開啟代工單","重新開啟後可以繼續發料、交貨。","重新開啟",()=>flowApi.reopen(order.id,order.revision)),busy)}
         {order.issues.length===0&&order.receipts.length===0?<OverflowMenu items={[{label:"刪除代工單",danger:true,disabled:busy,onClick:()=>void confirmRun("刪除代工單","刪除後無法復原，確定刪除這張代工單？","刪除",()=>flowApi.deleteOrder(order.id,order.revision),()=>{setOrderId(null);orderPane.close();})}]}/>:null}
        </div>}</div>
        {compact?<ActionBar>{!order.closed_at?<>{button("＋ 發料",()=>begin("issue"),busy,true)}{button("＋ 交貨入庫",()=>begin("receipt"),busy,true)}{button("結案",()=>begin("close"),busy)}</>:button("重新開啟",()=>void confirmRun("重新開啟代工單","重新開啟後可以繼續發料、交貨。","重新開啟",()=>flowApi.reopen(order.id,order.revision)),busy)}</ActionBar>:null}
       <RecordSheet label="代工單資料" editing={false} rows={[
        {columns:"2fr 1fr 1fr",cells:[{label:"協力廠商",view:order.contractor_name_snapshot},{label:"工單日期",view:formatDate(order.order_date)},{label:"狀態",view:chip(order.statusCode)}]},
        {columns:"1fr",cells:[{label:"備註",view:order.note}]}
       ]}/>
       <RecordRows title="成品" editing={false} columns={productsColumns} rows={active} rowKey={p=>p.id} onInsert={()=>{}} onRemove={()=>{}}/>
       <div className="cy-op-subsection"><h3>發料紀錄</h3>
        {order.issues.length?<div className="cy-op-table-wrap"><table className="cy-op-table cy-rt cy-out-table">
         <thead><tr><th>日期</th><th>品號</th><th>料件</th><th className="is-number">數量</th><th>備註</th><th className="is-center">操作</th></tr></thead>
         <tbody>{order.issues.flatMap(r=>r.items.map((it,k)=><tr key={r.id+"-"+it.id} className={r.cancelled_at?"cy-row-struck":undefined}>
          {k===0||compact?<td rowSpan={compact?undefined:r.items.length} data-label="日期">{formatDate(r.issued_date)}</td>:null}
          <td data-label="品號" className="cy-mono">{it.item_no}</td><td data-label="料件" data-priority="title">{it.name}</td>
          <td data-label="數量" className="is-number">{number(it.quantity)} {it.unit}</td>
          {k===0||compact?<><td rowSpan={compact?undefined:r.items.length} data-label="備註">{r.cancelled_at?"已取消":r.note??""}</td>
           <td rowSpan={compact?undefined:r.items.length} data-label="操作" className="is-center">{r.cancelled_at||order.closed_at?null:rowButton("取消發料",()=>void confirmRun("取消發料","會把這次發料從廠商庫存扣回，並留下紀錄。","取消發料",()=>flowApi.cancelIssue(order.id,r.id,order.revision)),busy)}</td></>:null}
         </tr>))}</tbody></table></div>:<p className="cy-op-empty">尚未發料。</p>}
       </div>
       <div className="cy-op-subsection"><h3>交貨入庫</h3>
        {order.receipts.length?<div className="cy-op-table-wrap"><table className="cy-op-table cy-rt cy-out-table">
         <thead><tr><th>日期</th><th>ERP 單號</th><th>成品</th><th className="is-number">數量</th><th className="is-center">對帳</th><th className="is-center">操作</th></tr></thead>
         <tbody>{order.receipts.flatMap(r=>{const state=r.cancelled_at?"cancelled":r.items.some(i=>i.statement_status==="paid")?"paid":r.items.some(i=>i.statement_status==="confirmed")?"confirmed":r.items.some(i=>i.statement_status==="draft")?"draft":"unbilled";
          return r.items.map((it,k)=><tr key={r.id+"-"+it.id} className={r.cancelled_at?"cy-row-struck":undefined}>
          {k===0||compact?<><td rowSpan={compact?undefined:r.items.length} data-label="日期">{formatDate(r.received_date)}</td><td rowSpan={compact?undefined:r.items.length} data-label="ERP 單號" className="cy-mono">{r.erp_no||"—"}</td></>:null}
          <td data-label="成品" data-priority="title">{it.item_no} {it.name}</td><td data-label="數量" className="is-number">{number(it.quantity)} {it.unit}</td>
          {k===0||compact?<><td rowSpan={compact?undefined:r.items.length} data-label="對帳" className="is-center">{state==="cancelled"?"已取消":state==="unbilled"?<StatusChip tone="warning">待對帳</StatusChip>:state==="draft"?<StatusChip tone="info">對帳中</StatusChip>:chip(state)}</td>
           <td rowSpan={compact?undefined:r.items.length} data-label="操作" className="is-center">{r.cancelled_at||state==="confirmed"||state==="paid"||order.closed_at?null:rowButton("取消交貨",()=>void confirmRun("取消交貨","會把這批交貨依 BOM 扣的料加回廠商庫存，並留下紀錄。","取消交貨",()=>flowApi.cancelReceipt(order.id,r.id,order.revision)),busy)}</td></>:null}
         </tr>);})}</tbody></table></div>:<p className="cy-op-empty">尚未交貨。</p>}
       </div>
      </div>:<MasterDetailEmpty title="尚未選擇代工單" hint="從左邊選一張代工單，或按「＋ 新增代工單」。"/>}
    </section>
   </div>:null}

  {tab==="stock"?<section className="cy-op-panel">
   <div className="cy-out-stock-toolbar">
    <input className="cy-op-input" type="search" aria-label="搜尋廠商或料件" placeholder="搜尋廠商、料件" value={stockSearch} onChange={e=>setStockSearch(e.target.value)}/>
    <select className="cy-op-input" aria-label="協力廠商" value={stockContractor??""} onChange={e=>setStockContractor(Number(e.target.value)||null)}>
      <option value="">全部廠商</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select>
    <label className="cy-out-check"><input type="checkbox" checked={showAllStock} onChange={e=>setShowAllStock(e.target.checked)}/> 顯示零庫存</label>
    <span className="cy-out-spacer"/>
    {button("異動紀錄",()=>begin("stock-history"),busy)}
   </div>
   {visibleStock.map(v=>{const open=!collapsed[v.contractorId];return <section key={v.contractorId} className="cy-out-stock-block">
     <div className="cy-out-stock-head"><strong>{v.contractorName}</strong><span>{v.billingMethod==="monthly"?"月結":"單次付款"} · {new Set(v.groups.flatMap(g=>g.items.map(r=>r.itemId))).size} 種料件</span>
      <span className="cy-out-spacer"/><ExpandToggle variant="text" expanded={open} label={v.contractorName} onToggle={()=>setCollapsed(c=>({...c,[v.contractorId]:open}))}/></div>
     {open?v.groups.map(g=><div key={g.title+g.bomName} className="cy-out-stock-group">
      <h3>{g.title}{g.bomName?<span>{g.bomName}</span>:null}{g.capacity!==null?<em className={g.shortage?"is-short":undefined}>{g.shortage?"料件不足，需補料":"現有料件還能做約 "+g.capacity+" "+(g.outputUnit??"")}</em>:null}</h3>
      <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt cy-out-table"><thead><tr><th>品號</th><th>料件</th><th>剩餘（相對上次補料後）</th><th className="is-number">現有</th><th className="is-number">補料後</th><th className="is-center">操作</th></tr></thead><tbody>
       {g.items.filter(r=>matchStock(v.contractorName,r)).map(r=><tr key={r.itemId}><td data-label="品號" className="cy-mono">{r.itemNo}</td><td data-label="料件" data-priority="title">{r.itemName}</td>
        <td data-label="剩餘"><StockGauge quantity={r.quantity} baseline={r.baseline} percentage={r.percentage} tone={r.tone}/></td>
        <td data-label="現有" className={"is-number"+(Number(r.quantity)<0?" cy-op-negative":"")}>{r.quantity} {r.unit}</td><td data-label="補料後" className="is-number">{r.baseline} {r.unit}</td>
        <td data-label="操作" className="is-center">{rowButton("退料",()=>void beginStock("return",v.contractorId,r.itemId),busy)} {rowButton("盤點調整",()=>void beginStock("adjust",v.contractorId,r.itemId),busy)}</td></tr>)}
      </tbody></table></div>
     </div>):null}
    </section>;})}
   {!visibleStock.length?<p className="cy-op-empty">{stockGroups.length?"沒有符合條件的庫存。":"目前沒有協力廠商持有料件。"}</p>:null}
  </section>:null}

  {tab==="statements"?<div className="cy-md cy-op-master-detail" data-pane={statementPane.pane}>
    <section className="cy-op-panel cy-md-list" aria-label="對帳單清單">
     {compact?<DataViewToolbar searchValue="" onSearchChange={()=>{}} filters={statementFilter} activeFilterCount={statementStatus?1:0}
       actions={<button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>begin("statement-create")}>＋ 建立對帳單</button>}
       resultSummary={"共 "+shownStatements.length+" 筆"}/>
     :<div className="cy-md-toolbar">
       <div className="cy-md-toolbar-lead"><button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>begin("statement-create")}>＋ 建立對帳單</button></div>
       {statementFilter}
       <div className="cy-md-count">共 {shownStatements.length} 筆</div>
     </div>}
     <div className="cy-op-list">
      {shownStatements.map(row=>{const when=row.period_month?row.period_month.replace("-","/")+" 月結":formatDate(row.statement_date)+" 單次";
       return compact?<ListRow key={row.id} title={row.contractor_name} subtitle={when+" · NT$ "+money(row.total_amount)} trailing={chip(statementState(row))}
         selected={row.id===statementId} onClick={()=>{setStatementId(row.id);statementPane.open();}}/>
       :<button type="button" key={row.id} className={"cy-op-list-row cy-status-row"+(row.id===statementId?" active":"")}
         aria-current={row.id===statementId?"true":undefined} onClick={()=>{setStatementId(row.id);statementPane.open();}}>
         <strong>{row.contractor_name}</strong><span>{when} · NT$ {money(row.total_amount)}</span>{chip(statementState(row))}
       </button>;})}
      {!shownStatements.length?<div className="cy-op-empty">{statements.length?"沒有符合條件的對帳單。":"尚無對帳單。"}</div>:null}
     </div>
    </section>
    <section className="cy-op-panel cy-md-detail"><MasterDetailBack label="對帳單清單" onBack={()=>statementPane.close()} disabled={busy}/>{statement?<div>
      <div className="cy-record-header"><div><h2>{statement.contractor_name} {chip(statementState(statement))}</h2><p>{statement.period_month?statement.period_month.replace("-","/")+" 月結":"單次對帳"} · 對帳日期 {formatDate(statement.statement_date)}</p></div>
      <div className="cy-record-actions">{statement.status_code==="draft"?<>
        {button("修改單價與費用",()=>begin("statement-edit"),busy)}
        {button("確認對帳",()=>void run(()=>flowApi.confirmStatement(statement.id,statement.revision)),busy,true)}
        {button("刪除草稿",()=>void confirmRun("刪除對帳單草稿","刪除後，這些交貨明細會回到未對帳。","刪除",()=>flowApi.deleteStatement(statement.id,statement.revision),()=>{setStatementId(null);statementPane.close();}),busy)}
      </>:<>
        {button("＋ 付款",()=>begin("payment"),busy,true)}
        {statement.payments.length===0?button("取消確認",()=>void confirmRun("取消確認對帳","對帳單會回到草稿，可以再修改單價與費用。","取消確認",()=>flowApi.unconfirmStatement(statement.id,statement.revision)),busy):null}
      </>}</div></div>
      <RecordSheet label="對帳單表頭" editing={false} rows={[{columns:"2fr 1fr 1fr",cells:[
       {label:"廠商",view:statement.contractor_name},{label:"對帳日期",view:formatDate(statement.statement_date)},{label:"對帳月份",view:statement.period_month?statement.period_month.replace("-","/"):"單次"}
      ]}]}/>
      <div className="cy-op-subsection"><h3>對帳明細</h3><div className="cy-op-table-wrap"><table className="cy-op-table cy-rt cy-out-table">
       <thead><tr><th>日期</th><th>代工單</th><th>ERP 單號</th><th>成品</th><th className="is-number">數量</th><th className="is-number">單價</th><th className="is-number">金額</th></tr></thead>
       <tbody>{statement.lines.map(l=><tr key={l.id}><td data-label="日期">{formatDate(l.received_date)}</td><td data-label="代工單" className="cy-mono">{l.outsourcing_ref}</td><td data-label="ERP 單號" className="cy-mono">{l.erp_no||"—"}</td>
        <td data-label="成品" data-priority="title">{l.item_no} {l.item_name}</td><td data-label="數量" className="is-number">{number(l.quantity)} {l.pricing_unit}</td>
        <td data-label="單價" className="is-number">{l.unit_price==null?"待填":formatScaled4(l.unit_price)}</td><td data-label="金額" className="is-number">{money(l.amount)}</td></tr>)}
        {statement.adjustments.map(a=><tr key={"a"+a.id} className="cy-out-adjust"><td data-label="其他費用／折讓" colSpan={6}>{a.description}</td><td data-label="金額" className="is-number">{money(a.amount)}</td></tr>)}
        <tr className="cy-out-total"><td colSpan={6}>合計（元以下四捨五入）</td><td className="is-number">NT$ {money(statement.total_amount)}</td></tr>
       </tbody></table></div></div>
      <div className="cy-op-subsection"><h3>付款紀錄 <span className="cy-out-paid">已付 NT$ {money(statement.paid_amount)}／應付 NT$ {money(statement.total_amount)}</span></h3>
       {statement.payments.length?<div className="cy-op-table-wrap"><table className="cy-op-table cy-rt cy-out-table"><thead><tr><th>付款日</th><th>方式</th><th className="is-number">金額</th><th>備註</th><th className="is-center">操作</th></tr></thead><tbody>
       {statement.payments.map(p=><tr key={p.id}><td data-label="付款日">{formatDate(p.payment_date)}</td><td data-label="方式">{({cash:"現金",transfer:"匯款",cheque:"支票",other:"其他"} as Record<string,string>)[p.method]}</td>
        <td data-label="金額" className="is-number">{money(p.amount)}</td><td data-label="備註">{p.note}</td><td data-label="操作" className="is-center">{rowButton("刪除",()=>void confirmRun("刪除付款紀錄","確定刪除這筆付款？","刪除",()=>flowApi.deletePayment(statement.id,p.id,statement.revision)),busy)}</td></tr>)}
       </tbody></table></div>:<p className="cy-op-empty">{statement.status_code==="draft"?"確認對帳後才能登記付款。":"尚無付款。"}</p>}</div>
    </div>:<MasterDetailEmpty title="尚未選擇對帳單" hint="從左邊選一張對帳單，或按「＋ 建立對帳單」。"/>}</section>
   </div>:null}

  {tab==="contractors"?<ContractorWorkspace contractors={contractors} onChanged={reload} onEditingChange={setMasterEditing} notify={setMessage} reportError={setError}/>:null}
  {tab==="boms"?<BomWorkspace boms={boms} onChanged={reload} onEditingChange={()=>{}} notify={setMessage} reportError={setError}/>:null}

  <Dialog open={action!==null} title={{
    issue:"新增發料",receipt:"新增交貨入庫",return:"退料",adjust:"盤點調整","statement-create":"建立對帳單",
    "statement-edit":"修改對帳單",payment:"登記付款",close:"結案","stock-history":"庫存異動紀錄"
  }[action??"issue"]??"異動紀錄"} size={action==="close"?"small":action==="payment"?"medium":"large"} onClose={()=>setAction(null)}>
   <form onKeyDown={enterAdvancesFields} onSubmit={e=>void submitAction(e)}>
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
        {(order.products.find(p=>p.id===d.orderProductId)?.allowed_units??[d.unit]).map(unit=><option key={unit} value={unit}>{unit}</option>)}</select>},
       {label:"目前單價",view:d=>{const p=order.products.find(p=>p.id===d.orderProductId);return p?.current_unit_price==null?"待對帳":formatScaled4(p.current_unit_price)+(p.current_pricing_unit?"／"+p.current_pricing_unit:"");},
        edit:d=>{const p=order.products.find(p=>p.id===d.orderProductId);return <span>{p?.current_unit_price==null?"待對帳":formatScaled4(p.current_unit_price)+(p.current_pricing_unit?"／"+p.current_pricing_unit:"")}</span>;}},
       {label:"BOM",view:d=>boms.find(b=>b.id===d.bomId)?.recipeRef??"—",edit:d=><select className="cy-sheet-input" value={d.bomId??""} onChange={e=>setDeliveries(ds=>ds.map(r=>r.orderProductId===d.orderProductId?{...r,bomId:Number(e.target.value)||null}:r))}>
        <option value="">不扣料</option>{boms.filter(b=>b.isActive&&b.finishedItemId===order.products.find(p=>p.id===d.orderProductId)?.item_id).map(b=><option key={b.id} value={b.id}>{b.recipeRef}</option>)}</select>}
      ]}/>:null}
    {action==="stock-history"?<div className="cy-op-subsection">
      <div className="cy-op-toolbar"><Field label="協力廠商">
        <select id="stock-history-contractor" className="cy-op-input" value={stockContractor??""} onChange={e=>setStockContractor(Number(e.target.value)||null)}>
          <option value="">全部廠商</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select></Field></div>
      <h3>料件異動紀錄</h3>
      <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt"><thead><tr>
        <th>日期</th><th>廠商</th><th>料件</th><th>類型</th><th>增減量</th><th>異動後庫存</th><th>原因／來源單號</th><th>操作人</th>
      </tr></thead><tbody>
        {stockHistory.map((m,i)=><tr key={Number(m.id??i)}>
          <td>{String(m.occurred_at??"")}</td><td>{String(m.contractor_name??"")}</td>
          <td>{String(m.item_no??"")} {String(m.item_name??"")}</td>
          <td>{({issue:"發料",consumption:"BOM 扣料",return:"退料",adjust:"盤點調整",reversal:"沖銷"} as Record<string,string>)[String(m.movement_type)]??String(m.movement_type)}</td>
          <td>{number(Number(m.quantity_delta??0))}</td>
          <td className={Number(m.balance_after)<0?"cy-op-negative":undefined}>{number(Number(m.balance_after??0))}</td>
          <td>{[m.reason,m.source_order_ref].filter(Boolean).map(String).join(" · ")||"—"}</td>
          <td>{String(m.operator_name??m.operator_employee_id??"")}</td>
        </tr>)}
      </tbody></table></div>
      {stockHistory.length===0?<p>目前沒有異動紀錄。</p>:null}
    </div>:null}
    {action==="receipt"&&preview.length?<div className="cy-op-subsection"><h3>預計從廠商庫存扣除</h3><p>{preview.map(p=>p.itemNo+" "+p.itemName+" "+p.quantity+" "+p.unit).join("、")}</p></div>:null}
    {action==="statement-create"?<><Grid label="對帳方式" headers={["協力廠商","選取方式"]}>
      <Cell label="協力廠商"><select className="cy-sheet-input" value={statementVendor??""} onChange={e=>{const id=Number(e.target.value)||null;setStatementVendor(id);setStatementMode(contractors.find(c=>c.id===id)?.billingMethod==="monthly"?"month":"selection");}}>
       <option value="">請選擇</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></Cell>
      <Cell label="選取方式"><select className="cy-sheet-input" value={statementMode} onChange={e=>setStatementMode(e.target.value as "month"|"selection")}><option value="month">依月份</option><option value="selection">勾選交貨批次</option></select></Cell>
     </Grid>{statementMode==="month"?<Grid label="結算月份" headers={["月份"]}><Cell label="月份"><DateInput precision="month" value={statementMonth} onChange={setStatementMonth}/></Cell></Grid>:null}<h3>未對帳交貨明細</h3>
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
    <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>setAction(null)}>{action==="stock-history"?"關閉":"取消"}</button>{action!=="stock-history"?<button type="submit" className="cy-op-button primary" disabled={busy} aria-busy={busy||undefined}>{({issue:"確認發料",receipt:"確認入庫",return:"確認退料",adjust:"確認調整","statement-create":"建立對帳單","statement-edit":"儲存",payment:"登記付款",close:"結案"} as Record<string,string>)[action??""]??"確認"}</button>:null}</div>
   </form>
  </Dialog>
 </div>;
}
