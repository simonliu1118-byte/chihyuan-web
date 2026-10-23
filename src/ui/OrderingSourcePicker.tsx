import {useEffect,useId,useMemo,useRef,useState} from "react";
import type {OrderingSource} from "../../shared/ordering";
import "./ordering-source-picker.css";

const INTERNAL=["台北","台中","洲美","定期中國貨","自訂中國貨"] as const;

/** Search-as-you-type or click-to-browse: fixed first level, vendor second level. */
export function OrderingSourcePicker({sources,value,onChange,allowAll=false,includeHidden=false,disabled=false,label="來源"}:{
 sources:OrderingSource[];value:number;onChange:(id:number)=>void;allowAll?:boolean;includeHidden?:boolean;disabled?:boolean;label?:string
}){
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const listId=useId();
 const [open,setOpen]=useState(false),[level,setLevel]=useState<"root"|"vendor">("root");
 const [query,setQuery]=useState(""),[typing,setTyping]=useState(false);
 const available=useMemo(()=>sources.filter(s=>includeHidden||s.isActive),[sources,includeHidden]);
 const selected=available.find(s=>s.id===value);
 const displayed=typing?query:(selected?.name??(allowAll?"全部來源":""));
 const search=query.trim().toLocaleLowerCase();
 const matches=(s:OrderingSource)=>s.name.toLocaleLowerCase().includes(search);
 const internal=INTERNAL.flatMap(name=>available.filter(s=>s.name===name&&s.kind!=="VENDOR"));
 const vendors=available.filter(s=>s.kind==="VENDOR");
 const searched=search?available.filter(matches):[];
 const internalSearch=search?searched.filter(s=>s.kind!=="VENDOR"):internal;
 const vendorSearch=search?searched.filter(s=>s.kind==="VENDOR"):vendors;
 const choices=level==="vendor"?vendorSearch:internalSearch;
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node)){setOpen(false);setTyping(false);setLevel("root")}};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close)},[open]);
 function pick(id:number){onChange(id);setTyping(false);setQuery("");setLevel("root");setOpen(false)}
 function edit(text:string){setQuery(text);setTyping(true);setOpen(true);setLevel("root");if(value)onChange(0)}
 return <div ref={root} className="cy-ordering-source-picker">
  <div className="cy-ordering-source-picker-control">
   <input ref={input} type="search" className="cy-op-input" role="combobox" autoComplete="off" aria-label={label} aria-controls={listId} aria-expanded={open} aria-autocomplete="list" disabled={disabled} placeholder={allowAll?"全部來源":"輸入或選擇來源"} value={displayed}
    onChange={e=>edit(e.target.value)} onFocus={()=>setOpen(true)} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);setTyping(false);setLevel("root")}if(e.key==="ArrowDown"){e.preventDefault();setOpen(true);root.current?.querySelector<HTMLButtonElement>(".cy-ordering-source-picker-menu button")?.focus()}}}/>
   <button type="button" className="cy-ordering-source-picker-toggle" aria-label="展開來源清單" aria-expanded={open} disabled={disabled} onClick={()=>{setTyping(false);setQuery("");setLevel("root");setOpen(v=>!v);if(!open)input.current?.focus()}}>▾</button>
  </div>
  {open?<div id={listId} className="cy-ordering-source-picker-menu" role="group" aria-label={level==="vendor"?"外部廠商清單":"叫貨來源清單"}>
    {level==="vendor"?<button type="button" className="cy-ordering-source-picker-back" onClick={()=>{setLevel("root");setQuery("");setTyping(false);input.current?.focus()}}>← 返回來源</button>:null}
    {level==="root"&&allowAll&&!search?<button type="button" onClick={()=>pick(0)}>全部來源</button>:null}
    {choices.map(s=><button type="button" key={s.id} aria-current={value===s.id?"true":undefined} onClick={()=>pick(s.id)}>{s.name}{!s.isActive?"（已隱藏）":""}{value===s.id?" ✓":""}</button>)}
    {level==="root"&&(!search||"廠商".includes(search)||vendorSearch.length>0)?<button type="button" className="cy-ordering-source-picker-vendor" onClick={()=>{setLevel("vendor");setQuery("");setTyping(false);input.current?.focus()}}>廠商 <span aria-hidden="true">›</span></button>:null}
    {level==="root"&&search&&vendorSearch.length>0?<div className="cy-ordering-source-picker-search-hint">符合搜尋的廠商</div>:null}
    {level==="root"&&search? vendorSearch.map(s=><button type="button" key={"search-"+s.id} onClick={()=>pick(s.id)}>{s.name}{!s.isActive?"（已隱藏）":""}</button>):null}
    {search&&level==="root"&&internalSearch.length===0&&vendorSearch.length===0?<span className="cy-ordering-source-picker-empty">找不到符合的來源</span>:null}
    {level==="vendor"&&choices.length===0?<span className="cy-ordering-source-picker-empty">沒有符合的廠商</span>:null}
  </div>:null}
 </div>;
}
