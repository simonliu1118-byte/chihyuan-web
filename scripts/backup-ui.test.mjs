import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const directory = mkdtempSync(fileURLToPath(new URL("../node_modules/.cyweb-backup-ui-", import.meta.url)));
let BackupHistoryView;
try {
  const outfile = join(directory, "view.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../src/runtime/modules/BackupOperationalPage.tsx", import.meta.url))], outfile,
    bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external", loader: { ".css": "empty" } });
  ({ BackupHistoryView } = await import(pathToFileURL(outfile)));
} finally { rmSync(directory, { recursive: true, force: true }); }
const row = { backupId: "00000000-0000-4000-8000-000000000001", createdAt: "2026-10-01T19:30:00.000Z", appVersion: "0.7.3",
  schemaVersion: "0006_backup_catalog", dataSha256: "a".repeat(64), byteLength: 1200, recordCount: 3, status: "verified", triggerKind: "manual",
  copies: [{ provider: "r2", status: "verified", verifiedAt: "2026-10-01T19:30:01.000Z", errorCode: null },
    { provider: "gcs", status: "failed", verifiedAt: null, errorCode: "BACKUP_COPY_FAILED" }], canRetry: true };
function render(entry = row, busy = false, configured = true) {
  return renderToStaticMarkup(createElement(BackupHistoryView, { history: { configured, sets: entry ? [entry] : [] }, busy, retry() {} }));
}
test("backup history groups both provider states under one table event and uses Taiwan time", () => {
  const html = render();
  assert.equal((html.match(/<tbody><tr/g) ?? []).length, 1);
  assert.match(html, /R2<\/strong> 已驗證/);
  assert.match(html, /GCS<\/strong> 失敗/);
  assert.match(html, /2026\/10\/2\s03:30:00/);
  assert.match(html, /重試 GCS/);
  assert.match(html, /cy-data-cards/);
  assert.doesNotMatch(html, /<button[^>]*>.*清空|下載|匯入|還原現在資料/);
});
test("server retry capability and busy state gate both desktop and mobile controls", () => {
  assert.doesNotMatch(render({ ...row, canRetry: false }), /重試 GCS/);
  assert.match(render(row, true), /button[^>]*disabled=""[^>]*>重試 GCS/);
});
test("empty and unknown-state history gives bounded explanatory text", () => {
  assert.match(render(null, false, false), /儲存設定完成後才能建立備份/);
  assert.match(render({ ...row, status: "unexpected" }), /狀態待確認/);
});
