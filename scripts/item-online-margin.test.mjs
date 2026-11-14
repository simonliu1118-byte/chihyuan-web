import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
async function compiled(path){const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))}
const {onlineMargins,couponRatio}=await compiled('worker/item/item-online-margin.ts');
const {normalizePlatformMarginRules,ItemPlatformMarginRulesService}=await compiled('worker/item/item-platform-margin-rules.ts');
const {handleBusinessApiRoute}=await compiled('worker/http/business-api-routes.ts');
const {ItemService}=await compiled('worker/item/item-service.ts');
const backup=await compiled('worker/backup/portable-backup.ts');
const ctx={actorMemberId:1,now:'2026-11-14T08:00:00Z'};
const input={itemNo:'ONLINE-TEST',name:'合成網路商品',baseUnit:'個',cost:'100',costTaxMode:'exclusive',storePrice:'210',clinicPrice:'180',onlinePrices:[{platformId:1,price:'300'}],wholesalePrices:[],unitConversions:[]};
const config=()=>({platformId:1,revision:0,categoryFees:[{id:'default-category',name:'合成品類',method:'percent',value:'0',minimum:null,maximum:null}],basicFees:[{name:'基本A',method:'percent',value:'5',minimum:null,maximum:null}],activityFees:[{name:'活動B',method:'percent',value:'2',minimum:null,maximum:null}],shipping:{enabled:true,carrier:'合成貨運',amount:'10'},tiers:[{quantity:2,discount:'9.9'},{quantity:3,discount:'9.8'},{quantity:5,discount:'9.7'}],coupons:[{name:'600折20',method:'fixed',value:'20',threshold:'600',cap:null},{name:'800折25',method:'fixed',value:'25',threshold:'800',cap:null},{name:'9折封頂20',method:'percent',value:'9',threshold:'1200',cap:'20'}]});
const run=(rules=config(),overrides={})=>onlineMargins({...input,id:1,revision:1,platformFeeCategories:[{platformId:1,categoryId:'default-category'}],...overrides},[{id:1,name:'合成平台'}],[rules])[0];

test('600/20 and 799/20 give exact proportional boundaries; percent coupon with low cap remains legal',()=>{
 const c=config().coupons[0];const low=couponRatio(c,'600'),high=couponRatio(c,'799');
 assert.equal(300n*low.numerator/low.denominator,10n);assert.equal((30000n*high.numerator/high.denominator).toString(),'750');
 const rule=config();rule.coupons=[{name:'9折600上限20',method:'percent',value:'9',threshold:'600',cap:'20'},config().coupons[1]];
 assert.doesNotThrow(()=>normalizePlatformMarginRules(1,rule));
 const p=run(rule);assert.equal(p.tiers[0].coupons[0].minimum.itemDiscount,'9.90');assert.equal(p.tiers[0].coupons[0].maximum.itemDiscount,'7.43');
 assert.equal(p.tiers[0].coupons[0].maximum.orderAmount,'799');
});
test('base/activity columns, shipping, every quantity tier and every coupon have independent ranges',()=>{
 const p=run();assert.equal(p.basic.contributionMarginPercent,'59.75');assert.equal(p.activity.contributionMarginPercent,'57.65');assert.equal(p.basicShipping.contributionMarginPercent,'56.25');assert.equal(p.shipping.contributionMarginPercent,'54.15');
 assert.equal(p.basicTiers.length,3);assert.equal(p.tiers.length,3);
 for(let i=0;i<3;i++){assert.equal(p.tiers[i].coupons.length,3);assert.equal(p.basicTiers[i].coupons.length,3);assert.equal(p.tiers[i].minimum.coupon,'600折20');assert.equal(p.tiers[i].maximum.theoretical,true);assert.ok(Number(p.basicTiers[i].minimum.result.contributionMarginPercent)>Number(p.tiers[i].minimum.result.contributionMarginPercent));}
 assert.equal(p.tiers[0].minimum.result.contributionMarginPercent,'52.42');assert.equal(p.tiers[0].maximum.result.contributionMarginPercent,'53.76');
 assert.equal(p.tiers[0].coupons[2].maximum.itemDiscount,'0.00');
});
test('uncapped percentage coupon does not approach zero; duplicate thresholds use next distinct threshold',()=>{
 const r=config();r.coupons=[{name:'永久9折',method:'percent',value:'9',threshold:'600',cap:null},{name:'同門檻20',method:'fixed',value:'20',threshold:'600',cap:null}];
 const p=run(r);assert.equal(p.tiers[0].coupons[0].minimum.discountRatio,'10.00');assert.equal(p.tiers[0].coupons[0].maximum.discountRatio,'10.00');assert.equal(p.tiers[0].coupons[0].maximum.itemDiscount,'29.70');
 assert.equal(p.tiers[0].coupons[1].maximum.theoretical,true);
});
test('fee caps, no coupons/tiers, missing rules/cost, zero price, negative profit and single result stay explicit',()=>{
 const r=config();r.basicFees=[{name:'固定封頂',method:'fixed',value:'20',minimum:'5',maximum:'10'}];r.activityFees=[];r.shipping.enabled=false;r.tiers=[];r.coupons=[];
 const p=run(r);assert.equal(p.basic.contributionMarginPercent,'61.50');assert.equal(p.shipping,null);assert.equal(p.tiers.length,1);assert.equal(p.tiers[0].minimum.result.contributionMarginPercent,p.tiers[0].maximum.result.contributionMarginPercent);
 assert.equal(onlineMargins({...input,id:1,revision:1},[],[])[0].configured,false);assert.equal(run(r,{cost:null}).status,'待補成本／稅別');
 assert.equal(run(r,{onlinePrices:[{platformId:1,price:'0'}]}).basic.contributionMarginPercent,null);assert.equal(run(r,{cost:'1000'}).basic.negative,true);
 const invalid=config();invalid.basicFees[0].minimum='5';invalid.basicFees[0].maximum='1';assert.throws(()=>normalizePlatformMarginRules(1,invalid),/validation/);
 const missing=config();missing.activityFees=[];assert.throws(()=>normalizePlatformMarginRules(1,missing),/validation/);
 const excessive=config();excessive.coupons=Array.from({length:501},()=>config().coupons[0]);assert.throws(()=>normalizePlatformMarginRules(1,excessive),/validation/);
});

test('manual rule API is privileged, revisions atomic, detail response includes margin once, history/backup preserve settings',async()=>{
 const f=botCenterFixture();try{
 const service=new ItemService(f.db);await service.create(input,ctx);
 const call=async(path,method='GET',json)=>{const r=await handleBusinessApiRoute(new Request('https://test.invalid/api/business/items'+path,{method,headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64),'content-type':'application/json'},body:json===undefined?undefined:JSON.stringify(json)}),f.env,'online-test');return {status:r.status,body:await r.json()}};
 const before=f.sql.prepare('SELECT cost,store_price FROM items').get();
 assert.equal((await call('/platform-margin-rules/1')).body.data.revision,0);
 assert.equal((await call('/platform-margin-rules/1','PUT',config())).status,200);
 await service.update(1,{...input,expectedRevision:1,platformFeeCategories:[{platformId:1,categoryId:'default-category'}]},ctx);
 assert.equal((await call('/platform-margin-rules/1','PUT',config())).status,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM item_platform_margin_rule_versions').get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE entity_type='item_margin_rules'").get().n,1);
 const updated={...config(),revision:1,shipping:{enabled:true,carrier:'新合成貨運',amount:'12'}};
 assert.equal((await call('/platform-margin-rules/1','PUT',updated)).body.data.revision,2);
 assert.equal((await call('/platform-margin-rules/1','PUT',updated)).status,409);
 assert.equal((await call('/platform-margin-rules/1')).body.data.shipping.amount,'12');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM item_platform_margin_rule_versions').get().n,2);
 assert.equal(JSON.parse(f.sql.prepare('SELECT rules_json FROM item_platform_margin_rule_versions WHERE revision=1').get().rules_json).shipping.amount,'10');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE entity_type='item_margin_rules'").get().n,2);
 f.queries.length=0;const detail=await call('/1');assert.equal(detail.status,200);assert.equal(detail.body.data.margin.online[0].tiers.length,3);
 assert.equal(f.queries.filter(q=>/FROM items AS i/.test(q)).length,1,'one aggregate master query for detail and both margin columns');
 assert.deepEqual(f.sql.prepare('SELECT cost,store_price FROM items').get(),before);
 const target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});try{const b=await backup.exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.20.0'});await backup.restoreIntoEmptyDatabase(target.db,b,'synthetic');for(const table of ['item_platform_margin_rules','item_platform_margin_rule_versions','item_platform_fee_categories','item_platform_fee_selections'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all(),f.sql.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all());
 for(const migration of ['0070_item_cost_margin_permission','0071_item_platform_margin_rules']){
  const manifest=JSON.parse(Buffer.from(b.manifestBytes)),data=JSON.parse(Buffer.from(b.dataBytes));manifest.schemaMigration=migration;
  const removed=migration.startsWith('0070')?['item_platform_margin_rules','item_platform_margin_rule_versions','item_platform_fee_categories','item_platform_fee_selections']:['item_platform_fee_categories','item_platform_fee_selections'];
  for(const t of removed){delete data.tables[t];delete manifest.recordCounts[t];}
  if(migration.startsWith('0071'))for(const t of ['item_platform_margin_rules','item_platform_margin_rule_versions']){const table=data.tables[t],at=table.columns.indexOf('rules_json');for(const row of table.rows){const rule=JSON.parse(row[at]);delete rule.categoryFees;row[at]=JSON.stringify(rule)}}
  manifest.totalRecordCount=Object.values(manifest.recordCounts).reduce((a,b)=>a+b,0);const bytes=Buffer.from(JSON.stringify(data));manifest.dataByteLength=bytes.length;manifest.dataSha256=createHash('sha256').update(bytes).digest('hex');
  const older=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});try{
   await backup.restoreIntoEmptyDatabase(older.db,{manifestBytes:Buffer.from(JSON.stringify(manifest)),dataBytes:bytes},'synthetic');
   assert.equal(older.sql.prepare('SELECT count(*) n FROM item_platform_fee_categories').get().n,0);assert.equal(older.sql.prepare('SELECT count(*) n FROM item_platform_fee_selections').get().n,0);
   if(migration.startsWith('0070'))assert.equal(older.sql.prepare('SELECT count(*) n FROM item_platform_margin_rules').get().n,0);
   else assert.deepEqual((await new ItemPlatformMarginRulesService(older.db).get(1)).categoryFees,[]);
  }finally{older.sql.close()}
 }

 }finally{target.sql.close()}
 }finally{f.sql.close()}
 for(const role of ['USER','ADMIN']){const f=botCenterFixture(role);try{f.sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at,updated_by) VALUES(1,'ITEMS',1,?,1),(1,'ITEMS_COST_MARGIN',1,?,1)").run(ctx.now,ctx.now);
 const req=(method)=>new Request('https://test.invalid/api/business/items/platform-margin-rules/1',{method,headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64),'content-type':'application/json'},body:method==='PUT'?JSON.stringify(config()):undefined});
 assert.equal((await handleBusinessApiRoute(req('GET'),f.env,'read')).status,200);assert.equal((await handleBusinessApiRoute(req('PUT'),f.env,'write')).status,403);
 f.sql.prepare("DELETE FROM app_member_module_access WHERE module_code='ITEMS_COST_MARGIN'").run();assert.equal((await handleBusinessApiRoute(req('GET'),f.env,'read')).status,403);
 }finally{f.sql.close()}}
});

test('category selection is per platform; selected category joins basic fees exactly once in both columns',()=>{
 const shopee=config();shopee.categoryFees=[{id:'shopee-health',name:'合成健康',method:'percent',value:'2',minimum:null,maximum:null},{id:'shopee-other',name:'其他',method:'percent',value:'50',minimum:null,maximum:null}];
 const mo={...config(),platformId:2,categoryFees:[{id:'mo-health',name:'合成健康',method:'percent',value:'3',minimum:null,maximum:null}]};
 const other={...config(),platformId:3,categoryFees:[]};
 const saved={...input,id:1,revision:1,onlinePrices:[{platformId:1,price:'300'},{platformId:2,price:'300'},{platformId:3,price:'300'}],platformFeeCategories:[{platformId:2,categoryId:'mo-health'}]};
 const result=onlineMargins(saved,[],[shopee,mo,other]);
 assert.equal(result[0].status,'請先選擇品類');assert.equal(result[0].basic,null);assert.deepEqual(result[0].tiers,[]);
 assert.equal(result[1].status,null);assert.equal(result[1].basic.contributionMarginPercent,'56.60');assert.equal(result[1].activity.contributionMarginPercent,'54.50');
 assert.equal(result[2].basic.contributionMarginPercent,'59.75');
 const selected=onlineMargins({...saved,platformFeeCategories:[{platformId:1,categoryId:'shopee-health'},{platformId:2,categoryId:'mo-health'}]},[],[shopee,mo,other]);
 assert.equal(selected[0].basic.contributionMarginPercent,'57.65');assert.equal(selected[0].activity.contributionMarginPercent,'55.55');
 assert.equal(selected[0].categoryFee.name,'合成健康');
 assert.equal(selected[0].tiers[0].minimum.result.contributionMarginPercent,'50.32');
 assert.equal(selected[1].basic.contributionMarginPercent,result[1].basic.contributionMarginPercent);
 const wrong=onlineMargins({...saved,platformFeeCategories:[{platformId:1,categoryId:'mo-health'}]},[],[shopee,mo]);
 assert.equal(wrong[0].status,'請先選擇品類');assert.equal(wrong[1].status,'請先選擇品類');
});

test('separate configured category catalogs gate item writes, preserve identity, restrict removal and survive backup',async()=>{
 const f=botCenterFixture();try{
 const rules=new ItemPlatformMarginRulesService(f.db),items=new ItemService(f.db);
 const shopee={...config(),categoryFees:[{id:'shopee-health',name:'合成共同名稱',method:'percent',value:'2',minimum:null,maximum:null}]};
 const mo={...config(),platformId:2,categoryFees:[{id:'mo-health',name:'合成共同名稱',method:'percent',value:'3',minimum:null,maximum:null}]};
 await assert.rejects(items.create({...input,platformFeeCategories:[{platformId:1,categoryId:'shopee-health'}]},ctx),/validation/);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM items').get().n,0);
 await rules.save(1,shopee,ctx);await rules.save(2,mo,ctx);
 const platforms=await items.getPlatforms();assert.deepEqual(platforms[0].feeCategories,[{id:'shopee-health',name:'合成共同名稱'}]);assert.deepEqual(platforms[1].feeCategories,[{id:'mo-health',name:'合成共同名稱'}]);
 assert.deepEqual(Object.keys(platforms[0].feeCategories[0]).sort(),['id','name']);
 await assert.rejects(items.create({...input,platformFeeCategories:[{platformId:1,categoryId:'mo-health'}]},ctx),/validation/);
 const saved=await items.create({...input,onlinePrices:[...input.onlinePrices,{platformId:2,price:'300'}],platformFeeCategories:[{platformId:1,categoryId:'shopee-health'},{platformId:2,categoryId:'mo-health'}]},ctx);
 assert.equal(saved.platformFeeCategories.length,2);
 const unchanged=await items.update(saved.id,{...input,onlinePrices:saved.onlinePrices,expectedRevision:1},ctx);assert.deepEqual(unchanged.platformFeeCategories,saved.platformFeeCategories,'older callers omit selection without clearing it');
 await assert.rejects(rules.save(1,{...shopee,revision:1,categoryFees:[]},ctx),/validation/);
 assert.equal((await rules.get(1)).revision,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM item_platform_margin_rule_versions').get().n,2);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE entity_type='item_margin_rules'").get().n,2);
 const renamed=await rules.save(1,{...shopee,revision:1,categoryFees:[{...shopee.categoryFees[0],name:'合成更名',value:'4'}]},ctx);
 assert.equal(renamed.revision,2);assert.equal((await items.getPlatforms())[0].feeCategories[0].name,'合成更名');
 assert.equal((await items.getDetail(saved.id)).platformFeeCategories[0].categoryId,'shopee-health');
 const clearOne=await items.update(saved.id,{...input,onlinePrices:saved.onlinePrices,expectedRevision:2,platformFeeCategories:[{platformId:2,categoryId:'mo-health'}]},ctx);
 const margins=await items.marginFor(clearOne);assert.equal(margins.online[0].status,'請先選擇品類');assert.equal(margins.online[1].status,null);assert.ok(margins.rows[0].inclusive);
 const target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});try{
  const b=await backup.exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.20.1'});await backup.restoreIntoEmptyDatabase(target.db,b,'synthetic');
  for(const table of ['item_platform_fee_categories','item_platform_fee_selections','item_platform_margin_rules','item_platform_margin_rule_versions'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all(),f.sql.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all());
 }finally{target.sql.close()}
 await rules.save(1,{...shopee,revision:2,categoryFees:[]},ctx);assert.equal((await items.getPlatforms())[0].feeCategories.length,0);
 }finally{f.sql.close()}
});

test('ITEMS-only may select platform categories without seeing costs or fee amounts; stale item revision rolls back selections',async()=>{
 const f=botCenterFixture('USER');try{
 f.sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at,updated_by) VALUES(1,'ITEMS',1,?,1)").run(ctx.now);
 const rules=new ItemPlatformMarginRulesService(f.db),items=new ItemService(f.db);await rules.save(1,config(),ctx);await items.create(input,ctx);
 const call=async(path,method='GET',body)=>{const r=await handleBusinessApiRoute(new Request('https://test.invalid/api/business/items'+path,{method,headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64),'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),f.env,'category-test');return {status:r.status,body:await r.json()}};
 const options=await call('/platforms');assert.equal(options.status,200);assert.deepEqual(options.body.data[0].feeCategories,[{id:'default-category',name:'合成品類'}]);
 assert.equal((await call('/platform-margin-rules/1')).status,403);
 const {cost,costTaxMode,...profile}=input;
 const selection={platformId:1,categoryId:'default-category'};
 const r=await call('/1','PATCH',{...profile,expectedRevision:1,platformFeeCategories:[selection]});assert.equal(r.status,200);assert.equal(r.body.data.cost,null);assert.equal(r.body.data.costTaxMode,null);assert.equal(r.body.data.margin,undefined);assert.deepEqual(r.body.data.platformFeeCategories,[selection]);
 assert.equal((await call('/1','PATCH',{...profile,expectedRevision:1,platformFeeCategories:[]})).status,409);
 assert.deepEqual((await items.getDetail(1)).platformFeeCategories,[selection]);assert.equal((await items.getDetail(1)).cost,'100');
 const absent=await call('/1','PATCH',{...profile,expectedRevision:2,platformFeeCategories:[{platformId:1,categoryId:'absent'}]});assert.equal(absent.status,422);
 assert.deepEqual((await items.getDetail(1)).platformFeeCategories,[selection]);
 }finally{f.sql.close()}
});
