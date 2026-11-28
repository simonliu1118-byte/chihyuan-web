import type {HealthTable,LaborTable,PayrollRule,PensionTable,RuleKind,TaxTable} from '../../shared/hr-payroll';
import {AuditService} from '../audit/audit-service';
import {HrValidationError} from './hr-validation';

const HOSTS=new Set(['data.gov.tw','apiservice.mol.gov.tw','info.nhi.gov.tw','www.ntbt.gov.tw','www.etax.nat.gov.tw','www.mol.gov.tw','www.nhi.gov.tw','www.dgpa.gov.tw','law.moj.gov.tw','laws.mol.gov.tw']);
const datasets={labor:6259,pension:6274,health:20246,tax:25627} as const;
const LIMIT=1_000_000;
export const sha256=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export function officialUrl(value:string):URL {const u=new URL(value);if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.port||u.username||u.password)throw Error('非核准官方資料來源');return u;}
/** No automatic redirects, bounded streaming and per-request timeout, including the body. */
export async function officialText(url:string,transport:typeof fetch=fetch):Promise<string>{
 let next=officialUrl(url).href;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{for(let hop=0;hop<4;hop++){
  const r=await transport(next,{redirect:'manual',signal:controller.signal,headers:{Accept:'*/*','User-Agent':'CYWEB-Payroll/1.0'}});
  if(r.status>=300&&r.status<400){const location=r.headers.get('location');if(!location)throw Error('官方資料重新導向缺少目標');next=officialUrl(new URL(location,next).href).href;continue;}
  if(!r.ok)throw Error('官方來源HTTP '+r.status);
  if(Number(r.headers.get('content-length')??0)>LIMIT)throw Error('官方表過大');
  const reader=r.body?.getReader();if(!reader)throw Error('官方表沒有內容');
  const chunks:Uint8Array[]=[],decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});let size=0;
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>LIMIT)throw Error('官方表過大');chunks.push(item.value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return decoder.decode(bytes).replace(/^\uFEFF/,'');}catch{return new TextDecoder('big5',{fatal:true,ignoreBOM:false}).decode(bytes).replace(/^\uFEFF/,'');}
 }throw Error('官方來源重新導向次數過多');}finally{clearTimeout(timer);}
}
const plain=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function resourceLinks(html:string,base:string){
 const anchors=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
 return anchors.map((m,i)=>({
  url:new URL(m[1].replace(/&amp;/g,'&'),base).href,label:plain(m[2]),context:plain(m[2]+' '+html.slice(m.index!+m[0].length,Math.min(m.index!+m[0].length+1600,anchors[i+1]?.index??html.length))),
 }));
}
export function parseCsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else throw Error('CSV引號格式錯誤');}
  else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
  else cell+=c;
 }if(quoted)throw Error('CSV不完整');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
const number=(x:unknown)=>{const s=String(x??'').replace(/[,，%\s]/g,'');if(!/^\d+(\.\d+)?$/.test(s))throw Error('官方金額／費率格式錯誤');const n=Number(s);if(!Number.isSafeInteger(n*10000)||n>10_000_000)throw Error('官方金額超過安全範圍');return n;};
const date=(s:string)=>{const m=/^(\d{3}|\d{4})(\d{2})(\d{2})$/.exec(s);if(!m)throw Error('官方生效日期不明');const y=+m[1]+(m[1].length===3?1911:0),out=`${y}-${m[2]}-${m[3]}`;if(new Date(out+'T00:00:00Z').toISOString().slice(0,10)!==out)throw Error('官方生效日無效');return out;};
const headingDate=(text:string)=>{const m=/自?\s*(\d{3})年\s*(\d{1,2})月\s*(?:(\d{1,2})日)?/.exec(plain(text));if(!m)throw Error('官方公告缺少生效年／月');return date(m[1]+m[2].padStart(2,'0')+(m[3]??'1').padStart(2,'0'));};
const MINIMUM_SOURCE='https://www.mol.gov.tw/1607/28162/28166/28180/99861/28184/29016/';
export function normalizeMinimum(html:string){
 const text=plain(html).replace(/\s/g,''),rows=[...text.matchAll(/自(\d{3})年(\d{1,2})月(\d{1,2})日起實施[，,]訂定每月最低工資為([\d,]+)元[，,]每小時最低工資為([\d,]+)元/g)].map(m=>({effectiveDate:date(m[1]+m[2].padStart(2,'0')+m[3].padStart(2,'0')),monthly:number(m[4]),hourly:number(m[5])}));
 if(!rows.length||rows.some(r=>r.hourly<100||r.hourly>1000||r.monthly<20000||r.monthly>100000))throw Error('官方最低工資公告格式或金額不完整');
 return rows;
}
function increasing(values:number[],minimum:number){if(values.length<minimum||values.some((v,i)=>!Number.isSafeInteger(v)||v<=0||i>0&&v<=values[i-1]))throw Error('官方表級數不完整、重複或未遞增');}
export function normalizeLabor(raw:unknown,metadata:string):{effective:string;data:LaborTable}{
 if(!Array.isArray(raw)||raw.length<20||raw.length>150)throw Error('勞就保表筆數無效');
 const rows=raw.map(r=>({basis:number(r['投保薪資']),laborRate:number(r['勞保普通費率']),employmentRate:number(r['就保費率']),worker:number(r['勞工應負擔保費金額']),employer:number(r['單位應負擔保費金額'])})).sort((a,b)=>a.basis-b.basis);
 increasing(rows.map(r=>r.basis),20);
 if(raw.some((r,i)=>Number(r['序號'])!==i+1)||rows.at(-1)!.basis<45800)throw Error('勞就保表尾或序號不完整');
 for(const r of rows){if(r.laborRate<=0||r.laborRate>30||r.employmentRate>5||Math.abs(r.worker-r.basis*(r.laborRate+r.employmentRate)/100*0.2)>2||Math.abs(r.employer-r.basis*(r.laborRate+r.employmentRate)/100*0.7)>2)throw Error('勞就保官方金額與費率不一致');}
 return {effective:headingDate(metadata),data:{rows,minimum:0}};
}
export function normalizePension(raw:unknown):{effective:string;data:PensionTable}{
 if(!Array.isArray(raw)||raw.length<50||raw.length>150)throw Error('勞退級距不完整');
 const effective=date(String(raw[0]['生效日']));if(raw.some(r=>date(String(r['生效日']))!==effective))throw Error('勞退表混入不同生效日');
 const amounts=raw.map(r=>number(r['月提繳工資金額/月提繳執行業務所得金額']));increasing(amounts,50);
 if(raw.some((r,i)=>Number(r['等級'])!==i+1)||amounts.at(-1)!<150000)throw Error('勞退表尾或級數不完整');return {effective,data:{amounts}};
}
export function normalizeHealth(raw:string,metadata:string):{effective:string;data:HealthTable}{
 const csv=parseCsv(raw),header=csv.shift()??[];
 if(header.length!==8||!header[1].includes('投保金額')||!header[2].includes('本人'))throw Error('健保表欄位不符');
 const rows=csv.map((r,i)=>{if(r.length!==8||number(r[0])!==i+1)throw Error('健保表缺欄或級距');return {basis:number(r[1]),worker:r.slice(2,6).map(number),employer:number(r[6])};});
 increasing(rows.map(r=>r.basis),50);
 if(headingDate(metadata)>='2025-01-01'&&rows.at(-1)!.basis<313000)throw Error('健保最高級距缺失');
 for(const r of rows)if(r.worker.some((n,i)=>n!==r.worker[0]*(i+1))||r.worker[0]>r.basis||r.employer<r.worker[0])throw Error('健保負擔金額不一致');
 return {effective:headingDate(metadata),data:{rows}};
}
export function normalizeTax(raw:string,evidence:string,minimum:number):{effective:string;data:TaxTable}{
 const m=/(\d{3})年度為\s*([\d,]+)元/.exec(plain(evidence));if(!m)throw Error('扣繳表缺少官方年度與起扣點佐證');
 const policy=plain(evidence).replace(/\s/g,'');
 if(!['扣繳5%','扣繳18%','扣繳6%','1.5倍','不超過2,000元'].every(text=>policy.includes(text)))throw Error('官方扣繳費率或免扣規則已變更，須核對計算核心');
 const year=+m[1]+1911,threshold=number(m[2]),csv=parseCsv(raw),header=csv.shift()??[];
 if(header.length!==13||!header[0].includes('每月薪資所得')||!header[12].includes('11人'))throw Error('扣繳表扶養欄位不完整');
 const rows=csv.map(r=>{const range=/^\s*([\d,]+)\s*[~～-]\s*([\d,]+)\s*$/.exec(r[0]);if(!range||r.length!==13)throw Error('扣繳表級距無法辨識');return {from:number(range[1]),to:number(range[2]),amounts:r.slice(1).map(number)};});
 if(rows.length<100||rows.length>3000||rows.some((r,i)=>r.to<r.from||i>0&&r.from!==rows[i-1].to+1||r.amounts.some((a,j)=>!Number.isSafeInteger(a)||j>0&&a>r.amounts[j-1]||i>0&&a<rows[i-1].amounts[j])))throw Error('扣繳表級距或稅額不一致');
 if(rows.find(r=>r.amounts[0]>0)?.from!==threshold||minimum<=0||rows.at(-1)?.to!==500000)throw Error('扣繳CSV與官方起扣點／最低工資／表尾不一致');
 return {effective:year+'-01-01',data:{rows,nonresidentThreshold:minimum*1.5,nonMonthlyThreshold:threshold}};
}
async function resource(dataset:number,format:'JSON'|'CSV',transport:typeof fetch){
 const page='https://data.gov.tw/dataset/'+dataset,html=await officialText(page,transport);
 const links=resourceLinks(html,page).filter(l=>l.label===format);
 if(!links.length)throw Error('官方資料集缺少 '+format+' 來源');
 return {html,links};
}
export const SUPPLEMENT_SOURCE='https://www.nhi.gov.tw/ch/cp-4516-74b0f-2613-1.html';
export function normalizeSupplement(html:string){
 const text=plain(html),stamp=/最新\s*(\d{3})[.年]\s*(\d{1,2})[.月]\s*(\d{1,2})/.exec(text),rate=/費率\s*(\d+(?:\.\d+)?)%/.exec(text),cap=/單次以\s*([\d,]+)\s*萬元/.exec(text),multiple=/投保金額\s*(\d+)\s*倍/.exec(text);
 if(!stamp||!rate||!cap||!multiple||!text.includes('兼職薪資所得')||!text.includes('基本工資')||!text.includes('投保金額總額'))throw Error('官方補充保費日期／費率／門檻不完整');
 const effective=date(stamp[1]+stamp[2].padStart(2,'0')+stamp[3].padStart(2,'0')),data={rate:number(rate[1]),cap:number(cap[1])*10000,multiple:number(multiple[1])};
 if(data.rate<=0||data.rate>10||data.cap<100000||data.cap>100000000||data.multiple<=0||data.multiple>20)throw Error('官方補充保費數值無效');return {effective,data};
}
export async function downloadRule(kind:RuleKind,transport:typeof fetch=fetch){
 const page=await resource(datasets[kind],kind==='labor'||kind==='pension'?'JSON':'CSV',transport);
 const dated=page.links.flatMap(l=>{try{return [{l,at:headingDate(l.context)}];}catch{return [];}});
 const selected=kind==='health'?dated.sort((a,b)=>b.at.localeCompare(a.at))[0]?.l:page.links[0];
 if(!selected)throw Error('官方資源未標示可驗證的生效日期');
 const raw=await officialText(selected.url,transport);let normalized:{effective:string;data:PayrollRule['data']},evidence='';
 let minimumWages:ReturnType<typeof normalizeMinimum>=[];
 if(kind==='labor'){
  normalized=normalizeLabor(JSON.parse(raw),page.html);
  const grades=await resource(6258,'JSON',transport),gradeRaw=await officialText(grades.links[0].url,transport),records=JSON.parse(gradeRaw);
  const ordinary=records.filter((r:Record<string,string>)=>r['身分別']==='一般勞工');
  if(!ordinary.length||ordinary.some((r:Record<string,string>)=>date(r['適用起日'])!==normalized.effective))throw Error('勞保級距與保費表生效日不同');
  const minimum=Math.min(...ordinary.map((r:Record<string,string>)=>number(r['月投保薪資'])));
  if((normalized.data as LaborTable).rows.at(-1)!.basis!==Math.max(...ordinary.map((r:Record<string,string>)=>number(r['月投保薪資']))))throw Error('勞保最高級距與保費表不一致');
  const minimumRaw=await officialText(MINIMUM_SOURCE,transport);minimumWages=normalizeMinimum(minimumRaw);
  if(minimumWages.find(r=>r.effectiveDate===normalized.effective)?.monthly!==minimum)throw Error('官方最低工資與一般勞工投保下限不一致');
  (normalized.data as LaborTable).minimum=minimum;evidence=JSON.stringify({gradeRaw,minimumRaw,minimumSource:MINIMUM_SOURCE});
 }else if(kind==='pension')normalized=normalizePension(JSON.parse(raw));
 else if(kind==='health')normalized=normalizeHealth(raw,selected.context);
 else{
  evidence=await officialText('https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/withheld-rule/rule/NM11BZY',transport);
  const labor=await downloadRule('labor',transport);
  normalized=normalizeTax(raw,evidence,(labor.data as LaborTable).minimum);
  if(normalized.effective.slice(0,4)!==labor.effective.slice(0,4))throw Error('扣繳佐證與最低工資年度不同');
 }
 let supplement:{effective:string;data:{rate:number;cap:number;multiple:number};raw:string;hash:string;sourceHash:string}|undefined;
 if(kind==='health'){const text=await officialText(SUPPLEMENT_SOURCE,transport),normalized=normalizeSupplement(text);supplement={...normalized,raw:text,hash:await sha256(JSON.stringify(normalized)),sourceHash:await sha256(text)};}
 const parserVersion=1,hash=await sha256(JSON.stringify({parserVersion,kind,normalized}));
 const archive=JSON.stringify({parserVersion,raw,evidence,datasetUrl:'https://data.gov.tw/dataset/'+datasets[kind],resourceContext:selected.context,metadata:plain(page.html)});
 if(new TextEncoder().encode(archive).byteLength>1500000)throw Error('官方原文封存超過安全上限');
 return {kind,...normalized,supplement,hash,sourceHash:await sha256(raw),url:selected.url,raw:archive,minimumWages,validUntil:kind==='tax'||kind==='labor'?normalized.effective.slice(0,4)+'-12-31':'9999-12-31'};
}
export async function syncPayrollRules(db:D1Database,now:string,transport:typeof fetch=fetch){
 const results:{kind:RuleKind;ok:boolean;message:string}[]=[];
 for(const kind of ['labor','pension','health','tax'] as const){
  // A short lease suppresses concurrent manual/cron imports; failed jobs are retryable.
  await db.prepare("INSERT OR IGNORE INTO hr_payroll_sync_state(kind,checked_at) VALUES(?,?)").bind(kind,now).run();
  const lease=new Date(Date.parse(now)+5*60000).toISOString();
  const lock=await db.prepare("UPDATE hr_payroll_sync_state SET lease_until=?,checked_at=?,revision=revision+1 WHERE kind=? AND (lease_until IS NULL OR lease_until<?)").bind(lease,now,kind,now).run();
  if(!lock.meta.changes){results.push({kind,ok:false,message:'同一來源正在更新'});continue;}
  try{
   const r=await downloadRule(kind,transport);
   const existing=await db.prepare("SELECT id FROM hr_payroll_rule_versions WHERE kind=? AND effective_date=? AND content_hash=?").bind(kind,r.effective,r.hash).first();
   const statements:D1PreparedStatement[]=[];
   for(const wage of r.minimumWages){
    const before=await db.prepare('SELECT monthly_amount,hourly_amount FROM hr_minimum_wages WHERE effective_date=?').bind(wage.effectiveDate).first<{monthly_amount:number;hourly_amount:number}>();
    if(before&&(before.monthly_amount!==wage.monthly||before.hourly_amount!==wage.hourly))throw Error('既有最低工資與官方公告不一致，須先核對');
    if(!before){statements.push(db.prepare('INSERT OR IGNORE INTO hr_minimum_wages(effective_date,monthly_amount,hourly_amount,created_at,created_by) VALUES(?,?,?,?,NULL)').bind(wage.effectiveDate,wage.monthly,wage.hourly,now));
     statements.push(db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_minimum_wages WHERE effective_date=? AND monthly_amount=? AND hourly_amount=?) THEN 1 ELSE json('') END").bind(wage.effectiveDate,wage.monthly,wage.hourly));
     statements.push(new AuditService(db).prepareRecord({entityType:'hr_setting',entityKey:'minimum_wages',action:'hr_setting.updated',actorEmployeeId:null,requestId:crypto.randomUUID(),after:{...wage,source:MINIMUM_SOURCE}}));
    }
   }
   if(!existing){statements.push(db.prepare("INSERT OR IGNORE INTO hr_payroll_rule_versions(kind,effective_date,valid_until,source_url,source_hash,content_hash,payload_json,source_text,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(kind,r.effective,r.validUntil,r.url,r.sourceHash,r.hash,JSON.stringify(r.data),r.raw,now));
    statements.push(new AuditService(db).prepareRecord({entityType:'hr_payroll_rule',entityKey:kind,action:'hr_payroll_rule.imported',actorEmployeeId:null,requestId:crypto.randomUUID(),after:{effectiveDate:r.effective,source:r.url,hash:r.hash}}));}
   if(r.supplement){const p=r.supplement,found=await db.prepare('SELECT id FROM hr_payroll_supplement_versions WHERE effective_date=? AND content_hash=?').bind(p.effective,p.hash).first();
    if(!found){statements.push(db.prepare('INSERT INTO hr_payroll_supplement_versions(effective_date,payload_json,source_url,source_hash,content_hash,source_text,created_at) VALUES(?,?,?,?,?,?,?)').bind(p.effective,JSON.stringify(p.data),SUPPLEMENT_SOURCE,p.sourceHash,p.hash,p.raw,now));statements.push(new AuditService(db).prepareRecord({entityType:'hr_payroll_rule',entityKey:'health_supplement',action:'hr_payroll_rule.imported',actorEmployeeId:null,requestId:crypto.randomUUID(),after:{effectiveDate:p.effective,source:SUPPLEMENT_SOURCE,hash:p.hash}}));}
   }
   statements.push(db.prepare("UPDATE hr_payroll_sync_state SET success_at=?,error='',blocking=0,lease_until=NULL WHERE kind=? AND lease_until=?").bind(now,kind,lease));
   await db.batch(statements);results.push({kind,ok:true,message:existing?'官方內容未變':'已導入 '+r.effective});
  }catch(e){const message=e instanceof Error?e.message:'官方表更新失敗',blocking=/^官方來源HTTP |abort|timeout|fetch failed|network|failed to fetch|timed out/i.test(message)?0:1;await db.prepare("UPDATE hr_payroll_sync_state SET error=?,blocking=max(blocking,?),lease_until=NULL WHERE kind=? AND lease_until=?").bind(message.slice(0,500),blocking,kind,lease).run();results.push({kind,ok:false,message});}
 }
 return results;
}
export async function payrollRuleStatus(db:D1Database){
 const [versions,states,supplements]=await Promise.all([db.prepare('SELECT id,kind,effective_date,valid_until,source_url,source_hash,created_at FROM hr_payroll_rule_versions ORDER BY kind,effective_date DESC,id DESC LIMIT 201').all(),db.prepare('SELECT kind,checked_at,success_at,error FROM hr_payroll_sync_state ORDER BY kind').all(),db.prepare("SELECT id,'health_supplement' AS kind,effective_date,'9999-12-31' AS valid_until,source_url,source_hash,created_at FROM hr_payroll_supplement_versions ORDER BY effective_date DESC,id DESC LIMIT 201").all()]);
 if((versions.results??[]).length>200)throw new HrValidationError('limit','版本超過單次查詢上限');return {versions:[...(versions.results??[]),...(supplements.results??[])],states:states.results??[]};
}
