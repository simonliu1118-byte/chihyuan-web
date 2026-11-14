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
const config=()=>({platformId:1,revision:0,basicFees:[{name:'基本A',method:'percent',value:'5',minimum:null,maximum:null}],activityFees:[{name:'活動B',method:'percent',value:'2',minimum:null,maximum:null}],shipping:{enabled:true,carrier:'合成貨運',amount:'10'},tiers:[{quantity:2,discount:'9.9'},{quantity:3,discount:'9.8'},{quantity:5,discount:'9.7'}],coupons:[{name:'600折20',method:'fixed',value:'20',threshold:'600',cap:null},{name:'800折25',method:'fixed',value:'25',threshold:'800',cap:null},{name:'9折封頂20',method:'percent',value:'9',threshold:'1200',cap:'20'}]});
const run=(rules=config(),overrides={})=>onlineMargins({...input,id:1,revision:1,...overrides},[{id:1,name:'合成平台'}],[rules])[0];

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
 const target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});try{const b=await backup.exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.20.0'});await backup.restoreIntoEmptyDatabase(target.db,b,'synthetic');for(const table of ['item_platform_margin_rules','item_platform_margin_rule_versions'])assert.deepEqual(target.sql.prepare('SELECT * FROM '+table).all(),f.sql.prepare('SELECT * FROM '+table).all());
 const manifest=JSON.parse(Buffer.from(b.manifestBytes)),data=JSON.parse(Buffer.from(b.dataBytes));manifest.schemaMigration='0070_item_cost_margin_permission';for(const t of ['item_platform_margin_rules','item_platform_margin_rule_versions']){delete data.tables[t];delete manifest.recordCounts[t];}manifest.totalRecordCount=Object.values(manifest.recordCounts).reduce((a,b)=>a+b,0);const bytes=Buffer.from(JSON.stringify(data));manifest.dataByteLength=bytes.length;manifest.dataSha256=createHash('sha256').update(bytes).digest('hex');
 const older=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});try{await backup.restoreIntoEmptyDatabase(older.db,{manifestBytes:Buffer.from(JSON.stringify(manifest)),dataBytes:bytes},'synthetic');assert.equal(older.sql.prepare('SELECT count(*) n FROM item_platform_margin_rules').get().n,0)}finally{older.sql.close()}
 }finally{target.sql.close()}
 }finally{f.sql.close()}
 for(const role of ['USER','ADMIN']){const f=botCenterFixture(role);try{f.sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at,updated_by) VALUES(1,'ITEMS',1,?,1),(1,'ITEMS_COST_MARGIN',1,?,1)").run(ctx.now,ctx.now);
 const req=(method)=>new Request('https://test.invalid/api/business/items/platform-margin-rules/1',{method,headers:{cookie:'cyweb_identity_session=cyid_'+'a'.repeat(64),'content-type':'application/json'},body:method==='PUT'?JSON.stringify(config()):undefined});
 assert.equal((await handleBusinessApiRoute(req('GET'),f.env,'read')).status,200);assert.equal((await handleBusinessApiRoute(req('PUT'),f.env,'write')).status,403);
 f.sql.prepare("DELETE FROM app_member_module_access WHERE module_code='ITEMS_COST_MARGIN'").run();assert.equal((await handleBusinessApiRoute(req('GET'),f.env,'read')).status,403);
 }finally{f.sql.close()}}
});
