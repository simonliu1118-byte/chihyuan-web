import {useEffect,useId,useMemo,useRef,useState} from "react";
import type {OrderingSource} from "../../shared/ordering";
import "./ordering-source-picker.css";

/** First level lists every non-vendor source, general ones first, each kind in its saved order. */
const KIND_ORDER:Record<OrderingSource["kind"],number>={GENERAL:0,CN_REGULAR:1,CN_CUSTOM:2,VENDOR:3};

/** Search-as-you-type or click-to-browse: non-vendor sources on the first level, vendors on the second. */
export function OrderingSourcePicker({sources,value,onChange,allowAll=false,includeHidden=false,disabled=false,required=false,label="來源"}:{
 sources:OrderingSource[];value:number;onChange:(id:number)=>void;allowAll?:boolean;includeHidden?:boolean;disabled?:boolean;required?:boolean;label?:string
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
 const internal=available.filter(s=>s.kind!=="VENDOR").sort((a,b)=>KIND_ORDER[a.kind]-KIND_ORDER[b.kind]||a.sortOrder-b.sortOrder||a.id-b.id);
 const vendors=available.filter(s=>s.kind==="VENDOR");
 const searched=search?available.filter(matches):[];
 const internalSearch=search?searched.filter(s=>s.kind!=="VENDOR"):internal;
 const vendorSearch=search?searched.filter(s=>s.kind==="VENDOR"):vendors;
 const choices=level==="vendor"?vendorSearch:internalSearch;
 // A typed name that was not picked is not a choice: the form's required check must still stop it.
 useEffect(()=>{input.current?.setCustomValidity(required&&!selected?"請從清單選擇":"")},[required,selected]);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node)){setOpen(false);setTyping(false);setLevel("root")}};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close)},[open]);
 function pick(id:number){onChange(id);setTyping(false);setQuery("");setLevel("root");setOpen(false)}
 function edit(text:string){setQuery(text);setTyping(true);setOpen(true);setLevel("root");if(value)onChange(0)}
 return <div ref={root} className="cy-ordering-source-picker">
  <div className="cy-ordering-source-picker-control">
   <input ref={input} type="search" className="cy-op-input" role="combobox" autoComplete="off" aria-label={label} aria-controls={listId} aria-expanded={open} aria-autocomplete="list" disabled={disabled} required={required} placeholder={allowAll?"全部來源":"輸入或選擇來源"} value={displayed}
    onChange={e=>edit(e.target.value)} onFocus={()=>setOpen(true)} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);setTyping(false);setLevel("root")}if(e.key==="ArrowDown"){e.preventDefault();setOpen(true);root.current?.querySelector<HTMLButtonElement>(".cy-ordering-source-picker-menu button")?.focus()}if(e.key==="Enter"&&open){const first=search?(level==="vendor"?vendorSearch[0]:searched[0]):level==="vendor"&&vendors.length===1?vendors[0]:undefined;
     if(first){e.preventDefault();pick(first.id);return}
     // Nothing to pick: close the list and let the form's Enter move on to the next field.
     setOpen(false);setTyping(false);setQuery("");setLevel("root");e.currentTarget.setAttribute("aria-expanded","false")}}}/>
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
