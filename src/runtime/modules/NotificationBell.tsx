import {useCallback,useEffect,useId,useRef,useState} from "react";
import {Icons} from "../../ui/actions/icons";
import type {HubReminder,HubReminderPage} from "../../../shared/home-hub";
import {getHubReminders,HUB_UPDATED_EVENT} from "../api/home-hub-client";
import type {HubNavigate} from "./HomePage";
import "./home-hub.css";

const category=(item:HubReminder)=>item.kind==="todo"?"個人待辦":item.kind==="personal"?"個人通知":"公司公告";
export function NotificationBell({onNavigate}:{onNavigate:HubNavigate}){
 const [open,setOpen]=useState(false),[page,setPage]=useState<HubReminderPage|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const root=useRef<HTMLDivElement>(null),openRef=useRef(false),serial=useRef(0),menuId=useId();
 openRef.current=open;
 const refresh=useCallback(async()=>{
  const n=++serial.current;
  try{const response=await getHubReminders(undefined,5);if(n===serial.current){setPage(response);setError("")}}
  catch(e){if(n===serial.current)setError(e instanceof Error?e.message:"通知提醒暫時無法讀取")}
 },[]);
 useEffect(()=>{
  void refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible"&&!openRef.current)void refresh()},60_000);
  const focused=()=>{if(!openRef.current)void refresh()};
  const updated=()=>{void refresh()};
  window.addEventListener("focus",focused);window.addEventListener(HUB_UPDATED_EVENT,updated);
  return()=>{serial.current++;window.clearInterval(timer);window.removeEventListener("focus",focused);window.removeEventListener(HUB_UPDATED_EVENT,updated)};
 },[refresh]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)};
 },[open]);
 async function more(){
  if(!page?.nextCursor||busy)return;
  setBusy(true);
  try{
   const next=await getHubReminders(page.nextCursor,10);
   setPage(prev=>prev?{...next,items:[...prev.items,...next.items.filter(v=>!prev.items.some(x=>x.kind===v.kind&&x.id===v.id))]}:next);
  }catch(e){setError(e instanceof Error?e.message:"無法載入更多提醒")}finally{setBusy(false)}
 }
 function go(item:HubReminder){
  setOpen(false);
  if(item.kind==="todo")onNavigate("my-todos",{id:item.id});
  else onNavigate("announcements",{tab:item.kind,id:item.id});
 }
 const total=page?.counts.total??0;
 return <div className="cy-hub-bell" ref={root}>
  <button type="button" className="cy-hub-bell-trigger" aria-haspopup="dialog" aria-controls={menuId} aria-expanded={open}
   aria-label={"通知提醒"+(total?"，"+total+" 件待處理":"")} title="通知提醒" onClick={()=>{setOpen(old=>!old);if(!open)void refresh()}}>
   {Icons.bell}{total>0?<span className="cy-hub-bell-count" aria-hidden="true">{total>9?"9+":total}</span>:null}
  </button>
  {open?<div id={menuId} className="cy-hub-bell-popover" role="dialog" aria-label="通知提醒">
   <div className="cy-hub-bell-heading"><strong>通知提醒</strong><span>{total} 件待處理</span></div>
   <div className="cy-hub-bell-scroll">{page?.items.length?page.items.map(item=><button type="button" key={item.kind+item.id} className="cy-hub-bell-item" onClick={()=>go(item)}>
    <strong>{item.title}</strong><span>{category(item)} · {item.subtitle}</span>
   </button>):<p className="cy-hub-empty">{page?"沒有待處理提醒":"正在讀取…"}</p>}</div>
   {error?<p className="cy-hub-error" role="alert">{error}</p>:null}
   {page?.more?<button type="button" className="cy-op-button compact cy-hub-bell-more" disabled={busy} onClick={()=>void more()}>載入更多（每次 10 件）</button>:null}
  </div>:null}
 </div>;
}
