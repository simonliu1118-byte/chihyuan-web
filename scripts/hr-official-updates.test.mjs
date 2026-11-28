import test from "node:test";
import assert from "node:assert/strict";
import {compiled} from "./test-support/hr-ui-fixture.mjs";
import {botCenterFixture} from "./test-support/bot-center-fixture.mjs";
import {cywebCronTasks} from "../shared/cyweb-cron.ts";
import {HR_LAW_SOURCES,HOLIDAY_DATASET} from "../shared/hr-official-updates.ts";
const {normalizeHolidays,holidayResource,lawRevision,updateHolidays,updateLaws,officialUpdateStatus}=await compiled("worker/hr/hr-official-updates.ts");
const {HrSettingsService}=await compiled("worker/hr/hr-settings-service.ts");
const now="2026-11-28T04:00:00.000Z",ctx={actor:1,now,requestId:"synthetic-official-update"};
const fixed=["01-01","02-28","04-04","04-05","05-01","09-28","10-10","10-25","12-25"];
const dates2026=[...fixed,"02-15","02-16","02-17","02-18","02-19","06-19","09-25"].sort();
const dates2027=[...fixed,"02-04","02-05","02-06","02-07","02-08","06-09","09-15"].sort();
function csv(year,dates){
 const lines=["西元日期,星期,是否放假,備註"];
 for(let n=Date.UTC(year,0,1);n<Date.UTC(year+1,0,1);n+=86400000){
  const d=new Date(n),md=d.toISOString().slice(5,10);
  const note=md==="04-05"?"清明節":md==="04-06"?"清明節補假":"";
  const off=dates.includes(md)||[0,6].includes(d.getUTCDay())||md==="04-06";
  lines.push(d.toISOString().slice(0,10).replaceAll("-","")+",日,"+(off?"2":"0")+","+note);
 }
 return lines.join("\n");
}
const url=y=>"https://www.dgpa.gov.tw/FileConversion?filename=synthetic.csv&name="+encodeURIComponent((y-1911)+"年中華民國政府行政機關辦公日曆表.csv");
const page=[2026,2027].map(y=>'<a href="'+url(y)+'">CSV</a>').join("");
const holidayFetcher=async u=>new Response(u===HOLIDAY_DATASET?page:u===url(2026)?csv(2026,dates2026):u===url(2027)?csv(2027,dates2027):"",{status:[HOLIDAY_DATASET,url(2026),url(2027)].includes(u)?200:404});
test("semiannual calendar gate is Taiwan 04:00 on June and December 20 only",()=>{
 for(const d of ["2026-06-19T20:00:00Z","2026-12-19T20:00:00Z","2027-06-19T20:00:00Z"])assert.equal(cywebCronTasks(Date.parse(d)).hrOfficialUpdates,true,d);
 for(const d of ["2026-06-20T20:00:00Z","2026-06-19T20:05:00Z","2026-12-19T19:55:00Z","2027-01-01T20:00:00Z","2026-07-01T20:00:00Z"])assert.equal(cywebCronTasks(Date.parse(d)).hrOfficialUpdates,false,d);
});
test("complete calendar checks actual statutory dates and excludes makeup/ordinary weekend days",()=>{
 for(const [year,dates] of [[2026,dates2026],[2027,dates2027]]){
  const result=normalizeHolidays(csv(year,dates),year);
  assert.deepEqual(result.map(r=>r.date.slice(5)),dates);
  assert.equal(result.length,16);
  assert(!result.some(r=>r.date.endsWith("04-06")));
 }
 assert.equal(holidayResource(page,2027),url(2027));
 assert.throws(()=>holidayResource(page,2028),/尚未公布/);
 assert.throws(()=>normalizeHolidays(csv(2026,dates2026).split("\n").slice(0,-1).join("\n"),2026),/不完整/);
 assert.throws(()=>normalizeHolidays(csv(2026,dates2026.filter(x=>x!=="12-25")),2026),/不一致/);
});
test("import preserves manual edits and deletions, duplicate schedule does not fetch, failed year keeps data",async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());const settings=new HrSettingsService(f.db);
 await settings.saveHoliday({date:"2026-12-25",name:"人工名稱",note:"保留備註"},ctx);
 await settings.saveHoliday({date:"2027-01-01",name:"人工刪除"},ctx);await settings.deleteHoliday("2027-01-01",ctx);
 const result=await updateHolidays(f.db,now,1,holidayFetcher,"2026-12-20");
 assert.ok(result.every(r=>r.ok),JSON.stringify(result));
 assert.deepEqual({...f.sql.prepare("SELECT name,note,source FROM hr_holidays WHERE date='2026-12-25'").get()},{name:"人工名稱",note:"保留備註",source:"manual"});
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM hr_holidays WHERE date='2027-01-01'").get().n,0);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM hr_holidays WHERE date='2027-12-25' AND source='official'").get().n,1);
 await updateHolidays(f.db,now,1,async()=>{throw Error("must not fetch")},"2026-12-20");
 const before=f.sql.prepare("SELECT COUNT(*) n FROM hr_holidays").get().n;
 await updateHolidays(f.db,"2026-11-29T04:00:00Z",1,async()=>new Response("bad",{status:503}));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM hr_holidays").get().n,before);
 assert.ok((await officialUpdateStatus(f.db,"holidays")).every(r=>r.error&&r.success_at===now));
});
test("legal revision dates, failure retains baseline, duplicate period, review flag persists",async t=>{
 assert.equal(lawRevision("<td>勞動基準法</td><td>修正日期：</td><td>民國 113 年 07 月 31 日</td>","勞動基準法"),"2024-07-31");
 assert.throws(()=>lawRevision("網站錯誤","勞動基準法"));
 const f=botCenterFixture();t.after(()=>f.sql.close());let count=0;
 const transport=async u=>{count++;const s=HR_LAW_SOURCES.find(x=>x.url===u);return new Response(s.name+" 修正日期：民國 115 年 09 月 30 日")};
 assert.ok((await updateLaws(f.db,now,transport,"2026-12-20")).every(r=>r.ok));
 assert.equal(count,HR_LAW_SOURCES.length);
 await updateLaws(f.db,now,transport,"2026-12-20");assert.equal(count,HR_LAW_SOURCES.length);
 const rows=await officialUpdateStatus(f.db,"legal");assert.equal(rows.length,HR_LAW_SOURCES.length);assert.ok(rows.every(r=>r.review_required===1&&r.revision==="2026-09-30"));
 await updateLaws(f.db,"2026-11-29T04:00:00Z",async()=>new Response("blocked",{status:403}));
 assert.ok((await officialUpdateStatus(f.db,"legal")).every(r=>r.error&&r.revision==="2026-09-30"));
});
