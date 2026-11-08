import {useEffect,useState} from "react";
import {getHomeSummary,HUB_UPDATED_EVENT} from "../api/home-hub-client";
import type {HubSummary,HubNotice,PersonalTodo} from "../../../shared/home-hub";
import {formatDateTime} from "../../ui/foundation/format";
import "./home-hub.css";

export interface HubLink {key:string;label:string;}
export interface HubNavigate{(route:string,params?:Record<string,string|number>):void;}
function noticePreview(items:HubNotice[],empty:string,onNavigate:HubNavigate,kind:"company"|"personal"){
 return items.length?items.map(item=><button key={item.id} className="cy-hub-preview-item" type="button" onClick={()=>onNavigate("announcements",{tab:kind,id:item.id})}>
  <strong>{item.title}</strong><span>{item.authorName} · {formatDateTime(item.createdAt)}{!item.readAt?" · 未讀":""}</span>
 </button>):<p className="cy-hub-empty">{empty}</p>;
}
function todoLabel(item:PersonalTodo){
 if(!item.dueDate)return "未設定期限";
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replaceAll("/","-");
 return item.dueDate<day?"已逾期":item.dueDate===day?"今日到期":item.dueDate.replaceAll("-","/");
}
export function HomePage({displayName,shortcuts,onNavigate}:{displayName:string;shortcuts:HubLink[];onNavigate:HubNavigate}){
 const [data,setData]=useState<HubSummary|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  const load=()=>{void getHomeSummary().then(v=>{if(active){setData(v);setError("")}}).catch(e=>{if(active)setError(e instanceof Error?e.message:"首頁資料暫時無法讀取")})};
  load();window.addEventListener(HUB_UPDATED_EVENT,load);
  return()=>{active=false;window.removeEventListener(HUB_UPDATED_EVENT,load)};
 },[]);
 const today=new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date());
 return <section className="cy-home-page">
  <div className="cy-home-welcome"><h2>您好，{displayName}</h2><p>{today} · 從這裡開始今天的工作</p></div>
  {error?<p role="alert" className="cy-hub-error">{error}</p>:null}
  <div className="cy-home-stat-grid">
   <button className="cy-op-panel cy-home-stat" type="button" onClick={()=>onNavigate("my-todos")}>
    <strong>{data?data.counts.overdue+data.counts.today:"—"}</strong><span>今日與逾期待辦</span>
   </button>
   <button className="cy-op-panel cy-home-stat" type="button" onClick={()=>onNavigate("announcements",{tab:"personal"})}>
    <strong>{data?.counts.personal??"—"}</strong><span>未讀個人通知</span>
   </button>
   <button className="cy-op-panel cy-home-stat" type="button" onClick={()=>onNavigate("announcements",{tab:"company"})}>
    <strong>{data?.counts.company??"—"}</strong><span>未讀公司公告</span>
   </button>
  </div>
  <section className="cy-op-panel cy-home-todo" aria-label="我的個人待辦">
   <div className="cy-op-panel-header"><h2>我的個人待辦</h2><div>
    <button type="button" className="cy-op-button compact" onClick={()=>onNavigate("my-todos")}>查看全部</button>
    <button type="button" className="cy-op-button compact primary" onClick={()=>onNavigate("my-todos",{new:1})}>新增待辦</button>
   </div></div>
   {data?.todos.length?<ul className="cy-home-todo-list">{data.todos.map(item=><li key={item.id}>
    <button type="button" onClick={()=>onNavigate("my-todos",{id:item.id})}><strong>{item.title}</strong><span className={item.dueDate&&item.dueDate<new Date().toISOString().slice(0,10)?"is-overdue":""}>{todoLabel(item)}</span></button>
   </li>)}</ul>:<p className="cy-hub-empty">{data?"目前沒有未完成事項":"正在讀取待辦事項…"}</p>}
  </section>
  <section className="cy-op-panel" aria-label="我的常用功能"><div className="cy-op-panel-header"><h2>我的常用功能</h2></div>
   <div className="cy-home-shortcuts">{shortcuts.length?shortcuts.slice(0,8).map(link=><button key={link.key} type="button" className="cy-home-shortcut" onClick={()=>onNavigate(link.key)}>{link.label}</button>):<p className="cy-hub-empty">目前沒有其他業務模組的使用權</p>}</div>
  </section>
  <div className="cy-home-notices">
   <section className="cy-op-panel" aria-label="公司公告">
    <div className="cy-op-panel-header"><h2>公司公告</h2><button className="cy-op-button compact" type="button" onClick={()=>onNavigate("announcements",{tab:"company"})}>查看全部</button></div>
    {noticePreview(data?.company??[],"目前沒有公告",onNavigate,"company")}
   </section>
   <section className="cy-op-panel" aria-label="個人通知">
    <div className="cy-op-panel-header"><h2>個人通知</h2><button className="cy-op-button compact" type="button" onClick={()=>onNavigate("announcements",{tab:"personal"})}>查看全部</button></div>
    {noticePreview(data?.personal??[],"目前沒有個人通知",onNavigate,"personal")}
   </section>
  </div>
 </section>;
}
