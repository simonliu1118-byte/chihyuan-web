import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {ApiClientError} from "../../api/client";
import {BOT_LIMITS,BOT_REVIEW_LABELS,BOT_STATUS_LABELS,taipeiTodayRange,type BotCenterState,type BotReviewStatus,type BotStatus} from "../../../shared/bot-center";
import {createBot,issueBotCredential,loadBotCenter,loadBotProgress,reviewDraft,revokeBotCredential} from "../api/bot-center-client";
import {ExpandToggle} from "../../ui/data/ExpandToggle";
import {StatusFilter} from "../../ui/data/StatusFilter";
import {FeedbackBanner,useFeedbackMessage} from "../../ui/feedback/FeedbackProvider";
import {Loading} from "../../ui/feedback/Loading";
import {enterAdvancesFields} from "../../ui/foundation/enter-advance";
import {formatDateTime} from "../../ui/foundation/format";
import {Field,FormSection} from "../../ui/forms/Field";
import {Dialog} from "../../ui/overlays/Dialog";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {useFormPrompt} from "../../ui/overlays/useFormPrompt";
import {StatusChip} from "../../ui/primitives/StatusChip";
import "./bot-center.css";

const STATUS_TONE:Record<BotStatus,"neutral"|"info"|"warning"|"success">={idle:"neutral",working:"info",blocked:"warning",done:"success"};
const REVIEW_TONE:Record<BotReviewStatus,"warning"|"success"|"danger">={pending:"warning",approved:"success",rejected:"danger"};
const messageOf=(error:unknown)=>error instanceof ApiClientError?error.message||error.code:"BOT 管理中心暫時無法使用";
const weekday=new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",weekday:"long"});

export function BotCenterPage(){
 const [state,setState]=useState<BotCenterState|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [settingsOpen,setSettingsOpen]=useState(false),[reportsOpen,setReportsOpen]=useState(false);
 const [openReport,setOpenReport]=useState<number|null>(null);
 const [openCompletion,setOpenCompletion]=useState<number|null>(null),[openSummary,setOpenSummary]=useState<number|null>(null);
 const [code,setCode]=useState(""),[label,setLabel]=useState(""),[token,setToken]=useState<string|null>(null);
 const [updatedAt,setUpdatedAt]=useState<string|null>(null);
 const [message,setMessage,reportError,tone]=useFeedbackMessage<string|null>(null);
 const {confirm,confirmationDialog}=useConfirmation(),{ask,promptDialog}=useFormPrompt();
 const sequence=useRef(0),actionBusy=useRef(false),reviewSection=useRef<HTMLElement>(null);
 const draftStatus=state?.draftStatus??"pending",botCode=state?.botCode??null;

 const refresh=useCallback(async(status:BotReviewStatus|"all",selected:string|null)=>{
  const serial=++sequence.current;
  const next=await loadBotCenter(status,{botCode:selected??undefined});
  if(serial!==sequence.current)return;
  setState(next);setUpdatedAt(new Date().toISOString());setOpenReport(null);setOpenCompletion(null);
 },[]);
 useEffect(()=>{let active=true;void refresh("pending",null).catch(e=>{if(active)reportError(messageOf(e))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;sequence.current++};},[refresh,reportError]);
 // Keep lightweight polling: statistics and historical pages are not reloaded every 30 seconds.
 useEffect(()=>{let active=true,poll=0;
  const timer = window.setInterval(()=>{
   if(document.visibilityState!=="visible"||actionBusy.current)return;
   if(state&&state.timelineDate!==taipeiTodayRange().day){
    actionBusy.current=true;setBusy(true);
    void refresh(draftStatus,botCode).catch(()=>{}).finally(()=>{actionBusy.current=false;setBusy(false)});return;
   }
   const serial=sequence.current,request=++poll;
   void loadBotProgress().then(next=>{if(active&&serial===sequence.current&&request===poll)setState(previous=>previous?{...previous,...next}:previous)}).catch(()=>{});
  },30_000);
  return()=>{active=false;window.clearInterval(timer)};
 },[state?.timelineDate,draftStatus,botCode,refresh]);

 async function run(action:()=>Promise<void>){
  if(actionBusy.current)return;actionBusy.current=true;setBusy(true);
  try{await action()}catch(e){reportError(messageOf(e))}finally{actionBusy.current=false;setBusy(false)}
 }
 async function filter(selected:string|null,status:BotReviewStatus|"all"=draftStatus){
  await run(()=>refresh(status,selected));
 }
 async function showReports(selected:string|null){await run(async()=>{await refresh(draftStatus,selected);setReportsOpen(true)})}
 async function showPending(selected:string){await run(async()=>{await refresh("pending",selected);reviewSection.current?.scrollIntoView({behavior:"smooth",block:"start"})})}
 async function loadMore(section:"drafts"|"reports"|"timeline"){
  if(!state)return;
  const current=state,before=section==="drafts"?current.draftNextBefore:section==="reports"?current.reportNextBefore:current.timelineNextBefore;
  if(before==null)return;
  await run(async()=>{
   const page=await loadBotCenter(current.draftStatus,{botCode:current.botCode??undefined,
    ...(section==="drafts"?{draftBefore:Number(before)}:section==="reports"?{reportBefore:Number(before)}:{timelineBefore:String(before)})});
   setState(previous=>{
    if(!previous||previous.draftStatus!==current.draftStatus||previous.botCode!==current.botCode)return previous;
    if(page.timelineDate!==previous.timelineDate)return page;
    if(section==="drafts")return {...previous,drafts:[...previous.drafts,...page.drafts.filter(row=>!previous.drafts.some(old=>old.id===row.id))],draftsMore:page.draftsMore,draftNextBefore:page.draftNextBefore};
    if(section==="reports")return {...previous,reports:[...previous.reports,...page.reports.filter(row=>!previous.reports.some(old=>old.id===row.id))],reportsMore:page.reportsMore,reportNextBefore:page.reportNextBefore};
    return {...previous,timeline:[...previous.timeline,...page.timeline.filter(row=>!previous.timeline.some(old=>old.id===row.id))],timelineMore:page.timelineMore,timelineNextBefore:page.timelineNextBefore};
   });
  });
 }
 async function decide(id:number,decision:"approved"|"rejected"){
  const values=await ask({title:decision==="approved"?"通過審稿":"退回審稿",fields:[{name:"reason",label:"理由",multiline:true}],confirmLabel:decision==="approved"?"通過":"退回",confirmTone:decision==="rejected"?"danger":"primary"});
  if(!values)return;
  await run(async()=>{await reviewDraft(id,decision,values.reason);await refresh(draftStatus,botCode);setMessage(decision==="approved"?"已通過，結果已供原 BOT 讀取":"已退回，結果已供原 BOT 讀取")});
 }
 async function addBot(event:FormEvent){event.preventDefault();await run(async()=>{await createBot(code,label);setCode("");setLabel("");await refresh(draftStatus,botCode);setMessage("已新增 BOT")})}
 async function issue(){
  if(!await confirm({title:state?.credential.configured?"輪換連線憑證":"產生連線憑證",description:state?.credential.configured?"舊憑證會立即失效。":"憑證只在產生時顯示一次。",confirmLabel:state?.credential.configured?"輪換":"產生",confirmTone:state?.credential.configured?"danger":"primary"}))return;
  await run(async()=>{const issued=await issueBotCredential();setToken(issued.token);await refresh(draftStatus,botCode)});
 }
 async function revoke(){
  if(!await confirm({title:"撤銷連線憑證",description:"撤銷後，BOT 將無法送出回報或讀取審稿結果。",confirmLabel:"撤銷",confirmTone:"danger"}))return;
  await run(async()=>{await revokeBotCredential();await refresh(draftStatus,botCode);setMessage("已撤銷連線憑證")});
 }
 if(loading&&!state)return <Loading/>;
 if(!state)return <section className="cy-op-panel"><h2>BOT 管理中心</h2><p>{message??"目前無法載入。"}</p></section>;
 const visibleBots=state.bots.filter(bot=>!botCode||bot.code===botCode);
 const pending=Object.values(state.botStats).reduce((sum,stats)=>sum+stats.draftCounts.pending,0);
 const scope=botCode?state.bots.find(bot=>bot.code===botCode)?.label:"全部 BOT";
 return <div className="cy-bot-center">
  <FeedbackBanner message={message} tone={tone}/>{confirmationDialog}{promptDialog}
  <section className="cy-op-panel cy-bot-overview" aria-label="今日工作總覽">
   <div className="cy-bot-heading"><div><h2>BOT 管理中心 <span>今日工作總覽</span></h2>
    <p className="cy-bot-date">{state.timelineDate.replaceAll("-","/")}（{weekday.format(new Date(state.timelineDate+"T12:00:00+08:00"))}）</p></div>
    <div className="cy-bot-actions"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void run(()=>refresh(draftStatus,botCode))}>重新整理</button>
     <button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void showReports(botCode)}>查看回報</button>
     <button type="button" className="cy-op-button compact" onClick={()=>setSettingsOpen(true)}>設定</button></div></div>
   <div className="cy-bot-totals"><StatusChip tone="info">進行中 {state.bots.filter(bot=>bot.status==="working").length}</StatusChip>
    <StatusChip tone="warning">受阻 {state.bots.filter(bot=>bot.status==="blocked").length}</StatusChip>
    <StatusChip tone="neutral">待命 {state.bots.filter(bot=>bot.status==="idle").length}</StatusChip>
    <button type="button" className="cy-bot-pending-link" disabled={busy} onClick={()=>void run(async()=>{await refresh("pending",null);reviewSection.current?.scrollIntoView({behavior:"smooth",block:"start"})})}>待審 {pending} 件</button>
    <span className="cy-bot-updated">統計更新 {formatDateTime(updatedAt)}</span></div>
   <StatusFilter label="選擇 BOT" value={botCode??""} counts={null} options={state.bots.map(bot=>({code:bot.code,label:bot.label,tone:STATUS_TONE[bot.status]}))} onChange={value=>{if(!busy)void filter(value||null)}}/>
  </section>
   <section ref={reviewSection} className="cy-op-panel cy-bot-review" aria-label="審稿清單">
    <div className="cy-op-panel-header"><h2>{draftStatus==="pending"?"待我審核":"審稿紀錄"}</h2><span className="cy-bot-scope">{scope}</span></div>
    <StatusFilter label="審稿狀態" value={draftStatus==="all"?"":draftStatus} counts={state.draftCounts} options={(["pending","approved","rejected"] as const).map(status=>({code:status,label:BOT_REVIEW_LABELS[status],tone:REVIEW_TONE[status]}))} onChange={status=>{if(!busy)void filter(botCode,(status||"all") as BotReviewStatus|"all")}}/>
    <div className="cy-op-table-wrap"><table className="cy-op-table cy-bot-review-table" aria-label="審稿清單">
     <colgroup><col style={{width:"10em"}}/><col style={{width:"7em"}}/><col style={{width:"21%"}}/><col/><col style={{width:"5em"}}/>{draftStatus!=="pending"?<col style={{width:"14em"}}/>:null}<col style={{width:"9em"}}/></colgroup>
     <thead><tr><th>送審時間</th><th>BOT</th><th>事項</th><th>內容</th><th className="is-center">狀態</th>{draftStatus!=="pending"?<th>審核資訊</th>:null}<th className="is-center">操作</th></tr></thead>
     <tbody>{state.drafts.length?state.drafts.map(draft=>{
      const reviewInfo=[draft.reason?"理由："+draft.reason:"",draft.reviewer?(draft.reviewer.displayName||draft.reviewer.employeeNo||"使用者")+" "+formatDateTime(draft.reviewedAt):""].filter(Boolean).join("；");
      return <tr key={draft.id}><td><time dateTime={draft.createdAt}>{formatDateTime(draft.createdAt)}</time></td><td title={draft.botLabel}>{draft.botLabel}</td>
       <td title={draft.title}>{draft.title}</td><td title={draft.body}>{draft.body}</td><td className="is-center"><StatusChip tone={REVIEW_TONE[draft.status]}>{BOT_REVIEW_LABELS[draft.status]}</StatusChip></td>
       {draftStatus!=="pending"?<td title={reviewInfo}>{reviewInfo}</td>:null}<td>{draft.status==="pending"?<div className="cy-bot-actions"><button type="button" className="cy-op-button compact primary" disabled={busy} onClick={()=>void decide(draft.id,"approved")}>通過</button><button type="button" className="cy-op-button compact danger" disabled={busy} onClick={()=>void decide(draft.id,"rejected")}>退回</button></div>:null}</td>
      </tr>;
     }):<tr><td colSpan={draftStatus==="pending"?6:7}>尚無{draftStatus==="pending"?"待審稿件":"審稿紀錄"}</td></tr>}</tbody>
    </table></div>
    {state.draftsMore?<div className="cy-bot-more"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void loadMore("drafts")}>載入更多審稿</button></div>:null}
   </section>
  <section className="cy-bot-cards" aria-label="BOT 工作卡片">
   {visibleBots.map(bot=>{const stats=state.botStats[bot.code],expanded=openSummary===bot.id;return <article key={bot.id} className="cy-op-panel cy-bot-card" aria-label={bot.label+"工作狀態"}>
    <div className="cy-bot-card-heading"><h3>{bot.label}</h3><StatusChip tone={STATUS_TONE[bot.status]}>{BOT_STATUS_LABELS[bot.status]}</StatusChip></div>
    <p className={"cy-bot-summary"+(expanded?" is-expanded":"")}>{bot.summary||"尚無工作摘要"}</p>
    {bot.summary?<button type="button" className="cy-bot-text-button" aria-expanded={expanded} onClick={()=>setOpenSummary(expanded?null:bot.id)}>{expanded?"收合摘要":"完整摘要"}</button>:null}
    <div className="cy-bot-card-bottom"><div className="cy-bot-metrics">{stats?<><span><strong>{stats.todayCompleted}</strong> 今日完成</span><span><strong>{stats.draftCounts.pending}</strong> 待審</span></>:<span>統計待更新</span>}</div>
     <span className="cy-bot-last-report">狀態更新 {formatDateTime(bot.updatedAt)}</span></div>
    <div className="cy-bot-card-footer"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void showReports(bot.code)}>查看回報</button>
     <button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void showPending(bot.code)}>查看待審</button></div>
   </article>})}
  </section>
   <section className="cy-op-panel" aria-label="今日完成時間軸">
    <div className="cy-op-panel-header"><h2>今日完成時間軸</h2><span className="cy-bot-scope">{scope}</span></div>
    {state.timeline.length?<ol className="cy-bot-timeline">{state.timeline.map(item=><li key={item.id}><div className="cy-bot-timeline-heading">
     <time dateTime={item.completedAt}>{formatDateTime(item.completedAt).slice(11)}</time><span>{item.botLabel}</span></div>
     <div className="cy-bot-timeline-title">{item.detail?<ExpandToggle expanded={openCompletion===item.id} label={item.title} onToggle={()=>setOpenCompletion(openCompletion===item.id?null:item.id)}/>:null}<strong>{item.title}</strong></div>
     {openCompletion===item.id?<p className="cy-bot-text">{item.detail}</p>:null}</li>)}</ol>:<p className="cy-bot-empty">今天還沒有完成項目</p>}
    {state.timelineMore?<div className="cy-bot-more"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void loadMore("timeline")}>載入更多今日完成項目</button></div>:null}
   </section>
  {reportsOpen?<Dialog open title={scope+"回報"} size="large" dismissible={false} showCloseButton={false} onClose={()=>setReportsOpen(false)} footer={<button type="button" className="cy-op-button" onClick={()=>setReportsOpen(false)}>關閉</button>}>
   <ul className="cy-bot-report-list">{state.reports.map(report=><li key={report.id}><div className="cy-bot-item-meta"><time dateTime={report.reportedAt}>{formatDateTime(report.reportedAt)}</time><span>{report.botLabel}</span></div>
    <div className="cy-bot-review-title"><ExpandToggle expanded={openReport===report.id} label={report.title} onToggle={()=>setOpenReport(openReport===report.id?null:report.id)}/><strong>{report.title}</strong></div>{openReport===report.id?<p className="cy-bot-text">{report.body}</p>:null}</li>)}</ul>
   {!state.reports.length?<p className="cy-bot-empty">尚無回報</p>:null}{state.reportsMore?<div className="cy-bot-more"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void loadMore("reports")}>載入更多回報</button></div>:null}
  </Dialog>:null}
  {settingsOpen?<Dialog open title="BOT 設定" size="medium" dismissible={false} showCloseButton={false} onClose={()=>setSettingsOpen(false)} footer={<button type="button" className="cy-op-button" disabled={busy} onClick={()=>setSettingsOpen(false)}>關閉</button>}>
   <div className="cy-bot-settings"><section><h3>連線憑證</h3><StatusChip tone={state.credential.configured?"success":"neutral"}>{state.credential.configured?"連線憑證已設定":"尚未設定連線憑證"}</StatusChip>
    {state.canManageCredentials?<div className="cy-bot-actions"><button type="button" className="cy-op-button compact" disabled={busy} onClick={()=>void issue()}>{state.credential.configured?"輪換憑證":"產生憑證"}</button>{state.credential.configured?<button type="button" className="cy-op-button compact danger" disabled={busy} onClick={()=>void revoke()}>撤銷憑證</button>:null}</div>:null}</section>
    <form onKeyDown={enterAdvancesFields} onSubmit={event=>void addBot(event)}><h3>新增 BOT</h3><FormSection>
     <Field label="代碼" size="s" required><input className="cy-op-input" required maxLength={BOT_LIMITS.code} value={code} onChange={event=>setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"").slice(0,BOT_LIMITS.code))}/></Field>
     <Field label="名稱" size="m" required><input className="cy-op-input" required maxLength={BOT_LIMITS.label} value={label} onChange={event=>setLabel(event.target.value)}/></Field>
    </FormSection><div className="cy-op-form-footer"><button type="submit" className="cy-op-button primary" disabled={busy}>新增</button></div></form></div>
  </Dialog>:null}
  {token?<Dialog open size="small" title="連線憑證（只顯示這一次）" dismissible={false} showCloseButton={false} onClose={()=>setToken(null)} footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" onClick={()=>void navigator.clipboard?.writeText(token)}>複製</button><button type="button" className="cy-op-button primary" onClick={()=>setToken(null)}>關閉</button></div>}>
   <FormSection><Field label="憑證" size="l"><input className="cy-op-input" readOnly value={token}/></Field></FormSection>
  </Dialog>:null}
 </div>;
}
