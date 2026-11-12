import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';
const bundle=await build({entryPoints:['worker/bot/review-push.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const push=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
const target={url:'https://api2.cursor.sh/synthetic/webhook-not-real',key:'synthetic-grok-webhook-key-0000000000'};
async function setup(t){const f=fixture();t.after(()=>f.sql.close());f.env.BOT_PUSH_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 const token=ok(await f.call('/api/bot-center/bots/SOCIAL_EDITOR/credential','POST')).token;
 const configure=(value={enabled:true,...target})=>f.call('/api/bot-center/bots/SOCIAL_EDITOR/push','PUT',value);
 ok(await configure());
 const draft=async()=>ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成私人稿件',body:'合成私人本文',externalRef:'synthetic-'+crypto.randomUUID()},{authorization:'Bearer '+token}));
 const review=(id,decision='approved')=>f.call(`/api/bot-center/drafts/${id}/review`,'POST',{decision,reason:decision==='rejected'?'合成私人退回理由':undefined});
 return {...f,token,configure,draft,review};
}
const delivery=(f,id)=>f.sql.prepare('SELECT * FROM bot_review_push_outbox WHERE draft_id=?').get(id);

test('the first send is attached to waitUntil after commit; unconfigured reviews keep the original behavior',async t=>{
 const f=await setup(t),draft=await f.draft(),pending=[],original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{
   assert.equal(f.sql.prepare('SELECT review_status FROM bot_drafts WHERE id=?').get(draft.id).review_status,'approved');
   assert.ok(delivery(f,draft.id));return new Response('',{status:200});
  };
  ok(await f.call(`/api/bot-center/drafts/${draft.id}/review`,'POST',{decision:'approved'},{},{waitUntil:promise=>pending.push(promise)}));
  assert.equal(pending.length,1);await Promise.all(pending);assert.equal(delivery(f,draft.id).status,'accepted');
  ok(await f.configure({enabled:false}));const noPush=await f.draft();ok(await f.review(noPush.id));assert.equal(delivery(f,noPush.id),undefined);
 }finally{globalThis.fetch=original}
});

test('configuration is encrypted per BOT and never returned or audited as plaintext',async t=>{
 const f=await setup(t);
 const row=f.sql.prepare('SELECT bot_id,encrypted_target FROM bot_review_push_settings').get();
 assert.equal(row.encrypted_target.includes(target.url),false);assert.equal(row.encrypted_target.includes(target.key),false);
 assert.deepEqual(await push.openPushTarget(f.env,row.bot_id,row.encrypted_target),target);
 await assert.rejects(push.openPushTarget(f.env,row.bot_id+1,row.encrypted_target),e=>e.code==='PUSH_CONFIG_UNAVAILABLE');
 const view=ok(await f.call('/api/bot-center'));
 const exposed=JSON.stringify(view)+JSON.stringify(f.sql.prepare('SELECT * FROM audit_events').all());
 assert.equal(exposed.includes(target.key),false);assert.equal(exposed.includes(target.url),false);assert.equal(exposed.includes(row.encrypted_target),false);
 const enabled=view.pushSettings.find(x=>x.botCode==='SOCIAL_EDITOR');assert.equal(enabled.enabled,true);assert.equal(enabled.configured,true);assert.equal(view.pushReady,true);
 const original=row.encrypted_target;
 ok(await f.call('/api/bot-center/bots/FINANCE/push','PUT',{enabled:true,url:target.url+'/it',key:target.key+'-it'}));
 assert.equal(f.sql.prepare('SELECT encrypted_target FROM bot_review_push_settings WHERE bot_id=?').get(row.bot_id).encrypted_target,original);
 ok(await f.configure({enabled:false,url:'',key:''}));
 assert.equal(f.sql.prepare('SELECT encrypted_target FROM bot_review_push_settings WHERE bot_id=?').get(row.bot_id).encrypted_target,original);
});

test('missing service key, non-super-admin and untrusted destinations cannot enable push',async t=>{
 const f=await setup(t);
 for(const url of ['http://api2.cursor.sh/hook','https://api2.cursor.sh/','https://api2.cursor.sh:8443/hook','https://api2.cursor.sh@attacker.invalid/hook','https://localhost/hook','https://api2.cursor.sh.attacker.invalid/hook','https://api2.cursor.sh/hook#fragment']){
  const response=await f.configure({enabled:true,...target,url});assert.equal(response.status,422);assert.equal(JSON.stringify(response.body).includes(url),false);
 }
 const before=f.sql.prepare('SELECT encrypted_target FROM bot_review_push_settings').get().encrypted_target;
 delete f.env.BOT_PUSH_ENCRYPTION_KEY;
 assert.equal((await f.configure()).status,503);assert.equal(f.sql.prepare('SELECT encrypted_target FROM bot_review_push_settings').get().encrypted_target,before);
 const admin=fixture('ADMIN',true);try{assert.equal((await admin.call('/api/bot-center/bots/SOCIAL_EDITOR/push','PUT',{enabled:false})).status,403)}finally{admin.sql.close()}
});

test('review, audit and outbox are atomic, and retries do not create another event',async t=>{
 const f=await setup(t),draft=await f.draft();
 ok(await f.review(draft.id));assert.equal(delivery(f,draft.id).status,'queued');
 assert.equal((await f.review(draft.id)).status,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_review_push_outbox').get().n,1);
 const another=await f.draft();
 f.sql.exec("CREATE TRIGGER reject_push BEFORE INSERT ON bot_review_push_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 assert.equal((await f.review(another.id)).status,500);
 assert.equal(f.sql.prepare('SELECT review_status FROM bot_drafts WHERE id=?').get(another.id).review_status,'pending');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE entity_type='bot_draft' AND entity_key=?").get(String(another.id)).n,0);
});

test('a concurrent review has one business winner, one audit and one queued notification',async t=>{
 const f=await setup(t),draft=await f.draft(),batch=f.db.batch.bind(f.db);let arrived=0,release;
 const ready=new Promise(resolve=>release=resolve);
 f.db.batch=async statements=>{if(++arrived===2)release();await ready;return batch(statements)};
 const result=await Promise.all([f.review(draft.id,'approved'),f.review(draft.id,'rejected')]);
 assert.deepEqual(result.map(x=>x.status).sort(),[200,409]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_review_push_outbox').get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE entity_type='bot_draft'").get().n,1);
});

test('delivery sends only identifiers over HTTPS without redirecting and records acceptance',async t=>{
 const f=await setup(t),draft=await f.draft();ok(await f.review(draft.id,'rejected'));let calls=0;
 const fetchImpl=async(url,options)=>{calls++;assert.equal(url,target.url);assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,'Bearer '+target.key);
  assert.deepEqual(JSON.parse(options.body),{type:'cyweb.review_result',eventId:'bot-review-'+draft.id,botCode:'SOCIAL_EDITOR',draftId:draft.id});
  for(const hidden of [draft.title,draft.body,'合成私人退回理由',f.token])assert.equal(options.body.includes(hidden),false);
  return new Response('accepted',{status:200});};
 assert.deepEqual(await push.deliverReviewPushes(f.env,{fetchImpl}),{accepted:1,failed:0});
 assert.equal(delivery(f,draft.id).status,'accepted');assert.equal(delivery(f,draft.id).attempts,1);
 await push.deliverReviewPushes(f.env,{fetchImpl});assert.equal(calls,1);
 assert.equal((await f.call(`/api/bot-center/drafts/${draft.id}/push/retry`,'POST')).status,409);
});

test('a network failure keeps the review, retries at the due time, and preserves the notification ID',async t=>{
 const f=await setup(t),draft=await f.draft();ok(await f.review(draft.id));const bodies=[];
 await push.deliverReviewPushes(f.env,{fetchImpl:async(_,options)=>{bodies.push(options.body);throw Error(target.key)}});
 let row=delivery(f,draft.id);assert.equal(row.status,'queued');assert.equal(row.last_error_code,'PUSH_NETWORK');
 assert.equal(f.sql.prepare('SELECT review_status FROM bot_drafts WHERE id=?').get(draft.id).review_status,'approved');
 await push.deliverReviewPushes(f.env,{now:row.created_at,fetchImpl:async()=>{throw Error('too early')}});assert.equal(delivery(f,draft.id).attempts,1);
 await push.deliverReviewPushes(f.env,{now:row.next_attempt_at,fetchImpl:async(_,options)=>{bodies.push(options.body);return new Response('',{status:200})}});
 assert.equal(bodies[0],bodies[1]);assert.equal(delivery(f,draft.id).status,'accepted');
});

test('redirects and authorization failures stop, server failures are bounded, and manual retry keeps the same event',async t=>{
 const f=await setup(t),draft=await f.draft();ok(await f.review(draft.id));
 await push.deliverReviewPushes(f.env,{fetchImpl:async()=>new Response('',{status:302,headers:{location:'https://attacker.invalid/'}})});
 assert.equal(delivery(f,draft.id).status,'failed');assert.equal(delivery(f,draft.id).last_error_code,'PUSH_HTTP_302');
 ok(await f.call(`/api/bot-center/drafts/${draft.id}/push/retry`,'POST'));
 for(let i=0;i<6;i++){const row=delivery(f,draft.id);await push.deliverReviewPushes(f.env,{now:row.next_attempt_at,fetchImpl:async()=>new Response('',{status:503})})}
 assert.equal(delivery(f,draft.id).status,'failed');assert.equal(delivery(f,draft.id).attempts,6);
 ok(await f.call(`/api/bot-center/drafts/${draft.id}/push/retry`,'POST'));assert.equal(delivery(f,draft.id).attempts,0);
 await push.deliverReviewPushes(f.env,{fetchImpl:async()=>new Response('',{status:401})});assert.equal(delivery(f,draft.id).status,'failed');
});

test('lease protection prevents overlapping sends; disabled BOTs are not sent and old technical rows are cleaned',async t=>{
 const f=await setup(t),draft=await f.draft();ok(await f.review(draft.id));let calls=0,release;
 const gate=new Promise(resolve=>release=resolve);
 const fetchImpl=async()=>{calls++;await gate;return new Response('',{status:200})};
 const first=push.deliverReviewPushes(f.env,{fetchImpl});
 // Wait until the actual asynchronous sender reaches its fake network boundary.
 for(let i=0;calls===0&&i<1000;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(calls,1,'fake network boundary must be reached');
 await push.deliverReviewPushes(f.env,{fetchImpl});assert.equal(calls,1);release();await first;
 const paused=await f.draft();ok(await f.review(paused.id));ok(await f.configure({enabled:false}));
 await push.deliverReviewPushes(f.env,{fetchImpl:async()=>{throw Error('disabled BOT must not send')}});assert.equal(delivery(f,paused.id).attempts,0);
 const later=new Date(Date.parse(delivery(f,draft.id).updated_at)+31*86400000).toISOString();await push.cleanupReviewPushes(f.env,later);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_review_push_outbox').get().n,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_drafts').get().n,2);
});

test('rate limits respect bounded Retry-After and a crashed final attempt becomes retryable failure',async t=>{
 const f=await setup(t),draft=await f.draft();ok(await f.review(draft.id));
 const now=delivery(f,draft.id).created_at;
 await push.deliverReviewPushes(f.env,{now,fetchImpl:async()=>new Response('',{status:429,headers:{'retry-after':'1200'}})});
 assert.equal(Date.parse(delivery(f,draft.id).next_attempt_at)-Date.parse(now),1200000);
 f.sql.prepare("UPDATE bot_review_push_outbox SET status='sending',attempts=6,lease_until=?,lease_token='synthetic-crashed' WHERE draft_id=?").run(now,draft.id);
 await push.deliverReviewPushes(f.env,{now,fetchImpl:async()=>{throw Error('exhausted lease must not send')}});
 assert.equal(delivery(f,draft.id).status,'failed');assert.equal(delivery(f,draft.id).last_error_code,'PUSH_LEASE_EXPIRED');
 ok(await f.call(`/api/bot-center/drafts/${draft.id}/push/retry`,'POST'));
 assert.equal(delivery(f,draft.id).attempts,0);
});

test('turning an existing BOT push configuration off and back on keeps encrypted destination and BOT token', async t=>{
 const f=await setup(t);
 const previous=f.sql.prepare("SELECT p.encrypted_target,p.enabled,c.token_hash FROM bot_review_push_settings p JOIN bot_ingest_credentials c ON c.bot_id=p.bot_id JOIN bot_profiles b ON b.id=p.bot_id WHERE b.code='SOCIAL_EDITOR'").get();
 ok(await f.configure({enabled:false}));
 ok(await f.configure({enabled:true}));
 const after=f.sql.prepare("SELECT p.encrypted_target,p.enabled,c.token_hash FROM bot_review_push_settings p JOIN bot_ingest_credentials c ON c.bot_id=p.bot_id JOIN bot_profiles b ON b.id=p.bot_id WHERE b.code='SOCIAL_EDITOR'").get();
 assert.equal(previous.encrypted_target,after.encrypted_target);
 assert.equal(previous.token_hash,after.token_hash);
 assert.equal(after.enabled,1);
});

test('queued notifications for an obsolete revision never leave CYWEB',async t=>{
 const f=await setup(t),draft=await f.draft();await f.review(draft.id);
 const next=ok(await f.call('/api/bot-ingest/drafts','POST',{externalRef:'synthetic-replacement',previousDraftId:draft.id,title:'合成新版',body:'合成新內容'},{authorization:'Bearer '+f.token}));assert.equal(next.revisionNumber,2);
 const original=globalThis.fetch;let calls=0;try{globalThis.fetch=async()=>{calls++;return new Response('',{status:200})};await push.deliverReviewPushes(f.env);assert.equal(calls,0)}finally{globalThis.fetch=original}
});
