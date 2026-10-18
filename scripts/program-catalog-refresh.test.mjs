import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { verifiedProgramCatalog } from "../shared/program-catalog.ts";
const directory=mkdtempSync(fileURLToPath(new URL("../node_modules/.cyweb-programs-",import.meta.url)));
let ProgramCatalogView, ProgramCatalogPage, FeedbackProvider, programRefreshMessage, selectProgramRelease, acceptProgramCatalog;
try {
  for (const [entry,name] of [["src/runtime/modules/ProgramCatalogPage.tsx","view"],["worker/programs/release-catalog.ts","reader"],["worker/acceptance/program-catalog-acceptance.ts","acceptance"]]) {
    const outfile=join(directory,name+".mjs");
    await build({...(name==="view"?{stdin:{contents:'export * from "./src/runtime/modules/ProgramCatalogPage"; export {FeedbackProvider} from "./src/ui/feedback/FeedbackProvider";',resolveDir:fileURLToPath(new URL("../",import.meta.url)),loader:"ts"}}:{entryPoints:[entry]}),outfile,bundle:true,platform:"node",format:"esm",jsx:"automatic",packages:"external",loader:{".css":"empty",".svg":"text"}});
  }
  ({ProgramCatalogView,ProgramCatalogPage,FeedbackProvider,programRefreshMessage}=await import(pathToFileURL(join(directory,"view.mjs"))));
  ({selectProgramRelease}=await import(pathToFileURL(join(directory,"reader.mjs"))));
  ({acceptProgramCatalog}=await import(pathToFileURL(join(directory,"acceptance.mjs"))));
} finally { rmSync(directory,{recursive:true,force:true}); }
test("published converter uses its exact formal tag and compiled asset; latest without ZIP cannot borrow older ZIP",()=>{
  const converter=verifiedProgramCatalog.programs.find(row=>row.id==="converter");
  const release={tag_name:"smartcopiconverter-v1.0.1",draft:false,prerelease:false,published_at:"2026-10-15T17:13:11Z",assets:[{name:"SMARTCOPIConverter_V1.0.1_Windows_x64.zip",browser_download_url:converter.downloadUrl,state:"uploaded",size:100}]};
  assert.equal(selectProgramRelease(converter,[release]).downloadUrl,converter.downloadUrl);
  assert.equal(selectProgramRelease(converter,[release,{...release,tag_name:"smartcopiconverter-v1.0.2",assets:[]}]).downloadUrl,null);
  assert.equal(selectProgramRelease(converter,[{...release,prerelease:true}]),null);
  assert.equal(selectProgramRelease(converter,[{...release,draft:true}]),null);
  assert.equal(selectProgramRelease(converter,[{...release,assets:[{...release.assets[0],browser_download_url:"https://untrusted.test/file.zip"}]}]).downloadUrl,null);
});

test("ERP auto-input selects only the formal product ZIP, excluding OCR models and unrelated tags",()=>{
  const program=verifiedProgramCatalog.programs.find(row=>row.id==="erp-auto-input");
  const release={tag_name:"cyerp-auto-input-v0.2.9",draft:false,prerelease:false,published_at:program.publishedAt,assets:[{name:"CYERPAutoInput_V0.2.9.zip",browser_download_url:program.downloadUrl,state:"uploaded",size:100}]};
  assert.equal(selectProgramRelease(program,[release]).downloadUrl,program.downloadUrl);
  assert.equal(selectProgramRelease(program,[{...release,tag_name:"cyerp-auto-input-ocr-ppocrv5-mobile-a8814c3"}]),null);
  assert.equal(selectProgramRelease(program,[{...release,prerelease:true}]),null);
  assert.equal(selectProgramRelease(program,[release,{...release,tag_name:"cyerp-auto-input-v0.2.10",assets:[]}]).downloadUrl,null);
});
test("ERP auto-query stays pending until its first formal release, then uses only its product ZIP",()=>{
  const program=verifiedProgramCatalog.programs.find(row=>row.id==="erp-auto-query");
  assert.equal(program.version,null);assert.equal(program.icon,"AutoQ");
  const release={tag_name:"cyerp-auto-query-v0.9.0",draft:false,prerelease:false,published_at:"2026-10-18T01:00:00Z",assets:[{name:"CYERPAutoQuery_V0.9.0.zip",browser_download_url:"https://github.com/simonliu1118-byte/CYapps/releases/download/cyerp-auto-query-v0.9.0/CYERPAutoQuery_V0.9.0.zip",state:"uploaded",size:100}]};
  const selected=selectProgramRelease(program,[release]);
  assert.equal(selected.version,"0.9.0");assert.equal(selected.downloadUrl,release.assets[0].browser_download_url);
  assert.equal(selectProgramRelease(program,[{...release,tag_name:"cyerp-auto-input-v0.9.0"}]),null);
});
test("table and cards share the requested names and real converter download; unreleased tools remain pending",()=>{
  const html=renderToStaticMarkup(createElement(ProgramCatalogView,{catalog:verifiedProgramCatalog}));
  assert.match(html,/電子發票工具/);assert.match(html,/信封套印工具/);assert.match(html,/盲浮水印工具/);
  assert.match(html,/SMART ERP 自動輸入工具/);assert.match(html,/CYERPAutoInput_V0\.2\.9\.zip/);
  assert.match(html,/SMART ERP 自動查詢工具/);
  assert.doesNotMatch(html,/鼎新/);
  assert.doesNotMatch(html,/>CY 電子發票|>CYEnvelope|>CYWatermark/);
  assert.equal((html.match(/smartcopiconverter-v1\.0\.1\/SMARTCOPIConverter_V1\.0\.1_Windows_x64\.zip/g)??[]).length,2);
  assert.equal((html.match(/cy-notice-warning/g)??[]).length,1);
  assert.doesNotMatch(html,/cy-notice-danger/);
  assert.deepEqual(verifiedProgramCatalog.programs.filter(row=>row.platform==="windows"&&!row.version).map(row=>row.id),["erp-auto-query","envelope","watermark"]);
});
test("refresh explains known causes in Chinese without falsely calling every 403 rate limiting",()=>{
  assert.match(programRefreshMessage({code:"RATE_LIMIT",httpStatus:403}),/次數限制/);
  assert.match(programRefreshMessage({code:"HTTP",httpStatus:403}),/拒絕版本查詢/);
  assert.doesNotMatch(programRefreshMessage({code:"HTTP",httpStatus:403}),/次數限制/);
  for(const code of ["HTTP","TIMEOUT","NETWORK","BODY","TOO_LARGE","INVALID","PAGE_LIMIT","MISSING"]) assert.match(programRefreshMessage({code}),/已保留/);
});
test("catalog page has no manual update button and explains the daily schedule",()=>{
  const page=renderToStaticMarkup(createElement(FeedbackProvider,null,createElement(ProgramCatalogPage)));
  assert.doesNotMatch(page,/<button|更新版本/);
  const list=renderToStaticMarkup(createElement(ProgramCatalogView,{catalog:verifiedProgramCatalog}));
  assert.match(list,/每日台灣時間凌晨 3 點自動確認/);
  assert.match(programRefreshMessage({code:"RATE_LIMIT"}),/下次每日排程/);
});
test("actual catalog route/reader regressions preserve authority and trusted releases",()=>acceptProgramCatalog());
