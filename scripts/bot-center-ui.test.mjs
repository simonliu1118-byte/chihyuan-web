import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync("src/runtime/modules/BotCenterPage.tsx","utf8");
const dialog=readFileSync("src/runtime/modules/BotPushSettingsDialog.tsx","utf8");
const css=readFileSync("src/runtime/modules/bot-center.css","utf8");

test("dashboard top displays status without old title, date or BOT filter",()=>{
 assert.match(page,/aria-label="今日工作總覽"/);
 assert.match(page,/aria-label="BOT 狀態總覽（只供顯示）"/);
 assert.match(page,/進行中 \{state\.bots\.filter/);
 assert.match(page,/受阻 \{state\.bots\.filter/);
 assert.match(page,/待命 \{state\.bots\.filter/);
 assert.match(page,/state\.bots\.map\(bot=><StatusChip/);
 assert.doesNotMatch(page,/<p className="cy-bot-date">/);
 assert.doesNotMatch(page.split('return <div className="cy-bot-center">')[1],/<h2>BOT 管理中心<\/h2>/);
 assert.doesNotMatch(page,/<StatusFilter label="選擇 BOT"/);
 assert.doesNotMatch(page,/<span className="cy-bot-scope">/);
});
test("five latest events use grouped minute markers; full modal keeps cursor",()=>{
 assert.match(page,/state\.timeline\.slice\(0,5\)/);
 assert.match(page,/const last=groups\.at\(-1\)/);
 assert.match(page,/if\(last\?\.minute===minute\)last\.items\.push\(item\)/);
 assert.match(page,/<li key=\{group\.minute\} className="cy-bot-timeline-group"/);
 assert.match(page,/<time dateTime=\{group\.items\[0\]\.completedAt\}>\{group\.clock\}<\/time>/);
 assert.match(page,/<ul className="cy-bot-timeline-events">/);
 assert.match(page,/timelineOpen\?<Dialog open title="今日完成時間軸－全部"/);
 assert.match(page,/<TimelineList items=\{state\.timeline\}/);
 assert.match(page,/void loadMore\("timeline"\)/);
 assert.match(css,/\.cy-bot-timeline-group::before\{content:""/);
});
test("push settings use shared table cells only and keep enabled flag unchanged",()=>{
 assert.match(dialog,/<EntryTable label="推播設定" className="cy-bot-form-table">/);
 assert.match(dialog,/<th scope="row"><EntryHeading required=\{!configured\}>Webhook 網址/);
 assert.match(dialog,/<th scope="row"><EntryHeading required=\{!configured\}>Webhook 密鑰/);
 assert.match(dialog,/onSave\(\{url,key:secret,enabled\}\)/);
 assert.doesNotMatch(dialog,/CheckField|setActive|啟用推播/);
 assert.match(page,/saveBotPush\(code,\{enabled:!setting\.enabled\}\)/);
 assert.match(page,/if\(setting\.enabled&&!await confirm/);
 assert.match(page,/!state\.canManageCredentials\)return/);
 assert.match(page,/disabled=\{busy\|\|!state\.pushReady\|\|!state\.pushSettings\.find/);
});
test("new BOT uses shared table dialog and keeps existing credential management separate",()=>{
 assert.match(page,/addOpen\?<Dialog open title="新增 BOT"/);
 assert.match(page,/<EntryTable label="新增 BOT" className="cy-bot-form-table">/);
 assert.match(page,/<th scope="row"><EntryHeading required>代碼/);
 assert.match(page,/<th scope="row"><EntryHeading required>名稱/);
 assert.match(page,/id="cy-bot-add-form" onKeyDown=\{enterAdvancesFields\}/);
 assert.match(page,/setAddOpen\(false\);await refresh/);
 assert.match(page,/<section className="cy-bot-cards" aria-label="BOT 當日摘要"/);
 assert.match(page,/className="cy-bot-settings-heading"/);
 assert.match(page,/onClick=\{\(\)=>void togglePush\(item\.botCode\)\}/);
 assert.match(css,/\.cy-bot-form-table th\[scope="row"\]/);
});
