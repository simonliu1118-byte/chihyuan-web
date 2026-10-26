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
    `export const ${name}=(...args)=>globalThis.orderingPageHost.${name}(...args);`).join("\n")+"\nexport const useId=()=>\"ordering-test-picker\";",
  "../../api/client": `export class ApiClientError extends Error{}; export const apiRequest=(...args)=>globalThis.orderingPageTransport(...args);`,
  "../../ui/layout/MasterDetail": `export const MasterDetailBack=()=>null,MasterDetailEmpty=()=>null; export const useMasterDetailPane=()=>({className:'',open(){},close(){}});`,
  "../../ui/overlays/useConfirmation": `export const useConfirmation=()=>({confirm:options=>globalThis.orderingPageConfirm(options),confirmationDialog:null});`,
  "../../ui/feedback/FeedbackProvider": `import {useState} from 'react'; export const FeedbackBanner=()=>null; export function useFeedbackMessage(){const [message,setMessage]=useState(null);return [message,setMessage,value=>{globalThis.orderingPageErrors.push(value);setMessage(value)},'neutral'];}`,
  "../../ui/OrderingGrid": `export function OrderingGrid(){return null}`,
  "../../ui/foundation/useUnsavedChangesGuard": `export const useUnsavedChangesGuard=options=>{globalThis.orderingPageGuard=options};`,
};
for (const [path, names] of [
  ["../../ui/forms/Field", ["Field", "CheckField", "FormSection", "RequiredRows"]],
  ["../../ui/data/StatusFilter", ["StatusFilter"]], ["../../ui/primitives/StatusChip", ["StatusChip"]],
  ["../../ui/overlays/Dialog", ["Dialog"]],
]) stubs[path] = names.map(name => `export const ${name}=()=>null;`).join("\n");
let OrderingPage;
try {
  await build({ entryPoints: [fileURLToPath(new URL("../src/runtime/modules/OrderingPage.tsx", import.meta.url))], outfile,
    bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external",
    plugins: [{ name: "page-boundaries", setup(build) {
      build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "page-boundary" } : undefined);
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
function mount(transport) {
  const slots = [], calls = [], confirmations = []; let cursor, dirty = true, tree, effects = [];
  globalThis.orderingPageTransport = async (url, options) => {
    const path = url.replace("/api/business/ordering", ""); calls.push({ path, ...options });
    if (path === "/sources") return sources;
    if (path === "/preferences/vendors") return [];
    if (path === "/pending" || path.startsWith("/orders?history=")) return [];
    return transport(path, options);
  };
  globalThis.orderingPageConfirm = async options => { confirmations.push(options); return false; };
  globalThis.orderingPageErrors = [];
  const host = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; slots[i] ??= { value: typeof value === "function" ? value() : value };
      return [slots[i].value, update => { slots[i].value = typeof update === "function" ? update(slots[i].value) : update; dirty = true; }]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) {
      slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
    } },
  };
  function render() { globalThis.orderingPageHost = host; do { dirty = false; cursor = 0; effects = []; tree = OrderingPage(); effects.forEach(fn => fn()); } while (dirty); }
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
  for (const key of ["orderingPageHost", "orderingPageTransport", "orderingPageConfirm", "orderingPageErrors", "orderingPageGuard"]) delete globalThis[key];
});
const normalTransport = (path, options) => path.startsWith("/orders?sourceId=") ? [order(Number(new URLSearchParams(path.split("?")[1]).get("sourceId")))] :
  path === "/orders" && options.method === "POST" ? order(options.json.sourceId) : order(Number(path.split("/")[2]) / 10);

const sentOrder=()=>({...order(1),storedStatus:"SENT",status:"PARTIAL",sentAt:"2026-10-23T01:00:00Z",revision:2,
 lines:[1,2].map(id=>({id,section:"",sortOrder:id,itemCode:"T00"+id,itemName:"測試商品"+id,vendorItemCode:"V00"+id,vendorItemName:"測試廠商品名"+id,quantityText:"10",quantity:10,received:id===1?4:0,closedAs:null,unit:"箱",note:""})),
 receipts:[{id:1,erpPurchaseNo:"341A-20261023001",receivedDate:"2026-10-23",lines:[]}],
 revisions:[{revision:2,at:"2026-10-23T01:00:00Z",by:"測試員工",summary:"測試到貨"}]});

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
  assert.equal(page.heading, "未到貨明細"); assert.deepEqual(page.selectedTabs, []);
  assert.equal(page.grid, undefined, "entering the module never loads or creates a draft");
  page.calls.length = 0; page.click("測試來源甲"); await page.tick();
  assert.deepEqual(page.calls.map(x => x.path), ["/orders?sourceId=1&status=DRAFT", "/orders/10"]);
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
  gate.resolve(true); await page.tick(); assert.equal(page.calls[0].path, "/orders?sourceId=1&status=DRAFT");
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
    assert.equal(descendants(status).some(n => n.props?.className?.includes("cy-ordering-save-spinner")), spinner);
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


test("receipt dialog excludes fully received products and retains only outstanding rows",async()=>{
 const sent=sentOrder(),done={...sent.lines[0],id:3,itemCode:"DONE",quantity:10,quantityText:"10",received:10};
 const page=mount((path,options)=>path==="/orders/10"?{...sent,lines:[...sent.lines,done]}:normalTransport(path,options));
 await page.tick();page.click("測試來源甲");await page.tick();page.click("登記到貨");
 const dlg=page.nodes.find(n=>n.type?.name==="Dialog"&&n.props.title==="登記到貨");
 const rows=descendants(dlg).filter(n=>n.type==="tr");
 assert.equal(rows.length,3,"table header plus only two rows with remaining quantity");
 assert.equal(descendants(dlg).some(n=>n.type==="td"&&text(n)==="DONE"),false,"completed line absent in receipt UI");
});

test("vendor overview uses searchable horizontal tabs with fixed Other and no item counts",async()=>{
 const groups=[
  {sourceId:3,sourceName:"永全",conditions:"滿額免運",paymentTerms:"月結30天",orderId:null,orderVersion:null,lines:[]},
  {sourceId:4,sourceName:"其他",conditions:"",paymentTerms:"",orderId:null,orderVersion:null,lines:[]},
 ];
 const page=mount((path,options)=>path==="/vendors/overview"?groups:normalTransport(path,options));
 await page.tick();page.click("廠商");await page.tick();
 const vendorTabs=()=>page.nodes.filter(n=>n.props?.role==="tab"&&["永全","其他"].includes(text(n)));
 assert.deepEqual(vendorTabs().map(text),["永全","其他"]);
 assert.equal(vendorTabs().some(n=>/項/.test(text(n))),false);
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

test("vendor overview stops writing to a draft that is no longer open for that vendor",async()=>{
 let overviewOrder=30,next=31;const lineWrites=[];
 const draft=id=>({...order(3),id,sourceKind:"VENDOR"});
 const page=mount((path,options)=>{
  if(path==="/vendors/overview")return [{sourceId:3,sourceName:"永全",conditions:"",paymentTerms:"",orderId:overviewOrder,orderVersion:overviewOrder?1:null,lines:[]}];
  if(path==="/orders"&&options.method==="POST")return draft(next++);
  const m=/^\/orders\/(\d+)\/lines$/.exec(path);
  if(m){lineWrites.push(Number(m[1]));return {...draft(Number(m[1])),version:2,lines:[{id:7,section:"",sortOrder:1,itemCode:"",itemName:"測試商品",vendorItemCode:"",vendorItemName:"",quantityText:"1",quantity:1,received:0,closedAs:null,unit:"",note:""}],savedLineId:7}}
  if(/^\/orders\/\d+$/.test(path))return draft(Number(path.split("/")[2]));
  return normalTransport(path,options)});
 await page.tick();page.click("廠商");await page.tick();
 await page.grid.onCommit({id:-1,itemName:"測試商品",quantityText:"1"},{},true);
 assert.deepEqual(lineWrites,[30]);
 overviewOrder=null;page.click("測試來源甲");await page.tick();page.click("廠商");await page.tick();
 await page.grid.onCommit({id:-2,itemName:"測試商品",quantityText:"1"},{},true);
 assert.deepEqual(lineWrites,[30,31],"after the draft was sent elsewhere a new draft is opened");
});
