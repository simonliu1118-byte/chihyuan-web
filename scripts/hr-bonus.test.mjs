import test from 'node:test';import assert from 'node:assert/strict';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
import {compiled} from './test-support/hr-ui-fixture.mjs';
const {HrBonusService}=await compiled('worker/hr/hr-bonus-service.ts');
const {HrPayrollService}=await compiled('worker/hr/hr-payroll-service.ts');
const {exportPortableBackup,restoreIntoEmptyDatabase}=await compiled('worker/backup/portable-backup.ts');
const ctx={actor:1,now:'2026-11-24T00:00:00Z',requestId:'synthetic-bonus'};
const settings={attendanceEnabled:false,attendanceAmount:0,laborEnabled:false,employmentInsurance:false,laborBasis:0,healthEnabled:false,healthBasis:30300,dependents:0,healthAtMonthEnd:false,pensionEnabled:false,pensionBasis:0,pensionEmployerRate:6,pensionSelfRate:0,insuredFrom:null,insuredTo:null,occupationalBasis:0,occupationalRate:0,taxResidence:'resident',taxMethod:'table',taxDependents:0,taxSalaryKind:'primary',nhiSupplementCategory:'own',nhiUnitKey:'synthetic-unit',bonusOpeningYear:2026,bonusOpeningThrough:'2025-12-31',bonusOpeningAmount:0,bonusOpeningReference:'synthetic-opening'};
function fixture(t){const f=botCenterFixture();t.after(()=>f.sql.close());const payroll=new HrPayrollService(f.db);
 for(let id=1;id<=2;id++){
  f.sql.prepare("INSERT INTO hr_employees(id,employee_no,name,status,hire_date,seniority_start_date,skip_roster_checks,created_at,updated_at) VALUES(?,?,?,'active','2025-01-01','2025-01-01',1,?,?)").run(id,'SYNTHETIC-'+id,'合成員工'+id,ctx.now,ctx.now);
  f.sql.prepare("INSERT INTO hr_salary_records(employee_id,effective_date,payment_type,base_amount,reason,created_at,created_by) VALUES(?,'2025-01-01','monthly',30000,'synthetic',?,1)").run(id,ctx.now);
  f.sql.prepare("INSERT INTO hr_payroll_profiles(employee_id,effective_date,settings_json,reason,created_at,created_by) VALUES(?,'2026-01-01',?,'synthetic',?,1)").run(id,JSON.stringify(settings),ctx.now);
 }
 f.sql.prepare("INSERT INTO hr_payroll_rule_versions(kind,effective_date,valid_until,source_url,source_hash,payload_json,source_text,created_at) VALUES('tax','2026-01-01','2026-12-31','https://www.ntbt.gov.tw/synthetic','synthetic',?,'synthetic',?)").run(JSON.stringify({rows:[{from:90501,to:1000000,amounts:[3000]}],nonresidentThreshold:44250,nonMonthlyThreshold:90501}),ctx.now);
 f.sql.prepare("INSERT INTO hr_payroll_supplement_versions(effective_date,payload_json,source_url,source_hash,content_hash,source_text,created_at) VALUES('2021-01-01',?,'https://www.nhi.gov.tw/synthetic','synthetic','synthetic','synthetic',?)").run(JSON.stringify({rate:2.11,cap:10000000,multiple:4}),ctx.now);
 f.sql.prepare("INSERT INTO hr_payroll_rule_versions(kind,effective_date,valid_until,source_url,source_hash,payload_json,source_text,created_at) VALUES('labor','2026-01-01','2026-12-31','https://apiservice.mol.gov.tw/synthetic','synthetic',?,'synthetic',?)").run(JSON.stringify({minimum:29500,rows:[]}),ctx.now);
 return {...f,bonuses:new HrBonusService(f.db),payroll};
}
const input=(key='synthetic-batch',amount=200000)=>({requestKey:key,payDate:'2026-11-25',category:'年終獎金',attributionYear:2026,payments:[{employeeId:1,amount,note:'合成備註'},{employeeId:2,amount:1000,note:''}]});

test('bulk bonus saves, edits, pays once, keeps notes, and restores with its tax snapshots',async t=>{
 const f=fixture(t),s=f.bonuses;let r=await s.save(input(),ctx);
 assert.equal(r.status,'draft');assert.equal(r.payments.length,2);assert.equal(r.payments[0].result.taxBonus,10000);assert.equal(r.payments[0].result.nhiPremium,1663);assert.deepEqual(r.payments[0].result.issues,[]);
 assert.equal((await s.save(input(),ctx)).id,r.id);assert.equal(f.sql.prepare('SELECT count(*) n FROM hr_bonus_batches').get().n,1);
 r=await s.save({...input(),revision:r.revision,payments:[{employeeId:1,amount:210000,note:'更正備註'},{employeeId:2,amount:1000,note:''}]},ctx,r.id);
 assert.equal(r.payments[0].note,'更正備註');r=await s.transition(r.id,{action:'pay',revision:r.revision},ctx);
 assert.equal((await s.transition(r.id,{action:'pay',revision:r.revision},ctx)).status,'paid');
 await assert.rejects(s.save({...input(),revision:r.revision},ctx,r.id),/已更動/);
 const target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>target.sql.close());
 await restoreIntoEmptyDatabase(target.db,await exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.26.0'}),'synthetic');
 assert.deepEqual(target.sql.prepare('SELECT * FROM hr_bonus_batches').all(),f.sql.prepare('SELECT * FROM hr_bonus_batches').all());
 assert.deepEqual(target.sql.prepare('SELECT * FROM hr_bonus_payments').all(),f.sql.prepare('SELECT * FROM hr_bonus_payments').all());assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('duplicate batches and a mixed invalid employee roll back the whole batch; custom category is stored without prefix',async t=>{
 const f=fixture(t);await f.bonuses.save(input(),ctx);
 await assert.rejects(f.bonuses.save(input('another-key'),ctx));
 await assert.rejects(f.bonuses.save({...input('missing-employee'),payments:[{employeeId:1,amount:100,note:''},{employeeId:99999,amount:100,note:''}]},ctx));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM hr_bonus_batches').get().n,1);
 const r=await f.bonuses.save({...input('custom'),category:'其他',customCategory:'合成特別獎金'},ctx);assert.equal(r.category,'合成特別獎金');
});
test('salary and standalone bonus use one paid ledger; monthly API no longer accepts a bonus',async t=>{
 const f=fixture(t);await assert.rejects(f.payroll.calculate({employeeId:1,month:'2026-10',payDate:'2026-11-25',bonusAmount:100},ctx),/獎金發放/);
 let r=await f.bonuses.save(input(),ctx);await f.bonuses.transition(r.id,{action:'pay',revision:r.revision},ctx);
 const backdated=await f.payroll.calculate({employeeId:1,month:'2026-09',payDate:'2026-11-24'},ctx);assert.ok(backdated.result.issues.some(x=>x.includes('給付順序')));
 let salary=await f.payroll.calculate({employeeId:1,month:'2026-10',payDate:'2026-11-25'},ctx);assert.equal(salary.result.bonusGross,0);assert.ok(!salary.result.lines.some(l=>l.label.includes('非每月')));
 salary=await f.payroll.transition(salary.id,{action:'confirm',revision:salary.revision,reason:'synthetic'},ctx);await f.payroll.transition(salary.id,{action:'pay',revision:salary.revision,reason:'synthetic'},ctx);
 await assert.rejects(f.bonuses.transition(r.id,{action:'void',revision:r.revision+1,reason:'合成撤回'},ctx),/後續給付/);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM hr_paid_income WHERE employee_id=1').get().n,2);
 const next=await f.bonuses.save({...input('next',50000),payDate:'2026-12-01'},ctx);assert.equal(next.payments[0].result.nhiPremium,1055);
});
test('source/profile changes block issuing an old draft, including a concurrent change inside payment batch',async t=>{
 const f=fixture(t);let r=await f.bonuses.save(input(),ctx);
 f.sql.prepare("UPDATE hr_payroll_profiles SET settings_json=json_set(settings_json,'$.taxDependents',1) WHERE employee_id=1").run();
 await assert.rejects(f.bonuses.transition(r.id,{action:'pay',revision:r.revision},ctx),/重新計算/);
 f.sql.prepare("UPDATE hr_payroll_profiles SET settings_json=json_set(settings_json,'$.taxDependents',0) WHERE employee_id=1").run();
 const original=f.db.batch.bind(f.db);f.db.batch=async statements=>{f.sql.prepare("UPDATE hr_payroll_profiles SET settings_json=json_set(settings_json,'$.taxDependents',1) WHERE employee_id=1").run();return original(statements);};
 await assert.rejects(f.bonuses.transition(r.id,{action:'pay',revision:r.revision},ctx));assert.equal((await f.bonuses.get(r.id)).status,'draft');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_bonus.pay'").get().n,0);
});
test('void requires a reason and retains the paid snapshot; voided bonus leaves the paid-income ledger',async t=>{
 const f=fixture(t);let r=await f.bonuses.save(input(),ctx);r=await f.bonuses.transition(r.id,{action:'pay',revision:r.revision},ctx);const frozen=JSON.stringify(r.payments);
 await assert.rejects(f.bonuses.transition(r.id,{action:'void',revision:r.revision,reason:''},ctx));
 r=await f.bonuses.transition(r.id,{action:'void',revision:r.revision,reason:'合成更正'},ctx);assert.equal(r.status,'void');assert.equal(JSON.stringify(r.payments),frozen);assert.equal(f.sql.prepare('SELECT count(*) n FROM hr_paid_income').get().n,0);
 assert.equal((await f.bonuses.save(input('replacement'),ctx)).status,'draft');
});
