import test from 'node:test';
import assert from 'node:assert/strict';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
async function setup(t){const f=fixture();t.after(()=>f.sql.close());const token=ok(await f.call('/api/bot-center/bots/SOCIAL_EDITOR/credential','POST')).token;const auth={authorization:'Bearer '+token};return {...f,auth,create:async(kind,n,ref)=>ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成'+kind,body:'合成送審說明',kind,externalRef:ref,items:Array.from({length:n},(_,i)=>({title:'合成第'+(i+1)+'則',body:'合成全文 '+(i+1)+' https://example.invalid/item/'+(i+1)}))},auth))}}
const day=()=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return {start:new Date(d+'T00:00:00+08:00').toISOString(),end:new Date(Date.parse(d+'T00:00:00+08:00')+86400000).toISOString()}};
test('patrol detail contains only individually sent patrol replies; post cards are individual clickable metadata',async t=>{
 const f=await setup(t),patrol=await f.create('patrol',4,'view-patrol'),post=await f.create('post',3,'view-post');
 ok(await f.call(`/api/bot-center/drafts/${patrol.id}/items/4/review`,'POST',{decision:'rejected',reason:'合成退回'}));
 for(const d of [patrol,post])ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved'}));
 ok(await f.call(`/api/bot-ingest/drafts/${patrol.id}/sent`,'POST',{items:[1,2]},f.auth));ok(await f.call(`/api/bot-ingest/drafts/${post.id}/sent`,'POST',{items:[1,3]},f.auth));
 const replies=ok(await f.call('/api/bot-center/sent-items?kind=patrol'));assert.deepEqual(replies.items.map(i=>i.seq),[2,1]);assert(replies.items.every(i=>i.draftId===patrol.id&&i.body.startsWith('合成全文')));
 const state=ok(await f.call('/api/bot-center'));assert.equal(state.workSummary.patrols.sentToday,2);
 assert.deepEqual(state.workSummary.articles.published.items.map(i=>i.seq),[3,1]);assert(state.workSummary.articles.published.items.every(i=>i.draftId===post.id&&!('body' in i)));
 const before=f.sql.prepare('SELECT total_changes() n').get().n;ok(await f.call('/api/bot-center/sent-items?kind=post&summary=1'));assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before,'viewing a delivery does not mutate work');
 const first=state.workSummary.articles.published.items[0],detail=ok(await f.call(`/api/bot-center/drafts/${first.draftId}`));assert.equal(detail.items.find(i=>i.seq===first.seq).body,'合成全文 3 https://example.invalid/item/3');
});
test('sent detail keyset pagination is complete at equal timestamps and excludes other Taipei days',async t=>{
 const f=await setup(t),a=await f.create('patrol',50,'page-a'),b=await f.create('patrol',5,'page-b');
 for(const d of [a,b])ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved'}));
 const range=day(),at=new Date(Date.parse(range.start)+3600000).toISOString();f.sql.prepare('UPDATE bot_draft_items SET sent_at=?').run(at);
 const d=await f.create('patrol',2,'outside');ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved'}));
 f.sql.prepare('UPDATE bot_draft_items SET sent_at=? WHERE draft_id=? AND seq=1').run(new Date(Date.parse(range.start)-1).toISOString(),d.id);f.sql.prepare('UPDATE bot_draft_items SET sent_at=? WHERE draft_id=? AND seq=2').run(range.end,d.id);
 const first=ok(await f.call('/api/bot-center/sent-items?kind=patrol'));assert.equal(first.items.length,50);assert.equal(first.more,true);
 const next=ok(await f.call('/api/bot-center/sent-items?kind=patrol&before='+encodeURIComponent(first.nextBefore)));assert.equal(next.items.length,5);assert.equal(next.more,false);assert.equal(new Set([...first.items,...next.items].map(i=>i.id)).size,55);
 const actual=f.queries.find(q=>q.includes("ORDER BY i.sent_at DESC,i.id DESC"));assert(actual);const plan=f.sql.prepare("EXPLAIN QUERY PLAN "+actual).all("patrol",range.start,range.end,"","","",0,51);assert(plan.some(p=>p.detail.includes('idx_bot_draft_items_sent')));
});
test('patrol reports preserve BOT supplied session names and summaries instead of guessing them',async t=>{
 const f=await setup(t);const range=day(),at=new Date(Date.parse(range.start)+3600000).toISOString();
 for(const [title,detail,type]of[['早巡 已送出','合成早巡摘要','threads_patrol'],['午巡 已送出','合成午巡摘要','threads_patrol'],['文章 已發布','不可當海巡摘要','article_published']])ok(await f.call('/api/bot-ingest/completions','POST',{eventRef:title,title,detail,workType:type,completedAt:at},f.auth));
 const s=ok(await f.call('/api/bot-center')).workSummary;assert.deepEqual(s.patrols.reports.map(r=>[r.title,r.detail]),[['午巡 已送出','合成午巡摘要'],['早巡 已送出','合成早巡摘要']]);assert.equal(s.patrols.count,2);assert.equal(s.patrols.sentToday,0,'completed sessions are not sent replies');
});
test('sent detail requires BOT_CENTER access and validates cursor/kind/scope',async t=>{
 const f=await setup(t);
 assert.equal((await f.call('/api/bot-center/sent-items?kind=patrol','POST',{})).status,404);
 for(const q of ['kind=other','kind=patrol&summary=0','kind=patrol&before=invalid','kind=patrol&before=2026-02-30T01:00:00.000Z%7C1'])assert.equal((await f.call('/api/bot-center/sent-items?'+q)).status,422);
 assert.equal((await f.call('/api/bot-center/sent-items?kind=patrol&botCode=UNKNOWN')).status,404);
 assert.equal((await f.call('/api/bot-center/sent-items?kind=patrol','GET',undefined,{...f.auth,cookie:''})).status,401);
 const denied=fixture('USER');t.after(()=>denied.sql.close());assert.equal((await denied.call('/api/bot-center/sent-items?kind=patrol')).status,403);
 const allowed=fixture('USER',true);t.after(()=>allowed.sql.close());assert.equal((await allowed.call('/api/bot-center/sent-items?kind=patrol')).status,200);
 const token=ok(await f.call('/api/bot-center/bots/FINANCE/credential','POST')).token;
 const d=ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成財務海巡',body:'x',kind:'patrol',items:[{title:'合成',body:'x'}]},{authorization:'Bearer '+token}));ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved'}));ok(await f.call(`/api/bot-ingest/drafts/${d.id}/sent`,'POST',{items:[1]},{authorization:'Bearer '+token}));
 assert.equal(ok(await f.call('/api/bot-center/sent-items?kind=patrol&botCode=SOCIAL_EDITOR')).items.length,0);assert.equal(ok(await f.call('/api/bot-center/sent-items?kind=patrol&botCode=FINANCE')).items.length,1);
});
