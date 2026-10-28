// Chromium renders the real StoreStocktake React component and production CSS.
// Every API response is from main.tsx synthetic fixtures; no production access.
import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";

const output="artifacts/stocktake-visual";
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const failures=[],manifest=[];
const scenarios=[
 {scene:"counting",width:1440,height:900,name:"1440-counting"},
 {scene:"counting",width:1440,height:900,name:"1440-first-confirm",action:"first-confirm"},
 {scene:"recounting",width:1440,height:900,name:"1440-recounting"},
 {scene:"failed",width:1440,height:900,name:"1440-write-failed"},
 {scene:"counting",width:390,height:844,name:"390-counting"},
 {scene:"counting",width:390,height:844,name:"390-add-batch",action:"add-batch"},
 {scene:"recounting",width:390,height:844,name:"390-recounting"},
];
try{
 for(const config of scenarios){
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},
   deviceScaleFactor:1,isMobile:config.width===390,hasTouch:config.width===390});
  page.on("pageerror",err=>failures.push(config.name+": "+err.message));
  const url="http://127.0.0.1:4173/scripts/stocktake-visual/index.html?scene="+config.scene;
  await page.goto(url,{waitUntil:"networkidle",timeout:45000});
  if(config.width===390){
   const select=page.getByRole("combobox",{name:"選擇盤點底稿"});
   await select.waitFor();
   assert.equal(await select.isVisible(),true,"390px must use the mobile sheet dropdown");
   await select.selectOption("990001");
  }else{
   await page.getByRole("button",{name:/990001.*初盤中|990001.*複盤中|990001.*寫回失敗/}).click();
  }
  await page.getByText("合成草本商品甲").first().waitFor();
  if(config.scene==="counting"){
   assert.equal(await page.locator(".cy-stocktake-qty-row small").filter({hasText:"帳面"}).count(),0,
    "COUNTING must not render the hidden ERP book quantity");
  }
  if(config.scene==="recounting"){
   assert.ok(await page.getByText("差異（初盤－帳面）").count()>0,
    "RECOUNTING must reveal differences");
  }
  if(config.scene==="failed"){
   assert.ok(await page.getByRole("button",{name:"重新寫回"}).count()>0);
  }
  if(config.action==="first-confirm"){
   await page.getByRole("button",{name:"第一次確認"}).click();
   await page.getByText(/確認後依 ERP 帳面核算並顯示/).waitFor();
  }
  if(config.action==="add-batch"){
   await page.getByRole("button",{name:"新增批號"}).first().click();
   await page.getByRole("heading",{name:"新增批號"}).waitFor();
  }
  const widths=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    content:document.documentElement.scrollWidth,
    main:document.querySelector(".cy-stocktake-main")?.getBoundingClientRect().width
  }));
  assert.ok(widths.content<=widths.viewport+1,
   config.name+": unexpected horizontal scrollbar "+JSON.stringify(widths));
  assert.ok((widths.main??0)>150,config.name+": detail width collapsed");
  const path=output+"/"+config.name+".png";
  // Native <dialog> backdrops cover the viewport; a full-page capture of
  // a modal can leave lower off-screen content undimmed in the screenshot.
  await page.screenshot({path,fullPage:!config.action,animations:"disabled"});
  manifest.push({...config,actualViewport:widths.viewport,actualScrollWidth:widths.content,path});
  await page.close();
 }
 assert.deepEqual(failures,[],"React runtime errors during browser render");
 console.log(JSON.stringify({result:"PASS",screenshots:manifest},null,2));
}finally{
 await browser.close();
}
