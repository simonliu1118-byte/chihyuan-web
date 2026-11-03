import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const load=async entry=>{const r=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))};
const phone=await load('shared/phone.ts'),date=await load('shared/date-input.ts'),history=await load('src/runtime/modules/StoreOperationHistory.tsx');
test('phone display and clipboard digits stay separate for mobile and domestic fixed-line prefixes',()=>{
 assert.equal(phone.formatPhone('（０７）２３６－８５２０'),'(07)236-8520');assert.equal(phone.formatPhone('0912 345 678','mobile'),'0912-345-678');
 for(const [digits,display] of [['0223688520','(02)2368-8520'],['037123456','(037)12-3456'],['0492368520','(049)236-8520'],['083623456','(0836)2-3456']])assert.equal(phone.formatPhone(digits),display);
 assert.equal(phone.formatPhone('2368520'),'2368520');assert.equal(phone.formatPhone('0912','mobile'),'0912');assert.equal(phone.phoneDigits('(07)236-8520'),'072368520');
});
test('Backspace/Delete and selected-range deletion cross separators by digit position',()=>{
 const display='0912-345-678';assert.deepEqual(phone.deletePhoneDigit(display,5,5,true),{value:'091345678',caret:3});
 assert.deepEqual(phone.deletePhoneDigit(display,4,4,false),{value:'091245678',caret:4});
 assert.deepEqual(phone.deletePhoneDigit(display,4,9,false),{value:'0912678',caret:4});
 const landline='(07)236-8520';assert.equal(phone.phoneCaret(landline,2),3);assert.deepEqual(phone.deletePhoneDigit(landline,4,4,true),{value:'02368520',caret:1});
});
test('actual phone input handlers copy only selected digits, cut correctly, and skip the hyphen on Backspace',async()=>{
 const built=await build({entryPoints:['src/ui/forms/PhoneInput.tsx'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'input-test-boundary',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='react'?'export const useRef=v=>({current:v});export const useLayoutEffect=()=>{};export const useState=v=>[v,()=>{}];':'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'}))}}]});
 const {PhoneInput}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const changes=[],input=PhoneInput({value:'0912345678',kind:'mobile',onChange:v=>changes.push(v)}),node={value:input.props.value,selectionStart:0,selectionEnd:12};let copied,prevented=false;
 const event=()=>({currentTarget:node,clipboardData:{setData:(type,value)=>{assert.equal(type,'text/plain');copied=value}},preventDefault(){prevented=true}});
 input.props.onCopy(event());assert.equal(copied,'0912345678');assert(prevented);
 node.selectionStart=4;node.selectionEnd=9;input.props.onCopy(event());assert.equal(copied,'345');input.props.onCut(event());assert.equal(changes.at(-1),'0912678');
 node.selectionStart=5;node.selectionEnd=5;input.props.onKeyDown({...event(),key:'Backspace',nativeEvent:{isComposing:false}});assert.equal(changes.at(-1),'091345678');
});
test('CYACC-style date parsing accepts compact/slash/dash forms, rejects invalid days, preserves four-digit years',()=>{
 for(const raw of ['1101','20261101','2026/11/01','2026-11-1','２０２６１１０１'])assert.equal(date.parseDateInput(raw,'2026-10-31'),'2026-11-01');
 for(const raw of ['0230','20260229','10000/01/01','11','2026/13/01'])assert.equal(date.parseDateInput(raw,'2026-01-01'),'');
 assert.equal(date.parseDateInput('20240229'),'2024-02-29');assert.equal(date.shiftDate('2024-02-28',1),'2024-02-29');assert.equal(date.shiftDate('2026-12-31',1),'2027-01-01');
 const grid=date.monthDays(2026,11);assert.equal(grid.length,42);assert.equal(grid[0],'2026-11-01');assert.equal(grid.at(-1),'2026-12-12');
});
test('history summarizes only changed milestone fields and keeps the reason in the same line',()=>{
 const e={id:1,actorName:'合成',kind:'推進',at:'2026-10-31T01:00:00Z',reason:'合成理由',before:{status:'ORDERED',dates:{ORDERED:'2026-10-20',NOTIFIED:null}},after:{status:'NOTIFIED',dates:{ORDERED:'2026-10-20',NOTIFIED:'2026-10-21'}}};
 const summary=history.historySummary(e);assert(summary.includes('通知日期'));assert(summary.includes('理由：合成理由'));assert(!summary.includes('2026-10-20'));assert(!summary.includes('\n'));
});


test('either contact slot detects mobile or landline and normalization preserves every number',()=>{
 assert.equal(phone.formatPhone('0912345678','auto'),'0912-345-678');assert.equal(phone.formatPhone('072368520','auto'),'(07)236-8520');assert.deepEqual(phone.normalizeStoreContacts('072368520',''),{mobile:'072368520',phone:''});assert.deepEqual(phone.normalizeStoreContacts('0912345678','072368520'),{mobile:'0912345678',phone:'072368520'});assert.deepEqual(phone.normalizeStoreContacts('072368520','0912345678'),{mobile:'0912345678',phone:'072368520'});
});
