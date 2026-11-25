import test,{mock} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
import {compiled,Host,walk,text,plugin} from './test-support/hr-ui-fixture.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compactPlugin={name:'compact',setup(b){
 b.onResolve({filter:/\/api\/client$/},()=>({path:'client2',namespace:'compact'}));
 b.onLoad({filter:/^client2$/,namespace:'compact'},()=>({contents:'export const apiRequest=(...a)=>globalThis.hrTransport(...a);export class ApiClientError extends Error{}'}));
 b.onResolve({filter:/useCompactLayout$/},()=>({path:'compact',namespace:'compact'}));
 b.onLoad({filter:/.*/,namespace:'compact'},()=>({contents:'export const useCompactLayout=()=>!!globalThis.testCompact;'}));
}};
const {NationalIdReveal}=await compiled('src/runtime/modules/NationalIdReveal.tsx',[plugin]);
const {MyProfilePage}=await compiled('src/runtime/modules/MyProfilePage.tsx',[compactPlugin,plugin]);
const {HrService}=await compiled('worker/hr/hr-service.ts');
const {HrSelfService}=await compiled('worker/hr/hr-self-service.ts');
const ctx={actor:1,now:new Date().toISOString(),requestId:'synthetic-id-reveal'};
const button=tree=>walk(tree).find(n=>n.type==='button');

test('ID reveal: masked by default, shows in place, hides itself after 10 s and clears the value',async t=>{
 mock.timers.enable({apis:['setTimeout']});t.after(()=>mock.timers.reset());
 const host=new Host();let loads=0;const props={masked:'A******789',resetKey:1,load:async()=>{loads++;return 'A123456789'}};
 try{
  let tree=host.render(NationalIdReveal,props);
  assert.match(text(tree),/A\*{6}789顯示/);assert.doesNotMatch(text(tree),/A123456789|自動隱藏/);
  button(tree).props.onClick();tree=await host.settle(NationalIdReveal,props);
  assert.equal(loads,1);assert.match(text(tree),/A123456789隱藏/);assert.match(text(tree),/10 秒後自動隱藏/);
  mock.timers.tick(9999);tree=host.render(NationalIdReveal,props);assert.match(text(tree),/A123456789/,'still shown just before 10 s');
  mock.timers.tick(1);tree=host.render(NationalIdReveal,props);
  assert.match(text(tree),/A\*{6}789顯示/);assert.doesNotMatch(text(tree),/A123456789/,'value dropped from state');
 }finally{host.close();delete globalThis.hrHost}
});
test('ID reveal: 隱藏 button and switching employee both return to the mask',async t=>{
 mock.timers.enable({apis:['setTimeout']});t.after(()=>mock.timers.reset());
 const host=new Host();const props={masked:'A******789',resetKey:1,load:async()=>'A123456789'};
 try{
  host.render(NationalIdReveal,props);button(host.render(NationalIdReveal,props)).props.onClick();
  let tree=await host.settle(NationalIdReveal,props);assert.match(text(tree),/隱藏/);
  button(tree).props.onClick();tree=host.render(NationalIdReveal,props);assert.match(text(tree),/A\*{6}789顯示/);
  button(tree).props.onClick();tree=await host.settle(NationalIdReveal,props);assert.match(text(tree),/A123456789/);
  const other={...props,masked:'B******321',resetKey:2};
  tree=host.render(NationalIdReveal,other);tree=host.render(NationalIdReveal,other);
  assert.match(text(tree),/B\*{6}321顯示/);assert.doesNotMatch(text(tree),/A123456789/,'previous employee number is gone');
 }finally{host.close();delete globalThis.hrHost}
});
test('ID reveal: an answer arriving after hide or employee switch is ignored',async()=>{
 const host=new Host();let resolve;const props={masked:'A******789',resetKey:1,load:()=>new Promise(r=>{resolve=r})};
 try{
  button(host.render(NationalIdReveal,props)).props.onClick();host.render(NationalIdReveal,{...props,resetKey:2});host.render(NationalIdReveal,{...props,resetKey:2});
  resolve('A123456789');const tree=await host.settle(NationalIdReveal,{...props,resetKey:2});
  assert.doesNotMatch(text(tree),/A123456789/);
 }finally{host.close();delete globalThis.hrHost}
});
test('self reveal returns only the bound employee\'s own number and writes no access audit; the admin reveal still audits',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());
 const service=new HrService(f.db),self=new HrSelfService(f.db);
 const base={name:'合成甲',nationalId:'A123456789',birthDate:'1990-01-01',gender:'F',mobile:'0900000000',mailingAddress:'合成地址',registeredAddress:'合成地址',hireDate:'2025-03-01',storeId:1,jobTitleId:1,employmentType:'full',scheduleMode:'shift',status:'active',contacts:[{name:'合成',relationship:'友',phone:'0900000001'}]};
 const a=await service.create({...base,employeeNo:'SYN-A'},ctx),b=await service.create({...base,employeeNo:'SYN-B',name:'合成乙',nationalId:'B100000002'},ctx);
 const count=()=>f.sql.prepare("SELECT count(*) n FROM audit_events WHERE action='hr_employee.national_id.viewed'").get().n;
 assert.deepEqual(await self.nationalId(a.id),{nationalId:'A123456789'});
 assert.deepEqual(await self.nationalId(b.id),{nationalId:'B100000002'});
 assert.equal(self.nationalId.length,1,'takes only the bound employee row, no other parameter');
 assert.equal(count(),0,'self reveal writes no access audit');
 assert.equal((await service.reveal(a.id,ctx)).nationalId,'A123456789');assert.equal(count(),1,'admin reveal still audits');
 const route=readFileSync(new URL('../worker/http/hr-routes.ts',import.meta.url),'utf8');
 assert.match(route,/\/api\/business\/hr\/me\/national-id\/reveal/);assert.match(route,/self\.nationalId\(employee\)/);
 assert.doesNotMatch(route,/self\.nationalId\([^e]/,'never keyed by a request value');
});
const session={user:{employeeNo:'3001',emailVerified:true,email:'syn@example.test'}};
const synthetic={bound:true,employee:{employee_no:'3001',name:'合成員工',status:'active',gender:'男',birth_date:'1990-05-12',mobile:'0912345678',phone:null,mailing_address:'合成通訊地址',registered_address:'合成戶籍地址',hire_date:'2021-07-01',seniority_start_date:null,employment_type:'full',schedule_mode:'shift',nationalIdMasked:'A******789',store_name:'合成門市',job_title:'店長'},contacts:[{name:'合成聯絡',relationship:'友',phone:'0933000111'}],statusChanges:[],salaries:[],insurance:null,payslips:[]};
async function sheets(compact){
 globalThis.testCompact=compact;globalThis.hrTransport=async()=>synthetic;
 const host=new Host();try{
  const tree=await host.settle(MyProfilePage,{session});
  const panel=walk(tree).find(n=>n.type?.name==='SelfServicePanel');
  const el=panel.props.render({password:'pw',email:'em'});
  const out=walk(el.type(el.props)).filter(n=>n.type?.name==='FieldSheet').map(n=>n.props.rows.map(r=>r.map(c=>[c.label,c.span??1])));
  const out2=el.type(el.props);
  return {out,out2,titles:walk(out2).filter(n=>n.type==='h2').map(text),all:text(out2)};
 }finally{host.close();delete globalThis.hrHost;delete globalThis.testCompact}
}
test('我的資料 desktop: 帳號資料 section and the six-column 人事資料 grid in HR sheet order',async()=>{
 const {out,out2,titles,all}=await sheets(false);
 assert.deepEqual(titles,['帳號資料','人事資料']);
 assert.deepEqual(out[0],[[['員工編號',1],['密碼',2],['Email',3]]]);
 assert.deepEqual(out[1].map(r=>r.map(c=>c[0])),[['姓名','身分證字號','性別','出生日期','人事狀態'],['門市','職稱','僱用型態','排班方式','到職日','年資起算日'],['手機','市話','戶籍地址','通訊地址'],['緊急聯絡人姓名','關係','緊急聯絡人電話','']]);
 assert.deepEqual(out[1].map(r=>r.reduce((n,c)=>n+c[1],0)),[6,6,6,6]);
 assert.deepEqual(out[1][0].map(c=>c[1]),[1,1,1,1,2]);
 for(const label of ['學歷','工作經歷','綁定使用者','備註'])assert.ok(!all.includes(label),label+' is not shown');
 assert.ok(walk(out2).some(n=>n.type?.name==='RecordRows'&&n.props.title==='異動紀錄'),'other sections stay');
});
test('我的資料 phone: the chosen order, three-column status row, addresses full width',async()=>{
 const {out}=await sheets(true);
 assert.deepEqual(out[0].map(r=>r.map(c=>c[0])),[['員工編號','密碼'],['Email']]);
 assert.deepEqual(out[1].map(r=>r.map(c=>c[0])),[['姓名','身分證字號'],['性別','出生日期'],['門市','職稱'],['人事狀態','僱用型態','排班方式'],['到職日','年資起算日'],['手機','市話'],['戶籍地址'],['通訊地址'],['緊急聯絡人','緊急聯絡人電話']]);
});
test('我的資料 source: no 學歷／工作經歷／備註／綁定使用者, the self API drops education, empty values show a dash',()=>{
 const page=read('src/runtime/modules/MyProfilePage.tsx');assert.doesNotMatch(page,/學歷|工作經歷|綁定使用者|label:"備註"/);
 assert.doesNotMatch(read('worker/hr/hr-self-service.ts'),/education/);
 assert.match(page,/"—"/);assert.match(page,/<NationalIdReveal /);assert.match(read('src/runtime/modules/HrEmployeeSheet.tsx'),/<NationalIdReveal /);
 assert.doesNotMatch(read('src/runtime/modules/HrOperationalPage.tsx'),/setRevealed|cy-hr-revealed/);
});
test('dialog close guard: default copy is the discard confirmation; only App navigation uses 「切換模組」',()=>{
 const guard=read('src/ui/foundation/useUnsavedChangesGuard.ts');
 assert.match(guard,/title: "放棄未儲存的內容？"[^}]*confirmLabel: "放棄", cancelLabel: "繼續編輯"/);
 assert.match(guard,/\.\.\.DISCARD_COPY, \.\.\.options/);
 assert.match(read('src/App.tsx'),/guardCanLeave\(MODULE_SWITCH_COPY\)/);
 const users=['HrBonusPanel','HrPayrollCorrections','HrPayrollProfileEditor','HrAttendanceCorrections','HrPayrollLegalCases'];
 for(const f of users)assert.doesNotMatch(read('src/runtime/modules/'+f+'.tsx'),/切換模組/,f);
});
test('bonus dialog: a new, untouched dialog closes without asking; one employee uses a single form at medium width',()=>{
 const s=read('src/runtime/modules/HrBonusPanel.tsx');
 assert.match(s,/\[dirty,setDirty\]=useState\(false\)/);assert.match(s,/size=\{employee\?"medium":"large"\}/);
 assert.match(s,/\.\.\.\(employee\?\[/);assert.match(s,/\{employee\?null:<EntryTable label="獎金發放員工">/);
});
