import type {ReactNode} from "react";
import {BOT_PATROL_STATUS_LABELS,type BotCenterState,type BotPatrolStatus} from "../../../shared/bot-center";
import {StatusChip} from "../../ui/primitives/StatusChip";
import {clockText,deadlineText,deadlineUrgent,platformClass} from "./bot-decision";

const PATROL_TONE:Record<BotPatrolStatus,"warning"|"info"|"success"|"neutral">={pending:"warning",open:"neutral",approved:"info",done:"success"};
const PATROL_ORDER:Record<BotPatrolStatus,number>={pending:0,open:1,approved:2,done:3};
const MAX_ROWS=3;

/** 巡視場次右側文字（V0.22.0）。 */
export function patrolRightText(session:BotCenterState["workSummary"]["patrols"]["sessions"][number]):string{
 return session.status==="pending"?`${session.pendingItems} 則待審`:session.status==="approved"?`${session.awaitingItems} 則通過・待小編留言`:`送出 ${session.sent} 則`;
}
/** 待審核的場次排最前，再來已審核，最後已完成；同狀態維持 API 的新到舊。最多顯示 3 筆。 */
export function patrolRows(sessions:BotCenterState["workSummary"]["patrols"]["sessions"]){
 return sessions.map((session,index)=>({session,index})).sort((a,b)=>PATROL_ORDER[a.session.status]-PATROL_ORDER[b.session.status]||a.index-b.index).map(row=>row.session).slice(0,MAX_ROWS);
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
 onSession:(session:BotCenterState["workSummary"]["patrols"]["sessions"][number])=>void;onReviewTable:()=>void;
}){
 const posts=summary.articles.published.items.slice(0,MAX_ROWS),sessions=patrolRows(summary.patrols.sessions),pending=summary.pending,decisions=summary.decisions;
 return <section className="cy-bot-work-cards" aria-label="工作摘要">
  <WorkCard label="新文章通知" title="新文章通知" link="全部" onLink={onAllPosts} count={summary.articles.count} unit="篇・今日已發布" empty="今日尚無發布">
   {posts.length?posts.map(item=><button key={item.id} type="button" className="cy-bot-work-row" disabled={busy} onClick={()=>onPost(item.id)}>
    {item.platform?<span className={platformClass(item.platform)}>{item.platform}</span>:null}
    <span className="cy-bot-work-row-title">{item.title}</span><small>{clockText(item.sentAt)}</small></button>):undefined}
  </WorkCard>
  <WorkCard label="Threads 巡視回報" title="Threads 巡視回報" link="全部" onLink={onAllPatrol} count={summary.patrols.sentToday} unit="則・今日送出留言" empty="今日尚無巡視">
   {sessions.length?sessions.map(session=><button key={session.id} type="button" className="cy-bot-work-row" disabled={busy} onClick={()=>onSession(session)}>
    <span className="cy-bot-work-row-label">{session.label||"其他"}</span>
    <StatusChip tone={PATROL_TONE[session.status]}>{BOT_PATROL_STATUS_LABELS[session.status]}</StatusChip>
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
