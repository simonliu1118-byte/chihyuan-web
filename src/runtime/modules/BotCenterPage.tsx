import {useCallback,useEffect,useRef,useState} from "react";
import {ApiClientError} from "../../api/client";
import {BOT_REVIEW_LABELS,BOT_STATUS_LABELS,taipeiTodayRange,type BotCenterState,type BotCompletionView,type BotReviewStatus,type BotStatus} from "../../../shared/bot-center";
import {issueBotCredential,loadBotCenter,loadBotProgress,revokeBotCredential,saveBotPush,retryBotPush,loadPublishedPosts} from "../api/bot-center-client";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import {useCompactLayout} from "../../ui/foundation/useCompactLayout";
import {OverflowMenu} from "../../ui/mobile/OverflowMenu";
import {StatusFilter} from "../../ui/data/StatusFilter";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {Loading} from "../../ui/feedback/Loading";
import {formatDateTime} from "../../ui/foundation/format";
import {Field,FormSection} from "../../ui/forms/Field";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {BotPushSettingsDialog} from "./BotPushSettingsDialog";
import {BotReviewDialog} from "./BotReviewDialog";
import {BotText} from "./BotText";
import {BotSentPatrolDialog} from "./BotSentPatrolDialog";
import {BOT_DRAFT_KIND_LABELS} from "../../../shared/bot-center";
import "./bot-center.css";

const STATUS_TONE:Record<BotStatus,"neutral"|"info"|"warning"|"success">={idle:"neutral",working:"info",blocked:"warning",done:"success"};
const REVIEW_TONE:Record<BotReviewStatus,"warning"|"success"|"danger">={pending:"warning",approved:"success",rejected:"danger"};
const messageOf=(error:unknown)=>error instanceof ApiClientError?error.message||error.code:"BOT 管理中心暫時無法使用";
const PUSH_LABELS={queued:'待送出',sending:'傳送中',accepted:'已送出',failed:'失敗'};
const firstLine=(text:string)=>{const line=text.split("\n").find(row=>row.trim())??"";return line.length>80?line.slice(0,80)+"…":line};
/** Keep an event on one line, exposing the shared toggle only when its text overflows. */
function TimelineEvent({item}:{item:BotCompletionView}){
 const [expanded,setExpanded]=useState(false),[overflows,setOverflows]=useState(false);
 const previewRef=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  const preview=previewRef.current;
  if(!preview)return;
  const measure=()=>{if(!expanded)setOverflows(preview.scrollWidth>preview.clientWidth+1)};
  measure();
  const observer=new ResizeObserver(measure);
  observer.observe(preview);
  return ()=>observer.disconnect();
 },[expanded,item.title,item.detail]);
 return <li className="cy-bot-timeline-event"><div className="cy-bot-timeline-event-row">
  <span className="cy-bot-timeline-bot">{item.botLabel}</span>
  <span ref={previewRef} className={"cy-bot-timeline-preview"+(expanded?" is-expanded":"")}>
   <strong>{item.title}</strong>{item.detail?<span className="cy-bot-timeline-detail"> {item.detail}</span>:null}
  </span>
  {overflows?<ExpandToggle variant="text" expanded={expanded} label={item.title} className="cy-bot-timeline-toggle" onToggle={()=>setExpanded(!expanded)}/>:null}
 </div></li>;
}

/** Group consecutive completion events by local minute so each minute has one timeline marker. */
function TimelineList({items}:{items:BotCompletionView[]}){
 const groups:{minute:string;clock:string;items:BotCompletionView[]}[]=[];
 for(const item of items){
  const dateTime=formatDateTime(item.completedAt),minute=dateTime.slice(0,16);
  const last=groups.at(-1);
  if(last?.minute===minute)last.items.push(item);
  else groups.push({minute,clock:dateTime.slice(11),items:[item]});
 }
 return <ol className="cy-bot-timeline">{groups.map(group=><li key={group.minute} className="cy-bot-timeline-group">
  <time dateTime={group.items[0].completedAt}>{group.clock}</time>
  <ul className="cy-bot-timeline-events">{group.items.map(item=><TimelineEvent key={item.id} item={item}/>)}</ul>
 </li>)}</ol>;
}

export function BotCenterPage(){
 const compact=useCompactLayout();
 const [state,setState]=useState<BotCenterState|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [settingsOpen,setSettingsOpen]=useState(false),[reportsOpen,setReportsOpen]=useState(false);
 const [timelineOpen,setTimelineOpen]=useState(false);
 const [patrolOpen,setPatrolOpen]=useState(false);
 const [openReport,setOpenReport]=useState<number|null>(null);
 const [token,setToken]=useState<string|null>(null);
 const [tokenOwner,setTokenOwner]=useState("");
 const [pushCode,setPushCode]=useState<string|null>(null);
 const [message,setMessage,reportError,tone]=useFeedbackMessage<string|null>(null);
 const {confirm,confirmationDialog}=useConfirmation();
 const sequence=useRef(0),actionBusy=useRef(false);
 const [reviewing,setReviewing]=useState<{ids:number[];id:number;itemSeq?:number;readOnly?:boolean}|null>(null);
 const draftStatus=state?.draftStatus??"pending";

 const refresh=useCallback(async(status:BotReviewStatus|"all")=>{
  const serial=++sequence.current;
  const next=await loadBotCenter(status);
  if(serial!==sequence.current)return;
  setState(next);setOpenReport(null);
 },[]);
 useEffect(()=>{let active=true;void refresh("pending").catch(e=>{if(active)reportError(messageOf(e))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;sequence.current++};},[refresh,reportError]);
 // Keep lightweight polling: statistics and historical pages are not reloaded every 30 seconds.
 useEffect(()=>{let active=true,poll=0;
  const timer = window.setInterval(()=>{
   if(document.visibilityState!=="visible"||actionBusy.current)return;
   if(state&&state.timelineDate!==taipeiTodayRange().day){
    actionBusy.current=true;setBusy(true);
    void refresh(draftStatus).catch(()=>{}).finally(()=>{actionBusy.current=false;setBusy(false)});return;
   }
   const serial=sequence.current,request=++poll;
   void loadBotProgress().then(next=>{if(active&&serial===sequence.current&&request===poll)setState(previous=>previous?{...previous,...next}:previous)}).catch(()=>{});
  },30_000);
  return()=>{active=false;window.clearInterval(timer)};
 },[state?.timelineDate,draftStatus,refresh]);

 async function run(action:()=>Promise<void>){
  if(actionBusy.current)return;actionBusy.current=true;setBusy(true);
  try{await action()}catch(e){reportError(messageOf(e))}finally{actionBusy.current=false;setBusy(false)}
 }
 async function filter(status:BotReviewStatus|"all"){await run(()=>refresh(status))}
 async function showReports(){await run(async()=>{await refresh(draftStatus);setReportsOpen(true)})}

 async function loadMore(section:"drafts"|"reports"|"timeline"){
  if(!state)return;
  const current=state,before=section==="drafts"?current.draftNextBefore:section==="reports"?current.reportNextBefore:current.timelineNextBefore;
  if(before==null)return;
  await run(async()=>{
   const page=await loadBotCenter(current.draftStatus,{
    ...(section==="drafts"?{draftBefore:Number(before)}:section==="reports"?{reportBefore:Number(before)}:{timelineBefore:String(before)})});
   setState(previous=>{
    if(!previous||previous.draftStatus!==current.draftStatus)return previous;
    if(page.timelineDate!==previous.timelineDate)return page;
    if(section==="drafts")return {...previous,drafts:[...previous.drafts,...page.drafts.filter(row=>!previous.drafts.some(old=>old.id===row.id))],draftsMore:page.draftsMore,draftNextBefore:page.draftNextBefore};
    if(section==="reports")return {...previous,reports:[...previous.reports,...page.reports.filter(row=>!previous.reports.some(old=>old.id===row.id))],reportsMore:page.reportsMore,reportNextBefore:page.reportNextBefore};
    return {...previous,timeline:[...previous.timeline,...page.timeline.filter(row=>!previous.timeline.some(old=>old.id===row.id))],timelineMore:page.timelineMore,timelineNextBefore:page.timelineNextBefore};
   });
  });
 }
 async function retryPush(id:number){await run(async()=>{await retryBotPush(id);await refresh(draftStatus);setMessage('已排入推播重送')})}
 async function togglePush(code:string){
  const setting=state?.pushSettings.find(item=>item.botCode===code);
  if(!setting?.configured||!state?.pushReady||!state.canManageCredentials)return;
  const name=state.bots.find(bot=>bot.code===code)?.label??code;
  if(setting.enabled&&!await confirm({title:"停用"+name+"推播",description:"停用後不發送新通知；已有的待送通知暫停，重新啟用後可繼續。Webhook 設定和 BOT 憑證都會保留。",confirmLabel:"停用推播",confirmTone:"danger"}))return;
  await run(async()=>{await saveBotPush(code,{enabled:!setting.enabled});await refresh(draftStatus);setMessage(name+(setting.enabled?"推播已停用":"推播已啟用"))});
 }
 async function issue(code:string){
  const current=state?.credentials.find(item=>item.botCode===code),configured=!!current?.configured,name=current?.botLabel??code;
  if(!await confirm({title:(configured?"輪換":"產生")+name+"連線憑證",description:configured?"此 BOT 的舊憑證會立即失效。":"憑證只顯示一次。",confirmLabel:configured?"輪換":"產生",confirmTone:configured?"danger":"primary"}))return;
  await run(async()=>{const issued=await issueBotCredential(code);setTokenOwner(name);setToken(issued.token);await refresh(draftStatus)});
 }
 async function revoke(code:string){
  const name=state?.bots.find(bot=>bot.code===code)?.label??code;
  if(!await confirm({title:"撤銷"+name+"連線憑證",description:"此 BOT 將無法回報或讀取審核結果。",confirmLabel:"撤銷",confirmTone:"danger"}))return;
  await run(async()=>{await revokeBotCredential(code);await refresh(draftStatus);setMessage("已撤銷"+name+"連線憑證")});
 }

 async function morePublished(){
  if(!state?.workSummary.articles.published.nextBefore)return;
  const current=state.workSummary.articles.published;
  await run(async()=>{
   let page=await loadPublishedPosts(current.nextBefore!,state.botCode??undefined);
   if(page.day!==current.day)page=await loadPublishedPosts(undefined,state.botCode??undefined);
   const incoming=page;
   setState(previous=>previous?{...previous,workSummary:{...previous.workSummary,articles:{...previous.workSummary.articles,published:{...incoming,items:incoming.day===current.day?[...current.items,...incoming.items.filter(item=>!current.items.some(old=>old.id===item.id))]:incoming.items}}}}:previous);
  });
 }
 if(loading&&!state)return <Loading/>;
 if(!state)return <section className="cy-op-panel"><h2>BOT 管理中心</h2><p>{message??"目前無法載入。"}</p></section>;
 return <div className="cy-bot-center">
  <FeedbackBanner message={message} tone={tone}/>{confirmationDialog}
  {patrolOpen?<BotSentPatrolDialog botCode={state.botCode??undefined} onClose={()=>setPatrolOpen(false)}/>:null}
  {reviewing?<BotReviewDialog ids={reviewing.ids} initialId={reviewing.id} onlyItemSeq={reviewing.itemSeq} canReview={!reviewing.readOnly} onClose={()=>setReviewing(null)} onChanged={()=>void refresh(draftStatus).catch(()=>{})}/>:null}
  <section className="cy-op-panel cy-bot-overview" aria-label="今日工作總覽">
   <div className="cy-bot-overview-toolbar">
    <div className="cy-bot-status-strip" aria-label="BOT 狀態總覽（只供顯示）">
     <StatusChip tone="info">進行中 {state.bots.filter(bot=>bot.status==="working").length}</StatusChip>
     <StatusChip tone="warning">受阻 {state.bots.filter(bot=>bot.status==="blocked").length}</StatusChip>
     <StatusChip tone="neutral">待命 {state.bots.filter(bot=>bot.status==="idle").length}</StatusChip>
     <span className="cy-bot-status-separator" aria-hidden="true"/>
     {state.bots.map(bot=><StatusChip key={bot.code} tone={STATUS_TONE[bot.status]}>{bot.label} · {BOT_STATUS_LABELS[bot.status]}</StatusChip>)}
    </div>
    {compact?<OverflowMenu items={[
      {label:"重新整理",disabled:busy,onClick:()=>void run(()=>refresh(draftStatus))},
      {label:"查看回報",disabled:busy,onClick:()=>void showReports()},
      {label:"設定",onClick:()=>setSettingsOpen(true)}
     ]}/>:    <div className="cy-bot-actions">
     <button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void run(()=>refresh(draftStatus))}>重新整理</button>
     <button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void showReports()}>查看回報</button>
     <button type="button" className="cy-op-button compact" onClick={()=>setSettingsOpen(true)}>設定</button>
    </div>}
   </div>
   <div className="cy-op-panel-header cy-bot-timeline-heading"><h2>今日完成時間軸（最新 5 筆）</h2>
    <button type="button" className="cy-op-button mini soft cy-header-action" onClick={()=>setTimelineOpen(true)}>查看全部 ›</button></div>
   {state.timeline.length?<TimelineList items={state.timeline.slice(0,5)}/>:<p className="cy-bot-empty">今天還沒有完成項目</p>}
  </section>
   <section className="cy-op-panel cy-bot-review" aria-label="審稿清單">
    <div className="cy-op-panel-header"><h2>{draftStatus==="pending"?"待審核":"審稿紀錄"}</h2></div>
    <StatusFilter label="審稿狀態" value={draftStatus==="all"?"":draftStatus} counts={state.draftCounts} options={(["pending","approved","rejected"] as const).map(status=>({code:status,label:BOT_REVIEW_LABELS[status],tone:REVIEW_TONE[status]}))} onChange={status=>{if(!busy)void filter((status||"all") as BotReviewStatus|"all")}}/>
    <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt cy-mobile-wrap-table cy-bot-review-table" aria-label="審稿清單">
     <colgroup><col style={{width:"4em"}}/><col style={{width:"10em"}}/><col style={{width:"7em"}}/><col style={{width:"21%"}}/><col/><col style={{width:"5em"}}/>{draftStatus!=="pending"?<><col style={{width:"14em"}}/><col style={{width:'5.5em'}}/></>:null}<col style={{width:"9em"}}/></colgroup>
     <thead><tr><th>版本</th><th>送審時間</th><th>BOT</th><th>事項</th><th>內容</th><th className="is-center">狀態</th>{draftStatus!=="pending"?<><th>審核資訊</th><th className="is-center">推播</th></>:null}<th className="is-center">操作</th></tr></thead>
     <tbody>{state.drafts.length?state.drafts.map(draft=>{
      const reviewInfo=[draft.reason?"理由："+draft.reason:"",draft.reviewer?(draft.reviewer.displayName||draft.reviewer.employeeNo||"使用者")+" "+formatDateTime(draft.reviewedAt):""].filter(Boolean).join("；");
      return <tr key={draft.id}><td data-label="版本">{draft.revisionNumber===1?"初稿":draft.revisionNumber+"修"}</td><td data-label="送審時間"><time dateTime={draft.createdAt}>{formatDateTime(draft.createdAt)}</time></td><td data-label="BOT" title={draft.botLabel}>{draft.botLabel}</td>
       <td data-label="事項" data-priority="title" title={draft.title}>{draft.title}</td><td data-label="內容" data-priority="wide"><span className="cy-bot-review-preview">{draft.itemCounts?<StatusChip tone="info">{BOT_DRAFT_KIND_LABELS[draft.kind]} {draft.itemCounts.total} 則</StatusChip>:null}{firstLine(draft.body)}</span></td><td data-label="狀態" className="is-center"><StatusChip tone={REVIEW_TONE[draft.status]}>{BOT_REVIEW_LABELS[draft.status]}</StatusChip></td>
       {draftStatus!=="pending"?<><td data-label="審核資訊" data-priority="wide" title={reviewInfo}>{reviewInfo}</td><td data-label="推播" className="is-center">{draft.pushStatus?<StatusChip tone={draft.pushStatus==='failed'?'danger':draft.pushStatus==='accepted'?'success':'warning'}>{PUSH_LABELS[draft.pushStatus]}</StatusChip>:null}</td></>:null}<td data-label="操作" data-priority="wide"><div className="cy-bot-actions"><button type="button" className={"cy-op-button compact"+(draft.status==="pending"?" primary":"")} disabled={busy} onClick={()=>setReviewing({ids:state.drafts.map(row=>row.id),id:draft.id})}>{draft.status==="pending"?"審閱":"查看"}</button>
       {draft.status!=="pending"&&draft.pushStatus==='failed'&&state.canManageCredentials?<button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void retryPush(draft.id)}>重送</button>:null}</div></td>
      </tr>;
     }):<tr><td colSpan={draftStatus==="pending"?7:9}>尚無{draftStatus==="pending"?"待審稿件":"審稿紀錄"}</td></tr>}</tbody>
    </table></div>
    {state.draftsMore?<div className="cy-bot-more"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void loadMore("drafts")}>載入更多審稿</button></div>:null}
   </section>
  <section className="cy-bot-work-cards" aria-label="工作摘要">
   <article className="cy-op-panel cy-bot-work-card"><h3>新文章通知</h3><div className="cy-bot-work-count"><strong>{state.workSummary.articles.count}</strong> 篇</div>
    <div className="cy-bot-reviewed">{state.workSummary.articles.published.items.map(item=><button key={item.id} type="button" className="cy-bot-reviewed-row" onClick={()=>setReviewing({ids:[item.draftId],id:item.draftId,itemSeq:item.seq,readOnly:true})}><span>{item.title}</span><small>已發布</small></button>)}
    {state.workSummary.articles.published.more?<button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void morePublished()}>載入更多發布紀錄</button>:null}</div></article>
   <article className="cy-op-panel cy-bot-work-card"><h3>Threads 巡視回報</h3>
    <div className="cy-bot-work-count">今日巡視 <strong><button type="button" className="cy-bot-count-button" aria-label={`查看今日送出的 ${state.workSummary.patrols.sentToday} 則海巡回覆`} onClick={()=>setPatrolOpen(true)}>{state.workSummary.patrols.sentToday}</button></strong> 則</div>
    <div className="cy-bot-patrol-reports">{state.workSummary.patrols.reports.map(report=><article key={report.id}><strong>{report.title}</strong>{report.detail?<BotText text={report.detail}/>:null}</article>)}</div></article>
   <article className="cy-op-panel cy-bot-work-card"><h3>拍板結案</h3><div className="cy-bot-work-count">—</div></article>
   <article className="cy-op-panel cy-bot-work-card"><h3>待核准</h3><div className="cy-bot-work-count"><strong className="cy-bot-pending-count">{state.workSummary.pending.count}</strong> 件</div>
    {state.workSummary.pending.posts||state.workSummary.pending.patrols?<p>貼文 {state.workSummary.pending.posts} 篇・海巡 {state.workSummary.pending.patrols} 則</p>:null}
    <p>{state.workSummary.pending.latest?.title??"尚無待審事項"}</p></article>
  </section>
        <section className="cy-bot-cards" aria-label="BOT 當日摘要">
   {state.bots.map(bot=><article key={bot.id} className="cy-op-panel cy-bot-card" aria-label={bot.label+"當日摘要"}>
    <div className="cy-bot-card-heading"><h3>{bot.label}</h3><StatusChip tone={STATUS_TONE[bot.status]}>{BOT_STATUS_LABELS[bot.status]}</StatusChip></div>
    <p className="cy-bot-summary">{bot.summary&&taipeiTodayRange(new Date(bot.updatedAt)).day===state.timelineDate?bot.summary:"今日尚無回報"}</p>
   </article>)}
  </section>
   {timelineOpen?<Dialog open title="今日完成時間軸－全部" size="large" dismissible={false} showCloseButton={false}
    onClose={()=>setTimelineOpen(false)} footer={<button type="button" className="cy-op-button" onClick={()=>setTimelineOpen(false)}>關閉</button>}>
    {state.timeline.length?<TimelineList items={state.timeline}/>:<p className="cy-bot-empty">今天還沒有完成項目</p>}
    {state.timelineMore?<div className="cy-bot-more"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void loadMore("timeline")}>載入更多今日完成項目</button></div>:null}
   </Dialog>:null}
{reportsOpen?<Dialog open title="BOT 回報紀錄" size="large" dismissible={false} showCloseButton={false} onClose={()=>setReportsOpen(false)} footer={<button type="button" className="cy-op-button" onClick={()=>setReportsOpen(false)}>關閉</button>}>
   <ul className="cy-bot-report-list">{state.reports.map(report=><li key={report.id}><div className="cy-bot-item-meta"><time dateTime={report.reportedAt}>{formatDateTime(report.reportedAt)}</time><span>{report.botLabel}</span></div>
    <div className="cy-bot-review-title"><ExpandToggle expanded={openReport===report.id} label={report.title} onToggle={()=>setOpenReport(openReport===report.id?null:report.id)}/><strong>{report.title}</strong></div>{openReport===report.id?<p className="cy-bot-text">{report.body}</p>:null}</li>)}</ul>
   {!state.reports.length?<p className="cy-bot-empty">尚無回報</p>:null}{state.reportsMore?<div className="cy-bot-more"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void loadMore("reports")}>載入更多回報</button></div>:null}
  </Dialog>:null}
     {settingsOpen?<Dialog open title="BOT 設定" size="large" className="cy-bot-settings-dialog" dismissible={false} showCloseButton={false} onClose={()=>setSettingsOpen(false)}
    footer={<button type="button" className="cy-op-button" disabled={busy} onClick={()=>setSettingsOpen(false)}>關閉</button>}>
    <div className="cy-bot-settings"><div className="cy-bot-settings-heading"><h3>連線憑證</h3></div><div className="cy-op-table-wrap"><table className="cy-op-table cy-rt cy-mobile-wrap-table cy-bot-credential-table">
     <thead><tr><th>BOT</th><th>連線狀態</th><th>產生時間</th><th className="is-center">推播</th><th className="is-center">操作</th></tr></thead>
     <tbody>{state.credentials.map(item=><tr key={item.botCode}><td data-label="BOT" data-priority="title">{item.botLabel}</td>
      <td data-label="連線狀態"><StatusChip tone={item.configured?"success":"neutral"}>{item.configured?"已設定":item.revokedAt?"已撤銷":"未設定"}</StatusChip></td>
      <td data-label="產生時間">{item.createdAt?formatDateTime(item.createdAt):""}</td>
      <td data-label="推播" className="is-center">{!state.pushReady?"服務未啟用":state.pushSettings.find(setting=>setting.botCode===item.botCode)?.enabled?"已啟用":state.pushSettings.find(setting=>setting.botCode===item.botCode)?.configured?"已停用":"未設定"}</td>
      <td data-label="操作" data-priority="wide">{state.canManageCredentials?<div className="cy-bot-actions cy-bot-settings-actions">
       <button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void issue(item.botCode)}>{item.configured?"輪換":"產生"}</button>
       {item.configured?<button type="button" className="cy-op-button compact danger" disabled={busy} onClick={()=>void revoke(item.botCode)}>撤銷</button>:null}
       <button type="button" className="cy-op-button compact" disabled={busy||!state.pushReady} onClick={()=>setPushCode(item.botCode)}>推播設定</button>
       <button type="button" className={"cy-op-button compact"+(state.pushSettings.find(setting=>setting.botCode===item.botCode)?.enabled?" danger":"")}
        disabled={busy||!state.pushReady||!state.pushSettings.find(setting=>setting.botCode===item.botCode)?.configured}
        title={!state.pushReady?"推播服務未啟用":!state.pushSettings.find(setting=>setting.botCode===item.botCode)?.configured?"請先完成推播設定":undefined}
        onClick={()=>void togglePush(item.botCode)}>{state.pushSettings.find(setting=>setting.botCode===item.botCode)?.enabled?"停用":"啟用"}</button>
      </div>:null}</td></tr>)}</tbody>
    </table></div></div>
   </Dialog>:null}
{pushCode?<BotPushSettingsDialog label={state.bots.find(bot=>bot.code===pushCode)?.label??pushCode} configured={state.pushSettings.find(item=>item.botCode===pushCode)?.configured??false} enabled={state.pushSettings.find(item=>item.botCode===pushCode)?.enabled??false}
   onClose={()=>setPushCode(null)} onSave={async value=>{await saveBotPush(pushCode,value);await refresh(draftStatus);setPushCode(null);setMessage('已儲存推播設定')}}/>:null}
  {token?<Dialog open size="small" title={tokenOwner+"連線憑證（只顯示這一次）"} dismissible={false} showCloseButton={false} onClose={()=>setToken(null)} footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" onClick={()=>void navigator.clipboard?.writeText(token)}>複製</button><button type="button" className="cy-op-button primary" onClick={()=>setToken(null)}>關閉</button></div>}>
   <FormSection><Field label="憑證" size="l"><input className="cy-op-input" readOnly value={token}/></Field></FormSection>
  </Dialog>:null}
 </div>;
}
