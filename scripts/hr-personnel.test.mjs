import test from 'node:test';import assert from 'node:assert/strict';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
import {compiled,Host,walk,plugin} from './test-support/hr-ui-fixture.mjs';
const {HrService}=await compiled('worker/hr/hr-service.ts');
const {HrRosterService}=await compiled('worker/hr/hr-roster-service.ts');
const {HrEmployeeSheet}=await compiled('src/runtime/modules/HrEmployeeSheet.tsx',[plugin]);
const {exportPortableBackup,restoreIntoEmptyDatabase}=await compiled('worker/backup/portable-backup.ts');
const ctx={actor:1,now:new Date().toISOString(),requestId:'synthetic-personnel'};
function fixture(t){const f=botCenterFixture();t.after(()=>f.sql.close());
 f.sql.prepare("INSERT INTO hr_stores(name,cycle_anchor_date,created_at,updated_at) VALUES('合成調任門市','2026-01-05',?,?)").run(ctx.now,ctx.now);
 const store=f.sql.prepare("SELECT id FROM hr_stores WHERE name='合成調任門市'").get().id;
 f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,job_title_id,created_at,updated_at) VALUES('SYNTHETIC-PERSONNEL','合成員工','active','2000-01-01','2000-01-01',1,1,?,?)").run(ctx.now,ctx.now);
 const id=f.sql.prepare("SELECT id FROM hr_employees WHERE employee_no='SYNTHETIC-PERSONNEL'").get().id;
 return {...f,id,store,service:new HrService(f.db)};
}
test('dated personnel changes share current projections, preserve baseline and unrelated fields, and remain immutable in profile editing',async t=>{
 const f=fixture(t),before=await f.service.get(f.id);
 const updated=await f.service.statusChange(f.id,{effectiveDate:'2000-01-02',nextStatus:'active',reason:'合成調任',storeId:f.store,employmentType:'half',scheduleMode:'hours',expectedRevision:before.revision},ctx);
 assert.equal(updated.store_id,f.store);assert.equal(updated.employment_type,'half');assert.equal(updated.schedule_mode,'hours');
 assert.equal(f.sql.prepare('SELECT store_id FROM hr_employees WHERE id=?').get(f.id).store_id,1,'baseline is not overwritten');
 const history=updated.statusChanges[0];assert.equal(history.store_id,f.store);assert.equal(JSON.parse(history.previous_assignment).store_id,1);
 await f.service.statusChange(f.id,{effectiveDate:'2000-01-03',nextStatus:'active',reason:'合成狀態確認'},ctx);
 assert.equal((await f.service.get(f.id)).store_id,f.store,'status-only record does not erase assignment');
 assert.equal((await f.service.salaryOverview()).find(x=>x.id===f.id).storeId,f.store);
 await new HrRosterService(f.db).updateStaff(f.store,{employeeId:f.id,rosterSort:7,skipRosterChecks:true},ctx);
 assert.equal(f.sql.prepare('SELECT roster_sort FROM hr_employees WHERE id=?').get(f.id).roster_sort,7,'moved staff can still update their current-store roster options');
 await assert.rejects(f.service.update(f.id,{revision:(await f.service.get(f.id)).revision,storeId:1},ctx),/狀態異動/);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('new assignment history and its effective projection survive portable backup and restore',async t=>{
 const f=fixture(t),target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>target.sql.close());
 await f.service.statusChange(f.id,{effectiveDate:'2000-01-02',nextStatus:'active',reason:'合成還原',storeId:f.store},ctx);
 const bundle=await exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.25.1'});
 await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
 assert.deepEqual(target.sql.prepare('SELECT * FROM hr_status_changes').all(),f.sql.prepare('SELECT * FROM hr_status_changes').all());
 assert.equal(target.sql.prepare('SELECT store_id FROM hr_employee_current WHERE id=?').get(f.id).store_id,f.store);
 assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('a pristine mistaken employee can still be removed from the base table',async t=>{
 const f=fixture(t);await f.service.remove(f.id,{confirmEmployeeNo:'SYNTHETIC-PERSONNEL'},ctx);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM hr_employees WHERE id=?').get(f.id).n,0);
});
test('employee sheet retains status and exposes assignment selectors only at creation',()=>{
 const host=new Host();const value={employeeNo:'SYNTHETIC',name:'合成員工',status:'leave',storeId:'1',jobTitleId:'1',employmentType:'full',scheduleMode:'shift',contacts:[],education:[],workHistory:[],mobile:'',phone:'',mailingAddress:'',registeredAddress:'',nationalId:'',hireDate:'',seniorityStartDate:'',note:''};
 const props={value,detail:null,editing:true,creating:false,busy:false,members:[],stores:[{id:1,name:'合成門市'}],jobTitles:[{id:1,name:'合成職稱'}],patch(){},onReveal(){}};
 const cells=tree=>walk(tree).find(n=>n.type?.name==='RecordSheet').props.rows.flatMap(row=>row.cells);
 try{
  const saved=cells(host.render(HrEmployeeSheet,props));
  for(const label of ['人事狀態','門市','職稱','僱用型態','排班方式'])assert.equal(saved.find(c=>c.label===label).edit,undefined,label+' is immutable in profile edit');
  assert.equal(saved.find(c=>c.label==='人事狀態').view,'留職停薪');
  const creating=cells(host.render(HrEmployeeSheet,{...props,creating:true,value:{...value,status:'probation'}}));
  for(const label of ['人事狀態','門市','職稱','僱用型態','排班方式'])assert.ok(creating.find(c=>c.label===label).edit,label+' remains editable on create');
 }finally{host.close();delete globalThis.hrHost;}
});
test('future assignments stay pending and validation rejects invalid settings, incompatible schedules and stale forms',async t=>{
 const f=fixture(t),before=await f.service.get(f.id);
 await f.service.statusChange(f.id,{effectiveDate:'2099-01-01',nextStatus:'active',reason:'合成未來調任',storeId:f.store,expectedRevision:before.revision},ctx);
 assert.equal((await f.service.get(f.id)).store_id,1);
 const count=f.sql.prepare('SELECT count(*) n FROM hr_status_changes').get().n;
 for(const patch of [{employmentType:'full',scheduleMode:'none'},{storeId:999999},{expectedRevision:before.revision}])await assert.rejects(f.service.statusChange(f.id,{effectiveDate:'2000-01-02',nextStatus:'active',reason:'合成無效',...patch},ctx));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM hr_status_changes').get().n,count);
});
