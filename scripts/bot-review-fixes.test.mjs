import test from 'node:test';
import assert from 'node:assert/strict';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';
// V0.21.6 post-merge review: removed home-summary fields, revision error mapping, post/patrol need items.
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
async function setup(t){const f=fixture();t.after(()=>f.sql.close());const token=ok(await f.call('/api/bot-center/bots/SOCIAL_EDITOR/credential','POST')).token;const auth={authorization:'Bearer '+token};
 const submit=(externalRef,previousDraftId,extra={})=>f.call('/api/bot-ingest/drafts','POST',{externalRef,previousDraftId,title:'合成稿',body:'合成內容',kind:'post',items:[{title:'合成貼文',body:'本文'}],...extra},auth);
 return {...f,auth,submit}}
test('home summary no longer carries unused fields or runs their queries',async t=>{
 const f=await setup(t);ok(await f.submit('home-1'));f.queries.length=0;
 const s=ok(await f.call('/api/bot-center')).workSummary;
 assert.deepEqual(Object.keys(s.articles).sort(),['count','published']);
 assert.deepEqual(Object.keys(s.patrols).sort(),['count','latest','reports','sentToday','sessions','toSend']);
 assert.equal(f.queries.some(q=>/sent_today/.test(q)),false);
 assert.equal(f.queries.some(q=>/WHERE d\.kind=\? AND \(d\.sent_at>=\?/.test(q)),false);
 assert.equal(f.queries.some(q=>/c\.work_type=\? AND c\.completed_at>=\?/.test(q)),false);
});
test('revision submit: only real conflicts are 409; other errors are rethrown',async t=>{
 const f=await setup(t),a=ok(await f.submit('map-a'));
 const batch=f.db.batch.bind(f.db);let boom=true;
 f.db.batch=async statements=>{if(boom){boom=false;throw new Error('D1_ERROR: network connection lost')}return batch(statements)};
 let status=0;try{status=(await f.submit('map-b',a.id)).status}catch{status=500}
 assert.notEqual(status,409);assert.ok(status>=500);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_drafts').get().n,1);
 const retry=ok(await f.submit('map-b',a.id));assert.equal(retry.revisionNumber,2);
 const other=ok(await f.submit('map-fork'));
 assert.equal((await f.submit('map-fork-2',a.id)).status,409);
 assert.equal(other.revisionNumber,1);
});
test('identical revision resubmitted under the same externalRef returns the existing draft; different content is a 409',async t=>{
 const f=await setup(t),a=ok(await f.submit('same-a'));
 const batch=f.db.batch.bind(f.db);let injected=false,winner;
 f.db.batch=async statements=>{if(!injected){injected=true;winner=ok(await f.submit('same-b',a.id))}return batch(statements)};
 const again=ok(await f.submit('same-b',a.id));assert.equal(again.id,winner.id);
 f.db.batch=batch;
 // Race: the winner landed between the pre-check and the batch.
 const b=ok(await f.submit('race-a'));injected=false;
 f.db.batch=async statements=>{if(!injected){injected=true;winner=ok(await f.submit('race-b',b.id))}return batch(statements)};
 const raced=ok(await f.submit('race-b',b.id));assert.equal(raced.id,winner.id);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_drafts').get().n,4);
 f.db.batch=batch;injected=false;const c=ok(await f.submit('diff-a'));
 f.db.batch=async statements=>{if(!injected){injected=true;ok(await f.submit('diff-b',c.id,{body:'另一份內容'}))}return batch(statements)};
 assert.equal((await f.submit('diff-b',c.id)).status,409);
});
test('post and patrol drafts need items; general drafts cannot carry them',async t=>{
 const f=await setup(t);
 for(const kind of ['post','patrol']){
  const r=await f.call('/api/bot-ingest/drafts','POST',{externalRef:'no-items-'+kind,title:'合成',body:'內容',kind},f.auth);assert.equal(r.status,400,JSON.stringify(r.body));
 }
 assert.equal((await f.call('/api/bot-ingest/drafts','POST',{externalRef:'general-items',title:'合成',body:'內容',items:[{title:'a',body:'b'}],kind:'general'},f.auth)).status,400);
 ok(await f.call('/api/bot-ingest/drafts','POST',{externalRef:'general-ok',title:'合成',body:'內容'},f.auth));
 ok(await f.call('/api/bot-ingest/drafts','POST',{externalRef:'post-ok',title:'合成',body:'內容',kind:'post',items:[{title:'a',body:'b'}]},f.auth));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_drafts').get().n,2);
});
