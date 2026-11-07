import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['worker/backup/portable-backup.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const backup=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body.data};
const auth=token=>({authorization:'Bearer '+token});
const issue=async(f,code)=>ok(await f.call(`/api/bot-center/bots/${code}/credential`,'POST')).token;

test('forward migration preserves the exact legacy credential for SOCIAL_EDITOR, not whichever BOT has ID 1',async()=>{
 const legacy='synthetic-preserved-editor-credential-000000000';
 const digest=createHash('sha256').update(legacy).digest('hex'),created='2026-11-01T02:03:04.000Z';
 const f=fixture('SUPER_ADMIN',false,{beforeScopedMigration(sql){
  sql.prepare("INSERT INTO bot_profiles(id,code,label,status,summary,updated_at) VALUES(1,'IT','IT','idle','',?)").run(created);
  sql.prepare("INSERT INTO bot_profiles(id,code,label,status,summary,updated_at) VALUES(17,'SOCIAL_EDITOR','社群小編','idle','',?)").run(created);
  sql.prepare('INSERT INTO bot_ingest_credentials(id,token_hash,created_at) VALUES(1,?,?)').run(digest,created);
 }});
 try{
  assert.deepEqual({...f.sql.prepare('SELECT * FROM bot_ingest_credentials').get()},{bot_id:17,token_hash:digest,created_at:created,revoked_at:null,updated_by:null});
  assert.equal(ok(await f.call('/api/bot-ingest/identity','GET',undefined,auth(legacy))).botCode,'SOCIAL_EDITOR');
  assert.equal((await f.call('/api/bot-ingest/progress','POST',{botCode:'IT',status:'working'},auth(legacy))).status,403);
  const it=await issue(f,'IT');
  await issue(f,'IT');
  assert.equal((await f.call('/api/bot-ingest/identity','GET',undefined,auth(it))).status,401);
  ok(await f.call('/api/bot-center/bots/IT/credential','DELETE'));
  assert.equal(ok(await f.call('/api/bot-ingest/progress','POST',{status:'working',summary:'合成進度'},auth(legacy))).code,'SOCIAL_EDITOR');
  assert.equal(f.sql.prepare('SELECT token_hash FROM bot_ingest_credentials WHERE bot_id=17').get().token_hash,digest);
 }finally{f.sql.close()}
});

test('BOT credentials isolate writes and both draft-read paths; rotation and revocation only affect that BOT',async()=>{
 const f=fixture();try{
  const editor=await issue(f,'SOCIAL_EDITOR'),it=await issue(f,'IT');
  const draft=ok(await f.call('/api/bot-ingest/drafts','POST',{title:'合成小編稿件',body:'合成本文',externalRef:'private-editor'},auth(editor)));
  assert.equal((await f.call('/api/bot-ingest/drafts/'+draft.id,'GET',undefined,auth(it))).status,404);
  assert.equal((await f.call('/api/bot-ingest/drafts?botCode=SOCIAL_EDITOR&externalRef=private-editor','GET',undefined,auth(it))).status,403);
  for(const path of ['reports','drafts','progress','completions'])assert.equal((await f.call('/api/bot-ingest/'+path,'POST',{botCode:'SOCIAL_EDITOR',title:'不可冒用',body:'本文',status:'working'},auth(it))).status,403);
  assert.equal((await f.call('/api/bot-center/drafts/'+draft.id+'/review','POST',{decision:'approved'},{...auth(it),cookie:''})).status,401);
  const next=await issue(f,'IT');
  assert.equal((await f.call('/api/bot-ingest/identity','GET',undefined,auth(it))).status,401);
  assert.equal(ok(await f.call('/api/bot-ingest/identity','GET',undefined,auth(next))).botCode,'IT');
  ok(await f.call('/api/bot-center/bots/IT/credential','DELETE'));
  assert.equal((await f.call('/api/bot-ingest/identity','GET',undefined,auth(next))).status,401);
  assert.equal(ok(await f.call('/api/bot-ingest/identity','GET',undefined,auth(editor))).botCode,'SOCIAL_EDITOR');
  const state=ok(await f.call('/api/bot-center'));
  assert.equal(state.credentials.find(row=>row.botCode==='SOCIAL_EDITOR').configured,true);
  assert.equal(state.credentials.find(row=>row.botCode==='IT').configured,false);
  const visible=JSON.stringify(state.credentials);assert.equal(visible.includes(editor),false);assert.equal(visible.includes('token_hash'),false);
  assert.equal((await f.call('/api/bot-center/credentials','POST')).status,404);
 }finally{f.sql.close()}
 const admin=fixture('ADMIN',true);try{assert.equal((await admin.call('/api/bot-center/bots/IT/credential','POST')).status,403)}finally{admin.sql.close()}
});

test('approval stores no reason; rejecting requires a nonblank reason and invalid attempts stay pending',async()=>{
 const f=fixture();try{
  const token=await issue(f,'SOCIAL_EDITOR');
  const create=async title=>ok(await f.call('/api/bot-ingest/drafts','POST',{title,body:'合成本文'},auth(token)));
  const approved=await create('直接通過');
  assert.equal(ok(await f.call(`/api/bot-center/drafts/${approved.id}/review`,'POST',{decision:'approved',reason:'不應保存'})).reason,null);
  const rejected=await create('退回必填');
  for(const reason of [undefined,'','  '])assert.equal((await f.call(`/api/bot-center/drafts/${rejected.id}/review`,'POST',{decision:'rejected',reason})).status,422);
  assert.equal(f.sql.prepare('SELECT review_status FROM bot_drafts WHERE id=?').get(rejected.id).review_status,'pending');
  assert.equal(ok(await f.call(`/api/bot-center/drafts/${rejected.id}/review`,'POST',{decision:'rejected',reason:'  請補充依據  '})).reason,'請補充依據');
 }finally{f.sql.close()}
});

test('typed completed work is idempotent in the server and never counts generic work as a publication',async()=>{
 const f=fixture();try{
  const token=await issue(f,'SOCIAL_EDITOR');
  const send=body=>f.call('/api/bot-ingest/completions','POST',body,auth(token));
  const input={title:'合成發布',detail:'合成平台與結果',workType:'article_published',eventRef:'article-1'};
  const first=ok(await send(input)),repeat=ok(await send(input));assert.equal(first.id,repeat.id);
  assert.equal((await send({...input,title:'改變內容'})).status,409);
  assert.equal((await send({...input,workType:'threads_patrol'})).status,409);
  assert.equal((await send({...input,eventRef:undefined})).status,422);
  assert.equal((await send({...input,eventRef:'arbitration',workType:'arbitration'})).status,422);
  ok(await send({title:'已發布但只是舊版文字，不能猜分類'}));
  ok(await send({title:'合成巡視完成',workType:'threads_patrol',eventRef:'patrol-1'}));
  const page=ok(await f.call('/api/bot-center'));
  assert.equal(page.workSummary.articles.count,1);assert.equal(page.workSummary.patrols.count,1);
  assert.deepEqual(Object.keys(page.workSummary).sort(),['articles','patrols','pending']);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_completions').get().n,3);
 }finally{f.sql.close()}
});

test('work cards use complete scoped Taipei-day counts beyond pagination; pending includes previous days',async()=>{
 const f=fixture();try{
  ok(await f.call('/api/bot-center'));
  const editor=f.sql.prepare("SELECT id FROM bot_profiles WHERE code='SOCIAL_EDITOR'").get().id,it=f.sql.prepare("SELECT id FROM bot_profiles WHERE code='IT'").get().id;
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const start=new Date(day+'T00:00:00+08:00').toISOString(),end=new Date(Date.parse(start)+86400000).toISOString();
  const insert=f.sql.prepare('INSERT INTO bot_completions(bot_id,title,detail,completed_at,work_type,event_ref) VALUES(?,?,?,?,?,?)');
  for(let i=0;i<61;i++)insert.run(editor,'合成文章'+i,'合成摘要',start,'article_published','article-'+i);
  insert.run(editor,'昨天文章','',new Date(Date.parse(start)-1).toISOString(),'article_published','yesterday');
  insert.run(editor,'明天文章','',end,'article_published','tomorrow');
  insert.run(it,'IT合成文章','',start,'article_published','article-0');
  insert.run(editor,'合成巡視','',start,'threads_patrol','patrol-1');
  f.sql.prepare("INSERT INTO bot_drafts(bot_id,title,body,created_at) VALUES(?,'舊日待審','合成本文','2020-01-01T00:00:00.000Z')").run(editor);
  const all=ok(await f.call('/api/bot-center?draftStatus=approved'));
  assert.equal(all.workSummary.articles.count,62);assert.equal(all.workSummary.pending.count,1);assert.equal(all.workSummary.pending.latest.title,'舊日待審');
  const scoped=ok(await f.call('/api/bot-center?botCode=SOCIAL_EDITOR'));
  assert.equal(scoped.workSummary.articles.count,61);assert.equal(scoped.workSummary.articles.latest.title,'合成文章60');assert.equal(scoped.workSummary.patrols.count,1);
  assert.equal(scoped.timeline.length,50);
  assert.ok(f.sql.prepare("EXPLAIN QUERY PLAN SELECT id FROM bot_completions WHERE work_type='article_published' AND completed_at>=? AND completed_at<? ORDER BY completed_at DESC,id DESC LIMIT 1").all(start,end).some(row=>row.detail.includes('idx_bot_completions_work_day')));
 }finally{f.sql.close()}
});

test('portable backup retains work classifications and event IDs but excludes every BOT credential',async()=>{
 const source=fixture(),target=fixture('SUPER_ADMIN',false,{seedMember:false});try{
  const token=await issue(source,'SOCIAL_EDITOR');
  ok(await source.call('/api/bot-ingest/completions','POST',{title:'合成發布',detail:'合成平台',eventRef:'backup-article',workType:'article_published'},auth(token)));
  const saved=await backup.exportPortableBackup(source.db,{workspaceScope:'synthetic',appVersion:'0.12.3'});
  const text=new TextDecoder().decode(saved.dataBytes),snapshot=JSON.parse(text);
  assert.equal(text.includes(token),false);assert.equal('bot_ingest_credentials' in snapshot.tables,false);
  assert.equal(await backup.isEmptyRecoveryTarget(target.db),true);
  await backup.restoreIntoEmptyDatabase(target.db,saved,'synthetic');
  assert.deepEqual(target.sql.prepare('SELECT * FROM bot_completions').all(),source.sql.prepare('SELECT * FROM bot_completions').all());
  assert.equal(target.sql.prepare('SELECT count(*) n FROM bot_ingest_credentials').get().n,0);
  assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close();target.sql.close()}
});
