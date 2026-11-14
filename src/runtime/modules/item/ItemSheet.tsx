import type {ItemDetail,ItemCostTaxMode,ItemUnitConversionInput,ItemWholesalePrice,ItemOnlinePrice,ItemWebPlatform} from "../../../../shared/item";
import type {LookupSetting} from "../../../../shared/settings";
import {RecordSheet,type SheetRow} from "../../../ui/forms/RecordSheet";
import {InlineGridField} from "../../../ui/forms/InlineGridField";
import {IconButton} from "../../../ui/actions/IconButton";
import {Icons} from "../../../ui/actions/icons";
import "./item-sheet.css";

export interface ItemSheetDraft {
 itemNo:string;name:string;spec:string;itemCategoryId:number|null;baseUnit:string;isActive:boolean;
 cost:string;costTaxMode:ItemCostTaxMode|null;storePrice:string;clinicPrice:string;notes:string;
 unitConversions:ItemUnitConversionInput[];
 wholesalePrices:ItemWholesalePrice[];
 onlinePrices:ItemOnlinePrice[];
}
const money=(value:string|null|undefined)=>value==null||value===""?"—":"$"+value;
export function ItemSheet({item,draft,editing,creating,busy,categories,platforms,onPatch,onAddConversion,onUpdateConversion}:{
 item:ItemDetail|null;draft:ItemSheetDraft|null;editing:boolean;creating:boolean;busy:boolean;
 categories:readonly LookupSetting[];platforms:readonly ItemWebPlatform[];
 onPatch:(partial:Partial<ItemSheetDraft>)=>void;
 onAddConversion:()=>void;
 onUpdateConversion:(index:number,field:"fromUnit"|"quantity",value:string)=>void;
}){
 const source=editing?draft:item;
 if(!source)return null;
 const base=source.baseUnit;
 const conversions=source.unitConversions;
 const wholesale=source.wholesalePrices;
 const online=source.onlinePrices;
 const effectivePlatforms=platforms.filter(p=>p.isActive||online.some(v=>v.platformId===p.id));
 const input=(value:string,onChange:(value:string)=>void,aria:string,options?:{disabled?:boolean;decimal?:boolean})=>
   <input className="cy-op-input" aria-label={aria} value={value} disabled={busy||options?.disabled}
      inputMode={options?.decimal?"decimal":undefined} onChange={e=>onChange(e.target.value)}/>;
 const updateOnline=(platformId:number,value:string)=>{
  if(!draft)return;
  onPatch({onlinePrices:value===""?draft.onlinePrices.filter(p=>p.platformId!==platformId):
    [...draft.onlinePrices.filter(p=>p.platformId!==platformId),{platformId,price:value}]});
 };
 const updateWholesale=(index:number,patch:Partial<ItemWholesalePrice>)=>{
  if(!draft)return;
  onPatch({wholesalePrices:draft.wholesalePrices.map((row,i)=>i===index?{...row,...patch}:row)});
 };
 const conversionEditor=<div className="cy-item-conversion-mini">
  {conversions.map((row,index)=><div className="cy-item-conversion-mini-row" key={index}>
    <span>1</span>
    {input(row.fromUnit,value=>onUpdateConversion(index,"fromUnit",value),"換算單位 "+(index+1))}
    <span>=</span>
    {input(row.quantity,value=>onUpdateConversion(index,"quantity",value),"換算數量 "+(index+1),{decimal:true})}
    <span>{base}</span>
    <IconButton variant="table" tone="danger" icon={Icons.remove} label="移除換算" disabled={busy}
      onClick={()=>draft&&onPatch({unitConversions:draft.unitConversions.filter((_,i)=>i!==index)})}/>
  </div>)}
  <button className="cy-op-button compact soft" type="button" disabled={busy} onClick={onAddConversion}>＋ 換算</button>
 </div>;
 const wholesaleEditor=<div className="cy-item-wholesale-mini">
   {wholesale.map((row,index)=><div className="cy-item-wholesale-mini-row" key={index}>
    {input(row.unit,value=>updateWholesale(index,{unit:value}),"批發單位 "+(index+1))}
    {input(row.price,value=>updateWholesale(index,{price:value}),"批發價格 "+(index+1),{decimal:true})}
    <IconButton variant="table" tone="danger" icon={Icons.remove} label="移除批發價" disabled={busy}
      onClick={()=>draft&&onPatch({wholesalePrices:draft.wholesalePrices.filter((_,i)=>i!==index).map((v,i)=>({...v,sortOrder:i}))})}/>
   </div>)}
   <button className="cy-op-button compact soft" type="button" disabled={busy}
    onClick={()=>draft&&onPatch({wholesalePrices:[...draft.wholesalePrices,{unit:"",price:"",sortOrder:draft.wholesalePrices.length}]})}>＋ 批發價</button>
  </div>;
 const costDisplay=<>{money(source.cost)}{source.costTaxMode==="exclusive"&&source.cost!==""&&source.cost!=null
    ? <small className="cy-item-tax-gross">(含稅{money((Math.round(Number(source.cost)*105)/100).toFixed(2))})</small>:null}</>;
 const fields:SheetRow[]=[
  {columns:"minmax(0,.8fr) minmax(0,1.35fr) minmax(0,1.35fr) minmax(0,2.5fr)",cells:[
    {label:"品號",required:true,mono:true,view:source.itemNo,edit:editing?input(draft!.itemNo,value=>onPatch({itemNo:value}),"品號",{disabled:!creating}):undefined},
    {label:"品名",required:true,view:source.name,edit:editing?input(draft!.name,value=>onPatch({name:value}),"品名"):undefined},
    {label:"規格",view:source.spec,edit:editing?input(draft!.spec,value=>onPatch({spec:value}),"規格"):undefined},
    {label:"基準單位",required:true,
      view:<><strong>{base}</strong>{conversions.length?<span>　{conversions.map(row=>row.fromUnit+"="+row.quantity+base).join("　")}</span>:null}</>,
      edit:editing?<div className="cy-item-unit-cell">
        {input(draft!.baseUnit,value=>onPatch({baseUnit:value,unitConversions:draft!.unitConversions.map(row=>({...row,toUnit:value}))}),"基準單位")}
        {conversionEditor}
      </div>:undefined},
  ]},
  {columns:"minmax(0,1fr) minmax(0,1.15fr) minmax(0,.9fr) minmax(0,.85fr) minmax(0,.85fr) minmax(0,1.6fr) minmax(0,2.6fr)",cells:[
    {label:"分類",view:categories.find(c=>c.id===(editing?draft?.itemCategoryId:item?.category?.id))?.name??item?.category?.name,
     edit:editing?<select className="cy-op-input" aria-label="商品分類" value={draft!.itemCategoryId??""} disabled={busy}
      onChange={e=>onPatch({itemCategoryId:e.target.value?Number(e.target.value):null})}>
       <option value="">未分類</option>{categories.filter(c=>c.isActive||c.id===draft!.itemCategoryId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>:undefined},
    {label:"成本",view:costDisplay,edit:editing?input(draft!.cost,value=>onPatch({cost:value}),"成本",{decimal:true}):undefined},
    {label:"成本稅別",required:true,view:source.costTaxMode==="exclusive"?"未稅（外加）":source.costTaxMode==="inclusive"?"含稅":source.costTaxMode==="no_tax"?"不計稅":"待補資料",
     edit:editing?<select className="cy-op-input" aria-label="成本稅別" value={draft!.costTaxMode??""} disabled={busy}
      onChange={e=>onPatch({costTaxMode:(e.target.value||null) as ItemCostTaxMode|null})}>
       <option value="" disabled>請選擇</option><option value="inclusive">含稅</option><option value="exclusive">未稅（外加）</option><option value="no_tax">不計稅</option>
      </select>:undefined},
    {label:"門市價",view:money(source.storePrice),edit:editing?input(draft!.storePrice,value=>onPatch({storePrice:value}),"門市價",{decimal:true}):undefined},
    {label:"診所價",view:money(source.clinicPrice),edit:editing?input(draft!.clinicPrice,value=>onPatch({clinicPrice:value}),"診所價",{decimal:true}):undefined},
    {label:"批發價",view:wholesale.length?wholesale.map(row=>row.unit+money(row.price)).join(" / "):"—",
     edit:editing?wholesaleEditor:undefined},
    {label:"網路價",view:effectivePlatforms.filter(p=>online.some(row=>row.platformId===p.id))
      .map(p=>p.name+money(online.find(row=>row.platformId===p.id)?.price)).join(" / ")||"—",
     edit:editing?<InlineGridField label="網路價" disabled={busy} cells={effectivePlatforms.map(p=>({
       id:p.id,label:p.name,value:online.find(row=>row.platformId===p.id)?.price??""
     }))} onChange={updateOnline}/>:undefined},
  ]},
  {columns:"minmax(0,1fr)",cells:[{label:"備註",view:source.notes,
    edit:editing?<textarea className="cy-op-input" aria-label="備註" rows={2} disabled={busy}
     value={draft!.notes} onChange={e=>onPatch({notes:e.target.value})}/>:undefined}]},
 ];
 return <RecordSheet label="商品資料" editing={editing} rows={fields}/>;
}
