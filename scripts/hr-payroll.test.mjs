import test from 'node:test';
import assert from 'node:assert/strict';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
import {compiled} from './test-support/hr-ui-fixture.mjs';
import {payrollSources} from './test-support/hr-payroll-sources.mjs';
const {calculatePayroll,insuranceDays,overtimePay,selectRule}=await compiled('shared/hr-payroll.ts');
const {HrPayrollService}=await compiled('worker/hr/hr-payroll-service.ts');
const {HrAttendanceCorrectionService}=await compiled('worker/hr/hr-attendance-correction.ts');
const {officialUrl,officialText,normalizeTax,normalizeHealth,parseCsv,syncPayrollRules}=await compiled('worker/hr/hr-payroll-import.ts');
const {checkLeaveQuota}=await compiled('shared/hr-leave.ts');
const profile={attendanceEnabled:true,attendanceAmount:3000,laborEnabled:false,employmentInsurance:false,laborBasis:0,healthEnabled:false,healthBasis:0,dependents:0,healthAtMonthEnd:false,pensionEnabled:false,pensionBasis:0,pensionEmployerRate:6,pensionSelfRate:0,insuredFrom:'2025-01-01',insuredTo:null,occupationalBasis:0,occupationalRate:0,taxResidence:'resident',taxMethod:'table',taxDependents:0};
const rules=[{id:1,kind:'tax',effective_date:'2026-01-01',valid_until:'2026-12-31',source_url:'https://www.ntbt.gov.tw/test',source_hash:'test',data:{rows:[{from:80001,to:500000,amounts:[2020,0]}],nonresidentThreshold:44250}},{id:2,kind:'labor',effective_date:'2026-01-01',valid_until:'2026-12-31',source_url:'https://apiservice.mol.gov.tw/test',source_hash:'test2',data:{minimum:29500,rows:[{basis:30300,laborRate:11.5,employmentRate:1,worker:758,employer:2651}]}}];
const salary=[{id:1,effective_date:'2025-01-01',payment_type:'monthly',base_amount:30000,allowances:[]}];
const day=(patch={})=>({date:'2026-11-02',workedMinutes:480,lateMinutes:0,earlyMinutes:0,anomalies:[],normalMinutes:480,holiday:false,consecutiveSix:false,schedule:{kind:'shift',rest_label:null,code:null},overtime:null,...patch});
const leave=(code,minutes,date='2026-11-02',patch={})=>({id:1,work_date:date,code,minutes,whole_day:0,pay_ratio:null,payroll_protection:null,event_date:null,event_quota_days:null,cancelled_at:null,...patch});
const calc=(days=[day()],leaves=[],p=profile,s=salary,rs=rules)=>calculatePayroll({employeeId:1,month:'2026-11',payDate:'2026-12-05'},{hireDate:'2025-01-01',terminationDate:null},p,s,days,leaves,rs);
test('single-event grace: repeated 5-minute lateness is free, 6 deducts all minutes and one monthly attendance allowance',()=>{
 const free=calc([day({lateMinutes:5}),day({date:'2026-11-03',lateMinutes:5})]);assert.equal(free.attendanceAmount,3000);assert.equal(free.net,33000);
 const six=calc([day({lateMinutes:6})]);assert.equal(six.attendanceAmount,0);assert.equal(six.lines.find(l=>l.label==='遲到未給工資').amount,12);assert.equal(six.net,29988);
 const early=calc([day({earlyMinutes:1})]);assert.equal(early.attendanceAmount,0);assert.equal(early.lines.find(l=>l.label==='早退未給工資').amount,2);
});
test('MOL sick-leave example: 30000+3000, one sick day yields 2900 attendance, 548 sick deduction, net 32352',()=>{
 const r=calc([day()], [leave('病',480)]);assert.equal(r.attendanceAmount,2900);assert.equal(r.lines.find(l=>l.label==='請假未給工資').amount,548);assert.equal(r.net,32352);
});
test('two physiological half days preserve attendance; protected care is unpaid but cannot cancel attendance',()=>{
 const r=calc([day()],[leave('生',240),leave('生',240,'2026-11-03',{id:2})]);assert.equal(r.attendanceAmount,3000);assert.equal(r.net,32450);
 const care=calc([day()],[leave('事',30,'2026-11-02',{payroll_protection:'family_care'})]);assert.equal(care.attendanceAmount,3000);
 assert.equal(calc([day()],[leave('事',30)]).attendanceAmount,0);
 const cancelled=calc([day()],[leave('事',30,'2026-11-02',{cancelled_at:'2026-11-01'})]);assert.equal(cancelled.attendanceAmount,3000);
});
test('physiological splitting uses minutes beyond first 3 days exactly once, including multiple same-date forms',()=>{
 const types=[{id:1,code:'生',quotaDays:1,quotaPeriod:'month',mergeIntoTypeId:2,mergeAfterDays:3},{id:2,code:'病',quotaDays:1,quotaPeriod:'calendar_year'}];
 const records=[1,2,3].map(i=>({leaveTypeId:1,workDate:'2026-0'+i+'-01',minutes:480}));
 const candidate=[{leaveTypeId:1,workDate:'2026-04-01',minutes:240},{leaveTypeId:1,workDate:'2026-04-01',minutes:240},{leaveTypeId:1,workDate:'2026-05-01',minutes:30}];
 const failures=checkLeaveQuota(types[0],types,records,candidate);assert.equal(failures.find(f=>f.code==='病').usedMinutes,510);
});
test('official month insurance day rules and overtime tiers do not round into half-hour blocks',()=>{
 assert.equal(insuranceDays('2026-02-28',null,'2026-02'),3);assert.equal(insuranceDays('2026-01-31',null,'2026-01'),1);assert.equal(insuranceDays('2025-01-01',null,'2026-02'),30);
 assert.equal(overtimePay(120,120,'ordinary'),320);assert.equal(overtimePay(120,240,'ordinary'),720);assert.equal(overtimePay(120,480,'rest'),1520);
 assert.equal(overtimePay(120,60,'holiday'),960);assert.equal(overtimePay(120,60,'holiday',false),120);
});
test('applicable rule dates preserve history and require a new-year tax/labor version',()=>{
 assert.equal(selectRule(rules,'tax','2026-12-05').id,1);assert.equal(selectRule(rules,'tax','2027-01-05'),null);
 const later={...rules[0],id:3,effective_date:'2027-01-01',valid_until:'2027-12-31'};assert.equal(selectRule([...rules,later],'tax','2026-12-05').id,1);
 const r=calculatePayroll({employeeId:1,month:'2026-11',payDate:'2027-01-05'},{hireDate:'2025-01-01',terminationDate:null},profile,salary,[day()],[],rules);assert.ok(r.issues.some(s=>s.includes('2027-01-05')));
});
test('health premiums use official dependent amounts; employer pension and insurance never deduct from worker',()=>{
 const rs=[...rules,{id:3,kind:'health',effective_date:'2026-01-01',valid_until:'9999-12-31',source_url:'https://info.nhi.gov.tw/test',source_hash:'health',data:{rows:[{basis:30300,worker:[470,940,1410,1880],employer:1466}]}},{id:4,kind:'pension',effective_date:'2026-01-01',valid_until:'9999-12-31',source_url:'https://apiservice.mol.gov.tw/test',source_hash:'pension',data:{amounts:[30300]}}];
 const r=calc([day()],[],{...profile,laborEnabled:true,employmentInsurance:true,laborBasis:30300,healthEnabled:true,healthAtMonthEnd:true,healthBasis:30300,dependents:9,pensionEnabled:true,pensionBasis:30300,pensionSelfRate:6},salary,rs);
 assert.equal(r.lines.find(l=>l.label==='健保').amount,1880);assert.equal(r.lines.find(l=>l.label==='勞退個人自提').amount,1818);
 assert.equal(r.employer,2651+1466+1818);assert.equal(r.deductions,758+1880+1818);
});
test('official import rejects hostile URLs, redirects, truncated CSV, missing grades and wrong annual evidence',async()=>{
 assert.throws(()=>officialUrl('https://apiservice.mol.gov.tw.evil.test/a'));assert.throws(()=>officialUrl('http://127.0.0.1/a'));assert.throws(()=>officialUrl('https://data.gov.tw:8080/a'));
 await assert.rejects(officialText('https://data.gov.tw/test',async()=>new Response(null,{status:302,headers:{location:'http://localhost/private'}})));
 assert.throws(()=>parseCsv('"unclosed'));assert.deepEqual(parseCsv('"a,b",c\r\n1,2'),[['a,b','c'],['1','2']]);
 assert.throws(()=>normalizeHealth('a,b\n1,2','115年1月'));
 assert.throws(()=>normalizeTax('a,b\n1,2','115年度為90,501元',29500));
});
const ctx={actor:1,now:'2026-11-15T10:00:00Z',requestId:'synthetic-payroll'};
function seed(f){
 f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,skip_roster_checks,created_at,updated_at) VALUES('SYNTHETIC-PAY','合成薪資員工','active','2025-01-01','2025-01-01',1,1,?,?)").run(ctx.now,ctx.now);
 f.sql.prepare("INSERT INTO hr_salary_records(employee_id,effective_date,payment_type,base_amount,reason,created_at,created_by) VALUES(1,'2025-01-01','monthly',30000,'合成測試',?,1)").run(ctx.now);
 for(const r of rules)f.sql.prepare('INSERT INTO hr_payroll_rule_versions(id,kind,effective_date,valid_until,source_url,source_hash,payload_json,source_text,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(r.id,r.kind,r.effective_date,r.valid_until,r.source_url,r.source_hash,JSON.stringify(r.data),'synthetic',ctx.now);
}
test('actual SQLite service preserves confirmed/paid snapshots, retains void versions and rejects stale source data',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);
 let r=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);assert.deepEqual(r.result.issues,[]);
 f.sql.prepare("UPDATE hr_salary_records SET base_amount=31000 WHERE employee_id=1").run();await assert.rejects(s.transition(r.id,{action:'confirm',revision:r.revision,reason:'核對'},ctx),/重算/);
 r=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);r=await s.transition(r.id,{action:'confirm',revision:r.revision,reason:'核對'},ctx);assert.equal(r.status,'confirmed');
 await assert.rejects(s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx),/不可直接重算/);
 const oldResult=JSON.stringify(r.result);r=await s.transition(r.id,{action:'reopen',revision:r.revision,reason:'重新核對'},ctx);assert.equal(r.status,'void');assert.equal(JSON.stringify(r.result),oldResult);
 let next=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);assert.notEqual(next.id,r.id);next=await s.transition(next.id,{action:'confirm',revision:next.revision,reason:'核對'},ctx);next=await s.transition(next.id,{action:'pay',revision:next.revision,reason:'已人工發薪'},ctx);assert.equal(next.status,'paid');
 await assert.rejects(s.transition(next.id,{action:'reopen',revision:next.revision,reason:'測試'},ctx));assert.equal((await s.get(r.id)).status,'void');
 }finally{f.sql.close();}
});
test('confirmation atomically fences a concurrent attendance change and rolls back its audit/status',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成測試',expectedId:0},ctx);const r=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);
 const original=f.db.batch.bind(f.db);f.db.batch=async statements=>{f.sql.prepare("INSERT INTO hr_attendance_days(employee_id,work_date,in1,out1,updated_at,updated_by) VALUES(1,'2026-11-03','09:00','17:30',?,1)").run(ctx.now);return original(statements);};
 await assert.rejects(s.transition(r.id,{action:'confirm',revision:r.revision,reason:'並行測試'},ctx));assert.equal((await s.get(r.id)).status,'draft');assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='hr_payroll.confirm'").get().n,0);
 }finally{f.sql.close();}
});
test('designated ADMIN correction is store-scoped, revision-guarded and audited; USER and revoked grants fail',async()=>{
 const f=botCenterFixture();try{seed(f);f.sql.prepare("INSERT INTO hr_attendance_days(employee_id,work_date,in1,out1,updated_at,updated_by) VALUES(1,'2026-11-03','09:00','17:25',?,1)").run(ctx.now);
 const superAdmin=new HrAttendanceCorrectionService(f.db,1,'SUPER_ADMIN'),admin=new HrAttendanceCorrectionService(f.db,1,'ADMIN'),user=new HrAttendanceCorrectionService(f.db,1,'USER');
 const change={employeeId:1,date:'2026-11-03',revision:1,out1:'17:30',out2:null,reason:'核對紙卡，誤打下班'};
 await assert.rejects(admin.correct(change,ctx));await superAdmin.grant({memberId:1,storeId:1,revision:0,enabled:true,reason:'指定測試'},ctx);await assert.rejects(user.correct(change,ctx));
 await admin.correct(change,ctx);const row=f.sql.prepare('SELECT out1,revision FROM hr_attendance_days').get();assert.equal(row.out1,'17:30');assert.equal(row.revision,2);await assert.rejects(admin.correct(change,ctx));
 await superAdmin.grant({memberId:1,storeId:1,revision:1,enabled:false,reason:'撤回測試'},ctx);await assert.rejects(admin.list(1,'2026-11'));assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='hr_attendance.corrected'").get().n,1);
 }finally{f.sql.close();}
});
test('statutory overtime is exempt from salary withholding while company-only premiums stay taxable',()=>{
 const rs=[rules[1],{...rules[0],data:{...rules[0].data,rows:[{from:0,to:120000,amounts:[0]},{from:120001,to:500000,amounts:[3000]}]}}];
 const s=[{...salary[0],base_amount:120000}];
 const overtime={minutes:120,settlement:'pay'};
 const ordinary=calc([day({workedMinutes:600,overtime})],[],{...profile,attendanceEnabled:false},s,rs);
 assert.equal(ordinary.lines.find(l=>l.label==='所得稅扣繳').amount,0);
 const company=calc([day({workedMinutes:600,overtime,consecutiveSix:true})],[],{...profile,attendanceEnabled:false},s,rs);
 assert.equal(company.lines.find(l=>l.label==='所得稅扣繳').amount,3000);
});
test('partial worker monthly minimum uses contracted weekly hours rather than a full-time minimum',()=>{
 const r=calculatePayroll({employeeId:1,month:'2026-11',payDate:'2026-12-05'},{hireDate:'2025-01-01',terminationDate:null,employmentType:'half'}, {...profile,attendanceEnabled:false,weeklyHours:20},[{...salary[0],base_amount:15000}],[day({normalMinutes:240,workedMinutes:240})],[],rules);
 assert.equal(r.gross,15000);assert.deepEqual(r.issues,[]);
});
test('actual service pays expired comp from original frozen wage/tax tiers once, and reopening releases only unissued consumption',async()=>{
 const f=botCenterFixture();try{seed(f);f.sql.prepare("UPDATE hr_employees SET seniority_start_date='2026-01-01'").run();const s=new HrPayrollService(f.db);
 await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成設定',expectedId:0},ctx);
 const shift=f.sql.prepare("SELECT id FROM hr_shift_types WHERE code='早'").get().id;
 f.sql.prepare("INSERT INTO hr_schedule_days(employee_id,store_id,work_date,kind,shift_type_id,updated_at,updated_by) VALUES(1,1,'2026-09-15','shift',?,?,1)").run(shift,ctx.now);
 f.sql.prepare("INSERT INTO hr_attendance_days(employee_id,work_date,in1,out1,updated_at,updated_by) VALUES(1,'2026-09-15','09:00','21:30',?,1)").run(ctx.now);
 f.sql.prepare("INSERT INTO hr_overtime_days(employee_id,work_date,minutes,settlement,comp_expires_on,updated_at,updated_by) VALUES(1,'2026-09-15',240,'comp','2026-10-31',?,1)").run(ctx.now);
 let original=await s.calculate({employeeId:1,month:'2026-09',payDate:'2026-10-05'},ctx);assert.deepEqual(original.result.issues,[]);
 original=await s.transition(original.id,{action:'confirm',revision:original.revision,reason:'合成核對'},ctx);await s.transition(original.id,{action:'pay',revision:original.revision,reason:'合成已發'},ctx);
 f.sql.prepare("INSERT INTO hr_comp_time_settlements(employee_id,overtime_day_id,minutes,created_at,created_by) VALUES(1,1,120,'2026-11-01T02:00:00Z',1)").run();
 let r=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);assert.deepEqual(r.result.issues,[]);assert.equal(r.result.cashouts[0].amount,459);
 r=await s.transition(r.id,{action:'confirm',revision:r.revision,reason:'結清核對'},ctx);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM hr_payroll_consumptions WHERE active=1').get().n,1);
 r=await s.transition(r.id,{action:'reopen',revision:r.revision,reason:'核對測試'},ctx);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM hr_payroll_consumptions WHERE active=1').get().n,0);
 let next=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);next=await s.transition(next.id,{action:'confirm',revision:next.revision,reason:'結清核對'},ctx);await s.transition(next.id,{action:'pay',revision:next.revision,reason:'已發'},ctx);
 const december=await s.calculate({employeeId:1,month:'2026-12',payDate:'2026-12-31'},ctx);assert.equal(december.result.cashouts.length,0);assert.equal((await s.get(r.id)).status,'void');
 }finally{f.sql.close();}
});
test('source anomalies block confirmation instead of falling back to zero or a stale official table',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成設定',expectedId:0},ctx);
 f.sql.prepare("INSERT INTO hr_payroll_sync_state(kind,checked_at,error,blocking) VALUES('labor',?,'來源級距不完整',1)").run(ctx.now);
 const r=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);assert.ok(r.result.issues.some(s=>s.includes('官方資料驗證異常')));await assert.rejects(s.transition(r.id,{action:'confirm',revision:r.revision,reason:'測試'},ctx),/待補/);
 }finally{f.sql.close();}
});
test('full official-shaped discovery/import is idempotent, prefills next-year minimum wages, and quarantines a broken update',async()=>{
 const f=botCenterFixture(),sources=payrollSources();try{
 const first=await syncPayrollRules(f.db,ctx.now,sources.fetcher);assert.ok(first.every(r=>r.ok),JSON.stringify(first));
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM hr_payroll_rule_versions').get().n,4);
 const archive=JSON.parse(f.sql.prepare("SELECT source_text FROM hr_payroll_rule_versions WHERE kind='health'").get().source_text);assert.equal(archive.parserVersion,1);assert.ok(archive.resourceContext.includes('115年1月'));
 const future=f.sql.prepare("SELECT monthly_amount,hourly_amount FROM hr_minimum_wages WHERE effective_date='2027-01-01'").get();assert.equal(future.monthly_amount,30900);assert.equal(future.hourly_amount,205);
 const again=await syncPayrollRules(f.db,'2026-11-16T10:00:00Z',sources.fetcher);assert.ok(again.every(r=>r.ok));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM hr_payroll_rule_versions').get().n,4);
 const audits=f.sql.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='hr_payroll_rule.imported'").get().n;assert.equal(audits,4);
 sources.bodies.set('https://info.nhi.gov.tw/health','<html>site error</html>');await syncPayrollRules(f.db,'2026-11-17T10:00:00Z',sources.fetcher);
 assert.equal(f.sql.prepare("SELECT blocking FROM hr_payroll_sync_state WHERE kind='health'").get().blocking,1);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM hr_payroll_rule_versions WHERE kind='health'").get().n,1);
 const taxSource='https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/withheld-rule/rule/NM11BZY';sources.bodies.set(taxSource,sources.bodies.get(taxSource).replace('扣繳5%','扣繳7%'));await syncPayrollRules(f.db,'2026-11-18T10:00:00Z',sources.fetcher);assert.equal(f.sql.prepare("SELECT blocking FROM hr_payroll_sync_state WHERE kind='tax'").get().blocking,1);
 }finally{f.sql.close();}
});
test('midmonth wage changes use the original daily rate for lateness and hourly work',()=>{
 const p={...profile,attendanceEnabled:false};const salaries=[...salary,{...salary[0],id:2,effective_date:'2026-11-16',base_amount:36000}];
 const r=calculatePayroll({employeeId:1,month:'2026-11',payDate:'2026-12-05',paidDays:30},{hireDate:'2025-01-01',terminationDate:null},p,salaries,[day({lateMinutes:6}),day({date:'2026-11-18',lateMinutes:6})],[],rules);
 assert.equal(r.gross,33000);assert.equal(r.lines.find(l=>l.label==='遲到未給工資').amount,27);
 const hourly=salaries.map((s,i)=>({...s,payment_type:'hourly',base_amount:i?240:200}));
 const h=calculatePayroll({employeeId:1,month:'2026-11',payDate:'2026-12-05',paidDays:30},{hireDate:'2025-01-01',terminationDate:null},p,hourly,[day(),day({date:'2026-11-18'})],[],rules,[],[{effective_date:'2026-01-01',monthly_amount:29500,hourly_amount:196}]);
 assert.equal(h.gross,3520);assert.deepEqual(h.issues,[]);
});
test('same-effective-date corrections append a new profile without overwriting history or accepting a stale editor',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);let rows=await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'初始',expectedId:0},ctx);
 const first=rows[0].id;rows=await s.saveProfile(1,{settings:{...profile,attendanceAmount:2000},effectiveDate:'2026-01-01',reason:'更正',expectedId:first},ctx);assert.equal(rows.length,2);assert.equal(JSON.parse(rows[1].settings_json).attendanceAmount,3000);
 await assert.rejects(s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'舊版本',expectedId:first},ctx));
 const r=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);assert.equal(r.result.attendanceAmount,2000);
 }finally{f.sql.close();}
});
const {handleHrRoute}=await compiled('worker/http/hr-routes.ts');
test('authenticated ADMIN receives only explicit correction capability, never payroll, salary or employee records',async()=>{
 const f=botCenterFixture('ADMIN');try{seed(f);
 const call=async(path,method='GET',body)=>handleHrRoute(new Request('https://acceptance.test/api/business/hr'+path,{method,headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),f.env,'scope-test');
 for(const path of ['/employees','/payroll/runs?month=2026-11','/payroll/profiles/1','/settings/payroll-rules','/employees/1/attendance?month=2026-11'])assert.equal((await call(path)).status,403,path);
 assert.equal((await call('/attendance-corrections?storeId=1&month=2026-11')).status,403);
 await new HrAttendanceCorrectionService(f.db,1,'SUPER_ADMIN').grant({memberId:1,storeId:1,revision:0,enabled:true,reason:'測試指定'},ctx);
 const capability=await (await call('/attendance-corrections/capabilities')).json();assert.equal(capability.data.payroll,false);assert.equal(capability.data.stores.length,1);
 assert.equal((await call('/attendance-corrections?storeId=1&month=2026-11')).status,200);
 f.sql.prepare('UPDATE app_members SET is_active=0').run();assert.equal((await call('/attendance-corrections/capabilities')).status,403);
 }finally{f.sql.close();}
});
test('revoking a correction grant during the write rolls back the punch and audit atomically',async()=>{
 const f=botCenterFixture();try{seed(f);f.sql.prepare("INSERT INTO hr_attendance_days(employee_id,work_date,in1,out1,updated_at,updated_by) VALUES(1,'2026-11-03','09:00','17:25',?,1)").run(ctx.now);
 await new HrAttendanceCorrectionService(f.db,1,'SUPER_ADMIN').grant({memberId:1,storeId:1,revision:0,enabled:true,reason:'合成'},ctx);
 const batch=f.db.batch.bind(f.db);f.db.batch=async statements=>{f.sql.prepare('UPDATE hr_attendance_correction_grants SET is_active=0').run();return batch(statements);};
 await assert.rejects(new HrAttendanceCorrectionService(f.db,1,'ADMIN').correct({employeeId:1,date:'2026-11-03',revision:1,out1:'17:30',out2:null,reason:'撤回競態'},ctx));
 assert.equal(f.sql.prepare('SELECT out1 FROM hr_attendance_days').get().out1,'17:25');assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_attendance.corrected'").get().n,0);
 }finally{f.sql.close();}
});
test('termination cashes out carried and current annual leave at their frozen bases, then prevents another payout',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:{...profile,attendanceEnabled:false},effectiveDate:'2026-01-01',reason:'合成',expectedId:0},ctx);
 const old={employeeId:1,month:'2025-12',payDate:'2026-01-05',gross:0,deductions:0,net:0,employer:0,attendanceAmount:0,lines:[],issues:[],ruleVersions:[],wageRates:[{date:'2025-12-31',hourly:125}],overtimeTaxBands:[]};
 f.sql.prepare("INSERT INTO hr_payroll_runs(employee_id,month,pay_date,status,source_hash,source_json,input_json,result_json,created_at,created_by,updated_at,updated_by) VALUES(1,'2025-12','2026-01-05','paid','synthetic','{}','{}',?,?,1,?,1)").run(JSON.stringify(old),ctx.now,ctx.now);
 f.sql.prepare("UPDATE hr_employees SET termination_date='2026-11-15',status='terminated' WHERE id=1").run();
 let r=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-11-15',paidDays:15,reason:'合成離職結清'},ctx);assert.deepEqual(r.result.issues,[]);
 assert.deepEqual(r.result.cashouts.map(c=>[c.key,c.minutes,c.amount]),[['annual:2025-07-01',1440,3000],['annual:2026-01-01',3360,7000]]);assert.equal(r.result.gross,25000);
 r=await s.transition(r.id,{action:'confirm',revision:r.revision,reason:'合成核對'},ctx);r=await s.transition(r.id,{action:'pay',revision:r.revision,reason:'合成已發'},ctx);
 const next=await s.calculate({employeeId:1,month:'2026-12',payDate:'2026-12-05'},ctx);assert.equal(next.result.cashouts.length,0);assert.ok(next.result.issues.some(x=>x.includes('不在員工任職期間')));
 }finally{f.sql.close();}
});
test('a continuing leave-without-pay period cannot silently produce a full month salary',async()=>{
 const f=botCenterFixture();try{seed(f);const s=new HrPayrollService(f.db);await s.saveProfile(1,{settings:profile,effectiveDate:'2026-01-01',reason:'合成',expectedId:0},ctx);
 f.sql.prepare("INSERT INTO hr_status_changes(employee_id,effective_date,previous_status,next_status,reason,created_at,handled_by) VALUES(1,'2026-10-01','active','leave','合成留停',?,1)").run(ctx.now);
 const r=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05'},ctx);assert.ok(r.result.issues.some(x=>x.includes('留職停薪')));await assert.rejects(s.transition(r.id,{action:'confirm',revision:r.revision,reason:'合成'},ctx));
 const reviewed=await s.calculate({employeeId:1,month:'2026-11',payDate:'2026-12-05',paidDays:0,reason:'合成整月留停'},ctx);assert.equal(reviewed.result.net,0);assert.deepEqual(reviewed.result.issues,[]);
 }finally{f.sql.close();}
});
