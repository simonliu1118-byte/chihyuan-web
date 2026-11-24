import {HrValidationError} from './hr-validation';
export async function employerSupplement(db:D1Database,month:string,unit:string){
 const last=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10);
 const [runs,profiles,rule]=await Promise.all([
  db.prepare("SELECT r.source||':'||r.id AS id,r.employee_id,e.employee_no,e.name,r.result_json FROM hr_paid_income r JOIN hr_employees e ON e.id=r.employee_id WHERE r.pay_date BETWEEN ? AND ? ORDER BY r.id,r.source LIMIT 2001").bind(month+'-01',last).all<{id:string;employee_id:number;employee_no:string;name:string;result_json:string}>(),
  db.prepare('SELECT e.id,e.employee_no,e.name,p.id AS profile_id,p.settings_json FROM hr_employees e LEFT JOIN hr_payroll_profiles p ON p.id=(SELECT q.id FROM hr_payroll_profiles q WHERE q.employee_id=e.id AND q.effective_date<=? ORDER BY q.effective_date DESC,q.id DESC LIMIT 1) ORDER BY e.id LIMIT 501').bind(last).all<{id:number;employee_no:string;name:string;profile_id:number;settings_json:string|null}>(),
  db.prepare('SELECT id,effective_date,payload_json,source_url FROM hr_payroll_supplement_versions WHERE effective_date<=? ORDER BY effective_date DESC,id DESC LIMIT 1').bind(last).first<{id:number;effective_date:string;payload_json:string;source_url:string}>(),
 ]);
 if((runs.results??[]).length>2000||(profiles.results??[]).length>500)throw new HrValidationError('limit','公司補充保費查詢超過本批上限');
 const people=(profiles.results??[]).map(p=>({...p,settings:p.settings_json?JSON.parse(p.settings_json):null})),payments=(runs.results??[]).map(r=>({...r,result:JSON.parse(r.result_json)}));
 const units=[...new Set([...people.map(p=>p.settings?.nhiUnitKey),...payments.map(p=>p.result.nhiUnitKey)].filter((x):x is string=>typeof x==='string'&&!!x))].sort();if(!unit)return {units,statement:null};
 if(!units.includes(unit))throw new HrValidationError('unit','請選擇已設定的投保單位');
 const included=payments.filter(r=>r.result.nhiUnitKey===unit),insured=people.filter(p=>p.settings?.nhiUnitKey===unit&&p.settings.healthEnabled&&p.settings.healthAtMonthEnd&&(p.settings.healthFrom??p.settings.insuredFrom)<=last&&(!(p.settings.healthTo??p.settings.insuredTo)||(p.settings.healthTo??p.settings.insuredTo)>=last));
 const issues:string[]=[];if(payments.some(p=>!p.result.nhiUnitKey||p.result.nhiIncome==null))issues.push('有已發薪紀錄尚缺投保單位或計費所得，請先完成資料核對');
 if(people.some(p=>p.settings?.healthEnabled&&!p.settings.nhiUnitKey))issues.push('有投保員工尚未指定投保單位，不能漏算投保總額');
 if(!included.length)issues.push('此給付月尚無該單位已發薪紀錄');if(!rule)issues.push('缺少有效官方補充保費規則');
 const income=included.reduce((n,r)=>n+Number(r.result.nhiIncome??0),0),basis=insured.reduce((n,r)=>n+Number(r.settings.healthBasis),0),policy=rule?JSON.parse(rule.payload_json):null;
 return {units,statement:{month,unit,income,basis,rate:policy?.rate??null,premium:policy?Math.floor(Math.max(0,income-basis)*policy.rate/100+0.5+1e-8):null,issues,policy:rule?{id:rule.id,source:rule.source_url,effectiveDate:rule.effective_date}:null,payments:included.map(r=>({id:r.id,employeeNo:r.employee_no,name:r.name,income:r.result.nhiIncome})),insured:insured.map(p=>({employeeNo:p.employee_no,name:p.name,profileId:p.profile_id,basis:p.settings.healthBasis}))}};
}
