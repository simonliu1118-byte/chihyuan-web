import {useMemo,useState} from "react";
import type {OrderingSource} from "../../shared/ordering";
import "./ordering-source-chips.css";

const KIND_ORDER:Record<OrderingSource["kind"],number>={GENERAL:0,CN_REGULAR:1,CN_CUSTOM:2,VENDOR:3};

/**
 * Sources laid out as tags, one click picks (user 2026-10-27: the two-level drop-down was too long
 * for 加入叫貨單). First the suggestions (the item's last source, then sources with a draft), then
 * the company's own sources, then vendors in the member's tab order with a search box.
 */
export function OrderingSourceChips({sources,value,onChange,lastSourceId=0,draftSourceIds=[],vendorOrder=[]}:{
 sources:OrderingSource[];value:number;onChange:(id:number)=>void;lastSourceId?:number;draftSourceIds?:readonly number[];vendorOrder?:readonly number[];
}){
 const [query,setQuery]=useState("");
 const active=useMemo(()=>sources.filter(s=>s.isActive),[sources]);
 const byId=useMemo(()=>new Map(active.map(s=>[s.id,s])),[active]);
 const withDraft=new Set(draftSourceIds);
 const suggested=[...new Set([lastSourceId,...draftSourceIds])].map(id=>byId.get(id)).filter((s):s is OrderingSource=>!!s);
 const internal=active.filter(s=>s.kind!=="VENDOR").sort((a,b)=>KIND_ORDER[a.kind]-KIND_ORDER[b.kind]||a.sortOrder-b.sortOrder||a.id-b.id);
 const rank=(id:number)=>{const i=vendorOrder.indexOf(id);return i<0?Number.MAX_SAFE_INTEGER:i};
 const search=query.trim().toLocaleLowerCase();
 const vendors=active.filter(s=>s.kind==="VENDOR"&&(!search||s.name.toLocaleLowerCase().includes(search)))
  .sort((a,b)=>rank(a.id)-rank(b.id)||a.sortOrder-b.sortOrder||a.id-b.id);
 const chip=(s:OrderingSource,note?:string)=><button key={s.id} type="button" className="cy-source-chip" aria-pressed={value===s.id} onClick={()=>onChange(s.id)}>
  {s.name}{note?<small>{note}</small>:withDraft.has(s.id)?<span className="cy-source-chip-dot" aria-label="有草稿"/>:null}</button>;
 return <div className="cy-source-chips">
  {suggested.length?<div className="cy-source-chips-group"><span className="cy-source-chips-label">建議</span>
   <div className="cy-source-chips-row">{suggested.map(s=>chip(s,s.id===lastSourceId?"上次":"有草稿"))}</div></div>:null}
  <div className="cy-source-chips-group"><span className="cy-source-chips-label">公司</span>
   <div className="cy-source-chips-row">{internal.map(s=>chip(s))}</div></div>
  <div className="cy-source-chips-group"><span className="cy-source-chips-label">廠商</span>
   <div className="cy-source-chips-vendors">
    <input className="cy-op-input cy-source-chips-search" type="search" value={query} placeholder="搜尋廠商" aria-label="搜尋廠商"
     onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();if(vendors.length===1)onChange(vendors[0].id)}}}/>
    <div className="cy-source-chips-row">{vendors.length?vendors.map(s=>chip(s)):<span className="cy-source-chips-empty">沒有符合的廠商</span>}</div>
   </div></div>
 </div>;
}
