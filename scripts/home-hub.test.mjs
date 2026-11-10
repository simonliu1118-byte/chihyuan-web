import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync as read} from "node:fs";
const app=read("src/App.tsx","utf8");
const server=read("worker/http/home-hub-routes.ts","utf8");
const shell=read("src/ui/shell/AppShell.tsx","utf8");
const home=read("src/runtime/modules/HomePage.tsx","utf8");
const todos=read("src/runtime/modules/MyTodosPage.tsx","utf8");
const announcements=read("src/runtime/modules/AnnouncementsPage.tsx","utf8");
const bell=read("src/runtime/modules/NotificationBell.tsx","utf8");
const modules=read("shared/modules.ts","utf8");
const schema=read("migrations/0059_home_hub.sql","utf8");
test("home is login default and CY brand always navigates to guarded home",()=>{
 assert.match(app,/return routes\.has\(value\) \? value : "home"/);
 assert.match(app,/window\.location\.hash = "#home"/);
 assert.match(app,/onHome=\{\(\)=>navigate\("home"\)\}/);
 assert.match(shell,/cy-shell-brand-home/);
 assert.doesNotMatch(shell,/cy-shell-mobile-home/); // phone topbar has no CY mark; home is the drawer brand (user 2026-11-10)
 assert.match(app,/pendingRecordHash\.current=href/);
 assert.match(app,/guardedNavigation\.request\(target,"link"\)/);
});
test("all authenticated users have home, private todos, separate notice tabs",()=>{
 assert.match(app,/home:\{title:"首頁"\}/);
 assert.match(app,/announcements:\{title:"公告與通知"\}/);
 assert.match(app,/my-todos/);
 assert.match(todos,/getTodos\(kind\)/);
 assert.match(todos,/saveTodo\(/);
 assert.match(todos,/useUnsavedChangesGuard/);
 assert.match(home,/onNavigate\("my-todos",\{new:1\}\)/);
 assert.doesNotMatch(home,/<Dialog/);
 assert.match(home,/aria-label="公司公告"/);
 assert.match(home,/aria-label="個人通知"/);
});
test("publishing rights are independent and worker verifies them server side",()=>{
 assert.match(modules,/ANNOUNCEMENT_PUBLISH/);
 assert.match(modules,/PERSONAL_NOTICE_SEND/);
 assert.match(server,/checkModuleAccess\(db,principal,code\)/);
 assert.match(server,/if\(!await permission\(db,principal,kind\)\)/);
 assert.match(announcements,/canPublishCompany/);
 assert.match(announcements,/canSendPersonal/);
 assert.match(schema,/CREATE TABLE hub_notice_recipients/);
 assert.match(server,/r\.member_id=\?/);
 assert.match(server,/member_id=\?/);
});
test("one bell lists first five, then keyset pages of ten; reading requires opening notice",()=>{
 assert.match(bell,/getHubReminders\(undefined,5\)/);
 assert.match(bell,/getHubReminders\(page\.nextCursor,10\)/);
 assert.match(bell,/total>9\?"9\+":total/);
 assert.match(bell,/onNavigate\("announcements"/);
 assert.doesNotMatch(bell,/markNoticeRead\(/);
 assert.match(announcements,/markNoticeRead\(/);
 assert.match(server,/ORDER BY tier ASC,sort_at DESC,item_id DESC LIMIT \?/);
});

test("same-route bell links also focus the requested record without losing drafts",()=>{
 assert.match(app,/if\(target===route\)/);
 assert.match(app,/void canLeave\(\)\.then\(allowed/);
 assert.match(todos,/window\.addEventListener\("hashchange",sync\)/);
 assert.match(announcements,/window\.addEventListener\("hashchange",sync\)/);
});
