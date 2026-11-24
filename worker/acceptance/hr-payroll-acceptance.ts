import {HrPayrollService} from '../hr/hr-payroll-service';
import {HrBonusService} from '../hr/hr-bonus-service';
import {HrPayrollCorrections} from '../hr/hr-payroll-corrections';
import {HrPayrollLegalService} from '../hr/hr-payroll-legal-service';
import {employerSupplement} from '../hr/hr-payroll-employer';
import type {PayrollProfile} from '../../shared/hr-payroll';
function check(value:unknown,code:string):asserts value{if(!value)throw Error('ACCEPT_HR_PAYROLL_'+code);}
/** Synthetic local D1 only: exercise the real JSON snapshot and transactional confirmation statements. */
export async function acceptHrPayroll(db:D1Database){
 const now='2026-11-15T00:00:00.000Z',ctx={actor:1,requestId:'accept-hr-payroll',now};
 const inserted=await db.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,skip_roster_checks,created_at,updated_at) VALUES('HRPAY-SYNTH','測試薪資員工','active','2026-01-01','2026-01-01',1,1,?,?)").bind(now,now).run();const employeeId=Number(inserted.meta.last_row_id);
 await db.prepare("INSERT INTO hr_salary_records(employee_id,effective_date,payment_type,base_amount,reason,created_at,created_by) VALUES(?,'2026-01-01','monthly',30000,'合成驗收',?,1)").bind(employeeId,now).run();
 for(const [kind,data] of [['labor',{minimum:29500,rows:[]}],['tax',{nonresidentThreshold:44250,rows:[{from:90501,to:500000,amounts:[2020]}]}]] as const)
  await db.prepare("INSERT INTO hr_payroll_rule_versions(kind,effective_date,valid_until,source_url,source_hash,payload_json,source_text,created_at) VALUES(?,'2026-01-01','2026-12-31','https://data.gov.tw/synthetic','synthetic',?,'synthetic',?)").bind(kind,JSON.stringify(data),now).run();
 const settings:PayrollProfile={attendanceEnabled:true,attendanceAmount:3000,laborEnabled:false,employmentInsurance:false,laborBasis:0,healthEnabled:false,healthAtMonthEnd:false,healthBasis:0,dependents:0,pensionEnabled:false,pensionBasis:0,pensionEmployerRate:6,pensionSelfRate:0,insuredFrom:null,insuredTo:null,occupationalBasis:0,occupationalRate:0,taxResidence:'resident',taxMethod:'table',taxDependents:0,taxSalaryKind:'primary',nhiSupplementCategory:'exempt',nhiExemptionReference:'合成已核對免扣資料',nhiUnitKey:'合成投保單位'};
 const service=new HrPayrollService(db);await service.saveProfile(employeeId,{settings,effectiveDate:'2026-01-01',reason:'合成驗收',expectedId:0},ctx);
 const input={employeeId,month:'2026-11',payDate:'2026-12-05'};let row=await service.calculate(input,ctx);check(!row.result.issues.length&&row.result.net===33000,'DRAFT');
 await db.prepare('UPDATE hr_salary_records SET base_amount=31000 WHERE employee_id=?').bind(employeeId).run();
 let rejected=false;try{await service.transition(Number(row.id),{action:'confirm',revision:row.revision,reason:'合成舊來源'},ctx);}catch{rejected=true;}check(rejected,'STALE_SOURCE');
 row=await service.calculate(input,ctx);row=await service.transition(Number(row.id),{action:'confirm',revision:row.revision,reason:'合成核對'},ctx);check(row.status==='confirmed','CONFIRM');
 row=await service.transition(Number(row.id),{action:'pay',revision:row.revision,reason:'合成已發'},ctx);check(row.status==='paid'&&row.result.net===34000,'PAID');
 await db.prepare('UPDATE hr_salary_records SET base_amount=32000 WHERE employee_id=?').bind(employeeId).run();check((await service.get(Number(row.id))).result.net===34000,'FROZEN');
 rejected=false;try{await service.transition(Number(row.id),{action:'reopen',revision:row.revision,reason:'合成禁止撤回'},ctx);}catch{rejected=true;}check(rejected,'IMMUTABLE_PAID');
 const frozen=JSON.stringify(row.result),corrections=new HrPayrollCorrections(db),facts=new HrPayrollLegalService(db);
 await corrections.create(employeeId,'2026-12',{sourceRunId:row.id,kind:'salary_topup',amount:1000,reference:'合成核定差額',consentReference:'',reason:'合成補發',requestKey:'accept-hr-correction-1'},ctx);
 const nextInput={employeeId,month:'2026-12',payDate:'2026-12-31'};let next=await service.calculate(nextInput,ctx);check(next.result.corrections?.length===1&&next.result.bonusGross===0,'DELTA_SALARY_ONLY');
 await facts.save(employeeId,{kind:'occupational',eventDate:'2026-12-01',from:'2026-12-01',to:'2026-12-31',month:'2026-12',monthlyBasis:35000,averageDaily:0,offset:0,reference:'合成醫療與原工資核對',reason:'合成案件來源變更',active:true,expectedId:0},ctx);
 rejected=false;try{await service.transition(Number(next.id),{action:'confirm',revision:next.revision,reason:'合成過時法定來源'},ctx);}catch{rejected=true;}check(rejected,'LEGAL_CASE_SOURCE_FENCE');
 next=await service.calculate(nextInput,ctx);check(!next.result.issues.length,'NEXT_READY');next=await service.transition(Number(next.id),{action:'confirm',revision:next.revision,reason:'合成差額確認'},ctx);
 check(Number((await db.prepare('SELECT COUNT(*) n FROM hr_payroll_correction_uses WHERE run_id=? AND is_active=1').bind(next.id).first<{n:number}>())?.n)===1,'DELTA_CLAIM');
 await service.transition(Number(next.id),{action:'reopen',revision:next.revision,reason:'合成撤回釋放'},ctx);check(Number((await db.prepare('SELECT COUNT(*) n FROM hr_payroll_correction_uses WHERE is_active=1').first<{n:number}>())?.n)===0,'DELTA_RELEASE');
 rejected=false;try{await service.calculate(nextInput,ctx);}catch{rejected=true;}check(rejected,'REOPEN_RECALC_REASON');
 next=await service.calculate({...nextInput,reason:'合成撤回後重算'},ctx);next=await service.transition(Number(next.id),{action:'confirm',revision:next.revision,reason:'合成重確認'},ctx);await service.transition(Number(next.id),{action:'pay',revision:next.revision,reason:'合成已補發'},ctx);
 check(JSON.stringify((await service.get(Number(row.id))).result)===frozen,'ORIGINAL_UNCHANGED');
 await db.prepare("INSERT INTO hr_payroll_supplement_versions(effective_date,payload_json,source_url,source_hash,content_hash,source_text,created_at) VALUES('2021-01-01',?,'https://www.nhi.gov.tw/synthetic','synthetic','synthetic','synthetic',?)").bind(JSON.stringify({rate:2.11,cap:10000000,multiple:4}),now).run();
 const bonuses=new HrBonusService(db),bonusInput={requestKey:'accept-bonus',payDate:'2026-12-31',category:'年終獎金',attributionYear:2026,payments:[{employeeId,amount:100000,note:'合成獎金備註'}]};
 let bonus=await bonuses.save(bonusInput,ctx);check(bonus.payments[0].result.issues.length===0,'BONUS_READY');
 check((await bonuses.save(bonusInput,ctx)).id===bonus.id,'BONUS_IDEMPOTENT');
 bonus=await bonuses.transition(bonus.id,{action:'pay',revision:bonus.revision},ctx);check(bonus.status==='paid'&&bonus.payments[0].result.taxBonus===5000&&bonus.payments[0].note==='合成獎金備註','BONUS_PAID');
 const statement=await employerSupplement(db,'2026-12','合成投保單位');check(statement.statement?.income===170000&&statement.statement?.premium===3587,'EMPLOYER_SUPPLEMENT');
}
