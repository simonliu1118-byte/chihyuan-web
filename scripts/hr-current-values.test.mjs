import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {build} from 'esbuild';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
import {compiled} from './test-support/hr-ui-fixture.mjs';
const {HrService}=await compiled('worker/hr/hr-service.ts');
const {HrPayrollService}=await compiled('worker/hr/hr-payroll-service.ts');
const {rollHrCurrentValues,ROLL_BATCH}=await compiled('worker/hr/hr-current-values.ts');
const {exportPortableBackup,restoreIntoEmptyDatabase}=await compiled('worker/backup/portable-backup.ts');
const {CYWEB_CRON,cywebCronTasks}=await import('../shared/cyweb-cron.ts');
let worker;{const dir=mkdtempSync(join(tmpdir(),'cyweb-hrcv-'));try{const outfile=join(dir,'worker.mjs');await build({entryPoints:['worker/index.ts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});worker=(await import(pathToFileURL(outfile))).default;}finally{rmSync(dir,{recursive:true,force:true});}}
const ctx={actor:1,now:new Date().toISOString(),requestId:'synthetic-current-values'};
/** Asia/Taipei calendar date n days from today. */
const day=n=>new Date(Date.now()+8*3600_000+n*86400_000).toISOString().slice(0,10);
/** The scheduled tick at Taiwan 00:00 (UTC 16:00) that begins the Taipei date `date`. */
const midnight=date=>Date.parse(date+'T00:00:00+08:00');
const runCron=(f,time)=>worker.scheduled({cron:CYWEB_CRON,scheduledTime:time},{DB:f.db});
const COLUMNS='status,store_id,job_title_id,employment_type,schedule_mode,termination_date,termination_reason';
const master=(f,id)=>({...f.sql.prepare('SELECT '+COLUMNS+' FROM hr_employees WHERE id=?').get(id)});
const view=(f,id)=>({...f.sql.prepare('SELECT '+COLUMNS+' FROM hr_employee_current WHERE id=?').get(id)});
function extras(f){
 f.sql.prepare("INSERT INTO hr_stores(name,cycle_anchor_date,created_at,updated_at) VALUES('合成第二門市','2026-01-05',?,?)").run(ctx.now,ctx.now);
 f.sql.prepare("INSERT INTO hr_job_titles(name,sort_order,updated_at) VALUES('合成新職稱',9,?)").run(ctx.now);
 return {store2:f.sql.prepare("SELECT id FROM hr_stores WHERE name='合成第二門市'").get().id,title2:f.sql.prepare("SELECT id FROM hr_job_titles WHERE name='合成新職稱'").get().id};
}
const profile=(no,over={})=>({employeeNo:no,name:'合成員工'+no,nationalId:'A123456789',birthDate:'1990-01-01',gender:'F',mobile:'0900000000',mailingAddress:'合成地址',registeredAddress:'合成地址',hireDate:'2025-03-01',storeId:1,jobTitleId:1,employmentType:'full',scheduleMode:'shift',status:'active',contacts:[{name:'合成聯絡人',phone:'0911111111'}],education:[],workHistory:[],...over});
async function created(f,over={},no='SYNTH-CV'){const service=new HrService(f.db);const e=await service.create(profile(no,over),ctx);return {service,id:e.id,e};}

test('creating an employee writes a 建檔 record for each of the five fields, at the hire date, and the master holds the same values',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const {id,e}=await created(f,{employmentType:'half',scheduleMode:'hours',status:'probation'});
 const status=f.sql.prepare('SELECT * FROM hr_status_changes WHERE employee_id=?').all(id);
 assert.deepEqual(status.map(r=>[r.effective_date,r.previous_status,r.next_status,r.reason]),[['2025-03-01','probation','probation','建檔']]);
 const records=f.sql.prepare('SELECT field,effective_date,previous_value,next_value,reason,handled_by FROM hr_assignment_changes WHERE employee_id=? ORDER BY id').all(id).map(r=>({...r}));
 assert.deepEqual(records,[['store_id','1'],['job_title_id','1'],['employment_type','half'],['schedule_mode','hours']].map(([field,next_value])=>({field,effective_date:'2025-03-01',previous_value:null,next_value,reason:'建檔',handled_by:1})));
 assert.equal(e.assignmentChanges.length,4);assert.equal(e.deletable,true,'建檔 records alone do not make an employee undeletable');
 assert.deepEqual(master(f,id),{status:'probation',store_id:1,job_title_id:1,employment_type:'half',schedule_mode:'hours',termination_date:null,termination_reason:null});
 assert.deepEqual(view(f,id),master(f,id));
 assert.deepEqual(e.assignmentChanges.map(r=>r.no_effect),[false,false,false,false]);
 await new HrService(f.db).remove(id,{confirmEmployeeNo:'SYNTH-CV'},ctx);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM hr_assignment_changes').get().n,0);
});
test('statusChange today, backdated and future: the master columns always hold today\'s value, and equal the view',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const {store2,title2}=extras(f);const {service,id}=await created(f);
 f.sql.prepare("INSERT INTO hr_stores(name,cycle_anchor_date,created_at,updated_at) VALUES('合成第三門市','2026-01-05',?,?)").run(ctx.now,ctx.now);
 const store3=f.sql.prepare("SELECT id FROM hr_stores WHERE name='合成第三門市'").get().id;
 const change=body=>service.statusChange(id,{reason:'合成異動',...body},ctx);
 await change({effectiveDate:day(0),storeId:store2});
 assert.equal(master(f,id).store_id,store2,'a change effective today lands in the master');
 await change({effectiveDate:day(-10),jobTitleId:title2,employmentType:'casual',scheduleMode:'none'});
 assert.deepEqual([master(f,id).job_title_id,master(f,id).employment_type,master(f,id).schedule_mode],[title2,'casual','none'],'a backdated change with no later record becomes today\'s value');
 await change({effectiveDate:day(-20),storeId:store3});
 assert.equal(master(f,id).store_id,store2,'a backdated record never overwrites the newer value');
 await change({effectiveDate:day(5),storeId:1,nextStatus:'leave'});
 assert.deepEqual([master(f,id).store_id,master(f,id).status],[store2,'active'],'a future record leaves the master alone');
 assert.deepEqual(view(f,id),master(f,id));
 const detail=await service.get(id);assert.equal(detail.store_id,store2);
 // Every field's history starts with its 建檔 record, so the first record has no previous value and is never "no change".
 const stores=detail.assignmentChanges.filter(r=>r.field==='store_id').sort((a,b)=>a.effective_date.localeCompare(b.effective_date));
 assert.deepEqual(stores.map(r=>[r.effective_date,r.previous_value,r.next_value,r.no_effect,r.reason]),[['2025-03-01',null,'1',false,'建檔'],[day(-20),'1',String(store3),false,'合成異動'],[day(0),String(store3),String(store2),false,'合成異動'],[day(5),String(store2),'1',false,'合成異動']]);
});
test('a future record is applied by the daily task at Taiwan midnight, with one audit row, and a second run changes nothing',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const {store2,title2}=extras(f);const {service,id}=await created(f);
 await service.statusChange(id,{reason:'合成異動',effectiveDate:day(3),storeId:store2,nextStatus:'terminated',terminationDate:day(3),terminationReason:'合成離職'},ctx);
 await service.statusChange(id,{reason:'合成異動',effectiveDate:day(3),jobTitleId:title2},ctx);
 const before=master(f,id);
 assert.deepEqual(before,{status:'active',store_id:1,job_title_id:1,employment_type:'full',schedule_mode:'shift',termination_date:day(3),termination_reason:'合成離職'},'future 離職 data waits in the master');
 const revision=f.sql.prepare('SELECT revision FROM hr_employees WHERE id=?').get(id).revision;
 // The day before: nothing is due.
 await runCron(f,midnight(day(2)));
 assert.deepEqual(master(f,id),before);assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_employee.current_values_rolled'").get().n,0);
 await runCron(f,midnight(day(3)));
 assert.deepEqual(master(f,id),{status:'terminated',store_id:store2,job_title_id:title2,employment_type:'full',schedule_mode:'shift',termination_date:day(3),termination_reason:'合成離職'});
 const row=f.sql.prepare('SELECT revision,updated_at,updated_by FROM hr_employees WHERE id=?').get(id);
 assert.equal(row.revision,revision+1);assert.equal(row.updated_by,null,'system actor');assert.equal(row.updated_at,new Date(midnight(day(3))).toISOString());
 const audits=f.sql.prepare("SELECT * FROM audit_events WHERE action='hr_employee.current_values_rolled'").all();
 assert.equal(audits.length,1);assert.equal(audits[0].actor_employee_id,null);
 const body=x=>JSON.parse(x);assert.deepEqual(body(audits[0].before_json),{status:'active',store_id:1,job_title_id:1});assert.deepEqual(body(audits[0].after_json),{status:'terminated',store_id:store2,job_title_id:title2,asOf:day(3)});
 // Second chance at 00:30 and a repeated run: idempotent.
 await runCron(f,midnight(day(3))+30*60_000);await rollHrCurrentValues(f.db,new Date(midnight(day(3))+3600_000).toISOString());
 assert.equal(f.sql.prepare('SELECT revision FROM hr_employees WHERE id=?').get(id).revision,revision+1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_employee.current_values_rolled'").get().n,1);
});
test('rolling forward from 離職 to a future 在職 record clears the termination data; a pending 離職 keeps it',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const {service,id}=await created(f);
 await service.statusChange(id,{reason:'合成',effectiveDate:day(-3),nextStatus:'terminated',terminationDate:day(-3),terminationReason:'合成離職'},ctx);
 await service.statusChange(id,{reason:'合成復職',effectiveDate:day(2),nextStatus:'active'},ctx);
 assert.deepEqual([master(f,id).status,master(f,id).termination_reason],['terminated','合成離職']);
 await runCron(f,midnight(day(2)));
 assert.deepEqual([master(f,id).status,master(f,id).termination_date,master(f,id).termination_reason],['active',null,null]);
 // A 離職 record still waiting must not lose its data when an unrelated record reaches its date.
 await service.statusChange(id,{reason:'合成',effectiveDate:day(9),nextStatus:'terminated',terminationDate:day(9),terminationReason:'合成再離職'},ctx);
 await service.statusChange(id,{reason:'合成',effectiveDate:day(4),employmentType:'half'},ctx);
 await runCron(f,midnight(day(4)));
 assert.deepEqual([master(f,id).employment_type,master(f,id).status,master(f,id).termination_reason],['half','active','合成再離職']);
});
test('redundant later records deleted with a save leave the master correct',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const {store2}=extras(f);const {service,id}=await created(f);
 const change=(body)=>service.statusChange(id,{reason:'合成',...body},ctx);
 await change({effectiveDate:day(-5),storeId:store2});await change({effectiveDate:day(-3),storeId:1});
 assert.equal(master(f,id).store_id,1);
 // Setting store2 earlier makes the day -5 record (→ store2) pointless; delete it with the save.
 const conflict=await change({effectiveDate:day(-8),storeId:store2}).then(()=>null,e=>e);
 assert.equal(conflict.status,409);const ids=conflict.extra.details.items.map(i=>i.id);assert.equal(ids.length,1);
 assert.equal(master(f,id).store_id,1,'nothing written on 409');
 await change({effectiveDate:day(-8),storeId:store2,deleteRedundantIds:ids});
 assert.deepEqual(f.sql.prepare("SELECT effective_date,next_value FROM hr_assignment_changes WHERE employee_id=? AND field='store_id' AND reason<>'建檔' ORDER BY effective_date").all(id).map(r=>[r.effective_date,r.next_value]),[[day(-8),String(store2)],[day(-3),'1']]);
 assert.equal(master(f,id).store_id,1);assert.deepEqual(view(f,id),master(f,id));
 // Deleting a redundant record that decided today's value: the master follows the surviving records.
 const g=botCenterFixture();t.after(()=>g.sql.close());const h=await created(g);
 g.sql.prepare("INSERT INTO hr_stores(name,cycle_anchor_date,created_at,updated_at) VALUES('合成第三門市','2026-01-05',?,?)").run(ctx.now,ctx.now);const store3=g.sql.prepare("SELECT id FROM hr_stores WHERE name='合成第三門市'").get().id;
 await h.service.statusChange(h.id,{reason:'合成',effectiveDate:day(-2),storeId:store3},ctx);
 const clash=await h.service.statusChange(h.id,{reason:'合成',effectiveDate:day(-6),storeId:store3},ctx).then(()=>null,e=>e);
 await h.service.statusChange(h.id,{reason:'合成',effectiveDate:day(-6),storeId:store3,deleteRedundantIds:clash.extra.details.items.map(i=>i.id)},ctx);
 assert.equal(master(g,h.id).store_id,store3);assert.deepEqual(view(g,h.id),master(g,h.id));
 // Status redundancy: the same.
 const k=await created(g,{},'SYNTH-CV2');
 await k.service.statusChange(k.id,{reason:'合成',effectiveDate:day(-2),nextStatus:'leave'},ctx);
 const statusClash=await k.service.statusChange(k.id,{reason:'合成',effectiveDate:day(-6),nextStatus:'leave'},ctx).then(()=>null,e=>e);
 await k.service.statusChange(k.id,{reason:'合成',effectiveDate:day(-6),nextStatus:'leave',deleteRedundantIds:statusClash.extra.details.items.map(i=>i.id)},ctx);
 assert.equal(master(g,k.id).status,'leave');assert.deepEqual(view(g,k.id),master(g,k.id));
});
test('roll-forward handles more than one batch, skips employees that are already current and records nothing for them',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const {store2}=extras(f);
 const total=ROLL_BATCH*2+7;
 for(let i=0;i<total;i++){
  const id=Number(f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,job_title_id,created_at,updated_at) VALUES(?,?,'active','2025-01-01','2025-01-01',1,1,?,?)").run('SYNTH-B'+i,'合成'+i,ctx.now,ctx.now).lastInsertRowid);
  f.sql.prepare("INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,created_at) VALUES(?,?,?,?,?,?,?)").run(id,'store_id','2025-01-01',null,'1','建檔',ctx.now);
  if(i%2===0)f.sql.prepare("INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,created_at) VALUES(?,?,?,?,?,?,?)").run(id,'store_id',day(1),'1',String(store2),'合成',ctx.now);
 }
 const due=Math.ceil(total/2);
 assert.deepEqual(await rollHrCurrentValues(f.db,new Date(midnight(day(1))).toISOString()),{date:day(1),changed:due});
 assert.equal(f.sql.prepare('SELECT count(*) n FROM hr_employees WHERE store_id=?').get(store2).n,due);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_employee.current_values_rolled'").get().n,due);
 assert.equal((await rollHrCurrentValues(f.db,new Date(midnight(day(1))).toISOString())).changed,0);
});
test('a concurrent edit makes the roll-forward skip that employee without an audit row; the next run catches it',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const {store2}=extras(f);const {service,id}=await created(f);
 await service.statusChange(id,{reason:'合成',effectiveDate:day(2),storeId:store2},ctx);
 const real=f.db.batch.bind(f.db);let raced=false;
 f.db.batch=async statements=>{if(!raced){raced=true;f.sql.prepare('UPDATE hr_employees SET revision=revision+1 WHERE id=?').run(id);}return real(statements);};
 const now=new Date(midnight(day(2))).toISOString();
 assert.equal((await rollHrCurrentValues(f.db,now)).changed,0);assert.equal(master(f,id).store_id,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_employee.current_values_rolled'").get().n,0);
 assert.equal((await rollHrCurrentValues(f.db,now)).changed,1);assert.equal(master(f,id).store_id,store2);
});
test('cron wiring: hrCurrentValues at Taiwan 00:00 and 00:30 only, inside the single trigger, independent of the other jobs',async t=>{
 const at=time=>Date.parse('2026-11-25T'+time+':00Z');
 for(const time of ['16:00','16:30'])assert.equal(cywebCronTasks(at(time)).hrCurrentValues,true,time);
 for(const time of ['15:55','16:05','16:15','16:35','17:00','03:30','19:30'])assert.equal(cywebCronTasks(at(time)).hrCurrentValues,false,time);
 assert.equal(CYWEB_CRON,'*/5 * * * *');
 // A failing roll-forward is reported but never stops the other jobs scheduled on that tick.
 const f=botCenterFixture();t.after(()=>f.sql.close());f.sql.exec('ALTER TABLE hr_status_changes RENAME TO hr_status_changes_x');
 const queries=[];const db={...f.db,prepare(q){queries.push(q);return f.db.prepare(q);}};
 await assert.rejects(worker.scheduled({cron:CYWEB_CRON,scheduledTime:at('16:00')},{DB:db}));
 assert.ok(queries.some(q=>/hr_status_changes/.test(q)),'the roll-forward ran and failed');
 assert.ok(queries.some(q=>/erp_item_queries/.test(q)),'the ERP housekeeping on the same tick still ran');
});
test('migration 0083 on a pre-0083 database: 建檔 records, projection, termination, existing records untouched, idempotent',async t=>{
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');
 const files=readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort();
 const target=files.find(n=>n.startsWith('0083_'));assert.ok(target,'migration 0083 exists');
 for(const name of files.filter(n=>n<'0083_'))sql.exec(readFileSync('migrations/'+name,'utf8'));
 const T='2026-01-10T01:00:00.000Z',insert=sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,job_title_id,employment_type,schedule_mode,termination_date,termination_reason,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,7)");
 sql.prepare("INSERT INTO hr_stores(name,cycle_anchor_date,created_at,updated_at) VALUES('合成第二門市','2026-01-05',?,?)").run(T,T);
 const store2=sql.prepare("SELECT id FROM hr_stores WHERE name='合成第二門市'").get().id;
 const emp=(no,status,hire,store,emp_,mode,term=null,termReason=null,created=T)=>Number(insert.run(no,'合成'+no,status,hire,hire??'2025-01-01',store,1,emp_,mode,term,termReason,created,created).lastInsertRowid);
 const st=(id,eff,prev,next,reason='合成')=>sql.prepare("INSERT INTO hr_status_changes(employee_id,effective_date,previous_status,next_status,reason,handled_by,created_at) VALUES(?,?,?,?,?,1,?)").run(id,eff,prev,next,reason,T);
 const as=(id,field,eff,prev,next)=>sql.prepare("INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at) VALUES(?,?,?,?,?,'合成',1,?)").run(id,field,eff,prev,next,T);
 const today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10),later=n=>day(n);
 // A: legacy baseline, a past store change, a future store change, a future 離職 waiting. B: no records at all, NULL hire date, no store.
 const A=emp('A','active','2025-01-01',1,'full','shift','2099-01-01','將來離職');st(A,'2025-01-01','active','active','建檔');st(A,later(4),'active','terminated');as(A,'store_id','2025-06-01','1',String(store2));as(A,'store_id',later(6),String(store2),'1');as(A,'job_title_id',later(3),'1','1');
 // C: status stale in master (cache says leave but the record says active today); stale termination data without a pending 離職. D: record on the hire date already exists (no 建檔 added for that field).
 const C=emp('C','leave','2025-02-01',1,'half','hours','2025-05-05','舊資料');st(C,'2025-02-01','probation','probation','建檔');st(C,'2025-04-01','probation','active');
 const D=emp('D','active','2025-03-01',1,'full','shift');st(D,'2025-03-01','active','active','建檔');as(D,'store_id','2025-03-01','1',String(store2));
 const B=Number(sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,job_title_id,employment_type,schedule_mode,created_at,updated_at) VALUES('B','合成B','probation','2025-07-07','2025-07-07',NULL,1,'casual','none','2025-07-06T20:00:00.000Z','2025-07-06T20:00:00.000Z')").run().lastInsertRowid);
 // E: hire date NULL cannot happen (NOT NULL); a future hire date: records at the hire date, master = fallback.
 const E=emp('E','probation',later(20),1,'full','shift');
 const snapshot=table=>sql.prepare('SELECT * FROM '+table+' ORDER BY id').all().map(r=>({...r}));
 const oldStatus=snapshot('hr_status_changes'),oldAssign=snapshot('hr_assignment_changes');
 sql.exec(readFileSync('migrations/'+target,'utf8'));
 // Existing records are never altered or deleted.
 assert.deepEqual(snapshot('hr_status_changes').slice(0,oldStatus.length),oldStatus);assert.deepEqual(snapshot('hr_assignment_changes').slice(0,oldAssign.length),oldAssign);
 const created=sql.prepare("SELECT employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at FROM hr_assignment_changes WHERE id>? ORDER BY employee_id,id").all(Math.max(...oldAssign.map(r=>r.id))).map(r=>({...r}));
 const mine=(id)=>created.filter(r=>r.employee_id===id).map(r=>[r.field,r.effective_date,r.next_value]);
 assert.deepEqual(mine(A),[['store_id','2025-01-01','1'],['job_title_id','2025-01-01','1'],['employment_type','2025-01-01','full'],['schedule_mode','2025-01-01','shift']]);
 assert.deepEqual(mine(D),[['job_title_id','2025-03-01','1'],['employment_type','2025-03-01','full'],['schedule_mode','2025-03-01','shift']],'a field with a record on the hire date gets no 建檔');
 assert.deepEqual(mine(B),[['job_title_id','2025-07-07','1'],['employment_type','2025-07-07','casual'],['schedule_mode','2025-07-07','none']],'no store, no record');
 assert.deepEqual(mine(E),[['store_id',later(20),'1'],['job_title_id',later(20),'1'],['employment_type',later(20),'full'],['schedule_mode',later(20),'shift']]);
 assert.ok(created.every(r=>r.previous_value===null&&r.reason==='建檔'&&r.handled_by===(r.employee_id===B?null:7)&&r.created_at.length>10));
 const newStatus=sql.prepare("SELECT employee_id,effective_date,previous_status,next_status,reason,created_at FROM hr_status_changes WHERE id>?").all(Math.max(...oldStatus.map(r=>r.id))).map(r=>({...r}));
 assert.deepEqual(newStatus.map(r=>[r.employee_id,r.effective_date,r.previous_status,r.next_status,r.reason]),[[B,'2025-07-07','probation','probation','建檔'],[E,later(20),'probation','probation','建檔']],'only employees without any status record get one (B and E)');
 const row=id=>({...sql.prepare('SELECT '+COLUMNS+' FROM hr_employees WHERE id=?').get(id)});
 assert.deepEqual(row(A),{status:'active',store_id:store2,job_title_id:1,employment_type:'full',schedule_mode:'shift',termination_date:'2099-01-01',termination_reason:'將來離職'});
 assert.deepEqual(row(C),{status:'active',store_id:1,job_title_id:1,employment_type:'half',schedule_mode:'hours',termination_date:null,termination_reason:null});
 assert.equal(row(D).store_id,store2);assert.equal(row(B).store_id,null);assert.equal(row(E).status,'probation');
 for(const id of [A,B,C,D,E])assert.deepEqual({...sql.prepare('SELECT '+COLUMNS+' FROM hr_employee_current WHERE id=?').get(id)},row(id),'view equals master');
 assert.equal(sql.prepare('SELECT revision FROM hr_employees WHERE id=?').get(A).revision,1,'a data correction is not an edit');
 // Re-running the same script adds nothing.
 sql.exec(readFileSync('migrations/'+target,'utf8'));
 assert.equal(snapshot('hr_assignment_changes').length,oldAssign.length+created.length);assert.equal(snapshot('hr_status_changes').length,oldStatus.length+2);
 assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('the payroll month list and the HR list read the current store, also after a future store change reaches its date',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const {store2}=extras(f);const {service,id}=await created(f);
 await service.statusChange(id,{reason:'合成',effectiveDate:day(-1),storeId:store2},ctx);
 f.sql.prepare("INSERT INTO hr_salary_records(employee_id,effective_date,payment_type,base_amount,reason,created_at,created_by) VALUES(?,?,?,?,?,?,1)").run(id,'2025-03-01','monthly',30000,'合成',ctx.now);
 const month=day(0).slice(0,7),payroll=new HrPayrollService(f.db);
 assert.equal((await payroll.monthOverview(month)).rows.find(r=>r.employeeId===id).storeId,store2);
 assert.equal((await service.list('',undefined,0,40,{storeId:store2})).items.length,1);assert.equal((await service.list('',undefined,0,40,{storeId:1})).items.length,0);
 assert.equal(f.sql.prepare('SELECT store_id FROM hr_employees WHERE id=?').get(id).store_id,store2);
 await service.statusChange(id,{reason:'合成',effectiveDate:day(2),storeId:1},ctx);
 await runCron(f,midnight(day(2)));assert.equal(master(f,id).store_id,1,'the master follows when the record reaches its date');
});
test('backup and restore keep records and master columns; a pre-0083 backup restores with 建檔 records and consistent master columns',async t=>{
 const f=botCenterFixture(),target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false}),older=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>{f.sql.close();target.sql.close();older.sql.close()});
 const {store2}=extras(f);const {service,id}=await created(f);
 await service.statusChange(id,{reason:'合成',effectiveDate:day(-4),storeId:store2,nextStatus:'leave'},ctx);
 await service.statusChange(id,{reason:'合成',effectiveDate:day(6),employmentType:'casual',scheduleMode:'none'},ctx);
 const bundle=await exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.29.0'});
 assert.equal(JSON.parse(new TextDecoder().decode(bundle.manifestBytes)).schemaMigration,'0083_hr_current_values');
 await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
 for(const table of ['hr_employees','hr_status_changes','hr_assignment_changes'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table+' ORDER BY id').all(),f.sql.prepare('SELECT * FROM '+table+' ORDER BY id').all(),table);
 // A pre-0083 backup: master columns still hold the baseline (as the 0081 layout did), no 建檔 assignment records.
 const data=JSON.parse(new TextDecoder().decode(bundle.dataBytes));
 const a=data.tables.hr_assignment_changes,e=data.tables.hr_employees,col=(table,n)=>table.columns.indexOf(n);
 a.rows=a.rows.filter(r=>r[col(a,'reason')]!=='建檔');
 for(const row of e.rows){row[col(e,'status')]='active';row[col(e,'store_id')]=1;row[col(e,'employment_type')]='full';row[col(e,'schedule_mode')]='shift';}
 const dataBytes=new TextEncoder().encode(JSON.stringify(data)),manifest=JSON.parse(new TextDecoder().decode(bundle.manifestBytes));
 manifest.schemaMigration='0082_hr_bonus_payments';manifest.dataByteLength=dataBytes.length;manifest.dataSha256=createHash('sha256').update(dataBytes).digest('hex');
 manifest.recordCounts=Object.fromEntries(Object.entries(data.tables).map(([k,v])=>[k,v.rows.length]));manifest.totalRecordCount=Object.values(manifest.recordCounts).reduce((x,y)=>x+y,0);
 await restoreIntoEmptyDatabase(older.db,{dataBytes,manifestBytes:new TextEncoder().encode(JSON.stringify(manifest))},'synthetic');
 const records=older.sql.prepare("SELECT field,effective_date,previous_value,next_value,reason FROM hr_assignment_changes WHERE employee_id=? AND reason='建檔' ORDER BY id").all(id).map(r=>({...r}));
 assert.deepEqual(records,[['store_id','1'],['job_title_id','1'],['employment_type','full'],['schedule_mode','shift']].map(([field,next_value])=>({field,effective_date:'2025-03-01',previous_value:null,next_value,reason:'建檔'})),'建檔 records carry the master values the old backup had');
 assert.equal(older.sql.prepare("SELECT count(*) n FROM hr_assignment_changes WHERE employee_id=? AND reason<>'建檔'").get(id).n,3,'existing records are kept');
 assert.deepEqual({...older.sql.prepare('SELECT '+COLUMNS+' FROM hr_employees WHERE id=?').get(id)},{status:'leave',store_id:store2,job_title_id:1,employment_type:'full',schedule_mode:'shift',termination_date:null,termination_reason:null},'master = projection as of the restore date');
 assert.deepEqual({...older.sql.prepare('SELECT '+COLUMNS+' FROM hr_employee_current WHERE id=?').get(id)},{...older.sql.prepare('SELECT '+COLUMNS+' FROM hr_employees WHERE id=?').get(id)});
 assert.deepEqual(older.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
