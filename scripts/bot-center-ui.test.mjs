import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync("src/runtime/modules/BotCenterPage.tsx","utf8");
const dialog=readFileSync("src/runtime/modules/BotPushSettingsDialog.tsx","utf8");
const css=readFileSync("src/runtime/modules/bot-center.css","utf8");
const cards=readFileSync("src/runtime/modules/BotWorkCards.tsx","utf8");

test("dashboard top shows only BOTs needing attention, without old aggregate chips or BOT filter",()=>{
 assert.match(page,/aria-label="今日工作總覽"/);
 assert.match(page,/aria-label="BOT 狀態（只列需要注意的 BOT）"/);
 assert.match(page,/botAttention\(state\.bots,nowMs\)/);
 assert.match(page,/其餘 \$\{attention\.normal\} 個 BOT 正常/);
 assert.match(page,/全部 BOT 正常/);
 assert.match(page,/<button key=\{item\.code\} type="button" className="cy-bot-attention" onClick=\{\(\)=>setAttentionBot\(item\)\}>/);
 assert.doesNotMatch(page,/進行中 \{state\.bots\.filter|受阻 \{state\.bots\.filter|待命 \{state\.bots\.filter/);
 assert.doesNotMatch(page,/BOT 當日摘要|cy-bot-cards|今日尚無回報/);
 assert.doesNotMatch(page,/<p className="cy-bot-date">/);
 assert.doesNotMatch(page.split('return <div className="cy-bot-center">')[1],/<h2>BOT 管理中心<\/h2>/);
 assert.doesNotMatch(page,/<StatusFilter label="選擇 BOT"/);
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
test("settings expose existing credentials without a dynamic BOT creation form",()=>{assert.doesNotMatch(page,/新增 BOT|createBot|addOpen/);assert.doesNotMatch(page,/BOT 當日摘要/);assert.match(page,/togglePush/)});

test("timeline rows collapse to one line and reveal shared expand toggle only for overflow",()=>{
 assert.match(page,/function TimelineEvent\(\{item\}/);
 assert.match(page,/preview\.scrollWidth>preview\.clientWidth\+1/);
 assert.match(page,/new ResizeObserver\(measure\)/);
 assert.match(page,/<TimelineEvent key=\{item\.id\} item=\{item\}\/>/);
 assert.match(page,/<ExpandToggle variant="text" expanded=\{expanded\} label=\{item\.title\}/);
 assert.match(css,/\.cy-bot-timeline-preview\{[^}]*white-space:nowrap/);
 assert.match(css,/\.cy-bot-timeline-preview\.is-expanded\{[^}]*white-space:pre-wrap/);
});
test("targeted dialogs have narrower widths and the Threads card shows one row per session",()=>{
 assert.doesNotMatch(page,/state\.workSummary\.patrols\.latest\?\.detail/);
 assert.match(cards,/count=\{summary\.patrols\.sentToday\} unit="則・今日送出留言"/);
 assert.match(cards,/sessions\.map\(session=><button key=\{session\.id\}/);
 assert.match(dialog,/className="cy-bot-push-dialog"/);
 assert.match(page,/className="cy-bot-settings-dialog"/);
 assert.match(dialog,/size="small" className="cy-bot-push-dialog"/);
 assert.doesNotMatch(css,/cy-bot-push-dialog > \.cy-dialog-surface\{width/);
 assert.match(page,/size="large" className="cy-bot-settings-dialog"/);
 assert.doesNotMatch(css,/cy-bot-settings-dialog > \.cy-dialog-surface\{width|cy-bot-review-dialog > \.cy-dialog-surface\{width:min/);
 assert.match(css,/\.cy-bot-credential-table\{min-width:680px\}/);
});
test("the four summary cards share one structure and order; the timeline sits below them",()=>{
 const order=[...cards.matchAll(/<WorkCard label="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(order,["新文章通知","Threads 巡視回報","待核准","拍板結案"]);
 assert.equal((cards.match(/<WorkCard /g)??[]).length,4);
 assert.match(cards,/<div className="cy-bot-work-head"><h3>\{title\}<\/h3><button type="button" className="cy-bot-work-link"/);
 assert.match(cards,/<div className="cy-bot-work-count"><strong/);
 assert.match(cards,/<div className="cy-bot-work-rows">/);
 assert.match(cards,/const MAX_ROWS=3/);
 assert.match(cards,/link="全部" onLink=\{onAllPosts\}/);
 assert.match(cards,/link="全部" onLink=\{onAllPatrol\}/);
 assert.equal((cards.match(/link="前往" onLink=\{onReviewTable\}/g)??[]).length,2);
 assert.match(cards,/貼文<\/span>[\s\S]*Threads 留言[\s\S]*pending\.other>0/);
 assert.match(cards,/等你決定/);
 assert.doesNotMatch(css,/\.cy-bot-work-row[^{]*\{[^}]*border-(top|bottom)/,"rows have no divider line");
 assert.ok(page.indexOf("<BotWorkCards")<page.indexOf('aria-label="今日完成時間軸"'));
 assert.ok(page.indexOf('aria-label="今日完成時間軸"')<page.indexOf('id="bot-review"'));
 assert.match(css,/\.cy-bot-work-cards\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:12px;align-items:stretch\}/);
 assert.match(page,/ref=\{reviewRef\}/);assert.match(page,/scrollIntoView\(\{behavior:"smooth",block:"start"\}\)/);
});
test("review list numbers rows continuously, shows 期限, and renders decisions as 拍板 rows",()=>{
 assert.match(page,/<th className="is-center">項次<\/th><th>版本<\/th>/);
 assert.match(page,/<th>期限<\/th>/);
 assert.match(page,/state\.drafts\.map\(\(draft,index\)=>/);
 assert.match(page,/<td data-label="項次" className="is-center">\{index\+1\}<\/td>/);
 assert.match(page,/<span className="cy-bot-mobile-no">\{index\+1\}<\/span>/);
 assert.match(page,/<StatusChip tone="info">拍板<\/StatusChip><span className="cy-bot-decision-category">［\{draft\.decision\.category\}］<\/span>/);
 assert.match(page,/\{open\?\(draft\.decision\?"決定":"審閱"\):"查看"\}/);
 assert.match(page,/colSpan=\{columns\}/);assert.match(page,/draftStatus==="pending"\?9:11/);
 assert.match(page,/\.\.\.previous\.drafts,\.\.\.page\.drafts\.filter/);
 assert.match(page,/ids:contentIds/,"the content review dialog never pages into a decision");
});
test("decision dialog uses the shared Dialog footer without a top-right X, radio options and a required note for 不同意",()=>{
 const decision=readFileSync("src/runtime/modules/BotDecisionDialog.tsx","utf8");
 assert.match(decision,/showCloseButton=\{false\}/);assert.match(decision,/dismissible=\{false\}/);
 assert.match(decision,/footer=\{footer\}/);
 assert.match(decision,/>不同意<\/button>/);assert.match(decision,/>同意<\/button>/);
 assert.match(decision,/type="radio"/);
 assert.match(decision,/備註（不同意時必填）/);
 assert.match(decision,/不同意時請填寫備註/);
 assert.match(decision,/類別：\{decision\.category\}（BOT 填寫）/);
 assert.doesNotMatch(decision,/<form\b/);
});
test("platform pills use the existing token palette per platform",()=>{
 for(const [name,token] of [["fb","info"],["ig","copper"],["threads","accent"]])assert.match(css,new RegExp("\\.cy-bot-platform-"+name+"\\{background:var\\(--cy-"+token+"-soft\\);color:var\\(--cy-"+token+"\\)"));
 assert.doesNotMatch(css,/\.cy-bot-platform[^{]*\{[^}]*#[0-9a-fA-F]{3,6}/,"no inline colours");
});
