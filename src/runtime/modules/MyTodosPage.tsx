import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {PersonalTodo,TodoPriority} from "../../../shared/home-hub";
import {useUnsavedChangesGuard} from "../../ui/foundation/useUnsavedChangesGuard";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {Field} from "../../ui/forms/Field";
import {SegmentedControl} from "../../ui/primitives/SegmentedControl";
import {formatDateTime} from "../../ui/foundation/format";
import {deleteTodo,getTodo,getTodos,saveTodo,setTodoCompleted,signalHubUpdated} from "../api/home-hub-client";
import "./home-hub.css";

type Status="open"|"done";
const empty=()=>({title:"",detail:"",dueDate:"",dueTime:"",priority:"normal" as TodoPriority});
export function MyTodosPage(){
 const [status,setStatus]=useState<Status>("open"),[items,setItems]=useState<PersonalTodo[]>([]);
 const [next,setNext]=useState<string|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[editor,setEditor]=useState(false),[editId,setEditId]=useState<number|null>(null);
 const [draft,setDraft]=useState(empty),[dirty,setDirty]=useState(false);
 const {confirm,confirmationDialog}=useConfirmation();
 useUnsavedChangesGuard({active:editor&&dirty,blocked:busy});
 const refresh=useCallback(async(kind:Status)=>{
  setLoading(true);
  try{const data=await getTodos(kind);setItems(data.items);setNext(data.nextCursor);setError("")}
  catch(e){setError(e instanceof Error?e.message:"待辦事項讀取失敗")}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{
  void refresh("open");
  let active=true,sequence=0;
  const sync=()=>{
   if(!window.location.hash.startsWith("#my-todos"))return;
   const current=++sequence,params=new URLSearchParams(window.location.hash.split("?")[1]??"");
   if(params.get("new")==="1"){setEditId(null);setDraft(empty());setDirty(false);setEditor(true);return}
   const id=Number(params.get("id"));
   if(Number.isSafeInteger(id)&&id>0)void getTodo(id).then(todo=>{
    if(!active||current!==sequence)return;
    setEditId(todo.id);setDraft({title:todo.title,detail:todo.detail,dueDate:todo.dueDate??"",dueTime:todo.dueTime??"",priority:todo.priority});setDirty(false);setEditor(true);
   }).catch(e=>{if(active&&current===sequence)setError(e instanceof Error?e.message:"找不到指定待辦")});
  };
  sync();window.addEventListener("hashchange",sync);
  return()=>{active=false;window.removeEventListener("hashchange",sync)};
 },[refresh]);
 function start(item?:PersonalTodo){
  setEditId(item?.id??null);
  setDraft(item?{title:item.title,detail:item.detail,dueDate:item.dueDate??"",dueTime:item.dueTime??"",priority:item.priority}:empty());
  setDirty(false);setEditor(true);setError("");
 }
 function change(key:keyof ReturnType<typeof empty>,value:string){
  setDraft(old=>({...old,[key]:value}));setDirty(true);
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(busy||!draft.title.trim())return;
  setBusy(true);
  try{
   await saveTodo({title:draft.title,detail:draft.detail,dueDate:draft.dueDate||null,dueTime:draft.dueDate&&draft.dueTime?draft.dueTime:null,priority:draft.priority},editId??undefined);
   setDirty(false);setEditor(false);setEditId(null);signalHubUpdated();await refresh(status);
  }catch(e){setError(e instanceof Error?e.message:"儲存待辦失敗")}finally{setBusy(false)}
 }
 async function complete(item:PersonalTodo){
  if(busy)return;setBusy(true);
  try{await setTodoCompleted(item.id,!item.completedAt);signalHubUpdated();await refresh(status)}
  catch(e){setError(e instanceof Error?e.message:"更新完成狀態失敗")}finally{setBusy(false)}
 }
 async function remove(item:PersonalTodo){
  if(!await confirm({title:"刪除待辦事項？",description:"「"+item.title+"」刪除後無法還原。",confirmLabel:"刪除",confirmTone:"danger"}))return;
  setBusy(true);
  try{await deleteTodo(item.id);setEditor(false);setDirty(false);signalHubUpdated();await refresh(status)}
  catch(e){setError(e instanceof Error?e.message:"刪除失敗")}finally{setBusy(false)}
 }
 async function more(){
  if(!next||busy)return;
  setBusy(true);
  try{const data=await getTodos(status,next);setItems(old=>[...old,...data.items.filter(item=>!old.some(v=>v.id===item.id))]);setNext(data.nextCursor)}
  catch(e){setError(e instanceof Error?e.message:"無法載入更多")}finally{setBusy(false)}
 }
 const formatDue=(item:PersonalTodo)=>item.dueDate?(item.dueDate.replaceAll("-","/")+(item.dueTime?" "+item.dueTime:"")):"未設定期限";
 return <section className="cy-hub-page" aria-label="我的待辦事項">
  {confirmationDialog}
  <div className="cy-hub-actions"><SegmentedControl label="待辦清單篩選" value={status} options={[{value:"open",label:"未完成"},{value:"done",label:"已完成"}]} onChange={kind=>{setStatus(kind);void refresh(kind)}}/>
   <button className="cy-op-button primary" type="button" onClick={()=>start()}>新增待辦</button>
  </div>
  {error?<p className="cy-hub-error" role="alert">{error}</p>:null}
  {editor?<section className="cy-op-panel" aria-label={editId?"編輯待辦":"新增待辦"}>
    <div className="cy-op-panel-header"><h2>{editId?"編輯待辦事項":"新增待辦事項"}</h2></div>
    <form className="cy-hub-form" onSubmit={event=>void submit(event)}>
     <Field label="待辦事項" required><input className="cy-op-input" maxLength={160} required value={draft.title} onChange={e=>change("title",e.target.value)}/></Field>
     <Field label="詳情"><textarea className="cy-op-input" rows={3} maxLength={3000} value={draft.detail} onChange={e=>change("detail",e.target.value)}/></Field>
     <div className="cy-hub-form-grid">
      <Field label="到期日期（選填）"><input className="cy-op-input" type="date" value={draft.dueDate} onChange={e=>{change("dueDate",e.target.value);if(!e.target.value)change("dueTime","")}}/></Field>
      <Field label="到期時間（選填）"><input className="cy-op-input" type="time" disabled={!draft.dueDate} value={draft.dueTime} onChange={e=>change("dueTime",e.target.value)}/></Field>
      <Field label="優先程度"><select className="cy-op-input" value={draft.priority} onChange={e=>change("priority",e.target.value)}><option value="normal">一般</option><option value="important">重要</option></select></Field>
     </div>
     <div className="cy-hub-form-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>{setDirty(false);setEditor(false)}}>取消</button><button type="submit" className="cy-op-button primary" disabled={busy||!draft.title.trim()}>儲存</button></div>
    </form>
   </section>:null}
  <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>{status==="open"?"尚未完成":"已完成"}的待辦</h2></div>
   {loading?<p className="cy-hub-empty">正在讀取…</p>:items.length?<ul className="cy-hub-list">{items.map(item=><li key={item.id}>
    <div className="cy-hub-list-row">
     <button type="button" className="cy-op-button compact" disabled={busy} style={{flex:"none"}} onClick={()=>void complete(item)}>{item.completedAt?"恢復":"完成"}</button>
     <button type="button" title={item.title} onClick={()=>start(item)}><strong>{item.priority==="important"?"重要 · ":""}{item.title}</strong><small>{formatDue(item)} · {item.completedAt?"完成於 "+formatDateTime(item.completedAt):"建立於 "+formatDateTime(item.createdAt)}</small></button>
     <button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void remove(item)}>刪除</button>
    </div>
    {item.detail?<p className="cy-hub-list-note">{item.detail}</p>:null}
   </li>)}</ul>:<p className="cy-hub-empty">目前沒有{status==="open"?"未完成":"已完成"}事項</p>}
   {next?<button className="cy-op-button cy-hub-bell-more" type="button" disabled={busy} onClick={()=>void more()}>載入更多</button>:null}
  </section>
 </section>;
}
