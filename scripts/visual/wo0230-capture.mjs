import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {mkdirSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";

const port=4179,base="http://127.0.0.1:"+port+"/scripts/visual/wo0230.html";
const output="artifacts/wo-0230",date="2026-07";
mkdirSync(output,{recursive:true});
const machines=[
 {id:101,sequence:1,brand:"示範品牌",model:"A 型",quantity:1,saleDate:"2025-06-01",completed:true,completionDate:"2026-07-05",note:"第一趟保養",active:true},
 {id:102,sequence:2,brand:"示範品牌",model:"B 型",quantity:1,saleDate:"2025-08-15",completed:false,completionDate:null,note:"",active:true},
];
const visits=[
 {id:801,customerCode:"DE0001",customerName:"示範醫院",month:date,completed:false,completionDate:"2026-07-05",note:"第一趟保養",version:2,
  completedCount:1,totalCount:2,equipment:machines}
];
const rows=[{customerCode:"DE0001",customerName:"示範醫院",activeMaintenance:true,
 equipment:machines.map(m=>({id:m.id,sequence:m.sequence,brand:m.brand,model:m.model,quantity:m.quantity,saleDate:m.saleDate})),visits}];
const equipment={
 id:102,sequence:2,customerCode:"DE0001",customerName:"示範醫院",brand:"示範品牌",category:"STEAM",categoryOther:"",
 model:"B 型",saleDate:"2025-08-15",quantity:1,warrantyStart:"2025-08-15",warrantyEnd:"2027-08-14",
 maintenance:true,months:["2026-07"],machines:[{serialNo:"SN-EXAMPLE",manufacturedMonth:"2024-07-15",assetNumber:""}],
 version:1,createdAt:"2025-08-15T00:00:00Z",updatedAt:"2026-07-01T00:00:00Z"
};
function respond(url,method){
 const u=new URL(url),path=u.pathname;
 if(method!=="GET")throw new Error("Visual fixture is read-only: "+method);
 if(path.endsWith("/matrix"))return {rows,nextBefore:null,centerYear:2026};
 if(path.endsWith("/month-status"))return {completedMonths:["2026-07"]};
 if(path.endsWith("/visits"))return {rows:visits,nextBefore:null};
 if(path.endsWith("/equipment/102"))return equipment;
 if(path.endsWith("/equipment"))return {rows:[{...equipment,machines:[]}],nextBefore:null};
 if(path.endsWith("/history"))return {rows:[],nextCursor:null};
 throw new Error("Unmocked visual route "+u.pathname);
}
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--config","scripts/visual/vite.config.ts","--host","127.0.0.1","--port",String(port),"--strictPort"],{stdio:["ignore","pipe","pipe"]});
server.stdout.on("data",d=>process.stdout.write(d));
server.stderr.on("data",d=>process.stderr.write(d));
async function ready(){
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)return;}catch{}await delay(250);}
 throw new Error("WO0230 visual fixture server did not start");
}
let browser;
try{
 await ready();
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const v of [{label:"desktop-1440",width:1440,height:900},{label:"mobile-390",width:390,height:844}]){
  const ctx=await browser.newContext({viewport:{width:v.width,height:v.height},deviceScaleFactor:2,locale:"zh-TW"});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("response",r=>{if(r.status()>=400&&r.url().includes("/api/business/store/equipment"))errors.push("HTTP "+r.status()+" "+r.url());});
  await page.route("**/api/business/store/equipment**",route=>{
    try{return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,requestId:"wo0230-visual",data:respond(route.request().url(),route.request().method())})});}
    catch(e){errors.push(String(e));return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({ok:false,error:{code:"MISSING",message:String(e)}})});}
  });
  await page.goto(base,{waitUntil:"networkidle"});
  await page.locator(".cy-matrix-partial").waitFor({timeout:10000});
  await page.screenshot({path:output+"/"+v.label+"-01-partial.png",fullPage:true,animations:"disabled"});
  await page.locator(".cy-matrix-partial").click();
  await page.getByRole("dialog",{name:/逐台維護登記/}).waitFor();
  await page.getByText("第一趟保養").first().waitFor();
  await page.screenshot({path:output+"/"+v.label+"-02-per-machine-dialog.png",fullPage:true,animations:"disabled"});
  await page.goto(base+"?view=equipment",{waitUntil:"networkidle"});
  await page.getByRole("button",{name:"＋ 新增出機"}).waitFor();
  await page.getByRole("button",{name:"＋ 新增出機"}).click();
  await page.getByRole("dialog",{name:"新增出機"}).waitFor();
  await page.getByText("製造日期").first().waitFor();
  await page.screenshot({path:output+"/"+v.label+"-03-manufactured-date.png",fullPage:true,animations:"disabled"});
  if(errors.length)throw new Error(v.label+" page errors: "+errors.join("\n"));
  console.log(v.label+": three real React screenshots captured");
  await ctx.close();
 }
}finally{await browser?.close();server.kill("SIGTERM");}
