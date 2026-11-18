import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
// V0.21.6 post-merge review fixes for the 委外代工 flow service.
const packed=await build({entryPoints:['worker/outsourcing/flow-service.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {OutsourcingFlowService,OutsourcingFlowError}=await import('data:text/javascript;base64,'+Buffer.from(packed.outputFiles[0].text).toString('base64'));
const at='2026-11-18T00:00:00.000Z',actor={actorMemberId:1,now:at,requestId:'t'};
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');const queries=[];
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(query){let bind=[];const st=sql.prepare(query);const exec=()=>{queries.push(query);return{results:st.all(...bind),meta:{changes:sql.prepare('SELECT changes() n').get().n,last_row_id:sql.prepare('SELECT last_insert_rowid() n').get().n}}};
  return{bind(...p){bind=p;return this},async first(){return exec().results[0]??null},async all(){return exec()},async run(){return exec()},execute:exec}},
  async batch(stmts){sql.exec('BEGIN');try{const out=stmts.map(s=>s.execute());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 sql.prepare("INSERT INTO app_members(id,identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(1,'syn','9999','合成',1,?,?)").run(at,at);
 sql.prepare("INSERT INTO contractors(id,entity_type,display_name,created_at,updated_at) VALUES(1,'organization','合成廠商',?,?)").run(at,at);
 const item=sql.prepare("INSERT INTO items(id,item_no,name,base_unit,created_at,updated_at) VALUES(?,?,?,?,?,?)");
 item.run(1,'F1','成品','個',at,at);item.run(2,'M1','料件','個',at,at);
 sql.prepare("INSERT INTO item_unit_conversions(item_id,from_unit,quantity,to_unit) VALUES(1,'打',120000,'個')").run();
 const bom=sql.prepare("INSERT INTO bom_recipes(id,recipe_ref,finished_item_id,output_quantity,output_unit,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)");
 bom.run(1,'B1',1,30000,'個',1,at,at);bom.run(2,'B2',1,10000,'個',0,at,at);
 sql.prepare("INSERT INTO bom_components(bom_recipe_id,component_item_id,quantity,unit) VALUES(1,2,10000,'個'),(2,2,10000,'個')").run();
 sql.prepare("INSERT INTO contractor_pricing(contractor_id,item_id,pricing_unit,unit_price,updated_at) VALUES(1,1,'打',1000000,?)").run(at);
 return {sql,db,queries,svc:new OutsourcingFlowService(db)};
}
async function order(f,{bom=1,qty='1000',issue=true}={}){
 let o=await f.svc.createOrder({contractorId:1,orderDate:'2026-11-18',products:[{itemId:1,bomRecipeId:bom,quantity:qty,unit:'個'}]},actor);
 if(issue)o=await f.svc.issue(o.id,{expectedRevision:o.revision,date:'2026-11-18',items:[{itemId:2,quantity:'1000',unit:'個'}]},actor);
 return o;
}
const receive=(f,o,extra={},quantity='100')=>f.svc.receive(o.id,{expectedRevision:o.revision,date:'2026-11-18',items:[{orderProductId:o.products[0].id,quantity,unit:'個',...extra}]},actor);
const balance=(f)=>f.sql.prepare('SELECT COALESCE(SUM(quantity_delta),0) n FROM contractor_stock_movements WHERE item_id=2').get().n;
const rejects=(promise,name,field)=>assert.rejects(promise,e=>{assert.equal(e.name,name);if(field)assert.ok(field in e.fields,JSON.stringify(e.fields));return true});
const f0=()=>{const f=fixture();return f};

test('不扣料 consumes nothing; unspecified follows the line BOM',async t=>{
 const f=f0();t.after(()=>f.sql.close());const o=await order(f);
 const o2=await receive(f,o,{bomRecipeId:null,noConsumption:true});
 assert.equal(balance(f),10000000);assert.equal(f.sql.prepare("SELECT count(*) n FROM contractor_stock_movements WHERE movement_type='consumption'").get().n,0);
 assert.equal(f.sql.prepare('SELECT bom_recipe_id FROM outsourcing_receipt_items').get().bom_recipe_id,null);
 await receive(f,o2,{bomRecipeId:null});
 assert.equal(balance(f),10000000-333333);
 await rejects(receive(f,(await f.svc.detail(o.id)),{noConsumption:true,bomRecipeId:1}),'FieldValidationError','bomRecipeId');
 const pv=await f.svc.previewConsumption(o.id,{items:[{orderProductId:o.products[0].id,quantity:'100',unit:'個',noConsumption:true}]});assert.deepEqual(pv.items,[]);
});
test('a deactivated BOM bound to the line still delivers; a different chosen BOM must be active',async t=>{
 const f=f0();t.after(()=>f.sql.close());const o=await order(f);
 f.sql.prepare('UPDATE bom_recipes SET is_active=0 WHERE id=1').run();
 const pv=await f.svc.previewConsumption(o.id,{items:[{orderProductId:o.products[0].id,quantity:'30',unit:'個'}]});assert.equal(pv.items[0].quantity,'-10');
 const done=await receive(f,o,{},'30');assert.equal(balance(f),10000000-100000);
 await rejects(receive(f,done,{bomRecipeId:2},'30'),'FieldValidationError','bomRecipeId');
 await rejects(f.svc.previewConsumption(o.id,{items:[{orderProductId:o.products[0].id,quantity:'30',unit:'個',bomRecipeId:2}]}),'FieldValidationError','bomRecipeId');
});
test('non-divisible BOM ratio rounds half up to four decimals and records it',async t=>{
 const f=f0();t.after(()=>f.sql.close());const o=await order(f);
 const pv=await f.svc.previewConsumption(o.id,{items:[{orderProductId:o.products[0].id,quantity:'100',unit:'個'}]});assert.equal(pv.items[0].quantity,'-33.3333');
 await receive(f,o);
 const m=f.sql.prepare("SELECT quantity_delta,reason FROM contractor_stock_movements WHERE movement_type='consumption'").get();
 assert.equal(m.quantity_delta,-333333);assert.match(m.reason,/四捨五入至小數四位/);
 assert.match(f.sql.prepare("SELECT metadata_json FROM audit_events WHERE action='outsourcing.received'").get().metadata_json,/四捨五入/);
 const sg=await f.svc.recommendedIssue(o.id);assert.ok(Array.isArray(sg.items));
 // exact ratios stay unannotated
 const o2=await order(f);await receive(f,o2,{},'30');
 assert.equal(f.sql.prepare("SELECT reason FROM contractor_stock_movements WHERE movement_type='consumption' ORDER BY id DESC").get().reason,null);
});
test('statement of 7 個 priced per 打 rounds instead of failing',async t=>{
 const f=f0();t.after(()=>f.sql.close());const o=await order(f);
 await receive(f,o,{bomRecipeId:null,noConsumption:true},'7');
 const s=await f.svc.createStatement({contractorId:1,date:'2026-11-18'},actor);
 assert.equal(s.lines.length,1);assert.equal(s.lines[0].pricing_unit,'打');assert.equal(s.lines[0].quantity,5833);assert.equal(s.lines[0].amount,5833);
});
test('stock count / return use a stock revision: stale and resubmitted requests get 409',async t=>{
 const f=f0();t.after(()=>f.sql.close());await order(f);
 const rev=(await f.svc.stock(1,true)).stockRevision;
 const adjust=(r,actual='500')=>f.svc.adjustStock({contractorId:1,expectedStockRevision:r,type:'adjust',reason:'盤點差異',date:'2026-11-18',items:[{itemId:2,unit:'個',actualQuantity:actual}]},actor);
 await adjust(rev);assert.equal(balance(f),5000000);
 await assert.rejects(adjust(rev),e=>e instanceof OutsourcingFlowError&&e.status===409);assert.equal(balance(f),5000000);
 const ret=(r)=>f.svc.adjustStock({contractorId:1,expectedStockRevision:r,type:'return',date:'2026-11-18',items:[{itemId:2,unit:'個',quantity:'10'}]},actor);
 const r2=(await f.svc.stock(1,true)).stockRevision;await ret(r2);
 await assert.rejects(ret(r2),e=>e.status===409);assert.equal(balance(f),4900000);
 // two counts racing between the read and the batch
 const r3=(await f.svc.stock(1,true)).stockRevision,batch=f.db.batch.bind(f.db);let injected=false;
 f.db.batch=async s=>{if(!injected){injected=true;await adjust(r3,'300')}return batch(s)};
 await assert.rejects(adjust(r3,'200'),e=>e instanceof OutsourcingFlowError);assert.equal(balance(f),3000000);
 f.db.batch=batch;
 await assert.rejects(f.svc.adjustStock({contractorId:1,type:'return',date:'2026-11-18',items:[]},actor),e=>e.name==='FieldValidationError');
 // an issue changes held stock, so an open count form goes stale
 const r4=(await f.svc.stock(1,true)).stockRevision;const o=await order(f,{issue:false});
 await f.svc.issue(o.id,{expectedRevision:o.revision,date:'2026-11-18',items:[{itemId:2,quantity:'1',unit:'個'}]},actor);
 await assert.rejects(adjust(r4),e=>e.status===409);
});
test('bad input is a 422, not a 500',async t=>{
 const f=f0();t.after(()=>f.sql.close());const o=await order(f);
 const rev=(await f.svc.stock(1,true)).stockRevision;
 const adj=actual=>f.svc.adjustStock({contractorId:1,expectedStockRevision:rev,type:'adjust',reason:'盤點差異',date:'2026-11-18',items:[{itemId:2,unit:'個',actualQuantity:actual}]},actor);
 await rejects(adj('abc'),'FieldValidationError','actualQuantity');await rejects(adj('-1'),'FieldValidationError','actualQuantity');
 await receive(f,o,{noConsumption:true},'7');
 const s=await f.svc.createStatement({contractorId:1,date:'2026-11-18'},actor);
 await rejects(f.svc.editStatement(s.id,{expectedRevision:s.revision,lines:[{id:s.lines[0].id,unitPrice:'abc'}]},actor),'FieldValidationError','unitPrice');
 await rejects(f.svc.editStatement(s.id,{expectedRevision:s.revision,lines:[{id:s.lines[0].id,unitPrice:'1.12345'}]},actor),'FieldValidationError','unitPrice');
});
test('two users statementing the same delivery: the loser gets 409',async t=>{
 const f=f0();t.after(()=>f.sql.close());const o=await order(f);await receive(f,o,{noConsumption:true},'7');
 const batch=f.db.batch.bind(f.db);let injected=false;
 f.db.batch=async s=>{if(!injected){injected=true;await f.svc.createStatement({contractorId:1,date:'2026-11-18'},actor)}return batch(s)};
 await assert.rejects(f.svc.createStatement({contractorId:1,date:'2026-11-18'},actor),e=>e instanceof OutsourcingFlowError&&/已被其他對帳單/.test(e.message));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM outsourcing_statements').get().n,1);
});
test('deleting a payment with a stale revision is a 409',async t=>{
 const f=f0();t.after(()=>f.sql.close());const o=await order(f);await receive(f,o,{noConsumption:true},'12');
 let s=await f.svc.createStatement({contractorId:1,date:'2026-11-18'},actor);
 s=await f.svc.editStatement(s.id,{expectedRevision:s.revision,lines:[{id:s.lines[0].id,unitPrice:'100'}]},actor);
 s=await f.svc.confirmStatement(s.id,{expectedRevision:s.revision},actor);
 s=await f.svc.addPayment(s.id,{expectedRevision:s.revision,date:'2026-11-18',method:'cash',amount:'10'},actor);
 await assert.rejects(f.svc.deletePayment(s.id,s.payments[0].id,{expectedRevision:s.revision-1},actor),e=>e instanceof OutsourcingFlowError&&e.status===409);
 await f.svc.deletePayment(s.id,s.payments[0].id,{expectedRevision:s.revision},actor);
});
test('cancelling a delivery cannot touch a statement confirmed meanwhile; a draft one is revised and audited',async t=>{
 const f=f0();t.after(()=>f.sql.close());
 const o=await order(f);const o1=await receive(f,o,{noConsumption:true},'7');
 let s=await f.svc.createStatement({contractorId:1,date:'2026-11-18'},actor);
 const receiptId=o1.receipts[0].id,batch=f.db.batch.bind(f.db);let injected=false;
 f.db.batch=async stmts=>{if(!injected){injected=true;f.sql.prepare("UPDATE outsourcing_statements SET status_code='confirmed' WHERE id=?").run(s.id)}return batch(stmts)};
 await assert.rejects(f.svc.cancelReceipt(o.id,receiptId,{expectedRevision:o1.revision},actor),e=>e instanceof OutsourcingFlowError&&e.status===409);
 f.db.batch=batch;
 assert.equal(f.sql.prepare('SELECT cancelled_at FROM outsourcing_receipts WHERE id=?').get(receiptId).cancelled_at,null);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM outsourcing_statement_lines').get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='outsourcing.receipt_cancelled'").get().n,0);
 f.sql.prepare("UPDATE outsourcing_statements SET status_code='draft' WHERE id=?").run(s.id);
 const before=f.sql.prepare('SELECT revision FROM outsourcing_statements WHERE id=?').get(s.id).revision;
 const fresh=await f.svc.detail(o.id);
 await f.svc.cancelReceipt(o.id,receiptId,{expectedRevision:fresh.revision},actor);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM outsourcing_statement_lines').get().n,0);
 assert.equal(f.sql.prepare('SELECT revision FROM outsourcing_statements WHERE id=?').get(s.id).revision,before+1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='outsourcing.statement_line_released' AND entity_key=?").get(String(s.id)).n,1);
});
test('/orders uses a bounded number of queries regardless of row count',async t=>{
 const f=f0();t.after(()=>f.sql.close());
 await order(f);f.queries.length=0;await f.svc.listOrders();const one=f.queries.length;
 for(let i=0;i<6;i++){const o=await order(f);await receive(f,o,{noConsumption:true},'5')}
 f.queries.length=0;const list=await f.svc.listOrders();
 assert.equal(list.items.length,7);assert.equal(f.queries.length,one);assert.ok(f.queries.length<=6,String(f.queries.length));
 assert.ok(list.items.some(x=>x.statusCode==='in_production'));
});
