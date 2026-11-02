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
 const {call,sql}=fixture();try{for(const result of ['OUT_OF_STOCK','DISCONTINUED','UNORDERABLE']){
  let o=ok(await call('/orders','POST',payload()));o=ok(await call(`/orders/${o.id}/status`,'POST',{action:'advance',callResult:result,expectedVersion:o.version,requestKey:key()}));
  assert.equal(o.status,'ORDERED');assert.equal(o.callResult,result);assert.equal(o.dates.ORDERED,null);
  assert.equal((await call(`/orders/${o.id}/date`,'PATCH',{step:'ORDERED',milestoneDate:'2026-10-28',expectedVersion:o.version,requestKey:key()})).status,422);
  assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'rollback',reason:'誤按',expectedVersion:o.version,requestKey:key()})).status,422);
  o=await advance(call,o);assert.equal(o.status,'NOTIFIED');assert.equal(o.callResult,result);assert.equal(o.cancelReason,'');sql.prepare("UPDATE store_customer_orders SET closed_at='2000-01-01T00:00:00Z' WHERE id=?").run(o.id);
  assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'advance',milestoneDate:null,expectedVersion:o.version,requestKey:key()})).status,422);
  assert.equal((await call(`/orders/${o.id}`,'PATCH',payload({expectedVersion:o.version,reasonKind:'輸入錯誤'}))).status,409);
  assert(ok(await call(`/orders/${o.id}/history`)).rows.some(e=>e.kind==='登記通知'));
  assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'rollback',reason:'誤按',expectedVersion:o.version,requestKey:key()})).status,409);
 }
 assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist_events').get().n,0);
 const o=ok(await call('/orders','POST',payload()));for(const result of ['invalid','__proto__'])assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'advance',callResult:result,expectedVersion:o.version,requestKey:key()})).status,422);
 for(const reasonKind of ['缺貨','絕版/停產'])assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'cancel',reasonKind,expectedVersion:o.version,requestKey:key()})).status,422);
 }finally{sql.close()}
});
test('honorifics preserve raw names, normalize full-width contact numbers, and sequence numbering is global before search',async()=>{
 const {call,sql}=fixture();try{
 const first=ok(await call('/orders','POST',payload({customerName:'合成一',honorific:'MR',phone:'（０７）２３６－８５２０',orderDate:'2026-10-20'})));
 const second=ok(await call('/orders','POST',payload({customerName:'合成二',honorific:'MS',orderDate:'2026-10-21'})));
 assert.equal(first.customerName,'合成一');assert.equal(first.honorific,'MR');assert.equal(first.mobile,'072368520');assert.equal(first.phone,'');
 const list=ok(await call('/orders'));assert.deepEqual(list.map(o=>[o.id,o.sequence]),[[second.id,2],[first.id,1]]);
 assert.equal(ok(await call('/orders?q='+encodeURIComponent('合成二')))[0].sequence,2);
 assert.equal((await call('/orders','POST',payload({honorific:'other'}))).status,422);
 const b=ok(await call('/blacklist','POST',{name:'合成三',honorific:'MS',mobile:'0912-345-678',reason:'合成理由',action:'OTHER',actionDetail:'人工確認'}));assert.equal(ok(await call('/blacklist')).find(x=>x.id===b.id).honorific,'MS');
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
 o=await advance(call,o);sql.prepare("UPDATE store_customer_orders SET closed_at='2000-01-01T00:00:00Z' WHERE id=?").run(o.id);for(const step of ['ORDERED','NOTIFIED','PICKED_UP'])assert.equal((await call(`/orders/${o.id}/date`,"PATCH",{requestKey:key(),expectedVersion:o.version,step,milestoneDate:null})).status,409);
 assert.equal((await call(`/orders/${o.id}/status`,"POST",{requestKey:key(),expectedVersion:o.version,action:'rollback',reason:'誤按'})).status,409);
 assert.equal((await call(`/orders/${o.id}`,"PATCH",payload({expectedVersion:o.version,note:"不應改"}))).status,409);
 assert.equal(ok(await call(`/orders/${o.id}/history`)).rows.length,4);
 }finally{sql.close()}
});

test("cross-field blacklist matching preserves refusal, exact full prepayment, OTHER and zero events",async()=>{
 const {call,sql}=fixture();try{ok(await call("/blacklist","POST",{name:"測試甲",phone:"",mobile:"0911111111",lineName:"",reason:"測試",action:"REFUSE"}));assert.equal((await call("/orders","POST",payload({phone:"0911111111"}))).status,409);
 ok(await call("/blacklist","POST",{name:"測試乙",phone:"0933333333",reason:"測試",action:"FULL_PAYMENT"}));assert.equal((await call("/orders","POST",payload({phone:"",mobile:"0933333333"}))).status,422);ok(await call("/orders","POST",payload({phone:"",mobile:"0933333333",deposit:399})));
 ok(await call("/blacklist","POST",{name:"測試丙",lineName:"LINE其他",reason:"請人工確認",action:"OTHER",actionDetail:"人工確認"}));ok(await call("/orders","POST",payload({phone:"",lineName:"LINE其他",lineDecisions:[{id:ok(await call("/blacklist")).find(b=>b.action==="OTHER").id,version:1,same:true}]})));
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
 o=ok(await call(`/orders/${o.id}/status`,"POST",p));assert.equal(o.status,"CANCELLED");ok(await call(`/orders/${o.id}/status`,"POST",p));let b=ok(await call("/blacklist"))[0];assert.equal(sql.prepare("SELECT count(*) n FROM store_blacklist_events").get().n,1);assert.equal(b.action,"FULL_PAYMENT");
 const second=ok(await call("/orders","POST",payload({deposit:399})));ok(await call(`/orders/${second.id}/status`,"POST",{action:"cancel",requestKey:key(),expectedVersion:second.version,reasonKind:"其他",reason:"再次未履約"}));b=ok(await call("/blacklist"))[0];assert.equal(sql.prepare("SELECT count(*) n FROM store_blacklist_events").get().n,2);assert.equal(b.action,"FULL_PAYMENT");assert.equal(b.reason,"顧客取消：訂購後棄單");assert.equal(ok(await call(`/blacklist/${b.id}/history`)).rows.length,3);
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
 const {call,sql}=fixture();try{const id=ok(await call("/blacklist","POST",{name:"測試",phone:"071234567",reason:"原理由",action:"OTHER",actionDetail:"人工確認"})).id;const b=ok(await call("/blacklist"))[0];
 assert.equal((await call(`/blacklist/${id}`,"PATCH",{...b,expectedVersion:1,action:"REFUSE"})).status,422);
 ok(await call(`/blacklist/${id}`,"PATCH",{...b,expectedVersion:1,action:"REFUSE",changeReason:"人工核對後加重"}));assert.equal((await call(`/blacklist/${id}`,"DELETE",{removalReason:"合成移出理由",expectedVersion:1})).status,409);ok(await call(`/blacklist/${id}`,"DELETE",{removalReason:"合成移出理由",expectedVersion:2}));assert.equal(ok(await call("/blacklist"))[0].active,false);assert.equal(sql.prepare("SELECT count(*) n FROM store_blacklist").get().n,1);
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

test('notification customer note appends without overwriting and idempotent retries append only once',async()=>{
 const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload({note:'原本備註'})));o=await advance(call,o);const version=o.version,keyId=key(),request={action:'advance',milestoneDate:'2026-10-29',expectedVersion:version,requestKey:keyId,customerNote:'一二三四五六七八九十'};
 assert.equal((await call(`/orders/${o.id}/status`,'POST',{...request,requestKey:key(),customerNote:'一二三四五六七八九十多'})).status,422);
 o=ok(await call(`/orders/${o.id}/status`,'POST',request));assert.equal(o.note,'原本備註\n一二三四五六七八九十');const again=ok(await call(`/orders/${o.id}/status`,'POST',request));assert.equal(again.note,o.note);assert.equal(again.version,o.version);
 const event=ok(await call(`/orders/${o.id}/history`)).rows.find(e=>e.kind==='登記通知');assert.equal(event.after.customerNote,request.customerNote);
 }finally{sql.close()}
});
test('notification never silently truncates an existing full note',async()=>{const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload({note:'甲'.repeat(300)})));o=await advance(call,o);const before=o.version;assert.equal((await call(`/orders/${o.id}/status`,'POST',{action:'advance',milestoneDate:null,expectedVersion:before,requestKey:key(),customerNote:'乙'})).status,422);const stored=ok(await call(`/orders/${o.id}`));assert.equal(stored.note,'甲'.repeat(300));assert.equal(stored.status,'ORDERED');assert.equal(stored.version,before)}finally{sql.close()}});

test('blacklist joined dates sort independently of edits and other disposition requires details',async()=>{
 const {call,sql}=fixture();try{
  assert.equal((await call('/blacklist','POST',{name:'合成甲',phone:'071234561',reason:'理由',action:'OTHER'})).status,422);
  const a=ok(await call('/blacklist','POST',{name:'合成甲',phone:'071234561',joinedDate:'2026-04-25',reason:'訂購,顧客取消',action:'OTHER',actionDetail:'人工確認'}));
  const b=ok(await call('/blacklist','POST',{name:'合成乙',phone:'071234562',joinedDate:'2026-04-24',reason:'理由',action:'REFUSE'}));let list=ok(await call('/blacklist'));assert.deepEqual(list.map(x=>x.id),[a.id,b.id]);assert.deepEqual(list.map(x=>x.sequence),[2,1]);assert.equal(list[0].reason,'訂購，顧客取消');assert.equal(list[0].actionDetail,'人工確認');
  const older=list[1];ok(await call('/blacklist/'+older.id,'PATCH',{...older,expectedVersion:older.version,reason:'修改理由'}));list=ok(await call('/blacklist'));assert.deepEqual(list.map(x=>x.id),[a.id,b.id]);assert.equal(list[1].joinedDate,'2026-04-24');
  assert.equal((await call('/blacklist/'+a.id,'PATCH',{...list[0],expectedVersion:1,actionDetail:'增加核對'})).status,422);
  for(const joinedDate of ['9999-01-01','2026-02-30',''])assert.equal((await call('/blacklist','POST',{name:'合成丙',phone:'071234563',joinedDate,reason:'理由',action:'REFUSE'})).status,422);
 }finally{sql.close()}
});

test('missing price permits a deposit, blocks pickup and can only be filled once with an idempotent price mutation',async()=>{
 const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload({customerCode:'C001',deposit:100,lines:[{itemCode:'TEST',itemName:'合成書',quantity:2,unitPrice:null,metadataMode:'BOOK',publisher:'合成出版社',author:''}]})));assert.equal(o.customerCode,'C001');assert.equal(o.lines[0].unitPrice,null);assert.equal(o.lines[0].publisher,'合成出版社');o=await advance(call,o);o=await advance(call,o);assert.equal((await call('/orders/'+o.id+'/status','POST',{action:'advance',milestoneDate:null,expectedVersion:o.version,requestKey:key()})).status,422);
 const request={lineId:o.lines[0].id,unitPrice:1900,expectedVersion:o.version,requestKey:key()};o=ok(await call('/orders/'+o.id+'/price','PATCH',request));assert.equal(o.total,3800);assert.equal(o.lines[0].unitPrice,1900);const replay=ok(await call('/orders/'+o.id+'/price','PATCH',request));assert.equal(replay.version,o.version);assert.equal((await call('/orders/'+o.id+'/price','PATCH',{...request,unitPrice:2000,expectedVersion:o.version,requestKey:key()})).status,409);o=await advance(call,o);assert.equal(o.status,'PICKED_UP');assert(o.closedAt);
 }finally{sql.close()}
});

test('unreached notification attempts do not advance, replay does not increment and successful contact clears only the current attempt state',async()=>{
 const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload()));o=await advance(call,o);let last;for(let i=1;i<=3;i++){last={action:'advance',notificationResult:'UNREACHED',milestoneDate:'2026-10-'+(27+i),expectedVersion:o.version,requestKey:key()};o=ok(await call('/orders/'+o.id+'/status','POST',last));assert.equal(o.status,'ORDERED');assert.equal(o.notificationAttempts,i);assert.equal(o.lastUnreachedDate,last.milestoneDate);assert.equal(o.dates.NOTIFIED,null);assert.equal(o.notifiedAt,null)}const replay=ok(await call('/orders/'+o.id+'/status','POST',last));assert.equal(replay.notificationAttempts,3);o=ok(await call('/orders/'+o.id+'/status','POST',{action:'advance',notificationResult:'CONTACTED',milestoneDate:'2026-10-31',customerNote:'明日取貨',expectedVersion:o.version,requestKey:key()}));assert.equal(o.status,'NOTIFIED');assert.equal(o.notificationAttempts,0);assert.equal(o.lastUnreachedDate,null);assert.equal(o.note,'明日取貨');assert.equal(ok(await call('/orders/'+o.id+'/history')).rows.filter(e=>e.kind==='通知未接通').length,3);
 }finally{sql.close()}
});

test('closure grace permits only final-date correction and rollback, date changes restart five minutes and expired closures remain locked',async()=>{
 const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload()));for(let i=0;i<3;i++)o=await advance(call,o);const previous=new Date(Date.now()-240000).toISOString();sql.prepare('UPDATE store_customer_orders SET closed_at=? WHERE id=?').run(previous,o.id);o=ok(await call('/orders/'+o.id+'/date','PATCH',{step:'PICKED_UP',milestoneDate:'2026-10-29',expectedVersion:o.version,requestKey:key()}));assert(Date.parse(o.closedAt)>Date.parse(previous)+230000);assert.equal((await call('/orders/'+o.id+'/date','PATCH',{step:'ORDERED',milestoneDate:null,expectedVersion:o.version,requestKey:key()})).status,409);assert.equal((await call('/orders/'+o.id,'PATCH',payload({expectedVersion:o.version}))).status,409);o=ok(await call('/orders/'+o.id+'/status','POST',{action:'rollback',reason:'日期誤填',expectedVersion:o.version,requestKey:key()}));assert.equal(o.status,'NOTIFIED');assert.equal(o.closedAt,null);o=await advance(call,o);sql.prepare('UPDATE store_customer_orders SET closed_at=? WHERE id=?').run(new Date(Date.now()-300100).toISOString(),o.id);assert.equal((await call('/orders/'+o.id+'/date','PATCH',{step:'PICKED_UP',milestoneDate:null,expectedVersion:o.version,requestKey:key()})).status,409);assert.equal((await call('/orders/'+o.id+'/status','POST',{action:'rollback',reason:'已逾時',expectedVersion:o.version,requestKey:key()})).status,409);
 }finally{sql.close()}
});

test('unavailable supply can undo notification closure within grace and unable-to-contact is a valid cancellation reason',async()=>{
 const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload()));o=ok(await call('/orders/'+o.id+'/status','POST',{action:'advance',callResult:'UNORDERABLE',milestoneDate:null,expectedVersion:o.version,requestKey:key()}));o=await advance(call,o);o=ok(await call('/orders/'+o.id+'/status','POST',{action:'rollback',reason:'通知日期誤填',expectedVersion:o.version,requestKey:key()}));assert.equal(o.status,'ORDERED');assert.equal(o.callResult,'UNORDERABLE');o=ok(await call('/orders/'+o.id+'/status','POST',{action:'cancel',reasonKind:'無法聯絡',expectedVersion:o.version,requestKey:key()}));assert.equal(o.status,'CANCELLED');assert.equal(o.cancelReason,'無法聯絡');
 }finally{sql.close()}
});

test('blacklist removal retains row and history; direct matching add restores ID without enforcing the removed restriction',async()=>{
 const {call,sql,queries}=fixture();try{const f={name:'移出驗收',mobile:'0912345678',reason:'原理由',action:'REFUSE',joinedDate:'2026-10-20'},id=ok(await call('/blacklist','POST',f)).id;
 ok(await call('/blacklist/'+id,'DELETE',{removalReason:"合成移出理由",expectedVersion:1}));let list=ok(await call('/blacklist'));assert.equal(list.length,1);assert.equal(list[0].active,false);
 ok(await call('/orders','POST',payload({lineName:''})));const added=ok(await call('/blacklist','POST',{...f,reason:'重新列入',joinedDate:'2026-10-28'}));assert.equal(added.id,id);assert.equal(added.restored,true);assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist').get().n,1);
 const history=ok(await call('/blacklist/'+id+'/history'));assert.deepEqual(history.rows.map(e=>e.kind),['加回黑名單','移出黑名單','加入黑名單']);assert.equal(ok(await call('/blacklist'))[0].reason,'重新列入');assert.equal((await call('/blacklist','POST',f)).status,409);
 assert(queries.some(q=>q.includes('store_blacklist_operations')&&q.includes('LIMIT 21')));assert(!queries.some(q=>q.includes('COUNT(*) FROM store_blacklist_events')));
 }finally{sql.close()}
});
test('cancel-to-blacklist restores matching removed entry atomically; declining leaves it inactive',async()=>{
 const {call,sql}=fixture();try{const f={name:'取消加回',mobile:'0912345678',lineName:'測試LINE',reason:'原理由',action:'OTHER',actionDetail:'人工確認'},id=ok(await call('/blacklist','POST',f)).id;ok(await call('/blacklist/'+id,'DELETE',{removalReason:"合成移出理由",expectedVersion:1}));
 let o=ok(await call('/orders','POST',payload()));ok(await call('/orders/'+o.id+'/status','POST',{action:'cancel',requestKey:key(),expectedVersion:o.version,reasonKind:'顧客取消'}));assert.equal(ok(await call('/blacklist'))[0].active,false);
 o=ok(await call('/orders','POST',payload()));const cancel={action:'cancel',requestKey:key(),expectedVersion:o.version,reasonKind:'無法聯絡',blacklist:{...f,reason:'本次無法聯絡',action:'REFUSE'}};ok(await call('/orders/'+o.id+'/status','POST',cancel));ok(await call('/orders/'+o.id+'/status','POST',cancel));assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist').get().n,1);assert.equal(ok(await call('/blacklist'))[0].active,true);assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist_events').get().n,1);
 assert.deepEqual(ok(await call('/blacklist/'+id+'/history')).rows.map(e=>e.kind),['訂購取消','加回黑名單','移出黑名單','加入黑名單']);assert.equal(ok(await call('/orders/'+o.id+'/history')).rows[0].after.listedInBlacklist,true);
 }finally{sql.close()}
});
test('removed LINE-only candidate requires identity review; restore version and duplicate-contact guards remain atomic',async()=>{
 const {call,sql}=fixture();try{const f={name:'同名驗收',lineName:'sameLINE',reason:'原理由',action:'REFUSE'},id=ok(await call('/blacklist','POST',f)).id;ok(await call('/blacklist/'+id,'DELETE',{removalReason:"合成移出理由",expectedVersion:1}));
 assert.equal((await call('/blacklist','POST',f)).status,409);let r=ok(await call('/blacklist/check?lineName=sameLINE'));assert.equal(r.lineCandidates[0].active,false);
 const restored=ok(await call('/blacklist','POST',{...f,lineDecisions:[{id,version:2,same:true}]}));assert.equal(restored.id,id);ok(await call('/blacklist/'+id,'DELETE',{removalReason:"合成移出理由",expectedVersion:3}));assert.equal((await call('/blacklist','POST',{...f,restoreId:id,expectedVersion:2,lineDecisions:[{id,version:4,same:true}]})).status,409);
 assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist').get().n,1);assert.equal(ok(await call('/blacklist'))[0].active,false);assert.equal((await call('/blacklist/'+id,'PATCH',{...f,expectedVersion:4})).status,409);
 }finally{sql.close()}
});
test('failed lifecycle history insert rolls back blacklist removal',async()=>{const {call,sql}=fixture();try{const id=ok(await call('/blacklist','POST',{name:'原子驗收',mobile:'0912345678',reason:'原理由',action:'REFUSE'})).id;sql.exec("CREATE TRIGGER synthetic_fail_blackop BEFORE INSERT ON store_blacklist_operations BEGIN SELECT RAISE(ABORT,'history failure'); END");assert.equal((await call('/blacklist/'+id,'DELETE',{removalReason:"合成移出理由",expectedVersion:1})).status,500);assert.equal(ok(await call('/blacklist'))[0].active,true);assert.equal(ok(await call('/blacklist'))[0].version,1)}finally{sql.close()}});

test('removed LINE entries do not require review or enforce restrictions when only creating an order',async()=>{const {call,sql}=fixture();try{const id=ok(await call('/blacklist','POST',{name:'移出LINE',lineName:'測試LINE',reason:'原理由',action:'REFUSE'})).id;ok(await call('/blacklist/'+id,'DELETE',{removalReason:"合成移出理由",expectedVersion:1}));ok(await call('/orders','POST',payload()));assert.equal(ok(await call('/blacklist'))[0].active,false)}finally{sql.close()}});
test('blacklist history uses the parent cursor index with ten thousand unrelated operations',async()=>{const {call,sql}=fixture();try{const id=ok(await call('/blacklist','POST',{name:'索引驗收',mobile:'0912345678',reason:'原理由',action:'REFUSE'})).id;const insert=sql.prepare("INSERT INTO store_blacklist_operations(blacklist_id,actor,at,kind) VALUES(?,1,'2026-10-28T00:00:00Z','修改黑名單')");sql.exec('BEGIN');for(let i=0;i<10000;i++)insert.run(id);sql.exec('COMMIT');const first=ok(await call('/blacklist/'+id+'/history'));assert.equal(first.rows.length,20);assert(first.nextCursor);const plan=sql.prepare('EXPLAIN QUERY PLAN SELECT * FROM store_blacklist_operations WHERE blacklist_id=? AND id<? ORDER BY id DESC LIMIT 21').all(id,first.nextCursor);assert(plan.some(p=>p.detail.includes('idx_store_blacklist_operations')));assert.equal(ok(await call('/blacklist/'+id+'/history?cursor='+first.nextCursor)).rows.length,20)}finally{sql.close()}});

test('all active statuses can cancel then undo within five minutes, retaining milestones; expired and legacy cancellations stay locked',async()=>{
 const {call,sql}=fixture();try{for(let step=0;step<3;step++){let o=ok(await call('/orders','POST',payload()));for(let i=0;i<step;i++)o=await advance(call,o);const original=o;o=ok(await call('/orders/'+o.id+'/status','POST',{action:'cancel',expectedVersion:o.version,requestKey:key(),reasonKind:'顧客取消'}));assert(o.closedAt);assert.equal((await call('/orders/'+o.id+'/date','PATCH',{step:'NOTIFIED',milestoneDate:'2026-10-28',expectedVersion:o.version,requestKey:key()})).status,422);o=await rollback(call,o);assert.equal(o.status,original.status);assert.deepEqual(o.dates,original.dates);assert.equal(o.closedAt,null);assert.equal(o.cancelReason,'');assert.equal(ok(await call('/orders/'+o.id+'/history')).rows[0].kind,'撤回取消')}
 let o=ok(await call('/orders','POST',payload()));o=ok(await call('/orders/'+o.id+'/status','POST',{action:'cancel',expectedVersion:o.version,requestKey:key(),reasonKind:'通知未取'}));sql.prepare("UPDATE store_customer_orders SET closed_at='2000-01-01T00:00:00Z' WHERE id=?").run(o.id);assert.equal((await call('/orders/'+o.id+'/status','POST',{action:'rollback',reason:'誤按',expectedVersion:o.version,requestKey:key()})).status,409);sql.prepare('UPDATE store_customer_orders SET closed_at=NULL WHERE id=?').run(o.id);assert.equal((await call('/orders/'+o.id+'/status','POST',{action:'rollback',reason:'誤按',expectedVersion:o.version,requestKey:key()})).status,409);
 }finally{sql.close()}
});
test('undo cancellation deactivates only its newly added blacklist, retains history and permits a second cancellation',async()=>{
 const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload()));const cancel=async o=>ok(await call('/orders/'+o.id+'/status','POST',{action:'cancel',requestKey:key(),expectedVersion:o.version,reasonKind:'無法聯絡',blacklist:{name:o.customerName,phone:o.phone,mobile:o.mobile,lineName:o.lineName,reason:'本次未接',action:'REFUSE'}}));
 o=await cancel(o);const id=ok(await call('/blacklist'))[0].id;o=await rollback(call,o);assert.equal(ok(await call('/blacklist'))[0].active,false);assert.equal(ok(await call('/blacklist/'+id+'/history')).rows[0].kind,'撤回列入黑名單');assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist_events').get().n,1);
 o=await cancel(o);assert.equal(ok(await call('/blacklist'))[0].id,id);assert.equal(ok(await call('/blacklist'))[0].active,true);assert.equal(sql.prepare('SELECT count(*) n FROM store_blacklist_events').get().n,1);assert.equal(sql.prepare("SELECT count(*) n FROM store_blacklist_operations WHERE kind='訂購取消'").get().n,2);o=await rollback(call,o);assert.equal(o.status,'REGISTERED');assert.equal(ok(await call('/blacklist'))[0].active,false);
 }finally{sql.close()}
});
test('undo restores the prior removed blacklist fields while an originally active blacklist remains unchanged',async()=>{
 const {call,sql}=fixture();try{const f={name:'原名單',mobile:'0912345678',lineName:'測試LINE',reason:'原理由',action:'OTHER',actionDetail:'原處置',joinedDate:'2026-10-20'},id=ok(await call('/blacklist','POST',f)).id;ok(await call('/blacklist/'+id,'DELETE',{removalReason:"合成移出理由",expectedVersion:1}));const prior=ok(await call('/blacklist'))[0];let o=ok(await call('/orders','POST',payload()));o=ok(await call('/orders/'+o.id+'/status','POST',{action:'cancel',expectedVersion:o.version,requestKey:key(),reasonKind:'顧客取消',blacklist:{...f,name:'本次姓名',phone:o.phone,mobile:o.mobile,reason:'本次理由',action:'REFUSE'}}));o=await rollback(call,o);const restored=ok(await call('/blacklist'))[0];for(const k of ['name','phone','mobile','lineName','reason','action','actionDetail','joinedDate','active'])assert.equal(restored[k],prior[k],k);
 ok(await call('/blacklist','POST',{...f,restoreId:id,expectedVersion:restored.version}));o=ok(await call('/orders','POST',payload()));o=ok(await call('/orders/'+o.id+'/status','POST',{action:'cancel',expectedVersion:o.version,requestKey:key(),reasonKind:'顧客取消'}));const active=ok(await call('/blacklist'))[0];o=await rollback(call,o);assert.deepEqual(ok(await call('/blacklist'))[0],active);assert.equal(ok(await call('/blacklist/'+id+'/history')).rows[0].kind,'撤回訂購取消');
 }finally{sql.close()}
});
test('later blacklist changes or another cancellation prevent automatic undo without partially reopening an order',async()=>{
 const {call,sql}=fixture();try{let o=ok(await call('/orders','POST',payload()));o=ok(await call('/orders/'+o.id+'/status','POST',{action:'cancel',expectedVersion:o.version,requestKey:key(),reasonKind:'顧客取消',blacklist:{name:o.customerName,mobile:o.mobile,lineName:o.lineName,reason:'原理由',action:'OTHER',actionDetail:'人工確認'}}));const b=ok(await call('/blacklist'))[0];const second=ok(await call('/orders','POST',payload()));ok(await call('/orders/'+second.id+'/status','POST',{action:'cancel',expectedVersion:second.version,requestKey:key(),reasonKind:'通知未取'}));
 const result=await call('/orders/'+o.id+'/status','POST',{action:'rollback',expectedVersion:o.version,requestKey:key(),reason:'誤按'});assert.equal(result.status,409);assert.equal(ok(await call('/orders/'+o.id)).status,'CANCELLED');assert.equal(ok(await call('/blacklist'))[0].active,true);assert.equal(sql.prepare("SELECT count(*) n FROM store_order_events WHERE kind='撤回取消'").get().n,0);
 ok(await call('/blacklist/'+b.id,'PATCH',{...b,expectedVersion:b.version,reason:'其他人新補充'}));assert.equal((await call('/orders/'+o.id+'/status','POST',{action:'rollback',expectedVersion:o.version,requestKey:key(),reason:'誤按'})).status,409);
 }finally{sql.close()}
});

test('NO_HOLD is a distinct manual disposition, and manual removal requires a history-only reason',async()=>{const {call,sql}=fixture();try{const id=ok(await call('/blacklist','POST',{name:'不保留驗收',mobile:'0912345678',reason:'名單原理由',action:'NO_HOLD'})).id;ok(await call('/orders','POST',payload({lineName:''})));assert.equal((await call('/blacklist/'+id,'DELETE',{expectedVersion:1,removalReason:''})).status,422);assert.equal(ok(await call('/blacklist'))[0].active,true);ok(await call('/blacklist/'+id,'DELETE',{expectedVersion:1,removalReason:'人工核對後解除'}));const b=ok(await call('/blacklist'))[0];assert.equal(b.active,false);assert.equal(b.reason,'名單原理由');assert.equal(ok(await call('/blacklist/'+id+'/history')).rows[0].reason,'人工核對後解除')}finally{sql.close()}});
