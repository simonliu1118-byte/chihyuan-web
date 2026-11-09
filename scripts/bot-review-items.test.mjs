import test from 'node:test';
import assert from 'node:assert/strict';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';

// V0.15.0: multi-item drafts (posts / patrols) reviewed item by item, review-only images, sent reporting.
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
const PNG=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
const JPEG=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46]);
function bucket(){const store=new Map();return{store,
 async put(key,value){store.set(key,new Uint8Array(value))},
 async get(key){const v=store.get(key);return v?{body:v}:null},
 async delete(keys){for(const k of[].concat(keys))store.delete(k)}};}
async function setup(t){
 const f=fixture();t.after(()=>f.sql.close());f.env.HR_FILES=bucket();
 const token=ok(await f.call('/api/bot-center/bots/SOCIAL_EDITOR/credential','POST')).token;
 const auth={authorization:'Bearer '+token};
 const ingest=(path,method,json)=>f.call('/api/bot-ingest/'+path,method,json,auth);
 const upload=(id,bytes,{item,type='image/png'}={})=>f.raw(`/api/bot-ingest/drafts/${id}/images${item?'?item='+item:''}`,'POST',bytes,{...auth,'content-type':type}).then(async r=>({status:r.status,body:await r.json()}));
 const multi=(kind,n,extra={})=>ingest('drafts','POST',{title:kind==='post'?'合成貼文三篇':'合成海巡',body:'合成送審說明',kind,
  items:Array.from({length:n},(_,i)=>({ref:'r'+(i+1),title:'合成第'+(i+1)+'則',body:'合成內容 https://example.invalid/'+(i+1)})),...extra});
 return{...f,auth,ingest,upload,multi};
}

test('multi-item drafts: per-item review finishes as partial approval, all-rejected becomes 退回',async t=>{
 const f=await setup(t);
 const post=ok(await f.multi('post',3));
 assert.equal(post.kind,'post');assert.deepEqual(post.itemCounts,{total:3,pending:3,approved:0,rejected:0});
 const detail=ok(await f.call(`/api/bot-center/drafts/${post.id}`));
 assert.deepEqual(detail.items.map(i=>[i.seq,i.ref,i.status]),[[1,'r1','pending'],[2,'r2','pending'],[3,'r3','pending']]);
 ok(await f.call(`/api/bot-center/drafts/${post.id}/items/1/review`,'POST',{decision:'approved'}));
 assert.equal((await f.call(`/api/bot-center/drafts/${post.id}/items/1/review`,'POST',{decision:'rejected',reason:'x'})).status,409);
 assert.equal((await f.call(`/api/bot-center/drafts/${post.id}/items/2/review`,'POST',{decision:'rejected'})).status,422);
 ok(await f.call(`/api/bot-center/drafts/${post.id}/items/2/review`,'POST',{decision:'rejected',reason:'合成退回'}));
 let draft=f.sql.prepare('SELECT review_status FROM bot_drafts WHERE id=?').get(post.id);assert.equal(draft.review_status,'pending');
 const last=ok(await f.call(`/api/bot-center/drafts/${post.id}/items/3/review`,'POST',{decision:'approved'}));
 assert.equal(last.draft.status,'approved');assert.equal(last.draft.reason,'部分通過');
 assert.deepEqual(last.items.map(i=>i.status),['approved','rejected','approved']);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action LIKE 'bot_draft.item_%'").get().n,3);
 // The BOT sees each item's result.
 const seen=ok(await f.ingest(`drafts/${post.id}`,'GET'));
 assert.deepEqual(seen.items.map(i=>[i.seq,i.status,i.reason]),[[1,'approved',null],[2,'rejected','合成退回'],[3,'approved',null]]);

 const patrol=ok(await f.multi('patrol',2));
 for(const seq of[1,2])ok(await f.call(`/api/bot-center/drafts/${patrol.id}/items/${seq}/review`,'POST',{decision:'rejected',reason:'不適合'}));
 const done=ok(await f.call(`/api/bot-center/drafts/${patrol.id}`));
 assert.equal(done.draft.status,'rejected');assert.equal(done.draft.reason,'全部退回');
});

test('whole-draft review applies to the remaining items; single drafts keep the original shape',async t=>{
 const f=await setup(t);
 const patrol=ok(await f.multi('patrol',4));
 ok(await f.call(`/api/bot-center/drafts/${patrol.id}/items/2/review`,'POST',{decision:'rejected',reason:'合成'}));
 ok(await f.call(`/api/bot-center/drafts/${patrol.id}/review`,'POST',{decision:'approved'}));
 const d=ok(await f.call(`/api/bot-center/drafts/${patrol.id}`));
 assert.deepEqual(d.items.map(i=>i.status),['approved','rejected','approved','approved']);assert.equal(d.draft.reason,'部分通過');
 assert.equal((await f.call(`/api/bot-center/drafts/${patrol.id}/items/1/review`,'POST',{decision:'approved'})).status,409);

 const single=ok(await f.ingest('drafts','POST',{title:'合成單篇',body:'合成本文'}));
 assert.equal(single.kind,'general');assert.equal(single.itemCounts,null);
 ok(await f.call(`/api/bot-center/drafts/${single.id}/review`,'POST',{decision:'approved'}));
 const seen=ok(await f.ingest(`drafts/${single.id}`,'GET'));assert.equal('items' in seen,false);assert.equal(seen.status,'approved');
});

test('invalid kinds and item lists are rejected without leaving a draft behind',async t=>{
 const f=await setup(t);
 assert.equal((await f.ingest('drafts','POST',{title:'x',body:'y',kind:'other'})).status,422);
 assert.equal((await f.ingest('drafts','POST',{title:'x',body:'y',kind:'post',items:[]})).status,422);
 assert.equal((await f.ingest('drafts','POST',{title:'x',body:'y',kind:'post',items:Array.from({length:51},()=>({title:'a',body:'b'}))})).status,422);
 assert.equal((await f.ingest('drafts','POST',{title:'x',body:'y',kind:'post',items:[{title:'',body:'b'}]})).status,422);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_drafts').get().n,0);
});

test('review images: type by content, 2MB, five per target, pending only, served only to the center',async t=>{
 const f=await setup(t);
 const post=ok(await f.multi('post',2));
 const a=ok(await f.upload(post.id,PNG,{item:1}));assert.equal(a.contentType,'image/png');assert.equal(a.itemSeq,1);
 ok(await f.upload(post.id,JPEG,{type:'image/jpeg'}));
 assert.equal((await f.upload(post.id,Uint8Array.from([1,2,3,4,5,6,7,8,9,10,11,12]))).status,422);
 assert.equal((await f.upload(post.id,PNG,{type:'text/html'})).status,422);
 assert.equal((await f.upload(post.id,new Uint8Array(2_097_153).fill(0x89))).status,413);
 assert.equal((await f.upload(post.id,PNG,{item:9})).status,404);
 for(let i=0;i<4;i++)ok(await f.upload(post.id,PNG,{item:1}));
 assert.equal((await f.upload(post.id,PNG,{item:1})).status,409);
 const detail=ok(await f.call(`/api/bot-center/drafts/${post.id}`));
 assert.equal(detail.images.length,6);assert.equal(detail.draft.imageCount,6);
 assert.equal(detail.images.filter(i=>i.itemId===detail.items[0].id).length,5);
 const served=await f.raw(`/api/bot-center/images/${a.id}`,'GET');
 assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/png');assert.equal(served.headers.get('x-content-type-options'),'nosniff');
 assert.deepEqual(new Uint8Array(await served.arrayBuffer()),PNG);
 const noAccess=fixture('ADMIN',false);t.after(()=>noAccess.sql.close());noAccess.env.HR_FILES=f.env.HR_FILES;
 assert.equal((await noAccess.raw(`/api/bot-center/images/${a.id}`,'GET')).status,403);
 ok(await f.call(`/api/bot-center/drafts/${post.id}/review`,'POST',{decision:'approved'}));
 assert.equal((await f.upload(post.id,PNG)).status,409);
});

test('sent reporting and the daily summary per card',async t=>{
 const f=await setup(t);
 const patrol=ok(await f.multi('patrol',3)),post=ok(await f.multi('post',2));
 ok(await f.multi('patrol',2));
 let s=ok(await f.call('/api/bot-center')).workSummary;
 assert.equal(s.pending.posts,2);assert.equal(s.pending.patrols,5);assert.equal(s.patrols.toSend,5);assert.equal(s.patrols.sentToday,0);
 assert.equal((await f.ingest(`drafts/${patrol.id}/sent`,'POST',{items:[1]})).status,409);
 ok(await f.call(`/api/bot-center/drafts/${patrol.id}/items/3/review`,'POST',{decision:'rejected',reason:'合成'}));
 ok(await f.call(`/api/bot-center/drafts/${patrol.id}/review`,'POST',{decision:'approved'}));
 assert.equal((await f.ingest(`drafts/${patrol.id}/sent`,'POST',{})).status,422);
 assert.equal(ok(await f.ingest(`drafts/${patrol.id}/sent`,'POST',{items:[1,2,3]})).sent,2);
 assert.equal(ok(await f.ingest(`drafts/${patrol.id}/sent`,'POST',{items:[1]})).sent,0);
 ok(await f.call(`/api/bot-center/drafts/${post.id}/review`,'POST',{decision:'approved'}));
 s=ok(await f.call('/api/bot-center')).workSummary;
 assert.equal(s.pending.posts,0);assert.equal(s.pending.patrols,2);assert.equal(s.patrols.sentToday,2);assert.equal(s.patrols.toSend,2);
 assert.deepEqual(s.patrols.reviewed.map(d=>d.id),[patrol.id]);assert.deepEqual(s.articles.reviewed.map(d=>d.id),[post.id]);
 const single=ok(await f.ingest('drafts','POST',{title:'合成單篇',body:'合成本文'}));
 ok(await f.call(`/api/bot-center/drafts/${single.id}/review`,'POST',{decision:'approved'}));
 assert.equal(ok(await f.ingest(`drafts/${single.id}/sent`,'POST',{})).sent,1);
 assert.ok(ok(await f.ingest(`drafts/${single.id}`,'GET')).sentAt);
});

test('images of reviewed drafts are removed the next day; pending drafts keep theirs',async t=>{
 const f=await setup(t);
 const done=ok(await f.multi('post',1)),open=ok(await f.multi('post',1));
 ok(await f.upload(done.id,PNG,{item:1}));ok(await f.upload(open.id,PNG,{item:1}));
 ok(await f.call(`/api/bot-center/drafts/${done.id}/review`,'POST',{decision:'approved'}));
 assert.equal(await f.cleanupReviewImages(f.env,new Date().toISOString()),0);
 const tomorrow=new Date(Date.now()+36*3600_000).toISOString();
 assert.equal(await f.cleanupReviewImages(f.env,tomorrow),1);
 assert.deepEqual(f.sql.prepare('SELECT draft_id FROM bot_review_images').all().map(r=>r.draft_id),[open.id]);
 assert.equal(f.env.HR_FILES.store.size,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_draft_items WHERE draft_id=?').get(done.id).n,1);
});
