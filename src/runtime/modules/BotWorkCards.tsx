import type {ReactNode} from "react";
import {BOT_PATROL_STATUS_LABELS,type BotCenterState,type BotPatrolStatus} from "../../../shared/bot-center";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {clockText,deadlineText,deadlineUrgent,platformClass} from "./bot-decision";

const PATROL_TONE:Record<BotPatrolStatus,"warning"|"info"|"success"|"neutral">={pending:"warning",toSend:"info",waitingImages:"warning",open:"neutral",done:"success"};
const PATROL_ORDER:Record<BotPatrolStatus,number>={pending:0,toSend:1,waitingImages:2,open:3,done:4};
const MAX_ROWS=3;
type PatrolSession=BotCenterState["workSummary"]["patrols"]["sessions"][number];

export const patrolStatusTone=(status:BotPatrolStatus)=>PATROL_TONE[status];
/** 狀態標籤（則數只放右側文字，避免重複）。 */
export function patrolStatusLabel(session:PatrolSession):string{
 return BOT_PATROL_STATUS_LABELS[session.status];
}
/** 巡視場次右側文字（V0.30.0）。 */
export function patrolRightText(session:PatrolSession):string{
 switch(session.status){
  case "pending":return `${session.pendingItems} 則待審`;
  case "toSend":return `${session.awaitingItems} 則待留言`;
  case "waitingImages":return `${session.waitingImages} 則等圖`;
  case "open":return "進行中";
  default:return `送出 ${session.sent} 則`;
 }
}
/** 補送列的名稱：「11/20 早巡（補送）」；場次日期取自 YYYY-MM-DD。 */
export function patrolRowLabel(session:PatrolSession):string{
 const base=session.label||"其他";
 return session.late?`${Number(session.day.slice(5,7))}/${Number(session.day.slice(8,10))} ${base}（補送）`:base;
}
/** 今日場次依狀態排序（待審核→待留言→等待圖片→進行中→已完成，同狀態維持新到舊）最多 3 筆；補送列另外接在後面，不佔今日場次名額。 */
export function patrolRows(sessions:PatrolSession[]){
 const today=sessions.map((session,index)=>({session,index})).filter(row=>!row.session.late).sort((a,b)=>PATROL_ORDER[a.session.status]-PATROL_ORDER[b.session.status]||a.index-b.index).map(row=>row.session).slice(0,MAX_ROWS);
 return [...today,...sessions.filter(session=>session.late).slice(0,MAX_ROWS)];
}

/** 四張卡共用同一個結構：標題列（標題＋小連結）、數字列（大數字＋「單位・說明」）、最多三列淡底資料列（無分隔線）。 */
function WorkCard({title,link,onLink,count,unit,alert=false,empty,children,label}:{title:string;link:string;onLink:()=>void;count:number;unit:string;alert?:boolean;empty:string;children?:ReactNode;label:string}){
 return <article className="cy-op-panel cy-bot-work-card" aria-label={label}>
  <div className="cy-bot-work-head"><h3>{title}</h3><button type="button" className="cy-bot-work-link" onClick={onLink}>{link} ›</button></div>
  <div className="cy-bot-work-count"><strong className={alert?"cy-bot-pending-count":undefined}>{count}</strong><span>{unit}</span></div>
  <div className="cy-bot-work-rows">{children??<div className="cy-bot-work-row is-empty">{empty}</div>}</div>
 </article>;
}

export function BotWorkCards({summary,nowMs,busy,onAllPosts,onPost,onAllPatrol,onSession,onReviewTable}:{
 summary:BotCenterState["workSummary"];nowMs:number;busy:boolean;
 onAllPosts:()=>void;onPost:(id:number)=>void;onAllPatrol:()=>void;
 onSession:(session:PatrolSession)=>void;onReviewTable:()=>void;
}){
 const posts=summary.articles.published.items.slice(0,MAX_ROWS),sessions=patrolRows(summary.patrols.sessions),pending=summary.pending,decisions=summary.decisions;
 return <section className="cy-bot-work-cards" aria-label="工作摘要">
  <WorkCard label="新文章通知" title="新文章通知" link="全部" onLink={onAllPosts} count={summary.articles.count} unit="篇・今日已發布" empty="今日尚無發布">
   {posts.length?posts.map(item=><button key={item.id} type="button" className="cy-bot-work-row" disabled={busy} onClick={()=>onPost(item.id)}>
    {item.platform?<span className={platformClass(item.platform)}>{item.platform}</span>:null}
    <span className="cy-bot-work-row-title">{item.title}</span><small>{clockText(item.sentAt)}</small></button>):undefined}
  </WorkCard>
  <WorkCard label="Threads 巡視回報" title="Threads 巡視回報" link="全部" onLink={onAllPatrol} count={summary.patrols.sentToday} unit="則・今日送出留言" empty="今日尚無巡視">
   {sessions.length?sessions.map(session=><button key={`${session.id}${session.late?"-late":""}`} type="button" className="cy-bot-work-row" disabled={busy} onClick={()=>onSession(session)}>
    <span className="cy-bot-work-row-label">{patrolRowLabel(session)}</span>
    {session.late?null:<StatusChip tone={PATROL_TONE[session.status]}>{patrolStatusLabel(session)}</StatusChip>}
    <span className="cy-bot-work-row-right">{patrolRightText(session)}</span>
    {session.note?<span className="cy-bot-work-row-note" title={session.note}>{session.note}</span>:null}</button>):undefined}
  </WorkCard>
  <WorkCard label="待核准" title="待核准" link="前往" onLink={onReviewTable} count={pending.count} unit="件・待審稿件" alert empty="目前沒有待審稿件">
   {pending.count?<>
    <div className="cy-bot-work-row"><span className="cy-bot-work-row-title">貼文</span><span className="cy-bot-work-row-right">{pending.posts} 件</span></div>
    <div className="cy-bot-work-row"><span className="cy-bot-work-row-title">Threads 留言</span><span className="cy-bot-work-row-right">{pending.patrolDrafts} 件（{pending.patrolItems} 則）</span></div>
    {pending.other>0?<div className="cy-bot-work-row"><span className="cy-bot-work-row-title">其他</span><span className="cy-bot-work-row-right">{pending.other} 件</span></div>:null}
   </>:undefined}
  </WorkCard>
  <WorkCard label="拍板結案" title="拍板結案" link="前往" onLink={onReviewTable} count={decisions.count} unit="件・等你決定" empty="目前沒有待拍板事項">
   {decisions.items.length?decisions.items.map(item=><button key={item.id} type="button" className="cy-bot-work-row" disabled={busy} onClick={onReviewTable}>
    <span className="cy-bot-work-row-title">{item.title}</span>
    <small className={deadlineUrgent(item.deadline,nowMs)?"cy-bot-deadline-text":undefined}>{deadlineText(item.deadline,nowMs)}</small></button>):undefined}
  </WorkCard>
 </section>;
}
