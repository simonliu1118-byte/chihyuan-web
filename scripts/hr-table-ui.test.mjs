import test from 'node:test';
import assert from 'node:assert/strict';
import {compiled,Host,plugin,walk,text} from './test-support/hr-ui-fixture.mjs';
const {EntryFields}=await compiled('src/ui/forms/EntryFields.tsx',[plugin]);
const {HrLeavePanel}=await compiled('src/runtime/modules/HrLeavePanel.tsx',[plugin]);
const {HrSalaryOverview}=await compiled('src/runtime/modules/HrSalaryOverview.tsx',[plugin]);
const {salaryAmendmentDraft}=await compiled('src/runtime/modules/hr-salary-draft.ts');
test('horizontal EntryFields uses heading/data rows, spans the final group, and preserves required cell controls',()=>{
 const rows=Array.from({length:4},(_,i)=>({label:'欄'+i,required:i===0,content:{type:'input',props:{value:String(i)}}}));
 const tree=EntryFields({label:'合成表',rows,columns:3}),tr=walk(tree).filter(n=>n.type==='tr');
 assert.equal(tr.length,4);assert.equal(walk(tr[0]).filter(n=>n.type==='th').length,3);assert.equal(walk(tr[1]).filter(n=>n.type==='td').length,3);
 assert.equal(walk(tr[2]).find(n=>n.type==='th').props.colSpan,3);
 const first=walk(tr[1]).find(n=>n.props.label==='欄0');assert.equal(first.props.required,true);assert.equal(first.props.presentation,'cell');assert.equal(first.props.children,rows[0].content);
});
test('EntryFields default stays compatible with existing row-based callers',()=>{
 const tree=EntryFields({label:'原有表格',rows:[{label:'名稱',content:{type:'input',props:{}}}]});
 assert.equal(walk(tree).find(n=>n.type==='th').props.scope,'row');assert.equal(walk(tree).filter(n=>n.type==='tr').length,1);
});
test('salary amendment carries the effective hourly rate and allowance identities without using a future raise or mutating history',()=>{
 const records=[{effective_date:'2027-01-01',payment_type:'monthly',base_amount:60000,allowances:[]},{effective_date:'2026-01-01',payment_type:'hourly',base_amount:230,allowances:[{item_type_id:7,amount:300,is_regular:0}]}];
 const before=JSON.stringify(records),draft=salaryAmendmentDraft(records,'2026-11-15');
 assert.equal(draft.form.paymentType,'hourly');assert.equal(draft.form.baseAmount,'230');assert.deepEqual(draft.allowances,[{itemTypeId:'7',amount:'300',isRegular:false}]);
 draft.allowances[0].amount='500';assert.equal(JSON.stringify(records),before);assert.equal(salaryAmendmentDraft([],'2026-11-15').form.baseAmount,'');
});
test('salary overview clearly identifies settings, preserves the raise target, and expands history with the shared control',async()=>{
 const host=new Host();let target;
 globalThis.hrTransport=()=>Promise.resolve([{id:8,employeeNo:'T8',name:'合成員工',storeId:1,storeName:'合成門市',jobTitle:'合成',status:'active',salaryRecords:[{id:1,effective_date:'2026-01-01',payment_type:'monthly',base_amount:40000,reason:'合成',allowances:[{item_name:'交通',amount:1000,is_regular:1}]}]}]);
 const props={refreshToken:0,onRaise:(...args)=>{target=args}};
 try{host.render(HrSalaryOverview,props);let tree=await host.settle(HrSalaryOverview,props);const toolbar=walk(tree).find(n=>n.props.searchLabel==='搜尋員工');
 assert.ok(text(toolbar.props.resultSummary).includes('月薪合計'));assert.ok(text(toolbar.props.resultSummary).includes('含津貼，不含時薪人員'));
 walk(tree).find(n=>n.type==='button'&&text(n)==='調薪').props.onClick();assert.deepEqual(target,[8,'合成員工']);
 walk(tree).find(n=>n.type?.name==='ExpandToggle').props.onToggle();tree=host.render(HrSalaryOverview,props);assert.ok(walk(tree).some(n=>n.type==='table'&&n.props.className?.includes('cy-hr-salary-history')));
 }finally{host.close();delete globalThis.hrHost;delete globalThis.hrTransport}
});
test('leave tables filter cancelled records while keeping the effective cancel target and proof actions',async()=>{
 const host=new Host();globalThis.window={addEventListener(){},removeEventListener(){}};
 const comp={balanceMinutes:0,advanceMinutes:0,advances:[],credits:[]};
 globalThis.hrTransport=(url)=>Promise.resolve(url.includes('/settings/')?[]:url.includes('/leave/summary')?{year:2026,types:[{id:1,code:'事',name:'事假'}],employees:[{id:1,employeeNo:'T1',name:'合成',storeId:1,employmentType:'full',annualRemainingMinutes:0,used:{},pending:0,comp}]}:{types:[{id:1,code:'事',name:'事假'}],annual:[],pending:[],comp,records:[{id:1,batch_id:'active-batch',work_date:'2026-11-18',whole_day:1,minutes:480,reason:'有效記錄',cancelled_at:null,leave_type_id:1,attachmentCount:1,attachmentIds:[9]},{id:2,batch_id:'cancelled-batch',work_date:'2026-11-19',whole_day:1,minutes:480,reason:'已取消記錄',cancelled_at:'2026-11-14',leave_type_id:1,attachmentCount:0,attachmentIds:[]}]});
 try{host.render(HrLeavePanel);let tree=await host.settle(HrLeavePanel);walk(tree).find(n=>n.type==='tr'&&n.props.onClick).props.onClick();tree=await host.settle(HrLeavePanel);
 assert.ok(text(tree).includes('有效記錄'));assert.ok(!text(tree).includes('已取消記錄'));assert.ok(walk(tree).some(n=>n.type==='table'&&n.props.className?.includes('cy-rt')));
 walk(tree).find(n=>n.type==='button'&&text(n)==='銷假').props.onClick();tree=host.render(HrLeavePanel);assert.equal(walk(tree).find(n=>n.type?.name==='HrLeaveDialog').props.completed.batchId,'active-batch');
 const toolbar=walk(tree).find(n=>n.props.searchLabel==='搜尋假單');toolbar.props.filters.props.onChange({target:{value:'cancelled'}});tree=host.render(HrLeavePanel);assert.ok(text(tree).includes('已取消記錄'));assert.ok(!text(tree).includes('有效記錄'));
 }finally{host.close();delete globalThis.hrHost;delete globalThis.hrTransport;delete globalThis.window}
});

const {HrLeaveTypeSettings}=await compiled('src/runtime/modules/HrLeaveTypeSettings.tsx',[plugin]);
test('new company leave opens an editor dialog and a failed save keeps its values',async()=>{
 const host=new Host();globalThis.window={addEventListener(){},removeEventListener(){}};let payload;
 globalThis.hrTransport=(url,options)=>{if(options?.method){payload=options.json;return Promise.reject(Error('合成儲存失敗'))}return Promise.resolve([])};
 try{host.render(HrLeaveTypeSettings);let tree=await host.settle(HrLeaveTypeSettings);walk(tree).find(n=>n.props.actionLabel==='＋ 新增公司假別').props.onAction();tree=host.render(HrLeaveTypeSettings);
 let field=walk(tree).find(n=>n.props.label==='名稱'&&n.props.size==='m');assert.ok(field);field.props.children.props.onChange({target:{value:'合成公司假'}});
 field=walk(tree).find(n=>n.props.label==='代號'&&n.props.size==='s');field.props.children.props.onChange({target:{value:'測'}});
 tree=host.render(HrLeaveTypeSettings);walk(tree).find(n=>n.props.onSubmit&&n.props.title==='新增公司假別').props.onSubmit({preventDefault(){}});tree=await host.settle(HrLeaveTypeSettings);
 assert.equal(payload.name,'合成公司假');assert.equal(payload.code,'測');assert.equal(walk(tree).find(n=>n.props.onSubmit&&n.props.title==='新增公司假別').props.error,'合成儲存失敗');
 field=walk(tree).find(n=>n.props.label==='名稱'&&n.props.size==='m');assert.equal(field.props.children.props.value,'合成公司假');
 }finally{host.close();delete globalThis.window;delete globalThis.hrHost;delete globalThis.hrTransport}
});
