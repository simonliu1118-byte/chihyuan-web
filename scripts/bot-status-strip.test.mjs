// V0.22.0 頁首 BOT 狀態列、四張摘要卡與拍板顯示的純邏輯。
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'empty'}});
 return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))};
const shared=await load('shared/bot-center.ts');
const cards=await load('src/runtime/modules/BotWorkCards.tsx');
const decision=await load('src/runtime/modules/bot-decision.ts');
const {botAttention,canonicalBotPlatform}=shared;
const NOW=Date.parse('2026-11-19T10:00:00.000Z');
const hoursAgo=h=>new Date(NOW-h*3600000).toISOString();
const bot=(code,status,updatedAt,summary='')=>({code,label:code+'名',status,summary,updatedAt});

test('status strip: a blocked BOT is listed with its Taipei time; working past 6 hours is listed; everything else is normal',()=>{
 const r=botAttention([
  bot('A','blocked','2026-11-19T04:55:00.000Z','Threads 登入失效'),
  bot('B','working',hoursAgo(7)),
  bot('C','working',hoursAgo(1)),
  bot('D','idle',hoursAgo(30)),
  bot('E','done',hoursAgo(30)),
 ],NOW);
 assert.deepEqual(r.items.map(i=>[i.code,i.kind,i.text]),[['A','blocked','A名・受阻 12:55'],['B','stale','B名・7 小時無回報']]);
 assert.equal(r.items[0].summary,'Threads 登入失效');assert.equal(r.items[0].updatedAt,'2026-11-19T04:55:00.000Z');
 assert.equal(r.normal,3);
});
test('status strip: 6 hours exactly is still normal; just over is listed; blocked is listed however old',()=>{
 assert.equal(botAttention([bot('B','working',hoursAgo(6))],NOW).items.length,0);
 const over=botAttention([bot('B','working',new Date(NOW-6*3600000-1).toISOString())],NOW).items;
 assert.deepEqual(over.map(i=>i.text),['B名・6 小時無回報']);
 assert.equal(botAttention([bot('B','working',hoursAgo(29.5))],NOW).items[0].text,'B名・29 小時無回報');
 assert.equal(botAttention([bot('A','blocked',hoursAgo(100))],NOW).items.length,1);
 assert.equal(botAttention([bot('A','blocked','2026-11-19T16:05:00.000Z')],Date.parse('2026-11-20T00:00:00Z')).items[0].text,'A名・受阻 00:05','midnight is 00:05, never 24:05');
});
test('status strip: all normal, none, and all needing attention',()=>{
 assert.deepEqual(botAttention([bot('A','idle',hoursAgo(1)),bot('B','done',hoursAgo(50))],NOW),{items:[],normal:2});
 assert.deepEqual(botAttention([],NOW),{items:[],normal:0});
 const all=botAttention([bot('A','blocked',hoursAgo(1)),bot('B','working',hoursAgo(9))],NOW);assert.equal(all.items.length,2);assert.equal(all.normal,0);
 assert.deepEqual(botAttention([bot('X','working','not a date')],NOW).items,[],'an unreadable time never raises a false alarm');
});
const sess=(id,status,extra={})=>({id,label:'場'+id,note:'',day:'2026-11-19',sent:0,sentTotal:0,status,pendingItems:0,awaitingItems:0,waitingImages:0,skipped:null,abandoned:null,draftIds:[],...extra});
test('Threads card rows: 待審核, 待留言, 等待圖片, 進行中, 已完成 in that order, at most three today, each with its own right-hand text',()=>{
 const rows=cards.patrolRows([sess(1,'done',{sent:10}),sess(2,'toSend',{awaitingItems:4}),sess(3,'pending',{pendingItems:5}),sess(4,'waitingImages',{waitingImages:2}),sess(5,'open')]);
 assert.deepEqual(rows.map(r=>r.id),[3,2,4]);
 assert.deepEqual(rows.map(cards.patrolRightText),['5 則待審','4 則待留言','2 則等圖']);
 assert.equal(cards.patrolRightText(sess(6,'done',{sent:7})),'送出 7 則');assert.equal(cards.patrolRightText(sess(7,'open')),'進行中');
 assert.equal(cards.patrolStatusLabel(sess(4,'waitingImages',{waitingImages:2})),'等待圖片');
 assert.deepEqual(cards.patrolRows([]),[]);
});
test('Threads card: a late-delivery row reads 「11/20 早巡（補送）」 with today\'s 送出 N 則, appended after today\'s sessions',()=>{
 const late=sess(9,'done',{label:'早巡',day:'2026-11-20',sent:3,sentTotal:8,late:true});
 const rows=cards.patrolRows([late,sess(1,'done',{sent:2}),sess(2,'open'),sess(3,'pending'),sess(4,'toSend')]);
 assert.deepEqual(rows.map(r=>r.id),[3,4,2,9],'late row never competes for the three today slots');
 assert.equal(cards.patrolRowLabel(late),'11/20 早巡（補送）');assert.equal(cards.patrolRightText(late),'送出 3 則');
 assert.equal(cards.patrolRowLabel(sess(1,'done',{label:''})),'其他');
});
test('derivePatrolStatus: counts decide the status in priority order; fallback to the old inference without counts',()=>{
 const none={pendingReview:null,toSend:null,waitingImages:null,skipped:null,abandoned:null};
 const d=(o)=>shared.derivePatrolStatus({linked:false,linkedPending:0,linkedAwaiting:0,counts:none,completed:false,...o,counts:{...none,...(o.counts||{})}}).status;
 assert.equal(d({}),'open','no counts, no draft, not completed');
 assert.equal(d({completed:true}),'done');
 assert.equal(d({counts:{pendingReview:2,toSend:3,waitingImages:1}}),'pending');
 assert.equal(d({counts:{pendingReview:0,toSend:3,waitingImages:1}}),'toSend');
 assert.equal(d({counts:{pendingReview:0,toSend:0,waitingImages:1}}),'waitingImages');
 assert.equal(d({counts:{pendingReview:0,toSend:0,waitingImages:0}}),'done','nothing left in the reported counts');
 assert.equal(d({counts:{skipped:2}}),'done','reported counts with nothing pending are complete');
 assert.equal(d({completed:true,counts:{toSend:2,waitingImages:1}}),'done','BOT completed explicitly');
 assert.equal(d({completed:true,counts:{pendingReview:1}}),'pending','pending review still needs a person');
 assert.equal(d({linked:true,linkedPending:2}),'pending');assert.equal(d({linked:true,linkedAwaiting:2}),'toSend');
 assert.equal(d({linked:true,linkedAwaiting:2,completed:true}),'done');assert.equal(d({linked:true}),'done');
 const merged=shared.derivePatrolStatus({linked:true,linkedPending:2,linkedAwaiting:0,counts:{...none,pendingReview:3},completed:false});assert.equal(merged.pending,3,'the larger of linked and reported, never double counted');
});
test('deadline text: today shows 今日 HH:MM, other days MM/DD HH:MM, urgent when today or past',()=>{
 const now=Date.parse('2026-11-19T02:00:00.000Z');// 台北 10:00
 assert.equal(decision.deadlineText('2026-11-19T10:00:00.000Z',now),'今日 18:00');
 assert.equal(decision.deadlineText('2026-11-20T01:00:00.000Z',now),'11/20 09:00');
 assert.equal(decision.deadlineText(null,now),'—');
 assert.equal(decision.deadlineUrgent('2026-11-19T10:00:00.000Z',now),true);
 assert.equal(decision.deadlineUrgent('2026-11-18T10:00:00.000Z',now),true);
 assert.equal(decision.deadlineUrgent('2026-11-20T01:00:00.000Z',now),false);
 assert.equal(decision.deadlineUrgent(null,now),false);
 assert.equal(decision.decisionAmountText(300000),'NT$ 3,000');assert.equal(decision.decisionAmountText(12345),'NT$ 123.45');
 assert.equal(decision.platformClass('FB'),'cy-bot-platform cy-bot-platform-fb');assert.equal(decision.platformClass('Threads'),'cy-bot-platform cy-bot-platform-threads');
 assert.equal(decision.platformClass('部落格'),'cy-bot-platform');
});
test('platform canonical form',()=>{
 assert.equal(canonicalBotPlatform('fb'),'FB');assert.equal(canonicalBotPlatform(' IG '),'IG');assert.equal(canonicalBotPlatform('THREADS'),'Threads');
 assert.equal(canonicalBotPlatform('Twitter'),null);assert.equal(canonicalBotPlatform(''),null);
});
