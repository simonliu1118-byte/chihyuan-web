import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {mkdirSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";

const directory="artifacts/wo-0180-screenshots";
mkdirSync(directory,{recursive:true});
const port=4179;
const base="http://127.0.0.1:"+port+"/scripts/visual/wo0180.html";
const product={id:101,itemNo:"FIN-001",name:"志遠成品 A",baseUnit:"EA",allowedUnits:["EA","BOX"]};
const component={id:201,itemNo:"MAT-001",name:"原料甲",baseUnit:"EA",allowedUnits:["EA","BOX"]};
const component2={id:202,itemNo:"MAT-002",name:"原料乙",baseUnit:"EA",allowedUnits:["EA"]};
const itemList=[product,component,component2];
const contractor={id:1,entityType:"organization",displayName:"高雄甲代工廠",billingMethod:"monthly",legalName:"高雄甲工業有限公司",taxId:"",phone:"07-200-1234",isActive:true,revision:1,updatedAt:"2026-11-10T08:00:00Z"};
const bom={id:11,recipeRef:"標準組裝配方 A",finishedItemId:101,outputQuantity:"1",outputUnit:"EA",isActive:true,revision:1,updatedAt:"2026-11-10T08:00:00Z",components:[]};
const order={id:1,outsourcing_ref:"OUT-20261110-A001",contractor_id:1,contractor_name_snapshot:contractor.displayName,order_date:"2026-11-10",note:"分批生產驗收",revision:3,closed_at:null,closed_reason:null,statusCode:"in_production",
  products:[{id:11,item_id:101,item_no:"FIN-001",item_name:"志遠成品 A",bom_recipe_id:11,recipe_ref:"標準組裝配方 A",planned_quantity:200000,delivered_quantity:120000,progress:60,unit:"EA"}],
  issues:[{id:1,issued_date:"2026-11-08",note:"第一批",cancelled_at:null,items:[{id:1,item_id:201,item_no:"MAT-001",name:"原料甲",quantity:1000000,unit:"EA"},{id:2,item_id:202,item_no:"MAT-002",name:"原料乙",quantity:300000,unit:"EA"}]}],
  receipts:[{id:1,received_date:"2026-11-09",erp_no:"IN-20261109-01",note:"第一批交貨",cancelled_at:null,items:[{id:1,item_id:101,item_no:"FIN-001",name:"志遠成品 A",order_product_id:11,quantity:120000,unit:"EA",unit_price:25000,pricing_unit:"EA",statement_status:"confirmed"}]}]};
const balances=[
 {contractorId:1,contractorName:contractor.displayName,billingMethod:"monthly",itemId:201,itemNo:"MAT-001",itemName:"原料甲",unit:"EA",quantity:"40",baseline:"100",percentage:40,tone:"yellow"},
 {contractorId:1,contractorName:contractor.displayName,billingMethod:"monthly",itemId:202,itemNo:"MAT-002",itemName:"原料乙",unit:"EA",quantity:"-5",baseline:"30",percentage:null,tone:"red"},
 {contractorId:1,contractorName:contractor.displayName,billingMethod:"monthly",itemId:203,itemNo:"MAT-003",itemName:"包裝盒",unit:"EA",quantity:"80",baseline:"100",percentage:80,tone:"green"}
];
const statement={id:1,contractor_id:1,contractor_name:contractor.displayName,billing_method:"monthly",statement_date:"2026-11-10",period_month:"2026-11",revision:2,status_code:"confirmed",total_amount:30000,paid_amount:10000,paymentStatus:"partial",
 lines:[{id:1,receipt_item_id:1,quantity:120000,pricing_unit:"EA",unit_price:25000,amount:30000,item_no:"FIN-001",item_name:"志遠成品 A",received_date:"2026-11-09",erp_no:"IN-20261109-01",outsourcing_ref:order.outsourcing_ref}],
 adjustments:[{id:1,description:"運費",amount:5000},{id:2,description:"折讓",amount:-5000}],
 payments:[{id:1,payment_date:"2026-11-10",method:"transfer",amount:10000,note:"第一筆匯款"}]};
function reply(path,method){
 if(path.endsWith("/lookups"))return {items:itemList};
 if(path.endsWith("/boms"))return {items:[bom],nextCursor:null};
 if(path.endsWith("/contractors/1"))return {...contractor,contacts:[{id:1,name:"王先生",title:"聯絡人",phone:"",mobile:"",note:"",sortOrder:0,isActive:true}],pricing:[{id:1,itemId:101,itemNo:"FIN-001",itemName:"志遠成品 A",pricingUnit:"EA",unitPrice:"2.5",revision:1,updatedAt:"2026-11-10T08:00:00Z",note:""}],createdAt:"2026-11-01T08:00:00Z",address:"高雄市"};
 if(path.endsWith("/contractors"))return {items:[contractor],nextCursor:null};
 if(path.endsWith("/orders/1/issue-suggestion"))return {items:[{itemId:201,itemNo:"MAT-001",itemName:"原料甲",unit:"EA",quantity:"10"}]};
 if(path.endsWith("/orders/1/consumption-preview"))return {items:[{itemId:201,itemNo:"MAT-001",itemName:"原料甲",quantity:"-4",unit:"EA"}]};
 if(path.endsWith("/orders/1"))return order;
 if(path.endsWith("/orders"))return {items:[order],nextCursor:null};
 if(path.endsWith("/stock/groups"))return {items:[{contractorId:1,contractorName:contractor.displayName,billingMethod:"monthly",groups:[{title:"FIN-001 志遠成品 A",bomName:"標準組裝配方 A",capacity:0,shortage:true,items:balances.slice(0,2)},{title:"其他料件",bomName:null,capacity:null,shortage:false,items:[balances[2]]}]}]};
 if(path.endsWith("/stock/history"))return {items:[{id:1,occurred_at:"2026-11-10",contractor_name:contractor.displayName,item_name:"原料甲",movement_type:"issue",quantity_delta:1000000,reason:"",operator_employee_id:1}]};
 if(path.endsWith("/stock"))return {items:balances};
 if(path.endsWith("/statements/unbilled"))return {items:[]};
 if(path.endsWith("/statements/1"))return statement;
 if(path.endsWith("/statements"))return {items:[statement],nextCursor:null};
 throw new Error("Fixture route missing: "+method+" "+path);
}
async function waitReady(){
 for(let i=0;i<100;i++){
  try{const response=await fetch(base);if(response.ok)return;}catch{}
  await delay(250);
 }
 throw new Error("Vite fixture server not ready");
}
const server=spawn("npx",["vite","--config","scripts/visual/vite.config.ts","--host","127.0.0.1","--port",String(port),"--strictPort"],{stdio:["ignore","pipe","pipe"]});
server.stdout.on("data",b=>process.stdout.write(b));
server.stderr.on("data",b=>process.stderr.write(b));
let browser;
try {
 await waitReady();
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const spec of [{name:"desktop-1440",width:1440,height:900},{name:"mobile-390",width:390,height:844}]){
   const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:2,locale:"zh-TW"});
   const page=await context.newPage();
   const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/api/business/outsourcing/**",route=>{
     const request=route.request(),path=new URL(request.url()).pathname;
     try{const data=reply(path,request.method());return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,requestId:"visual-fixture",data})});}
     catch(e){errors.push(String(e));return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({ok:false,requestId:"visual-fixture",error:{code:"NOT_FOUND",message:String(e)}})});}
   });
   const load=async()=>{await page.goto(base,{waitUntil:"networkidle"});await page.locator(".cy-op-tabs").waitFor();};
   const capture=async name=>{await page.screenshot({path:directory+"/"+spec.name+"-"+name+".png",fullPage:true,animations:"disabled"});};
   await load();
   await page.locator(".cy-op-list-row").first().click();
   await page.locator(".cy-md-detail").getByText(order.outsourcing_ref).waitFor();
   await capture("01-order");
   await page.getByRole("button",{name:"＋ 發料"}).click();
   await page.getByRole("dialog").waitFor();
   await capture("02-issue");
   await load();
   await page.locator(".cy-op-list-row").first().click();
   await page.getByRole("button",{name:"＋ 交貨入庫"}).click();
   await page.getByRole("dialog").waitFor();
   const amount=page.getByRole("dialog").locator('input[inputmode="decimal"]').first();
   await amount.fill("2");
   await page.getByText("預計從廠商庫存扣除").waitFor();
   await capture("03-receipt");
   await load();
   await page.getByRole("tab",{name:"代工庫存"}).click();
   await page.getByText("料件不足，需補料").waitFor();
   await capture("04-stock");
   await load();
   await page.getByRole("tab",{name:"對帳付款"}).click();
   await page.locator(".cy-op-list-row").first().click();
   await page.getByText("第一筆匯款").waitFor();
   await capture("05-statement");
   await load();
   await page.getByRole("tab",{name:"協力廠商／單價"}).click();
   await page.locator(".cy-op-list-row").first().click();
   await page.getByText("高雄甲工業有限公司").first().waitFor();
   await capture("06-contractor");
   console.log(spec.name+" screenshots: six verified views");
   if(errors.length)throw new Error(spec.name+" browser/fixture errors: "+errors.join("\n"));
   await context.close();
 }
} finally {
 await browser?.close();
 server.kill("SIGTERM");
}
