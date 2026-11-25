// V0.22.0: 拍板事項、平台選項、巡視場次狀態、備份。
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {botCenterFixture as fixture} from './test-support/bot-center-fixture.mjs';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
async function setup(t){const f=fixture();t.after(()=>f.sql.close());const token=ok(await f.call('/api/bot-center/bots/SOCIAL_EDITOR/credential','POST')).token;
 const auth={authorization:'Bearer '+token};
 return {...f,auth,ingest:(path,method='POST',json)=>f.call('/api/bot-ingest/'+path,method,json,auth),
  decide:async(extra={},ref='d-'+Math.random().toString(36).slice(2))=>ok(await f.call('/api/bot-ingest/drafts','POST',{externalRef:ref,title:'合成拍板 '+ref,body:'合成說明',decision:{category:'廣告預算',amount:300000,options:['加碼三天','加碼兩天'],...extra},},auth))}}
const future=(hours=24)=>new Date(Date.now()+hours*3600000).toISOString();
const past=()=>new Date(Date.now()-3600000).toISOString();

test('a decision is submitted with category, amount, deadline and options, and read back by id and by externalRef',async t=>{
 const f=await setup(t),deadline=future(),d=await f.decide({deadline},'dec-1');
 assert.equal(d.kind,'general');assert.equal(d.itemCounts,null);
 assert.deepEqual(d.decision,{category:'廣告預算',amount:300000,deadline,options:['加碼三天','加碼兩天'],chosenOption:null,expired:false});
 assert.deepEqual(ok(await f.ingest('drafts/'+d.id,'GET')).decision,d.decision);
 assert.deepEqual(ok(await f.call('/api/bot-ingest/drafts?externalRef=dec-1','GET',undefined,f.auth)).decision,d.decision);
 const plain=ok(await f.ingest('drafts','POST',{externalRef:'plain',title:'一般稿',body:'x'}));assert.equal(plain.decision,null);
 const minimal=ok(await f.ingest('drafts','POST',{externalRef:'min',title:'最少',body:'x',decision:{category:'其他'}}));
 assert.deepEqual(minimal.decision,{category:'其他',amount:null,deadline:null,options:null,chosenOption:null,expired:false});
});
test('decision input is validated on the server',async t=>{
 const f=await setup(t);
 const bad=async(decision,extra={})=>{const r=await f.ingest('drafts','POST',{externalRef:'bad-'+Math.random(),title:'壞',body:'x',decision,...extra});assert.equal(r.status,400,JSON.stringify([decision,r.body]))};
 for(const decision of ['x',[],{},{category:''},{category:'  '},{category:'字'.repeat(21)},{category:5},{category:'甲',extra:1},
  {category:'甲',amount:-1},{category:'甲',amount:1.5},{category:'甲',amount:'5'},{category:'甲',amount:Number.MAX_SAFE_INTEGER+2},
  {category:'甲',deadline:'明天'},{category:'甲',deadline:'2026-02-30T00:00:00.000Z'},{category:'甲',deadline:'2026-11-19T10:00:00+08:00'},
  {category:'甲',options:['只有一個']},{category:'甲',options:['a','b','c','d','e','f']},{category:'甲',options:['a','']},{category:'甲',options:['a','字'.repeat(81)]},{category:'甲',options:['a','a']},{category:'甲',options:'a,b'},{category:'甲',options:[1,2]}])await bad(decision);
 await bad({category:'甲'},{items:[{title:'一',body:'x'}],kind:'post'});
 await bad({category:'甲'},{kind:'patrol'});
 const exact=ok(await f.ingest('drafts','POST',{externalRef:'edge',title:'邊界',body:'x',decision:{category:'字'.repeat(20),amount:0,options:['字'.repeat(80),'b','c','d','e']}}));
 assert.equal(exact.decision.amount,0);assert.equal(exact.decision.options.length,5);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_draft_decisions').get().n,1,'failed submissions left no draft or decision behind');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_drafts WHERE external_ref LIKE 'bad-%'").get().n,0);
});
test('resubmitting the same externalRef returns the original decision without a second row',async t=>{
 const f=await setup(t),a=await f.decide({},'same'),b=await f.decide({category:'別的',options:['x','y']},'same');
 assert.equal(a.id,b.id);assert.equal(b.decision.category,'廣告預算');assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_draft_decisions').get().n,1);
});
test('a revision of a decision must carry a decision; a plain draft cannot become one',async t=>{
 const f=await setup(t),a=await f.decide({},'rev-1');
 const noDecision=await f.ingest('drafts','POST',{externalRef:'rev-2',title:'新版',body:'x',previousDraftId:a.id});assert.equal(noDecision.status,400);assert.equal(noDecision.body.error.code,'BOT_INVALID');
 const b=ok(await f.ingest('drafts','POST',{externalRef:'rev-2',title:'新版',body:'改過',previousDraftId:a.id,decision:{category:'廣告預算',amount:200000,options:['只加兩天','不加碼']}}));
 assert.equal(b.revisionNumber,2);assert.equal(b.previousDraftId,a.id);assert.equal(b.decision.amount,200000);assert.deepEqual(b.decision.options,['只加兩天','不加碼']);
 assert.equal(ok(await f.call('/api/bot-center/drafts/'+a.id)).draft.supersededById,b.id);
 assert.equal(ok(await f.ingest('drafts','POST',{externalRef:'rev-2',title:'新版',body:'改過',previousDraftId:a.id,decision:{category:'廣告預算'}})).id,b.id,'idempotent replay');
 const plain=ok(await f.ingest('drafts','POST',{externalRef:'plain-1',title:'一般',body:'x'}));
 const up=await f.ingest('drafts','POST',{externalRef:'plain-2',title:'一般',body:'y',previousDraftId:plain.id,decision:{category:'甲'}});assert.equal(up.status,409);
 const page=ok(await f.call('/api/bot-center'));assert.equal(page.drafts.filter(x=>x.decision).length,1,'only the latest version is listed');
});
test('approving a decision with options requires a valid choice; rejecting requires a note; the choice is stored',async t=>{
 const f=await setup(t),a=await f.decide({},'choice-a'),review=(id,body)=>f.call(`/api/bot-center/drafts/${id}/review`,'POST',body);
 assert.equal((await review(a.id,{decision:'approved'})).status,422);
 for(const choice of [-1,2,0.5,'0',null])assert.equal((await review(a.id,{decision:'approved',choice})).status,422,String(choice));
 assert.equal((await review(a.id,{decision:'rejected'})).status,422);
 assert.equal(ok(await f.call('/api/bot-ingest/drafts/'+a.id,'GET',undefined,f.auth)).status,'pending');
 const done=ok(await review(a.id,{decision:'approved',choice:1}));assert.equal(done.status,'approved');assert.equal(done.decision.chosenOption,1);
 assert.equal(ok(await f.ingest('drafts/'+a.id,'GET')).decision.chosenOption,1);
 assert.equal((await review(a.id,{decision:'approved',choice:0})).status,409);
 const b=await f.decide({},'choice-b'),rejected=ok(await review(b.id,{decision:'rejected',reason:'預算不足',choice:1}));
 assert.equal(rejected.status,'rejected');assert.equal(rejected.reason,'預算不足');assert.equal(rejected.decision.chosenOption,null,'a rejection records no option');
 const c=await f.decide({options:undefined},'choice-c'),plain=ok(await review(c.id,{decision:'approved'}));assert.equal(plain.decision.chosenOption,null);assert.equal(plain.status,'approved');
 const audit=f.sql.prepare("SELECT after_json FROM audit_events WHERE entity_type='bot_draft' AND entity_key=? AND action='bot_draft.approved'").get(String(a.id));
 assert.match(String(audit?.after_json),/加碼兩天/);
});
test('a decision past its deadline cannot be decided; the BOT reads expired:true',async t=>{
 const f=await setup(t),a=await f.decide({deadline:past()},'late');
 assert.equal(a.decision.expired,true);
 for(const body of [{decision:'approved',choice:0},{decision:'rejected',reason:'晚了'}]){
  const r=await f.call(`/api/bot-center/drafts/${a.id}/review`,'POST',body);assert.equal(r.status,409);assert.equal(r.body.error.code,'BOT_DECISION_EXPIRED');
 }
 const read=ok(await f.ingest('drafts/'+a.id,'GET'));assert.equal(read.status,'pending');assert.equal(read.decision.expired,true);
 const row=ok(await f.call('/api/bot-center')).drafts.find(x=>x.id===a.id);assert.equal(row.decision.expired,true);
 const decided=await f.decide({deadline:future(1)},'early');ok(await f.call(`/api/bot-center/drafts/${decided.id}/review`,'POST',{decision:'approved',choice:0}));
 f.sql.prepare("UPDATE bot_draft_decisions SET deadline_at=? WHERE draft_id=?").run(past(),decided.id);
 assert.equal(ok(await f.ingest('drafts/'+decided.id,'GET')).decision.expired,false,'a decision made in time never becomes expired');
});
test('pending view lists decisions first by deadline (none last); the pending cards count content and decisions apart',async t=>{
 const f=await setup(t);
 const post=ok(await f.ingest('drafts','POST',{externalRef:'post',title:'貼文',body:'x',kind:'post',items:[{title:'一',body:'x'},{title:'二',body:'y'}]}));
 const patrol=ok(await f.ingest('drafts','POST',{externalRef:'patrol',title:'巡視',body:'x',kind:'patrol',items:[{title:'一',body:'x'},{title:'二',body:'y'},{title:'三',body:'z'}]}));
 const general=ok(await f.ingest('drafts','POST',{externalRef:'gen',title:'其他稿',body:'x'}));
 const none=await f.decide({},'none'),later=await f.decide({deadline:future(48)},'later'),soon=await f.decide({deadline:future(2)},'soon'),expired=await f.decide({deadline:past()},'expired');
 const state=ok(await f.call('/api/bot-center'));
 assert.deepEqual(state.drafts.map(d=>d.id),[expired.id,soon.id,later.id,none.id,general.id,patrol.id,post.id]);
 assert.deepEqual(state.workSummary.pending,{count:3,posts:1,patrolDrafts:1,patrolItems:3,other:1});
 assert.deepEqual(state.workSummary.decisions.items.map(x=>x.id),[soon.id,later.id,none.id]);
 assert.equal(state.workSummary.decisions.count,3,'the expired decision is not waiting for you');
 assert.deepEqual(Object.keys(state.workSummary.decisions.items[0]).sort(),['deadline','id','title']);
 assert.equal(state.draftCounts.pending,7);
 const scoped=ok(await f.call('/api/bot-center?botCode=FINANCE'));assert.deepEqual(scoped.workSummary.pending,{count:0,posts:0,patrolDrafts:0,patrolItems:0,other:0});assert.equal(scoped.workSummary.decisions.count,0);
 const all=ok(await f.call('/api/bot-center?draftStatus=all'));assert.deepEqual(all.drafts.map(d=>d.id),[expired.id,soon.id,later.id,none.id,general.id,patrol.id,post.id].sort((a,b)=>b-a),'other views keep id order');
 ok(await f.call(`/api/bot-center/drafts/${soon.id}/review`,'POST',{decision:'rejected',reason:'不要'}));
 const after=ok(await f.call('/api/bot-center'));assert.equal(after.workSummary.decisions.count,2);assert.equal(after.workSummary.decisions.items.length,2);
});
test('decision rows come first only on the first page; later pages continue the content list without gaps',async t=>{
 const f=await setup(t),content=[];
 for(let i=0;i<55;i++)content.push(ok(await f.ingest('drafts','POST',{externalRef:'c'+i,title:'稿 '+i,body:'x'})).id);
 const d1=await f.decide({deadline:future(5)},'p1'),d2=await f.decide({},'p2');
 const first=ok(await f.call('/api/bot-center'));
 assert.equal(first.drafts.length,52);assert.deepEqual(first.drafts.slice(0,2).map(d=>d.id),[d1.id,d2.id]);assert.equal(first.draftsMore,true);
 const second=ok(await f.call('/api/bot-center?draftBefore='+first.draftNextBefore));
 assert.equal(second.drafts.length,5);assert.equal(second.draftsMore,false);assert.equal(second.drafts.some(d=>d.decision),false);
 const ids=[...first.drafts,...second.drafts].map(d=>d.id);assert.equal(new Set(ids).size,57);assert.deepEqual(ids.slice(2),[...content].reverse());
});
test('the new summary queries are bounded by the pending-status index',async t=>{
 const f=await setup(t);await f.decide({},'plan');f.queries.length=0;ok(await f.call('/api/bot-center'));
 const wanted=f.queries.filter(q=>/FROM bot_drafts d JOIN bot_draft_decisions dd/.test(q)||/\(SELECT count\(\*\) FROM bot_drafts d WHERE d\.kind='post'/.test(q)||/dd\.draft_id IS NOT NULL AND NOT EXISTS/.test(q));
 assert(wanted.length>=3,'count, top-3 and first-page decision queries are present');
 for(const q of wanted){
  const params=Array.from({length:(q.match(/\?/g)??[]).length},()=> 'x');
  const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+q).all(...params).map(p=>p.detail).join('\n');
  assert.match(plan,/idx_bot_drafts_status|bot_draft_decisions|idx_bot_draft_decisions/,plan);
  assert.doesNotMatch(plan,/SCAN d(?!\w| USING)|SCAN bot_drafts(?! USING)/,'no full table scan of drafts:\n'+plan);
 }
});

test('platform is FB, IG or Threads for new deliveries, case-insensitive; stored free text is shown as-is',async t=>{
 const f=await setup(t),post=(ref,platform,extra={})=>f.ingest('deliveries','POST',{eventRef:ref,kind:'post',title:'合成貼文 '+ref,body:'全文',approvalSource:'chat',approvalNote:'已核准',url:'https://example.invalid/'+ref,...(platform===undefined?{}:{platform}),...extra});
 const fb=ok(await post('p-fb','fb')),ig=ok(await post('p-ig','IG')),th=ok(await post('p-th','tHrEaDs'));
 assert.deepEqual(f.sql.prepare('SELECT event_ref,platform FROM bot_deliveries ORDER BY id').all().map(r=>[r.event_ref,r.platform]),[['p-fb','FB'],['p-ig','IG'],['p-th','Threads']]);
 for(const bad of ['Twitter','Facebook','LINE','x','ＦＢ'])assert.equal((await post('bad-'+bad,bad)).status,400,bad);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_deliveries WHERE event_ref LIKE 'bad-%'").get().n,0);
 assert.equal(ok(await post('p-fb','Fb')).duplicate,true,'same receipt retried with another case is the same receipt');
 assert.equal((await post('p-fb','IG')).status,409,'a different platform is a conflict');
 ok(await post('p-none',undefined));assert.equal(f.sql.prepare("SELECT platform FROM bot_deliveries WHERE event_ref='p-none'").get().platform,'','platform may still be left out');
 f.sql.prepare("UPDATE bot_deliveries SET platform='部落格' WHERE event_ref='p-th'").run();
 const state=ok(await f.call('/api/bot-center')).workSummary.articles.published.items;
 assert.deepEqual(state.map(x=>x.platform).sort(),['','FB','IG','部落格'].sort());
 assert.equal(ok(await f.call('/api/bot-center/deliveries/'+th.id)).item.platform,'部落格');
});

const noon=(f,extra={})=>f.call('/api/bot-ingest/patrol-sessions','POST',{sessionRef:'noon',label:'午巡',...extra},f.auth);
async function patrolDraft(f,ref,n,sessionRef){return ok(await f.ingest('drafts','POST',{externalRef:ref,title:'巡視 '+ref,body:'說明',kind:'patrol',items:Array.from({length:n},(_,i)=>({title:'回覆'+(i+1),body:'全文'+(i+1)})),...(sessionRef?{sessionRef}:{})}))}
const sessions=async f=>ok(await f.call('/api/bot-center')).workSummary.patrols.sessions;
test('patrol session status goes 待審核 → 待留言 → 已完成 as items are reviewed and sent',async t=>{
 const f=await setup(t);ok(await noon(f));
 const d=await patrolDraft(f,'noon-1',3,'noon');assert.equal(d.sessionId,f.sql.prepare("SELECT id FROM bot_patrol_sessions").get().id);
 let [s]=await sessions(f);assert.deepEqual([s.label,s.status,s.pendingItems,s.awaitingItems,s.sent,s.draftIds],['午巡','pending',3,0,0,[d.id]]);
 ok(await f.call(`/api/bot-center/drafts/${d.id}/items/1/review`,'POST',{decision:'approved'}));
 [s]=await sessions(f);assert.equal(s.status,'pending','one item still pending');assert.equal(s.pendingItems,2);
 ok(await f.call(`/api/bot-center/drafts/${d.id}/items/2/review`,'POST',{decision:'rejected',reason:'不適合'}));
 ok(await f.call(`/api/bot-center/drafts/${d.id}/items/3/review`,'POST',{decision:'approved'}));
 [s]=await sessions(f);assert.deepEqual([s.status,s.pendingItems,s.awaitingItems,s.sent],['toSend',0,2,0]);
 ok(await f.ingest(`drafts/${d.id}/sent`,'POST',{items:[1]}));
 [s]=await sessions(f);assert.deepEqual([s.status,s.awaitingItems],['toSend',1],'one approved item is still waiting for the BOT');
 const waiting=ok(await f.call(`/api/bot-center/patrol-sessions/${s.id}/items`)).items;assert.deepEqual(waiting.map(x=>[x.seq,x.status]),[[3,'approved']]);
 ok(await f.ingest(`drafts/${d.id}/sent`,'POST',{items:[3]}));
 [s]=await sessions(f);assert.deepEqual([s.status,s.awaitingItems,s.pendingItems],['done',0,0]);
 assert.equal(s.sent,0,'the receipts come from deliveries linked to this session');
});
test('deliveries linked to the session are counted as 送出 N 則 once everything is sent',async t=>{
 const f=await setup(t);ok(await noon(f));
 const d=await patrolDraft(f,'noon-2',2,'noon');ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved'}));
 for(const seq of [1,2])ok(await f.ingest('deliveries','POST',{eventRef:'r'+seq,kind:'patrol',approvalSource:'cyweb',draftId:d.id,itemSeq:seq,sessionRef:'noon',platform:'Threads'}));
 const [s]=await sessions(f);assert.deepEqual([s.status,s.sent,s.awaitingItems],['done',2,0]);
 assert.equal(ok(await f.call('/api/bot-center/sent-items?kind=patrol&sessionId='+s.id)).items.length,2);
 assert.equal(ok(await f.call('/api/bot-center/sent-items?kind=patrol&sessionId='+(s.id+99))).items.length,0);
 assert.equal((await f.call('/api/bot-center/sent-items?kind=patrol&sessionId=x')).status,422);
});
test('the BOT can close a session explicitly; reviewing in CY Web only changes the computed status',async t=>{
 const f=await setup(t);ok(await noon(f));
 const d=await patrolDraft(f,'noon-3',2,'noon');ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved'}));
 assert.equal((await sessions(f))[0].status,'toSend');
 const closed=ok(await noon(f,{completed:true}));assert.equal(closed.completed,true);assert.match(closed.completedAt,/^\d{4}-/);
 assert.equal((await sessions(f))[0].status,'done');
 const again=ok(await noon(f,{note:'補一句'}));assert.equal(again.completedAt,closed.completedAt,'a later update does not reopen or move the end time');
 ok(await noon(f,{completed:true}));assert.equal(f.sql.prepare('SELECT completed_at FROM bot_patrol_sessions').get().completed_at,closed.completedAt);
 assert.equal((await noon(f,{completed:'yes'})).status,422);
 // 待審的則仍然優先：明確結束不蓋掉待審核。
 const other=ok(await f.call('/api/bot-ingest/patrol-sessions','POST',{sessionRef:'eve',label:'晚巡',completed:true},f.auth));
 await patrolDraft(f,'eve-1',1,'eve');
 const eve=(await sessions(f)).find(x=>x.id===other.id);assert.equal(eve.status,'pending');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_deliveries').get().n,0,'nothing was sent or re-reported by reviewing');
});
test('a session with every item rejected is complete; sessions without CY Web drafts stay open until the BOT closes them and are always listed',async t=>{
 const f=await setup(t);ok(await noon(f));
 const d=await patrolDraft(f,'rej',2,'noon');ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'rejected',reason:'全不要'}));
 assert.deepEqual((await sessions(f)).map(x=>[x.label,x.status,x.sent]),[['午巡','done',0]]);
 ok(await f.call('/api/bot-ingest/patrol-sessions','POST',{sessionRef:'old',label:'早巡',note:'0則送出、10則待審核'},f.auth));
 const fresh=(await sessions(f)).find(x=>x.label==='早巡');
 assert.deepEqual([fresh.status,fresh.sent,fresh.note],['open',0,'0則送出、10則待審核'],'a session with nothing yet is listed as open with its note');
 const legacy=ok(await f.ingest('drafts','POST',{externalRef:'legacy',title:'舊巡視',body:'x',kind:'patrol',items:[{title:'回覆',body:'全文'}]}));
 ok(await f.call(`/api/bot-center/drafts/${legacy.id}/review`,'POST',{decision:'approved'}));
 ok(await f.ingest(`drafts/${legacy.id}/sent`,'POST',{items:[1]}));
 ok(await f.ingest('deliveries','POST',{eventRef:'legacy-link',kind:'patrol',approvalSource:'cyweb',draftId:legacy.id,itemSeq:1,sessionRef:'old'}));
 const rows=await sessions(f);assert.deepEqual(rows.find(x=>x.label==='早巡'),{...rows.find(x=>x.label==='早巡')},'listed');
 assert.deepEqual([rows.find(x=>x.label==='早巡').status,rows.find(x=>x.label==='早巡').sent,rows.find(x=>x.label==='早巡').draftIds],['open',1,[]],'deliveries alone do not complete a session');
 ok(await f.call('/api/bot-ingest/patrol-sessions','POST',{sessionRef:'old',label:'早巡',completed:true},f.auth));
 assert.equal((await sessions(f)).find(x=>x.label==='早巡').status,'done','the BOT closing it completes it');
});
test('a revision keeps the session link and only the latest version counts',async t=>{
 const f=await setup(t);ok(await noon(f));
 const a=await patrolDraft(f,'v1',2,'noon');
 const b=ok(await f.ingest('drafts','POST',{externalRef:'v2',title:'巡視 v2',body:'改過',kind:'patrol',previousDraftId:a.id,items:[{title:'新一',body:'x'}]}));
 assert.equal(b.sessionId,a.sessionId);
 const [s]=await sessions(f);assert.deepEqual([s.status,s.pendingItems,s.draftIds],['pending',1,[b.id]]);
});
test('sessionRef must be an existing session of the same BOT on the same Taipei day, for patrol drafts only',async t=>{
 const f=await setup(t);ok(await noon(f));
 const submit=(ref,extra)=>f.ingest('drafts','POST',{externalRef:ref,title:'巡視',body:'x',kind:'patrol',items:[{title:'一',body:'x'}],...extra});
 assert.equal((await submit('u1',{sessionRef:'nope'})).status,400);
 f.sql.prepare("UPDATE bot_patrol_sessions SET day='2020-01-01'").run();assert.equal((await submit('u2',{sessionRef:'noon'})).status,400,'an earlier day');
 f.sql.prepare("UPDATE bot_patrol_sessions SET day=?").run(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()));
 const finance=ok(await f.call('/api/bot-center/bots/FINANCE/credential','POST')).token;
 ok(await f.call('/api/bot-ingest/patrol-sessions','POST',{sessionRef:'fin',label:'財巡'},{authorization:'Bearer '+finance}));
 assert.equal((await submit('u3',{sessionRef:'fin'})).status,400,'another BOT\'s session');
 assert.equal((await f.ingest('drafts','POST',{externalRef:'u4',title:'貼文',body:'x',kind:'post',items:[{title:'一',body:'x'}],sessionRef:'noon'})).status,400);
 assert.equal((await f.ingest('drafts','POST',{externalRef:'u5',title:'稿',body:'x',sessionRef:'noon'})).status,400);
 assert.equal(ok(await submit('u6',{sessionRef:'noon'})).sessionId>0,true);
 assert.equal(ok(await submit('u7',{})).sessionId,null,'sessionRef stays optional');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_drafts WHERE external_ref IN('u1','u2','u3','u4','u5')").get().n,0);
});

test('migration 0079: backup carries the decision table and the new columns; older snapshots restore with defaults',async t=>{
 const compiled=await build({entryPoints:['worker/backup/portable-backup.ts'],bundle:true,write:false,platform:'node',format:'esm'});
 const backup=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const f=await setup(t),target=fixture('SUPER_ADMIN',false,{seedMember:false}),older=fixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>{target.sql.close();older.sql.close()});
 const latest=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort().at(-1).replace(/\.sql$/,'');
 assert.equal(backup.CURRENT_MIGRATION,latest);
 ok(await noon(f));await patrolDraft(f,'bk-1',1,'noon');ok(await noon(f,{completed:true}));
 const d=await f.decide({deadline:future(),amount:12345},'bk-d');ok(await f.call(`/api/bot-center/drafts/${d.id}/review`,'POST',{decision:'approved',choice:1}));
 const saved=await backup.exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.22.0'});
 const data=JSON.parse(new TextDecoder().decode(saved.dataBytes));
 assert.deepEqual(data.tables.bot_draft_decisions.columns,['amount','category','chosen_option','deadline_at','draft_id','options_json']);
 assert(data.tables.bot_drafts.columns.includes('session_id'));assert(data.tables.bot_patrol_sessions.columns.includes('completed_at'));
 await backup.restoreIntoEmptyDatabase(target.db,saved,'synthetic');
 for(const name of ['bot_draft_decisions','bot_patrol_sessions','bot_drafts'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+name+' ORDER BY 1').all(),f.sql.prepare('SELECT * FROM '+name+' ORDER BY 1').all(),name);
 assert.equal(target.sql.prepare('SELECT chosen_option c FROM bot_draft_decisions').get().c,1);assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 // 0078 以前的備份：沒有新表、沒有新欄位 → 新表是空的、新欄位取預設（NULL）。
 delete data.tables.bot_draft_decisions;
 for(const [name,column] of [['bot_drafts','session_id'],['bot_patrol_sessions','completed_at']]){const at=data.tables[name].columns.indexOf(column);data.tables[name].columns.splice(at,1);for(const row of data.tables[name].rows)row.splice(at,1)}
 const dataBytes=new TextEncoder().encode(JSON.stringify(data)),manifest=JSON.parse(new TextDecoder().decode(saved.manifestBytes));
 manifest.schemaMigration='0078_outsourcing_stock_revision';manifest.dataByteLength=dataBytes.length;manifest.dataSha256=createHash('sha256').update(dataBytes).digest('hex');
 manifest.recordCounts=Object.fromEntries(Object.entries(data.tables).map(([key,value])=>[key,value.rows.length]));manifest.totalRecordCount=Object.values(manifest.recordCounts).reduce((a,b)=>a+b,0);
 await backup.restoreIntoEmptyDatabase(older.db,{dataBytes,manifestBytes:new TextEncoder().encode(JSON.stringify(manifest))},'synthetic');
 assert.equal(older.sql.prepare('SELECT count(*) n FROM bot_draft_decisions').get().n,0);assert.equal(older.sql.prepare('SELECT count(*) n FROM bot_drafts WHERE session_id IS NOT NULL').get().n,0);
 assert.equal(older.sql.prepare('SELECT count(*) n FROM bot_patrol_sessions WHERE completed_at IS NOT NULL').get().n,0);assert.equal(older.sql.prepare('SELECT count(*) n FROM bot_drafts').get().n,2);
});
