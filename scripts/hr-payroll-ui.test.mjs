import test from 'node:test';import assert from 'node:assert/strict';
import {compiled,Host,plugin,walk,text} from './test-support/hr-ui-fixture.mjs';
// Navigation itself is covered by guarded-navigation tests; here we drive API failure/success state.
const guard={name:'payroll-navigation-boundary',setup(b){b.onResolve({filter:/foundation\/useUnsavedChangesGuard$/},()=>({path:'guard',namespace:'payroll-test'}));b.onLoad({filter:/.*/,namespace:'payroll-test'},()=>({contents:'export function useNavigationGuard(){return {canLeave:async()=>true};}export function useUnsavedChangesGuard(options){globalThis.payrollGuard=options;}'}));}};
const {ProfileEditor,HrPayrollPanel}=await compiled('src/runtime/modules/HrPayrollPanel.tsx',[guard,plugin]);
const {HrAttendanceCorrections}=await compiled('src/runtime/modules/HrAttendanceCorrections.tsx',[guard,plugin]);
const fields=tree=>walk(tree).flatMap(n=>n.props?.rows??[]);
const field=(tree,label)=>{const f=fields(tree).find(r=>r.label===label);assert.ok(f,label);return f.content;};
const button=(tree,label)=>{const b=walk(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,label);return b;};
const event={preventDefault(){}};
function cleanup(host){host.close();delete globalThis.hrHost;delete globalThis.hrTransport;delete globalThis.payrollGuard;}
test('profile failed initial read cannot create a blank effective setting and offers a retry',async()=>{
 const h=new Host();let writes=0,closed=false;globalThis.hrTransport=(u,o)=>{if(o?.method){writes++;return Promise.resolve([]);}return Promise.reject(Error('讀取合成失敗'));};const props={employeeId:1,month:'2026-11',onClose:()=>{closed=true;},onSaved(){}};
 try{h.render(ProfileEditor,props);let t=await h.settle(ProfileEditor,props);assert.equal(button(t,'新增生效設定').props.disabled,true);assert.ok(text(t).includes('讀取合成失敗'));
 await walk(t).find(n=>n.type==='form').props.onSubmit(event);assert.equal(writes,0);assert.equal(closed,false);
 globalThis.hrTransport=()=>Promise.resolve([]);button(t,'重新讀取設定').props.onClick();t=await h.settle(ProfileEditor,props);assert.equal(button(t,'新增生效設定').props.disabled,false);
 }finally{cleanup(h);}
});
test('profile save failure retains attendance amount, effective date and reason, and blocks duplicate submit',async()=>{
 const h=new Host();let reject,writes=0,closed=false,payload;globalThis.hrTransport=(u,o)=>{if(o?.method){writes++;payload=o.json;return new Promise((a,b)=>{reject=b;});}return Promise.resolve([]);};const props={employeeId:1,month:'2026-11',onClose:()=>{closed=true;},onSaved(){}};
 try{h.render(ProfileEditor,props);let t=await h.settle(ProfileEditor,props);field(t,'每月全勤金額').props.onChange({target:{value:'3000'}});field(t,'設定原因').props.onChange({target:{value:'合成設定原因'}});t=h.render(ProfileEditor,props);
 const form=walk(t).find(n=>n.type==='form');form.props.onSubmit(event);form.props.onSubmit(event);assert.equal(writes,1);reject(Error('合成儲存失敗'));t=await h.settle(ProfileEditor,props);assert.equal(closed,false);assert.equal(field(t,'每月全勤金額').props.value,'3000');assert.equal(field(t,'設定原因').props.value,'合成設定原因');assert.ok(text(t).includes('合成儲存失敗'));assert.equal(payload.settings.laborEnabled,undefined);
 }finally{cleanup(h);}
});
test('monthly payroll calculation failure retains manual inputs and pending issues disable confirmation',async()=>{
 const h=new Host();let calls=0,resolve,reject;let rows=[];globalThis.hrTransport=(u,o)=>{if(o?.method){assert.equal(o.json.bonusAmount,undefined);calls++;return new Promise((a,b)=>{resolve=a;reject=b;});}if(u.includes('/employees?'))return Promise.resolve({items:[{id:1,employee_no:'S1',name:'合成',hire_date:'2025-01-01'}],nextCursor:null});return Promise.resolve(rows);};
 try{h.render(HrPayrollPanel);let t=await h.settle(HrPayrollPanel);await field(t,'員工').props.onChange({target:{value:'1'}});t=await h.settle(HrPayrollPanel);
 assert.ok(!fields(t).some(r=>r.label.includes('非每月獎金')));
 const keyed=t.props.children.filter(n=>n?.key!=null);assert.equal(new Set(keyed.map(n=>n.key)).size,keyed.length,'sibling panels must have distinct keys: duplicate keys leave orphan correction panels');
 field(t,'未滿月計薪天數（整月留空）').props.onChange({target:{value:'15'}});field(t,'計算／異動原因').props.onChange({target:{value:'合成半月'}});t=h.render(HrPayrollPanel);const form=walk(t).find(n=>n.type==='form');form.props.onSubmit(event);form.props.onSubmit(event);assert.equal(calls,1);
 reject(Error('合成計算失敗'));t=await h.settle(HrPayrollPanel);assert.equal(field(t,'未滿月計薪天數（整月留空）').props.value,'15');assert.equal(field(t,'計算／異動原因').props.value,'合成半月');assert.ok(text(t).includes('合成計算失敗'));
 walk(t).find(n=>n.type==='form').props.onSubmit(event);rows=[{id:7,employee_id:1,employee_no:'S1',name:'合成',month:'2026-11',pay_date:'2026-12-05',status:'draft',revision:1,result:{gross:15000,deductions:0,net:15000,employer:0,lines:[],ruleVersions:[],issues:['缺卡須補正']}}];resolve(rows[0]);t=await h.settle(HrPayrollPanel);assert.ok(text(t).includes('缺卡須補正'));assert.equal(button(t,'確認薪資').props.disabled,true);assert.ok(text(t).includes('待確認'));
 }finally{cleanup(h);}
});
test('correction save failure keeps the scoped employee, original revision, edited time and reason',async()=>{
 const h=new Host();let payload;globalThis.hrTransport=(u,o)=>{if(o?.method){payload=o.json;return Promise.reject(Error('授權已撤回'));}return Promise.resolve(u.endsWith('/capabilities')?{stores:[{id:1,name:'合成門市'}]}:[{employeeId:9,employee_no:'S9',name:'合成',work_date:'2026-11-03',out1:'17:25',out2:null,revision:4}]);};
 try{h.render(HrAttendanceCorrections);let t=await h.settle(HrAttendanceCorrections);button(t,'更正下班時間').props.onClick();t=h.render(HrAttendanceCorrections);field(t,'正確下班1').props.onChange('17:30');field(t,'更正原因').props.onChange({target:{value:'合成核對'}});t=h.render(HrAttendanceCorrections);walk(t).find(n=>n.type==='form').props.onSubmit(event);t=await h.settle(HrAttendanceCorrections);
 assert.equal(field(t,'正確下班1').props.value,'17:30');assert.equal(field(t,'更正原因').props.value,'合成核對');assert.ok(text(t).includes('授權已撤回'));assert.deepEqual(payload,{employeeId:9,date:'2026-11-03',revision:4,out1:'17:30',out2:null,reason:'合成核對'});assert.equal(walk(t).find(n=>n.props.title==='更正誤打下班卡').props.open,true);
 }finally{cleanup(h);}
});

const {HrPayrollLegalCases}=await compiled('src/runtime/modules/HrPayrollLegalCases.tsx',[guard,plugin]);
const {HrPayrollCorrections}=await compiled('src/runtime/modules/HrPayrollCorrections.tsx',[guard,plugin]);
test('legal-case failed read cannot save blank facts; failed save retains proof, basis and reason',async()=>{
 const h=new Host(),props={employeeId:1,month:'2026-11'};let writes=0,reject;globalThis.hrTransport=()=>Promise.reject(Error('合成讀取案件失敗'));
 try{h.render(HrPayrollLegalCases,props);let t=await h.settle(HrPayrollLegalCases,props);assert.equal(button(t,'新增法定案件').props.disabled,true);
 globalThis.hrTransport=(u,o)=>{if(o?.method){writes++;return new Promise((a,b)=>{reject=b;});}return Promise.resolve([]);};button(t,'重新讀取案件').props.onClick();t=await h.settle(HrPayrollLegalCases,props);button(t,'新增法定案件').props.onClick();t=h.render(HrPayrollLegalCases,props);
 field(t,'最近月工資／原領日工資×30').props.onChange({target:{value:'33000'}});field(t,'工資／醫療／給付核對來源').props.onChange({target:{value:'合成證明'}});field(t,'本次核對原因').props.onChange({target:{value:'合成查核'}});t=h.render(HrPayrollLegalCases,props);const f=walk(t).find(n=>n.type==='form');f.props.onSubmit(event);f.props.onSubmit(event);assert.equal(writes,1);reject(Error('合成版本衝突'));t=await h.settle(HrPayrollLegalCases,props);
 assert.equal(field(t,'最近月工資／原領日工資×30').props.value,'33000');assert.equal(field(t,'工資／醫療／給付核對來源').props.value,'合成證明');assert.ok(text(t).includes('合成版本衝突'));
 }finally{cleanup(h);}
});
test('paid-delta failed save keeps one idempotency key and recovery consent across explicit retries',async()=>{
 const h=new Host(),props={employeeId:1,month:'2026-11'},data={entries:[],paidRuns:[{id:3,month:'2026-10',payDate:'2026-11-05',net:33000}]};let payloads=[],reject;globalThis.hrTransport=(u,o)=>{if(o?.method){payloads.push(o.json);return new Promise((a,b)=>{reject=b;});}return Promise.resolve(data);};
 try{h.render(HrPayrollCorrections,props);let t=await h.settle(HrPayrollCorrections,props);button(t,'新增前期差額').props.onClick();t=h.render(HrPayrollCorrections,props);field(t,'原已發薪快照').props.onChange({target:{value:'3'}});field(t,'更正種類').props.onChange({target:{value:'salary_recovery'}});t=h.render(HrPayrollCorrections,props);
 field(t,'實際核對差額').props.onChange({target:{value:'500'}});field(t,'核定／更正依據').props.onChange({target:{value:'合成更正核定'}});field(t,'員工明確同意依據').props.onChange({target:{value:'合成書面同意'}});field(t,'本次更正原因').props.onChange({target:{value:'合成溢領'}});t=h.render(HrPayrollCorrections,props);let f=walk(t).find(n=>n.type==='form');f.props.onSubmit(event);f.props.onSubmit(event);assert.equal(payloads.length,1);reject(Error('合成儲存失敗'));t=await h.settle(HrPayrollCorrections,props);assert.equal(field(t,'員工明確同意依據').props.value,'合成書面同意');assert.equal(field(t,'實際核對差額').props.value,'500');
 walk(t).find(n=>n.type==='form').props.onSubmit(event);assert.equal(payloads.length,2);assert.equal(payloads[0].requestKey,payloads[1].requestKey);reject(Error('合成仍失敗'));await h.settle(HrPayrollCorrections,props);
 }finally{cleanup(h);}
});
