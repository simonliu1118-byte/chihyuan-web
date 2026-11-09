import {useCallback,useEffect,useState,type ReactNode} from "react";
import {BOT_DRAFT_KIND_LABELS,BOT_REVIEW_LABELS,type BotDraftDetail,type BotReviewImageView,type BotReviewStatus} from "../../../shared/bot-center";
import {loadDraftDetail,reviewDraft,reviewDraftItem,reviewImageUrl} from "../api/bot-center-client";
import {Dialog} from "../../ui/overlays/Dialog";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {Loading} from "../../ui/feedback/Loading";
import {formatDateTime} from "../../ui/foundation/format";
import {useFormPrompt} from "../../ui/overlays/useFormPrompt";

const TONE:Record<BotReviewStatus,"warning"|"success"|"danger">={pending:"warning",approved:"success",rejected:"danger"};

/** Plain text with line breaks kept and http(s) links clickable; nothing is parsed as HTML. */
function RichText({text}:{text:string}){
 const parts:ReactNode[]=[];let last=0;
 for(const m of text.matchAll(/https?:\/\/[^\s<>()（）]+/g)){
  parts.push(text.slice(last,m.index));
  parts.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer">{m[0]}</a>);
  last=(m.index??0)+m[0].length;
 }
 parts.push(text.slice(last));
 return <div className="cy-bot-rich">{parts}</div>;
}

function Images({images,onOpen}:{images:BotReviewImageView[];onOpen:(id:number)=>void}){
 if(!images.length)return null;
 return <div className="cy-bot-images">{images.map(image=><button key={image.id} type="button" className="cy-bot-thumb" aria-label="放大圖片" onClick={()=>onOpen(image.id)}>
  <img src={reviewImageUrl(image.id)} alt="" loading="lazy"/></button>)}</div>;
}

/**
 * 審稿視窗 (V0.15.0, user 2026-11-09). One draft at a time with previous／next across the given list.
 * A single draft is decided as a whole; a multi-item draft (貼文／海巡) is decided item by item, with
 * 全部通過／全部退回 for whatever is still pending. Read-only once reviewed (今日回報 cards).
 */
export function BotReviewDialog({ids,initialId,canReview,onClose,onChanged}:{ids:readonly number[];initialId:number;canReview:boolean;onClose:()=>void;onChanged:()=>void}){
 const [id,setId]=useState(initialId),[detail,setDetail]=useState<BotDraftDetail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[zoom,setZoom]=useState<number|null>(null);
 const {ask,promptDialog}=useFormPrompt();
 const load=useCallback(async(target:number)=>{setBusy(true);setError(null);try{setDetail(await loadDraftDetail(target))}catch(e){setError(e instanceof Error?e.message:"無法載入審稿")}finally{setBusy(false)}},[]);
 useEffect(()=>{void load(id)},[id,load]);
 const index=ids.indexOf(id);
 async function reason(){const values=await ask({title:"退回理由",fields:[{name:"reason",label:"退回理由",multiline:true,required:true}],confirmLabel:"退回",confirmTone:"danger"});return values?.reason?.trim()||null}
 async function act(task:()=>Promise<unknown>){setBusy(true);setError(null);try{await task();await load(id);onChanged()}catch(e){setError(e instanceof Error?e.message:"審核失敗")}finally{setBusy(false)}}
 const draft=detail?.draft,pending=!!draft&&draft.status==="pending"&&canReview;
 const imagesOf=(itemId:number|null)=>detail?.images.filter(image=>image.itemId===itemId)??[];
 const decideAll=async(decision:"approved"|"rejected")=>{const r=decision==="rejected"?await reason():null;if(decision==="rejected"&&!r)return;await act(()=>reviewDraft(id,decision,r??undefined))};
 const decideItem=async(seq:number,decision:"approved"|"rejected")=>{const r=decision==="rejected"?await reason():null;if(decision==="rejected"&&!r)return;await act(()=>reviewDraftItem(id,seq,decision,r??undefined))};
 const remaining=detail?.items.filter(item=>item.status==="pending").length??0;
 const footer=<div className="cy-bot-review-footer">
  {ids.length>1?<span className="cy-bot-review-nav"><button type="button" className="cy-op-button compact" disabled={busy||index<=0} onClick={()=>setId(ids[index-1])}>‹ 上一篇</button>
   <span>{index+1}／{ids.length}</span><button type="button" className="cy-op-button compact" disabled={busy||index>=ids.length-1} onClick={()=>setId(ids[index+1])}>下一篇 ›</button></span>:null}
  <button type="button" className="cy-op-button" disabled={busy} onClick={onClose}>關閉</button>
  {pending?<><button type="button" className="cy-op-button danger" disabled={busy} onClick={()=>void decideAll("rejected")}>{detail?.items.length?`剩餘 ${remaining} 則全部退回…`:"退回…"}</button>
   <button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>void decideAll("approved")}>{detail?.items.length?`剩餘 ${remaining} 則全部通過`:"通過"}</button></>:null}
 </div>;
 return <Dialog open size="large" className="cy-bot-review-dialog" title={draft?.title??"審稿"} dismissible={false} showCloseButton={false} onClose={onClose} footer={footer}>
  {promptDialog}
  {!detail?<Loading/>:<>
   <div className="cy-bot-review-meta">
    <StatusChip tone={TONE[detail.draft.status]}>{detail.draft.reason==="部分通過"?"部分通過":BOT_REVIEW_LABELS[detail.draft.status]}</StatusChip>
    <span>{detail.draft.botLabel}・{BOT_DRAFT_KIND_LABELS[detail.draft.kind]}・{formatDateTime(detail.draft.createdAt)} 送審</span>
    {detail.draft.itemCounts?<span>共 {detail.draft.itemCounts.total} 則：通過 {detail.draft.itemCounts.approved}・退回 {detail.draft.itemCounts.rejected}・待審 {detail.draft.itemCounts.pending}</span>:null}
   </div>
   {error?<p className="cy-notice cy-notice-danger" role="alert">{error}</p>:null}
   {detail.items.length?<div className="cy-bot-review-layout">
    <nav className="cy-bot-review-toc" aria-label="目錄">{detail.items.map(item=><a key={item.id} href={"#bot-item-"+item.id} onClick={e=>{e.preventDefault();document.getElementById("bot-item-"+item.id)?.scrollIntoView({block:"start",behavior:"smooth"})}}>
     <StatusChip tone={TONE[item.status]}>{item.seq}</StatusChip><span>{item.title}</span></a>)}</nav>
    <div className="cy-bot-review-main">
     <section className="cy-bot-review-note"><RichText text={detail.draft.body}/><Images images={imagesOf(null)} onOpen={setZoom}/></section>
     {detail.items.map(item=><article key={item.id} id={"bot-item-"+item.id} className="cy-bot-review-item">
      <header><strong>{item.seq}　{item.title}</strong><StatusChip tone={TONE[item.status]}>{BOT_REVIEW_LABELS[item.status]}</StatusChip>{item.sentAt?<StatusChip tone="info">已送出</StatusChip>:null}</header>
      <RichText text={item.body}/>
      <Images images={imagesOf(item.id)} onOpen={setZoom}/>
      {item.reason?<p className="cy-bot-review-reason">退回理由：{item.reason}</p>:null}
      {pending&&item.status==="pending"?<div className="cy-bot-review-item-actions">
       <button type="button" className="cy-op-button compact danger" disabled={busy} onClick={()=>void decideItem(item.seq,"rejected")}>退回…</button>
       <button type="button" className="cy-op-button compact primary" disabled={busy} onClick={()=>void decideItem(item.seq,"approved")}>通過</button></div>:null}
     </article>)}
    </div>
   </div>:<div className="cy-bot-review-main">
    <RichText text={detail.draft.body}/><Images images={imagesOf(null)} onOpen={setZoom}/>
    {detail.draft.status==="rejected"&&detail.draft.reason?<p className="cy-bot-review-reason">退回理由：{detail.draft.reason}</p>:null}
   </div>}
  </>}
  {zoom!==null?<Dialog open size="large" title="圖片" dismissible={false} showCloseButton={false} onClose={()=>setZoom(null)} footer={<button type="button" className="cy-op-button" onClick={()=>setZoom(null)}>關閉</button>}><img className="cy-bot-zoom" src={reviewImageUrl(zoom)} alt="審稿圖片"/></Dialog>:null}
 </Dialog>;
}
