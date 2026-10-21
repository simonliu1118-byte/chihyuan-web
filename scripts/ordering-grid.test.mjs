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
function mount(kind = "GENERAL", lines = []) {
  const slots = [], frames = [], commits = [], settlements = [];
  let cursor = 0, dirty = true, effects = [], tree, focused, editor, state;
  const props = { kind, section: kind === "CN_REGULAR" ? "SINGLE" : "", lines, busy: false,
    onRegister(value) { editor = value; }, onStateChange(value) { state = value; },
    onDelete: async () => {}, onCommit(row, patch) {
      commits.push({ row, patch });
      return new Promise((resolve, reject) => settlements.push({ resolve(saved) {
        props.lines = [...props.lines.filter(line => line.id !== saved.id), saved];
        dirty = true; resolve(saved);
      }, reject }));
    } };
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
    return descendants(tree).find(node => node.type === "input" &&
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
    get editor() { return editor; }, get state() { return state; },
    get focused() { return focused; },
    get rowIds() { return [...new Set(descendants(tree).filter(n => n.type === "input").map(n => n.props["data-order-row"]))]; } };
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
    assert.equal(grid.commits.length, ["GENERAL", "VENDOR"].includes(kind) ? 1 : 0,
      "vendor name and quantity save only for sources that expose vendor fields");
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

test("ordinary field progression, quantity shortcut and IME behavior remain unchanged", () => {
  const grid = mount();
  grid.press(-1, "itemCode"); assert.deepEqual(grid.focused, { row: -1, field: "itemName" });
  grid.press(-1, "note", { nativeEvent: { isComposing: true } });
  grid.press(-1, "note", { key: "Tab" }); assert.deepEqual(grid.rowIds, [-1]);
  grid.change(-1, "itemName", "測試品名甲"); grid.change(-1, "quantityText", "2");
  grid.press(-1, "quantityText"); assert.deepEqual(grid.focused, { row: -2, field: "itemName" });
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
  assert.deepEqual(grid.state, { dirty: true, saving: true });
  let done = false; const saving = grid.editor.flush().then(result => { done = true; return result; });
  await tick(grid); assert.equal(done, false); assert.equal(grid.commits.length, 1);
  acknowledge(grid, 0); await tick(grid); assert.equal(await saving, true);
  assert.equal(grid.input(101, "itemName").props.value, "");
  assert.equal(grid.input(101, "vendorItemName").props.value, "測試廠商品名");
  assert.deepEqual(grid.state, { dirty: false, saving: false });
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
  assert.deepEqual(grid.state, { dirty: true, saving: false });
  assert.equal(grid.rowIds.filter(id => id === 101).length, 0, "hide the acknowledged baseline while late edits remain pending");
  const retry = grid.editor.flush();
  assert.equal(grid.commits[2].row.id, 101, "retry must update, not create a duplicate row");
  acknowledge(grid, 2); await tick(grid); assert.equal(await retry, true);
  assert.equal(grid.input(101, "note").props.value, "網路等待時填寫");
  assert.deepEqual(grid.rowIds, [101, -2]);
});

test("incomplete input and unacknowledged saves never report clean", async () => {
  const grid = mount(); grid.change(-1, "vendorItemCode", "TEST-ONLY-CODE");
  assert.equal(await grid.editor.flush(), false); assert.equal(grid.commits.length, 0);
  grid.change(-1, "vendorItemName", "測試廠商品名"); grid.change(-1, "quantityText", "2"); grid.press(-1, "note");
  grid.settlements[0].resolve({ id: 0 }); await tick(grid);
  assert.equal(grid.state.dirty, true); assert.equal(grid.input(-1, "vendorItemName").props.value, "測試廠商品名");
  grid.editor.discard(); grid.flush(); assert.equal(grid.state.dirty, false);
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
