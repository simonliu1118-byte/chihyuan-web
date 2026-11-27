import test from "node:test";
import assert from "node:assert/strict";
import {checkRosterMigrationBackup} from "./check-roster-migration-backup.mjs";
test("roster migration gate verifies scoped recent catalog before remote mutation",async()=>{
 const now=new Date("2026-11-28T00:00:00Z"),calls=[];
 const query=async(sql,params)=>{calls.push([sql,params]);return calls.length===1?[{name:"0085_bot_patrol_status.sql"}]:[{verified:1}]};
 assert.equal(await checkRosterMigrationBackup(query,"synthetic",now),"verified-catalog");
 assert.deepEqual(calls[1][1],["synthetic","2026-11-26T00:00:00.000Z",now.toISOString()]);
 assert.match(calls[1][0],/c.status_code='verified'/);
});
test("roster migration gate fails closed without baseline or backup, skips after both migrations",async()=>{
 await assert.rejects(checkRosterMigrationBackup(async()=>[],"synthetic"),/BASELINE_REQUIRED/);
 await assert.rejects(checkRosterMigrationBackup(async(sql)=>sql.includes("d1_migrations")?[{name:"0085_bot_patrol_status.sql"}]:[{verified:0}],"synthetic"),/VERIFIED_BACKUP_REQUIRED/);
 assert.equal(await checkRosterMigrationBackup(async()=>[{name:"0086_hr_holiday_note.sql"},{name:"0087_hr_roster_text.sql"}],"synthetic"),"already-applied");
});
