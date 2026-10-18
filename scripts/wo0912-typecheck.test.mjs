import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("WO-0.9.12 browser TypeScript contract", () => {
  const run = spawnSync(process.execPath,
    ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json", "--pretty", "false"],
    { encoding: "utf8", timeout: 120000 });
  assert.equal(run.status, 0, [run.stdout, run.stderr].join("\n"));
});
