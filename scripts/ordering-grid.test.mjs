import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { existsSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Exercise the actual component's input handlers and rendered rows with a small
// hook host. Saving stays pending so navigation cannot depend on the network.
const directory = mkdtempSync(fileURLToPath(new URL("../node_modules/.ordering-grid-test-", import.meta.url)));
const outfile = join(directory, "grid.mjs");
let OrderingGrid;
try {
  await build({ entryPoints: [fileURLToPath(new URL("../src/ui/OrderingGrid.tsx", import.meta.url))], outfile, bundle: true,
    platform: "node", format: "esm", jsx: "automatic", packages: "external",
    plugins: [{ name: "hook-host", setup(build) {
      build.onResolve({ filter: /^\.\/overlays\/Dialog$/ }, () => ({ path: "dialog", namespace: "dialog-boundary" }));
      build.onLoad({ filter: /.*/, namespace: "dialog-boundary" }, () => ({ contents: "export const Dialog=()=>null;" }));
      build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "hook-host" }));
      build.onLoad({ filter: /.*/, namespace: "hook-host" }, () => ({ contents:
        ["useState", "useRef", "useEffect"].map(name =>
          `export const ${name} = (...args) => globalThis.orderingGridHookHost.${name}(...args);`).join("\n") }));
    } }] });
  ({ OrderingGrid } = await import(pathToFileURL(outfile)));
} finally { if (existsSync(outfile)) unlinkSync(outfile); rmdirSync(directory); }

function descendants(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
}
function mount(kind = "GENERAL", lines = [], options = {}) {
  const slots = [], frames = [], commits = [], settlements = [];
  let cursor = 0, dirty = true, effects = [], tree, focused, editor, state;
  const props = { kind, section: kind === "CN_REGULAR" ? "SINGLE" : "", lines, busy: false,
    onRegister(value) { editor = value; }, onStateChange(value) { state = value; },
    onDelete: async () => {}, onCommit(row, patch, final) {
      commits.push({ row, patch, final });
      return new Promise((resolve, reject) => settlements.push({ resolve(saved) {
        props.lines = [...props.lines.filter(line => line.id !== saved.id), saved];
        dirty = true; resolve(saved);
      }, reject }));
    }, ...options };
  const host = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) {
      const i = cursor++;
      slots[i] ??= { value: typeof value === "function" ? value() : value };
      return [slots[i].value, update => {
        slots[i].value = typeof update === "function" ? update(slots[i].value) : update;
        dirty = true;
      }];
    },
    useEffect(effect, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        slots[i] = { deps }; effects.push(effect);
      }
    },
  };
  function render() {
    globalThis.orderingGridHookHost = host;
    globalThis.requestAnimationFrame = callback => frames.push(callback);
    do {
      dirty = false; cursor = 0; effects = []; tree = OrderingGrid(props);
      tree.props.ref.current = { querySelector(selector) {
        const row = Number(/data-order-row="(-?\d+)"/.exec(selector)[1]);
        const field = /data-order-field="([^"]+)"/.exec(selector)[1];
        return input(row, field) ? { focus() { focused = { row, field }; } } : null;
      } };
      effects.forEach(effect => effect());
    } while (dirty);
  }
  function input(row, field) {
    return descendants(tree).find(node => (node.type === "input" || node.type === "textarea") &&
      node.props["data-order-row"] === row && node.props["data-order-field"] === field);
  }
  function flush() { render(); while (frames.length) frames.shift()(); }
  function change(row, field, value) { input(row, field).props.onChange({ target: { value } }); render(); }
  function press(row, field, options = {}) {
    let prevented = false;
    const node = input(row, field);
    node.props.onKeyDown({ key: "Enter", nativeEvent: { isComposing: false },
      currentTarget: { value: node.props.value }, preventDefault() { prevented = true; }, ...options });
    flush(); return prevented;
  }
  render();
  return { change, press, flush, input, commits, settlements,
    click(label) { const node=descendants(tree).find(n=>(n.type==="button"||n.type?.name==="IconButton")&&(n.props["aria-label"]===label||n.props.label===label||n.props.children===label)); assert.ok(node,`button ${label}`);node.props.onClick();render(); },
    get nodes() { return descendants(tree); },
    get editor() { return editor; }, get state() { return state; },
    rowKey(id) { return descendants(tree).find(n => n.type === "tr" && descendants(n).some(child => child.props?.["data-order-row"] === id))?.key; },
    get focused() { return focused; },
    get rowIds() { return [...new Set(descendants(tree).filter(n => n.type === "input" || n.type === "textarea").map(n => n.props["data-order-row"]))]; } };
}
test.afterEach(() => { delete globalThis.orderingGridHookHost; delete globalThis.requestAnimationFrame; });

for (const kind of ["GENERAL", "VENDOR", "CN_REGULAR", "CN_CUSTOM"]) {
  test(`${kind}: note Enter adds a row and focuses its item code even before the current row can save`, () => {
    const grid = mount(kind);
    if (kind === "GENERAL" || kind === "VENDOR") {
      grid.change(-1, "vendorItemCode", "TEST-VENDOR-01");
      grid.change(-1, "vendorItemName", "測試廠商品名甲");
    }
    grid.change(-1, "quantityText", "7");
    grid.change(-1, "note", "測試備註");
    assert.equal(grid.press(-1, "note"), true);
    assert.deepEqual(grid.rowIds, [-1, -2]);
    assert.deepEqual(grid.focused, { row: -2, field: "itemCode" });
    assert.equal(grid.input(-1, "note").props.value, "測試備註");
    assert.equal(grid.commits.length,1,"every source type must be able to save partial draft inputs");
    grid.press(-1, "note");
    assert.deepEqual(grid.rowIds, [-1, -2], "reuse an existing next row");
    grid.press(-2, "note");
    assert.deepEqual(grid.focused, { row: -3, field: "itemCode" });
  });
}

test("note Enter uses the immediately created row while a valid row save is pending, and preserves failed input", async () => {
  const grid = mount();
  grid.change(-1, "itemName", "測試品名甲"); grid.change(-1, "quantityText", "2");
  grid.change(-1, "note", "測試備註"); grid.press(-1, "note");
  assert.equal(grid.commits.length, 1);
  assert.equal(grid.commits[0].patch.note, "測試備註");
  assert.deepEqual(grid.focused, { row: -2, field: "itemCode" });
  assert.deepEqual(grid.rowIds, [-1, -2]);
  grid.settlements[0].reject(new Error("simulated save failure"));
  await Promise.resolve(); await Promise.resolve(); grid.flush();
  assert.equal(grid.input(-1, "note").props.value, "測試備註");
  assert.deepEqual(grid.focused, { row: -2, field: "itemCode" });
});

test("saved rows advance to the following saved or draft row without adding duplicates", () => {
  const saved = id => ({ id, section: "", sortOrder: id, itemCode: `TEST-${id}`, itemName: "測試品名甲",
    vendorItemCode: "", vendorItemName: "", spec: "", quantityText: "1", unit: "", note: "" });
  const grid = mount("GENERAL", [saved(1), saved(2)]);
  grid.press(1, "note"); assert.deepEqual(grid.focused, { row: 2, field: "itemCode" });
  grid.press(2, "note"); assert.deepEqual(grid.focused, { row: -1, field: "itemCode" });
  assert.deepEqual(grid.rowIds, [1, 2, -1]); assert.equal(grid.commits.length, 0);
});

test("quantity Enter advances to unit, then note and the next row; IME does not advance", () => {
  const grid = mount();
  grid.press(-1, "itemCode"); assert.deepEqual(grid.focused, { row: -1, field: "itemName" });
  grid.press(-1, "note", { nativeEvent: { isComposing: true } });
  grid.press(-1, "note", { key: "Tab" }); assert.deepEqual(grid.rowIds, [-1]);
  grid.change(-1, "itemName", "測試品名甲"); grid.change(-1, "quantityText", "2");
  grid.press(-1, "quantityText"); assert.deepEqual(grid.focused, { row: -1, field: "unit" });
  grid.press(-1, "unit"); assert.deepEqual(grid.focused, { row: -1, field: "note" });
  grid.press(-1, "note"); assert.deepEqual(grid.focused, { row: -2, field: "itemCode" });
});

const tick = async grid => { await new Promise(resolve => setImmediate(resolve)); grid.flush(); };
function acknowledge(grid, index, id = 101) {
  const { row, patch } = grid.commits[index];
  const saved = { ...row, ...patch, id: row.id || id };
  grid.settlements[index].resolve(saved);
  return saved;
}

for (const kind of ["GENERAL", "VENDOR"]) test(`${kind}: vendor-only row is acknowledged before it becomes clean`, async () => {
  const grid = mount(kind);
  grid.change(-1, "vendorItemCode", "TEST-V01"); grid.change(-1, "vendorItemName", "測試廠商品名");
  grid.change(-1, "quantityText", "7"); grid.change(-1, "note", "測試備註"); grid.press(-1, "note");
  assert.deepEqual(grid.state, { dirty: true, saving: true, failed: false });
  const key = grid.rowKey(-1);
  let done = false; const saving = grid.editor.flush().then(result => { done = true; return result; });
  await tick(grid); assert.equal(done, false); assert.equal(grid.commits.length, 1);
  acknowledge(grid, 0); await tick(grid); assert.equal(await saving, true);
  assert.equal(grid.input(101, "itemName").props.value, "");
  assert.equal(grid.input(101, "vendorItemName").props.value, "測試廠商品名");
  assert.equal(grid.rowKey(101), key, "acknowledging a new row must retain its React identity while typing");
  assert.deepEqual(grid.state, { dirty: false, saving: false, failed: false });
});

test("edits typed during create update the acknowledged row, retaining failed late edits for retry", async () => {
  const grid = mount();
  grid.change(-1, "vendorItemName", "測試廠商品名"); grid.change(-1, "quantityText", "7"); grid.press(-1, "quantityText");
  grid.change(-1, "unit", "箱"); grid.change(-1, "note", "網路等待時填寫");
  acknowledge(grid, 0); await tick(grid);
  assert.equal(grid.commits.length, 2); assert.equal(grid.commits[1].row.id, 101);
  assert.deepEqual(grid.commits[1].patch, { unit: "箱", note: "網路等待時填寫" });
  grid.settlements[1].reject(new Error("simulated failure")); await tick(grid);
  assert.equal(grid.input(-1, "note").props.value, "網路等待時填寫");
  assert.deepEqual(grid.state, { dirty: true, saving: false, failed: true });
  assert.equal(grid.rowIds.filter(id => id === 101).length, 0, "hide the acknowledged baseline while late edits remain pending");
  const retry = grid.editor.flush();
  assert.equal(grid.commits[2].row.id, 101, "retry must update, not create a duplicate row");
  acknowledge(grid, 2); await tick(grid); assert.equal(await retry, true);
  assert.equal(grid.input(101, "note").props.value, "網路等待時填寫");
  assert.deepEqual(grid.rowIds, [101, -2]);
});

test("partially entered drafts persist on flush; failed acknowledgement leaves dirty",async()=>{
 const grid=mount();grid.change(-1,"vendorItemCode","TEST-ONLY-CODE");
 const pending=grid.editor.flush();assert.equal(grid.commits.length,1);
 assert.equal(grid.commits[0].patch.vendorItemCode,"TEST-ONLY-CODE");
 grid.settlements[0].resolve({id:0});
 assert.equal(await pending,false);await tick(grid);
 assert.equal(grid.state.dirty,true);
 grid.editor.discard();grid.flush();assert.equal(grid.state.dirty,false);
});

test("saved-cell flush deduplicates pending edits and retains a failed value", async () => {
  const line = { id: 101, section: "", sortOrder: 1, itemCode: "", itemName: "", vendorItemCode: "V01",
    vendorItemName: "測試廠商品名", spec: "", quantityText: "7", unit: "", note: "" };
  const grid = mount("GENERAL", [line]); grid.change(101, "note", "新的備註"); grid.press(101, "note");
  const saving = grid.editor.flush(); assert.equal(grid.commits.length, 1);
  grid.settlements[0].reject(new Error("simulated failure")); await tick(grid);
  assert.equal(await saving, false); assert.equal(grid.input(101, "note").props.value, "新的備註");
  const retry = grid.editor.flush(); acknowledge(grid, 1); await tick(grid);
  assert.equal(await retry, true); assert.equal(grid.input(101, "note").props.value, "新的備註");
});

for (const [kind, fields] of Object.entries({
  GENERAL: ["itemCode", "itemName", "vendorItemCode", "vendorItemName", "quantityText", "unit", "note"],
  VENDOR: ["itemCode", "itemName", "vendorItemCode", "vendorItemName", "quantityText", "unit", "note"],
  CN_REGULAR: ["itemCode", "itemName", "quantityText", "unit", "note"],
  CN_CUSTOM: ["itemCode", "itemName", "spec", "quantityText", "unit", "note"],
})) test(`${kind}: full Enter order is consistent on pending and saved rows`, () => {
  const grid = mount(kind);
  grid.change(-1, "itemName", "測試商品"); grid.change(-1, "quantityText", "2");
  for (let i = 0; i < fields.length - 1; i++) {
    grid.press(-1, fields[i]); assert.deepEqual(grid.focused, { row: -1, field: fields[i + 1] });
  }
  grid.press(-1, "note"); assert.deepEqual(grid.focused, { row: -2, field: "itemCode" });
  const saved = mount(kind, [{ ...grid.commits[0].row, id: 101 }]);
  for (let i = 0; i < fields.length - 1; i++) {
    saved.press(101, fields[i]); assert.deepEqual(saved.focused, { row: 101, field: fields[i + 1] });
  }
  saved.press(101, "note"); assert.deepEqual(saved.focused, { row: -1, field: "itemCode" });
});

test("delete icon participates in header state and navigation flush without a reorder menu", async () => {
  const line=id=>({id,section:"",sortOrder:id,itemCode:"T00"+id,itemName:"測試商品",vendorItemCode:"",vendorItemName:"",spec:"",quantityText:"2",unit:"箱",note:""});
  let finish;const deleted=[];
  const grid=mount("GENERAL",[line(1),line(2)],{onDelete:row=>{deleted.push(row.id);return new Promise(resolve=>{finish=resolve})}});
  grid.click("刪除第1列");assert.equal(grid.state.saving,true);assert.deepEqual(deleted,[1]);assert.equal(grid.commits.length,0);
  let done=false;const saving=grid.editor.flush().then(okay=>{done=true;return okay;});await tick(grid);assert.equal(done,false);
  finish();await tick(grid);assert.equal(await saving,true);assert.equal(grid.state.saving,false);
  assert.equal(grid.nodes.some(n=>n.type==="button"&&["上移","下移","⋮"].includes(n.props.children)),false);
});

test("completely empty trailing rows, including cleared input, never save or block send flush", async () => {
  const grid=mount();grid.change(-1,"vendorItemName"," ");grid.change(-1,"vendorItemName","");
  grid.press(-1,"note");assert.deepEqual(grid.rowIds,[-1,-2]);
  assert.equal(grid.state.dirty,false);assert.equal(await grid.editor.flush(),true);assert.equal(grid.commits.length,0);
});

test("editable product name, vendor name and note use wrapping controls without changing Enter traversal", () => {
 const grid=mount();
 for(const field of ["itemName","vendorItemName","note"]){
  assert.equal(grid.input(-1,field).type,"textarea",field+" permits wrapping in draft");
  assert.equal(grid.input(-1,field).props.rows,1,"start at one line");
 }
 grid.change(-1,"itemName","很長的商品名稱不用省略號，應該在欄內顯示完整文字");
 assert.equal(grid.press(-1,"itemName"),true);
 assert.deepEqual(grid.focused,{row:-1,field:"vendorItemCode"});
});

test("sent table contains only persisted rows, received quantities and accessible arrival markers", () => {
  const base={section:"",sortOrder:0,itemCode:"T001",itemName:"測試商品",vendorItemCode:"",vendorItemName:"",spec:"",quantityText:"10",quantity:10,unit:"箱",note:""};
  const grid=mount("GENERAL",[{...base,id:1,received:10},{...base,id:2,received:4},{...base,id:3,received:0}],{readOnly:true});
  assert.equal(grid.nodes.filter(n=>n.type==="tr").length,4);
  assert.deepEqual(grid.rowIds,[]);assert.equal(grid.editor,null);
  assert.equal(grid.nodes.some(n=>n.type?.name==="IconButton"),false);
  assert.deepEqual(grid.nodes.filter(n=>typeof n.props?.className==="string"&&n.props.className.includes("cy-ordering-status-chip")).map(n=>n.props.children),["已到齊","部分到貨","待到貨"]);
  assert.equal(grid.nodes.some(n=>n.type==="th"&&n.props.children==="狀態"),true);
  assert.equal(grid.nodes.filter(n=>typeof n.props?.className==="string"&&n.props.className.includes("cy-ordering-wrap")).length,9,"each readonly row wraps item name, vendor name and notes without ellipsis");
  assert.equal(grid.nodes.some(n=>n.type==="th"&&n.props.children==="已到數量"),true);
  assert.equal(grid.nodes.some(n=>n.type==="th"&&n.props.children==="操作"),false);
});

test("autosave while typing is not final; leaving the cell sends the final save once", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const line = { id: 101, section: "", sortOrder: 1, itemCode: "", itemName: "測試品名甲", vendorItemCode: "V01",
    vendorItemName: "測試廠商品名甲", vendorNameFollows: false, spec: "", quantityText: "1", unit: "", note: "" };
  const grid = mount("GENERAL", [line]);
  grid.change(101, "itemCode", "CODE01"); t.mock.timers.tick(900); grid.flush();
  assert.equal(grid.commits.length, 1); assert.equal(grid.commits[0].final, false);
  acknowledge(grid, 0); await tick(grid);
  grid.input(101, "itemCode").props.onBlur({ currentTarget: { value: "CODE01" } }); grid.flush();
  assert.equal(grid.commits.length, 2); assert.equal(grid.commits[1].final, true);
  assert.deepEqual(grid.commits[1].patch, { vendorItemCode: "V01", vendorItemName: "測試廠商品名甲" });
  acknowledge(grid, 1); await tick(grid);
  grid.input(101, "itemCode").props.onBlur({ currentTarget: { value: "CODE01" } }); grid.flush();
  assert.equal(grid.commits.length, 2, "already final: nothing more to send");
});

test("a new row's Enter during its autosave is carried into one more final save", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const grid = mount("GENERAL");
  grid.change(-1, "itemName", "測試品名甲"); t.mock.timers.tick(900); grid.flush();
  assert.equal(grid.commits.length, 1); assert.equal(grid.commits[0].final, false);
  grid.press(-1, "itemName");
  assert.equal(grid.commits.length, 1, "the pending save is reused");
  acknowledge(grid, 0); await tick(grid);
  assert.equal(grid.commits.length, 2); assert.equal(grid.commits[1].final, true);
  acknowledge(grid, 1); await tick(grid);
  assert.equal(grid.commits.length, 2);
});
