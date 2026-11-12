import test from 'node:test';
import assert from 'node:assert/strict';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';
import {build} from 'esbuild';
const packed=await build({entryPoints:['worker/backup/portable-backup.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const backup=await import('data:text/javascript;base64,'+Buffer.from(packed.outputFiles[0].text).toString('base64'));
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
async function setup(t){const f=fixture();t.after(()=>f.sql.close());const token=ok(await f.call('/api/bot-center/bots/SOCIAL_EDITOR/credential','POST')).token;const auth={authorization:'Bearer '+token};return {...f,auth,submit:(externalRef,previousDraftId)=>f.call('/api/bot-ingest/drafts','POST',{externalRef,previousDraftId,title:'合成稿',body:'合成內容',kind:'post',items:[{title:'合成貼文',body:'本文'}]},auth)}}
test('revisions replace only the current list entry; immutable history, fresh review and ownership',async t=>{
 const f=await setup(t),a=ok(await f.submit('synthetic-r1'));
 ok(await f.call(`/api/bot-center/drafts/${a.id}/review`,'POST',{decision:'rejected',reason:'合成修改'}));
 const b=ok(await f.submit('synthetic-r2',a.id));assert.equal(b.revisionNumber,2);assert.equal(b.previousDraftId,a.id);assert.equal(b.status,'pending');
 const old=ok(await f.call(`/api/bot-center/drafts/${a.id}`));assert.equal(old.draft.supersededById,b.id);assert.equal(old.items[0].reason,'合成修改');
 assert.equal(ok(await f.submit('synthetic-r2',a.id)).id,b.id);
 assert.equal((await f.submit('synthetic-fork',a.id)).status,409);
 assert.equal((await f.call(`/api/bot-center/drafts/${a.id}/review`,'POST',{decision:'approved'})).status,409);
 assert.equal((await f.call(`/api/bot-ingest/drafts/${a.id}/sent`,'POST',{items:[1]},f.auth)).status,409);
 const c=ok(await f.submit('synthetic-r3',b.id));assert.equal(c.revisionNumber,3);
 const page=ok(await f.call('/api/bot-center?draftStatus=all'));assert.deepEqual(page.drafts.map(d=>d.id),[c.id]);assert.equal(page.draftCounts.pending,1);assert.equal(page.draftCounts.rejected,0);assert.equal(page.workSummary.pending.posts,1);
 const token=ok(await f.call('/api/bot-center/bots/FINANCE/credential','POST')).token;
 assert.equal((await f.call('/api/bot-ingest/drafts','POST',{previousDraftId:c.id,externalRef:'foreign',title:'合成',body:'x'},{authorization:'Bearer '+token})).status,404);
});
test('concurrent replacement has one winner and no orphan items; sent drafts cannot be replaced',async t=>{
 const f=await setup(t),a=ok(await f.submit('same-base'));
 const results=await Promise.all([f.submit('same-a',a.id),f.submit('same-b',a.id)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_drafts').get().n,2);assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_draft_items').get().n,2);
 const winner=results.find(r=>r.status===200).body.data;
 ok(await f.call(`/api/bot-center/drafts/${winner.id}/review`,'POST',{decision:'approved'}));ok(await f.call(`/api/bot-ingest/drafts/${winner.id}/sent`,'POST',{items:[1]},f.auth));
 assert.equal((await f.submit('after-publish',winner.id)).status,409);
});
test('superseding between pending read and review write cannot approve obsolete content',async t=>{
 const f=await setup(t),a=ok(await f.submit('race-a'));const batch=f.db.batch.bind(f.db);let injected=false;
 f.db.batch=async statements=>{if(!injected){injected=true;ok(await f.submit('race-b',a.id))}return batch(statements)};
 assert.equal((await f.call(`/api/bot-center/drafts/${a.id}/review`,'POST',{decision:'approved'})).status,409);
 assert.equal(f.sql.prepare('SELECT review_status FROM bot_drafts WHERE id=?').get(a.id).review_status,'pending');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM audit_events WHERE entity_type=\'bot_draft\'').get().n,0);
});
test('portable backups preserve linked revisions while excluding integration secrets and purge queue',async t=>{
 const f=await setup(t),target=fixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>target.sql.close());
 const a=ok(await f.submit('backup-1'));ok(await f.submit('backup-2',a.id));
 f.sql.prepare('INSERT INTO bot_review_image_deletions VALUES(?)').run('synthetic/deleted.png');
 const saved=await backup.exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.18.12'});
 const data=JSON.parse(new TextDecoder().decode(saved.dataBytes));assert.equal('bot_review_image_deletions' in data.tables,false);assert.equal('bot_ingest_credentials' in data.tables,false);
 await backup.restoreIntoEmptyDatabase(target.db,saved,'synthetic');assert.deepEqual(target.sql.prepare('SELECT id,previous_draft_id,revision_number FROM bot_drafts ORDER BY id').all(),f.sql.prepare('SELECT id,previous_draft_id,revision_number FROM bot_drafts ORDER BY id').all());assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('0068 purges IT business rows and secrets, queues its images and leaves editor credential unchanged',async t=>{
 const at='2026-11-01T00:00:00.000Z';
 const f=fixture('SUPER_ADMIN',false,{beforeRevisionMigration(sql){
  sql.prepare("INSERT INTO bot_profiles(id,code,label,updated_at) VALUES(71,'IT','IT',?),(72,'SOCIAL_EDITOR','社群小編',?)").run(at,at);
  sql.prepare('INSERT INTO bot_ingest_credentials(bot_id,token_hash,created_at) VALUES(71,?,?),(72,?,?)').run('a'.repeat(64),at,'b'.repeat(64),at);
  sql.prepare("INSERT INTO bot_drafts(id,bot_id,title,body,created_at) VALUES(81,71,'合成舊稿','舊內容',?)").run(at);
  sql.prepare("INSERT INTO bot_draft_items(id,draft_id,seq,title,body) VALUES(91,81,1,'合成舊則','x')").run();
  sql.prepare("INSERT INTO bot_review_images(draft_id,item_id,object_key,content_type,bytes,created_at) VALUES(81,91,'synthetic/it.png','image/png',12,?)").run(at);
  sql.prepare("INSERT INTO bot_reports(bot_id,title,body,reported_at) VALUES(71,'合成舊報','x',?)").run(at);
  sql.prepare("INSERT INTO bot_completions(bot_id,title,completed_at) VALUES(71,'合成舊完成',?)").run(at);
  sql.prepare("INSERT INTO bot_review_push_settings(bot_id,enabled,encrypted_target,updated_at) VALUES(71,1,'synthetic-old-target',?)").run(at);
  sql.prepare('INSERT INTO bot_review_push_outbox(draft_id,next_attempt_at,created_at,updated_at) VALUES(81,?,?,?)').run(at,at,at);
 }});t.after(()=>f.sql.close());
 for(const table of ['bot_drafts','bot_draft_items','bot_review_images','bot_reports','bot_completions','bot_review_push_settings','bot_review_push_outbox'])assert.equal(f.sql.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_profiles WHERE code='IT'").get().n,0);
 assert.equal(f.sql.prepare('SELECT token_hash FROM bot_ingest_credentials WHERE bot_id=72').get().token_hash,'b'.repeat(64));
 let fail=true;const deleted=[];f.env.HR_FILES={async delete(keys){if(fail)throw Error('synthetic storage error');deleted.push(...keys)}};
 await assert.rejects(()=>f.cleanupReviewImages(f.env,at));assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_review_image_deletions').get().n,1);
 fail=false;await f.cleanupReviewImages(f.env,at);assert.deepEqual(deleted,['synthetic/it.png']);assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_review_image_deletions').get().n,0);
 const state=ok(await f.call('/api/bot-center'));assert.equal(state.credentials.find(c=>c.botCode==='FINANCE').configured,false);assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('superseded pending images clear the following day while the latest pending images remain',async t=>{
 const f=await setup(t),a=ok(await f.submit('image-old'));
 const objects=new Map();f.env.HR_FILES={async put(k,v){objects.set(k,v)},async delete(keys){for(const k of [].concat(keys))objects.delete(k)}};
 const png=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
 const upload=async id=>{const r=await f.raw(`/api/bot-ingest/drafts/${id}/images?item=1`,'POST',png,{...f.auth,'content-type':'image/png'});assert.equal(r.status,200)};
 await upload(a.id);const b=ok(await f.submit('image-new',a.id));await upload(b.id);
 await f.cleanupReviewImages(f.env,new Date(Date.now()+36*3600_000).toISOString());assert.equal(objects.size,1);assert.deepEqual(f.sql.prepare('SELECT draft_id FROM bot_review_images').all().map(x=>x.draft_id),[b.id]);
});
