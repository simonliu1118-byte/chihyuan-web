import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {build} from "esbuild";
const compiled=await build({entryPoints:["worker/http/store-routes.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {handleStoreRoute}=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
function fixture(role="SUPER_ADMIN"){
 const sql=new DatabaseSync(":memory:");
 const queries=[];
 sql.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())sql.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 const t="2026-10-21T00:00:00Z";
 sql.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("test-store","9999","測試員工甲",1,t,t);
 const db={
  prepare(query){queries.push(query);let bind=[];const s=sql.prepare(query);const exec=()=>({results:s.all(...bind),meta:{changes:sql.prepare("SELECT changes() n").get().n,last_row_id:sql.prepare("SELECT last_insert_rowid() n").get().n}});
   return {bind(...params){bind=params;return this},async first(){return exec().results[0]??null},async all(){return exec()},async run(){return exec()},execute:exec}
  },
  async batch(stmts){sql.exec("BEGIN");try{const out=stmts.map(s=>s.execute());sql.exec("COMMIT");return out}catch(e){sql.exec("ROLLBACK");throw e}}
 };
 const principal={workspaceId:"workspace-test",employeeId:"test-store",employeeNo:"9999",displayName:"測試員工甲",workspaceRole:role,
 isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:role==="SUPER_ADMIN",credentialVersion:1,employeeRevision:1};
 const env={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",IDENTITY:{async fetch(){return Response.json({principal,session:{expiresAt:"2999-01-01T00:00:00Z"}})}}};
 const call=async(path,method="GET",json)=>{const req=new Request("https://acceptance.test/api/business/store"+path,{method,headers:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64),"content-type":"application/json"},body:json===undefined?undefined:JSON.stringify(json)});const res=await handleStoreRoute(req,env,"store-test");return {status:res.status,body:await res.json()}};
 return {sql,call,queries,db};
}
const order=(over={})=>({orderDate:"2026-10-28",customerName:"測試顧客甲",phone:"0912-345-678",lineName:"測試LINE",deposit:100,note:"",
 lines:[{itemCode:"T001",itemName:"測試品名甲",quantity:2,unitPrice:150},{itemCode:"",itemName:"測試品名乙",quantity:1,unitPrice:99}],...over});

const key=()=>crypto.randomUUID();
const payload=(v={})=>order({requestKey:key(),mobile:"",...v});
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data};
const advance=async(call,o,date="2026-10-28")=>ok(await call(`/orders/${o.id}/status`,"POST",{requestKey:key(),expectedVersion:o.version,action:"advance",milestoneDate:date}));
const rollback=async(call,o)=>ok(await call(`/orders/${o.id}/status`,"POST",{requestKey:key(),expectedVersion:o.version,action:"rollback",reason:"測試誤按更正"}));

test('supply results lock the called step, close on notification, and never create cancellation or blacklist events',async()=>{
 const {call,sql}=fixture();try{for(const result of ['OUT_OF_STOCK','DISCONTINUED']){
  let o=ok(await call('/orders','POST',payload()));o=ok(await call(`/orders/${o.id}/status`,'POST',{action:'advance',callResult:result,expectedVersion:o.version,requestKey:key()}));
  assert.equal(o.status,'ORDERED');assert.equal(o.callResult,result);assert.equal(o.dates.ORDERED,null);
  assert.equal((await call(`/orders/${o.id}/date`,'PATCH',{step:'ORDERED',milestoneDate:'2026-10-28',expectedVersion:o.version,requestKey:key()})).status,422);
  assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'rollback',reason:'誤按',expectedVersion:o.version,requestKey:key()})).status,422);
  o=await advance(call,o);assert.equal(o.status,'NOTIFIED');assert.equal(o.callResult,result);assert.equal(o.cancelReason,'');
  assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'advance',milestoneDate:null,expectedVersion:o.version,requestKey:key()})).status,422);
  assert.equal((await call(`/orders/${o.id}`,'PATCH',payload({expectedVersion:o.version,reasonKind:'輸入錯誤'}))).status,409);
  assert(ok(await call(`/orders/${o.id}/history`)).rows.some(e=>e.kind==='登記通知'));
  assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'rollback',reason:'誤按',expectedVersion:o.version,requestKey:key()})).status,409);
 }
 assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist_events').get().n,0);
 const o=ok(await call('/orders','POST',payload()));for(const result of ['invalid','__proto__'])assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'advance',callResult:result,expectedVersion:o.version,requestKey:key()})).status,422);
 for(const reasonKind of ['缺貨','絕版／停產'])assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'cancel',reasonKind,expectedVersion:o.version,requestKey:key()})).status,422);
 }finally{sql.close()}
});
test('honorifics preserve raw names, normalize full-width contact numbers, and sequence numbering is global before search',async()=>{
 const {call,sql}=fixture();try{
 const first=ok(await call('/orders','POST',payload({customerName:'合成一',honorific:'MR',phone:'（０７）２３６－８５２０',orderDate:'2026-10-20'})));
 const second=ok(await call('/orders','POST',payload({customerName:'合成二',honorific:'MS',orderDate:'2026-10-21'})));
 assert.equal(first.customerName,'合成一');assert.equal(first.honorific,'MR');assert.equal(first.phone,'072368520');
 const list=ok(await call('/orders'));assert.deepEqual(list.map(o=>[o.id,o.sequence]),[[second.id,2],[first.id,1]]);
 assert.equal(ok(await call('/orders?q='+encodeURIComponent('合成二')))[0].sequence,2);
 assert.equal((await call('/orders','POST',payload({honorific:'other'}))).status,422);
 const b=ok(await call('/blacklist','POST',{name:'合成三',honorific:'MS',mobile:'0912-345-678',reason:'合成理由',action:'OTHER'}));assert.equal(ok(await call('/blacklist')).find(x=>x.id===b.id).honorific,'MS');
 }finally{sql.close()}
});
test("module permission protects lists, history and mutation",async()=>{
 const f=fixture("USER");try{for(const p of ["/orders","/blacklist","/orders/1/history","/blacklist/1/history"])assert.equal((await f.call(p)).status,403)}finally{f.sql.close()}
});
test("new REGISTERED order, totals, contact normalization and search including mobile/note",async()=>{
 const {call,sql}=fixture();try{const o=ok(await call("/orders","POST",payload({mobile:"0988-888-888",note:"測試備註"})));assert.equal(o.status,"REGISTERED");assert.equal(o.mobile,"0988888888");assert.equal(o.total,399);assert.equal(o.hasEverOrdered,false);
 for(const q of ["345678","888888","測試備註","測試品名乙"])assert.equal(ok(await call("/orders?q="+encodeURIComponent(q))).length,1);
 assert.equal(ok(await call("/orders?q=nomatch")).length,0);assert.equal(sql.prepare("SELECT count(*) n FROM store_customer_order_lines").get().n,2);
 }finally{sql.close()}
});
test("three contact alternatives accept any one and reject blanks, malformed numbers and overpayment",async()=>{
 const {call,sql}=fixture();try{for(const c of [{phone:"071234567"},{mobile:"0912345678"},{lineName:"測試LINE甲"}])ok(await call("/orders","POST",payload({phone:"",mobile:"",lineName:"",...c})));
 for(const c of [{phone:"",mobile:"",lineName:" "},{phone:"abcdef"},{mobile:"12"},{deposit:400},{lines:[]},{customerName:" "}])assert.equal((await call("/orders","POST",payload(c))).status,422);
 }finally{sql.close()}
});
test("create is idempotent; stale saves cannot overwrite or delete lines",async()=>{
 const {call,sql}=fixture();try{const p=payload(),o=ok(await call("/orders","POST",p));assert.equal(ok(await call("/orders","POST",p)).id,o.id);assert.equal(sql.prepare("SELECT count(*) n FROM store_customer_orders").get().n,1);
 const edit=payload({expectedVersion:o.version,note:"新備註"});const n=ok(await call(`/orders/${o.id}`,"PATCH",edit));assert.equal(n.version,2);assert.equal((await call(`/orders/${o.id}`,"PATCH",payload({expectedVersion:1,lines:[{itemName:"不應留下",quantity:1,unitPrice:1}]}))).status,409);
 assert.equal(ok(await call(`/orders/${o.id}`)).lines.length,2);assert.equal(ok(await call(`/orders/${o.id}`,"PATCH",edit)).version,2);
 }finally{sql.close()}
});
test("progress requires adjacent action and a valid date or explicit no-date; no future date or skip",async()=>{
 const {call,sql}=fixture();try{let o=ok(await call("/orders","POST",payload()));for(const x of [{},{status:"NOTIFIED"},{action:"advance",milestoneDate:"2026-02-30"},{action:"advance",milestoneDate:"2999-01-01"},{action:"advance",milestoneDate:"2026-10-27"},{action:"advance",milestoneDate:"2026-10-28",status:"NOTIFIED"}])assert.equal((await call(`/orders/${o.id}/status`,"POST",{requestKey:key(),expectedVersion:o.version,...x})).status,422);
 for(const state of ["ORDERED","NOTIFIED","PICKED_UP"]){o=await advance(call,o);assert.equal(o.status,state);assert.equal(o.dates[state],"2026-10-28")}
 assert.equal((await call(`/orders/${o.id}/status`,"POST",{requestKey:key(),expectedVersion:o.version,action:"advance",milestoneDate:"2026-10-28"})).status,422);
 }finally{sql.close()}
});
test("rollback keeps dates and ever-ordered rule, date correction never advances or clears",async()=>{
 const {call,sql}=fixture();try{let o=ok(await call("/orders","POST",payload()));o=await advance(call,o);o=await advance(call,o);const notice=o.notifiedAt;o=await rollback(call,o);assert.equal(o.status,"ORDERED");assert.equal(o.notifiedAt,notice);
 o=await rollback(call,o);assert.equal(o.status,"REGISTERED");assert.equal(o.hasEverOrdered,true);
 assert.equal((await call(`/orders/${o.id}`,"PATCH",payload({expectedVersion:o.version,note:"改內容"}))).status,422);
 o=ok(await call(`/orders/${o.id}`,"PATCH",payload({expectedVersion:o.version,note:"改內容",reasonKind:"輸入錯誤"})));
 const d={requestKey:key(),expectedVersion:o.version,step:"ORDERED",milestoneDate:"2026-10-29"};o=ok(await call(`/orders/${o.id}/date`,"PATCH",d));assert.equal(o.status,"REGISTERED");assert.equal(o.dates.ORDERED,"2026-10-29");
 o=ok(await call(`/orders/${o.id}/date`,"PATCH",{...d,requestKey:key(),expectedVersion:o.version,milestoneDate:""}));assert.equal(o.dates.ORDERED,null);assert.equal(o.hasEverOrdered,true);
 const h=ok(await call(`/orders/${o.id}/history`));assert.ok(h.rows.some(e=>e.kind==="更正日期"));assert.ok(h.rows.some(e=>e.reason==="輸入錯誤"));
 }finally{sql.close()}
});
test("date correction validates neighboring dates before closure; closed orders reject every mutation",async()=>{
 const {call,sql}=fixture();try{let o=ok(await call("/orders","POST",payload()));o=await advance(call,o);o=await advance(call,o);
 assert.equal((await call(`/orders/${o.id}/date`,"PATCH",{requestKey:key(),expectedVersion:o.version,step:"ORDERED",milestoneDate:"2026-10-29"})).status,422);
 o=await advance(call,o);for(const step of ['ORDERED','NOTIFIED','PICKED_UP'])assert.equal((await call(`/orders/${o.id}/date`,"PATCH",{requestKey:key(),expectedVersion:o.version,step,milestoneDate:null})).status,409);
 assert.equal((await call(`/orders/${o.id}/status`,"POST",{requestKey:key(),expectedVersion:o.version,action:'rollback',reason:'誤按'})).status,409);
 assert.equal((await call(`/orders/${o.id}`,"PATCH",payload({expectedVersion:o.version,note:"不應改"}))).status,409);
 assert.equal(ok(await call(`/orders/${o.id}/history`)).rows.length,4);
 }finally{sql.close()}
});

test("cross-field blacklist matching preserves refusal, exact full prepayment, OTHER and zero events",async()=>{
 const {call,sql}=fixture();try{ok(await call("/blacklist","POST",{name:"測試甲",phone:"",mobile:"0911111111",lineName:"",reason:"測試",action:"REFUSE"}));assert.equal((await call("/orders","POST",payload({phone:"0911111111"}))).status,409);
 ok(await call("/blacklist","POST",{name:"測試乙",phone:"0933333333",reason:"測試",action:"FULL_PAYMENT"}));assert.equal((await call("/orders","POST",payload({phone:"",mobile:"0933333333"}))).status,422);ok(await call("/orders","POST",payload({phone:"",mobile:"0933333333",deposit:399})));
 ok(await call("/blacklist","POST",{name:"測試丙",lineName:"LINE其他",reason:"請人工確認",action:"OTHER"}));ok(await call("/orders","POST",payload({phone:"",lineName:"LINE其他",lineDecisions:[{id:ok(await call("/blacklist")).find(b=>b.action==="OTHER").id,version:1,same:true}]})));
 assert.equal(sql.prepare("SELECT count(*) n FROM store_blacklist_events").get().n,0);
 }finally{sql.close()}
});
test("LINE display-name candidates require explicit versioned identity decision, no automatic merge",async()=>{
 const {call,sql}=fixture();try{ok(await call("/blacklist","POST",{name:"同名不同人",lineName:"測試LINE",action:"REFUSE",reason:"測試"}));const state=ok(await call("/blacklist/check?lineName="+encodeURIComponent("測試LINE")));assert.equal(state.matches.length,0);assert.equal(state.lineCandidates.length,1);const b=state.lineCandidates[0];
 assert.equal((await call("/orders","POST",payload())).status,409);
 ok(await call("/orders","POST",payload({lineDecisions:[{id:b.id,version:b.version,same:false}]})));
 assert.equal((await call("/orders","POST",payload({lineDecisions:[{id:b.id,version:b.version,same:true}]}))).status,409);
 }finally{sql.close()}
});
test("cancel with blacklist is atomic, records reason, never overwrites an existing disposition",async()=>{
 const {call,sql}=fixture();try{let o=ok(await call("/orders","POST",payload()));const p={action:"cancel",requestKey:key(),expectedVersion:o.version,reasonKind:"顧客取消",reason:"訂購後棄單",blacklist:{name:o.customerName,phone:o.phone,mobile:o.mobile,lineName:o.lineName,reason:"顧客取消：訂購後棄單",action:"FULL_PAYMENT"}};
 o=ok(await call(`/orders/${o.id}/status`,"POST",p));assert.equal(o.status,"CANCELLED");ok(await call(`/orders/${o.id}/status`,"POST",p));let b=ok(await call("/blacklist"))[0];assert.equal(b.eventCount,1);assert.equal(b.action,"FULL_PAYMENT");
 const second=ok(await call("/orders","POST",payload({deposit:399})));ok(await call(`/orders/${second.id}/status`,"POST",{action:"cancel",requestKey:key(),expectedVersion:second.version,reasonKind:"其他",reason:"再次未履約"}));b=ok(await call("/blacklist"))[0];assert.equal(b.eventCount,2);assert.equal(b.action,"FULL_PAYMENT");assert.equal(b.reason,"顧客取消：訂購後棄單");assert.equal(ok(await call(`/blacklist/${b.id}/history`)).rows.length,2);
 assert.equal((await call(`/orders/${o.id}`,"PATCH",payload({expectedVersion:o.version}))).status,409);
 }finally{sql.close()}
});
test("cancel rejects bad reason or stale version without partial blacklist state",async()=>{
 const {call,sql}=fixture();try{const o=ok(await call("/orders","POST",payload()));for(const p of [{reasonKind:""},{reasonKind:"其他",reason:""},{reasonKind:"自創"}])assert.equal((await call(`/orders/${o.id}/status`,"POST",{action:"cancel",requestKey:key(),expectedVersion:o.version,...p})).status,422);
 assert.equal((await call(`/orders/${o.id}/status`,"POST",{action:"cancel",requestKey:key(),expectedVersion:0,reasonKind:"顧客取消",blacklist:{name:"測試",phone:o.phone,reason:"原因",action:"REFUSE"}})).status,409);
 assert.equal(sql.prepare("SELECT count(*) n FROM store_blacklist").get().n,0);assert.equal(ok(await call(`/orders/${o.id}`)).status,"REGISTERED");
 ok(await call(`/orders/${o.id}/status`,"POST",{action:"cancel",requestKey:key(),expectedVersion:o.version,reasonKind:"通知未取"}));assert.equal(sql.prepare("SELECT count(*) n FROM store_blacklist_events").get().n,0);
 }finally{sql.close()}
});
test("blacklist manual disposition changes need reason and version; removal preserves events",async()=>{
 const {call,sql}=fixture();try{const id=ok(await call("/blacklist","POST",{name:"測試",phone:"071234567",reason:"原理由",action:"OTHER"})).id;const b=ok(await call("/blacklist"))[0];
 assert.equal((await call(`/blacklist/${id}`,"PATCH",{...b,expectedVersion:1,action:"REFUSE"})).status,422);
 ok(await call(`/blacklist/${id}`,"PATCH",{...b,expectedVersion:1,action:"REFUSE",changeReason:"人工核對後加重"}));assert.equal((await call(`/blacklist/${id}`,"DELETE",{expectedVersion:1})).status,409);ok(await call(`/blacklist/${id}`,"DELETE",{expectedVersion:2}));assert.equal(ok(await call("/blacklist")).length,0);assert.equal(sql.prepare("SELECT count(*) n FROM store_blacklist").get().n,1);
 }finally{sql.close()}
});
test("history pagination is bounded and date/filter validation rejects invalid input",async()=>{
 const {call,sql}=fixture();try{let o=ok(await call("/orders","POST",payload()));for(let i=0;i<22;i++)o=ok(await call(`/orders/${o.id}`,"PATCH",payload({expectedVersion:o.version,note:String(i)})));
 const a=ok(await call(`/orders/${o.id}/history`));assert.equal(a.rows.length,20);const b=ok(await call(`/orders/${o.id}/history?cursor=${a.nextCursor}`));assert.equal(b.rows.length,3);assert.equal(b.nextCursor,null);assert.equal((await call(`/orders/${o.id}/history?cursor=NaN`)).status,422);assert.equal((await call("/orders?status=bad")).status,422);
 }finally{sql.close()}
});
test("concurrent adjacent advances commit exactly once and stale request does not skip a step",async()=>{const {call,sql}=fixture();try{const o=ok(await call('/orders','POST',payload()));const results=await Promise.all([1,2].map(()=>call(`/orders/${o.id}/status`,'POST',{action:'advance',requestKey:key(),expectedVersion:o.version,milestoneDate:'2026-10-28'})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(ok(await call(`/orders/${o.id}`)).status,'ORDERED');assert.equal(sql.prepare("SELECT count(*) n FROM store_order_events WHERE kind='推進'").get().n,1)}finally{sql.close()}});
test("failed blacklist-event insert rolls back cancellation, new blacklist, history and Audit together",async()=>{const {call,sql}=fixture();try{const o=ok(await call('/orders','POST',payload()));sql.exec("CREATE TRIGGER synthetic_fail_blacklist_event BEFORE INSERT ON store_blacklist_events BEGIN SELECT RAISE(ABORT,'synthetic rollback test'); END");const count=sql.prepare('SELECT count(*) n FROM audit_events').get().n;const r=await call(`/orders/${o.id}/status`,'POST',{action:'cancel',requestKey:key(),expectedVersion:o.version,reasonKind:'顧客取消',blacklist:{name:o.customerName,phone:o.phone,mobile:o.mobile,lineName:o.lineName,reason:'測試',action:'REFUSE'}});assert.equal(r.status,500);assert.equal(ok(await call(`/orders/${o.id}`)).status,'REGISTERED');assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist').get().n,0);assert.equal(sql.prepare('SELECT count(*) n FROM audit_events').get().n,count);assert.equal(sql.prepare('SELECT count(*) n FROM store_order_events').get().n,1)}finally{sql.close()}});
test('all milestones accept no-date and the notification confirmation clock survives correction before closure',async()=>{
 const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload()));for(const status of ['ORDERED','NOTIFIED']){o=await advance(call,o,null);assert.equal(o.status,status);assert.equal(o.dates[status],null)}
 const confirmation=o.notifiedAt;assert(confirmation);o=ok(await call(`/orders/${o.id}/date`,'PATCH',{step:'NOTIFIED',expectedVersion:o.version,requestKey:key(),milestoneDate:'2026-10-28'}));o=ok(await call(`/orders/${o.id}/date`,'PATCH',{step:'NOTIFIED',expectedVersion:o.version,requestKey:key(),milestoneDate:null}));assert.equal(o.notifiedAt,confirmation);
 o=await advance(call,o,null);assert.equal(o.status,'PICKED_UP');assert.equal(o.dates.PICKED_UP,null);
 }finally{sql.close()}
});

test('persisted numbering follows order date then creation time; insertion and date moves change only the affected interval',async()=>{
 const {call,sql,queries}=fixture();try{
 const a=ok(await call('/orders','POST',payload({orderDate:'2026-10-20',customerName:'最舊'})));
 const b=ok(await call('/orders','POST',payload({orderDate:'2026-10-22',customerName:'較新'})));
 const c=ok(await call('/orders','POST',payload({orderDate:'2026-10-21',customerName:'中間'})));
 await new Promise(resolve=>setTimeout(resolve,3));const d=ok(await call('/orders','POST',payload({orderDate:'2026-10-21',customerName:'同日新單'})));
 let list=ok(await call('/orders'));assert.deepEqual(list.map(o=>[o.id,o.sequence]),[[b.id,4],[d.id,3],[c.id,2],[a.id,1]]);
 assert(queries.filter(q=>q.startsWith('SELECT o.*')).every(q=>!q.includes('ROW_NUMBER')));
 ok(await call(`/orders/${c.id}`,'PATCH',payload({orderDate:'2026-10-23',customerName:'中間',expectedVersion:c.version})));
 list=ok(await call('/orders'));assert.deepEqual(list.map(o=>[o.id,o.sequence]),[[c.id,4],[b.id,3],[d.id,2],[a.id,1]]);
 assert.equal(list.find(o=>o.id===b.id).version,b.version);const current=list[0];ok(await call(`/orders/${c.id}`,'PATCH',payload({orderDate:'2026-10-19',customerName:'中間',expectedVersion:current.version})));
 list=ok(await call('/orders'));assert.deepEqual(list.map(o=>o.sequence),[4,3,2,1]);assert.equal(list.at(-1).id,c.id);
 const plan=sql.prepare('EXPLAIN QUERY PLAN SELECT * FROM store_customer_orders ORDER BY list_sequence DESC LIMIT 501').all();assert(plan.some(r=>r.detail.includes('idx_store_customer_orders_list_sequence')));assert(!plan.some(r=>r.detail.includes('TEMP B-TREE')));
 }finally{sql.close()}
});
test('deep history pages seek the composite index across 10000 events and filter retired arrival without deleting source events',async()=>{
 const {call,sql,queries}=fixture();try{const o=ok(await call('/orders','POST',payload()));const insert=sql.prepare('INSERT INTO store_order_events(order_id,actor,at,kind,before_json,after_json,reason,request_key) VALUES(?,1,?,?,?,?,?,?)');sql.exec('BEGIN');for(let i=0;i<10000;i++)insert.run(o.id,'2026-10-31T00:00:00Z','修改訂購','{}','{}','','history-'+i);sql.exec('COMMIT');
 insert.run(o.id,'2026-10-31T00:00:00Z','推進','{}',JSON.stringify({status:'ARRIVED',date:'2026-10-20'}),'','old-arrival');insert.run(o.id,'2026-10-31T00:00:00Z','推進',JSON.stringify({status:'ARRIVED'}),JSON.stringify({status:'NOTIFIED',date:'2026-10-21'}),'','old-notice');
 const first=ok(await call(`/orders/${o.id}/history`));assert(first.rows.length<=20);assert(!JSON.stringify(first).includes('ARRIVED'));assert(first.rows.some(e=>e.kind==='登記通知'));assert.equal(sql.prepare('SELECT count(*) n FROM store_order_events').get().n,10003);
 const deep=ok(await call(`/orders/${o.id}/history?cursor=100`));assert.equal(deep.rows.length,20);const query=queries.findLast(q=>q.includes('FROM store_order_events e JOIN'));assert(!query.includes(' OR '));const plan=sql.prepare('EXPLAIN QUERY PLAN '+query).all(o.id,100);assert(plan.some(r=>r.detail.includes('idx_store_order_events_order')&&r.detail.includes('id<?')));assert(!plan.some(r=>r.detail.includes('TEMP B-TREE')));
 }finally{sql.close()}
});
