import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Run the real page handlers with controlled transport and editor boundaries.
// Grid input/persistence and the real SQLite route are exercised separately.
const directory = mkdtempSync(fileURLToPath(new URL("../node_modules/.ordering-page-test-", import.meta.url)));
const outfile = join(directory, "page.mjs");
const stubs = {
  "react": ["useState", "useRef", "useEffect", "useMemo"].map(name =>
    `export const ${name}=(...args)=>globalThis.orderingPageHost.${name}(...args);`).join("\n")+"\nexport const useContext=()=>true; export const useId=()=>\"ordering-test-picker\";",
  "../../api/client": `export class ApiClientError extends Error{}; export const apiRequest=(...args)=>globalThis.orderingPageTransport(...args);`,
  "../../ui/layout/MasterDetail": `export const MasterDetailBack=()=>null,MasterDetailEmpty=()=>null; export const useMasterDetailPane=()=>({pane:globalThis.orderingPageMobilePane??'list',open(){globalThis.orderingPageMobilePane='detail'},close(){globalThis.orderingPageMobilePane='list'}});`,
  "../../ui/overlays/useConfirmation": `export const useConfirmation=()=>({confirm:options=>globalThis.orderingPageConfirm(options),confirmationDialog:null});`,
  "../../ui/feedback/FeedbackProvider": `import {useState} from 'react'; export const FeedbackBanner=()=>null; export function useFeedbackMessage(){const [message,setMessage]=useState(null);return [message,setMessage,value=>{globalThis.orderingPageErrors.push(value);setMessage(value)},'neutral'];}`,
  "../../ui/OrderingGrid": `export function OrderingGrid(){return null}`,
  "../../ui/forms/DateInput": `export function DateInput(){return null}`,
  "../../ui/actions/IconButton": `export function IconButton(){return null}`,
  "../../ui/actions/icons": `export const Icons={edit:null,remove:null}`,
  "../../ui/overlays/SidePanel": `export function SidePanel(){return null}`,
  "./RestockAssist": `export function RestockAssist(){return null}`,
  "./useErpJob": `export const ErpPageVisibleContext={}; export function useErpJob(){return {result:null,busy:false}}; export const recentJobs=async()=>[]; export const runningStatus=s=>s==="QUEUED"||s==="RUNNING"`,
  "../../ui/foundation/useCompactLayout": `export const useCompactLayout=()=>Boolean(globalThis.orderingPageCompact);`,
  "../../ui/foundation/useUnsavedChangesGuard": `export const useUnsavedChangesGuard=options=>{globalThis.orderingPageGuard=options};`,
};
for (const [path, names] of [
  ["../../ui/forms/Field", ["Field", "CheckField", "FormSection", "RequiredRows"]],
  ["../../ui/data/StatusFilter", ["StatusFilter"]], ["../../ui/primitives/StatusChip", ["StatusChip"]],
  ["../../ui/overlays/Dialog", ["Dialog", "BottomSheet"]],
]) stubs[path] = names.map(name => `export const ${name}=()=>null;`).join("\n");
let OrderingPage;
try {
  await build({ entryPoints: [fileURLToPath(new URL("../src/runtime/modules/OrderingPage.tsx", import.meta.url))], outfile,
    bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external",
    plugins: [{ name: "page-boundaries", setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        const path = args.path.endsWith("/foundation/useCompactLayout") ? "../../ui/foundation/useCompactLayout"
          : args.path.endsWith("/overlays/Dialog") ? "../../ui/overlays/Dialog" : args.path;
        return path in stubs ? { path, namespace: "page-boundary" } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "page-boundary" }, args => ({ contents: stubs[args.path] }));
      build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    } }] });
  ({ OrderingPage } = await import(pathToFileURL(outfile)));
} finally { if (existsSync(outfile)) unlinkSync(outfile); rmdirSync(directory); }

const descendants = node => !node || typeof node !== "object" ? [] :
  [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
const text = node => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : text(node?.props?.children ?? "");
const sources = [{ id: 1, name: "測試來源甲", kind: "GENERAL", isActive: true }, { id: 2, name: "測試來源乙", kind: "GENERAL", isActive: true }, {id:3,name:"永全",kind:"VENDOR",isActive:true,sortOrder:2,conditions:"滿額免運",paymentTerms:"月結30天"}, {id:4,name:"其他",kind:"VENDOR",isActive:true,sortOrder:3,conditions:"",paymentTerms:""}];
const order = sourceId => ({ id: sourceId * 10, sourceId, sourceName: sources[sourceId - 1].name, sourceKind: "GENERAL",
  status: "DRAFT", storedStatus: "DRAFT", version: 1, revision: 0, plannedSendDate: null, note: "", createdAt: "2026-10-21T00:00:00Z",
  sentAt: null, lines: [], receipts: [], revisions: [] });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let activeHost;
function mount(transport, pageProps={}, phone=false) {
  globalThis.orderingPageCompact=phone;globalThis.orderingPageMobilePane="list";
  const slots = [], calls = [], confirmations = []; let cursor, dirty = true, tree, effects = [];
  globalThis.orderingPageTransport = async (url, options) => {
    const path = url.replace("/api/business/ordering", ""); calls.push({ path, ...options });
    if (path === "/sources") return sources;
    if (path === "/preferences/vendors") return [];
    if (path === "/pending") return globalThis.orderingPagePending ?? [];
    if (path.startsWith("/orders?history=")) return [];
    // The server's one-request tab open, composed from each test's list and detail answers.
    if (path.startsWith("/drafts/open?sourceId=")) {
      const sourceId = new URLSearchParams(path.split("?")[1]).get("sourceId");
      const drafts = await transport("/orders?sourceId=" + sourceId + "&status=DRAFT", {});
      return { drafts, order: drafts.length ? await transport("/orders/" + drafts[0].id, {}) : null };
    }
    return transport(path, options);
  };
  globalThis.orderingPageConfirm = async options => { confirmations.push(options); return false; };
  globalThis.orderingPageErrors = [];
  globalThis.window={addEventListener(){},removeEventListener(){}};
  const host = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; slots[i] ??= { value: typeof value === "function" ? value() : value };
      return [slots[i].value, update => { slots[i].value = typeof update === "function" ? update(slots[i].value) : update; dirty = true; }]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) {
      slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
    } },
  };
  function render() { globalThis.orderingPageHost = host; do { dirty = false; cursor = 0; effects = []; tree = OrderingPage(pageProps); effects.forEach(fn => fn()); } while (dirty); }
  const view = {
    calls, confirmations, render,
    async tick() { await new Promise(resolve => setImmediate(resolve)); render(); },
    click(label) { const node = descendants(tree).find(n => n.type === "button" && text(n) === label); assert.ok(node, `button ${label}`); node.props.onClick(); render(); },
    get grid() { return descendants(tree).find(n => n.type?.name === "OrderingGrid")?.props; },
    get nodes() { return descendants(tree); },
    get heading() { return text(descendants(tree).find(n => n.type === "h2")); },
    get selectedTabs() { return descendants(tree).filter(n => n.props?.role === "tab" && n.props["aria-selected"]).map(text); },
    get saveStatus() { const node = descendants(tree).find(n => n.type?.name === "OrderingSaveStatus"); return node ? node.type(node.props) : null; },
    headerInput(label) { return descendants(tree).find(n => n.props?.label === label && n.props?.children?.type === "input").props.children.props; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
  activeHost = view; render(); return view;
}
test.afterEach(() => {
  activeHost?.dispose(); activeHost = null;
  for (const key of ["orderingPageHost", "orderingPageTransport", "orderingPageConfirm", "orderingPageErrors", "orderingPageGuard","window","orderingPageCompact","orderingPageMobilePane"]) delete globalThis[key];
});
const normalTransport = (path, options) => path.startsWith("/orders?sourceId=") ? [order(Number(new URLSearchParams(path.split("?")[1]).get("sourceId")))] :
  path === "/orders" && options.method === "POST" ? order(options.json.sourceId) : order(Number(path.split("/")[2]) / 10);

const sentOrder=()=>({...order(1),storedStatus:"SENT",status:"PARTIAL",sentAt:"2026-10-23T01:00:00Z",revision:2,
 lines:[1,2].map(id=>({id,section:"",sortOrder:id,itemCode:"T00"+id,itemName:"測試商品"+id,vendorItemCode:"V00"+id,vendorItemName:"測試廠商品名"+id,quantityText:"10",quantity:10,received:id===1?4:0,closedAs:null,unit:"箱",note:""})),
 receipts:[{id:1,erpPurchaseNo:"341A-20261023001",receivedDate:"2026-10-23",lines:[]}],
 revisions:[{revision:2,at:"2026-10-23T01:00:00Z",by:"測試員工",summary:"測試到貨"}]});
// A sent order with nothing received or closed yet: the only state that can still be revised.
const openSentOrder=()=>{const o=sentOrder();return {...o,status:"SENT",receipts:[],lines:o.lines.map(l=>({...l,received:0}))}};

test("sent order puts receipts first, merges status into the readonly grid and removes draft header fields", async()=>{
 const page=mount((path,options)=>path==="/orders/10"?sentOrder():normalTransport(path,options));
 await page.tick();page.click("測試來源甲");await page.tick();
 assert.equal(page.grid.readOnly,true);assert.equal(page.grid.busy,false);
 assert.deepEqual(page.nodes.filter(n=>n.type==="h3").map(n=>text(n).replace(/\s*(?:\d+)?\s*(筆|項)/g,"")),["到貨紀錄","叫貨明細","修改紀錄展開"]);
 assert.equal(page.nodes.some(n=>n.type==="form"),false);
 assert.equal(page.nodes.some(n=>n.props?.label==="草稿"),false);
 assert.equal(page.nodes.some(n=>n.type==="button"&&text(n)==="作廢"),true);
});

test("receipt table selects several rows with remaining defaults, preserving the multiline payload", async()=>{
 const calls=[];
 const page=mount((path,options)=>{if(path.endsWith("/receipts")){calls.push(options.json);return sentOrder()}
  return path==="/orders/10"?sentOrder():normalTransport(path,options)});
 await page.tick();page.click("測試來源甲");await page.tick();page.click("登記到貨");
 const dialog=()=>page.nodes.find(n=>n.type?.name==="Dialog"&&n.props.title==="登記到貨");
 assert.equal(descendants(dialog()).filter(n=>n.type==="table").length,1);
 const no=descendants(dialog()).find(n=>n.props?.label==="ERP 進貨單號 341A-").props.children.props;
 no.onChange({target:{value:"20261023002"}});page.render();
 for(let i=0;i<2;i++){
  descendants(dialog()).filter(n=>n.type?.name==="CheckField")[i].props.onChange({target:{checked:true}});page.render();
 }
 assert.equal(descendants(dialog()).find(n=>n.type?.name==="RequiredRows").props.satisfied,true);
 await descendants(dialog()).find(n=>n.type==="form").props.onSubmit({preventDefault(){}});await page.tick();
 assert.deepEqual(calls[0].lines,[{lineId:1,quantity:6},{lineId:2,quantity:10}]);
 assert.equal(dialog(),undefined);
});

test("receipt history is absent when no receipts exist", async()=>{
 const page=mount((path,options)=>path==="/orders/10"?{...sentOrder(),receipts:[]}:normalTransport(path,options));
 await page.tick();page.click("測試來源甲");await page.tick();
 assert.equal(page.nodes.some(n=>n.props?.["aria-label"]==="到貨紀錄"),false);
});

test("a selected zero receipt quantity is rejected rather than silently omitted", async()=>{
 const page=mount((path,options)=>path==="/orders/10"?sentOrder():normalTransport(path,options));
 await page.tick();page.click("測試來源甲");await page.tick();page.click("登記到貨");
 const dialog=()=>page.nodes.find(n=>n.type?.name==="Dialog"&&n.props.title==="登記到貨");
 descendants(dialog()).filter(n=>n.type?.name==="CheckField")[0].props.onChange({target:{checked:true}});page.render();
 descendants(dialog()).find(n=>n.props?.label==="本次到貨數量 第1列").props.children.props.onChange({target:{value:"0"}});page.render();
 await descendants(dialog()).find(n=>n.type==="form").props.onSubmit({preventDefault(){}});await page.tick();
 assert.match(globalThis.orderingPageErrors.at(-1),/大於 0/);
 assert.equal(page.calls.some(call=>call.path.endsWith("/receipts")),false);assert.ok(dialog());
});

test("opening an existing draft needs only list and detail; initial history is not fetched twice", async () => {
  const page = mount(normalTransport); await page.tick();
  assert.deepEqual(page.calls.map(x => x.path).sort(), ["/sources", "/pending", "/preferences/vendors"].sort());
  assert.equal(page.heading, "未到貨明細"); assert.deepEqual(page.selectedTabs.map(t => t.trim()), ["未到貨"], "未到貨 is the first tab of the source bar");
  assert.equal(page.grid, undefined, "entering the module never loads or creates a draft");
  page.calls.length = 0; page.click("測試來源甲"); await page.tick();
  assert.deepEqual(page.calls.map(x => x.path), ["/drafts/open?sourceId=1"], "one request opens a source tab");
  assert.ok(page.grid); assert.equal(page.grid.busy, false);
  page.calls.length = 0; page.click("＋ 新草稿"); await page.tick();
  assert.deepEqual(page.calls.map(x => x.path), ["/orders"], "creation does not refetch unrelated lists or its just-created detail");
});

test("source switching waits for the editor; incomplete input keeps the current draft", async () => {
  const page = mount(normalTransport); await page.tick(); page.click("測試來源甲"); await page.tick();
  const gate = deferred(); const grid = page.grid;
  grid.onRegister({ flush: () => gate.promise, discard() { assert.fail("cancelled navigation must preserve input"); } });
  grid.onStateChange({ dirty: true, saving: true, failed: false }); page.render();
  assert.equal(globalThis.orderingPageGuard.blocked, true);
  page.calls.length = 0; page.click("測試來源乙"); await page.tick(); assert.equal(page.calls.length, 0);
  gate.resolve(false); await page.tick(); assert.equal(page.calls.length, 0);
  assert.equal(page.confirmations[0].title, "叫貨資料尚未儲存");
  assert.equal(page.grid.onRegister, grid.onRegister, "the current editor remains mounted");
  grid.onRegister(null); page.render();
});

test("successful flush precedes source loading and stale load responses cannot replace the newest draft", async () => {
  const slow = deferred();
  const page = mount((path, options) => path === "/orders/10" ? slow.promise : normalTransport(path, options));
  await page.tick(); page.click("測試來源甲"); await page.tick();
  page.click("測試來源乙"); await page.tick(); assert.ok(page.grid);
  const newest = page.grid.onRegister;
  slow.resolve(order(1)); await page.tick(); assert.equal(page.grid.onRegister, newest);
  const gate = deferred(); page.grid.onRegister({ flush: () => gate.promise, discard() {} });
  page.calls.length = 0; page.click("測試來源甲"); await page.tick(); assert.equal(page.calls.length, 0);
  gate.resolve(true); await page.tick(); assert.equal(page.calls[0].path, "/drafts/open?sourceId=1");
  page.grid.onRegister(null); page.render();
});

test("line save returns the acknowledged line and does not refresh sources/history/pending", async () => {
  let data = order(1);
  const page = mount((path, options) => {
    if (path === "/orders/10/lines") { const line = { ...options.json.line, id: 101 }; data = { ...data, lines: [line], savedLineId: 101, version: data.version + 1 }; return data; }
    return normalTransport(path, options);
  });
  await page.tick(); page.click("測試來源甲"); await page.tick(); page.calls.length = 0;
  const row = { id: 0, section: "", itemCode: "", itemName: "", vendorItemCode: "V01", vendorItemName: "測試廠商品名", quantityText: "7", unit: "箱", note: "測試備註" };
  const saved = await page.grid.onCommit(row, row); await page.tick();
  assert.equal(saved.id, 101); assert.equal(saved.itemName, ""); assert.equal(page.grid.lines[0].note, "測試備註");
  assert.deepEqual(page.calls.map(x => x.path), ["/orders/10/lines"]);
});

test("header status reports saving spinner, red failure, dirty and acknowledged saved states", async () => {
  const page = mount(normalTransport); await page.tick(); page.click("測試來源甲"); await page.tick();
  const grid = page.grid;
  for (const [state, label, value, spinner] of [
    [{ dirty: true, saving: true, failed: false }, "儲存中", "saving", true],
    [{ dirty: true, saving: false, failed: true }, "儲存失敗", "failed", false],
    [{ dirty: true, saving: false, failed: false }, "尚未儲存", "dirty", false],
    [{ dirty: false, saving: false, failed: false }, "已儲存", "saved", false],
  ]) {
    grid.onStateChange(state); page.render(); const status = page.saveStatus;
    assert.equal(text(status), label); assert.equal(status.props["data-state"], value);
    const spinnerNode = descendants(status).find(n => n.props?.className?.includes("cy-ordering-save-spinner"));
    assert.ok(spinnerNode, "the spinner slot is always present so the line never shifts");
    assert.equal(!spinnerNode.props["data-idle"], spinner);
  }
});

test("header autosave failure is red and late input is not declared saved by an earlier acknowledgement", async () => {
  const replies=[];
  const page=mount((path,options)=>path==="/orders/10"&&options.method==="PATCH"?new Promise((resolve,reject)=>replies.push({resolve,reject,note:options.json.note})):normalTransport(path,options));
  await page.tick();page.click("測試來源甲");await page.tick();
  page.headerInput("單據備註").onChange({target:{value:"第一次輸入"}});page.render();page.headerInput("單據備註").onBlur();await page.tick();
  assert.equal(text(page.saveStatus),"儲存中");replies[0].reject(new Error("測試失敗"));await page.tick();
  assert.equal(text(page.saveStatus),"儲存失敗");assert.equal(page.saveStatus.props["data-state"],"failed");
  assert.equal(page.headerInput("單據備註").value,"第一次輸入");
  page.headerInput("單據備註").onBlur();await page.tick();
  page.headerInput("單據備註").onChange({target:{value:"等待時又輸入"}});page.render();
  replies[1].resolve({...order(1),version:2,note:"第一次輸入"});await page.tick();
  assert.equal(text(page.saveStatus),"尚未儲存");assert.equal(page.headerInput("單據備註").value,"等待時又輸入");
  page.headerInput("單據備註").onBlur();await page.tick();replies[2].resolve({...order(1),version:3,note:"等待時又輸入"});await page.tick();
  assert.equal(text(page.saveStatus),"已儲存");
});


test("saving a draft's planned date updates its draft chip at once", async () => {
  const page=mount((path,options)=>path==="/orders/10"&&options.method==="PATCH"?{...order(1),plannedSendDate:options.json.plannedSendDate,version:2}:normalTransport(path,options));
  await page.tick();page.click("測試來源甲");await page.tick();
  const date=()=>page.nodes.find(n=>n.props?.label==="預計送出日期").props.children.props;
  date().onChange("2026-11-09");page.render();date().onBlur();await page.tick();
  assert.ok(page.nodes.some(n=>n.type==="button"&&String(n.props?.className).includes("cy-ordering-draft-chip")&&text(n)==="11/09"));
});

test("receipt dialog excludes fully received products and retains only outstanding rows",async()=>{
 const sent=sentOrder(),done={...sent.lines[0],id:3,itemCode:"DONE",quantity:10,quantityText:"10",received:10};
 const page=mount((path,options)=>path==="/orders/10"?{...sent,lines:[...sent.lines,done]}:normalTransport(path,options));
 await page.tick();page.click("測試來源甲");await page.tick();page.click("登記到貨");
 const dlg=page.nodes.find(n=>n.type?.name==="Dialog"&&n.props.title==="登記到貨");
 const rows=descendants(dlg).filter(n=>n.type==="tr");
 assert.equal(rows.length,3,"table header plus only two rows with remaining quantity");
 assert.equal(descendants(dlg).some(n=>n.type==="td"&&text(n)==="DONE"),false,"completed line absent in receipt UI");
});

test("廠商 opens a vendor's draft in place: searchable tabs, Other last, no 進入廠商 step",async()=>{
 const page=mount((path,options)=>path==="/orders/30"||path==="/orders/40"?{...order(1),id:Number(path.split("/")[2]),sourceId:Number(path.split("/")[2])/10,sourceName:Number(path.split("/")[2])===30?"永全":"其他",sourceKind:"VENDOR"}:
  path.startsWith("/orders?sourceId=")?[{...order(1),id:Number(new URLSearchParams(path.split("?")[1]).get("sourceId"))*10}]:normalTransport(path,options));
 await page.tick();page.click("廠商");await page.tick();
 const vendorTabs=()=>page.nodes.filter(n=>n.props?.role==="tab"&&["永全","其他"].includes(text(n)));
 assert.deepEqual(vendorTabs().map(text),["永全","其他"]);
 assert.deepEqual(page.selectedTabs,["廠商","永全"]);
 assert.equal(page.grid.readOnly,false,"the vendor's draft is editable right under the tabs");
 assert.equal(page.nodes.some(n=>n.type==="button"&&text(n)==="進入廠商"),false);
 assert.ok(page.nodes.some(n=>n.type==="button"&&text(n)==="修改廠商"),"vendor terms are edited in place");
 page.click("其他");await page.tick();
 assert.deepEqual(page.selectedTabs,["廠商","其他"]);
 const q=page.nodes.find(n=>n.props?.["aria-label"]==="速查廠商");
 assert.ok(q);q.props.onChange({target:{value:"查無"}});page.render();
 assert.deepEqual(vendorTabs().map(text),["其他"],"Other stays visible on right even with a no-match search");
});

test("a double-submitted receipt is recorded once while the first save is in flight",async()=>{
 const calls=[],reply=deferred();
 const page=mount((path,options)=>{if(path.endsWith("/receipts")){calls.push(options.json);return reply.promise}
  return path==="/orders/10"?sentOrder():normalTransport(path,options)});
 await page.tick();page.click("測試來源甲");await page.tick();page.click("登記到貨");
 const dialog=()=>page.nodes.find(n=>n.type?.name==="Dialog"&&n.props.title==="登記到貨");
 descendants(dialog()).find(n=>n.props?.label==="ERP 進貨單號 341A-").props.children.props.onChange({target:{value:"20261023002"}});page.render();
 descendants(dialog()).filter(n=>n.type?.name==="CheckField")[0].props.onChange({target:{checked:true}});page.render();
 const form=()=>descendants(dialog()).find(n=>n.type==="form");
 const first=form().props.onSubmit({preventDefault(){}});await page.tick();
 assert.equal(descendants(dialog()).find(n=>n.type==="button"&&text(n)==="儲存到貨").props.disabled,true);
 await form().props.onSubmit({preventDefault(){}});
 reply.resolve(sentOrder());await first;await page.tick();
 assert.equal(calls.length,1);assert.equal(dialog(),undefined);
});

test("a draft is deleted (not voided) after confirmation and the source reopens a draft",async()=>{
 const page=mount(normalTransport);await page.tick();page.click("測試來源甲");await page.tick();
 assert.equal(page.nodes.some(n=>n.type==="button"&&text(n)==="作廢"),false);
 globalThis.orderingPageConfirm=async()=>true;
 page.click("刪除");await page.tick();await page.tick();
 const del=page.calls.find(c=>c.method==="DELETE");assert.ok(del);assert.equal(del.path,"/orders/10");
 assert.ok(page.calls.indexOf(del)<page.calls.length-1,"the source's draft is opened again");
});

test("a partly received order offers no 修改",async()=>{
 const page=mount((path,options)=>path==="/orders/10"?sentOrder():normalTransport(path,options));
 await page.tick();page.click("測試來源甲");await page.tick();
 assert.equal(page.nodes.some(n=>n.type==="button"&&text(n)==="修改"),false);
});

test("a sent order is changed in edit mode with no autosave and saved as one revision",async()=>{
 const revisions=[];
 const page=mount((path,options)=>{if(path.endsWith("/revise")){revisions.push(options.json);return {...openSentOrder(),revision:3}}
  return path==="/orders/10"?openSentOrder():normalTransport(path,options)});
 await page.tick();page.click("測試來源甲");await page.tick();
 assert.equal(page.grid.readOnly,true);
 page.click("修改");await page.tick();
 assert.equal(page.grid.readOnly,false);
 assert.equal(page.nodes.some(n=>n.type==="button"&&text(n)==="登記到貨"),false,"edit mode shows only 取消／儲存");
 const before=page.calls.length;
 await page.grid.onCommit(page.grid.lines[1],{quantityText:"12"},true);await page.tick();
 assert.equal(page.calls.length,before,"edits stay local until 儲存");
 page.click("儲存");await page.tick();await page.tick();
 assert.equal(revisions.length,1);
 assert.deepEqual(revisions[0].lines.map(l=>[l.lineId,l.quantityText]),[[2,"12"]]);
 assert.equal(page.grid.readOnly,true,"saving leaves edit mode");
});

test("a row added in edit mode keeps its local id, so later keystrokes update it instead of adding rows",async()=>{
 const page=mount((path,options)=>path==="/orders/10"?openSentOrder():normalTransport(path,options));
 await page.tick();page.click("測試來源甲");await page.tick();page.click("修改");await page.tick();
 const blank={id:0,section:"",sortOrder:0,itemCode:"",itemName:"C0003",vendorItemCode:"",vendorItemName:"",spec:"",quantityText:"",unit:"",note:""};
 const first=await page.grid.onCommit({...blank},{...blank},false);await page.tick();
 assert.ok(first.id>0,"the grid requires a positive id to treat the row as saved");
 const second=await page.grid.onCommit(first,{itemName:"C00031"},false);await page.tick();
 assert.equal(second.id,first.id);
 assert.equal(page.grid.lines.length,sentOrder().lines.length+1);
 assert.equal(page.grid.lines.at(-1).itemName,"C00031");
});

test('restock action is hidden when permission is absent',async()=>{
 const denied=mount(normalTransport);await denied.tick();await denied.tick();
 assert.equal(denied.nodes.some(n=>n.type==='button'&&text(n)==='進貨輔助'),false);
});
test('authorized restock button opens drawer without changing source tabs',async()=>{
 const allowed=mount(normalTransport,{canRestock:true,canQueryItem:true});await allowed.tick();
 allowed.click('進貨輔助');await allowed.tick();
 const drawer=allowed.nodes.find(n=>n.type?.name==='OrderingRestockDrawer');
 assert.equal(drawer?.props.open,true);
 assert.deepEqual(allowed.selectedTabs.map(t=>t.trim()),['未到貨'],'the source tab stays where it was');
});

test("receipt history shows quantities and actor; edit reuses receipt dialog and deletion needs confirmation",async()=>{
 const receipt={id:9,erpPurchaseNo:"341A-20261023001",receivedDate:"2026-10-23",createdBy:"測試員工甲",createdAt:"2026-10-23T01:02:00Z",lines:[{lineId:1,quantity:4}]};
 const received=()=>({...sentOrder(),receipts:[receipt]});
 const page=mount((path,options)=>path==="/orders/10"?received():normalTransport(path,options));
 await page.tick();page.click("測試來源甲");await page.tick();
 const tr=page.nodes.find(n=>n.type==="tr"&&text(n).includes("測試商品1"));
 assert.ok(tr,"a receipt has five columns");
 assert.match(text(tr),/測試商品1 4 箱/);
 assert.match(text(tr),/測試員工甲/);
 const icons=page.nodes.filter(n=>n.type?.name==="IconButton");
 assert.ok(icons.some(n=>n.props.label==="修改到貨"));
 icons.find(n=>n.props.label==="修改到貨").props.onClick();page.render();
 const dialog=page.nodes.find(n=>n.type?.name==="Dialog"&&n.props.title==="修改到貨");
 assert.ok(dialog);
 assert.equal(page.nodes.find(n=>n.props?.label==="ERP 進貨單號 341A-")?.props.children.props.value,"20261023001");
 assert.equal(page.nodes.find(n=>n.props?.label==="到貨日期")?.props.children.props.value,"2026-10-23");
 page.nodes.find(n=>n.type?.name==="IconButton"&&n.props.label==="刪除到貨").props.onClick();await page.tick();
 assert.equal(page.confirmations.at(-1)?.confirmTone,"danger");
 assert.match(page.confirmations.at(-1)?.description,/已到數量會扣回/);
 assert.equal(page.calls.some(c=>c.method==="DELETE"),false);
});

test("a draft row naming an item still waiting to arrive is flagged by 品號, 品名, 廠商品號 or 廠商品名",async()=>{
 const waiting=[{orderId:5,lineId:9,sourceName:"測試來源乙",orderDate:"2026-10-14",itemCode:"T001",itemName:"測試商品一",vendorItemCode:"V9",vendorItemName:"廠商名九",quantity:10,unit:"箱",received:4,remaining:6}];
 globalThis.orderingPagePending=waiting;
 const page=mount(normalTransport);delete globalThis.orderingPagePending;
 await page.tick();page.click("測試來源甲");await page.tick();
 const warn=page.grid.warnRow;assert.ok(warn,"drafts check rows against 未到貨");
 const row={itemCode:"",itemName:"",vendorItemCode:"",vendorItemName:""};
 assert.match(warn({...row,itemCode:"t001"}),/測試來源乙 10\/14 測試商品一 未到 6 箱/);
 assert.ok(warn({...row,itemName:"測試商品一"}));assert.ok(warn({...row,vendorItemCode:"V9"}));assert.ok(warn({...row,vendorItemName:"廠商名九"}));
 assert.equal(warn({...row,itemCode:"T002",itemName:"別的"}),undefined);
});

test("from 未到貨 a source tab switches at once and shows Loading while its draft loads",async()=>{
 const slow=deferred();
 const page=mount((path,options)=>path==="/orders/10"?slow.promise:normalTransport(path,options));
 await page.tick();assert.equal(page.heading,"未到貨明細");
 page.click("測試來源甲");await page.tick();
 assert.notEqual(page.heading,"未到貨明細","the pending view is left immediately");
 assert.deepEqual(page.selectedTabs.map(t=>t.trim()),["測試來源甲"]);
 assert.ok(page.nodes.some(n=>n.type?.name==="Loading"),"Loading is shown");
 slow.resolve(order(1));await page.tick();assert.ok(page.grid);
});

test("phone opens pending first through ModuleSections and preserves the original history query",async()=>{
 const page=mount(normalTransport,{},true);await page.tick();
 const nav=()=>page.nodes.find(n=>n.type?.name==="ModuleSections");
 assert.deepEqual(nav().props.sections.map(s=>s.label),["未到貨","草稿","叫貨單"]);
 assert.equal(nav().props.value,"pending");
 assert.ok(page.nodes.some(n=>n.type==="h2"&&text(n)==="未到貨明細"));
 assert.equal(page.calls.some(c=>c.path==="/orders?status=DRAFT"),false);
 assert.equal(page.nodes.some(n=>n.props?.className==="cy-ordering-tabbar"),false);
 nav().props.onChange("history");await page.tick();
 assert.equal(nav().props.value,"history");
 assert.ok(page.nodes.some(n=>n.type?.name==="DataViewToolbar"));
 nav().props.onChange("pending");await page.tick();
 assert.equal(nav().props.value,"pending");
 assert.equal(page.nodes.some(n=>n.type?.name==="MasterDetailBack"),false);
});

test("phone source choices use shared ListRow without changing the draft API or vendor order",async()=>{
 const page=mount(normalTransport,{},true);await page.tick();
 const originalQueries=page.calls.length;
 page.nodes.find(n=>n.type?.name==="ModuleSections").props.onChange("drafts");await page.tick();
 const groups=page.nodes.filter(n=>n.type==="section"&&n.props?.className==="cy-mobile-choice-group").map(n=>n.props["aria-label"]);
 assert.deepEqual(groups,["公司內部來源","廠商來源"]);
 const rows=page.nodes.filter(n=>n.type?.name==="ListRow");
 assert.ok(rows.some(n=>n.props.title==="測試來源甲"));
 assert.ok(rows.some(n=>n.props.title==="永全"));
 assert.equal(page.calls.length,originalQueries);
 rows.find(n=>n.props.title==="永全").props.onClick();await page.tick();
 assert.ok(page.calls.some(c=>c.path==="/drafts/open?sourceId=3"));
 assert.equal(page.grid?.readOnly,false);
 assert.equal(page.nodes.some(n=>n.props?.className==="cy-ordering-tabbar"),false);
 assert.equal(page.nodes.find(n=>n.type?.name==="ModuleSections").props.value,"drafts");
 page.nodes.find(n=>n.type?.name==="ModuleSections").props.onChange("history");await page.tick();
 assert.equal(globalThis.orderingPageMobilePane,"list");
});

test("phone history uses DataViewToolbar filters while desktop retains its original controls",async()=>{
 const phone=mount(normalTransport,{},true);await phone.tick();
 phone.nodes.find(n=>n.type?.name==="ModuleSections").props.onChange("history");await phone.tick();
 const toolbar=phone.nodes.find(n=>n.type?.name==="DataViewToolbar");
 assert.ok(toolbar);
 assert.equal(toolbar.props.activeFilterCount,0);
 assert.equal(toolbar.props.searchValue,"");
 const labels=descendants(toolbar.props.filters).filter(n=>n.props?.label).map(n=>n.props.label);
 assert.ok(labels.includes("叫貨狀態"));
 assert.ok(labels.includes("篩選叫貨來源"));
 phone.dispose();
 const desktop=mount(normalTransport);await desktop.tick();
 const advanced=desktop.nodes.find(n=>n.props?.className==="cy-ordering-history-advanced");
 assert.ok(advanced);
 assert.ok(desktop.nodes.some(n=>n.props?.className==="cy-ordering-tabbar"));
 assert.equal(desktop.nodes.some(n=>n.type?.name==="DataViewToolbar"),false);
});
