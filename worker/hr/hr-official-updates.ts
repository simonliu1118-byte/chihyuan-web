import {HOLIDAY_DATASET,HR_LAW_SOURCES,type OfficialUpdateState} from "../../shared/hr-official-updates";
import {officialText,officialUrl,parseCsv,resourceLinks,syncPayrollRules} from "./hr-payroll-import";
import {AuditService} from "../audit/audit-service";
type Fetcher=typeof fetch;
const DAY=86400000;
const taipei=(now:string)=>new Date(Date.parse(now)+8*3600000).toISOString().slice(0,10);
const day=(n:number)=>new Date(n).toISOString().slice(0,10);
const errorText=(e:unknown)=>e instanceof Error?e.message.slice(0,500):"官方來源更新失敗";
type Holiday={date:string;name:string};
// Strict full-year source validation. Government makeup days are not private-sector holidays.
export function normalizeHolidays(csv:string,year:number):Holiday[]{
 const rows=parseCsv(csv),head=rows.shift()?.map(s=>s.trim())??[];
 if(head.join(",")!=="西元日期,星期,是否放假,備註")throw Error("官方日曆欄位不符");
 const start=Date.UTC(year,0,1),end=Date.UTC(year+1,0,1);
 if(rows.length!==(end-start)/DAY)throw Error("官方日曆年度不完整");
 const calendar=new Map<string,{flag:string;note:string}>();
 for(const [i,r] of rows.entries()){
  const d=day(start+i*DAY);
  if(r.length!==4||r[0].trim().replaceAll("-","").replaceAll("/","")!==d.replaceAll("-","")||!["0","2"].includes(r[2].trim()))throw Error("官方日曆日期或放假欄異常");
  calendar.set(d,{flag:r[2].trim(),note:r[3].trim()});
 }
 const result:Holiday[]=[];
 const add=(date:string,name:string)=>{if(calendar.get(date)?.flag!=="2"||result.some(r=>r.date===date))throw Error("法定日期與官方日曆不一致，請人工核對 "+date);result.push({date,name})};
 // Fixed dates from the current statutory list. The holiday flag is independently checked.
 const fixed=[["01-01","中華民國開國紀念日"],["02-28","和平紀念日"],["05-01","勞動節"],["09-28","教師節"],["10-10","國慶日"],["10-25","臺灣光復暨金門古寧頭大捷紀念日"],["12-25","行憲紀念日"]];
 for(const [md,name] of fixed)add(year+"-"+md,name);
 const lunar=new Intl.DateTimeFormat("en-u-ca-chinese",{timeZone:"Asia/Taipei",month:"numeric",day:"numeric"});
 let newYear="",dragon="",midAutumn="";
 for(let n=start;n<end;n+=DAY){
  const parts=lunar.formatToParts(new Date(n+4*3600000)),m=parts.find(p=>p.type==="month")?.value,d=parts.find(p=>p.type==="day")?.value;
  if(m==="1"&&d==="1")newYear=day(n);
  if(m==="5"&&d==="5")dragon=day(n);
  if(m==="8"&&d==="15")midAutumn=day(n);
 }
 if(!newYear||!dragon||!midAutumn)throw Error("農曆日期無法核對");
 const spring=Date.parse(newYear+"T00:00:00Z");
 for(let i=-2;i<=2;i++)add(day(spring+i*DAY),i===-2?"小年夜":i===-1?"除夕":"春節");
 add(dragon,"端午節");add(midAutumn,"中秋節");
 const q=[...calendar].filter(([d,r])=>d>=year+"-04-03"&&d<=year+"-04-06"&&/清明|民族掃墓/.test(r.note)&&!/補假|調整放假/.test(r.note));
 if(q.length!==1)throw Error("清明節日期無法從官方日曆唯一辨識");
 const qingming=q[0][0];add(qingming,"清明節");
 const child=year+"-04-04";
 const childDate=qingming===child?day(Date.parse(child+"T00:00:00Z")+(new Date(child+"T00:00:00Z").getUTCDay()===4?DAY:-DAY)):child;
 add(childDate,"兒童節");
 if(result.length!==16)throw Error("法定假日數量不符，請人工核對");
 return result.sort((a,b)=>a.date.localeCompare(b.date));
}
export function holidayResource(html:string,year:number):string{
 const roc=String(year-1911),urls=new Set<string>();
 for(const link of resourceLinks(html,HOLIDAY_DATASET)){
  if(link.label!=="CSV")continue;
  const url=new URL(link.url),name=url.searchParams.get("name")??"";
  if(url.hostname==="www.dgpa.gov.tw"&&url.pathname==="/FileConversion"&&name.startsWith(roc+"年")&&name.includes("辦公日曆表")&&/\.csv$/i.test(name)&&!/google/i.test(name))urls.add(officialUrl(url.href).href);
 }
 if(urls.size!==1)throw Error(year+" 年官方年度 CSV 尚未公布或來源不唯一");
 return [...urls][0];
}
export function lawRevision(html:string,name:string):string{
 const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/\s+/g," ");
 if(!text.includes(name))throw Error("官方法規名稱不符");
 const m=/(?:修正日期|修正公布日期)\s*[：:]?\s*民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text)??/(?:公布日期|發布日期|公\(發\)布日期)\s*[：:]?\s*民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text);
 if(!m)throw Error("官方法規修正日期無法辨識");
 const value=(+m[1]+1911)+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
 if(day(Date.parse(value+"T00:00:00Z"))!==value)throw Error("官方法規日期無效");
 return value;
}
async function claim(db:D1Database,key:string,now:string,period?:string){
 await db.prepare("INSERT OR IGNORE INTO hr_official_update_state(key) VALUES(?)").bind(key).run();
 const lease=new Date(Date.parse(now)+15*60000).toISOString();
 const r=await db.prepare("UPDATE hr_official_update_state SET checked_at=?,lease_until=?,scheduled_period=COALESCE(?,scheduled_period) WHERE key=? AND (lease_until IS NULL OR lease_until<?) AND (? IS NULL OR scheduled_period IS NULL OR scheduled_period<>?)").bind(now,lease,period??null,key,now,period??null,period??null).run();
 return r.meta.changes?lease:null;
}
async function finish(db:D1Database,key:string,lease:string,now:string,error:string){
 await db.prepare("UPDATE hr_official_update_state SET error=?,success_at=CASE WHEN ?='' THEN ? ELSE success_at END,lease_until=NULL WHERE key=? AND lease_until=?").bind(error,error,now,key,lease).run();
}
export async function officialUpdateStatus(db:D1Database,kind:"holidays"|"legal"){
 return (await db.prepare("SELECT key,checked_at,success_at,error,revision,review_required,source_url FROM hr_official_update_state WHERE key LIKE ? ORDER BY key").bind(kind==="holidays"?"holiday:%":"law:%").all<OfficialUpdateState>()).results??[];
}
export async function updateHolidays(db:D1Database,now:string,actor:number|null,transport:Fetcher=fetch,period?:string){
 const year=Number(taipei(now).slice(0,4)),out:{year:number;ok:boolean;message:string}[]=[];
 for(const y of [year,year+1]){
  const key="holiday:"+y,lease=await claim(db,key,now,period);
  if(!lease){out.push({year:y,ok:false,message:"已執行或更新中"});continue}
  try{
   const html=await officialText(HOLIDAY_DATASET,transport),url=holidayResource(html,y),list=normalizeHolidays(await officialText(url,transport),y);
   const before=(await db.prepare("SELECT date,name,source FROM hr_holidays WHERE date>=? AND date<? ORDER BY date").bind(y+"-01-01",(y+1)+"-01-01").all<{date:string;name:string;source:string}>()).results??[];
   const dates=new Set(list.map(x=>x.date));
   const statements=[db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_official_update_state WHERE key=? AND lease_until=?) THEN 1 ELSE json(\x27\x27) END").bind(key,lease),...list.map(x=>db.prepare("INSERT INTO hr_holidays(date,name,note,source) SELECT ?,?,'','official' WHERE NOT EXISTS(SELECT 1 FROM hr_holiday_exclusions WHERE date=?) ON CONFLICT(date) DO UPDATE SET name=excluded.name WHERE hr_holidays.source='official' AND hr_holidays.date>=?").bind(x.date,x.name,x.date,taipei(now)))];
   for(const old of before)if(old.source==="official"&&!dates.has(old.date)&&old.date>=taipei(now))statements.push(db.prepare("DELETE FROM hr_holidays WHERE date=? AND source='official'").bind(old.date));
   statements.push(new AuditService(db).prepareRecord({entityType:"hr_setting",entityKey:key,action:"hr_setting.updated",actorEmployeeId:actor,requestId:crypto.randomUUID(),after:{source:url,dates:list.map(x=>x.date)}}));
   statements.push(db.prepare("UPDATE hr_official_update_state SET source_url=?,success_at=?,error='',lease_until=NULL WHERE key=? AND lease_until=?").bind(url,now,key,lease));
   await db.batch(statements);out.push({year:y,ok:true,message:"已核對 16 個法定假日，保留人工設定"});
  }catch(e){const error=errorText(e);await finish(db,key,lease,now,error);out.push({year:y,ok:false,message:error})}
 }
 return out;
}
export async function updateLaws(db:D1Database,now:string,transport:Fetcher=fetch,period?:string){
 const out:{key:string;ok:boolean;message:string}[]=[];
 for(let i=0;i<HR_LAW_SOURCES.length;i+=3)await Promise.all(HR_LAW_SOURCES.slice(i,i+3).map(async source=>{
  const key="law:"+source.key,lease=await claim(db,key,now,period);
  if(!lease){out.push({key,ok:false,message:"已執行或更新中"});return}
  try{
   const revision=lawRevision(await officialText(source.url,transport),source.name);
   const previous=await db.prepare("SELECT revision,review_required FROM hr_official_update_state WHERE key=?").bind(key).first<{revision:string;review_required:number}>();
   const changed=previous?.revision!==revision;
   await db.prepare("UPDATE hr_official_update_state SET revision=?,review_required=?,source_url=?,success_at=?,error='',lease_until=NULL WHERE key=? AND lease_until=?").bind(revision,changed||previous?.review_required?1:0,source.url,now,key,lease).run();
   out.push({key,ok:true,message:!previous?.revision?"首次建立基準，待人工核對":changed?"修正日期異動，待人工核對":"修正日期未變"});
  }catch(e){const error=errorText(e);await finish(db,key,lease,now,error);out.push({key,ok:false,message:error})}
 }));
 return out.sort((a,b)=>a.key.localeCompare(b.key));
}
export async function scheduledPayrollUpdate(db:D1Database,now:string,transport:Fetcher=fetch){
 const period=taipei(now),key="schedule:payroll",lease=await claim(db,key,now,period);
 if(!lease)return;
 try{const results=await syncPayrollRules(db,now,transport);await finish(db,key,lease,now,results.filter(r=>!r.ok).map(r=>r.kind+":"+r.message).join("；").slice(0,500))}catch(e){await finish(db,key,lease,now,errorText(e))}
}
export const officialUpdatePeriod=taipei;
