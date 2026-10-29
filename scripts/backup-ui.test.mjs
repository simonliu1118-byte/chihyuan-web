import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const directory = mkdtempSync(fileURLToPath(new URL("../node_modules/.cyweb-backup-ui-", import.meta.url)));
let BackupHistoryView, BackupRehearsalHistoryView, BackupLatestRehearsalResult, shouldShowLatestRehearsalResult;
try {
  const outfile = join(directory, "view.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../src/runtime/modules/BackupOperationalPage.tsx", import.meta.url))], outfile,
    bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external", loader: { ".css": "empty" } });
  ({ BackupHistoryView, BackupRehearsalHistoryView, BackupLatestRehearsalResult, shouldShowLatestRehearsalResult } = await import(pathToFileURL(outfile)));
} finally { rmSync(directory, { recursive: true, force: true }); }
const row = { backupId: "00000000-0000-4000-8000-000000000001", createdAt: "2026-10-01T19:30:00.000Z", appVersion: "0.7.3",
  schemaVersion: "0006_backup_catalog", dataSha256: "a".repeat(64), byteLength: 1200, recordCount: 3, status: "verified", triggerKind: "manual",
  copies: [{ provider: "r2", status: "verified", verifiedAt: "2026-10-01T19:30:01.000Z", errorCode: null },
    { provider: "gcs", status: "failed", verifiedAt: null, errorCode: "BACKUP_COPY_FAILED" }], canRetry: true };
function render(entry = row, busy = false, configured = true, recoveryConfigured = false) {
  return renderToStaticMarkup(createElement(BackupHistoryView, { history: { configured, recoveryConfigured, recoveryReady: recoveryConfigured, sets: entry ? [entry] : [] }, busy, retry() {}, rehearse() {} }));
}
test("backup history groups both provider states under one table event and uses Taiwan time", () => {
  const html = render();
  assert.equal((html.match(/<tbody><tr/g) ?? []).length, 1);
  assert.match(html, /R2<\/strong> 已驗證/);
  assert.match(html, /GCS<\/strong> 失敗/);
  assert.match(html, /2026\/10\/02\s03:30/);
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
test("rehearsal control requires server capability and a verified copy; busy disables both presentations", () => {
  assert.doesNotMatch(render(), /驗證隔離還原/);
  assert.doesNotMatch(render({ ...row, copies: [] }, false, true, true), /驗證隔離還原/);
  assert.match(render(row, false, true, true), /驗證隔離還原/);
  assert.match(render(row, true, true, true), /button[^>]*disabled=""[^>]*>驗證隔離還原/);
});

test("rehearsal history shows failed phase and safe error without exposing technical exception", () => {
  const html = renderToStaticMarkup(createElement(BackupRehearsalHistoryView, { items: [{
    eventId: 9, backupId: "synthetic-backup", occurredAt: "2026-10-28T07:46:34.000Z",
    status: "failed", provider: "gcs", phase: "target_validation",
    errorCode: "BACKUP_TABLE_COVERAGE_MISMATCH", requestId: "synthetic-request",
  }] }));
  assert.match(html, /隔離目標檢查/);
  assert.match(html, /BACKUP_TABLE_COVERAGE_MISMATCH/);
  assert.match(html, /驗證失敗/);
  assert.match(html, /synthetic-request/);
  assert.doesNotMatch(html, /敏感憑證|token secret/);
});
test("rehearsal history reports unconfirmed result distinctly from successful restore", () => {
  const html = renderToStaticMarkup(createElement(BackupRehearsalHistoryView, { items: [{
    eventId: 10, backupId: "synthetic-backup", occurredAt: "2026-10-28T07:46:34.000Z",
    status: "unconfirmed", provider: null, phase: null, errorCode: null, requestId: null,
  }] }));
  assert.match(html, /結果待確認/);
  assert.match(html, /不可直接重送/);
});

test("used or detached recovery target never offers verification on desktop or cards", () => {
  const history = { configured: true, recoveryConfigured: true, recoveryReady: false, sets: [row] };
  const html = renderToStaticMarkup(createElement(BackupHistoryView, {
    history, busy: false, retry() {}, rehearse() {},
  }));
  assert.doesNotMatch(html, /驗證隔離還原/);
  assert.match(html, /重試 GCS/);
});
test("verified Audit shows prominent 完成 and original outcome without claiming physical unbinding", () => {
  const html = renderToStaticMarkup(createElement(BackupLatestRehearsalResult, { items: [{
    eventId: 3, backupId: row.backupId, occurredAt: "2026-10-28T13:11:00.000Z",
    status: "verified", provider: "gcs", phase: "completed", errorCode: null, requestId: "synthetic",
  }] }));
  assert.match(html, /隔離還原驗證：完成/);
  assert.match(html, /資料核對成功/);
  assert.doesNotMatch(html, /已解除綁定|已刪除資料庫/);
});

test("Claude N1: new ready target hides the old success panel but retains history", () => {
  assert.equal(shouldShowLatestRehearsalResult(null), false);
  assert.equal(shouldShowLatestRehearsalResult({ recoveryReady: true, rehearsalHistoryAvailable: true }), false);
  assert.equal(shouldShowLatestRehearsalResult({ recoveryReady: false, rehearsalHistoryAvailable: true }), true);
  assert.equal(shouldShowLatestRehearsalResult({ recoveryReady: false, rehearsalHistoryAvailable: false }), false);
  assert.equal(shouldShowLatestRehearsalResult({ recoveryReady: undefined, rehearsalHistoryAvailable: true }), false);
});
test("Claude N3: a reused generation has its own target lock phase label", () => {
  const html = renderToStaticMarkup(createElement(BackupRehearsalHistoryView, { items: [{
    eventId: 12, backupId: "synthetic-backup", occurredAt: "2026-10-28T13:11:00.000Z",
    status: "failed", provider: "r2", phase: "target_lock",
    errorCode: "BACKUP_TARGET_ALREADY_REHEARSED", requestId: "synthetic-request",
  }] }));
  assert.match(html, /隔離目標使用狀態/);
  assert.doesNotMatch(html, /來源備份核對/);
  assert.match(html, /BACKUP_TARGET_ALREADY_REHEARSED/);
});

test("V0.9.51 backup identifiers always occupy a dedicated table column and responsive card", () => {
  const html = render();
  assert.match(html, /<th[^>]*>備份時間（台灣）<\/th><th[^>]*>備份資訊<\/th><th[^>]*>儲存副本<\/th>/);
  assert.match(html, /<dt>備份編號<\/dt>/);
  assert.match(html, /<dt>版本<\/dt>/);
  assert.match(html, /<dt>資料摘要<\/dt>/);
  assert.match(html, /<dd>V0\.7\.3<\/dd>/);
  assert.doesNotMatch(html, /備份識別資訊|<details>/);
  assert.equal((html.match(/class="cy-backup-identity"/g) ?? []).length, 2, "both desktop table and mobile card show full metadata");
});
test("V0.9.51 verified result is inside the rehearsal history panel, not a detached panel", () => {
  const source = readFileSync(new URL("../src/runtime/modules/BackupOperationalPage.tsx", import.meta.url), "utf8");
  const historySection = source.indexOf('<h3>隔離還原驗證紀錄</h3>');
  const successPlacement = source.indexOf('shouldShowLatestRehearsalResult(history)', historySection);
  const historyList = source.indexOf('<BackupRehearsalHistoryView', historySection);
  assert.ok(historySection > -1 && historySection < successPlacement && successPlacement < historyList);
  assert.equal((source.match(/<BackupLatestRehearsalResult items=/g) ?? []).length, 1);
  const html = renderToStaticMarkup(createElement(BackupLatestRehearsalResult, { items: [{
    eventId: 10, backupId: row.backupId, occurredAt: "2026-10-28T13:11:00.000Z",
    status: "verified", provider: "r2", phase: "completed", errorCode: null, requestId: "synthetic",
  }] }));
  assert.match(html, /<div class="cy-backup-rehearsal-success"/);
});
test("V0.9.51 CYInvoice recovery entry sits beside refresh, retaining its single dialog owner and tooltip", () => {
  const page = readFileSync(new URL("../src/runtime/modules/BackupOperationalPage.tsx", import.meta.url), "utf8");
  const owner = readFileSync(new URL("../src/identity/CyInvoiceRecoveryAdminPanel.tsx", import.meta.url), "utf8");
  const toolbar = page.slice(page.indexOf('return <><div className="cy-page-toolbar">'));
  assert.match(toolbar, /更新紀錄<\/button>\s*<CyInvoiceRecoveryAdminPanel/);
  assert.equal((page.match(/<CyInvoiceRecoveryAdminPanel\s/g) ?? []).length, 1);
  assert.match(owner, /className="cy-backup-toolbar-divider"/);
  assert.match(owner, /title="公司電腦全部遺失或損毀時，寄送復原邀請給新電腦接管 CYInvoice。"/);
  assert.doesNotMatch(owner, /cy-invoice-recovery-panel/);
  assert.match(owner, /<Dialog open=\{open\} title="CYInvoice 裝置災難復原"/);
});
