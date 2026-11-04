import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {build} from 'esbuild';
const modelBundle=await build({entryPoints:['shared/store-repairs.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {nextRepairStep,repairStepApplicable,repairOverdue,canUndoRepairClosure,STORE_REPAIR_FACTORY_OVERDUE_DAYS}=await import('data:text/javascript;base64,'+Buffer.from(modelBundle.outputFiles[0].text).toString('base64'));
const bundle=await build({entryPoints:['worker/http/store-repair-routes.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {handleStoreRepairRoute}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function fixture(role='ADMIN',grant=true){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));
 const now='2026-10-16T03:00:00.000Z';
 sql.prepare("INSERT INTO app_members(id,identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(1,'synthetic-repair','9999','合成同事',1,?,?)").run(now,now);
 if(grant)sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(1,'STORE_REPAIRS',1,?)").run(now);
 const principal={workspaceId:'workspace-test',employeeId:'synthetic-repair',employeeNo:'9999',displayName:'合成同事',workspaceRole:role,isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:role==='SUPER_ADMIN',credentialVersion:1,employeeRevision:1};
 const db={prepare(query){const st=sql.prepare(query);let params=[];const execute=()=>({results:st.all(...params),meta:{changes:sql.prepare('SELECT changes() n').get().n}});return {bind(...v){params=v;return this},execute,async first(){return execute().results[0]??null},async all(){return execute()},async run(){return execute()}}},async batch(stmts){sql.exec('BEGIN');try{const result=stmts.map(s=>s.execute());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 const objects=new Map(); const bucket={async put(k,bytes){objects.set(k,bytes)},async get(k){const bytes=objects.get(k);return bytes?{body:new Blob([bytes]).stream()}:null},async delete(k){objects.delete(k)}};
 const env={HR_FILES:bucket,DB:db,IDENTITY_APPLICATION_ID:'APP_TEST',IDENTITY_WORKSPACE_ID:'workspace-test',IDENTITY:{async fetch(){return Response.json({principal,session:{expiresAt:'2999-01-01T00:00:00Z'}})}}};
 const call=async(path='',method='GET',data)=>{const r=await handleStoreRepairRoute(new Request('https://test.local/api/business/store/repairs'+path,{method,headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64),'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env,'repair-test');return {status:r.status,body:await r.json()}};
 return {sql,db,call,env,objects};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
const base={receivedDate:'2026-10-15',customerCode:'C-001',customerName:'合成顧客',honorific:'MS',mobile:'0912345678',phone:'',lineName:'',productKind:'LOW_FREQUENCY',productText:'HC-0502',serialNo:'SN-1',fault:'無法啟動',purchaseDate:null,accessories:'充電器'};
const key=()=>crypto.randomUUID();
const create=f=>f.call('','POST',{...base,requestKey:key()});
const advance=(f,r,step,more={})=>f.call('/'+r.id+'/status','POST',{action:'advance',step,milestoneDate:'2026-10-16',requestKey:key(),expectedVersion:r.version,...more});
const action=(f,r,kind,more={})=>f.call('/'+r.id+'/status','POST',{action:kind,requestKey:key(),expectedVersion:r.version,...more});
test('module is independent: denied without repairs grant, and existing grants survive 0043',async()=>{
 const f=fixture('ADMIN',false);try{assert.equal((await f.call()).status,403)}finally{f.sql.close()}
 const allowed=fixture();try{assert.equal((await allowed.call()).status,200);assert.deepEqual(allowed.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{allowed.sql.close()}
});
test('normal repair flow, shipment rules, no-date and revisioned history',async()=>{
 const f=fixture();try{
  let r=ok(await create(f));assert.equal(r.status,'RECEIVED');assert.equal(r.sequence,1);
  // 補充說明 is optional (user 2026-11-04): BAD without a note is accepted, so no 422 here.
  r=ok(await advance(f,r,'INSPECTED',{inspectResult:'BAD',inspectProblem:'主機故障'}));
  assert.equal(nextRepairStep(r),'SENT');
  assert.equal((await advance(f,r,'SENT',{shipping:{carrier:'POST',tracking:''}})).status,422);
  r=ok(await advance(f,r,'SENT',{shipping:{carrier:'POST',tracking:'P-01'}}));assert.equal(r.sendTracking,'P-01');
  r=ok(await advance(f,r,'REPAIRED',{milestoneDate:null}));assert.equal(r.dates.REPAIRED,null);
  r=ok(await advance(f,r,'NOTIFIED'));assert.equal(r.status,'NOTIFIED');
  r=ok(await advance(f,r,'RETURNED',{returnMethod:'SHIPPING',shipping:{carrier:'SELF',tracking:'手交'}}));assert.equal(r.status,'RETURNED');assert.equal(r.returnTracking,'手交');
  const history=ok(await f.call('/'+r.id+'/history'));assert.equal(history.rows.length,6);
  assert.equal((await action(f,r,'cancel',{reasonKind:'其他',reason:'不修'})).status,409);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.sql.close()}
});
test('no anomaly skips factory; cancellation remains open until notification and return',async()=>{
 const f=fixture();try{
  let r=ok(await create(f)),id=r.id;
  r=ok(await advance(f,r,'INSPECTED',{inspectResult:'GOOD'}));assert.equal(nextRepairStep(r),'NOTIFIED');assert.equal(repairStepApplicable(r,'SENT'),false);
  r=ok(await action(f,r,'cancel',{reasonKind:'顧客取回'}));assert.equal(r.cancelled,true);assert.equal(r.status,'INSPECTED');
  r=ok(await action(f,r,'undoCancel'));assert.equal(r.cancelled,false);
  r=ok(await action(f,r,'cancel',{reasonKind:'顧客取回'}));
  r=ok(await advance(f,r,'NOTIFIED'));assert.equal(r.cancelled,true);assert.equal((await action(f,r,'undoCancel')).status,409);
  r=ok(await advance(f,r,'RETURNED',{returnMethod:'PICKUP'}));assert.equal(r.status,'RETURNED');
  assert.equal((await f.call('/'+id)).status,200);
 }finally{f.sql.close()}
});
test('cancelled factory unit must be repaired before notice; rollback and date edit enforce revision',async()=>{
 const f=fixture();try{
  let r=ok(await create(f));
  r=ok(await advance(f,r,'INSPECTED',{inspectResult:'BAD',inspectProblem:'燒毀'}));
  r=ok(await advance(f,r,'SENT',{shipping:{carrier:'SELF',tracking:''}}));
  r=ok(await action(f,r,'cancel',{reasonKind:'無法維修'}));
  assert.equal(nextRepairStep(r),'REPAIRED');
  assert.equal((await advance(f,r,'NOTIFIED')).status,409);
  r=ok(await advance(f,r,'REPAIRED'));
  r=ok(await action(f,r,'undoCancel'));
  assert.equal((await f.call('/'+r.id+'/date','PATCH',{step:'INSPECTED',milestoneDate:'2026-10-15',expectedVersion:r.version,requestKey:key()})).status,409);
  const stale=await f.call('/'+r.id+'/date','PATCH',{step:'INSPECTED',milestoneDate:null,expectedVersion:r.version-1,requestKey:key()});
  assert.equal(stale.status,409);
  r=ok(await action(f,r,'rollback',{reason:'重新評估'}));assert.equal(r.status,'SENT');
 }finally{f.sql.close()}
});
test('pure overdue thresholds and closure window use shared store policy',()=>{
 const base={status:'SENT',cancelled:false,sentAt:'2026-09-01T00:00:00Z',notifiedAt:null};
 assert.equal(STORE_REPAIR_FACTORY_OVERDUE_DAYS,30);
 assert.equal(repairOverdue(base,new Date('2026-10-02T00:00:00Z')),'FACTORY');
 assert.equal(repairOverdue({...base,status:'NOTIFIED',sentAt:null,notifiedAt:'2026-09-01T00:00:00Z'},new Date('2026-09-16T00:00:00Z')),'PICKUP');
 const at='2026-10-16T03:00:00Z';assert.equal(canUndoRepairClosure({status:'RETURNED',closedAt:at},Date.parse(at)+299999),true);
 assert.equal(canUndoRepairClosure({status:'RETURNED',closedAt:at},Date.parse(at)+300000),false);
});

test('a repair cancelled before inspection shows inspection as not applicable, not done',()=>{
 const r={status:'NOTIFIED',cancelled:true,inspectResult:'',sentAt:null};
 assert.equal(repairStepApplicable(r,'INSPECTED'),false);
 assert.equal(repairStepApplicable({...r,inspectResult:'BAD'},'INSPECTED'),true);
 assert.equal(repairStepApplicable({status:'RECEIVED',cancelled:false,inspectResult:'',sentAt:null},'INSPECTED'),true);
});

test('repair photo API: scoped access, JPEG size and count, R2 removal and after-closure upload',async()=>{
 const f=fixture();
 // Synthetic tiny JPEG with valid SOF dimensions (1x1) accepted by the shared parser.
 const jpeg=Uint8Array.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,217]);
 const raw=async(path,method,body,contentType="image/jpeg")=>handleStoreRepairRoute(new Request('https://test.local/api/business/store/repairs'+path,{method,headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64),'content-type':contentType},body}),f.env,'photo-test');
 try{
  const repair=ok(await create(f));
  const root='/'+repair.id+'/photos';
  const deny=await raw(root,'POST',new Blob(['bad']),"text/plain");assert.equal(deny.status,422);
  const large=await raw(root,'POST',new Uint8Array(1048577));assert.equal(large.status,422);
  for(let i=0;i<3;i++){const res=await raw(root,'POST',jpeg);assert.equal(res.status,200,await res.text());}
  const tooMany=await raw(root,'POST',jpeg);assert.equal(tooMany.status,409);
  const list=await raw(root,'GET');assert.equal(list.status,200);const photos=(await list.json()).data;assert.equal(photos.length,3);
  assert.equal(f.objects.size,3);
  const image=await raw(root+'/'+photos[0].id,'GET');assert.equal(image.status,200);assert.equal(image.headers.get('cache-control'),'private, no-store');
  const deleted=await raw(root+'/'+photos[0].id,'DELETE');assert.equal(deleted.status,200);assert.equal(f.objects.size,2);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM store_repair_events WHERE kind=?').get('上傳維修單照片').n,3);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM store_repair_events WHERE kind=?').get('刪除維修單照片').n,1);
  const forbidden=fixture('ADMIN',false);
  try{
   const res=await handleStoreRepairRoute(new Request('https://test.local/api/business/store/repairs'+root,{headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64)}}),forbidden.env,'photo-denied');
   assert.equal(res.status,403);
  }finally{forbidden.sql.close()}
  // Closure does not disallow photo upload, unlike normal repair editing.
  f.sql.prepare("UPDATE store_repairs SET status='RETURNED',closed_at='2026-10-16T03:00:00Z' WHERE id=?").run(repair.id);
  assert.equal((await raw(root,'POST',jpeg)).status,200);
 }finally{f.sql.close()}
});


test('later repair steps lock inspection and shipping even without dates; rollback unlocks the last step',async()=>{
 const f=fixture();try{
  let r=ok(await create(f));r=ok(await advance(f,r,'INSPECTED',{inspectResult:'BAD',inspectProblem:'原補充'}));
  r=ok(await advance(f,r,'SENT',{milestoneDate:null,shipping:{carrier:'SELF',tracking:'原註記'}}));
  const patch=(step,more={})=>f.call('/'+r.id+'/date','PATCH',{step,milestoneDate:null,expectedVersion:r.version,requestKey:key(),...more});
  const events=()=>f.sql.prepare('SELECT COUNT(*) n FROM store_repair_events').get().n;
  let count=events();const locked=await patch('INSPECTED',{inspectResult:'GOOD',inspectProblem:'不應修改'});
  assert.equal(locked.status,409);assert.match(JSON.stringify(locked.body),/下一步已登記，不能修改/);assert.equal(events(),count);
  assert.equal((await patch('SENT',{shipping:{carrier:'POST',tracking:''}})).status,422);
  r=ok(await patch('SENT',{shipping:{carrier:'POST',tracking:'NEW-123'}}));assert.equal(r.sendCarrier,'POST');assert.equal(r.sendTracking,'NEW-123');
  const event=ok(await f.call('/'+r.id+'/history')).rows[0];assert.equal(event.after.tracking,'NEW-123');assert.equal(event.after.carrier,'郵局');
  assert(f.sql.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='store_repair.date'").get().n>0);
  r=ok(await advance(f,r,'REPAIRED',{milestoneDate:null}));count=events();
  assert.equal((await patch('SENT',{shipping:{carrier:'HCT',tracking:'BLOCKED'}})).status,409);assert.equal(events(),count);
  r=ok(await action(f,r,'rollback',{reason:'更正送廠資料'}));assert.equal(r.status,'SENT');
  r=ok(await patch('SENT',{shipping:{carrier:'SELF',tracking:'更正註記'}}));assert.equal(r.sendTracking,'更正註記');
  r=ok(await action(f,r,'rollback',{reason:'更正檢測'}));
  r=ok(await patch('INSPECTED',{inspectResult:'BAD',inspectProblem:'更正補充'}));assert.equal(r.inspectProblem,'更正補充');
 }finally{f.sql.close()}
});

test('returned shipping is viewable and amendable only within the existing closure window',async()=>{
 const f=fixture();try{
  let r=ok(await create(f));r=ok(await advance(f,r,'INSPECTED',{inspectResult:'GOOD'}));r=ok(await advance(f,r,'NOTIFIED'));
  r=ok(await advance(f,r,'RETURNED',{returnMethod:'SHIPPING',shipping:{carrier:'POST',tracking:'RETURN-1'}}));const closedAt=r.closedAt;
  const patch=more=>f.call('/'+r.id+'/date','PATCH',{step:'RETURNED',milestoneDate:null,requestKey:key(),expectedVersion:r.version,...more});
  r=ok(await patch({returnMethod:'SHIPPING',shipping:{carrier:'HCT',tracking:'RETURN-2'}}));assert.equal(r.returnTracking,'RETURN-2');assert.equal(r.closedAt,closedAt);
  r=ok(await patch({returnMethod:'PICKUP'}));assert.equal(r.returnCarrier,'');assert.equal(r.returnTracking,'');
  assert.equal((await patch({returnMethod:'SHIPPING'})).status,422);
  f.sql.prepare("UPDATE store_repairs SET closed_at='2000-01-01T00:00:00Z' WHERE id=?").run(r.id);
  assert.equal((await patch({returnMethod:'SHIPPING',shipping:{carrier:'POST',tracking:'BLOCKED'}})).status,409);
  assert.equal(ok(await f.call('/'+r.id)).returnMethod,'PICKUP');
 }finally{f.sql.close()}
});
