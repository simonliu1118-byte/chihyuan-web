import test from 'node:test';
import assert from 'node:assert/strict';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
import {compiled} from './test-support/hr-ui-fixture.mjs';
const {HrPayrollService,defaultReason}=await compiled('worker/hr/hr-payroll-service.ts');
const {handleHrPayrollRoute}=await compiled('worker/http/hr-payroll-routes.ts');
const profile={attendanceEnabled:true,attendanceAmount:3000,laborEnabled:false,employmentInsurance:false,laborBasis:0,healthEnabled:false,healthBasis:0,dependents:0,healthAtMonthEnd:false,pensionEnabled:false,pensionBasis:0,pensionEmployerRate:6,pensionSelfRate:0,insuredFrom:'2025-01-01',insuredTo:null,occupationalBasis:0,occupationalRate:0,taxResidence:'resident',taxMethod:'table',taxDependents:0,taxSalaryKind:'primary',nhiSupplementCategory:'exempt',nhiExemptionReference:'合成已核對免扣資料',nhiUnitKey:'合成投保單位'};
const rules=[{id:1,kind:'tax',effective_date:'2026-01-01',valid_until:'2026-12-31',source_url:'https://www.ntbt.gov.tw/test',source_hash:'test',data:{rows:[{from:80001,to:500000,amounts:[2020,0]}],nonresidentThreshold:44250}},{id:2,kind:'labor',effective_date:'2026-01-01',valid_until:'2026-12-31',source_url:'https://apiservice.mol.gov.tw/test',source_hash:'test2',data:{minimum:29500,rows:[{basis:30300,laborRate:11.5,employmentRate:1,worker:758,employer:2651}]}}];
const ctx={actor:1,now:'2026-11-15T10:00:00Z',requestId:'synthetic-payroll'};
function seed(f){
 f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,skip_roster_checks,created_at,updated_at) VALUES('SYNTHETIC-PAY','合成薪資員工','active','2025-01-01','2025-01-01',1,1,?,?)").run(ctx.now,ctx.now);
 f.sql.prepare("INSERT INTO hr_salary_records(employee_id,effective_date,payment_type,base_amount,reason,created_at,created_by) VALUES(1,'2025-01-01','monthly',30000,'合成測試',?,1)").run(ctx.now);
 for(const r of rules)f.sql.prepare('INSERT INTO hr_payroll_rule_versions(id,kind,effective_date,valid_until,source_url,source_hash,payload_json,source_text,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(r.id,r.kind,r.effective_date,r.valid_until,r.source_url,r.source_hash,JSON.stringify(r.data),'synthetic',ctx.now);
}
const add=(f,no,name,hire,term=null,salary=true)=>{const id=f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,termination_date,seniority_start_date,store_id,skip_roster_checks,created_at,updated_at) VALUES(?,?,'active',?,?,?,1,1,?,?)").run(no,name,hire,term,hire,ctx.now,ctx.now).lastInsertRowid;
 if(salary)f.sql.prepare("INSERT INTO hr_salary_records(employee_id,effective_date,payment_type,base_amount,reason,created_at,created_by) VALUES(?,?,'monthly',30000,'合成測試',?,1)").run(id,hire,ctx.now);return Number(id);};
const input={employeeId:1,month:'2026-11',payDate:'2026-12-05'};
test('first calculation, draft recalculation, confirm and pay need no reason and store the default 「YYYY/MM 月薪」',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);
  assert.equal(defaultReason('2026-11'),'2026/11 月薪');
  let r=await s.calculate(input,ctx);assert.equal(r.input.reason,'2026/11 月薪');
  r=await s.calculate(input,ctx);assert.equal(r.status,'draft');assert.equal(r.input.reason,'2026/11 月薪');
  r=await s.transition(r.id,{action:'confirm',revision:r.revision},ctx);assert.equal(r.status,'confirmed');assert.equal(r.reason,'2026/11 月薪');
  r=await s.transition(r.id,{action:'pay',revision:r.revision,reason:'  '},ctx);assert.equal(r.status,'paid');assert.equal(r.reason,'2026/11 月薪');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM audit_events WHERE action IN('hr_payroll.calculated','hr_payroll.confirm','hr_payroll.pay')").get().n,4,'every default-reason action is still audited');
 }finally{f.sql.close();}
});
test('reopen requires a reason; recalculating after a reopen requires one; paidDays still requires one; an explicit reason is kept',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);
  let r=await s.calculate(input,ctx);r=await s.transition(r.id,{action:'confirm',revision:r.revision},ctx);
  await assert.rejects(s.transition(r.id,{action:'reopen',revision:r.revision},ctx),/撤回確認須填原因/);
  await assert.rejects(s.transition(r.id,{action:'reopen',revision:r.revision,reason:'   '},ctx),/撤回確認須填原因/);
  assert.equal((await s.get(r.id)).status,'confirmed');
  r=await s.transition(r.id,{action:'reopen',revision:r.revision,reason:'11/12 補打卡後重算'},ctx);assert.equal(r.status,'void');assert.equal(r.reason,'11/12 補打卡後重算');
  await assert.rejects(s.calculate(input,ctx),/重算須填原因/);
  await assert.rejects(s.calculate({...input,reason:'  '},ctx),/重算須填原因/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM hr_payroll_runs WHERE status!='void'").get().n,0,'a refused calculation writes nothing');
  const again=await s.calculate({...input,reason:'補打卡後重算'},ctx);assert.equal(again.input.reason,'補打卡後重算');
  const draftAgain=await s.calculate({...input,reason:'補打卡後重算'},ctx);assert.equal(draftAgain.id,again.id);
  await assert.rejects(s.calculate(input,ctx),/重算須填原因/,'a draft that has snapshot history still needs a reason');
 }finally{f.sql.close();}
});
test('manual paid days keep requiring a reason even for a first calculation',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);
  await assert.rejects(s.calculate({...input,paidDays:15},ctx),/指定計薪天數須填原因/);
 }finally{f.sql.close();}
});
test('month overview lists everyone employed in the month with run summaries in one read, including missing salary and ended employment',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);
  const noSalary=add(f,'S-NOSAL','無薪資','2026-03-01',null,false),left=add(f,'S-LEFT','已離職','2024-01-01','2026-09-30'),leftLate=add(f,'S-LEFT2','月中離職','2024-01-01','2026-11-10'),future=add(f,'S-FUT','尚未到職','2026-12-01');
  const draft=await s.calculate(input,ctx);
  const over=await s.monthOverview('2026-11');const by=Object.fromEntries(over.rows.map(r=>[r.employeeNo,r]));
  assert.deepEqual(Object.keys(by).sort(),['S-LEFT2','S-NOSAL','SYNTHETIC-PAY']);
  assert.equal(by['SYNTHETIC-PAY'].run.id,draft.id);assert.equal(by['SYNTHETIC-PAY'].run.status,'draft');assert.equal(by['SYNTHETIC-PAY'].run.net,draft.result.net);assert.deepEqual(by['SYNTHETIC-PAY'].run.issues,draft.result.issues);assert.equal(by['SYNTHETIC-PAY'].run.paidDays,null);
  assert.equal(by['S-NOSAL'].run,null);assert.equal(by['S-NOSAL'].hasSalary,false);assert.equal(by['S-LEFT2'].hasSalary,true);assert.equal(by['S-LEFT2'].run,null);
  assert.equal(by['SYNTHETIC-PAY'].storeName!=null,true);
  // A paid snapshot of an employee who would not match the date rules is still listed; reopening adds history but never duplicates the row.
  let r=await s.transition(draft.id,{action:'confirm',revision:draft.revision},ctx);r=await s.transition(r.id,{action:'reopen',revision:r.revision,reason:'核對'},ctx);
  const after=(await s.monthOverview('2026-11')).rows.find(x=>x.employeeNo==='SYNTHETIC-PAY');assert.equal(after.run,null);assert.equal(after.voidCount,1);
  const manual=await s.calculate({...input,paidDays:20,reason:'合成留停'},ctx);
  const withDays=(await s.monthOverview('2026-11')).rows.find(x=>x.employeeNo==='SYNTHETIC-PAY');assert.equal(withDays.run.id,manual.id);assert.equal(withDays.run.paidDays,20);assert.equal(withDays.run.reason,'合成留停');assert.equal(withDays.voidCount,1);
  const oct=(await s.monthOverview('2026-10')).rows,sep=(await s.monthOverview('2026-09')).rows;assert.equal(oct.some(x=>x.employeeNo==='S-LEFT2'),true);assert.equal(oct.some(x=>x.employeeNo==='S-LEFT'),false);assert.equal(sep.some(x=>x.employeeNo==='S-LEFT'),true);
  assert.ok(left&&leftLate&&future&&noSalary);
  await assert.rejects(s.monthOverview('2026-13'));
 }finally{f.sql.close();}
});
test('month overview refuses more than 500 people instead of truncating, and the run list can be narrowed to one employee',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);
  const stmt=f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,created_at,updated_at) VALUES(?,?,'active','2025-01-01','2025-01-01',1,?,?)");
  for(let i=0;i<500;i++)stmt.run('B'+String(i).padStart(4,'0'),'批次'+i,ctx.now,ctx.now);
  await assert.rejects(s.monthOverview('2026-11'),/500/);
  f.sql.prepare("DELETE FROM hr_employees WHERE employee_no LIKE 'B%'").run();
  await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);await s.calculate(input,ctx);
  const other=add(f,'S-2','乙','2025-01-01');await s.saveProfile(other,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);await s.calculate({...input,employeeId:other},ctx);
  assert.equal((await s.list('2026-11')).length,2);assert.deepEqual((await s.list('2026-11',other)).map(x=>x.employee_id),[other]);const v=await s.calculate({...input,reason:'x'},ctx);const reopened=await s.transition((await s.list('2026-11',1))[0].id,{action:'confirm',revision:(await s.list('2026-11',1))[0].revision},ctx);await s.transition(reopened.id,{action:'reopen',revision:reopened.revision,reason:'列表原因'},ctx);assert.ok(v);assert.equal((await s.list('2026-11',1)).find(x=>x.status==='void').reason,'列表原因');
 }finally{f.sql.close();}
});
test('GET /payroll/month is read-only SUPER_ADMIN data behind the existing route and validates the month and employee filter',async()=>{
 const f=botCenterFixture();try{seed(f);const call=async(path,method='GET')=>handleHrPayrollRoute(new Request('https://x.test/api/business/hr'+path,{method}),f.db,ctx);
  const ok=await call('/payroll/month?month=2026-11');assert.equal(ok.status,200);const body=await ok.json();assert.equal(body.data.rows[0].employeeNo,'SYNTHETIC-PAY');
  assert.notEqual((await call('/payroll/month?month=bad')).status,200);assert.notEqual((await call('/payroll/month')).status,200);
  assert.notEqual((await call('/payroll/runs?month=2026-11&employeeId=abc')).status,200);assert.equal((await call('/payroll/runs?month=2026-11&employeeId=1')).status,200);
  assert.equal((await call('/payroll/month?month=2026-11','POST')).status,405);
 }finally{f.sql.close();}
});
// 月份任用值：薪資讀「該月月底」生效的僱用型態／排班方式／門市／職稱，不讀今日主檔欄位。
const asg=(f,id,field,eff,prev,next,reason='合成')=>f.sql.prepare("INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at) VALUES(?,?,?,?,?,?,1,?)").run(id,field,eff,prev,next,reason,ctx.now);
const sourceOf=(f,month='2026-11')=>JSON.parse(f.sql.prepare("SELECT source_json FROM hr_payroll_runs WHERE month=? AND status!='void'").get(month).source_json).employee;
async function monthFixture(){
 const f=botCenterFixture();seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);
 f.sql.prepare("INSERT INTO hr_stores(id,name,cycle_anchor_date,created_at,updated_at) VALUES(2,'合成二店','2026-01-05',?,?) ON CONFLICT(id) DO NOTHING").run(ctx.now,ctx.now);
 for(const [field,v] of [['employment_type','full'],['schedule_mode','shift'],['store_id','1']])asg(f,1,field,'2025-01-01',null,v,'建檔');
 return {f,s};
}
test('a past month keeps the old values after a later change; a change after the month does not touch it',async()=>{
 const {f,s}=await monthFixture();try{
  asg(f,1,'employment_type','2026-12-10','full','half');asg(f,1,'store_id','2026-12-10','1','2');f.sql.prepare("UPDATE hr_employees SET employment_type='half',store_id=2 WHERE id=1").run();
  const r=await s.calculate(input,ctx);const e=sourceOf(f);
  assert.equal(e.employment_type,'full');assert.equal(e.store_id,1);assert.ok(!r.result.issues.some(x=>/月中任用異動/.test(x)),'a change after the month raises nothing');
  const dec=await s.calculate({...input,month:'2026-12',payDate:'2027-01-05'},ctx);assert.equal(sourceOf(f,'2026-12').employment_type,'half');assert.equal(sourceOf(f,'2026-12').store_id,2);
  assert.ok(dec.result.issues.some(x=>x==='月中任用異動（僱用型態 2026/12/10）：須分段核對'));assert.ok(dec.result.issues.some(x=>x==='月中任用異動（門市 2026/12/10）：須分段核對'));
 }finally{f.sql.close();}
});
test('a change inside the month uses the month-end value and raises the split-check issue; the first of the month and 建檔 do not',async()=>{
 const {f,s}=await monthFixture();try{
  asg(f,1,'schedule_mode','2026-11-15','shift','hours');asg(f,1,'job_title_id','2026-11-01',null,'3');
  const r=await s.calculate(input,ctx);assert.equal(sourceOf(f).schedule_mode,'hours');
  assert.deepEqual(r.result.issues.filter(x=>/月中任用異動/.test(x)),['月中任用異動（排班方式 2026/11/15）：須分段核對']);
  await assert.rejects(s.transition(r.id,{action:'confirm',revision:r.revision},ctx),/待補|確認/);
 }finally{f.sql.close();}
});
test('the stale-source guard sees a back-dated assignment change that affects the month',async()=>{
 const {f,s}=await monthFixture();try{
  let r=await s.calculate(input,ctx);assert.equal(r.result.issues.some(x=>/月中任用異動/.test(x)),false);
  asg(f,1,'employment_type','2026-12-20','full','casual');r=await s.get(r.id);r=await s.transition(r.id,{action:'confirm',revision:r.revision},ctx);assert.equal(r.status,'confirmed','a change after the month leaves the draft valid');
  const second=await monthFixture();try{
   let d=await second.s.calculate(input,ctx);asg(second.f,1,'employment_type','2026-11-10','full','half');
   await assert.rejects(second.s.transition(d.id,{action:'confirm',revision:d.revision},ctx),/來源|重算|變更|已變/);
  }finally{second.f.sql.close();}
 }finally{f.sql.close();}
});
test('the month list shows the store effective at month end',async()=>{
 const {f,s}=await monthFixture();try{
  asg(f,1,'store_id','2026-11-20','1','2');asg(f,1,'store_id','2026-12-15','2','1');
  const nov=(await s.monthOverview('2026-11')).rows.find(r=>r.employeeId===1);assert.equal(nov.storeId,2);assert.equal(nov.storeName,'合成二店');
  const oct=(await s.monthOverview('2026-10')).rows.find(r=>r.employeeId===1);assert.equal(oct.storeId,1);
 }finally{f.sql.close();}
});
