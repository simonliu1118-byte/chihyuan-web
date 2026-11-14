import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
async function compiled(path){const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))}
const {calculateItemMargin}=await compiled('worker/item/item-margin-service.ts');
const {handleBusinessApiRoute}=await compiled('worker/http/business-api-routes.ts');
const {ItemService}=await compiled('worker/item/item-service.ts');
const {ItemPersistence}=await compiled('worker/item/item-persistence.ts');
const {normalizeUpdateItemRequest}=await compiled('worker/item/item-validation.ts');
const backup=await compiled('worker/backup/portable-backup.ts');
const input={itemNo:'TEST-MARGIN',name:'合成商品',baseUnit:'個',cost:'100',costTaxMode:'exclusive',storePrice:'210',clinicPrice:'180',
 wholesalePrices:[{unit:'個',price:'160',sortOrder:0},{unit:'盒',price:'1260',sortOrder:1}],onlinePrices:[{platformId:1,price:'220'}],
 unitConversions:[{fromUnit:'盒',quantity:'6',toUnit:'個',sortOrder:0}]};
const item={...input,id:1,revision:1,unitConversions:input.unitConversions};
const now='2026-11-14T04:00:00Z',context={actorMemberId:1,now};

test('three tax modes separate payment and net cost; channel and unit interpretations use exact fractions',()=>{
 for(const [mode,payment,tax,cost] of [['inclusive','100.00','4.76','95.24'],['exclusive','105.00','5.00','100.00'],['no_tax','100.00','0.00','100.00']]){
  const result=calculateItemMargin({...item,costTaxMode:mode});assert.equal(result.payment,payment);assert.equal(result.inputTax,tax);assert.equal(result.netCost,cost);
 }
 const r=calculateItemMargin(item);assert.equal(r.rows[0].inclusive.grossMarginPercent,'50.00');assert.equal(r.rows[0].exclusive,null);
 assert.equal(r.rows[1].exclusive.grossMarginPercent,'44.44');assert.equal(r.rows[1].inclusive.grossMarginPercent,'41.67');
 assert.equal(r.rows[2].exclusive.grossMarginPercent,'37.50');assert.equal(r.rows[2].inclusive.grossMarginPercent,'34.38');
 assert.equal(r.rows[3].netCost,'600.00');assert.equal(r.rows[3].exclusive.grossMarginPercent,'52.38');assert.equal(r.rows[3].inclusive.grossMarginPercent,'50.00');
 assert.equal(r.rows.some(row=>row.channel==='online'),false);
 const exact=calculateItemMargin({...item,costTaxMode:'inclusive',storePrice:'100'});assert.equal(exact.rows[0].inclusive.grossProfit,'0.00');
});
test('missing data is local to the row, legacy chained conversions work, zero and negative remain meaningful',()=>{
 assert.equal(calculateItemMargin({...item,costTaxMode:null}).rows[0].inclusive,null);
 assert.equal(calculateItemMargin({...item,cost:null}).costStatus,'待補成本');
 const missingWholesale=calculateItemMargin({...item,wholesalePrices:[]});assert.equal(missingWholesale.rows[2].status,'未設定售價');
 const empty=calculateItemMargin({...item,storePrice:null});assert.equal(empty.rows[0].status,'未設定售價');assert.ok(empty.rows[1].inclusive);
 const noPath=calculateItemMargin({...item,unitConversions:[]});assert.equal(noPath.rows[3].status,'待補單位換算');assert.ok(noPath.rows[0].inclusive);
 const chain=calculateItemMargin({...item,unitConversions:[{fromUnit:'盒',quantity:'2',toUnit:'袋'},{fromUnit:'袋',quantity:'3',toUnit:'個'}]});assert.equal(chain.rows[3].netCost,'600.00');
 const zero=calculateItemMargin({...item,storePrice:'0'}).rows[0].inclusive;assert.equal(zero.grossProfit,'-100.00');assert.equal(zero.grossMarginPercent,null);assert.equal(zero.negative,true);
 assert.equal(calculateItemMargin({...item,cost:'0'}).rows[0].inclusive.grossMarginPercent,'100.00');
 assert.equal(calculateItemMargin({...item,storePrice:'52.5'}).rows[0].inclusive.grossMarginPercent,'-100.00');
});

test('item API requires tax, reads only saved prices, enforces permissions and keeps atomic revision/audit',async()=>{
 const f=botCenterFixture();try{
 const call=async(path,method='GET',json,cookie=true)=>{
  const response=await handleBusinessApiRoute(new Request('https://test.invalid/api/business/items'+path,{method,headers:{...(cookie?{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64)}:{}),'content-type':'application/json'},body:json===undefined?undefined:JSON.stringify(json)}),f.env,'margin-test');
  return {status:response.status,body:await response.json()};
 };
 for(const mode of [undefined,null,'none',''])assert.equal((await call('','POST',{...input,costTaxMode:mode})).status,422);
 const create=await call('','POST',input);assert.equal(create.status,201);const id=create.body.data.id;
 const r=await call('/'+id+'/margin?cost=0&storePrice=999');assert.equal(r.status,200);assert.equal(r.body.data.rows[0].inclusive.grossMarginPercent,'50.00');
 assert.equal((await call('/'+id+'/margin','GET',undefined,false)).status,401);
 const before=f.sql.prepare('SELECT * FROM items').all();await call('/'+id+'/margin');assert.deepEqual(f.sql.prepare('SELECT * FROM items').all(),before);
 assert.equal((await call('/'+id,'PATCH',{...input,costTaxMode:'no_tax',cost:'105',expectedRevision:1})).status,200);
 assert.equal((await call('/'+id,'PATCH',{...input,expectedRevision:1})).status,409);
 const stale=normalizeUpdateItemRequest({...input,cost:'999',expectedRevision:1,onlinePrices:[]});
 assert.equal(await new ItemPersistence(f.db).update(id,stale,context),false);
 assert.equal(f.sql.prepare('SELECT cost FROM items').get().cost,1050000);
 assert.equal(f.sql.prepare('SELECT price FROM item_online_prices').get().price,2200000);
 assert.ok(f.sql.prepare("SELECT before_json,after_json FROM audit_events WHERE after_json LIKE '%no_tax%'").get());
 }finally{f.sql.close()}
 const denied=botCenterFixture('USER',false);try{
 denied.sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at,updated_by) VALUES(1,'DEFECTS',1,?,1)").run(now);
 const response=await handleBusinessApiRoute(new Request('https://test.invalid/api/business/items/1/margin',{headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64)}}),denied.env,'denied');assert.equal(response.status,403);
 }finally{denied.sql.close()}
});

test('0069 preserves references, prices, triggers, and explicit taxes; old none becomes pending',()=>{
 const sql=new DatabaseSync(':memory:');try{
 sql.exec('PRAGMA foreign_keys=ON');const files=readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort();
 for(const file of files.filter(x=>x<'0069'))sql.exec(readFileSync('migrations/'+file,'utf8'));
 sql.exec("INSERT INTO items(id,item_no,name,base_unit,cost,cost_tax_mode,store_price,created_at,updated_at) VALUES(1,'A','合成','個',1000000,'none',2100000,'t','t'),(2,'B','明確','個',1000000,'inclusive',2100000,'t','t')");
 sql.exec("INSERT INTO item_unit_conversions(item_id,from_unit,quantity,to_unit) VALUES(1,'盒',60000,'個'); INSERT INTO item_wholesale_prices(item_id,unit,price) VALUES(1,'盒',12600000); INSERT INTO item_online_prices(item_id,platform_id,price) VALUES(1,1,2200000)");
 const tables=['item_unit_conversions','item_wholesale_prices','item_online_prices'];const rows=tables.map(t=>sql.prepare('SELECT * FROM '+t).all());
 const structures=sql.prepare("SELECT name FROM sqlite_schema WHERE type IN ('index','trigger') ORDER BY name").all();
 sql.exec(readFileSync('migrations/0069_item_cost_tax_modes.sql','utf8'));
 assert.equal(sql.prepare('SELECT cost_tax_mode FROM items WHERE id=1').get().cost_tax_mode,null);assert.equal(sql.prepare('SELECT cost_tax_mode FROM items WHERE id=2').get().cost_tax_mode,'inclusive');
 for(const [i,t]of tables.entries())assert.deepEqual(sql.prepare('SELECT * FROM '+t).all(),rows[i]);
 assert.deepEqual(sql.prepare("SELECT name FROM sqlite_schema WHERE type IN ('index','trigger') ORDER BY name").all(),structures);
 assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.throws(()=>sql.exec("UPDATE items SET cost_tax_mode='none'"),/CHECK/);sql.exec("UPDATE items SET cost_tax_mode='no_tax' WHERE id=1");
 }finally{sql.close()}
});

test('old backup none restores as pending, new no_tax roundtrips without changing any price',async()=>{
 const source=botCenterFixture(),target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false}),oldTarget=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});
 try{
 await new ItemService(source.db).create({...input,costTaxMode:'no_tax'},context);
 const bundle=await backup.exportPortableBackup(source.db,{workspaceScope:'synthetic',appVersion:'0.19.0'});
 await backup.restoreIntoEmptyDatabase(target.db,bundle,'synthetic');assert.equal(target.sql.prepare('SELECT cost_tax_mode FROM items').get().cost_tax_mode,'no_tax');
 const manifest=JSON.parse(Buffer.from(bundle.manifestBytes)),data=JSON.parse(Buffer.from(bundle.dataBytes));manifest.schemaMigration='0068_bot_revisions';
 const col=data.tables.items.columns.indexOf('cost_tax_mode');data.tables.items.rows[0][col]='none';const bytes=Buffer.from(JSON.stringify(data));
 manifest.dataByteLength=bytes.length;manifest.dataSha256=createHash('sha256').update(bytes).digest('hex');
 await backup.restoreIntoEmptyDatabase(oldTarget.db,{manifestBytes:Buffer.from(JSON.stringify(manifest)),dataBytes:bytes},'synthetic');
 assert.equal(oldTarget.sql.prepare('SELECT cost_tax_mode FROM items').get().cost_tax_mode,null);
 assert.deepEqual(oldTarget.sql.prepare('SELECT * FROM item_online_prices').all(),source.sql.prepare('SELECT * FROM item_online_prices').all());
 }finally{source.sql.close();target.sql.close();oldTarget.sql.close()}
});
