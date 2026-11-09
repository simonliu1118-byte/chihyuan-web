import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {build} from "esbuild";

const output=await build({entryPoints:["src/runtime/modules/ordering-file-share.ts"],bundle:true,platform:"node",format:"esm",write:false});
const {XLSX_MIME,supportsFileShare,shareExcelFile}=await import("data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64"));
const file={name:"台中20261108.xlsx",type:XLSX_MIME};

test("mobile native share receives the XLSX file synchronously from the user click",async()=>{
 let sent=null,downloads=0;
 const host={canShare(data){assert.deepEqual(data.files,[file]);return true},share(data){sent=data;return Promise.resolve()}};
 const promise=shareExcelFile(file,()=>downloads++,host);
 assert.ok(sent,"navigator.share must be invoked before the first Promise turn");
 assert.equal(sent.title,file.name);
 assert.deepEqual(sent.files,[file]);
 assert.equal(await promise,"shared");
 assert.equal(downloads,0);
});
test("mobile cancellation does not force a download or report an error",async()=>{
 let downloads=0;
 const host={canShare:()=>true,share(){return Promise.reject(Object.assign(new Error("dismissed"),{name:"AbortError"}))}};
 assert.equal(await shareExcelFile(file,()=>downloads++,host),"cancelled");
 assert.equal(downloads,0);
});
test("unsupported file sharing falls back to a real XLSX download",async()=>{
 let sent=0,downloaded=null;
 const host={canShare:()=>false,share(){sent++;return Promise.resolve()}};
 assert.equal(supportsFileShare(file,host),false);
 assert.equal(await shareExcelFile(file,f=>{downloaded=f},host),"downloaded");
 assert.equal(sent,0);
 assert.equal(downloaded,file);
});
test("browsers without share() and failed capability checks download instead of failing",async()=>{
 let downloads=0;
 assert.equal(await shareExcelFile(file,()=>downloads++,{}),"downloaded");
 assert.equal(await shareExcelFile(file,()=>downloads++,{share:()=>Promise.resolve(),canShare(){throw new Error("not supported")}}),"downloaded");
 assert.equal(downloads,2);
});
test("share permission errors fall back to download without losing the filename",async()=>{
 let downloaded;
 const host={canShare:()=>true,share:()=>Promise.reject(Object.assign(new Error("no activation"),{name:"NotAllowedError"}))};
 assert.equal(await shareExcelFile(file,f=>downloaded=f,host),"downloaded");
 assert.equal(downloaded.name,"台中20261108.xlsx");
});
test("one Share Excel button silently saves pending edits, then attempts native share; desktop remains unchanged",()=>{
 const page=readFileSync("src/runtime/modules/OrderingPage.tsx","utf8");
 assert.match(page,/function hasPendingExportEdits\(\)/);
 assert.match(page,/async function saveForExcelShare\(\)/);
 assert.match(page,/if\(needsSave&&!await saveForExcelShare\(\)\)return/);
 assert.match(page,/const file=xlsxFile\(cached\.current\.get\(order\.id\)\?\?order\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*const outcome=await shareExcelFile\(file,downloadExcelFile\)/);
 assert.match(page,/if\(outcome==="downloaded"\)setNotice/);
 assert.doesNotMatch(page,/if\(outcome==="retry"\)/);
 assert.doesNotMatch(page,/請再按一次/);
 assert.match(page,/label:"分享 Excel",onClick:\(\)=>void exportOrder\(current\),disabled:busy\|\|sharingExcel/);
 assert.match(page,/\{compact\?<OverflowMenu items=/);
 assert.match(page,/>匯出 Excel<\/button>/);
 assert.match(page,/if\(!await prepareSwitch\(\)\)return;order=cached\.current\.get\(order\.id\)\?\?order;[\s\S]*?const blob=new Blob/);
 assert.match(page,/a\.href=url;a\.download=exportFileName\(order\.sourceName,fallback\);a\.click\(\);URL\.revokeObjectURL\(url\)/);
});
