import {useCallback,useEffect,useState} from "react";
import {BOT_DRAFT_KIND_LABELS,BOT_REVIEW_LABELS,type BotDraftDetail,type BotReviewStatus} from "../../../shared/bot-center";
import {loadDraftDetail,reviewDraft,reviewDraftItem,reviewImageUrl} from "../api/bot-center-client";
import {Dialog} from "../../ui/overlays/Dialog";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {Loading} from "../../ui/feedback/Loading";
import {formatDateTime} from "../../ui/foundation/format";
import {useFormPrompt} from "../../ui/overlays/useFormPrompt";

const TONE:Record<BotReviewStatus,"warning"|"success"|"danger"|"neutral">={pending:"warning",approved:"success",rejected:"danger",external:"neutral"};

import {ExpandToggle} from "../../ui/data/ExpandToggle";
import {BotImages as Images} from "./BotImages";
import {useLatestRequest} from "../../ui/foundation/useLatestRequest";
import {useCompactLayout} from "../../ui/foundation/useCompactLayout";
import {OverflowMenu} from "../../ui/mobile/OverflowMenu";
import {BotText as RichText} from "./BotText";


/**
 * 審稿視窗 (V0.15.0, user 2026-11-09). One draft at a time with previous／next across the given list.
 * A single draft is decided as a whole; a multi-item draft (貼文／海巡) is decided item by item, with
 * 全部通過／全部退回 for whatever is still pending. Read-only once reviewed (今日回報 cards).
 */
export function BotReviewDialog({ids,initialId,canReview,onClose,onChanged,onlyItemSeq}:{ids:readonly number[];initialId:number;canReview:boolean;onClose:()=>void;onChanged:()=>void;onlyItemSeq?:number}){
 const [id,setId]=useState(initialId),[detail,setDetail]=useState<BotDraftDetail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[zoom,setZoom]=useState<number|null>(null);
 const compact=useCompactLayout();
 const [activeSeq,setActiveSeq]=useState(1),[showNote,setShowNote]=useState(false);
 const request=useLatestRequest(id);
 const {ask,promptDialog}=useFormPrompt();
 const load=useCallback(async(target:number)=>{const current=request.begin();setBusy(true);setError(null);try{const next=await loadDraftDetail(target);if(current.current())setDetail(next)}catch(e){if(current.current())setError(e instanceof Error?e.message:"無法載入審稿")}finally{if(current.current())setBusy(false)}},[request]);
 useEffect(()=>{setDetail(null);setActiveSeq(1);setShowNote(false);void load(id);return()=>request.invalidate()},[id,load,request]);
 const index=ids.indexOf(id);
 async function reason(){const values=await ask({title:"退回理由",fields:[{name:"reason",label:"退回理由",multiline:true,required:true}],confirmLabel:"退回",confirmTone:"danger",size:"mini"});return values?.reason?.trim()||null}
 async function act(task:()=>Promise<unknown>){setBusy(true);setError(null);try{await task();await load(id);onChanged()}catch(e){setError(e instanceof Error?e.message:"審核失敗")}finally{setBusy(false)}}
 const draft=detail?.draft,pending=!!draft&&draft.status==="pending"&&!draft.supersededById&&canReview&&onlyItemSeq===undefined;
 const imagesOf=(itemId:number|null)=>detail?.images.filter(image=>image.itemId===itemId)??[];
 const decideAll=async(decision:"approved"|"rejected")=>{const r=decision==="rejected"?await reason():null;if(decision==="rejected"&&!r)return;await act(()=>reviewDraft(id,decision,r??undefined))};
 const decideItem=async(seq:number,decision:"approved"|"rejected")=>{const r=decision==="rejected"?await reason():null;if(decision==="rejected"&&!r)return;await act(()=>reviewDraftItem(id,seq,decision,r??undefined))};
 const visibleItems=detail?.items.filter(item=>onlyItemSeq!==undefined?item.seq===onlyItemSeq:!compact||item.seq===activeSeq)??[];
 const activeItem=detail?.items.find(item=>item.seq===activeSeq);
 const remaining=detail?.items.filter(item=>item.status==="pending").length??0;
 const footer=<div className="cy-bot-review-footer">
  {ids.length>1&&index>=0?<span className="cy-bot-review-nav"><button type="button" className="cy-op-button compact" disabled={busy||index<=0} onClick={()=>setId(ids[index-1])}>‹ 上一篇</button>
   <span>{index+1}／{ids.length}</span><button type="button" className="cy-op-button compact" disabled={busy||index>=ids.length-1} onClick={()=>setId(ids[index+1])}>下一篇 ›</button></span>:null}
  <button type="button" className="cy-op-button" disabled={busy} onClick={onClose}>關閉</button>
  {pending&&compact&&detail?.items.length?<><OverflowMenu label="批次審核" disabled={busy} items={[{label:`剩餘 ${remaining} 則全部退回…`,danger:true,onClick:()=>void decideAll("rejected")},{label:`剩餘 ${remaining} 則全部通過`,onClick:()=>void decideAll("approved")}]} />
   <button type="button" className="cy-op-button danger" disabled={busy||activeItem?.status!=="pending"} onClick={()=>void decideItem(activeSeq,"rejected")}>退回…</button>
   <button type="button" className="cy-op-button primary" disabled={busy||activeItem?.status!=="pending"} onClick={()=>void decideItem(activeSeq,"approved")}>通過</button></>:pending?<><button type="button" className="cy-op-button danger" disabled={busy} onClick={()=>void decideAll("rejected")}>{detail?.items.length?`剩餘 ${remaining} 則全部退回…`:"退回…"}</button>
   <button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>void decideAll("approved")}>{detail?.items.length?`剩餘 ${remaining} 則全部通過`:"通過"}</button></>:null}
 </div>;
 return <Dialog open size="large" className="cy-bot-review-dialog" title={onlyItemSeq!==undefined?visibleItems[0]?.title??"發布內容":draft?.title??"審稿"} dismissible={false} showCloseButton={false} onClose={onClose} footer={footer}>
  {promptDialog}
  {!detail?error?<p className="cy-notice cy-notice-danger" role="alert">{error}<button type="button" className="cy-op-button compact" onClick={()=>void load(id)}>重試</button></p>:<Loading/>:<>
   <div className="cy-bot-review-meta">
    <StatusChip tone={TONE[detail.draft.status]}>{detail.draft.reason==="部分通過"?"部分通過":BOT_REVIEW_LABELS[detail.draft.status]}</StatusChip>
    <span>{detail.draft.revisionNumber===1?"初稿":detail.draft.revisionNumber+"修"}{detail.draft.supersededById?"・已有新版":""}</span>
    {detail.draft.sentAt?<StatusChip tone="info">已送出 {formatDateTime(detail.draft.sentAt)}</StatusChip>:null}
    <span>{detail.draft.botLabel}・{BOT_DRAFT_KIND_LABELS[detail.draft.kind]}・{formatDateTime(detail.draft.createdAt)} 送審</span>
    {onlyItemSeq===undefined&&detail.draft.itemCounts?<span>共 {detail.draft.itemCounts.total} 則：通過 {detail.draft.itemCounts.approved}・退回 {detail.draft.itemCounts.rejected}・待審 {detail.draft.itemCounts.pending}{detail.draft.itemCounts.external?`・外部已處理 ${detail.draft.itemCounts.external}`:""}</span>:null}
    {onlyItemSeq===undefined&&detail.draft.previousDraftId?<button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>setId(detail.draft.previousDraftId!)}>上一版</button>:null}
    {onlyItemSeq===undefined&&detail.draft.supersededById?<button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>setId(detail.draft.supersededById!)}>查看新版</button>:null}
   </div>
   {error?<p className="cy-notice cy-notice-danger" role="alert">{error}</p>:null}
   {detail.items.length?<div className={"cy-bot-review-layout"+(onlyItemSeq!==undefined?" cy-bot-single-item":"")}>
    {onlyItemSeq===undefined&&compact?<section className="cy-bot-mobile-note"><ExpandToggle expanded={showNote} label="送審說明" onToggle={()=>setShowNote(v=>!v)}/><span>送審說明</span>{showNote?<><RichText text={detail.draft.body}/><Images images={imagesOf(null)} onOpen={image=>setZoom(image.id)}/></>:null}</section>:null}
    {onlyItemSeq===undefined&&compact?<nav className="cy-bot-mobile-item-nav" aria-label="逐則切換"><button type="button" className="cy-op-button compact" disabled={busy||activeSeq<=1} onClick={()=>setActiveSeq(n=>n-1)}>上一則</button><span>第 {activeSeq}／{detail.items.length} 則</span><button type="button" className="cy-op-button compact" disabled={busy||activeSeq>=detail.items.length} onClick={()=>setActiveSeq(n=>n+1)}>下一則</button></nav>:null}
    {onlyItemSeq===undefined&&!compact?<nav className="cy-bot-review-toc" aria-label="目錄">{detail.items.map(item=><a key={item.id} href={"#bot-item-"+item.id} onClick={e=>{e.preventDefault();document.getElementById("bot-item-"+item.id)?.scrollIntoView({block:"start",behavior:"smooth"})}}>
     <StatusChip tone={TONE[item.status]}>{item.seq}</StatusChip><span>{item.title}</span></a>)}</nav>:null}
    <div className="cy-bot-review-main">
     {onlyItemSeq===undefined&&!compact?<section className="cy-bot-review-note"><RichText text={detail.draft.body}/><Images images={imagesOf(null)} onOpen={image=>setZoom(image.id)}/></section>:null}
     {visibleItems.map(item=><article key={item.id} id={"bot-item-"+item.id} className="cy-bot-review-item">
      <header><strong>{item.seq}　{item.title}</strong><StatusChip tone={TONE[item.status]}>{BOT_REVIEW_LABELS[item.status]}</StatusChip>{item.sentAt?<StatusChip tone="info">已送出 {formatDateTime(item.sentAt)}</StatusChip>:null}</header>
      <RichText text={item.body}/>
      <Images images={onlyItemSeq!==undefined&&detail.items.length===1?[...imagesOf(null),...imagesOf(item.id)]:imagesOf(item.id)} onOpen={image=>setZoom(image.id)}/>
      {item.reason?<p className="cy-bot-review-reason">退回理由：{item.reason}</p>:null}
      {pending&&!compact&&item.status==="pending"?<div className="cy-bot-review-item-actions">
       <button type="button" className="cy-op-button compact danger" disabled={busy} onClick={()=>void decideItem(item.seq,"rejected")}>退回…</button>
       <button type="button" className="cy-op-button compact primary" disabled={busy} onClick={()=>void decideItem(item.seq,"approved")}>通過</button></div>:null}
     </article>)}
    </div>
   </div>:<div className="cy-bot-review-main">
    <RichText text={detail.draft.body}/><Images images={imagesOf(null)} onOpen={image=>setZoom(image.id)}/>
    {detail.draft.status==="rejected"&&detail.draft.reason?<p className="cy-bot-review-reason">退回理由：{detail.draft.reason}</p>:null}
   </div>}
  </>}
  {zoom!==null?<Dialog open size="large" title="圖片" dismissible={false} showCloseButton={false} onClose={()=>setZoom(null)} footer={<button type="button" className="cy-op-button" onClick={()=>setZoom(null)}>關閉</button>}><img className="cy-bot-zoom" src={reviewImageUrl(zoom)} alt="審稿圖片"/></Dialog>:null}
 </Dialog>;
}
