import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
import {compiled,Host,walk,plugin} from './test-support/hr-ui-fixture.mjs';
const {HrService}=await compiled('worker/hr/hr-service.ts');
const {HrRosterService}=await compiled('worker/hr/hr-roster-service.ts');
const {HrEmployeeSheet}=await compiled('src/runtime/modules/HrEmployeeSheet.tsx',[plugin]);
const {exportPortableBackup,restoreIntoEmptyDatabase}=await compiled('worker/backup/portable-backup.ts');
const ctx={actor:1,now:new Date().toISOString(),requestId:'synthetic-personnel'};
/** Asia/Taipei calendar date n days from today. */
const day=n=>new Date(Date.now()+8*3600_000+n*86400_000).toISOString().slice(0,10);
function fixture(t){const f=botCenterFixture();t.after(()=>f.sql.close());
 f.sql.prepare("INSERT INTO hr_stores(name,cycle_anchor_date,created_at,updated_at) VALUES('合成調任門市','2026-01-05',?,?)").run(ctx.now,ctx.now);
 const store=f.sql.prepare("SELECT id FROM hr_stores WHERE name='合成調任門市'").get().id;
 f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,job_title_id,created_at,updated_at) VALUES('SYNTHETIC-PERSONNEL','合成員工','active','2000-01-01','2000-01-01',1,1,?,?)").run(ctx.now,ctx.now);
 const id=f.sql.prepare("SELECT id FROM hr_employees WHERE employee_no='SYNTHETIC-PERSONNEL'").get().id;
 f.sql.prepare("INSERT INTO hr_status_changes(employee_id,effective_date,previous_status,next_status,reason,handled_by,created_at) VALUES(?,?,?,?,?,?,?)").run(id,'2000-01-01','active','active','建檔',1,ctx.now);
 for(const [field,value] of [['store_id','1'],['job_title_id','1'],['employment_type','full'],['schedule_mode','shift']])f.sql.prepare("INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at) VALUES(?,?,?,NULL,?,'建檔',1,?)").run(id,field,'2000-01-01',value,ctx.now);
 f.sql.prepare("INSERT INTO hr_stores(name,cycle_anchor_date,created_at,updated_at) VALUES('合成第二門市','2026-01-05',?,?)").run(ctx.now,ctx.now);
 const store2=f.sql.prepare("SELECT id FROM hr_stores WHERE name='合成第二門市'").get().id;
 f.sql.prepare("INSERT INTO hr_job_titles(name,sort_order,updated_at) VALUES('合成新職稱',9,?)").run(ctx.now);
 const title=f.sql.prepare("SELECT id FROM hr_job_titles WHERE name='合成新職稱'").get().id;
 const service=new HrService(f.db),change=(body,at=ctx)=>service.statusChange(id,{reason:'合成異動',...body},at);
 // The fixture employee carries the four assignment 建檔 records a created employee has; rows() lists the records the tests write on top of them.
 const rows=(table)=>f.sql.prepare('SELECT * FROM '+table+' WHERE employee_id=?'+(table==='hr_assignment_changes'?" AND reason<>'建檔'":'')+' ORDER BY id').all(id);
 return {...f,id,store,store2,title,service,change,rows};
}
test('a store change never touches status history: backdated assignment change keeps the 留停 start and the 離職 state',async t=>{
 const f=fixture(t);
 // Repro 1: 留停 from 10 days ago, then a backdated store change. The 留停 start must stay put.
 await f.change({effectiveDate:day(-10),nextStatus:'leave'});
 await f.change({effectiveDate:day(-15),storeId:f.store});
 assert.deepEqual(f.sql.prepare("SELECT effective_date FROM hr_status_changes WHERE employee_id=? AND next_status='leave'").all(f.id).map(r=>r.effective_date),[day(-10)]);
 assert.equal(f.rows('hr_status_changes').length,2,'only 建檔 and the one 留停 record');
 assert.equal((await f.service.get(f.id)).status,'leave');
 // Repro 2: 離職 10 days ago, then a backdated change that mentions 在職. As of that date the status already was 在職: no record, no reset.
 const g=fixture(t);
 await g.change({effectiveDate:day(-9),nextStatus:'terminated',terminationDate:day(-9),terminationReason:'合成離職'});
 await assert.rejects(g.change({effectiveDate:day(-12),nextStatus:'active',storeId:g.store}),/「人事狀態」.*已經是「在職」/,'a ticked field equal to its value on that date is rejected, not skipped');
 assert.equal(g.rows('hr_assignment_changes').length,0,'nothing is written when any ticked field is rejected');
 await g.change({effectiveDate:day(-12),storeId:g.store});
 let row=g.sql.prepare('SELECT status,termination_date,termination_reason FROM hr_employees WHERE id=?').get(g.id);
 assert.deepEqual({...row},{status:'terminated',termination_date:day(-9),termination_reason:'合成離職'});
 assert.equal(g.rows('hr_status_changes').length,2);assert.equal(g.rows('hr_assignment_changes').length,1);
 // A backdated status record that is not the latest changes history only, never the cached state or termination data.
 await g.change({effectiveDate:day(-12),nextStatus:'leave'});
 row=g.sql.prepare('SELECT status,termination_date,termination_reason FROM hr_employees WHERE id=?').get(g.id);
 assert.deepEqual({...row},{status:'terminated',termination_date:day(-9),termination_reason:'合成離職'});
 assert.equal((await g.service.get(g.id)).status,'terminated');
 // Reinstating later than the 離職 clears the termination data (the record decides today's status).
 await g.change({effectiveDate:day(-1),nextStatus:'active'});
 row=g.sql.prepare('SELECT status,termination_date FROM hr_employees WHERE id=?').get(g.id);
 assert.deepEqual({...row},{status:'active',termination_date:null});
 assert.deepEqual(g.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('each changed field writes exactly one record and leaves every other field alone',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(-1),jobTitleId:f.title});
 assert.equal(f.rows('hr_status_changes').length,1,'no status record for a title change');
 let records=f.rows('hr_assignment_changes');
 assert.equal(records.length,1);assert.deepEqual({field:records[0].field,previous:records[0].previous_value,next:records[0].next_value,effective:records[0].effective_date},{field:'job_title_id',previous:'1',next:String(f.title),effective:day(-1)});
 let now=await f.service.get(f.id);
 assert.equal(now.job_title_id,f.title);assert.equal(now.store_id,1);assert.equal(now.employment_type,'full');assert.equal(now.schedule_mode,'shift');assert.equal(now.status,'active');
 // All five at once: five single-field records, same 生效日期, each remembering the value it replaced.
 await f.change({effectiveDate:day(-1),nextStatus:'leave',storeId:f.store,employmentType:'casual',scheduleMode:'hours'});
 assert.equal(f.rows('hr_status_changes').length,2);
 records=f.rows('hr_assignment_changes');
 assert.deepEqual(records.slice(1).map(r=>[r.field,r.previous_value,r.next_value,r.effective_date]),[['store_id','1',String(f.store),day(-1)],['employment_type','full','casual',day(-1)],['schedule_mode','shift','hours',day(-1)]]);
 now=await f.service.get(f.id);
 assert.deepEqual([now.status,now.store_id,now.job_title_id,now.employment_type,now.schedule_mode],['leave',f.store,f.title,'casual','hours']);
 assert.deepEqual([...now.assignmentChanges.map(r=>r.recorded_date)],Array(8).fill(day(0)),'異動日期 is the Taipei date the record was written');
 assert.equal(now.statusChanges[0].recorded_date,day(0));
 assert.equal(f.sql.prepare('SELECT store_id FROM hr_employees WHERE id=?').get(f.id).store_id,f.store,'the master column holds today\'s value; the 建檔 record keeps the old one');
 assert.deepEqual(f.sql.prepare("SELECT next_value FROM hr_assignment_changes WHERE employee_id=? AND field='store_id' AND reason='建檔'").all(f.id).map(r=>r.next_value),['1']);
 assert.equal((await f.service.salaryOverview()).find(x=>x.id===f.id).storeId,f.store);
 await new HrRosterService(f.db).updateStaff(f.store,{staff:[{employeeId:f.id,rosterSort:7,skipRosterChecks:true}]},ctx);
 assert.equal(f.sql.prepare('SELECT roster_sort FROM hr_employees WHERE id=?').get(f.id).roster_sort,7);
 await assert.rejects(f.change({effectiveDate:day(-1)}),/沒有任何/);
 await assert.rejects(f.change({effectiveDate:day(-1),storeId:f.store,nextStatus:'leave'}),/「人事狀態」.*留職停薪/,'a sent field equal to the value on that date is an error naming the field');
 await assert.rejects(f.change({effectiveDate:day(-1),storeId:f.store}),/「門市」.*合成調任門市/);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('a field takes the latest record by 生效日期 and id; future records stay pending',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(0),storeId:f.store});
 assert.equal((await f.service.get(f.id)).store_id,f.store,'a record dated today is already in force');
 await f.change({effectiveDate:day(1),storeId:1});
 await f.change({effectiveDate:day(2),nextStatus:'leave',jobTitleId:f.title});
 let now=await f.service.get(f.id);
 assert.deepEqual([now.store_id,now.job_title_id,now.status],[f.store,1,'active'],'tomorrow and later is pending');
 assert.equal(f.sql.prepare('SELECT status FROM hr_employees WHERE id=?').get(f.id).status,'active','cached status is also today\'s');
 // A backdated record written later (larger id) does not beat the record whose 生效日期 is later.
 await f.change({effectiveDate:day(-5),storeId:f.store2});
 assert.equal((await f.service.get(f.id)).store_id,f.store);
 assert.equal((await f.service.list('SYNTHETIC',undefined,0)).items[0].status,'active');
});
test('two fields changed on one date are two records with the same 生效日期',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(3),storeId:f.store,jobTitleId:f.title});
 const records=f.rows('hr_assignment_changes');
 assert.deepEqual(records.map(r=>[r.field,r.effective_date]),[['store_id',day(3)],['job_title_id',day(3)]]);
 assert.equal(f.rows('hr_status_changes').length,1);
});
test('employment type and schedule must stay compatible on the effective date and at every later dated record',async t=>{
 const f=fixture(t);
 await assert.rejects(f.change({effectiveDate:day(-1),scheduleMode:'hours'}),/不相容/,'正職 must stay 班別');
 await assert.rejects(f.change({effectiveDate:day(-1),employmentType:'half',scheduleMode:'none'}),/不相容/);
 assert.equal(f.rows('hr_assignment_changes').length,0);
 await f.change({effectiveDate:day(-1),employmentType:'casual'});
 await f.change({effectiveDate:day(10),scheduleMode:'hours'});
 // 正職/班別 would be fine on day 5, but the already planned 時段 on day 10 would then belong to a 正職.
 await assert.rejects(f.change({effectiveDate:day(5),employmentType:'full'}),/不相容/);
 assert.equal(f.rows('hr_assignment_changes').length,2);
 await f.change({effectiveDate:day(5),employmentType:'half'});
 assert.equal(f.rows('hr_assignment_changes').length,3);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('profile editing still rejects the four assignment fields',async t=>{
 const f=fixture(t);
 const revision=()=>f.service.get(f.id).then(x=>x.revision);
 for(const patch of [{storeId:f.store},{jobTitleId:f.title},{employmentType:'casual'},{scheduleMode:'hours'}])
  await assert.rejects(f.service.update(f.id,{revision:await revision(),...patch},ctx),/狀態異動/);
 assert.equal(f.rows('hr_assignment_changes').length,0);
});
test('payroll unpaid-period detection reads only status records, so assignment records do not move it',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(-10),nextStatus:'leave'});
 const unpaid=()=>f.sql.prepare("SELECT id,effective_date,next_status FROM hr_status_changes WHERE employee_id=? AND effective_date<=? ORDER BY effective_date,id").all(f.id,day(0)).map(r=>({...r}));
 const before=unpaid();
 await f.change({effectiveDate:day(-20),storeId:f.store,jobTitleId:f.title});
 await f.change({effectiveDate:day(-12),employmentType:'casual',scheduleMode:'none'});
 assert.deepEqual(unpaid(),before);
});
const redundantError=async(promise)=>{try{await promise}catch(e){return e}throw new Error('expected rejection')};
test('unchecked fields are simply not sent: they are neither changed nor given a record',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(-1),storeId:f.store});
 assert.equal(f.rows('hr_status_changes').length,1);assert.equal(f.rows('hr_assignment_changes').length,1);
 const now=await f.service.get(f.id);
 assert.deepEqual([now.status,now.job_title_id,now.employment_type,now.schedule_mode],['active',1,'full','shift']);
});
test('a ticked field equal to its value as of the effective date is rejected, also when today differs',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(-5),storeId:f.store});
 await f.change({effectiveDate:day(10),storeId:f.store2});
 // Today the store is f.store, but on day 12 it will already be f.store2.
 await assert.rejects(f.change({effectiveDate:day(12),storeId:f.store2}),e=>/「門市」.*合成第二門市/.test(e.message)&&e.status===422);
 await f.change({effectiveDate:day(12),storeId:f.store});
 // Between the two records the value is f.store, so ticking it there is rejected as well.
 await assert.rejects(f.change({effectiveDate:day(3),storeId:f.store}),/「門市」/);
 assert.equal(f.rows('hr_assignment_changes').length,3);
});
test('redundant later records: report, delete exactly those with an audit row each, or keep them',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(10),storeId:f.store});      // store 1 -> A on day 10
 await f.change({effectiveDate:day(20),storeId:f.store2});     // A -> B on day 20
 const second=f.rows('hr_assignment_changes')[1];
 // Setting B on day 15 makes the day-20 record (→ B) a no-op, because B is already in force. The day-10 record is untouched.
 const e=await redundantError(f.change({effectiveDate:day(15),storeId:f.store2}));
 assert.equal(e.status,409);assert.equal(e.extra.code,'HR_REDUNDANT_LATER_CHANGES');
 assert.deepEqual(e.extra.details.items,[{id:'a'+second.id,field:'store_id',fieldLabel:'門市',effectiveDate:day(20),previous:String(f.store2),next:String(f.store2),previousLabel:'合成第二門市',nextLabel:'合成第二門市'}]);
 assert.equal(f.rows('hr_assignment_changes').length,2,'nothing written on 409');
 // A list that does not cover exactly the reported records is not accepted either.
 await assert.rejects(f.change({effectiveDate:day(15),storeId:f.store2,deleteRedundantIds:[]}),/較晚生效/);
 await assert.rejects(f.change({effectiveDate:day(15),storeId:f.store2,deleteRedundantIds:['a'+second.id,'a99999']}),/較晚生效/);
 await assert.rejects(f.change({effectiveDate:day(15),storeId:f.store2,deleteRedundantIds:['a'+second.id],keepRedundant:true}),/不能同時/);
 const auditCount=action=>f.sql.prepare('SELECT count(*) n FROM audit_events WHERE action=?').get(action).n;
 // Delete path.
 await f.change({effectiveDate:day(15),storeId:f.store2,deleteRedundantIds:['a'+second.id]});
 assert.deepEqual(f.rows('hr_assignment_changes').map(r=>[r.effective_date,r.next_value]),[[day(10),String(f.store)],[day(15),String(f.store2)]]);
 assert.equal(auditCount('hr_employee.assignment_change_deleted'),1);
 const deleted=JSON.parse(f.sql.prepare("SELECT before_json b FROM audit_events WHERE action='hr_employee.assignment_change_deleted'").get().b);
 assert.deepEqual([deleted.id,deleted.effective_date,deleted.next_value,deleted.previous_value],[second.id,day(20),String(f.store2),String(f.store)],'the audit keeps the deleted row as stored');
 assert.equal((await f.service.get(f.id)).store_id,1,'all remaining records are in the future');
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 // Keep path on a fresh employee: the record stays and is shown as having no change.
 const g=fixture(t);
 await g.change({effectiveDate:day(10),storeId:g.store});
 await g.change({effectiveDate:day(20),storeId:g.store2});
 await g.change({effectiveDate:day(15),storeId:g.store2,keepRedundant:true});
 assert.equal(g.rows('hr_assignment_changes').length,3);
 assert.equal(g.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_employee.assignment_change_deleted'").get().n,0);
 const shown=(await g.service.get(g.id)).assignmentChanges.filter(r=>r.reason!=='建檔');
 assert.deepEqual(shown.map(r=>[r.effective_date,r.no_effect]),[[day(20),true],[day(15),false],[day(10),false]]);
});
test('status records follow the same redundancy rule and the cached status ignores deleted records',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(-10),nextStatus:'leave'});
 await f.change({effectiveDate:day(-3),nextStatus:'terminated',terminationDate:day(-3),terminationReason:'合成離職'});
 const last=f.rows('hr_status_changes')[2];
 // Another 離職 earlier makes the later 離職 record a no-op; deleting it makes the new record the one that decides today.
 const e=await redundantError(f.change({effectiveDate:day(-6),nextStatus:'terminated',terminationDate:day(-6),terminationReason:'合成較早離職'}));
 assert.equal(e.status,409);assert.deepEqual(e.extra.details.items.map(x=>[x.id,x.field,x.previousLabel,x.nextLabel]),[['s'+last.id,'status','離職','離職']]);
 await f.change({effectiveDate:day(-6),nextStatus:'terminated',terminationDate:day(-6),terminationReason:'合成較早離職',deleteRedundantIds:['s'+last.id]});
 assert.deepEqual(f.rows('hr_status_changes').map(r=>r.next_status),['active','leave','terminated']);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_employee.status_change_deleted'").get().n,1);
 const row=f.sql.prepare('SELECT status,termination_date,termination_reason FROM hr_employees WHERE id=?').get(f.id);
 assert.deepEqual({...row},{status:'terminated',termination_date:day(-6),termination_reason:'合成較早離職'});
 // The 建檔 record is never reported or flagged, however it compares to what follows.
 const shown=(await f.service.get(f.id)).statusChanges;
 assert.deepEqual(shown.map(r=>r.no_effect),[false,false,false]);
});
test('the previous value shown comes from the preceding record, not from what was stored at write time',async t=>{
 const f=fixture(t);
 await f.change({effectiveDate:day(-2),storeId:f.store2});     // stored previous = base store
 await f.change({effectiveDate:day(-8),storeId:f.store});      // back-dated: now sits before it
 const stored=f.rows('hr_assignment_changes');
 assert.equal(stored[0].previous_value,'1','stored value is left as it was written (audit)');
 const shown=(await f.service.get(f.id)).assignmentChanges.filter(r=>r.reason!=='建檔');
 assert.deepEqual(shown.map(r=>[r.effective_date,r.previous_value,r.next_value]),[[day(-2),String(f.store),String(f.store2)],[day(-8),'1',String(f.store)]]);
 assert.equal(shown[0].stored_previous_value,'1');
 assert.deepEqual(shown.map(r=>r.no_effect),[false,false]);
 // Status ledger: 建檔 keeps its baseline, a back-dated 留停 inserted before a later 離職 becomes that record's previous.
 await f.change({effectiveDate:day(-1),nextStatus:'terminated',terminationDate:day(-1),terminationReason:'合成離職'});
 await f.change({effectiveDate:day(-5),nextStatus:'leave'});
 const status=(await f.service.get(f.id)).statusChanges;
 assert.deepEqual(status.map(r=>[r.next_status,r.previous_status,r.stored_previous_status]),[['terminated','leave','active'],['leave','active','active'],['active','active','active']]);
});
test('employee list filters by current store and employment type, validates them, and still pages',async t=>{
 const f=fixture(t);
 const add=(no,name)=>{f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,job_title_id,created_at,updated_at) VALUES(?,?,'active','2000-01-01','2000-01-01',1,1,?,?)").run(no,name,ctx.now,ctx.now);
  const id=f.sql.prepare('SELECT id FROM hr_employees WHERE employee_no=?').get(no).id;
  f.sql.prepare("INSERT INTO hr_status_changes(employee_id,effective_date,previous_status,next_status,reason,handled_by,created_at) VALUES(?,?,?,?,?,?,?)").run(id,'2000-01-01','active','active','建檔',1,ctx.now);return id};
 const second=add('SYNTH-B','合成乙'),third=add('SYNTH-C','合成丙');
 // f.id and the two new ones start in store 1 / 正職. Today's store of the second is f.store; the third moves tomorrow (still store 1 today).
 await f.service.statusChange(second,{effectiveDate:day(-1),reason:'合成',storeId:f.store,employmentType:'casual',scheduleMode:'hours'},ctx);
 await f.service.statusChange(third,{effectiveDate:day(1),reason:'合成',storeId:f.store},ctx);
 const names=async(filters,q='SYNTH')=>(await f.service.list(q,undefined,0,40,filters)).items.map(x=>x.employee_no).sort();
 assert.deepEqual(await names({storeId:f.store}),['SYNTH-B'],'a future store move does not count yet');
 assert.deepEqual(await names({storeId:1}),['SYNTHETIC-PERSONNEL','SYNTH-C'].sort());
 assert.deepEqual(await names({employmentType:'casual'}),['SYNTH-B']);
 assert.deepEqual(await names({storeId:f.store,employmentType:'full'}),[],'filters combine');
 assert.deepEqual(await names({storeId:f.store,employmentType:'casual'}),['SYNTH-B']);
 const shown=(await f.service.list('SYNTH-B',undefined,0)).items[0];
 assert.equal(shown.store_name,'合成調任門市');
 assert.equal((await f.service.list('SYNTHETIC',undefined,0)).items[0].store_name!==undefined,true);
 // Invalid values are rejected, never turned into SQL.
 await assert.rejects(f.service.list('',undefined,0,40,{storeId:0}),/整數/);
 await assert.rejects(f.service.list('',undefined,0,40,{employmentType:"full' OR '1'='1"}),/僱用型態錯誤/);
 // Paging keeps the filter: two pages of one row each cover exactly the matching employees in id order.
 const page1=await f.service.list('',undefined,0,1,{storeId:1});
 assert.equal(page1.items.length,1);assert.ok(page1.nextCursor);
 const page2=await f.service.list('',undefined,page1.nextCursor,1,{storeId:1});
 assert.equal(page2.items.length,1);assert.equal(page2.nextCursor,null);
 assert.deepEqual([page1.items[0].employee_no,page2.items[0].employee_no],['SYNTHETIC-PERSONNEL','SYNTH-C']);
});
test('stale forms and concurrent submissions are rejected without leaving records',async t=>{
 const f=fixture(t),before=await f.service.get(f.id);
 await f.change({effectiveDate:day(-1),storeId:f.store,expectedRevision:before.revision});
 const counts=()=>[f.rows('hr_status_changes').length,f.rows('hr_assignment_changes').length];
 const snapshot=counts();
 await assert.rejects(f.change({effectiveDate:day(-1),jobTitleId:f.title,expectedRevision:before.revision}),/其他人修改/);
 assert.deepEqual(counts(),snapshot);
 for(const patch of [{storeId:999999},{jobTitleId:999999},{employmentType:'bogus'}])await assert.rejects(f.change({effectiveDate:day(-1),...patch}));
 assert.deepEqual(counts(),snapshot);
 const race=await Promise.allSettled([1,2].map(n=>f.change({effectiveDate:day(-1),jobTitleId:f.title,reason:'合成並發'+n,expectedRevision:before.revision+1},{...ctx,now:new Date(Date.now()+n).toISOString()})));
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'two submissions from the same form: only one is written');
 assert.equal(f.rows('hr_assignment_changes').length,snapshot[1]+1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_employee.assignment_changed'").get().n,2,'one audit per record');
});
test('records with assignment history block deleting the employee',async t=>{
 const f=fixture(t);
 f.sql.prepare('DELETE FROM hr_status_changes WHERE employee_id=?').run(f.id);
 await f.change({effectiveDate:day(-1),storeId:f.store});
 await assert.rejects(f.service.remove(f.id,{confirmEmployeeNo:'SYNTHETIC-PERSONNEL'},ctx),/不能刪除/);
});
test('assignment history survives portable backup and restore; backups without the table still restore',async t=>{
 const f=fixture(t),target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false}),older=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>{target.sql.close();older.sql.close()});
 await f.change({effectiveDate:day(-2),nextStatus:'leave',storeId:f.store,employmentType:'casual',scheduleMode:'none'});
 await f.change({effectiveDate:day(4),jobTitleId:f.title});
 const bundle=await exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.25.1'});
 await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
 for(const table of ['hr_status_changes','hr_assignment_changes'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table+' ORDER BY id').all(),f.sql.prepare('SELECT * FROM '+table+' ORDER BY id').all(),table);
 assert.deepEqual({...target.sql.prepare('SELECT status,store_id,job_title_id,employment_type,schedule_mode FROM hr_employee_current WHERE id=?').get(f.id)},{status:'leave',store_id:f.store,job_title_id:1,employment_type:'casual',schedule_mode:'none'});
 assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 // A snapshot from before 0081 has neither the table nor any new column: the table restores empty.
 const data=JSON.parse(new TextDecoder().decode(bundle.dataBytes));delete data.tables.hr_assignment_changes;
 const dataBytes=new TextEncoder().encode(JSON.stringify(data)),manifest=JSON.parse(new TextDecoder().decode(bundle.manifestBytes));
 manifest.schemaMigration='0080_store_maintenance_per_machine';manifest.dataByteLength=dataBytes.length;manifest.dataSha256=createHash('sha256').update(dataBytes).digest('hex');
 manifest.recordCounts=Object.fromEntries(Object.entries(data.tables).map(([key,value])=>[key,value.rows.length]));manifest.totalRecordCount=Object.values(manifest.recordCounts).reduce((a,b)=>a+b,0);
 await restoreIntoEmptyDatabase(older.db,{dataBytes,manifestBytes:new TextEncoder().encode(JSON.stringify(manifest))},'synthetic');
 assert.equal(older.sql.prepare('SELECT count(*) n FROM hr_assignment_changes').get().n,4,'0083 upgrade: one 建檔 record per assignment field');
 assert.equal(older.sql.prepare('SELECT count(*) n FROM hr_status_changes').get().n,2);
 assert.deepEqual(older.sql.prepare('PRAGMA foreign_key_check').all(),[]);
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
