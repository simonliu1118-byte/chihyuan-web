import {useEffect,useRef,useState} from "react";
import {BOT_REVIEW_LABELS,type BotPatrolSessionItem,type BotPatrolSummary,type BotSentItemPage,type BotSentItemView} from "../../../shared/bot-center";
import {loadPatrolSessionItems,loadSentPatrolItems} from "../api/bot-center-client";
import {Dialog} from "../../ui/overlays/Dialog";
import {Loading} from "../../ui/feedback/Loading";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {formatDateTime} from "../../ui/foundation/format";
import {BotText} from "./BotText";
import {patrolStatusLabel,patrolStatusTone} from "./BotWorkCards";

/**
 * 今日送出的海巡回覆。帶 session 時只看該場次（V0.22.0）：先列「待處理」的則（待審、或已通過等小編留言），
 * 再列該場次已送出的回覆；待審的場次可直接前往審閱。
 */
export function BotSentPatrolDialog({botCode,session,onClose,onReview}:{botCode?:string;session?:BotPatrolSummary;onClose:()=>void;onReview?:(draftIds:number[])=>void}){
 const [page,setPage]=useState<BotSentItemPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [waiting,setWaiting]=useState<BotPatrolSessionItem[]|null>(null);
 const request=useRef(0);
 async function load(before?:string){
  const serial=++request.current;setBusy(true);setError(null);
  try{
   let next=await loadSentPatrolItems(before,botCode,session?.id);
   if(before&&page&&next.day!==page.day)next=await loadSentPatrolItems(undefined,botCode,session?.id);
   if(serial!==request.current)return;
   const incoming=next;
   setPage(previous=>before&&previous?.day===incoming.day?{...incoming,items:[...previous.items,...incoming.items.filter(item=>!previous.items.some(old=>old.id===item.id))]}:incoming);
   if(!before&&session&&session.id>0)setWaiting((await loadPatrolSessionItems(session.id)).items);
  }catch(e){if(serial===request.current)setError(e instanceof Error?e.message:"無法載入送出內容")}finally{if(serial===request.current)setBusy(false)}
 }
 useEffect(()=>{void load();return()=>{request.current++}},[botCode,session?.id]);
 const title=session?<span className="cy-bot-sent-title"><strong>{session.label||"其他"}</strong><StatusChip tone={patrolStatusTone(session.status)}>{patrolStatusLabel(session)}</StatusChip><small>{session.day.replaceAll("-","/")}・送出 {session.sentTotal} 則</small></span>:"今日送出的海巡回覆";
 return <Dialog open size="large" title={title} dismissible={false} showCloseButton={false} onClose={onClose} footer={<button type="button" className="cy-op-button" onClick={onClose}>關閉</button>}>
  {error?<p className="cy-notice cy-notice-danger" role="alert">{error}<button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void load()}>重試</button></p>:null}
  {!page&&busy?<Loading/>:null}
  {session&&waiting?.length?<section className="cy-bot-sent-items" aria-label="待處理的則">
   <header className="cy-bot-sent-heading"><strong>{session.status==="pending"?`待審 ${session.pendingItems} 則`:`已通過、待留言 ${session.awaitingItems} 則`}</strong>
    {session.status==="pending"&&session.draftIds.length&&onReview?<button type="button" className="cy-op-button compact primary" onClick={()=>onReview(session.draftIds)}>前往審閱</button>:null}</header>
   {waiting.map(item=><article key={item.id}><header className="cy-bot-sent-heading"><strong>{item.seq}　{item.title}</strong><StatusChip tone={item.status==="pending"?"warning":"success"}>{BOT_REVIEW_LABELS[item.status]}</StatusChip></header><BotText text={item.body}/></article>)}
  </section>:null}
  {page?<div className="cy-bot-sent-items">{session&&waiting?.length&&page.items.length?<header className="cy-bot-sent-heading"><strong>已送出</strong></header>:null}{page.items.length?page.items.map((item,index)=><SentPatrolItem key={item.id} item={item} number={session?Math.max(session.sentTotal-index,1):index+1}/>):<p>{session?"此場次尚無已送出的回覆":"今日尚無已送出的海巡回覆"}</p>}</div>:null}
  {page?.more?<div className="cy-bot-more"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void load(page.nextBefore??undefined)}>載入更多回覆</button></div>:null}
 </Dialog>;
}

/**
 * 已送出的一則（V0.30.0）：標題列「第 N 則　@作者 ↗」＋時間，標題連到我們送出的留言；桌機左原文（淡）右我們的留言，手機上下排。
 * 舊資料沒有原文時左側顯示「未附原文」，右側照原本內文，不解析舊內文。
 */
export function SentPatrolItem({item,number}:{item:BotSentItemView;number:number}){
 const name=item.sourceAuthor?`@${item.sourceAuthor.replace(/^@/,"")}`:item.title;
 const heading=<>第 {number} 則　{name}{item.url?" ↗":""}</>;
 return <article className="cy-bot-sent-item">
  <header className="cy-bot-sent-heading"><strong className="cy-bot-sent-item-title">{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">{heading}</a>:heading}</strong><time dateTime={item.sentAt}>{formatDateTime(item.sentAt)}</time></header>
  <div className="cy-bot-sent-cols">
   <section className="cy-bot-sent-source" aria-label="原文"><span className="cy-bot-sent-label">原文</span>{item.sourceText?<BotText text={item.sourceText}/>:<p className="cy-bot-sent-missing">未附原文</p>}</section>
   <section className="cy-bot-sent-reply" aria-label="我們的留言"><span className="cy-bot-sent-label">我們的留言</span><BotText text={item.body}/></section>
  </div>
 </article>;
}
