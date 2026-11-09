#!/usr/bin/env node
import { configFromEnv, createReporter, redact, ReporterError } from "./client.mjs";
const help = `CYWEB work reporter — Node.js 22+
Usage: node scripts/cyweb-reporter.mjs <command> < input.json
Commands:
  check        {} (read-only API/credential check)
  progress     {status,summary?}
  submit       {externalRef,title,body,kind?,items?} (kind post/patrol: items [{ref?,title,body}] reviewed one by one)
  review       {externalRef} (multi-item drafts include each item's result)
  image        {externalRef,file,item?} (review-only picture: JPEG/PNG/WebP, max 2MB, 5 per draft or item)
  sent         {externalRef,items?} (report approved work actually sent; items = item numbers for post/patrol)
  review-notification {type,eventId,botCode,draftId} (read fresh review after webhook)
  report       {eventId,title,body}
  complete     {eventId,title,detail?,completedAt?,reviewRef?,workType?}
  pilot-start  {reference} (SOCIAL_EDITOR test only)
  pilot-finish {reference} (requires the same test to be approved in CYWEB)
Configuration (environment):
  CYWEB_BASE_URL, CYWEB_BOT_CODE, CYWEB_REPORTER_STATE_DIR
  CYWEB_BOT_TOKEN must be injected by the platform's secure secret mechanism.
No token arguments, login, approval or publishing commands are supported.
`;
const command = process.argv[2];
if (command === "--help" || command === "help") {
  process.stdout.write(help);
  process.exit(0);
}
let config;
try {
  if (process.argv.length !== 3) throw new ReporterError("COMMAND_INVALID", "請只提供操作名稱；JSON 從標準輸入傳入，憑證只能使用安全注入");
  config = configFromEnv();
  let size = 0;
  const chunks = [];
  if (!process.stdin.isTTY) for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 256e3) throw new ReporterError("INPUT_TOO_LARGE", "JSON 輸入超過上限");
    chunks.push(chunk);
  }
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8").trim() || "{}");
  } catch {
    throw new ReporterError("INPUT_INVALID", "請提供有效 JSON");
  }
  const data = await createReporter(config).run(command, input);
  process.stdout.write(JSON.stringify({ ok: true, data: redact(data, config.token) }) + "\n");
} catch (error) {
  const detail = error instanceof ReporterError ? { code: error.code, message: error.message } : { code: "CLIENT_UNAVAILABLE", message: "回報工具無法完成；請檢查連線或收據狀態，不可盲目重送" };
  process.stdout.write(JSON.stringify({ ok: false, error: config ? redact(detail, config.token) : detail }) + "\n");
  process.exitCode = 1;
}
