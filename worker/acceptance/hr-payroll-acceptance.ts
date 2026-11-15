import {HrPayrollService} from '../hr/hr-payroll-service';
import type {PayrollProfile} from '../../shared/hr-payroll';
function check(value:unknown,code:string):asserts value{if(!value)throw Error('ACCEPT_HR_PAYROLL_'+code);}
/** Synthetic local D1 only: exercise the real JSON snapshot and transactional confirmation statements. */
export async function acceptHrPayroll(db:D1Database){
 const now='2026-11-15T00:00:00.000Z',ctx={actor:1,requestId:'accept-hr-payroll',now};
 const inserted=await db.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,skip_roster_checks,created_at,updated_at) VALUES('HRPAY-SYNTH','測試薪資員工','active','2026-01-01','2026-01-01',1,1,?,?)").bind(now,now).run();const employeeId=Number(inserted.meta.last_row_id);
 await db.prepare("INSERT INTO hr_salary_records(employee_id,effective_date,payment_type,base_amount,reason,created_at,created_by) VALUES(?,'2026-01-01','monthly',30000,'合成驗收',?,1)").bind(employeeId,now).run();
 for(const [kind,data] of [['labor',{minimum:29500,rows:[]}],['tax',{nonresidentThreshold:44250,rows:[{from:90501,to:500000,amounts:[2020]}]}]] as const)
  await db.prepare("INSERT INTO hr_payroll_rule_versions(kind,effective_date,valid_until,source_url,source_hash,payload_json,source_text,created_at) VALUES(?,'2026-01-01','2026-12-31','https://data.gov.tw/synthetic','synthetic',?,'synthetic',?)").bind(kind,JSON.stringify(data),now).run();
 const settings:PayrollProfile={attendanceEnabled:true,attendanceAmount:3000,laborEnabled:false,employmentInsurance:false,laborBasis:0,healthEnabled:false,healthAtMonthEnd:false,healthBasis:0,dependents:0,pensionEnabled:false,pensionBasis:0,pensionEmployerRate:6,pensionSelfRate:0,insuredFrom:null,insuredTo:null,occupationalBasis:0,occupationalRate:0,taxResidence:'resident',taxMethod:'table',taxDependents:0};
 const service=new HrPayrollService(db);await service.saveProfile(employeeId,{settings,effectiveDate:'2026-01-01',reason:'合成驗收',expectedId:0},ctx);
 const input={employeeId,month:'2026-11',payDate:'2026-12-05'};let row=await service.calculate(input,ctx);check(!row.result.issues.length&&row.result.net===33000,'DRAFT');
 await db.prepare('UPDATE hr_salary_records SET base_amount=31000 WHERE employee_id=?').bind(employeeId).run();
 let rejected=false;try{await service.transition(Number(row.id),{action:'confirm',revision:row.revision,reason:'合成舊來源'},ctx);}catch{rejected=true;}check(rejected,'STALE_SOURCE');
 row=await service.calculate(input,ctx);row=await service.transition(Number(row.id),{action:'confirm',revision:row.revision,reason:'合成核對'},ctx);check(row.status==='confirmed','CONFIRM');
 row=await service.transition(Number(row.id),{action:'pay',revision:row.revision,reason:'合成已發'},ctx);check(row.status==='paid'&&row.result.net===34000,'PAID');
 await db.prepare('UPDATE hr_salary_records SET base_amount=32000 WHERE employee_id=?').bind(employeeId).run();check((await service.get(Number(row.id))).result.net===34000,'FROZEN');
 rejected=false;try{await service.transition(Number(row.id),{action:'reopen',revision:row.revision,reason:'合成禁止撤回'},ctx);}catch{rejected=true;}check(rejected,'IMMUTABLE_PAID');
}
