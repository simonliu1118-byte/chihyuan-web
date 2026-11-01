import {useEffect,useId,useLayoutEffect,useRef,useState,type InputHTMLAttributes} from "react";
import {dateValue,monthDays,parseDateInput,shiftDate,taipeiToday} from "../../../shared/date-input";
import "./date-input.css";
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,"type"|"value"|"onChange"|"min"|"max">&{value:string;onChange:(iso:string)=>void;min?:string;max?:string};
/** CYACCWEB interaction model, adapted to CYWEB controlled fields, bounds and keyboard flow. */
export function DateInput({value,onChange,min="0001-01-01",max="9999-12-31",disabled,required,className="",...props}:Props){
 const [draft,setDraft]=useState(value.replaceAll("-","/")),[open,setOpen]=useState(false),[view,setView]=useState<"days"|"months"|"years">("days");
 const [month,setMonth]=useState((value||taipeiToday()).slice(0,7)),[yearStart,setYearStart]=useState(2020);
 const root=useRef<HTMLDivElement>(null),field=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId(),typing=useRef(false);
 const y=Number(month.slice(0,4)),m=Number(month.slice(5)),selected=parseDateInput(value),today=taipeiToday();
 const allowed=(iso:string)=>!!iso&&iso>=min&&iso<=max;
 function validity(text:string){const iso=parseDateInput(text);return text&&!iso?"請輸入有效日期（YYYY/MM/DD、四碼月日或八碼日期）":iso&&!allowed(iso)?"日期超出允許範圍":""}
 useEffect(()=>{if(!typing.current)setDraft(value.replaceAll("-","/"))},[value]);
 useLayoutEffect(()=>{field.current?.setCustomValidity(disabled?"":validity(draft))},[draft,min,max,disabled]);
 function close(focus=false){setOpen(false);if(focus)field.current?.focus()}
 function choose(iso:string){if(!allowed(iso))return;typing.current=false;setDraft(iso.replaceAll("-","/"));onChange(iso);close(true)}
 function show(){const current=allowed(selected)?selected:today<min?min:today>max?max:today;setMonth(current.slice(0,7));setYearStart(Math.max(1,Math.min(9988,Number(current.slice(0,4))-5)));setView("days");setOpen(true)}
 useLayoutEffect(()=>{
  const popover=panel.current;if(!open||!popover)return;
  popover.showPopover?.();
  const position=()=>{const box=root.current?.getBoundingClientRect();if(!box)return;const width=popover.offsetWidth,height=popover.offsetHeight;popover.style.left=Math.max(8,Math.min(box.left,window.innerWidth-width-8))+"px";popover.style.top=Math.max(8,Math.min(box.bottom+4,window.innerHeight-height-8))+"px"};
  position();const observer=new ResizeObserver(position);observer.observe(popover);
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))close(false)};
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close(true)}};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape,true);window.addEventListener("scroll",position,true);window.addEventListener("resize",position);
  return()=>{observer.disconnect();document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape,true);window.removeEventListener("scroll",position,true);window.removeEventListener("resize",position);popover.hidePopover?.()};
 },[open]);
 useEffect(()=>{if(disabled)setOpen(false)},[disabled]);
 function navigate(delta:number){if(view==="years"){setYearStart(v=>Math.max(1,Math.min(9988,v+delta*12)));return}const target=view==="months"?dateValue(y+delta,m,1):shiftDate(dateValue(y,m,1),delta<0?-1:32);if(target)setMonth(target.slice(0,7))}
 const months=Array.from({length:12},(_,i)=>dateValue(y,i+1,1));
 return <div className="cy-date-input" ref={root}>
  <input {...props} ref={field} className={className} type="text" inputMode="numeric" autoComplete="off" maxLength={10} disabled={disabled} required={required} placeholder={props.placeholder??"YYYY/MM/DD"} value={draft}
   onFocus={e=>{typing.current=true;props.onFocus?.(e)}}
   onChange={e=>{typing.current=true;const text=e.target.value;setDraft(text);const iso=parseDateInput(text);onChange(allowed(iso)?iso:"")}}
   onBlur={e=>{typing.current=false;const iso=parseDateInput(draft);if(allowed(iso))setDraft(iso.replaceAll("-","/"));props.onBlur?.(e)}}
   onKeyDown={e=>{props.onKeyDown?.(e);if(e.defaultPrevented||e.nativeEvent.isComposing)return;if(e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.shiftKey&&["ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();const current=parseDateInput(draft);if(current)choose(shiftDate(current,e.key==="ArrowUp"?1:-1))}if(e.key==="Enter"&&!e.ctrlKey&&!e.metaKey){const error=validity(draft);if(error||required&&!draft){e.preventDefault();e.stopPropagation();field.current?.reportValidity()}}}}/>
  <button type="button" ref={trigger} className="cy-date-trigger" disabled={disabled} aria-label="開啟日期選擇器" aria-haspopup="dialog" aria-controls={id} aria-expanded={open} onClick={()=>open?close():show()}>
   <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>
  </button>
  {open?<div id={id} ref={panel} popover="manual" role="dialog" aria-label="選擇日期" className="cy-date-calendar">
   <div className="cy-date-calendar-head"><button type="button" aria-label="上一個" disabled={view==="years"?yearStart===1:view==="months"?y===1:month==="0001-01"} onClick={()=>navigate(-1)}>‹</button><button type="button" aria-label="切換年月選擇" onClick={()=>setView(v=>v==="days"?"months":v==="months"?"years":"months")}>{view==="days"?`${y}年${String(m).padStart(2,"0")}月`:view==="months"?y:`${yearStart}–${yearStart+11}`}</button><button type="button" aria-label="下一個" disabled={view==="years"?yearStart===9988:view==="months"?y===9999:month==="9999-12"} onClick={()=>navigate(1)}>›</button></div>
   {view==="days"?<><div className="cy-date-weekdays" aria-hidden="true">{["日","一","二","三","四","五","六"].map(d=><span key={d}>{d}</span>)}</div><div className="cy-date-days">{monthDays(y,m).map((iso,i)=><button type="button" key={i} disabled={!allowed(iso)} aria-label={iso?iso.replaceAll("-","/"):"超出日期範圍"} aria-pressed={selected===iso} className={(iso.slice(0,7)!==month?"other-month ":"")+(iso===today?"is-today":"")} onClick={()=>choose(iso)}>{iso?Number(iso.slice(-2)):""}</button>)}</div></>:
    <div className="cy-date-choices">{view==="months"?months.map((iso,i)=><button type="button" key={iso} disabled={iso.slice(0,7)<min.slice(0,7)||iso.slice(0,7)>max.slice(0,7)} onClick={()=>{setMonth(iso.slice(0,7));setView("days")}}>{i+1}月</button>):Array.from({length:12},(_,i)=>yearStart+i).map(year=><button type="button" key={year} disabled={year<Number(min.slice(0,4))||year>Number(max.slice(0,4))} onClick={()=>{setMonth(`${String(year).padStart(4,"0")}-${String(m).padStart(2,"0")}`);setView("months")}}>{year}</button>)}</div>}
   <div className="cy-date-calendar-footer"><button type="button" disabled={!allowed(today)} onClick={()=>choose(today)}>今天</button></div>
  </div>:null}
 </div>;
}
