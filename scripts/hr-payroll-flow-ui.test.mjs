import test from 'node:test';import assert from 'node:assert/strict';
import {compiled,Host,plugin,walk,text} from './test-support/hr-ui-fixture.mjs';
const flow=await compiled('src/runtime/modules/hr-payroll-flow.ts');
const guard={name:'payroll-navigation-boundary',setup(b){b.onResolve({filter:/foundation\/useUnsavedChangesGuard$/},()=>({path:'guard',namespace:'payroll-test'}));b.onLoad({filter:/.*/,namespace:'payroll-test'},()=>({contents:'export function useNavigationGuard(){return {canLeave:async()=>globalThis.payrollCanLeave!==false};}export function useUnsavedChangesGuard(options){globalThis.payrollGuard=options;}'}));}};
const {HrPayrollMonthly}=await compiled('src/runtime/modules/HrPayrollMonthly.tsx',[guard,plugin]);
const {HrPayrollDetail}=await compiled('src/runtime/modules/HrPayrollDetail.tsx',[guard,plugin]);
const {HrSalaryPanel}=await compiled('src/runtime/modules/HrPayrollPanel.tsx',[guard,plugin]);
const {calcTargets,calcSkipped,calcPayload,confirmTargets,statusCounts,filterRows,flowStatus,totals,classifyIssue,calculateAll,confirmAll,runPool,profileSummary,monthSummary,pendingCount,shortIssue}=flow;
const run=(over={})=>({id:1,status:'draft',revision:1,payDate:'2026-12-05',gross:40000,deductions:3000,net:37000,issues:[],paidDays:null,reason:'2026/11 月薪',...over});
const row=(id,over={},runOver)=>({employeeId:id,employeeNo:'S'+id,name:'合成'+id,storeId:1,storeName:'合成門市',voidCount:0,hasSalary:true,run:runOver===null?null:run({id:100+id,...(runOver??{})}),...over});
const sample=()=>[
 row(1,{},{issues:['2026-11-12 未打卡須先補正或明確確認曠班','2026-11-18 排班假尚未完成正式假單']}),
 row(2,{},{}),row(3,{},{status:'confirmed'}),row(4,{hasSalary:false},null),row(5,{},null),row(6,{voidCount:1},{status:'paid'}),
 row(7,{voidCount:1},null),row(8,{},{paidDays:15,reason:'合成留停'}),row(9,{voidCount:2},{issues:['缺少已生效的薪資主檔紀錄']}),
];
test('status cards: every employee lands in exactly one status; missing salary shows 待補 without a calculation',()=>{
 const rows=sample(),counts=statusCounts(rows);
 assert.deepEqual(counts,{uncalculated:2,pending:3,review:2,confirmed:1,paid:1});
 assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),rows.length);
 assert.equal(flowStatus(rows[3]),'pending');assert.equal(pendingCount(rows[3]),1);assert.equal(pendingCount(rows[0]),2);assert.equal(pendingCount(rows[1]),0);
});
test('status filter and search combine; clearing the filter restores everyone',()=>{
 const rows=sample();assert.deepEqual(filterRows(rows,'pending','').map(r=>r.employeeId),[1,4,9]);
 assert.deepEqual(filterRows(rows,null,'S5').map(r=>r.employeeId),[5]);assert.deepEqual(filterRows(rows,'pending','合成4').map(r=>r.employeeId),[4]);assert.equal(filterRows(rows,null,'').length,rows.length);
 assert.deepEqual(filterRows(rows,'paid','S1').map(r=>r.employeeId),[]);
});
test('totals add gross for every calculated row but net only where nothing is pending',()=>{
 const t=totals([row(1,{},{issues:['x'],gross:10000,net:9000}),row(2,{},{gross:20000,net:18000}),row(3,{},null)]);assert.deepEqual(t,{gross:30000,net:18000});
});
test('issue actions map to the existing flows; unknown text stays text only',()=>{
 const types=text=>classifyIssue(text).actions.map(a=>a.type+(a.reviewKind?':'+a.reviewKind:''));
 assert.deepEqual(types('2026-11-12 未打卡須先補正或明確確認曠班'),['attendance','review:absence']);assert.equal(classifyIssue('2026-11-12 未打卡須先補正或明確確認曠班').date,'2026-11-12');
 assert.deepEqual(types('2026-11-12 缺卡須先補正出勤'),['attendance']);
 assert.deepEqual(types('2026-11-20 例假出勤須另確認法定緊急事由及補假'),['review:regular_emergency','attendance']);
 assert.deepEqual(types('2026-11-21 國定假日／例假出勤不可逕以一般加班補休沖抵，須確認日型及合法調移'),['review:holiday_shifted','attendance']);
 assert.deepEqual(types('2026-11-18 排班假尚未完成正式假單'),['leave']);
 for(const t of ['缺少已生效的薪資主檔紀錄','本月前段缺少已生效薪資主檔紀錄','主檔時薪低於本月法定最低工資，請先調整主檔','尚未設定薪資'])assert.deepEqual(types(t),['salary'],t);
 for(const t of ['請先新增本月有效的薪資計算／投保設定','半職／兼職月薪需填約定每週正常工時','時薪津貼／全勤須填約定月正常工時，作為加班工資分攤基礎','月中全勤／約定工時異動須分段核對；投保項目已依生效日自動分段'])assert.deepEqual(types(t),['profile'],t);
 for(const t of ['本月含留職停薪：請確認30天制實際計薪天數及原因，不能預設發整月','未滿月／月中調薪：請確認計薪天數及原因後重算','手填計薪天數少於已記錄正常出勤工時，請先核對'])assert.deepEqual(types(t),['days'],t);
 for(const t of ['此月份不在員工任職期間','缺少本月適用的官方每小時最低工資','離職應即結清工資，請核對實際給付日期，不套一般次月發薪日'])assert.deepEqual(types(t),[],t);
 assert.equal(shortIssue('2026-11-12 未打卡'),'11/12 未打卡');
});
test('calculate-all targets only uncalculated and draft rows; confirmed, paid and no-salary rows are never touched; reopened-not-recalculated rows are skipped',()=>{
 const rows=sample();assert.deepEqual(calcTargets(rows).map(r=>r.employeeId),[1,2,5,8,9]);assert.deepEqual(calcSkipped(rows).map(r=>r.employeeId),[7]);
 assert.equal(calcPayload(rows[1],'2026-11','2026-12-05').reason,undefined,'a plain draft sends no reason; the server stores the default');
 assert.deepEqual(calcPayload(rows[4],'2026-11','2026-12-05'),{employeeId:5,month:'2026-11',payDate:'2026-12-05'});
 assert.deepEqual(calcPayload(rows[7],'2026-11','2026-12-05'),{employeeId:8,month:'2026-11',payDate:'2026-12-05',paidDays:15,reason:'合成留停'},'a manual paid-days draft keeps its days and reason when recalculated');
 assert.equal(calcPayload(rows[8],'2026-11','2026-12-05').reason,'2026/11 月薪','a draft with snapshot history reuses its stored reason');
 assert.equal('paidDays' in calcPayload(rows[7],'2026-11','2026-12-05',{paidDays:null}),false);
});
test('calculate-all runs at most two at once, continues past a failure in the middle and reports each failure',async()=>{
 const rows=Array.from({length:7},(_,i)=>row(i+1,{},null));let inflight=0,max=0;const seen=[],progress=[];
 const outcome=await calculateAll(rows,'2026-11','2026-12-05',async payload=>{inflight++;max=Math.max(max,inflight);seen.push(payload.employeeId);await new Promise(r=>setTimeout(r,5));inflight--;if(payload.employeeId===3)throw Object.assign(new Error('合成計算失敗'),{status:500});return {};},(d,t)=>progress.push([d,t]));
 assert.ok(max>=1&&max<=2,'concurrency '+max);assert.deepEqual([...seen].sort(),[1,2,3,4,5,6,7]);assert.equal(outcome.total,7);assert.equal(outcome.succeeded,6);
 assert.deepEqual(outcome.failures.map(f=>[f.employeeId,f.message,f.conflict]),[[3,'合成計算失敗',false]]);assert.deepEqual(progress.at(-1),[7,7]);assert.equal(progress.length,7);
});
test('calculate-all never sends a request for confirmed, paid, no-salary or reopened rows',async()=>{
 const sent=[];const outcome=await calculateAll(sample(),'2026-11','2026-12-05',async p=>{sent.push(p.employeeId);return {};});
 assert.deepEqual(sent.sort(),[1,2,5,8,9]);assert.equal(outcome.failures.length,0);
});
test('confirm-all touches only drafts without issues, one at a time, and marks a source change as needing recalculation',async()=>{
 const rows=sample();assert.deepEqual(confirmTargets(rows).map(r=>r.employeeId),[2,8]);
 let inflight=0,max=0;const sent=[];
 const outcome=await confirmAll(rows,async(id,revision)=>{inflight++;max=Math.max(max,inflight);sent.push([id,revision]);await new Promise(r=>setTimeout(r,3));inflight--;if(id===102)throw Object.assign(new Error('出勤／設定／級距已異動，請重算後再確認'),{status:409});});
 assert.equal(max,1);assert.deepEqual(sent,[[102,1],[108,1]]);assert.equal(outcome.succeeded,1);assert.deepEqual(outcome.failures.map(f=>[f.employeeId,f.conflict]),[[2,true]]);
 const other=await confirmAll([row(2,{},{})],async()=>{throw Object.assign(new Error('薪資已更動，請重讀'),{status:409});});assert.equal(other.failures[0].conflict,false,'a plain revision conflict is not a stale-source mark');
});
test('runPool keeps going after errors and preserves item order in results',async()=>{
 const r=await runPool([1,2,3,4],2,async n=>{if(n===2)throw new Error('x');return n*2;});assert.deepEqual(r.map(x=>x.ok),[true,false,true,true]);assert.deepEqual(r.filter(x=>x.ok).map(x=>x.value),[2,6,8]);
});
test('summaries: insurance and withholding are grouped, the rest of the deductions stay visible, pending issues hide the net',()=>{
 const result={gross:52000,deductions:5500,net:46500,employer:2651,issues:[],lines:[{label:'本薪',amount:45000,kind:'earning'},{label:'職務津貼',amount:7000,kind:'earning'},{label:'勞保',amount:758,kind:'deduction'},{label:'健保',amount:1400,kind:'deduction'},{label:'所得稅扣繳',amount:1500,kind:'deduction'},{label:'遲到未給工資',amount:1842,kind:'deduction'},{label:'雇主勞保',amount:2651,kind:'employer'}]};
 assert.deepEqual(monthSummary(result),{base:45000,allowances:7000,insurance:2158,withheld:1500,otherDeductions:1842,gross:52000,net:46500,netPending:false,employer:2651});
 assert.equal(monthSummary({...result,issues:['x']}).netPending,true);
 assert.deepEqual(profileSummary({laborEnabled:true,employmentInsurance:true,laborBasis:45800,healthEnabled:true,healthBasis:45800,dependents:1,pensionEnabled:true,pensionEmployerRate:6,pensionSelfRate:0,attendanceEnabled:true,attendanceAmount:1000}).map(x=>x.value),['本單位・45,800・含就保','本單位・45,800・眷口 1','雇主 6%・自提 0%','每月・$1,000']);
 assert.deepEqual(profileSummary({}).map(x=>x.value),['未由本單位投保','未由本單位投保','未提繳','不適用']);
});

const cleanup=h=>{h.close();delete globalThis.hrHost;delete globalThis.hrTransport;delete globalThis.payrollGuard;delete globalThis.payrollCanLeave;};
const button=(tree,label)=>{const b=walk(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,label);return b;};
const buttons=(tree,pattern)=>walk(tree).filter(n=>n.type==='button'&&pattern.test(text(n)));
const month=rows=>({month:'2026-11',rows});
test('monthly list renders counts, filters by clicking a status card and clears on a second click; 計算全部 shows the target count',async()=>{
 const h=new Host(),calls=[];globalThis.hrTransport=u=>{calls.push(u);return Promise.resolve(month(sample()));};
 try{h.render(HrPayrollMonthly,{initialMonth:'2026-11'});let t=await h.settle(HrPayrollMonthly,{initialMonth:'2026-11'});
  assert.ok(calls.some(u=>u.endsWith('/payroll/month?month=2026-11')),'one list request');assert.equal(calls.filter(u=>u.includes('/payroll/')).length,1,'no per-employee request just to render the list');
  const cards=buttons(t,/^(未計算|有待補|待確認|已確認|已發薪)\d+$/);assert.deepEqual(cards.map(c=>text(c)),['未計算2','有待補3','待確認2','已確認1','已發薪1']);
  assert.ok(button(t,'計算全部（5 人）'));assert.ok(button(t,'確認全部無待補（2）'));
  const bodyRows=tree=>walk(tree).filter(n=>n.type==='tr'&&n.props?.onClick);
  assert.equal(bodyRows(t).length,9);
  cards[1].props.onClick();t=h.render(HrPayrollMonthly,{initialMonth:'2026-11'});assert.equal(bodyRows(t).length,3);assert.equal(buttons(t,/^有待補3$/)[0].props['aria-pressed'],true);
  buttons(t,/^有待補3$/)[0].props.onClick();t=h.render(HrPayrollMonthly,{initialMonth:'2026-11'});assert.equal(bodyRows(t).length,9);
 }finally{cleanup(h);}
});
test('計算全部 sends one calculate per target in the panel, survives a failure in the middle, refreshes the list and never touches confirmed runs',async()=>{
 const h=new Host(),posts=[];let listCalls=0,rows=Array.from({length:5},(_,i)=>row(i+1,{},null));rows.push(row(6,{},{status:'confirmed'}));
 globalThis.hrTransport=(u,o)=>{if(o?.method==='POST'){posts.push({u,json:o.json});if(o.json.employeeId===3)return Promise.reject(Object.assign(new Error('合成計算失敗'),{status:500}));return Promise.resolve({});}listCalls++;return Promise.resolve(month(rows));};
 const props={initialMonth:'2026-11'};
 try{h.render(HrPayrollMonthly,props);let t=await h.settle(HrPayrollMonthly,props);await button(t,'計算全部（5 人）').props.onClick();t=await h.settle(HrPayrollMonthly,props);
  assert.deepEqual(posts.map(p=>p.json.employeeId).sort(),[1,2,3,4,5]);assert.ok(posts.every(p=>p.u.endsWith('/payroll/calculate')&&p.json.reason===undefined&&p.json.month==='2026-11'&&p.json.payDate==='2026-12-05'));
  assert.ok(listCalls>=2,'list refreshed after the batch');const summary=text(t);assert.ok(summary.includes('成功 4／5 人'),summary);assert.ok(summary.includes('S3 合成3：合成計算失敗'));
 }finally{cleanup(h);}
});
test('確認全部 asks once, confirms only zero-issue drafts without a reason, and reports a stale source',async()=>{
 const h=new Host(),posts=[];let asked=null;const rows=[row(1,{},{issues:['x']}),row(2,{},{net:30000}),row(3,{},{net:20000}),row(4,{},{status:'confirmed'}),row(5,{},null)];
 globalThis.hrTransport=(u,o)=>{if(o?.method==='POST'){posts.push({u,json:o.json});if(u.endsWith('/runs/102'))return Promise.reject(Object.assign(new Error('出勤／設定／級距已異動，請重算後再確認'),{status:409}));return Promise.resolve({});}return Promise.resolve(month(rows));};
 const props={initialMonth:'2026-11'};
 try{h.render(HrPayrollMonthly,props);let t=await h.settle(HrPayrollMonthly,props);const b=button(t,'確認全部無待補（2）');
  const original=b.props.onClick;await original();t=h.render(HrPayrollMonthly,props);
  // the confirmation dialog is an element owned by useConfirmation; accept it through its props
  const dialog=walk(t).find(n=>n.props?.confirmLabel==='確認 2 人');assert.ok(dialog,'one confirmation dialog');assert.ok(String(dialog.props.description).includes('$50,000'));asked=dialog;
  asked.props.onConfirm();t=await h.settle(HrPayrollMonthly,props);
  assert.deepEqual(posts.map(p=>p.u.split('/runs/')[1]),['102','103']);assert.ok(posts.every(p=>p.json.action==='confirm'&&p.json.reason===undefined));
  assert.ok(text(t).includes('成功 1／2 人')&&text(t).includes('需重新計算'));
 }finally{cleanup(h);}
});
test('month changes and unsaved-days guard use the shared navigation guard; a refused leave keeps the month',async()=>{
 const h=new Host(),props={initialMonth:'2026-11'};globalThis.hrTransport=()=>Promise.resolve(month(sample()));
 try{h.render(HrPayrollMonthly,props);let t=await h.settle(HrPayrollMonthly,props);const picker=walk(t).find(n=>n.props?.onChange&&n.props?.value==='2026-11'&&n.props?.disabled===false);assert.ok(picker,'MonthPicker');
  globalThis.payrollCanLeave=false;await picker.props.onChange('2026-10');t=await h.settle(HrPayrollMonthly,props);assert.equal(walk(t).find(n=>n.props?.value==='2026-10'||n.props?.value==='2026-11'&&n.props?.onChange).props.value,'2026-11');
  globalThis.payrollCanLeave=true;await picker.props.onChange('2026-10');t=h.render(HrPayrollMonthly,props);assert.ok(walk(t).some(n=>n.props?.value==='2026-10'&&n.props?.onChange));
 }finally{cleanup(h);}
});
function detailProps(rowValue,over={}){const calls={nav:[],raise:[],notify:[],asks:[],posts:[]};
 const props={row:rowValue,month:'2026-11',payDate:'2026-12-05',stale:false,busy:false,recalcSignal:0,run:async fn=>{try{await fn();return true;}catch(e){calls.error=e;return false;}},notify:m=>calls.notify.push(m),
  ask:async r=>{calls.asks.push(r);return calls.answer===undefined?{reason:'合成核對原因'}:calls.answer;},confirm:async()=>true,onBack(){},onChanged:async()=>{},onStale:id=>{calls.stale=id;},onFresh(){},
  onNavigate:t=>calls.nav.push(t),onRaise:(id,name)=>calls.raise.push([id,name]),onDirtyChange(){},...over};return {props,calls};}
const runBody=(r,issues)=>({id:r.run?.id??0,employee_id:r.employeeId,month:'2026-11',pay_date:'2026-12-05',status:'draft',revision:r.run?.revision??1,result:{gross:40000,deductions:3000,net:37000,employer:0,lines:[],ruleVersions:[],issues}});
test('detail issue rows: 到出勤補正／到請假補單 navigate, 確認曠班 asks for a reason in a small dialog then saves the review and recalculates',async()=>{
 const issues=['2026-11-12 未打卡須先補正或明確確認曠班','2026-11-18 排班假尚未完成正式假單'],r=row(1,{},{issues}),h=new Host(),{props,calls}=detailProps(r);
 globalThis.hrTransport=(u,o)=>{if(o?.method==='POST'){calls.posts.push({u,json:o.json});return Promise.resolve(runBody(r,[]));}if(u.includes('/reviews/'))return Promise.resolve([]);return Promise.resolve(runBody(r,issues));};
 try{h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);
  button(t,'到出勤補正').props.onClick();button(t,'到請假補單').props.onClick();assert.deepEqual(calls.nav,[{tab:'attendance',employeeId:1,month:'2026-11',date:'2026-11-12'},{tab:'leave',employeeId:1,month:'2026-11',date:'2026-11-18'}]);
  button(t,'確認曠班').props.onClick();await h.settle(HrPayrollDetail,props);await h.settle(HrPayrollDetail,props);
  assert.equal(calls.asks[0].size,'small');assert.equal(calls.asks[0].fields[0].required,true);assert.equal(calls.asks[0].fields[0].label,'核對原因');
  assert.deepEqual(calls.posts.map(p=>p.u.split('/payroll/')[1]),['reviews/1','calculate']);assert.deepEqual(calls.posts[0].json,{date:'2026-11-12',kind:'absence',reason:'合成核對原因',revision:0});
  assert.equal(calls.posts[1].json.reason,undefined,'no snapshot history: recalculation needs no reason');
  calls.posts.length=0;calls.answer=null;button(t,'確認曠班').props.onClick();await h.settle(HrPayrollDetail,props);await h.settle(HrPayrollDetail,props);assert.equal(calls.posts.length,0,'cancelling the reason dialog writes nothing');
 }finally{cleanup(h);}
});
test('detail: confirmation and mark-paid ask no reason; reopen asks for one; confirm is disabled while issues exist or the source is stale',async()=>{
 const posts=[];globalThis.hrTransport=(u,o)=>{if(o?.method==='POST'){posts.push(o.json);return Promise.resolve(runBody(r,[]));}return Promise.resolve(u.includes('/reviews/')?[]:runBody(r,[]));};
 let r=row(1,{},{}),h=new Host(),{props,calls}=detailProps(r);
 try{h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);assert.equal(button(t,'確認薪資').props.disabled,false);button(t,'確認薪資').props.onClick();await h.settle(HrPayrollDetail,props);assert.deepEqual(posts[0],{action:'confirm',revision:1});assert.equal(calls.asks.length,0);}finally{cleanup(h);}
 r=row(1,{},{status:'confirmed'});h=new Host();({props,calls}=detailProps(r));posts.length=0;
 try{globalThis.hrTransport=(u,o)=>{if(o?.method==='POST'){posts.push(o.json);return Promise.resolve(runBody(r,[]));}return Promise.resolve(u.includes('/reviews/')?[]:runBody(r,[]));};
  h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);button(t,'標記已發薪').props.onClick();await h.settle(HrPayrollDetail,props);assert.deepEqual(posts.pop(),{action:'pay',revision:1});assert.equal(calls.asks.length,0);
  button(t,'撤回確認').props.onClick();await h.settle(HrPayrollDetail,props);assert.equal(calls.asks[0].fields[0].required,true);assert.equal(calls.asks[0].size,'small');assert.deepEqual(posts.pop(),{action:'reopen',revision:1,reason:'合成核對原因'});
  calls.answer=null;calls.asks.length=0;posts.length=0;button(t,'撤回確認').props.onClick();await h.settle(HrPayrollDetail,props);assert.equal(posts.length,0,'reopen without a reason sends nothing');
 }finally{cleanup(h);}
 r=row(1,{},{issues:['缺卡']});h=new Host();({props,calls}=detailProps(r));globalThis.hrTransport=(u)=>Promise.resolve(u.includes('/reviews/')?[]:runBody(r,['缺卡']));
 try{h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);assert.equal(button(t,'確認薪資').props.disabled,true);}finally{cleanup(h);}
 r=row(1,{},{});h=new Host();({props,calls}=detailProps(r,{stale:true}));globalThis.hrTransport=(u)=>Promise.resolve(u.includes('/reviews/')?[]:runBody(r,[]));
 try{h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);assert.equal(button(t,'確認薪資').props.disabled,true);}finally{cleanup(h);}
});
test('detail: a source-changed 409 on confirm marks the employee as needing recalculation; recalculating after a reopen asks for a reason, otherwise not',async()=>{
 let r=row(1,{},{});let h=new Host(),{props,calls}=detailProps(r);
 globalThis.hrTransport=(u,o)=>o?.method==='POST'?Promise.reject(Object.assign(new Error('出勤／設定／級距已異動，請重算後再確認'),{status:409})):Promise.resolve(u.includes('/reviews/')?[]:runBody(r,[]));
 try{h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);button(t,'確認薪資').props.onClick();await h.settle(HrPayrollDetail,props);assert.equal(calls.stale,1);assert.ok(String(calls.error?.message).includes('重算'));}finally{cleanup(h);}
 const posts=[];r=row(1,{voidCount:1},null);h=new Host();({props,calls}=detailProps(r));globalThis.hrTransport=(u,o)=>{if(o?.method==='POST'){posts.push(o.json);return Promise.resolve(runBody(r,[]));}return Promise.resolve(u.includes('/reviews/')?[]:runBody(r,[]));};
 try{h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);button(t,'計算').props.onClick();await h.settle(HrPayrollDetail,props);assert.equal(calls.asks.length,1,'reopened month: reason required');assert.equal(posts[0].reason,'合成核對原因');}finally{cleanup(h);}
 posts.length=0;r=row(2,{},null);h=new Host();({props,calls}=detailProps(r));globalThis.hrTransport=(u,o)=>{if(o?.method==='POST'){posts.push(o.json);return Promise.resolve(runBody(r,[]));}return Promise.resolve(u.includes('/reviews/')?[]:runBody(r,[]));};
 try{h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);button(t,'計算').props.onClick();await h.settle(HrPayrollDetail,props);assert.equal(calls.asks.length,0,'first calculation: no reason');assert.equal('reason' in posts[0],false);}finally{cleanup(h);}
});
test('detail: 調整計薪天數 validates 0-30, asks a reason and sends paidDays with it; 設定薪資 and 計薪／投保設定 open the existing dialogs',async()=>{
 const r=row(1,{},{issues:['本月含留職停薪：請確認30天制實際計薪天數及原因，不能預設發整月','缺少已生效的薪資主檔紀錄','請先新增本月有效的薪資計算／投保設定']}),h=new Host(),{props,calls}=detailProps(r);const posts=[];
 globalThis.hrTransport=(u,o)=>{if(o?.method==='POST'){posts.push(o.json);return Promise.resolve(runBody(r,[]));}return Promise.resolve(u.includes('/reviews/')?[]:runBody(r,r.run.issues));};
 try{h.render(HrPayrollDetail,props);let t=await h.settle(HrPayrollDetail,props);
  const input=walk(t).find(n=>n.type==='input'&&n.props['aria-label']==='計薪天數（30 天制）');assert.ok(input);
  input.props.onChange({target:{value:'45'}});t=h.render(HrPayrollDetail,props);buttons(t,/^調整計薪天數$/)[0].props.onClick();await h.settle(HrPayrollDetail,props);assert.equal(posts.length,0);assert.ok(calls.notify.at(-1).includes('0～30'));
  walk(t).find(n=>n.type==='input'&&n.props['aria-label']==='計薪天數（30 天制）').props.onChange({target:{value:'15'}});t=h.render(HrPayrollDetail,props);buttons(t,/^調整計薪天數$/)[0].props.onClick();await h.settle(HrPayrollDetail,props);
  assert.equal(calls.asks.at(-1).fields[0].required,true);assert.equal(posts.at(-1).paidDays,15);assert.equal(posts.at(-1).reason,'合成核對原因');
  button(t,'設定薪資').props.onClick();assert.deepEqual(calls.raise,[[1,'合成1']]);
  button(t,'計薪／投保設定').props.onClick();t=h.render(HrPayrollDetail,props);assert.ok(walk(t).some(n=>n.props?.employeeId===1&&n.props?.onSaved&&n.props?.month==='2026-11'),'ProfileEditor opened');
 }finally{cleanup(h);}
});
test('薪資 has four sub-tabs; 公司補充保費 is its own tab; leaving with unsaved edits asks first',async()=>{
 const h=new Host(),props={onRaise(){},refreshToken:0};
 try{let t=h.render(HrSalaryPanel,props);const seg=walk(t).find(n=>n.props?.label==='薪資頁籤');assert.deepEqual(seg.props.options.map(o=>o.label),['薪資設定','每月薪資','獎金發放','公司補充保費']);
  globalThis.payrollCanLeave=false;await seg.props.onChange('supplement');t=h.render(HrSalaryPanel,props);assert.equal(walk(t).find(n=>n.props?.label==='薪資頁籤').props.value,'settings');
  globalThis.payrollCanLeave=true;await walk(t).find(n=>n.props?.label==='薪資頁籤').props.onChange('supplement');t=h.render(HrSalaryPanel,props);assert.equal(walk(t).find(n=>n.props?.label==='薪資頁籤').props.value,'supplement');
 }finally{cleanup(h);}
});
