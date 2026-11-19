import {useCallback,useEffect,useState} from "react";
import {BOT_REVIEW_LABELS,type BotDraftDetail} from "../../../shared/bot-center";
import {loadDraftDetail,reviewDraft,reviewImageUrl} from "../api/bot-center-client";
import {Dialog} from "../../ui/overlays/Dialog";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {Loading} from "../../ui/feedback/Loading";
import {formatDateTime} from "../../ui/foundation/format";
import {CheckField,Field,FormSection} from "../../ui/forms/Field";
import {BotImages} from "./BotImages";
import {BotText} from "./BotText";
import {decisionAmountText} from "./bot-decision";

/**
 * 拍板視窗（V0.22.0）：BOT 送來讓人決定的事項。標題、BOT、類別、金額、期限、內容、圖片、選項（單選）、
 * 備註（不同意必填）；按鈕為共用 Dialog 頁尾，沒有右上 X。逾期或已決定時只讀。
 */
export function BotDecisionDialog({id,canReview,onClose,onChanged}:{id:number;canReview:boolean;onClose:()=>void;onChanged:()=>void}){
 const [detail,setDetail]=useState<BotDraftDetail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [choice,setChoice]=useState<number|null>(null),[note,setNote]=useState(""),[zoom,setZoom]=useState<number|null>(null);
 const load=useCallback(async()=>{setBusy(true);setError(null);try{setDetail(await loadDraftDetail(id))}catch(e){setError(e instanceof Error?e.message:"無法載入拍板事項")}finally{setBusy(false)}},[id]);
 useEffect(()=>{setDetail(null);setChoice(null);setNote("");void load()},[load]);
 const draft=detail?.draft,decision=draft?.decision??null;
 const open=!!draft&&draft.status==="pending"&&!draft.supersededById&&!!decision&&!decision.expired&&canReview;
 const options=decision?.options??null;
 async function decide(verdict:"approved"|"rejected"){
  if(!decision)return;
  if(verdict==="rejected"&&!note.trim()){setError("不同意時請填寫備註");return}
  if(verdict==="approved"&&options?.length&&choice===null){setError("請先選擇一個選項");return}
  setBusy(true);setError(null);
  try{await reviewDraft(id,verdict,verdict==="rejected"?note.trim():undefined,verdict==="approved"&&options?.length?choice??undefined:undefined);await load();onChanged()}
  catch(e){setError(e instanceof Error?e.message:"決定失敗")}finally{setBusy(false)}
 }
 const footer=<div className="cy-bot-review-footer">
  <button type="button" className="cy-op-button" disabled={busy} onClick={onClose}>關閉</button>
  {open?<><button type="button" className="cy-op-button danger" disabled={busy} onClick={()=>void decide("rejected")}>不同意</button>
   <button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>void decide("approved")}>同意</button></>:null}
 </div>;
 return <Dialog open size="medium" className="cy-bot-decision-dialog" title={draft?.title??"拍板事項"} dismissible={false} showCloseButton={false} onClose={onClose} footer={footer}>
  {!detail||!draft||!decision?error?<p className="cy-notice cy-notice-danger" role="alert">{error}<button type="button" className="cy-op-button compact" onClick={()=>void load()}>重試</button></p>:<Loading/>:<>
   <div className="cy-bot-review-meta">
    <StatusChip tone={decision.expired&&draft.status==="pending"?"danger":draft.status==="approved"?"success":draft.status==="rejected"?"danger":"warning"}>
     {draft.status==="pending"?(decision.expired?"已逾期":"待決定"):draft.status==="approved"?"同意":draft.status==="rejected"?"不同意":BOT_REVIEW_LABELS[draft.status]}</StatusChip>
    <span>{draft.botLabel}</span>
    <span>類別：{decision.category}（BOT 填寫）</span>
    {decision.amount!==null?<span>{decisionAmountText(decision.amount)}</span>:null}
    <span className={decision.deadline&&draft.status==="pending"?"cy-bot-deadline-text":undefined}>期限：{decision.deadline?formatDateTime(decision.deadline):"無期限"}</span>
    <span>{formatDateTime(draft.createdAt)} 送審</span>
   </div>
   {error?<p className="cy-notice cy-notice-danger" role="alert">{error}</p>:null}
   <BotText text={draft.body}/>
   <BotImages images={detail.images} onOpen={image=>setZoom(image.id)}/>
   <FormSection>
    {options?.length?<div className="cy-f cy-f-l" role="radiogroup" aria-label="BOT 提供的選項">
     <span className="cy-f-label">BOT 提供的選項{open?<span className="cy-field-required" aria-hidden="true">＊</span>:null}</span>
     {options.map((label,index)=><CheckField key={index} type="radio" size="l" name={"bot-decision-"+id} label={label}
      checked={(open?choice:decision.chosenOption)===index} disabled={!open||busy} onChange={()=>setChoice(index)}/>)}
    </div>:null}
    {open?<Field label="備註（不同意時必填）" size="l"><textarea className="cy-op-input" rows={3} value={note} onChange={event=>setNote(event.target.value)}/></Field>
     :draft.reason?<p className="cy-bot-review-reason">備註：{draft.reason}</p>:null}
   </FormSection>
   {draft.reviewedAt?<p className="cy-bot-review-reviewed">{draft.reviewer?.displayName||draft.reviewer?.employeeNo||"使用者"} 於 {formatDateTime(draft.reviewedAt)} {draft.status==="approved"?"同意":"不同意"}</p>:null}
  </>}
  {zoom!==null?<Dialog open size="large" title="圖片" dismissible={false} showCloseButton={false} onClose={()=>setZoom(null)} footer={<button type="button" className="cy-op-button" onClick={()=>setZoom(null)}>關閉</button>}><img className="cy-bot-zoom" src={reviewImageUrl(zoom)} alt="拍板圖片"/></Dialog>:null}
 </Dialog>;
}
