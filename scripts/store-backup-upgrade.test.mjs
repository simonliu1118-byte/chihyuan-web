import test from 'node:test';

import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['worker/backup/portable-backup.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {exportPortableBackup,verifyPortableBackup,restoreIntoEmptyDatabase}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const migrations=readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
function connection(legacy=false,preMonthly=false,preProgress=false,preSequence=false,preUnorderable=false,preBlacklist=false,preOrderWorkflow=false,preLifecycle=false,preNoHold=false,preContactIndex=false,preRepairs=false,prePhotos=false,preItemIndex=false){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of migrations.filter(f=>legacy?f<'0033':preMonthly?f<'0034':preProgress?f<'0035':preSequence?f<'0036':preNoHold?f<'0041':preContactIndex?f<'0042':preRepairs?f<'0043':prePhotos?f<'0044':preItemIndex?f<'0045':preLifecycle?f<'0040':preOrderWorkflow?f<'0039':preBlacklist?f<'0038':!preUnorderable||f<'0037'))sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));const db={prepare(query){const statement=sql.prepare(query);let params=[];const execute=()=>({results:statement.all(...params),meta:{changes:sql.prepare('SELECT changes() n').get().n}});return {bind(...p){params=p;return this},execute,async first(){return execute().results[0]??null},async all(){return execute()},async run(){return execute()}}},async batch(stmts){sql.exec('BEGIN');try{const out=stmts.map(s=>s.execute());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};return {sql,db}}
const now='2026-10-28T10:00:00Z';
function seed(sql){sql.prepare("INSERT INTO app_members(id,identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(1,'synthetic-store','9999','測試人員',1,?,?)").run(now,now);
 sql.prepare("INSERT INTO store_customer_orders(id,order_date,customer_name,phone,line_name,deposit,note,status,notified_at,version,created_at,created_by,updated_at,updated_by) VALUES(7,'2026-10-28','合成顧客','0912345678','測試LINE',20,'保留備註','NOTIFIED',?,4,?,1,?,1)").run(now,now,now);
 sql.prepare("INSERT INTO store_customer_order_lines(id,order_id,sort_order,item_code,item_name,quantity,unit_price) VALUES(19,7,10,'SYN001','合成品項',2,30)").run();
 sql.prepare("INSERT INTO store_blacklist(id,name,phone,reason,action,created_at,created_by,updated_at,updated_by) VALUES(8,'合成顧客乙','071234567','保留理由','FULL_PAYMENT',?,1,?,1)").run(now,now);
}
const schemaQuery="SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name != 'd1_migrations' AND tbl_name != 'program_catalog_state' AND tbl_name NOT GLOB 'sqlite_*' AND tbl_name NOT GLOB '_cf_*' ORDER BY type, name";
const sha=v=>createHash('sha256').update(v).digest('hex');
function legacyBundle(sql,workflow=false,withMonthly=false){const columnsSource=readFileSync(new URL('../worker/backup/schema-columns.ts',import.meta.url),'utf8');const columns=JSON.parse(columnsSource.split(' = ')[1].trim().replace(/;$/,''));const tables={};for(const t of Object.keys(columns).filter(t=>sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)&&(workflow||t!=='store_order_events'&&t!=='store_blacklist_events')&&(withMonthly||!t.startsWith('store_monthly_')))){const cols=sql.prepare(`pragma table_info(${t})`).all().map(c=>c.name).sort();tables[t]={columns:cols,rows:sql.prepare(`SELECT ${cols.map(c=>'"'+c+'"').join(',')} FROM "${t}"`).all().map(r=>cols.map(c=>r[c]))}}
 const dataBytes=Buffer.from(JSON.stringify({tables}));const manifest={format:'CYBackupSet',formatVersion:1,backupId:'00000000-0000-4000-8000-000000000001',appId:'cyweb',appVersion:'0.9.56',schemaVersion:'0007_retired_entity_ids',schemaSha256:sha(JSON.stringify(sql.prepare(schemaQuery).all())),createdAtUtc:'2026-10-28T10:00:00.000Z',sourceDatabaseEngine:'d1',workspaceScope:'synthetic',recordCounts:Object.fromEntries(Object.entries(tables).map(([t,d])=>[t,d.rows.length])),totalRecordCount:Object.values(tables).reduce((n,d)=>n+d.rows.length,0),dataObjectName:'data.json',dataSha256:sha(dataBytes),dataByteLength:dataBytes.length};return {manifestBytes:Buffer.from(JSON.stringify(manifest)),dataBytes};}

test('0035 migration and exact pre-progress backup upgrade remove arrival while preserving IDs, notification and events',async()=>{
 const source=connection(false,false,true),target=connection();try{seed(source.sql);
 source.sql.exec("UPDATE store_customer_orders SET status='ARRIVED',arrived_date='2026-10-28',ordered_date='2026-10-28',has_ever_ordered=1;INSERT INTO store_order_events(order_id,actor,at,kind,before_json,after_json,reason,request_key) VALUES(7,1,'2026-10-28T10:00:00Z','推進','{}','{\"status\":\"ARRIVED\"}','','pre-progress-event')");
 const bundle=legacyBundle(source.sql,true,true);await verifyPortableBackup(bundle,'synthetic');await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
 source.sql.exec(readFileSync(new URL('../migrations/0035_store_contact_progress.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0036_store_order_list_sequence.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0038_store_blacklist_joined_date.sql',import.meta.url),'utf8'));if(!source.sql.prepare('pragma table_info(store_blacklist)').all().some(c=>c.name==='joined_date'))source.sql.exec(readFileSync(new URL('../migrations/0038_store_blacklist_joined_date.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0039_store_notification_contacts_prices.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0040_store_blacklist_lifecycle.sql',import.meta.url),'utf8'));
 const order=target.sql.prepare('SELECT * FROM store_customer_orders').get();assert.equal(order.status,'ORDERED');assert.equal(order.call_result,'ORDERED');assert.equal(order.honorific,'');assert(!('arrived_date' in order));
 for(const table of ['store_customer_orders','store_customer_order_lines','store_order_events','store_blacklist'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table).all(),source.sql.prepare('SELECT * FROM '+table).all());
 assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close();target.sql.close()}
});
test('0033 preserves legacy parent/child IDs, money, contacts and notification date with foreign keys enabled',()=>{const f=connection(true);try{seed(f.sql);const before=f.sql.prepare('SELECT * FROM store_customer_order_lines').all();f.sql.exec(readFileSync(new URL('../migrations/0033_store_order_workflow.sql',import.meta.url),'utf8'));assert.deepEqual(f.sql.prepare('SELECT * FROM store_customer_order_lines').all(),before);const o=f.sql.prepare('SELECT * FROM store_customer_orders WHERE id=7').get();assert.equal(o.status,'NOTIFIED');assert.equal(o.has_ever_ordered,1);assert.equal(o.legacy,1);assert.equal(o.notified_date,'2026-10-28');assert.equal(o.ordered_date,null);assert.equal(o.deposit,20);assert.equal(o.version,4);assert.equal(o.phone,'0912345678');assert.equal(f.sql.prepare('SELECT reason FROM store_blacklist').get().reason,'保留理由');assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{f.sql.close()}});
test('current portable backup restores order and blacklist events with exact byte reconciliation',async()=>{const source=connection(),target=connection();try{seed(source.sql);source.sql.exec("INSERT INTO store_order_events(order_id,actor,at,kind,before_json,after_json,reason,request_key) VALUES(7,1,'2026-10-28T10:00:00Z','取消','{}','{}','顧客取消','synthetic-key'); INSERT INTO store_blacklist_events(blacklist_id,order_id,actor,at,reason,summary_json) VALUES(8,7,1,'2026-10-28T10:00:00Z','顧客取消','{}')");const bundle=await exportPortableBackup(source.db,{workspaceScope:'synthetic',appVersion:'0.9.57'});await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');assert.equal(target.sql.prepare('SELECT count(*) n FROM store_order_events').get().n,1);assert.equal(target.sql.prepare('SELECT count(*) n FROM store_blacklist_events').get().n,1);assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{source.sql.close();target.sql.close()}});
test('exact pre-0033 backup verifies and upgrades into empty current recovery target without inventing history',async()=>{const source=connection(true),target=connection();try{seed(source.sql);const bundle=legacyBundle(source.sql);await verifyPortableBackup(bundle,'synthetic');await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');const o=target.sql.prepare('SELECT * FROM store_customer_orders').get();assert.equal(o.id,7);assert.equal(o.has_ever_ordered,1);assert.equal(o.notified_date,'2026-10-28');assert.equal(o.ordered_date,null);assert.equal(o.legacy,1);assert.equal(target.sql.prepare('SELECT id FROM store_customer_order_lines').get().id,19);assert.equal(target.sql.prepare('SELECT count(*) n FROM store_order_events').get().n,0);assert.equal(target.sql.prepare('SELECT action FROM store_blacklist').get().action,'FULL_PAYMENT')}finally{source.sql.close();target.sql.close()}});
test('legacy backup upgrade never bypasses scope, integrity or nonempty-target guards',async()=>{const source=connection(true),target=connection();try{seed(source.sql);const bundle=legacyBundle(source.sql);await assert.rejects(()=>restoreIntoEmptyDatabase(target.db,bundle,'foreign'),/SCOPE/);const changed={...bundle,dataBytes:Buffer.from('{}')};await assert.rejects(()=>verifyPortableBackup(changed,'synthetic'),/INTEGRITY/);seed(target.sql);await assert.rejects(()=>restoreIntoEmptyDatabase(target.db,bundle,'synthetic'),/NOT_EMPTY/);assert.equal(target.sql.prepare('SELECT count(*) n FROM store_customer_orders').get().n,1)}finally{source.sql.close();target.sql.close()}});
test('exact pre-monthly backup restores unchanged business data and empty monthly tables',async()=>{const source=connection(false,true),target=connection();try{seed(source.sql);const oldOrder=source.sql.prepare('SELECT * FROM store_customer_orders').get(),bundle=legacyBundle(source.sql,true);await verifyPortableBackup(bundle,'synthetic');await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');const migrated=target.sql.prepare('SELECT * FROM store_customer_orders').get();for(const [k,v] of Object.entries(oldOrder))if(!['arrived_date','phone','mobile'].includes(k))assert.equal(migrated[k],v);assert.equal(migrated.mobile,oldOrder.phone);assert.equal(migrated.phone,'');assert.equal(migrated.honorific,'');assert.equal(migrated.call_result,'ORDERED');assert(!('arrived_date' in migrated));for(const t of ['store_monthly_settings','store_monthly_rows','store_monthly_cells','store_monthly_events'])assert.equal(target.sql.prepare('SELECT COUNT(*) n FROM '+t).get().n,0);assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{source.sql.close();target.sql.close()}});
test('monthly settings, applicable cells, no-date completion and events survive portable restore',async()=>{const source=connection(),target=connection();try{seed(source.sql);const stores=[{id:'s1',name:'合成門市',periods:[{from:'2026-10'}]}],items=[{id:'i1',name:'水費',periods:[{from:'2026-10'}],stores:{s1:[{from:'2026-10'}]}}];source.sql.prepare("INSERT INTO store_monthly_settings VALUES(1,1,'2026-10','2026-10',?,?,?,1)").run(JSON.stringify(stores),JSON.stringify(items),now);source.sql.prepare("INSERT INTO store_monthly_rows VALUES('2026-10:s1','2026-10','s1','合成門市',0,?)").run(now);source.sql.prepare("INSERT INTO store_monthly_cells VALUES('2026-10:s1','i1',2,1,NULL,?,1)").run(now);source.sql.prepare("INSERT INTO store_monthly_events(row_id,item_id,actor,at,kind,before_json,after_json,request_key,request_hash) VALUES('2026-10:s1','i1',1,?,'確認辦理','{}','{\"completed\":true}','test-monthly-key','test-hash')").run(now);const bundle=await exportPortableBackup(source.db,{workspaceScope:'synthetic',appVersion:'0.9.58'});await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');for(const t of ['store_monthly_settings','store_monthly_rows','store_monthly_cells','store_monthly_events'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+t).all(),source.sql.prepare('SELECT * FROM '+t).all());assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{source.sql.close();target.sql.close()}});

test('exact pre-0036 backup adds persisted numbering identically to the migration while preserving existing contacts and supply results',async()=>{
 const source=connection(false,false,false,true),target=connection();try{seed(source.sql);source.sql.exec("UPDATE store_customer_orders SET honorific='MS',call_result='OUT_OF_STOCK'");
 const bundle=legacyBundle(source.sql,true,true);await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');source.sql.exec(readFileSync(new URL('../migrations/0036_store_order_list_sequence.sql',import.meta.url),'utf8'));if(!source.sql.prepare('pragma table_info(store_blacklist)').all().some(c=>c.name==='joined_date'))source.sql.exec(readFileSync(new URL('../migrations/0038_store_blacklist_joined_date.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0039_store_notification_contacts_prices.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0040_store_blacklist_lifecycle.sql',import.meta.url),'utf8'));
 assert.deepEqual(target.sql.prepare('SELECT * FROM store_customer_orders').all(),source.sql.prepare('SELECT * FROM store_customer_orders').all());assert.equal(target.sql.prepare('SELECT list_sequence FROM store_customer_orders').get().list_sequence,1);
 }finally{source.sql.close();target.sql.close()}
});

test('0037 and exact pre-unorderable backup preserve every parent, line and event ID while widening only the supply result',async()=>{
 const source=connection(false,false,false,false,true),target=connection();try{seed(source.sql);source.sql.exec("INSERT INTO store_order_events(id,order_id,actor,at,kind,before_json,after_json,reason,request_key) VALUES(42,7,1,'2026-10-28T10:00:00Z','建立','{}','{}','','preserve-event');INSERT INTO store_blacklist_events(id,blacklist_id,order_id,actor,at,reason,summary_json) VALUES(52,8,7,1,'2026-10-28T10:00:00Z','保留','{}')");
 const bundle=legacyBundle(source.sql,true,true);await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');assert.throws(()=>source.sql.exec("UPDATE store_customer_orders SET call_result='UNORDERABLE'"),/CHECK/);source.sql.exec(readFileSync(new URL('../migrations/0037_store_unorderable_result.sql',import.meta.url),'utf8'));if(!source.sql.prepare('pragma table_info(store_blacklist)').all().some(c=>c.name==='joined_date'))source.sql.exec(readFileSync(new URL('../migrations/0038_store_blacklist_joined_date.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0039_store_notification_contacts_prices.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0040_store_blacklist_lifecycle.sql',import.meta.url),'utf8'));
 for(const table of ['store_customer_orders','store_customer_order_lines','store_order_events','store_blacklist_events'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table).all(),source.sql.prepare('SELECT * FROM '+table).all());source.sql.exec("UPDATE store_customer_orders SET call_result='UNORDERABLE'");assert.deepEqual(source.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close();target.sql.close()}
});

test('0037 stops an oversized installation before replacing any live table',()=>{
 const source=connection(false,false,false,false,true);try{seed(source.sql);const put=source.sql.prepare("INSERT INTO store_order_events(order_id,actor,at,kind,before_json,after_json,request_key) VALUES(7,1,?,'建立','{}','{}',?)");source.sql.exec('BEGIN');for(let i=0;i<5001;i++)put.run(now,'bounded-'+i);source.sql.exec('COMMIT');assert.throws(()=>source.sql.exec(readFileSync(new URL('../migrations/0037_store_unorderable_result.sql',import.meta.url),'utf8')),/malformed JSON/);assert.equal(source.sql.prepare('SELECT count(*) n FROM store_order_events').get().n,5001);assert.equal(source.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE '%_v60'").get().n,0);assert.deepEqual(source.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close()}
});

test('0038 and exact pre-blacklist-date backup agree on Taipei date, punctuation and preserved records',async()=>{
 const source=connection(false,false,false,false,false,true),target=connection();try{seed(source.sql);source.sql.exec("UPDATE store_blacklist SET created_at='2026-04-24T18:00:00Z',reason='訂購,顧客取消'");const bundle=legacyBundle(source.sql,true,true);await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');source.sql.exec(readFileSync(new URL('../migrations/0038_store_blacklist_joined_date.sql',import.meta.url),'utf8'));if(!source.sql.prepare('pragma table_info(store_blacklist)').all().some(c=>c.name==='joined_date'))source.sql.exec(readFileSync(new URL('../migrations/0038_store_blacklist_joined_date.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0039_store_notification_contacts_prices.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0040_store_blacklist_lifecycle.sql',import.meta.url),'utf8'));assert.deepEqual(target.sql.prepare('SELECT * FROM store_blacklist').all(),source.sql.prepare('SELECT * FROM store_blacklist').all());const b=target.sql.prepare('SELECT * FROM store_blacklist').get();assert.equal(b.joined_date,'2026-04-25');assert.equal(b.reason,'訂購，顧客取消');assert.equal(b.action_detail,'');assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{source.sql.close();target.sql.close()}
});

test('0039 and exact pre-workflow backup preserve contacts and immutable events while adding pending-price and metadata defaults',async()=>{
 const source=connection(false,false,false,false,false,false,true),target=connection();try{seed(source.sql);source.sql.exec("UPDATE store_customer_orders SET phone='0912345678',mobile='',status='PICKED_UP';UPDATE store_blacklist SET phone='072368520',mobile='';INSERT INTO store_order_events(order_id,actor,at,kind,before_json,after_json,reason,request_key) VALUES(7,1,'2026-04-24T18:00:00Z','修改訂購','{\"phone\":\"0912345678\"}','{}','','contact-history')");const bundle=legacyBundle(source.sql,true,true);await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');if(!source.sql.prepare('pragma table_info(store_blacklist)').all().some(c=>c.name==='joined_date'))source.sql.exec(readFileSync(new URL('../migrations/0038_store_blacklist_joined_date.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0039_store_notification_contacts_prices.sql',import.meta.url),'utf8'));source.sql.exec(readFileSync(new URL('../migrations/0040_store_blacklist_lifecycle.sql',import.meta.url),'utf8'));for(const t of ['store_customer_orders','store_customer_order_lines','store_blacklist','store_order_events'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+t).all(),source.sql.prepare('SELECT * FROM '+t).all());const o=target.sql.prepare('SELECT * FROM store_customer_orders').get();assert.equal(o.mobile,'0912345678');assert.equal(o.phone,'');assert.equal(o.closed_at,null);assert.equal(target.sql.prepare('SELECT price_pending FROM store_customer_order_lines').get().price_pending,0);assert.equal(target.sql.prepare('SELECT before_json FROM store_order_events').get().before_json,'{\"phone\":\"0912345678\"}');assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close();target.sql.close()}
});

test('0040 and exact pre-lifecycle backup retain removed entries and copy cancellation events verbatim into paged history',async()=>{
 const source=connection(false,false,false,false,false,false,false,true),target=connection();try{seed(source.sql);source.sql.exec("UPDATE store_blacklist SET active=0;INSERT INTO store_blacklist_events(id,blacklist_id,order_id,actor,at,reason,summary_json) VALUES(51,8,7,1,'2026-10-28T10:00:00Z','舊理由','{  \"orderDate\": \"2026-10-28\" }')");const bundle=legacyBundle(source.sql,true,true);await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');source.sql.exec(readFileSync(new URL('../migrations/0040_store_blacklist_lifecycle.sql',import.meta.url),'utf8'));
 for(const t of ['store_blacklist','store_blacklist_events','store_blacklist_operations'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+t).all(),source.sql.prepare('SELECT * FROM '+t).all());assert.equal(target.sql.prepare('SELECT active FROM store_blacklist').get().active,0);assert.equal(target.sql.prepare('SELECT after_json FROM store_blacklist_operations').get().after_json,target.sql.prepare('SELECT summary_json FROM store_blacklist_events').get().summary_json);assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close();target.sql.close()}
});

test('0040 stops before DDL when lifecycle copy exceeds the bounded budget',()=>{const f=connection(false,false,false,false,false,false,false,true);try{seed(f.sql);const put=f.sql.prepare("INSERT INTO store_blacklist(name,phone,reason,action,created_at,created_by,updated_at,updated_by) VALUES('合成界限','071234567','保留','OTHER',?,1,'2026-10-28T10:00:00Z',1)");f.sql.exec('BEGIN');for(let i=0;i<5000;i++)put.run(now);f.sql.exec('COMMIT');assert.throws(()=>f.sql.exec(readFileSync(new URL('../migrations/0040_store_blacklist_lifecycle.sql',import.meta.url),'utf8')),/malformed JSON/);assert(!f.sql.prepare('pragma table_info(store_blacklist)').all().some(c=>c.name==='activation_at'));assert.equal(f.sql.prepare('SELECT count(*) n FROM store_blacklist').get().n,5001)}finally{f.sql.close()}});

test('0041 and pre-no-hold backup preserve all blacklist parents and linked immutable snapshots',async()=>{const source=connection(false,false,false,false,false,false,false,false,true),target=connection();try{seed(source.sql);source.sql.exec("INSERT INTO store_blacklist_events(id,blacklist_id,order_id,actor,at,reason,summary_json) VALUES(51,8,7,1,'2026-10-28T10:00:00Z','原理由','{  \"preserve\": true }');INSERT INTO store_blacklist_operations(id,blacklist_id,source_order_id,actor,at,kind,after_json,legacy_event_id) VALUES(61,8,7,1,'2026-10-28T10:00:00Z','訂購取消','{  \"preserve\": true }',51)");const bundle=await Promise.resolve(legacyBundle(source.sql,true,true));await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');source.sql.exec(readFileSync(new URL('../migrations/0041_store_blacklist_no_hold.sql',import.meta.url),'utf8'));for(const t of ['store_blacklist','store_blacklist_events','store_blacklist_operations'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+t).all(),source.sql.prepare('SELECT * FROM '+t).all());target.sql.exec("UPDATE store_blacklist SET action='NO_HOLD'");assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[])}finally{source.sql.close();target.sql.close()}});

test('0041 refuses an oversized source before touching original tables or snapshots',()=>{const f=connection(false,false,false,false,false,false,false,false,true);try{seed(f.sql);const put=f.sql.prepare("INSERT INTO store_blacklist_operations(blacklist_id,actor,at,kind) VALUES(8,1,'2026-10-28T10:00:00Z','原紀錄')");f.sql.exec('BEGIN');for(let i=0;i<5000;i++)put.run();f.sql.exec('COMMIT');assert.throws(()=>f.sql.exec(readFileSync(new URL('../migrations/0041_store_blacklist_no_hold.sql',import.meta.url),'utf8')),/malformed JSON/);assert.equal(f.sql.prepare('SELECT count(*) n FROM store_blacklist_operations').get().n,5000);assert.equal(f.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE '%_action_upgrade'").get().n,0);assert.throws(()=>f.sql.exec("UPDATE store_blacklist SET action='NO_HOLD'"),/CHECK/)}finally{f.sql.close()}});

test('0042 contact indexes: a backup taken before them restores unchanged into the indexed schema',async()=>{const source=connection(false,false,false,false,false,false,false,false,false,true),target=connection();try{seed(source.sql);
 const bundle=await Promise.resolve(legacyBundle(source.sql,true,true));await verifyPortableBackup(bundle,'synthetic');await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
 for(const table of ['store_customer_orders','store_customer_order_lines','store_blacklist'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table).all(),source.sql.prepare('SELECT * FROM '+table).all());
 assert.ok(target.sql.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_store_blacklist_phone'").get());
}finally{source.sql.close();target.sql.close()}});

test('0043 fresh schema fingerprint for exact LF/CRLF verification',()=>{
 const f=connection(false,false,false,false,false,false,false,false,false,false,false,true);try{
  const hash=sha(JSON.stringify(f.sql.prepare(schemaQuery).all()));
  console.log('STORE_REPAIR_SCHEMA_FINGERPRINT='+hash);
  assert.equal(hash,'b3f9f2a9e256ca168a2811dafba00c69cdbcd030e91251b32b80a46910086b55');
  const crlf=new DatabaseSync(':memory:');try{
   crlf.exec('PRAGMA foreign_keys=ON');
   for(const filename of migrations.filter(f=>f<'0044'))crlf.exec(readFileSync(new URL('../migrations/'+filename,import.meta.url),'utf8').replace(/\r?\n/g,'\r\n'));
   const crlfHash=sha(JSON.stringify(crlf.prepare(schemaQuery).all()));
   assert.equal(crlfHash,'a7fc77a58c97ec29ef992b2c83a69cb1f0173371edf9399c2d417d1cb47494cc');
  }finally{crlf.close()}
  assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='store_repairs'").get().n,1);
 }finally{f.sql.close()}
});
test('0042 backup restores to 0043 with repair tables empty and original customer records intact',async()=>{
 const source=connection(false,false,false,false,false,false,false,false,false,false,true),target=connection();
 try{
  seed(source.sql);
  const bundle=await Promise.resolve(legacyBundle(source.sql,true,true));
  await verifyPortableBackup(bundle,'synthetic');
  await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
  for(const t of ['store_customer_orders','store_customer_order_lines','store_blacklist'])
   assert.deepEqual(target.sql.prepare('SELECT * FROM '+t).all(),source.sql.prepare('SELECT * FROM '+t).all());
  for(const t of ['store_repairs','store_repair_events'])assert.equal(target.sql.prepare('SELECT count(*) n FROM '+t).get().n,0);
  assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close();target.sql.close()}
});

test('0044 exact schema fingerprint LF and CRLF',()=>{
 const f=connection(false,false,false,false,false,false,false,false,false,false,false,false,true);try{
  const lf=sha(JSON.stringify(f.sql.prepare(schemaQuery).all()));
  const crlf=new DatabaseSync(':memory:');
  try{crlf.exec('PRAGMA foreign_keys=ON');for(const name of migrations.filter(f=>f<'0045'))crlf.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replace(/\r?\n/g,'\r\n'));
   assert.equal(lf,'a2ec97475e6a855df30d1964819d97f8a1735de8141e1bb7fc8685ce1862488b');
   assert.equal(sha(JSON.stringify(crlf.prepare(schemaQuery).all())),'8e2751fac3de1cfc294cd5039c61cd0d66f0cfb2ee2bc17139f517abe606f15b');
  }finally{crlf.close()}
 }finally{f.sql.close()}
});
test('0043 backup restores to 0044 retaining repairs; photos start empty',async()=>{
 const source=connection(false,false,false,false,false,false,false,false,false,false,false,true),target=connection();
 try{
  seed(source.sql);
  const bundle=legacyBundle(source.sql,true,true);
  await verifyPortableBackup(bundle,'synthetic');
  await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
  for(const table of ['store_customer_orders','store_customer_order_lines','store_repairs','store_repair_events'])
   assert.deepEqual(target.sql.prepare('SELECT * FROM '+table).all(),source.sql.prepare('SELECT * FROM '+table).all());
  assert.equal(target.sql.prepare('SELECT count(*) n FROM store_repair_photos').get().n,0);
 }finally{source.sql.close();target.sql.close()}
});

test('0045 schema index fingerprints and 0044 portable backup compatibility',async()=>{
 const current=connection(),old=connection(false,false,false,false,false,false,false,false,false,false,false,false,true);
 try{
  // Fingerprints of the 0045 chain (the last formatVersion 1 schema), whatever migrations follow.
  const at0045=new DatabaseSync(':memory:');for(const name of migrations.filter(f=>f<'0046'))at0045.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const hash=sha(JSON.stringify(at0045.prepare(schemaQuery).all()));at0045.close();
  const crlf=new DatabaseSync(':memory:');
  try{
   crlf.exec('PRAGMA foreign_keys=ON');
   for(const name of migrations.filter(f=>f<'0046'))crlf.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replace(/\r?\n/g,'\r\n'));
   assert.equal(hash,'e3f14b04ee560ddb43c98a2c31f2dcfb1c9710f81dd9161d018c1bd5506a1bab');
   assert.equal(sha(JSON.stringify(crlf.prepare(schemaQuery).all())),'ffd84deca22c432706918692fef76bfe050cda0598f2c6b0f2851f0c55d4e8ad');
  }finally{crlf.close()}
  assert.ok(current.sql.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_ordering_lines_item_code'").get());
  seed(old.sql);
  const bundle=legacyBundle(old.sql,true,true);
  await verifyPortableBackup(bundle,'synthetic');
  await restoreIntoEmptyDatabase(current.db,bundle,'synthetic');
  assert.deepEqual(current.sql.prepare('SELECT * FROM store_customer_orders').all(),old.sql.prepare('SELECT * FROM store_customer_orders').all());
 }finally{current.sql.close();old.sql.close()}
});
