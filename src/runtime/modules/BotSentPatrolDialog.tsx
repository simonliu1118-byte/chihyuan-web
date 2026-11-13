import {useEffect,useRef,useState} from "react";
import type {BotSentItemPage} from "../../../shared/bot-center";
import {loadSentPatrolItems} from "../api/bot-center-client";
import {Dialog} from "../../ui/overlays/Dialog";
import {Loading} from "../../ui/feedback/Loading";
import {formatDateTime} from "../../ui/foundation/format";
import {BotText} from "./BotText";

export function BotSentPatrolDialog({botCode,onClose}:{botCode?:string;onClose:()=>void}){
 const [page,setPage]=useState<BotSentItemPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const request=useRef(0);
 async function load(before?:string){
  const serial=++request.current;setBusy(true);setError(null);
  try{
   let next=await loadSentPatrolItems(before,botCode);
   if(before&&page&&next.day!==page.day)next=await loadSentPatrolItems(undefined,botCode);
   if(serial!==request.current)return;
   const incoming=next;
   setPage(previous=>before&&previous?.day===incoming.day?{...incoming,items:[...previous.items,...incoming.items.filter(item=>!previous.items.some(old=>old.id===item.id))]}:incoming);
  }catch(e){if(serial===request.current)setError(e instanceof Error?e.message:"無法載入送出內容")}finally{if(serial===request.current)setBusy(false)}
 }
 useEffect(()=>{void load();return()=>{request.current++}},[botCode]);
 return <Dialog open size="large" title="今日送出的海巡回覆" dismissible={false} showCloseButton={false} onClose={onClose} footer={<button type="button" className="cy-op-button" onClick={onClose}>關閉</button>}>
  {error?<p className="cy-notice cy-notice-danger" role="alert">{error}<button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void load()}>重試</button></p>:null}
  {!page&&busy?<Loading/>:null}
  {page?<div className="cy-bot-sent-items">{page.items.length?page.items.map(item=><article key={item.id}>
   <header className="cy-bot-sent-heading"><strong>{item.title}</strong><time dateTime={item.sentAt}>{formatDateTime(item.sentAt)}</time></header>
   <BotText text={item.body}/>
  </article>):<p>今日尚無已送出的海巡回覆</p>}</div>:null}
  {page?.more?<div className="cy-bot-more"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void load(page.nextBefore??undefined)}>載入更多回覆</button></div>:null}
 </Dialog>;
}
