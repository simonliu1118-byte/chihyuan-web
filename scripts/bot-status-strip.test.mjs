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
test('Threads card rows: 待審核 first, then 已審核, then 已完成, at most three, each with its own right-hand text',()=>{
 const s=(id,status,extra={})=>({id,label:'場'+id,note:'',sent:0,status,pendingItems:0,awaitingItems:0,draftIds:[],...extra});
 const rows=cards.patrolRows([s(1,'done',{sent:10}),s(2,'approved',{awaitingItems:4}),s(3,'pending',{pendingItems:5}),s(4,'done',{sent:2})]);
 assert.deepEqual(rows.map(r=>r.id),[3,2,1]);
 assert.deepEqual(rows.map(cards.patrolRightText),['5 則待審','4 則通過・待小編留言','送出 10 則']);
 assert.deepEqual(cards.patrolRows([]),[]);
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
