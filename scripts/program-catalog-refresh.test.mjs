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
let ProgramCatalogView, programRefreshMessage, selectProgramRelease, acceptProgramCatalog;
try {
  for (const [entry,name] of [["src/runtime/modules/ProgramCatalogPage.tsx","view"],["worker/programs/release-catalog.ts","reader"],["worker/acceptance/program-catalog-acceptance.ts","acceptance"]]) {
    const outfile=join(directory,name+".mjs");
    await build({entryPoints:[entry],outfile,bundle:true,platform:"node",format:"esm",jsx:"automatic",packages:"external",loader:{".css":"empty",".svg":"text"}});
  }
  ({ProgramCatalogView,programRefreshMessage}=await import(pathToFileURL(join(directory,"view.mjs"))));
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
test("table and cards share the requested names and real converter download; unreleased tools remain pending",()=>{
  const html=renderToStaticMarkup(createElement(ProgramCatalogView,{catalog:verifiedProgramCatalog}));
  assert.match(html,/電子發票工具/);assert.match(html,/信封套印工具/);assert.match(html,/盲浮水印工具/);
  assert.doesNotMatch(html,/>CY 電子發票|>CYEnvelope|>CYWatermark/);
  assert.equal((html.match(/smartcopiconverter-v1\.0\.1\/SMARTCOPIConverter_V1\.0\.1_Windows_x64\.zip/g)??[]).length,2);
  assert.equal((html.match(/cy-notice-warning/g)??[]).length,1);
  assert.doesNotMatch(html,/cy-notice-danger/);
  assert.deepEqual(verifiedProgramCatalog.programs.filter(row=>row.platform==="windows"&&!row.version).map(row=>row.id),["envelope","watermark"]);
});
test("refresh explains known causes in Chinese without falsely calling every 403 rate limiting",()=>{
  assert.match(programRefreshMessage({code:"RATE_LIMIT",httpStatus:403}),/次數限制/);
  assert.match(programRefreshMessage({code:"HTTP",httpStatus:403}),/拒絕版本查詢/);
  assert.doesNotMatch(programRefreshMessage({code:"HTTP",httpStatus:403}),/次數限制/);
  for(const code of ["HTTP","TIMEOUT","NETWORK","BODY","TOO_LARGE","INVALID","PAGE_LIMIT","MISSING"]) assert.match(programRefreshMessage({code}),/已保留/);
});
test("actual catalog route/reader regressions preserve authority, trusted assets, cache cooldown and recovery",acceptProgramCatalog);
