// V0.30.0: 巡視場次狀態（結構化則數）、補送較早場次、90 天保存期、送出內容視窗（原文並排）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
async function setup(t){const f=fixture();t.after(()=>f.sql.close());const token=ok(await f.call('/api/bot-center/bots/SOCIAL_EDITOR/credential','POST')).token;
 const auth={authorization:'Bearer '+token};
 return {...f,auth,ingest:(path,method='POST',json)=>f.call('/api/bot-ingest/'+path,method,json,auth)}}
const DAY=86400000,dayOf=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
const today=()=>dayOf(Date.now()),daysAgo=n=>dayOf(Date.now()-n*DAY);
const session=(f,ref,extra={})=>f.ingest('patrol-sessions','POST',{sessionRef:ref,label:'午巡',...extra});
const sessions=async f=>ok(await f.call('/api/bot-center')).workSummary.patrols.sessions;
const deliver=(f,ref,sessionRef,extra={})=>f.ingest('deliveries','POST',{eventRef:ref,kind:'patrol',approvalSource:'chat',approvalNote:'合成核准',title:'留言 '+ref,body:'合成留言 '+ref,sessionRef,...extra});

test('counts decide the status in order 待審核 → 待留言 → 等待圖片 → 已完成; note never matters',async t=>{
 const f=await setup(t);
 ok(await session(f,'a',{note:'3則待審核'}));
 assert.equal((await sessions(f))[0].status,'open','no counts reported: still 進行中 whatever the note says');
 ok(await session(f,'a',{pendingReview:2,toSend:3,waitingImages:1,skipped:4,abandoned:1}));
 let [s]=await sessions(f);assert.deepEqual([s.status,s.pendingItems,s.awaitingItems,s.waitingImages,s.skipped,s.abandoned],['pending',2,3,1,4,1]);
 ok(await session(f,'a',{pendingReview:0}));[s]=await sessions(f);assert.deepEqual([s.status,s.awaitingItems],['toSend',3],'omitted counts keep their last value');
 ok(await session(f,'a',{toSend:0}));[s]=await sessions(f);assert.deepEqual([s.status,s.waitingImages],['waitingImages',1]);
 ok(await session(f,'a',{waitingImages:0}));[s]=await sessions(f);assert.equal(s.status,'done','nothing pending, to send or waiting for images');
 ok(await session(f,'a',{note:'5則待審核'}));assert.equal((await sessions(f))[0].status,'done','a note cannot reopen it');
});
test('count validation: integers 0..999 only',async t=>{
 const f=await setup(t);
 for(const field of ['pendingReview','toSend','waitingImages','skipped','abandoned'])
  for(const value of [-1,1.5,'3',null,1000,true,[]]){const r=await session(f,'v',{[field]:value});assert.equal(r.status,422,field+JSON.stringify(value))}
 assert.equal(ok(await session(f,'v',{pendingReview:999,toSend:0})).counts.pendingReview,999);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_patrol_sessions').get().n,1,'invalid reports stored nothing');
});
test('a completed session with leftovers is done, but pending review still needs a person',async t=>{
 const f=await setup(t);
 ok(await session(f,'a',{toSend:2,waitingImages:1,completed:true}));assert.equal((await sessions(f))[0].status,'done');
 ok(await session(f,'b',{label:'晚巡',pendingReview:1,completed:true}));assert.equal((await sessions(f)).find(x=>x.label==='晚巡').status,'pending');
});
test('late delivery: an earlier session within 14 days is accepted and counted; future and older are rejected',async t=>{
 const f=await setup(t);
 ok(await session(f,'old5',{label:'早巡',day:daysAgo(5)}));ok(await session(f,'old14',{label:'午巡',day:daysAgo(14)}));
 ok(await session(f,'old15',{label:'晚巡',day:daysAgo(15)}));ok(await session(f,'future',{label:'夜巡',day:daysAgo(-1)}));ok(await session(f,'now',{label:'今巡'}));
 ok(await deliver(f,'e1','old5'));ok(await deliver(f,'e2','old5'));ok(await deliver(f,'e3','old14'));ok(await deliver(f,'e4','now'));
 assert.equal((await deliver(f,'e5','old15')).status,422,'15 days back is rejected');
 assert.equal((await deliver(f,'e6','future')).status,422,'a session dated after the delivery is rejected');
 const rows=await sessions(f);
 const late=rows.filter(x=>x.late);assert.deepEqual(late.map(x=>[x.label,x.day,x.sent,x.sentTotal,x.status]).sort(),[['午巡',daysAgo(14),1,1,'done'],['早巡',daysAgo(5),2,2,'done']].sort());
 const now=rows.find(x=>x.label==='今巡');assert.deepEqual([now.late,now.sent,now.sentTotal],[undefined,1,1]);
 assert.equal(rows.some(x=>x.label==='晚巡'||x.label==='夜巡'),false,'sessions of other days are not listed without deliveries today');
 assert.equal(ok(await f.call('/api/bot-center')).workSummary.patrols.sentToday,4,'the card header counts every delivery sent today');
 // The session view lists all of its deliveries, whatever the date.
 f.sql.prepare("UPDATE bot_deliveries SET sent_at=? WHERE event_ref='e1'").run(new Date(Date.now()-3*DAY).toISOString());
 const id=late.find(x=>x.label==='早巡').id;
 const page=ok(await f.call('/api/bot-center/sent-items?kind=patrol&sessionId='+id));assert.equal(page.items.length,2);
 const lateNow=(await sessions(f)).find(x=>x.late&&x.label==='早巡');assert.deepEqual([lateNow.sent,lateNow.sentTotal],[1,2],'row shows today only, the session total counts all dates');
});
test('late delivery with an earlier sentAt: the session day is measured against the day it was sent',async t=>{
 const f=await setup(t);ok(await session(f,'d3',{day:daysAgo(3)}));
 assert.equal((await deliver(f,'back','d3',{sentAt:new Date(Date.now()-5*DAY).toISOString()})).status,422,'sent before the session day');
 assert.equal((await deliver(f,'same','d3',{sentAt:new Date(Date.now()-3*DAY).toISOString()})).status,200);
});
test('delivery source fields: stored, returned, validated; old deliveries have none',async t=>{
 const f=await setup(t);ok(await session(f,'s'));
 const bad=async extra=>assert.equal((await deliver(f,'bad'+Math.random(),'s',extra)).status,422,JSON.stringify(extra).slice(0,80));
 await bad({sourceText:'字'.repeat(2001)});await bad({sourceAuthor:'a'.repeat(81)});await bad({sourceUrl:'javascript:alert(1)'});await bad({sourceUrl:'ftp://example.test/x'});
 await bad({sourceUrl:'https://example.test/'+'a'.repeat(500)});await bad({sourceText:5});
 const d=ok(await deliver(f,'src','s',{sourceText:'合成原文',sourceAuthor:'synthetic_user',sourceUrl:'http://example.test/post/1',url:'https://example.test/reply/1'}));
 const v=ok(await f.call('/api/bot-center/deliveries/'+d.id)).item;assert.deepEqual([v.sourceText,v.sourceAuthor,v.sourceUrl,v.body],['合成原文','synthetic_user','http://example.test/post/1','合成留言 src']);
 assert.equal(ok(await deliver(f,'src','s',{sourceText:'合成原文',sourceAuthor:'synthetic_user',sourceUrl:'http://example.test/post/1',url:'https://example.test/reply/1'})).duplicate,true,'same retry is a duplicate');
 assert.equal((await deliver(f,'src','s',{sourceText:'另一段',sourceAuthor:'synthetic_user',sourceUrl:'http://example.test/post/1',url:'https://example.test/reply/1'})).status,409);
 const old=ok(await deliver(f,'plain','s'));const o=ok(await f.call('/api/bot-center/deliveries/'+old.id)).item;assert.deepEqual([o.sourceText,o.sourceAuthor,o.sourceUrl],['','','']);
});
test('retention: deliveries older than 90 days and unused old sessions go; in-window data and draft-linked history stay; idempotent and bounded',async t=>{
 const f=await setup(t);
 const iso=n=>new Date(Date.now()-n*DAY).toISOString();
 ok(await session(f,'ancient',{day:daysAgo(100)}));ok(await session(f,'edge-late',{day:daysAgo(91)}));ok(await session(f,'recent',{day:daysAgo(2)}));ok(await session(f,'today'));ok(await session(f,'empty-old',{day:daysAgo(95)}));
 const draft=ok(await f.ingest('drafts','POST',{externalRef:'dd',title:'巡視',body:'x',kind:'patrol',items:[{title:'一',body:'x'}],sessionRef:'today'}));
 // 稿件連結的舊場次：把稿件改連到將被清理的舊場次，確認外鍵不擋、稿件保留。
 const oldId=f.sql.prepare("SELECT id FROM bot_patrol_sessions WHERE session_ref='empty-old'").get().id;
 f.sql.prepare('UPDATE bot_drafts SET session_id=? WHERE id=?').run(oldId,draft.id);
 const ins=(ref,sessionRef,days)=>{const sid=f.sql.prepare('SELECT id FROM bot_patrol_sessions WHERE session_ref=?').get(sessionRef).id;
  f.sql.prepare("INSERT INTO bot_deliveries(bot_id,event_ref,kind,title,body,sent_at,approval_source,session_id) VALUES(1,?,'patrol','t','b',?,'chat',?)").run(ref,iso(days),sid);return Number(f.sql.prepare('SELECT id FROM bot_deliveries WHERE event_ref=?').get(ref).id)};
 const oldDelivery=ins('d-old','ancient',100);ins('d-91','edge-late',91);ins('d-89','edge-late',89);ins('d-new','recent',1);
 f.sql.prepare("INSERT INTO bot_delivery_images(delivery_id,upload_ref,object_key,content_type,bytes,created_at) VALUES(?,?,?,?,?,?)").run(oldDelivery,'u','bot-delivery/x','image/png',1,iso(100));
 const deleted=[];f.env.HR_FILES={async delete(keys){deleted.push(...[].concat(keys))}};
 const first=await f.purgeOldBotHistory(f.env,new Date().toISOString());
 assert.deepEqual(first,{deliveries:2,sessions:2});assert.deepEqual(deleted,['bot-delivery/x']);
 assert.deepEqual(f.sql.prepare('SELECT event_ref FROM bot_deliveries ORDER BY id').all().map(r=>r.event_ref),['d-89','d-new']);
 assert.deepEqual(f.sql.prepare('SELECT session_ref FROM bot_patrol_sessions ORDER BY id').all().map(r=>r.session_ref),['edge-late','recent','today'],'edge-late still has an in-window delivery');
 assert.equal(f.sql.prepare('SELECT session_id FROM bot_drafts WHERE id=?').get(draft.id).session_id,null,'the draft stays, only its session link is cleared');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_delivery_images').get().n,0);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.deepEqual(await f.purgeOldBotHistory(f.env,new Date().toISOString()),{deliveries:0,sessions:0},'idempotent');
 // Bounded: more rows than one run's batches leave the rest for the next daily run.
 for(let i=0;i<1100;i++)f.sql.prepare("INSERT INTO bot_deliveries(bot_id,event_ref,kind,title,body,sent_at,approval_source) VALUES(1,?,'patrol','t','b',?,'chat')").run('bulk'+i,iso(120));
 assert.equal((await f.purgeOldBotHistory(f.env,new Date().toISOString())).deliveries,1000);
 assert.equal((await f.purgeOldBotHistory(f.env,new Date().toISOString())).deliveries,100);
});

const load=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'empty'}});
 return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))};
test('sent item rendering: title links to our comment, source and comment side by side; old rows show 未附原文',async()=>{
 const {SentPatrolItem}=await load('src/runtime/modules/BotSentPatrolDialog.tsx');
 const item=(extra={})=>({id:1,draftId:null,seq:null,title:'舊標題',sentAt:'2026-11-25T01:06:00.000Z',platform:'Threads',body:'我們的留言<b>',draftTitle:'',botCode:'SOCIAL_EDITOR',botLabel:'小編',url:'https://example.test/reply/1',approvalSource:'chat',approvalNote:'',sessionLabel:'午巡',sourceText:'',sourceAuthor:'',sourceUrl:'',...extra});
 const html=renderToStaticMarkup(SentPatrolItem({item:item({sourceText:'合成原文',sourceAuthor:'synthetic_user',sourceUrl:'https://example.test/post/1'}),number:9}));
 assert.match(html,/<a href="https:\/\/example\.test\/reply\/1"[^>]*>第 9 則　@synthetic_user ↗<\/a>/);
 assert.match(html,/aria-label="原文"[\s\S]*合成原文[\s\S]*aria-label="我們的留言"[\s\S]*我們的留言&lt;b&gt;/);
 assert.doesNotMatch(html,/開啟貼文|查看已送出留言|未附原文/);
 const old=renderToStaticMarkup(SentPatrolItem({item:item(),number:1}));
 assert.match(old,/未附原文/);assert.match(old,/我們的留言&lt;b&gt;/);assert.match(old,/第 1 則　舊標題 ↗/,'no author: falls back to the stored title');
 const nolink=renderToStaticMarkup(SentPatrolItem({item:item({url:''}),number:2}));assert.doesNotMatch(nolink,/<a /);assert.doesNotMatch(nolink,/↗/);
});
