import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {HubNotice,HubRecipient,HubReadReceipt,NoticeKind} from "../../../shared/home-hub";
import {SegmentedControl} from "../../ui/primitives/SegmentedControl";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import {Field,CheckField} from "../../ui/forms/Field";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {formatDateTime} from "../../ui/foundation/format";
import {getNotices,getNotice,getNoticeRecipients,getNoticeReadReceipts,markNoticeRead,revokeNotice,sendNotice,signalHubUpdated} from "../api/home-hub-client";
import "./home-hub.css";

export function AnnouncementsPage({canPublishCompany,canSendPersonal}:{canPublishCompany:boolean;canSendPersonal:boolean}){
 const initial=new URLSearchParams(window.location.hash.split("?")[1]??"");
 const [tab,setTab]=useState<NoticeKind>(initial.get("tab")==="personal"?"personal":"company");
 const [mode,setMode]=useState<"inbox"|"sent">("inbox");
 const [items,setItems]=useState<HubNotice[]>([]),[next,setNext]=useState<string|null>(null),[selected,setSelected]=useState<HubNotice|null>(null);
 const [receipts,setReceipts]=useState<HubReadReceipt[]|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [composing,setComposing]=useState(false),[dirty,setDirty]=useState(false),[title,setTitle]=useState(""),[body,setBody]=useState("");
 const [directory,setDirectory]=useState<HubRecipient[]>([]),[search,setSearch]=useState(""),[recipients,setRecipients]=useState<number[]>([]);
 const {confirm,confirmationDialog}=useConfirmation();
 const canSend=tab==="company"?canPublishCompany:canSendPersonal;
 useUnsavedChangesGuard({active:composing&&dirty,blocked:busy});
 const reload=useCallback(async(kind:NoticeKind,scope:"inbox"|"sent")=>{
  setLoading(true);
  try{const data=await getNotices(kind,scope);setItems(data.items);setNext(data.nextCursor);setError("")}
  catch(e){setError(e instanceof Error?e.message:"通知讀取失敗")}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{void reload(tab,mode)},[tab,mode,reload]);
 useEffect(()=>{
  let active=true,sequence=0;
  const sync=()=>{
   if(!window.location.hash.startsWith("#announcements"))return;
   const current=++sequence,p=new URLSearchParams(window.location.hash.split("?")[1]??"");
   const selectedTab=p.get("tab")==="personal"?"personal":"company";
   const id=p.get("id");
   setTab(selectedTab);setMode("inbox");setReceipts(null);
   if(!id){setSelected(null);return}
   void getNotice(id).then(item=>{
    if(!active||current!==sequence)return;
    setSelected(item);
    if(!item.readAt&&!item.revokedAt)void markNoticeRead(id).then(()=>{
     if(active&&current===sequence){setSelected(old=>old?.id===id?{...old,readAt:new Date().toISOString()}:old);signalHubUpdated()}
    }).catch(()=>{});
   }).catch(e=>{if(active&&current===sequence)setError(e instanceof Error?e.message:"通知無法開啟")});
  };
  sync();window.addEventListener("hashchange",sync);
  return()=>{active=false;window.removeEventListener("hashchange",sync)};
 },[]);
 async function switchTab(next:NoticeKind){
  if(next===tab)return;
  if(composing&&dirty&&!await confirm({title:"放棄尚未發送的通知？",description:"切換頁籤將清除目前輸入內容。",confirmLabel:"放棄",confirmTone:"danger"}))return;
  setComposing(false);setDirty(false);setSelected(null);setMode("inbox");setTab(next);
 }
 async function switchMode(next:"inbox"|"sent"){
  if(next===mode)return;
  if(composing&&dirty&&!await confirm({title:"放棄尚未發送的通知？",description:"切換清單將清除目前輸入內容。",confirmLabel:"放棄",confirmTone:"danger"}))return;
  setComposing(false);setDirty(false);setSelected(null);setMode(next);
 }
 async function open(item:HubNotice){
  setSelected(current=>current?.id===item.id?null:item);setReceipts(null);
  if(mode==="inbox"&&!item.readAt&&!item.revokedAt){
   try{await markNoticeRead(item.id);setItems(old=>old.map(x=>x.id===item.id?{...x,readAt:new Date().toISOString()}:x));setSelected(old=>old?.id===item.id?{...old,readAt:new Date().toISOString()}:old);signalHubUpdated()}
   catch(e){setError(e instanceof Error?e.message:"無法標記已讀")}
  }
 }
 async function begin(){
  if(!canSend)return;
  setTitle("");setBody("");setRecipients([]);setSearch("");setDirty(false);setComposing(true);setError("");
  if(tab==="personal"){
   try{setDirectory(await getNoticeRecipients())}
   catch(e){setError(e instanceof Error?e.message:"無法讀取收件人名單")}
  }
 }
 async function publish(event:FormEvent){
  event.preventDefault();
  if(busy||!title.trim()||!body.trim()||(tab==="personal"&&!recipients.length))return;
  setBusy(true);
  try{
   await sendNotice(tab,title,body,tab==="personal"?recipients:[]);
   setDirty(false);setComposing(false);setMode("sent");setSelected(null);
   await reload(tab,"sent");signalHubUpdated();
  }catch(e){setError(e instanceof Error?e.message:"發送失敗")}finally{setBusy(false)}
 }
 async function loadMore(){
  if(!next||busy)return;setBusy(true);
  try{const data=await getNotices(tab,mode,next);setItems(old=>[...old,...data.items.filter(x=>!old.some(v=>v.id===x.id))]);setNext(data.nextCursor)}
  catch(e){setError(e instanceof Error?e.message:"載入更多失敗")}finally{setBusy(false)}
 }
 async function recall(item:HubNotice){
  if(!await confirm({title:"撤回通知？",description:"撤回「"+item.title+"」後，收件人將無法再查看。已閱讀的事實仍保留。",confirmLabel:"撤回",confirmTone:"danger"}))return;
  setBusy(true);
  try{await revokeNotice(item.id);setSelected(null);await reload(tab,"sent");signalHubUpdated()}
  catch(e){setError(e instanceof Error?e.message:"撤回失敗")}finally{setBusy(false)}
 }
 async function viewReceipts(item:HubNotice){
  try{setReceipts(await getNoticeReadReceipts(item.id))}catch(e){setError(e instanceof Error?e.message:"讀取已讀紀錄失敗")}
 }
 const listLabel=mode==="sent"?"已發送":"收到的";
 const visibleDirectory=directory.filter(p=>(p.name+" "+(p.employeeNo??"")).toLowerCase().includes(search.toLowerCase()));
 return <section className="cy-hub-page" aria-label="公告與通知">
  {confirmationDialog}
  <div className="cy-hub-notice-tabs">
   <SegmentedControl label="通知頁籤" value={tab} options={[{value:"company",label:"公司公告"},{value:"personal",label:"個人通知"}]} onChange={next=>{void switchTab(next)}}/>
   {canSend?<button className="cy-op-button primary" type="button" onClick={()=>void begin()}>{tab==="company"?"新增公司公告":"發送個人通知"}</button>:null}
  </div>
  {error?<p role="alert" className="cy-hub-error">{error}</p>:null}
  {composing?<section className="cy-op-panel" aria-label={tab==="company"?"發布公司公告":"發送個人通知"}>
   <div className="cy-op-panel-header"><h2>{tab==="company"?"發布公司公告":"發送個人通知"}</h2></div>
   <p className="cy-hub-empty">{tab==="company"?"此頁籤發布後，公司內可登入 CYWEB 的使用者都能看到。":"此頁籤僅發送給指定使用者；不會變成全公司公告。"}</p>
   <form className="cy-hub-form" onSubmit={event=>void publish(event)}>
    {tab==="personal"?<div className="cy-hub-recipient-group">
     <Field label="搜尋收件人"><input className="cy-op-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="姓名或員工編號"/></Field>
     <div className="cy-hub-recipient-picker" aria-label="指定收件人">
      {visibleDirectory.length?visibleDirectory.map(p=><CheckField key={p.id} size="l" label={p.name+(p.employeeNo?" · "+p.employeeNo:"")} checked={recipients.includes(p.id)}
       onChange={e=>{setRecipients(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id));setDirty(true)}} disabled={busy||(!recipients.includes(p.id)&&recipients.length>=50)}/>):<p className="cy-hub-empty">沒有符合的使用者</p>}
     </div><p className="cy-hub-empty">已選取 {recipients.length} 人（最多 50 人）</p>
    </div>:null}
    <Field label="標題" required><input className="cy-op-input" value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);setDirty(true)}}/></Field>
    <Field label="內容" required><textarea className="cy-op-input" rows={6} value={body} maxLength={5000} onChange={e=>{setBody(e.target.value);setDirty(true)}}/></Field>
    <div className="cy-hub-form-actions"><button className="cy-op-button" type="button" disabled={busy} onClick={()=>{setDirty(false);setComposing(false)}}>取消</button><button className="cy-op-button primary" type="submit" disabled={busy||!title.trim()||!body.trim()||(tab==="personal"&&!recipients.length)}>{tab==="company"?"發布公告":"發送通知"}</button></div>
   </form>
  </section>:null}
  <section className="cy-op-panel">
   <div className="cy-hub-actions"><h2>{tab==="company"?"公司公告":"個人通知"} · {listLabel}</h2>
    {canSend?<SegmentedControl label="通知清單" compact value={mode} options={[{value:"inbox",label:"收到的"},{value:"sent",label:"我發送的"}]} onChange={value=>{void switchMode(value)}}/>:null}
   </div>
   {loading?<p className="cy-hub-empty">正在讀取…</p>:items.length?<ul className="cy-hub-list">{items.map(item=><li key={item.id}>
    <div className="cy-hub-list-row">
     <ExpandToggle expanded={selected?.id===item.id} label={item.title} onToggle={()=>void open(item)}/>
     <button type="button" onClick={()=>void open(item)}><strong>{item.title}{item.revokedAt?"（已撤回）":""}</strong><small>{item.authorName} · {formatDateTime(item.createdAt)}{mode==="inbox"&&!item.readAt?" · 未讀":""}</small></button>
    </div>
    {selected?.id===item.id?<div className="cy-hub-detail">
     <p>{item.body}</p>
     {mode==="sent"?<div className="cy-hub-form-actions">
      <button className="cy-op-button compact" type="button" onClick={()=>void viewReceipts(item)}>{tab==="company"?"查看已讀者":"查看收件人已讀情況"}</button>
      {!item.revokedAt?<button type="button" className="cy-op-button compact danger" disabled={busy} onClick={()=>void recall(item)}>撤回</button>:null}
     </div>:null}
     {receipts?<ul className="cy-hub-receipts">{receipts.map(p=><li key={p.id}>{p.name}{p.employeeNo?"（"+p.employeeNo+"）":""}：{p.readAt?"已讀 "+formatDateTime(p.readAt):"未讀"}</li>)}</ul>:null}
    </div>:null}
   </li>)}</ul>:<p className="cy-hub-empty">目前沒有{tab==="company"?"公司公告":"個人通知"}</p>}
   {next?<button type="button" className="cy-op-button cy-hub-bell-more" disabled={busy} onClick={()=>void loadMore()}>載入更多</button>:null}
   {selected&&!items.some(x=>x.id===selected.id)?<div className="cy-hub-detail"><strong>{selected.title}</strong><p>{selected.body}</p><small>{selected.authorName} · {formatDateTime(selected.createdAt)}</small></div>:null}
  </section>
 </section>;
}
