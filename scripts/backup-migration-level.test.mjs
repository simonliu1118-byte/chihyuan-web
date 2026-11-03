// formatVersion 2 portable backups (V0.9.81): the manifest records the last migration, and a restore
// maps data by table and column name instead of matching a schema fingerprint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['worker/backup/portable-backup.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {exportPortableBackup,verifyPortableBackup,restoreIntoEmptyDatabase,CURRENT_MIGRATION}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const migrations=readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
function connection(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of migrations)sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const db={prepare(query){const statement=sql.prepare(query);let params=[];const execute=()=>({results:statement.all(...params),meta:{}});return {bind(...p){params=p;return this},execute,async first(){return execute().results[0]??null},async all(){return execute()},async run(){return execute()}}},async batch(stmts){sql.exec('BEGIN');try{const out=stmts.map(s=>s.execute());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};return {sql,db}}
const now='2026-11-03T10:00:00Z',scope={workspaceScope:'synthetic',appVersion:'0.9.80'};
function seed(sql){sql.prepare("INSERT INTO app_members(id,identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(1,'synthetic-store','9999','測試人員',1,?,?)").run(now,now);
 sql.prepare("INSERT INTO store_customer_orders(id,order_date,customer_name,phone,mobile,deposit,note,status,notification_attempts,version,created_at,created_by,updated_at,updated_by) VALUES(7,'2026-11-03','合成顧客','','0912345678',20,'保留備註','ORDERED',2,3,?,1,?,1)").run(now,now)}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Rewrites a bundle as if taken elsewhere; digest and counts follow the edit. */
function edited(bundle,edit){const manifest=JSON.parse(Buffer.from(bundle.manifestBytes)),data=JSON.parse(Buffer.from(bundle.dataBytes));edit(data,manifest);
 manifest.recordCounts=Object.fromEntries(Object.entries(data.tables).map(([t,d])=>[t,d.rows.length]));manifest.totalRecordCount=Object.values(data.tables).reduce((n,d)=>n+d.rows.length,0);
 const dataBytes=Buffer.from(JSON.stringify(data));manifest.dataSha256=sha(dataBytes);manifest.dataByteLength=dataBytes.length;return {manifestBytes:Buffer.from(JSON.stringify(manifest)),dataBytes}}
const dropColumn=(table,column)=>{const i=table.columns.indexOf(column);table.columns.splice(i,1);table.rows.forEach(r=>r.splice(i,1))};

test('CURRENT_MIGRATION is the last migration file, and a new backup records it',async()=>{
 assert.equal(CURRENT_MIGRATION+'.sql',migrations.at(-1),'bump CURRENT_MIGRATION in worker/backup/portable-backup.ts with every migration');
 const f=connection();try{const manifest=JSON.parse(Buffer.from((await exportPortableBackup(f.db,scope)).manifestBytes));
  assert.equal(manifest.formatVersion,2);assert.equal(manifest.schemaMigration,CURRENT_MIGRATION)}finally{f.sql.close()}
});

test('a backup from an earlier migration restores by name: a missing table starts empty, a missing column takes its default',async()=>{
 const source=connection(),target=connection();try{seed(source.sql);
  const older=edited(await exportPortableBackup(source.db,scope),(d,m)=>{m.schemaMigration='0043_store_repairs';delete d.tables.store_repair_photos;dropColumn(d.tables.store_customer_orders,'notification_attempts')});
  await verifyPortableBackup(older,'synthetic');await restoreIntoEmptyDatabase(target.db,older,'synthetic');
  const order=target.sql.prepare('SELECT * FROM store_customer_orders').get();
  assert.equal(order.notification_attempts,0,'the column default, as the migration gave existing rows');
  assert.equal(order.customer_name,'合成顧客');assert.equal(order.deposit,20);assert.equal(order.version,3);
  assert.equal(target.sql.prepare('SELECT count(*) n FROM store_repair_photos').get().n,0);
  assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close();target.sql.close()}
});

test('a backup is refused for a newer migration, a column or table the target lacks, or a missing table at the same migration',async()=>{
 const source=connection(),target=connection();try{seed(source.sql);const bundle=await exportPortableBackup(source.db,scope);
  await assert.rejects(()=>verifyPortableBackup(edited(bundle,(d,m)=>{m.schemaMigration='9999_future'}),'synthetic'),/SCHEMA_NEWER/);
  await assert.rejects(()=>verifyPortableBackup(edited(bundle,(d,m)=>{m.schemaMigration='not a migration'}),'synthetic'),/METADATA_INVALID/);
  await assert.rejects(()=>restoreIntoEmptyDatabase(target.db,edited(bundle,(d,m)=>{m.schemaMigration='0044_store_repair_photos';d.tables.store_customer_orders.columns[0]='unknown_column'}),'synthetic'),/COLUMNS_MISMATCH/);
  await assert.rejects(()=>restoreIntoEmptyDatabase(target.db,edited(bundle,(d,m)=>{m.schemaMigration='0044_store_repair_photos';d.tables.retired_table={columns:['id'],rows:[]}}),'synthetic'),/COVERAGE_MISMATCH/);
  await assert.rejects(()=>verifyPortableBackup(edited(bundle,d=>{delete d.tables.customers}),'synthetic'),/COVERAGE_MISMATCH/);
  assert.equal(target.sql.prepare('SELECT count(*) n FROM store_customer_orders').get().n,0,'nothing was written');
  await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
  assert.deepEqual(target.sql.prepare('SELECT * FROM store_customer_orders').all(),source.sql.prepare('SELECT * FROM store_customer_orders').all());
 }finally{source.sql.close();target.sql.close()}
});

test('a 0045 backup with customers.fax restores the fax as a FAX phone row (0046)',async()=>{
 const source=connection(),target=connection();try{seed(source.sql);
  source.sql.prepare("INSERT INTO customers(id,short_name,created_at,created_by,updated_at,updated_by,revision) VALUES(5,'合成客戶',?,1,?,1,1)").run(now,now);
  source.sql.prepare("INSERT INTO customer_phones(id,customer_id,phone_number,sort_order,created_at,updated_at,kind) VALUES(9,5,'0223456789',0,?,?,'PHONE')").run(now,now);
  const older=edited(await exportPortableBackup(source.db,scope),(d,m)=>{m.schemaMigration='0045_ordering_draft_item_index';
   const c=d.tables.customers;c.columns.push('fax');c.rows.forEach(r=>r.push('0223456790'));
   dropColumn(d.tables.customer_phones,'kind');dropColumn(d.tables.customer_visits,'subject')});
  await verifyPortableBackup(older,'synthetic');await restoreIntoEmptyDatabase(target.db,older,'synthetic');
  assert.deepEqual(target.sql.prepare('SELECT id,phone_number,kind FROM customer_phones WHERE customer_id=5 ORDER BY id').all().map(r=>({...r})),
   [{id:9,phone_number:'0223456789',kind:'PHONE'},{id:10,phone_number:'0223456790',kind:'FAX'}]);
  assert.deepEqual(target.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{source.sql.close();target.sql.close()}
});
