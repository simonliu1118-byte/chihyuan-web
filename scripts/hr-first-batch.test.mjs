import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {evaluateAttendance,formatWorkedMinutes} from '../shared/hr-attendance.ts';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
const shift={startTime:'09:00',endTime:'18:00',breakStart:'12:00',breakEnd:'13:00',normalMinutes:480};
const interval=(startTime,endTime)=>({wholeDay:false,startTime,endTime});
test('approved leave excludes only covered working minutes from lateness/early/absence without creating punched hours',()=>{
 const run=(punches,approvedLeave)=>evaluateAttendance({kind:'shift'},shift,punches,{approvedLeave});
 assert.equal(run({in1:'10:00',out1:'18:00'},[interval('09:00','10:00')]).lateMinutes,0);
 assert.equal(run({in1:'10:05',out1:'18:00'},[interval('09:00','10:00')]).lateMinutes,5);
 assert.equal(run({in1:'09:00',out1:'17:00'},[interval('17:00','18:00')]).earlyMinutes,0);
 const lunch=run({in1:'14:00',out1:'18:00'},[interval('09:00','12:30'),interval('12:00','13:30')]);
 assert.equal(lunch.lateMinutes,30);assert.equal(lunch.workedMinutes,240);
 assert.deepEqual(run({},[interval('09:00','12:00'),interval('13:00','18:00')]).anomalies,[]);
 assert.deepEqual(run({},[interval('09:00','10:00')]).anomalies,['曠職']);
 const full=run({},[{wholeDay:true,startTime:null,endTime:null}]);assert.equal(full.workedMinutes,0);assert.deepEqual(full.anomalies,[]);
 assert.ok(run({in1:'10:00'},[interval('09:00','10:00')]).anomalies.includes('缺卡'));
 assert.equal(formatWorkedMinutes(455),'7 小時 35 分鐘');assert.equal(formatWorkedMinutes(0),'0 小時 0 分鐘');
});
async function compiled(path,plugins=[]){const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},plugins});if(!plugins.length)return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));const folder=mkdtempSync('node_modules/.hr-first-');const file=process.cwd()+'/'+folder+'/test.mjs';try{writeFileSync(file,r.outputFiles[0].text);return await import(pathToFileURL(file))}finally{rmSync(folder,{recursive:true,force:true})}}
const {HrAttendanceService}=await compiled('worker/hr/hr-attendance-service.ts');
const {HrLeaveService}=await compiled('worker/hr/hr-leave-service.ts');
test('formal leave and cancellation affect both monthly detail and store anomalies with one bounded batch read',async()=>{
 const f=botCenterFixture();try{
 const ctx={actor:1,now:'2026-11-14T10:00:00Z',requestId:'synthetic-hr-fix'};
 f.sql.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,employment_type,schedule_mode,created_at,updated_at) VALUES('SYNTHETIC-HRFIX','合成員工','active','2025-01-01','2025-01-01',1,'full','shift',?,?)").run(ctx.now,ctx.now);
 const e=f.sql.prepare("SELECT id FROM hr_employees WHERE employee_no='SYNTHETIC-HRFIX'").get();
 const sh=f.sql.prepare("SELECT * FROM hr_shift_types WHERE start_time='09:00' AND is_active=1 LIMIT 1").get();
 const type=f.sql.prepare("SELECT id FROM hr_leave_types WHERE code='事'").get();
 f.sql.prepare("INSERT INTO hr_schedule_days(employee_id,store_id,work_date,kind,shift_type_id,updated_at,updated_by) VALUES(?,1,'2026-11-18','shift',?,?,1)").run(e.id,sh.id,ctx.now);
 const leave=new HrLeaveService(f.db),attendance=new HrAttendanceService(f.db);
 const form=await leave.create({employeeId:e.id,leaveTypeId:type.id,date:'2026-11-18',startTime:'09:00',endTime:'10:00',reason:'合成測試'},ctx);
 await attendance.put(e.id,'2026-11',{days:[{date:'2026-11-18',in1:'10:00',out1:sh.end_time,revision:0}],overtime:[]},ctx);
 const day=async()=>(await attendance.get(e.id,'2026-11')).days.find(d=>d.date==='2026-11-18');
 assert.equal((await day()).lateMinutes,0);
 f.queries.length=0;assert.ok(!(await attendance.anomalies(1,'2026-11')).some(x=>x.employeeId===e.id&&x.date==='2026-11-18'&&x.anomalies.includes('遲到')));
 assert.equal(f.queries.filter(x=>x.includes('FROM hr_leave_records')).length,1);
 await leave.cancel(form.batchId,{dates:['2026-11-18'],reason:'合成銷假'},ctx);
 assert.equal((await day()).lateMinutes,60);
 assert.ok((await attendance.anomalies(1,'2026-11')).some(x=>x.employeeId===e.id&&x.date==='2026-11-18'&&x.anomalies.includes('遲到')));
 }finally{f.sql.close()}
});

// Execute the real component handlers with deterministic hooks/transports; no DOM geometry claims.
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
class Host{
 slots=[];index=0;effects=[];cleanups=[];
 useState(initial){const i=this.index++;if(!(i in this.slots))this.slots[i]=typeof initial==='function'?initial():initial;return [this.slots[i],v=>{this.slots[i]=typeof v==='function'?v(this.slots[i]):v}]}
 useRef(value){const i=this.index++;return this.slots[i]??= {current:value}}
 useMemo(fn,deps){const i=this.index++,old=this.slots[i];if(!old||!same(old.deps,deps))this.slots[i]={deps,value:fn()};return this.slots[i].value}
 useEffect(fn,deps){const i=this.index++,old=this.slots[i];if(!old||!same(old.deps,deps)){this.slots[i]={deps};this.effects.push(()=>{this.cleanups[i]?.();this.cleanups[i]=fn()})}}
 render(component,props={}){globalThis.hrHost=this;this.index=0;const tree=component(props);for(const effect of this.effects.splice(0))effect();return tree}
 async settle(component,props={}){let tree;for(let i=0;i<5;i++){await new Promise(r=>setImmediate(r));tree=this.render(component,props)}return tree}
 close(){for(const clean of this.cleanups)clean?.()}
}
const plugin={name:'hr-interactions',setup(b){
 b.onResolve({filter:/\/node_modules\/react\/index\.js$/},a=>({path:a.path,external:true}));
 b.onResolve({filter:/^react$/},()=>({path:'react-hooks',namespace:'hr'}));
 b.onLoad({filter:/.*/,namespace:'hr'},()=>({contents:`export * from '${process.cwd()}/node_modules/react/index.js';export const useState=(...a)=>globalThis.hrHost.useState(...a),useRef=(...a)=>globalThis.hrHost.useRef(...a),useMemo=(...a)=>globalThis.hrHost.useMemo(...a),useCallback=(fn,deps)=>globalThis.hrHost.useMemo(()=>fn,deps),useEffect=(...a)=>globalThis.hrHost.useEffect(...a),useLayoutEffect=(...a)=>globalThis.hrHost.useEffect(...a),useContext=()=>null;`}));
 b.onResolve({filter:/\/api\/client$/},()=>({path:'client',namespace:'transport'}));
 b.onLoad({filter:/.*/,namespace:'transport'},()=>({contents:'export const apiRequest=(...args)=>globalThis.hrTransport(...args);'}));
}};
const {useLatestRequest}=await compiled('src/ui/foundation/useLatestRequest.ts',[plugin]);
const {HrLeavePanel}=await compiled('src/runtime/modules/HrLeavePanel.tsx',[plugin]);
const {HrAttendancePanel}=await compiled('src/runtime/modules/HrAttendancePanel.tsx',[plugin]);
const {UnsavedChangesBoundary}=await compiled('src/ui/foundation/useUnsavedChangesGuard.ts',[plugin]);
const walk=n=>Array.isArray(n)?n.flatMap(walk):!n||typeof n!=='object'?[]:[n,...walk(n.props?.children)];
const text=n=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
test('request generations reject out-of-order success/error/finally, identity changes and unmounted completions',()=>{
 const host=new Host();let key='A';const component=()=>useLatestRequest(key);
 const owner=host.render(component),a=owner.begin(),b=owner.begin();assert.equal(a.current(),false);assert.equal(b.current(),true);
 key='B';host.render(component);assert.equal(b.current(),false);key='A';host.render(component);assert.equal(b.current(),false);const c=owner.begin();assert.equal(c.current(),true);host.close();assert.equal(c.current(),false);
});
test('failed comp grant retains dialog and entered hours; duplicate pending submits issue one mutation',async()=>{
 const host=new Host();globalThis.window={addEventListener(){},removeEventListener(){}};let rejectMutation,writes=0;
 const person={id:1,employeeNo:'TEST',name:'合成',storeId:1,employmentType:'full',annualRemainingMinutes:0,used:{},pending:0,comp:{balanceMinutes:0,advanceMinutes:0,advances:[],credits:[]}};
 globalThis.hrTransport=(url,options)=>{
  if(options?.method==='POST'){writes++;return new Promise((_,reject)=>{rejectMutation=reject})}
  if(url.includes('/settings/'))return Promise.resolve([]);
  if(url.includes('/leave/summary'))return Promise.resolve({year:2026,types:[],employees:[person]});
  return Promise.resolve({records:[],pending:[],types:[],annual:[],comp:person.comp});
 };
 try{
 host.render(HrLeavePanel);let tree=await host.settle(HrLeavePanel);
 walk(tree).find(x=>x.type==='tr'&&x.props.onClick).props.onClick();tree=await host.settle(HrLeavePanel);
 walk(tree).find(x=>x.type==='button'&&text(x).includes('給予補休')).props.onClick();tree=host.render(HrLeavePanel);
 let dialog=walk(tree).find(x=>x.props.title==='給予補休');assert.equal(dialog.props.open,true);
 let fields=walk(dialog).find(x=>x.props.label==='給予補休'&&x.props.rows);
 fields.props.rows.find(x=>x.label.startsWith('時數')).content.props.onChange({target:{value:'6'}});
 tree=host.render(HrLeavePanel);dialog=walk(tree).find(x=>x.props.title==='給予補休');const form=walk(dialog).find(x=>x.type==='form');
 form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});assert.equal(writes,1);
 rejectMutation(Error('合成儲存失敗'));tree=await host.settle(HrLeavePanel);dialog=walk(tree).find(x=>x.props.title==='給予補休');
 assert.equal(dialog.props.open,true);assert.ok(text(dialog).includes('合成儲存失敗'));
 fields=walk(dialog).find(x=>x.props.label==='給予補休'&&x.props.rows);assert.equal(fields.props.rows.find(x=>x.label.startsWith('時數')).content.props.value,'6');
 }finally{host.close();delete globalThis.window;delete globalThis.hrTransport;delete globalThis.hrHost}
});
test('attendance can load and select employee 105 and preserves 455 worked minutes in display',async()=>{
 const host=new Host(),paths=[];
 globalThis.hrTransport=(url)=>{paths.push(url);
  if(url.includes('/employees?')){const start=url.includes('cursor=100')?101:1,count=start===1?100:5;return Promise.resolve({items:Array.from({length:count},(_,i)=>({id:start+i,employee_no:String(start+i),name:'合成'+(start+i),store_id:1})),nextCursor:start===1?100:null})}
  const id=Number(/employees\/(\d+)/.exec(url)?.[1]??1);
  return Promise.resolve({employeeId:id,storeId:1,days:[{date:'2026-11-01',overtimeSuggestion:{minutes:0},overtime:null,schedule:null,punches:null,workedMinutes:455,lateMinutes:0,earlyMinutes:0,anomalies:[]}],totals:{workedMinutes:455,lateCount:0,lateMinutes:0,missingCard:0,absent:0,overtimeMinutes:0},overtimeWarnings:[]});
 };
 try{
 host.render(HrAttendancePanel);let tree=await host.settle(HrAttendancePanel);
 walk(tree).find(n=>n.type==='button'&&text(n)==='載入更多員工').props.onClick();tree=await host.settle(HrAttendancePanel);
 const selector=walk(tree).find(n=>n.type==='select'&&walk(n).filter(x=>x.type==='option').length===105);assert.ok(selector);
 selector.props.onChange({target:{value:'105'}});tree=await host.settle(HrAttendancePanel);
 assert.ok(paths.some(p=>p.includes('/employees/105/attendance')));assert.ok(text(tree).includes('7 小時 35 分鐘'));
 }finally{host.close();delete globalThis.hrTransport;delete globalThis.hrHost}
});
test('shared boundary refuses local tab changes while blocked and asks before dropping a registered editor',async()=>{
 const host=new Host();try{
 let tree=host.render(UnsavedChangesBoundary,{children:null}),owner=tree.props.value;
 owner.guards.set(Symbol('editor'),{active:true,blocked:true,message:'合成'});
 const blocked=owner.canLeave({title:'切換人事頁籤？',description:'合成確認'});tree=host.render(UnsavedChangesBoundary,{children:null});
 let confirm=walk(tree).find(n=>n.props.title==='操作處理中');assert.ok(confirm);confirm.props.onConfirm();assert.equal(await blocked,false);
 owner.guards.clear();owner.guards.set(Symbol('editor'),{active:true,blocked:false,message:'合成'});
 const pending=owner.canLeave({title:'切換人事頁籤？',description:'合成確認'});tree=host.render(UnsavedChangesBoundary,{children:null});
 confirm=walk(tree).find(n=>n.props.title==='切換人事頁籤？');assert.ok(confirm);confirm.props.onCancel();assert.equal(await pending,false);
 }finally{host.close();delete globalThis.hrHost}
});
