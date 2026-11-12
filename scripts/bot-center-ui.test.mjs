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
test("settings expose existing credentials without a dynamic BOT creation form",()=>{assert.doesNotMatch(page,/新增 BOT|createBot|addOpen/);assert.match(page,/BOT 當日摘要/);assert.match(page,/togglePush/)});

test("timeline rows collapse to one line and reveal shared expand toggle only for overflow",()=>{
 assert.match(page,/function TimelineEvent\(\{item\}/);
 assert.match(page,/preview\.scrollWidth>preview\.clientWidth\+1/);
 assert.match(page,/new ResizeObserver\(measure\)/);
 assert.match(page,/<TimelineEvent key=\{item\.id\} item=\{item\}\/>/);
 assert.match(page,/<ExpandToggle variant="text" expanded=\{expanded\} label=\{item\.title\}/);
 assert.match(css,/\.cy-bot-timeline-preview\{[^}]*white-space:nowrap/);
 assert.match(css,/\.cy-bot-timeline-preview\.is-expanded\{[^}]*white-space:pre-wrap/);
});
test("Threads card shows daily totals and targeted dialogs have narrower widths",()=>{
 assert.doesNotMatch(page,/state\.workSummary\.patrols\.latest\?\.detail/);
 assert.match(page,/今日巡視 <strong>\{state\.workSummary\.patrols\.count\}<\/strong> 次/);
 assert.match(page,/已送出 \{state\.workSummary\.patrols\.sentToday\} 則・待送出 \{state\.workSummary\.patrols\.toSend\} 則/);
 assert.match(dialog,/className="cy-bot-push-dialog"/);
 assert.match(page,/className="cy-bot-settings-dialog"/);
 assert.match(css,/\.cy-dialog\.cy-bot-push-dialog > \.cy-dialog-surface\{width:min\(414px/);
 assert.match(css,/\.cy-dialog\.cy-bot-settings-dialog > \.cy-dialog-surface\{width:min\(720px/);
 assert.match(css,/\.cy-bot-credential-table\{min-width:680px\}/);
});
