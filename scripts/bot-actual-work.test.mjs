import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
async function setup(t){const f=fixture();t.after(()=>f.sql.close());const token=ok(await f.call('/api/bot-center/bots/SOCIAL_EDITOR/credential','POST')).token;return {...f,auth:{authorization:'Bearer '+token}}}
const receipt=(eventRef,extra={})=>({eventRef,kind:'post',title:'合成已發布貼文',body:'合成發布全文',approvalSource:'chat',approvalNote:'已在外部核准',platform:'IG',url:'https://example.invalid/post/'+eventRef,...extra});
test('concurrent conflicting receipts have one winner; loser cannot resolve another pending draft',async t=>{
 const f=await setup(t),drafts=[];
 for(const title of ['合成甲','合成乙'])drafts.push(ok(await f.call('/api/bot-ingest/drafts','POST',{title,body:'x'},f.auth)));
 const batch=f.db.batch.bind(f.db);let arrivals=0,release;const ready=new Promise(r=>release=r);
 f.db.batch=async statements=>{if(++arrivals===2)release();await ready;return batch(statements)};
 const results=await Promise.all(drafts.map(d=>f.call('/api/bot-ingest/deliveries','POST',receipt('same-receipt',{draftId:d.id}),f.auth)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=f.sql.prepare('SELECT draft_id FROM bot_deliveries').get();assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_deliveries').get().n,1);
 for(const d of drafts)assert.equal(ok(await f.call('/api/bot-center/drafts/'+d.id)).draft.status,d.id===saved.draft_id?'external':'pending');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_completions').get().n,1);
});
test('legacy sent can be linked to a named session without increasing the count',async t=>{
 const f=await setup(t),d=ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成巡視',body:'說明',kind:'patrol',items:[{title:'合成回覆',body:'合成全文'}]},f.auth));
 ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved'}));
 ok(await f.call(`/api/bot-ingest/drafts/${d.id}/sent`,'POST',{items:[1]},f.auth));
 const before=ok(await f.call('/api/bot-center')).workSummary.patrols.sentToday;
 ok(await f.call('/api/bot-ingest/patrol-sessions','POST',{sessionRef:'legacy-noon',label:'午巡'},f.auth));
 const input={eventRef:'old-work-fixed-id',kind:'patrol',approvalSource:'cyweb',draftId:d.id,itemSeq:1,sessionRef:'legacy-noon'};
 const a=ok(await f.call('/api/bot-ingest/deliveries','POST',input,f.auth));assert.equal(ok(await f.call('/api/bot-ingest/deliveries','POST',input,f.auth)).id,a.id);
 const state=ok(await f.call('/api/bot-center'));assert.equal(state.workSummary.patrols.sentToday,before);assert.deepEqual(state.workSummary.patrols.sessions.map(x=>[x.label,x.sent]),[['午巡',1]]);
});
test('portable restore retains receipts and sessions; an older snapshot rebuilds sent-item receipts',async t=>{
 const compiled=await build({entryPoints:['worker/backup/portable-backup.ts'],bundle:true,write:false,platform:'node',format:'esm'});
 const backup=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const f=await setup(t),target=fixture('SUPER_ADMIN',false,{seedMember:false}),older=fixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>{target.sql.close();older.sql.close()});
 const d=ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成貼文',body:'說明',kind:'post',items:[{title:'合成',body:'全文'}]},f.auth));
 ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved'}));ok(await f.call(`/api/bot-ingest/drafts/${d.id}/sent`,'POST',{items:[1]},f.auth));
 ok(await f.call('/api/bot-ingest/patrol-sessions','POST',{sessionRef:'backup-noon',label:'午巡'},f.auth));
 const saved=await backup.exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.18.14'});
 const data=JSON.parse(new TextDecoder().decode(saved.dataBytes));assert.equal('bot_delivery_images' in data.tables,false);assert.equal('bot_ingest_credentials' in data.tables,false);
 await backup.restoreIntoEmptyDatabase(target.db,saved,'synthetic');for(const name of ['bot_deliveries','bot_patrol_sessions'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+name).all(),f.sql.prepare('SELECT * FROM '+name).all());
 delete data.tables.bot_deliveries;delete data.tables.bot_patrol_sessions;
 for(const name of ['bot_drafts','bot_draft_items']){const at=data.tables[name].columns.indexOf('externally_completed_at');data.tables[name].columns.splice(at,1);for(const row of data.tables[name].rows)row.splice(at,1)}
 const dataBytes=new TextEncoder().encode(JSON.stringify(data)),manifest=JSON.parse(new TextDecoder().decode(saved.manifestBytes));manifest.schemaMigration='0068_bot_revisions';manifest.dataByteLength=dataBytes.length;manifest.dataSha256=createHash('sha256').update(dataBytes).digest('hex');manifest.recordCounts=Object.fromEntries(Object.entries(data.tables).map(([key,value])=>[key,value.rows.length]));manifest.totalRecordCount=Object.values(manifest.recordCounts).reduce((a,b)=>a+b,0);
 await backup.restoreIntoEmptyDatabase(older.db,{dataBytes,manifestBytes:new TextEncoder().encode(JSON.stringify(manifest))},'synthetic');assert.equal(older.sql.prepare('SELECT count(*) n FROM bot_deliveries').get().n,1);assert.equal(older.sql.prepare('SELECT body FROM bot_deliveries').get().body,'全文');assert.deepEqual(older.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('external publications are directly readable and share a count/list source; duplicate receipt cannot count twice',async t=>{
 const f=await setup(t),input=receipt('actual-a');const a=ok(await f.call('/api/bot-ingest/deliveries','POST',input,f.auth));
 assert.equal(ok(await f.call('/api/bot-ingest/deliveries','POST',input,f.auth)).id,a.id);
 const state=ok(await f.call('/api/bot-center'));assert.equal(state.workSummary.articles.count,1);assert.equal(state.workSummary.articles.published.items[0].id,a.id);assert.equal(state.draftCounts.pending,0);
 const full=ok(await f.call('/api/bot-center/deliveries/'+a.id));assert.equal(full.item.body,input.body);assert.equal(full.item.approvalSource,'chat');assert.equal(full.item.url,input.url);assert.equal(full.item.draftId,null);
 assert.equal(ok(await f.call('/api/bot-ingest/deliveries?eventRef=actual-a','GET',undefined,f.auth)).item.id,a.id);
 assert.equal((await f.call('/api/bot-ingest/deliveries','POST',{...input,body:'different'},f.auth)).status,409);
 assert.equal((await f.call('/api/bot-ingest/deliveries','POST',{...input,eventRef:'duplicate-url'},f.auth)).status,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_completions').get().n,1);
});
test('outside approvals resolve only linked pending work, preserve original review and lock further human review',async t=>{
 const f=await setup(t),draft=ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成補登',body:'送審說明',kind:'patrol',items:[{title:'一',body:'一全文'},{title:'二',body:'二全文'}]},f.auth));
 ok(await f.call('/api/bot-ingest/patrol-sessions','POST',{sessionRef:'noon',label:'午巡'},f.auth));
 const first=receipt('reply-a',{kind:'patrol',draftId:draft.id,itemSeq:1,sessionRef:'noon',approvalSource:'line'});
 ok(await f.call('/api/bot-ingest/deliveries','POST',first,f.auth));
 let state=ok(await f.call('/api/bot-center'));assert.equal(state.workSummary.pending.patrols,1);assert.equal(state.draftCounts.pending,1);
 const detail=ok(await f.call('/api/bot-center/drafts/'+draft.id));assert.equal(detail.draft.itemCounts.external,1);assert.equal(detail.items[0].status,'external');assert.equal(detail.items[1].status,'pending');
 assert.equal((await f.call(`/api/bot-center/drafts/${draft.id}/items/1/review`,'POST',{decision:'approved'})).status,409);
 ok(await f.call('/api/bot-ingest/deliveries','POST',receipt('reply-b',{kind:'patrol',draftId:draft.id,itemSeq:2,sessionRef:'noon',approvalSource:'line'}),f.auth));
 state=ok(await f.call('/api/bot-center'));assert.equal(state.draftCounts.pending,0);assert.equal(state.draftCounts.external,1);assert.equal(state.workSummary.patrols.sentToday,2);assert.deepEqual(state.workSummary.patrols.sessions.map(x=>[x.label,x.sent]),[['午巡',2]]);
 assert.equal(f.sql.prepare('SELECT review_status,reviewed_at FROM bot_drafts WHERE id=?').get(draft.id).review_status,'pending');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action LIKE 'bot_draft.%'").get().n,0);
 assert.equal((await f.call(`/api/bot-center/drafts/${draft.id}/review`,'POST',{decision:'approved'})).status,409);
 assert.equal((await f.call('/api/bot-ingest/drafts','POST',{title:'覆蓋',body:'x',previousDraftId:draft.id,externalRef:'new',kind:'patrol',items:[{title:'x',body:'x'}]},f.auth)).status,409);
});
test('session summaries merge updates, have short notes, never infer names from completion text',async t=>{
 const f=await setup(t);const session={sessionRef:'same-noon',label:'午巡',note:'合成需要處理的摘要'};
 const a=ok(await f.call('/api/bot-ingest/patrol-sessions','POST',session,f.auth));
 ok(await f.call('/api/bot-ingest/deliveries','POST',receipt('patrol-a',{kind:'patrol',sessionRef:session.sessionRef}),f.auth));
 ok(await f.call('/api/bot-ingest/deliveries','POST',receipt('patrol-b',{kind:'patrol',sessionRef:session.sessionRef}),f.auth));
 assert.equal(ok(await f.call('/api/bot-ingest/patrol-sessions','POST',{...session,note:''},f.auth)).id,a.id);
 const state=ok(await f.call('/api/bot-center'));assert.equal(state.workSummary.patrols.sessions.length,1);assert.equal(state.workSummary.patrols.sessions[0].sent,2);assert.equal(state.workSummary.patrols.sessions[0].note,'');
 assert.equal((await f.call('/api/bot-ingest/patrol-sessions','POST',{...session,note:'字'.repeat(41)},f.auth)).status,422);
 assert.equal((await f.call('/api/bot-ingest/patrol-sessions','POST',{...session,day:'2026-02-30'},f.auth)).status,422);
});
test('source, ownership, per-item approval and invalid dates are enforced by server',async t=>{
 const f=await setup(t);for(const extra of [{approvalSource:'cyweb'},{approvalNote:''},{sentAt:'2026-02-30T00:00:00Z'},{url:'javascript:alert(1)'},{kind:'patrol',sessionRef:'missing'}])assert.notEqual((await f.call('/api/bot-ingest/deliveries','POST',receipt('bad',extra),f.auth)).status,200);
 const draft=ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成',body:'說明',kind:'post',items:[{title:'一',body:'一全文'},{title:'二',body:'二全文'}]},f.auth));
 ok(await f.call(`/api/bot-center/drafts/${draft.id}/items/1/review`,'POST',{decision:'approved'}));
 const sent={eventRef:'partial',kind:'post',approvalSource:'cyweb',draftId:draft.id,itemSeq:1};
 const a=ok(await f.call('/api/bot-ingest/deliveries','POST',sent,f.auth));assert.equal(ok(await f.call('/api/bot-center/deliveries/'+a.id)).item.body,'一全文');
 assert.equal((await f.call('/api/bot-ingest/deliveries','POST',{...sent,eventRef:'pending',itemSeq:2},f.auth)).status,409);
 assert.equal((await f.call('/api/bot-ingest/deliveries','POST',{...sent,body:'偷偷改稿'},f.auth)).status,422);
 const other=ok(await f.call('/api/bot-center/bots/FINANCE/credential','POST')).token,auth={authorization:'Bearer '+other};
 assert.equal((await f.call('/api/bot-ingest/deliveries','POST',sent,auth)).status,404);
 assert.equal((await f.call('/api/bot-ingest/deliveries?eventRef=partial','GET',undefined,auth)).status,404);
 assert.equal((await f.call('/api/bot-center/deliveries/'+a.id,'GET',undefined,{cookie:''})).status,401);
 const denied=fixture('USER');t.after(()=>denied.sql.close());assert.equal((await denied.call('/api/bot-center/deliveries/'+a.id)).status,403);
});
test('actual receipt plus pending resolution roll back if completion insert fails',async t=>{
 const f=await setup(t),draft=ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成',body:'x'},f.auth));
 f.sql.exec("CREATE TRIGGER fail_completion BEFORE INSERT ON bot_completions BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 assert.equal((await f.call('/api/bot-ingest/deliveries','POST',receipt('rollback',{draftId:draft.id}),f.auth)).status,500);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_deliveries').get().n,0);assert.equal(ok(await f.call('/api/bot-center/drafts/'+draft.id)).draft.status,'pending');
});
test('new images reuse safe authenticated storage, hash retries and ten-image ceiling; next-day cleanup',async t=>{
 const f=await setup(t),objects=new Map();f.env.HR_FILES={put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{body:objects.get(k)}:null,delete:async ks=>{for(const k of Array.isArray(ks)?ks:[ks])objects.delete(k)}};
 const a=ok(await f.call('/api/bot-ingest/deliveries','POST',receipt('media'),f.auth));
 for(let i=0;i<10;i++){
  const bytes=new Uint8Array([137,80,78,71,i]),ref=createHash('sha256').update(bytes).digest('hex'),path=`/api/bot-ingest/deliveries/${a.id}/images?uploadRef=${ref}`;
  for(let j=0;j<2;j++){const r=await f.raw(path,'POST',bytes,{...f.auth,'content-type':'image/png'});assert.equal(r.status,200,await r.text())}
 }
 assert.equal(objects.size,10);assert.equal(ok(await f.call('/api/bot-center/deliveries/'+a.id)).images.length,10);
 const bytes=new Uint8Array([137,80,78,71,99]),ref=createHash('sha256').update(bytes).digest('hex');assert.equal((await f.raw(`/api/bot-ingest/deliveries/${a.id}/images?uploadRef=${ref}`,'POST',bytes,{...f.auth,'content-type':'image/png'})).status,409);
 assert.equal(objects.size,10);assert.equal(await f.cleanupReviewImages(f.env,new Date(Date.now()+86400000).toISOString()),10);assert.equal(objects.size,0);
});
