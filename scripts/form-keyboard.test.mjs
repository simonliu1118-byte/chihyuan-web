import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// PROJECT_RULES §5: every data-entry form moves to the next field on Enter, and
// date inputs keep a four-digit year. Search forms (role="search") submit on Enter.
const ENTER_HANDLERS = /onKeyDown=\{(enterAdvancesFields|enterAdvancesThenSubmits|advanceFocusOnEnter)\}/;
// Temporary: WO-0.9.24 is rewriting these files; the reviewer adds Enter handling there and removes this list.
const PENDING = new Set(["src/runtime/modules/HrOperationalPage.tsx", "src/runtime/modules/HrSettingsButton.tsx"]);

function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

const files = sources("src").map(path => ({ path: path.replaceAll("\\", "/"), text: readFileSync(path, "utf8") }));

test("every data-entry form handles Enter as next field", () => {
  const missing = [];
  for (const { path, text } of files) {
    if (PENDING.has(path)) continue;
    for (const match of text.matchAll(/<form\b[\s\S]*?>/g)) {
      const tag = match[0];
      if (tag.includes('role="search"') || ENTER_HANDLERS.test(tag)) continue;
      missing.push(`${path}:${text.slice(0, match.index).split("\n").length}`);
    }
  }
  assert.deepEqual(missing, [], "Add onKeyDown={enterAdvancesFields} (or role=\"search\" for a query form):\n" + missing.join("\n"));
});

test("date inputs limit the year to four digits", () => {
  const missing = [];
  for (const { path, text } of files) {
    if (PENDING.has(path)) continue;
    for (const match of text.matchAll(/<input\b[^>]*type="date"[^>]*>/g)) {
      if (!/\bmax=/.test(match[0])) missing.push(`${path}:${text.slice(0, match.index).split("\n").length}`);
    }
  }
  assert.deepEqual(missing, [], "Add max=\"9999-12-31\" (or a real upper bound):\n" + missing.join("\n"));
});
