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
    `export const ${name}=(...args)=>globalThis.orderingPageHost.${name}(...args);`).join("\n"),
  "../../api/client": `export class ApiClientError extends Error{}; export const apiRequest=(...args)=>globalThis.orderingPageTransport(...args);`,
  "../../ui/layout/MasterDetail": `export const MasterDetailBack=()=>null,MasterDetailEmpty=()=>null; export const useMasterDetailPane=()=>({className:'',open(){},close(){}});`,
  "../../ui/overlays/useConfirmation": `export const useConfirmation=()=>({confirm:options=>globalThis.orderingPageConfirm(options),confirmationDialog:null});`,
  "../../ui/feedback/FeedbackProvider": `import {useState} from 'react'; export const FeedbackBanner=()=>null; export function useFeedbackMessage(){const [message,setMessage]=useState(null);return [message,setMessage,value=>{globalThis.orderingPageErrors.push(value);setMessage(value)},'neutral'];}`,
  "../../ui/OrderingGrid": `export function OrderingGrid(){return null}`,
  "../../ui/foundation/useUnsavedChangesGuard": `export const useUnsavedChangesGuard=options=>{globalThis.orderingPageGuard=options};`,
};
for (const [path, names] of [
  ["../../ui/forms/Field", ["Field", "CheckField", "FormSection"]],
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
const sources = [{ id: 1, name: "測試來源甲", kind: "GENERAL", isActive: true }, { id: 2, name: "測試來源乙", kind: "GENERAL", isActive: true }];
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

test("opening an existing draft needs only list and detail; initial history is not fetched twice", async () => {
  const page = mount(normalTransport); await page.tick();
  assert.deepEqual(page.calls.map(x => x.path), ["/sources", "/pending"]);
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
  grid.onStateChange({ dirty: true, saving: true }); page.render();
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
