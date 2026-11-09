import type {ReactNode} from "react";
import {useCompactLayout} from "../foundation/useCompactLayout";

export interface ModuleSection<K extends string>{key:K;label:string;icon?:ReactNode;badge?:number}

/**
 * A module's own sections (門市 tabs, 叫貨 未到貨／草稿／叫貨單, ERP 查詢 categories). Desktop keeps the
 * familiar `cy-op-tabs`; at phone width the same choice becomes a bottom tab bar within thumb reach
 * (UI_COMPONENT_CATALOG §6). Up to five sections fit the bar; more scroll sideways at the top instead.
 */
export function ModuleSections<K extends string>({label,sections,value,onChange,disabled=false}:{label:string;sections:readonly ModuleSection<K>[];value:K;onChange:(key:K)=>void;disabled?:boolean}){
 const compact=useCompactLayout();
 const bar=compact&&sections.length>=2&&sections.length<=5;
 const badge=(n?:number)=>n?<span className="cy-module-badge" aria-label={n+" 筆"}>{n>99?"99+":n}</span>:null;
 if(!bar)return <div className={"cy-op-tabs"+(compact?" cy-op-tabs-scroll":"")} role="tablist" aria-label={label}>
  {sections.map(s=><button key={s.key} type="button" role="tab" aria-selected={value===s.key} className={value===s.key?"active":undefined} disabled={disabled} onClick={()=>onChange(s.key)}>{s.label}{badge(s.badge)}</button>)}
 </div>;
 return <><nav className="cy-module-bar" aria-label={label} style={{gridTemplateColumns:`repeat(${sections.length},minmax(0,1fr))`}}>
  {sections.map(s=><button key={s.key} type="button" aria-current={value===s.key?"page":undefined} className={value===s.key?"active":undefined} disabled={disabled} onClick={()=>onChange(s.key)}>
   {s.icon?<span className="cy-module-bar-icon" aria-hidden="true">{s.icon}</span>:null}<span>{s.label}</span>{badge(s.badge)}</button>)}
 </nav><div className="cy-module-bar-spacer" aria-hidden="true"/></>;
}
