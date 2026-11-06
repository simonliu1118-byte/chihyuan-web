import test from "node:test";
import assert from "node:assert/strict";
import { clearErpResults, erpResultForDisplay } from "../src/runtime/modules/erp-result-cache.ts";

function storage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); },
  };
}
test("cleared completed job disappears when session has no matching saved result", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { sessionStorage: storage() };
  try {
    const finished = { id:"recent-1", queryType:"ITEM_NAME", status:"DONE", resultCleared:false, items:[{name:"品名",value:"合成品"}] };
    const cleared = { ...finished, resultCleared:true, items:[] };
    assert.equal(erpResultForDisplay(cleared), null, "recent metadata does not create an empty result card");
    assert.deepEqual(erpResultForDisplay(finished), finished, "fresh result is displayed and cached");
    assert.deepEqual(erpResultForDisplay(cleared), finished, "same-tab saved result survives server cleanup");
    assert.equal(erpResultForDisplay({ ...cleared, id:"recent-2" }), null, "a different query must not inherit the old cache");
    assert.equal(erpResultForDisplay({ ...cleared, status:"RUNNING" }).status, "RUNNING", "active jobs are still visible");
    assert.equal(erpResultForDisplay({ ...cleared, status:"FAILED" }).status, "FAILED", "errors remain visible");
    clearErpResults();
    assert.equal(erpResultForDisplay(cleared), null, "logging out removes the obsolete card on next login");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
