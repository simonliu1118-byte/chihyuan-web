import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {build} from 'esbuild';
async function compiled(path){const b=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))}
const {handleStoreEquipmentRoute}=await compiled('worker/http/store-equipment-routes.ts');
const {halfYearMonths,equipmentWarrantyEnd,equipmentWarrantyMonths,shiftEquipmentMonth}=await compiled('shared/store-equipment.ts');
const backup=await compiled('worker/backup/portable-backup.ts');
const now='2027-07-06T03:00:00.000Z',key=()=>crypto.randomUUID();
function fixture({grant=true,seed=true}={}){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));
 if(seed){sql.prepare("INSERT INTO app_members(id,identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(1,'synthetic-equipment','9999','合成同事',1,?,?)").run(now,now);if(grant)sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(1,'STORE_REPAIRS',1,?)").run(now)}
 const db={beforeBatch:null,prepare(query){const st=sql.prepare(query);let args=[];const execute=()=>({results:st.all(...args),meta:{changes:sql.prepare('SELECT changes() n').get().n}});return {bind(...v){args=v;return this},execute,async first(){return execute().results[0]??null},async all(){return execute()},async run(){return execute()}}},async batch(statements){db.beforeBatch?.();sql.exec('BEGIN');try{const results=statements.map(x=>x.execute());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 const principal={workspaceId:'test-workspace',employeeId:'synthetic-equipment',employeeNo:'9999',displayName:'合成同事',workspaceRole:'ADMIN',isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:false,credentialVersion:1,employeeRevision:1};
 const env={DB:db,IDENTITY_APPLICATION_ID:'APP_TEST',IDENTITY_WORKSPACE_ID:'test-workspace',IDENTITY:{async fetch(){return Response.json({principal,session:{expiresAt:'2999-01-01T00:00:00Z'}})}}};
 const call=async(path='',method='GET',data)=>{const r=await handleStoreEquipmentRoute(new Request('https://test.local/api/business/store/equipment'+path,{method,headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64),'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})}),env,'equipment-test',now);return {status:r.status,body:await r.json()}};
 return {sql,db,env,call};
}
const base={customerCode:'DE0001',customerName:'合成醫院',brand:'合成品牌',category:'STEAM',categoryOther:'',model:'T-2000',saleDate:'2026-07-01',quantity:2,warrantyStart:'2026-07-01',warrantyEnd:'2028-06-30',machines:[{serialNo:'SN-001',manufacturedMonth:'2026-05',assetNumber:''},{serialNo:'SN-002',manufacturedMonth:'2026-05',assetNumber:''}],maintenance:true,months:['2027-01','2027-07']};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
const create=(f,more={})=>f.call('','POST',{...base,...more,requestKey:key()});
const update=(f,r,more={})=>f.call('/'+r.id,'PUT',{...r,...more,expectedVersion:r.version,requestKey:key()});
const visits=async(f,query='')=>ok(await f.call('/visits'+query)).rows;
const complete=(f,v,more={})=>f.call('/visits/'+v.id,'PUT',{expectedVersion:v.version,requestKey:key(),completed:true,completionDate:'2027-07-06',note:'已前往例行維護',...more});
const count=(f,t)=>f.sql.prepare('SELECT COUNT(*) n FROM '+t).get().n;


test('repair category choices, custom category and asset-only patch preserve other equipment and visits',async()=>{
 const f=fixture();try{
  let r=ok(await create(f,{category:'OTHER',categoryOther:'合成設備類別'}));
  assert.equal(r.category,'OTHER');
  assert.equal(r.categoryOther,'合成設備類別');
  assert.equal(ok(await f.call('?q=DE0001')).rows[0].categoryOther,'合成設備類別');
  const visit=(await visits(f))[0];
  const patched=ok(await f.call('/'+r.id+'/assets','PATCH',{assetNumbers:['AS-001','AS-002'],expectedVersion:r.version,requestKey:key()}));
  assert.deepEqual(patched.machines.map(m=>m.assetNumber),['AS-001','AS-002']);
  assert.equal(patched.model,r.model);
  assert.equal(patched.categoryOther,r.categoryOther);
  assert.equal((await visits(f))[0].version,visit.version);
  assert.equal((await f.call('/'+r.id+'/assets','PATCH',{assetNumbers:['STALE',''],expectedVersion:r.version,requestKey:key()})).status,409);
  r=ok(await f.call('/'+r.id));
  assert.deepEqual(r.machines.map(m=>m.assetNumber),['AS-001','AS-002']);
  assert.equal((await create(f,{category:'INVALID'})).status,422);
  assert.equal((await create(f,{category:'OTHER',categoryOther:''})).status,422);
 }finally{f.sql.close()}
});

test('calendar suggestions and inclusive warranty month arithmetic',()=>{
 assert.deepEqual(halfYearMonths('2026-07-01','2028-06-30'),['2027-01','2027-07','2028-01']);
 assert.deepEqual(halfYearMonths('2026-02-30','2028-01-01'),[]);
 assert.equal(equipmentWarrantyEnd('2026-07-01',24),'2028-06-30');
 assert.equal(equipmentWarrantyEnd('2024-02-29',12),'2025-02-28');
 assert.equal(equipmentWarrantyMonths('2026-07-01','2028-06-30'),'24');
 assert.equal(equipmentWarrantyEnd('2024-05-15',3),'2024-08-14');
 assert.equal(equipmentWarrantyMonths('2024-05-15','2024-08-14'),'3');
 assert.equal(equipmentWarrantyMonths('2024-05-15','2024-08-15'),'4');
 assert.equal(equipmentWarrantyMonths('2024-05-15','2024-08-13'),'3');
 assert.equal(equipmentWarrantyEnd('2024-01-31',1),'2024-02-29');
 assert.equal(equipmentWarrantyMonths('2024-08-15','2024-05-15'),'');
 assert.equal(shiftEquipmentMonth('2026-12',6),'2027-06');
});
test('all equipment and visit routes enforce existing repairs access before reading data',async()=>{
 const f=fixture({grant:false});try{for(const path of ['','/visits','/1','/visits/1/history','/matrix?year=2026','/customers/DE0001/history'])assert.equal((await f.call(path)).status,403);assert.equal(count(f,'store_equipment_events'),0)}finally{f.sql.close()}
});
test('optional code permits dispatch only; a caller cannot enable maintenance without it',async()=>{
 const f=fixture();try{const r=ok(await create(f,{customerCode:'',maintenance:false,months:[]}));assert.equal(r.customerCode,'');assert.equal(r.maintenance,false);assert.equal((await visits(f)).length,0);const before=count(f,'store_equipment_events');assert.equal((await update(f,r,{maintenance:true,months:['2027-07']})).status,422);assert.equal(count(f,'store_equipment_events'),before);assert.equal((await create(f,{customerName:''})).status,422)}finally{f.sql.close()}
});
test('invalid count, dates, duplicate serials and out-of-warranty months leave no records or audit',async()=>{
 const f=fixture();try{for(const bad of [{quantity:3},{saleDate:'2026-02-30'},{saleDate:'2028-01-01'},{months:['2027-13']},{months:['2027-01','2027-01']},{months:['2029-01']},{maintenance:false},{machines:[base.machines[0],base.machines[0]]},{machines:[{serialNo:'',manufacturedMonth:'2026-13'},base.machines[1]]},{warrantyEnd:'2026-06-01'}])assert.equal((await create(f,bad)).status,422,JSON.stringify(bad));assert.equal(count(f,'store_equipment_records'),0);assert.equal(count(f,'store_equipment_events'),0);assert.equal(count(f,'audit_events'),0)}finally{f.sql.close()}
});
test('normalizes codes and merges several dispatches into one visit per customer/month',async()=>{
 const f=fixture();try{const first=ok(await create(f,{customerCode:' de0001 '})),second=ok(await create(f,{customerCode:'ＤＥ０００１',model:'T-100'}));const page=await visits(f);assert.equal(page.length,2);assert.equal(first.sequence,1);assert.equal(second.sequence,2);for(const v of page){assert.equal(v.customerCode,'DE0001');assert.deepEqual(v.equipment.map(x=>x.sequence).sort(),[1,2]);assert.equal(v.equipment.reduce((n,e)=>n+e.quantity,0),4)}ok(await create(f,{customerCode:'DE0002',customerName:'另一合成醫院'}));assert.equal((await visits(f)).length,4);assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{f.sql.close()}
});
test('list omits serial arrays, while detail and serial search still use the authoritative record',async()=>{
 const f=fixture();try{const r=ok(await create(f));const page=ok(await f.call('?q=SN-001'));assert.equal(page.rows.length,1);assert.deepEqual(page.rows[0].machines,[]);assert.equal(ok(await f.call('/'+r.id)).machines.length,2)}finally{f.sql.close()}
});
test('one visit completion covers the group, dates and a single-line note are editable without moving plans',async()=>{
 const f=fixture();try{const r=ok(await create(f));let v=(await visits(f))[0];v=ok(await complete(f,v));assert.equal(v.completed,true);assert.equal(v.equipment.length,1);assert.equal(v.completionDate,'2027-07-06');assert.equal((await complete(f,v,{completionDate:null})).status,422);v=ok(await complete(f,v,{completionDate:'2027-06-30',note:'更正到訪'}));assert.equal(v.completionDate,'2027-06-30');assert.equal(v.note,'更正到訪');assert.deepEqual(ok(await f.call('/'+r.id)).months,base.months);assert.equal((await complete(f,v,{note:'第一行\n第二行'})).status,422);v=ok(await complete(f,v,{completed:false,completionDate:null}));assert.equal(v.completed,false);const h=ok(await f.call('/visits/'+v.id+'/history'));assert.deepEqual(h.rows.map(x=>x.kind),['取消維護登記','修改維護','登記維護']);assert.equal(h.rows[1].after.note,'更正到訪')}finally{f.sql.close()}
});
test('idempotent replay does not add records or events and changed payload cannot reuse the same key',async()=>{
 const f=fixture();try{const data={...base,requestKey:key()},r=ok(await f.call('','POST',data));assert.equal(ok(await f.call('','POST',data)).id,r.id);assert.equal(count(f,'store_equipment_records'),1);assert.equal(count(f,'store_equipment_events'),1);assert.equal((await f.call('','POST',{...data,model:'OTHER'})).status,409);const v=(await visits(f))[0],d={requestKey:key(),expectedVersion:v.version,completed:true,completionDate:'2027-07-06',note:'到訪'};ok(await f.call('/visits/'+v.id,'PUT',d));ok(await f.call('/visits/'+v.id,'PUT',d));assert.equal(count(f,'store_equipment_events'),2)}finally{f.sql.close()}
});
test('stale record and visit versions reject edits without writing audit or history',async()=>{
 const f=fixture();try{const r=ok(await create(f));ok(await update(f,r,{model:'NEW'}));const n=count(f,'store_equipment_events');assert.equal((await update(f,r,{model:'STALE'})).status,409);assert.equal(count(f,'store_equipment_events'),n);const v=(await visits(f))[0];ok(await complete(f,v));const audits=count(f,'audit_events');assert.equal((await complete(f,v)).status,409);assert.equal(count(f,'audit_events'),audits)}finally{f.sql.close()}
});
test('aggregate membership change invalidates a previously opened visit editor',async()=>{
 const f=fixture();try{ok(await create(f));const v=(await visits(f))[0];ok(await create(f,{model:'second dispatch'}));assert.equal((await complete(f,v)).status,409);assert.equal((await visits(f))[0].completed,false)}finally{f.sql.close()}
});
test('a conflict during a batch rolls back the record, memberships, history and audit together',async()=>{
 const f=fixture();try{const r=ok(await create(f));const before=count(f,'store_equipment_events');f.db.beforeBatch=()=>{f.db.beforeBatch=null;f.sql.exec('UPDATE store_equipment_state SET version=version+1 WHERE id=1')};assert.equal((await update(f,r,{model:'must roll back',months:['2027-02']})).status,409);assert.equal(ok(await f.call('/'+r.id)).model,base.model);assert.deepEqual(ok(await f.call('/'+r.id)).months,base.months);assert.equal(count(f,'store_equipment_events'),before);assert.equal(count(f,'audit_events'),before)}finally{f.sql.close()}
});
test('completed visits freeze included equipment and survive removing the schedule or customer code',async()=>{
 const f=fixture();try{let r=ok(await create(f));let v=(await visits(f))[0];v=ok(await complete(f,v));r=ok(await update(f,r,{quantity:1,machines:[base.machines[0]],model:'changed'}));v=ok(await f.call('/visits/'+v.id));assert.equal(v.equipment[0].quantity,2);assert.equal(v.equipment[0].model,base.model);r=ok(await update(f,r,{customerCode:'',maintenance:false,months:[]}));const left=await visits(f);assert.equal(left.length,1);assert.equal(left[0].completed,true);assert.equal(left[0].customerCode,'DE0001');assert.equal(left[0].note,'已前往例行維護')}finally{f.sql.close()}
});
test('new dispatch cannot inherit an already completed visit; the whole creation rolls back',async()=>{
 const f=fixture();try{ok(await create(f));ok(await complete(f,(await visits(f))[0]));const before=count(f,'store_equipment_events');assert.equal((await create(f,{model:'not visited'})).status,409);assert.equal(count(f,'store_equipment_records'),1);assert.equal(count(f,'store_equipment_events'),before);let v=(await visits(f))[0];ok(await complete(f,v,{completed:false,completionDate:null}));ok(await create(f,{model:'not visited'}));assert.equal((await visits(f))[0].equipment.length,2)}finally{f.sql.close()}
});
test('a dispatch removed before the visit is completed is not included in its historical coverage',async()=>{
 const f=fixture();try{const a=ok(await create(f));const b=ok(await create(f,{model:'remaining'}));ok(await update(f,a,{maintenance:false,months:[]}));const v=ok(await complete(f,(await visits(f))[0]));assert.deepEqual(v.equipment.map(e=>e.id),[b.id]);ok(await update(f,b,{maintenance:false,months:[]}));const preserved=ok(await f.call('/visits/'+v.id));assert.deepEqual(preserved.equipment.map(e=>e.id),[b.id])}finally{f.sql.close()}
});
test('editing one customer does not rename another customer in a shared old visit',async()=>{
 const f=fixture();try{const a=ok(await create(f));ok(await create(f,{model:'other'}));ok(await update(f,a,{customerCode:'DE0002',customerName:'合成第二醫院'}));const page=await visits(f);assert.equal(page.find(v=>v.customerCode==='DE0001').customerName,base.customerName);assert.equal(page.find(v=>v.customerCode==='DE0002').customerName,'合成第二醫院')}finally{f.sql.close()}
});
test('search and bounded keyset pages return newest first without duplicate rows',async()=>{
 const f=fixture();try{for(let i=0;i<101;i++)ok(await create(f,{customerCode:'',maintenance:false,months:[],model:'model-'+i}));const page=ok(await f.call());assert.equal(page.rows.length,100);assert.equal(page.rows[0].sequence,101);assert.equal(page.nextBefore,2);const rest=ok(await f.call('?before='+page.nextBefore));assert.equal(rest.rows.length,1);assert.equal(rest.rows[0].sequence,1);assert.equal(rest.nextBefore,null);assert.equal(ok(await f.call('?q=model-100')).rows.length,1);assert.equal(ok(await f.call('?q=%25')).rows.length,0);assert.equal((await f.call('?before=bad')).status,422)}finally{f.sql.close()}
});
test('visit pages, year/open filters and bounded histories use stable cursors',async()=>{
 const f=fixture();try{const months=Array.from({length:101},(_,i)=>shiftEquipmentMonth('2026-07',i));const r=ok(await create(f,{warrantyEnd:'2035-12-31',months}));const p=ok(await f.call('/visits'));assert.equal(p.rows.length,100);const rest=ok(await f.call('/visits?before='+encodeURIComponent(p.nextBefore)));assert.equal(rest.rows.length,1);assert.equal(new Set([...p.rows,...rest.rows].map(v=>v.id)).size,101);assert.equal((await visits(f,'?year=2027')).length,12);let first=p.rows[0];ok(await complete(f,first));assert.equal((await visits(f,'?open=1')).some(v=>v.id===first.id),false);for(let i=0;i<55;i++)f.sql.prepare("INSERT INTO store_equipment_events(equipment_id,actor,at,kind,before_json,after_json,request_key,request_hash) VALUES(?,1,?,'修改出機','{}','{}',?,'x')").run(r.id,now,'history-key-'+i);const h=ok(await f.call('/'+r.id+'/history'));assert.equal(h.rows.length,50);const tail=ok(await f.call('/'+r.id+'/history?cursor='+h.nextCursor));assert.equal(tail.rows.length,6)}finally{f.sql.close()}
});
test('dispatches, visit dates/notes, memberships and history round-trip through portable backup',async()=>{
 const source=fixture(),target=fixture({seed:false});try{ok(await create(source));ok(await complete(source,(await visits(source))[0]));const bundle=await backup.exportPortableBackup(source.db,{workspaceScope:'synthetic',appVersion:'0.11.4'});assert.equal(JSON.parse(new TextDecoder().decode(bundle.manifestBytes)).schemaMigration,'0056_bot_dashboard');await backup.restoreIntoEmptyDatabase(target.db,bundle,'synthetic');for(const table of ['store_equipment_state','store_equipment_records','store_maintenance_visits','store_equipment_plans','store_equipment_events'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all(),source.sql.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all());assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{source.sql.close();target.sql.close()}
});
const matrix=await compiled('shared/maintenance-matrix.ts');
const visit=(id,month,completionDate=null)=>({id,customerCode:'DE0001',customerName:base.customerName,month,completed:!!completionDate,completionDate,note:'',version:1,equipment:[]});
test('three-year projection keeps plans, actual months, same-day groups and distinct dates independent',()=>{
 const window=matrix.maintenanceWindow(2026);assert.equal(window.months.length,36);assert.deepEqual(window.years,['2025','2026','2027']);
 const cells=matrix.maintenanceMatrixCells([visit(1,'2026-07','2026-08-15'),visit(2,'2026-08','2026-08-15'),visit(3,'2026-09','2026-08-21'),visit(4,'2026-08'),visit(5,'2026-11')],window.months,'2026-11-05');
 assert.equal(cells.get('2026-07')[0].kind,'moved');assert.equal(cells.get('2026-07')[0].targetMonth,'2026-08');
 const august=cells.get('2026-08');assert.equal(august[0].kind,'overdue');assert.deepEqual(august.filter(e=>e.kind==='date').map(e=>[e.day,e.visits.length]),[['2026-08-15',2],['2026-08-21',1]]);assert.equal(cells.get('2026-11')[0].kind,'pending');
 assert.equal(matrix.maintenanceMatrixCells([visit(1,'2026-07')],window.months,'2026-07-31').get('2026-07')[0].kind,'pending');
 assert.equal(matrix.maintenanceMatrixCells([visit(1,'2026-07')],window.months,'2026-08-01').get('2026-07')[0].kind,'overdue');
});
test('cross-window visits remain visible in their actual month and legacy undated completion is never guessed',()=>{
 const window=matrix.maintenanceWindow(2026),legacy={...visit(3,'2026-05'),completed:true};
 const list=[visit(1,'2024-12','2025-01-02'),visit(2,'2027-12','2028-01-03'),legacy];
 const cells=matrix.maintenanceMatrixCells(list,window.months,'2026-11-05');
 assert.equal(cells.get('2025-01')[0].day,'2025-01-02');assert.equal(cells.get('2027-12')[0].targetMonth,'2028-01');assert.equal(cells.get('2026-05')[0].kind,'missing');
 assert.equal(matrix.maintenanceVisitVisible(list[0],window.from,window.to),true);assert.equal(matrix.maintenanceVisitVisible(visit(4,'2024-01','2024-02-03'),window.from,window.to),false);
 assert.throws(()=>matrix.maintenanceWindow(0));
});
test('matrix reads all months per customer, retains out-of-window sources and does not read individual cells',async()=>{
 const f=fixture();try{
  const r=ok(await create(f,{saleDate:'2024-01-01',warrantyStart:'2024-01-01',warrantyEnd:'2028-12-31',months:['2024-12','2026-07','2026-08','2027-12']}));
  let all=await visits(f);for(const [m,d] of [['2024-12','2025-01-02'],['2026-07','2026-08-15'],['2026-08','2026-08-15']])ok(await complete(f,all.find(v=>v.month===m),{completionDate:d}));
  const page=ok(await f.call('/matrix?year=2026'));assert.equal(page.rows.length,1);assert.equal(page.rows[0].visits.length,4);assert.equal(page.rows[0].equipment.length,1);assert.deepEqual(page.rows[0].visits[0].equipment,[]);
  assert.equal(ok(await f.call('/matrix?year=2026&open=1')).rows.length,1);assert.equal(ok(await f.call('/matrix?year=2026&q=missing')).rows.length,0);
  ok(await update(f,r,{customerCode:'',maintenance:false,months:[]}));const retained=ok(await f.call('/matrix?year=2026'));assert.equal(retained.rows[0].visits.length,3);assert.equal(retained.rows[0].equipment[0].model,base.model);assert.equal(retained.rows[0].activeMaintenance,false);assert.equal(ok(await f.call('/matrix?year=2026&open=1')).rows.length,0);
  const h=ok(await f.call('/customers/DE0001/history'));assert.equal(h.rows.length,3);assert.equal(h.rows[0].after.plannedMonth,'2026-08');
  for(const year of ['0','20260','xxxx','0001','9999'])assert.equal((await f.call('/matrix?year='+year)).status,422);
 }finally{f.sql.close()}
});
test('matrix customer pagination never truncates monthly cells and history pagination stays bounded',async()=>{
 const f=fixture();try{
  for(let i=0;i<51;i++)ok(await create(f,{customerCode:'SYN'+String(i).padStart(3,'0')}));
  const a=ok(await f.call('/matrix?year=2026'));assert.equal(a.rows.length,50);assert.equal(a.nextBefore,'SYN049');assert.equal(a.rows[0].visits.length,2);
  const b=ok(await f.call('/matrix?year=2026&before='+a.nextBefore));assert.equal(b.rows.length,1);assert.equal(b.nextBefore,null);assert.equal(new Set([...a.rows,...b.rows].map(r=>r.customerCode)).size,51);
  const v=a.rows[0].visits[0];for(let i=0;i<55;i++)f.sql.prepare("INSERT INTO store_equipment_events(visit_id,actor,at,kind,before_json,after_json,request_key,request_hash) VALUES(?,1,?,'修改維護','{}','{}',?,'x')").run(v.id,now,'matrix-event-'+i);
  const h=ok(await f.call('/customers/SYN000/history'));assert.equal(h.rows.length,50);assert.equal(ok(await f.call('/customers/SYN000/history?cursor='+h.nextCursor)).rows.length,5);
 }finally{f.sql.close()}
});
test('legacy undated completion can be read and corrected but new undated writes leave no audit',async()=>{
 const f=fixture();try{
  ok(await create(f));let v=(await visits(f))[0];f.sql.prepare('UPDATE store_maintenance_visits SET completed=1,completion_date=NULL WHERE id=?').run(v.id);
  v=ok(await f.call('/matrix?year=2026')).rows[0].visits.find(x=>x.id===v.id);assert.equal(v.completed,true);assert.equal(v.completionDate,null);const n=count(f,'store_equipment_events');
  assert.equal((await complete(f,v,{completionDate:null})).status,422);assert.equal(count(f,'store_equipment_events'),n);assert.equal(count(f,'audit_events'),n);
  v=ok(await complete(f,v,{completionDate:'2026-08-15'}));assert.equal(v.completionDate,'2026-08-15');
 }finally{f.sql.close()}
});
