import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {createHash} from 'node:crypto';
import {botCenterFixture} from './test-support/bot-center-fixture.mjs';
import {compiled,Host,walk,plugin} from './test-support/hr-ui-fixture.mjs';
const {HrService}=await compiled('worker/hr/hr-service.ts');
const {HrSelfService}=await compiled('worker/hr/hr-self-service.ts');
const {HrEmployeeSheet}=await compiled('src/runtime/modules/HrEmployeeSheet.tsx',[plugin]);
const {exportPortableBackup,restoreIntoEmptyDatabase,CURRENT_MIGRATION}=await compiled('worker/backup/portable-backup.ts');
const ctx={actor:1,now:new Date().toISOString(),requestId:'synthetic-ui-fixes'};
const day=n=>new Date(Date.now()+8*3600_000+n*86400_000).toISOString().slice(0,10);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const profile=(no,over={})=>({employeeNo:no,name:'合成員工'+no,nationalId:'A123456789',birthDate:'1990-01-01',gender:'F',mobile:'0900000000',mailingAddress:'合成地址',registeredAddress:'合成地址',hireDate:'2025-03-01',storeId:1,jobTitleId:1,employmentType:'full',scheduleMode:'shift',status:'active',contacts:[{name:'合成聯絡人',phone:'0911111111'}],education:[],workHistory:[],...over});
async function created(f,over={},no='SYNTH-UI'){const service=new HrService(f.db);const e=await service.create(profile(no,over),ctx);return {service,id:e.id,e};}

// ---- 1. profile sheet layout ----
const sheetProps=(over={})=>({value:{employeeNo:'S',name:'合成',status:'active',storeId:'1',jobTitleId:'1',employmentType:'full',scheduleMode:'shift',contacts:[{name:'甲',relationship:'乙',phone:'0900'}],education:[{school:'合成大學',department:'合成系',startMonth:'2010-09',endMonth:'2014-06',note:'學士'}],workHistory:[{company:'合成公司',jobTitle:'職',startMonth:'2015-01',endMonth:'2016-01',salary:'3',leaveReason:'因'}],mobile:'',phone:'',mailingAddress:'',registeredAddress:'',nationalId:'',hireDate:'',seniorityStartDate:'',note:'合成備註'},detail:null,editing:true,creating:false,busy:false,members:[],stores:[],jobTitles:[],patch(){},onReveal(){},...over});
test('profile sheet: 備註 sits in row 4 beside 人事狀態 under 通訊地址, one line, no separate row',()=>{
 const host=new Host();try{
  const tree=host.render(HrEmployeeSheet,sheetProps());const rows=walk(tree).find(n=>n.type?.name==='RecordSheet').props.rows;
  assert.equal(rows.length,4,'no fifth full-width 備註 row');
  assert.deepEqual(rows[3].cells.map(c=>c.label),['緊急聯絡人姓名','關係','緊急聯絡人電話','人事狀態','備註']);
  assert.deepEqual(rows[3].cells.map(c=>c.span??1),[1,1,1,1,2]);
  assert.equal(rows[3].cells.reduce((n,c)=>n+(c.span??1),0),6,'row 4 fills the six-column grid');
  // Same columns as 通訊地址 in row 3 (columns 5-6).
  const start=(row,label)=>{let at=0;for(const c of row.cells){if(c.label===label)return at;at+=c.span??1}};
  assert.equal(start(rows[3],'備註'),start(rows[2],'通訊地址'));
  assert.equal(rows.flatMap(r=>r.cells).filter(c=>c.label==='備註').length,1);
  assert.equal(rows[3].cells[4].edit.type,'input','single-line input in edit');
  const viewTree=host.render(HrEmployeeSheet,sheetProps({editing:false}));
  const view=walk(viewTree).find(n=>n.type?.name==='RecordSheet').props.rows[3].cells[4].view;
  assert.equal(view.props.className,'cy-hr-oneline');assert.equal(view.props.title,'合成備註');
 }finally{host.close();delete globalThis.hrHost}
});
test('學歷 and 工作經歷 share one column grid: 學校=公司, 科系=職稱+起迄, 就讀年月=薪資待遇, 備註=離職原因',()=>{
 const host=new Host();try{
  const tables=walk(host.render(HrEmployeeSheet,sheetProps())).filter(n=>n.type?.name==='RecordRows');
  const edu=tables.find(n=>n.props.title==='學歷').props,work=tables.find(n=>n.props.title==='工作經歷').props;
  assert.ok(edu.grid&&edu.grid===work.grid||JSON.stringify(edu.grid)===JSON.stringify(work.grid),'same colgroup widths');
  const starts=cols=>{let at=0;return Object.fromEntries(cols.map(c=>{const s=at;at+=c.span??1;return [c.label,[s,at]]}))};
  const e=starts(edu.columns),w=starts(work.columns);
  assert.deepEqual(edu.columns.map(c=>c.label),['學校','科系','就讀年月（起～迄）','備註']);
  assert.deepEqual(e['學校'],w['公司']);
  assert.deepEqual(e['科系'],[w['職稱'][0],w['起迄年月（起～迄）'][1]]);
  assert.deepEqual(e['就讀年月（起～迄）'],w['薪資待遇']);assert.deepEqual(e['備註'],w['離職原因']);
  assert.equal(edu.grid.length,5);
 }finally{host.close();delete globalThis.hrHost}
});
test('RecordRows honours the shared grid and column spans',()=>{
 const src=read('src/ui/forms/RecordSheet.tsx');
 assert.match(src,/grid\.map\(\(width, i\) => <col/);assert.match(src,/colSpan=\{grid \? column\.span : undefined\}/);
});

// ---- 2. education 備註 ----
test('education 備註: migration 0084, saved and returned, 200-character limit, optional',async t=>{
 const names=readdirSync(new URL('../migrations/',import.meta.url));assert.ok(names.includes('0084_hr_education_note.sql'));
 assert.match(read('migrations/0084_hr_education_note.sql'),/ALTER TABLE hr_education ADD COLUMN note TEXT;/);
 assert.equal(CURRENT_MIGRATION,'0087_hr_roster_text');
 const f=botCenterFixture();t.after(()=>f.sql.close());
 assert.ok(f.sql.prepare('PRAGMA table_info(hr_education)').all().some(c=>c.name==='note'&&c.notnull===0));
 const edu=[{school:'合成大學',department:'合成系',startMonth:'2010/09',endMonth:'2014/06',note:'學士，輔系'},{school:'合成高中',department:'',startMonth:'',endMonth:''}];
 const {service,id,e}=await created(f,{education:edu});
 assert.deepEqual(e.education.map(r=>r.note),['學士，輔系',null]);
 await assert.rejects(service.update(id,profile('SYNTH-UI',{education:[{school:'甲',note:'字'.repeat(201)}],revision:e.revision}),ctx),/格式不正確/);
 const ok=await service.update(id,profile('SYNTH-UI',{education:[{school:'甲',note:'字'.repeat(200)}],revision:e.revision}),ctx);
 assert.equal(ok.education[0].note.length,200);
 const me=await new HrSelfService(f.db).profile(id,day(0));
 assert.equal(me.education,undefined,'V0.29.2: 我的資料 no longer shows or receives 學歷');
});
test('education 備註 survives backup and restore; a pre-0084 backup (no note column) restores with NULL notes',async t=>{
 const f=botCenterFixture(),target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false}),older=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>{f.sql.close();target.sql.close();older.sql.close()});
 const {id}=await created(f,{education:[{school:'合成大學',department:'合成系',startMonth:'2010/09',endMonth:'2014/06',note:'學士'}]});
 const bundle=await exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.29.2'});
 assert.equal(JSON.parse(new TextDecoder().decode(bundle.manifestBytes)).schemaMigration,'0087_hr_roster_text');
 await restoreIntoEmptyDatabase(target.db,bundle,'synthetic');
 assert.deepEqual(target.sql.prepare('SELECT * FROM hr_education').all(),f.sql.prepare('SELECT * FROM hr_education').all());
 assert.equal(target.sql.prepare('SELECT note FROM hr_education WHERE employee_id=?').get(id).note,'學士');
 const data=JSON.parse(new TextDecoder().decode(bundle.dataBytes));const t0=data.tables.hr_education,at=t0.columns.indexOf('note');
 t0.columns.splice(at,1);t0.rows.forEach(r=>r.splice(at,1));
 const dataBytes=new TextEncoder().encode(JSON.stringify(data)),manifest=JSON.parse(new TextDecoder().decode(bundle.manifestBytes));
 manifest.schemaMigration='0083_hr_current_values';manifest.dataByteLength=dataBytes.length;manifest.dataSha256=createHash('sha256').update(dataBytes).digest('hex');
 manifest.recordCounts=Object.fromEntries(Object.entries(data.tables).map(([k,v])=>[k,v.rows.length]));manifest.totalRecordCount=Object.values(manifest.recordCounts).reduce((x,y)=>x+y,0);
 await restoreIntoEmptyDatabase(older.db,{dataBytes,manifestBytes:new TextEncoder().encode(JSON.stringify(manifest))},'synthetic');
 const row=older.sql.prepare('SELECT school,note FROM hr_education').get();assert.equal(row.school,'合成大學');assert.equal(row.note,null);
});

// ---- 3. 建檔 records are not 異動 ----
test('建檔 records are flagged is_creation and hidden from lists; the first real change still shows the 建檔 value as its previous value',async t=>{
 const f=botCenterFixture();t.after(()=>f.sql.close());
 f.sql.prepare("INSERT INTO hr_stores(name,cycle_anchor_date,created_at,updated_at) VALUES('合成第二門市','2026-01-05',?,?)").run(ctx.now,ctx.now);
 const {service,id}=await created(f);
 let d=await service.get(id);
 assert.ok(d.statusChanges.length===1&&d.statusChanges.every(r=>r.is_creation===true));
 assert.ok(d.assignmentChanges.length===4&&d.assignmentChanges.every(r=>r.is_creation===true));
 await service.statusChange(id,{reason:'支援第二門市',effectiveDate:day(-3),storeId:2},ctx);
 await service.statusChange(id,{reason:'留停',effectiveDate:day(-2),nextStatus:'leave'},ctx);
 d=await service.get(id);
 const real=d.assignmentChanges.filter(r=>!r.is_creation);assert.equal(real.length,1);
 assert.equal(real[0].field,'store_id');assert.equal(real[0].previous_value,'1','previous value comes from the 建檔 record');assert.equal(real[0].next_value,'2');
 const realStatus=d.statusChanges.filter(r=>!r.is_creation);assert.equal(realStatus.length,1);assert.equal(realStatus[0].previous_status,'active');
 assert.equal(d.assignmentChanges.filter(r=>r.is_creation).length,4,'建檔 records stay in the database and the response');
 // The self-service profile never lists 建檔.
 const self=await new HrSelfService(f.db).profile(id,day(0));
 assert.deepEqual(self.statusChanges.map(r=>[r.previous_status,r.next_status]),[['active','leave']]);
 // A change a user typed with the reason 建檔 is still a change (it has a previous value).
 await service.statusChange(id,{reason:'建檔',effectiveDate:day(-1),jobTitleId:2},ctx);
 d=await service.get(id);assert.equal(d.assignmentChanges.filter(r=>!r.is_creation&&r.field==='job_title_id').length,1);
});
test('the UI lists only real changes: filter, count and full list use personnelChanges',()=>{
 const src=read('src/runtime/modules/HrOperationalPage.tsx');
 assert.match(src,/employee\.statusChanges\.filter\(r=>r\.is_creation!==true\)/);
 assert.match(src,/employee\.assignmentChanges\?\?\[\]\)\.filter\(r=>r\.is_creation!==true\)/);
 assert.match(src,/count=\{personnelChanges\(detail\)\.length\}/);
 const my=read('src/runtime/modules/MyProfilePage.tsx');assert.doesNotMatch(my,/建檔（/);
});

// ---- 4. status table columns ----
test('status table: 生效日期 | 異動日期 | 異動內容 | 原因, dates nowrap, 待生效 stays with 生效日期, normal font size',()=>{
 const src=read('src/runtime/modules/HrOperationalPage.tsx');
 assert.match(src,/<thead><tr><th>生效日期<\/th><th>異動日期<\/th><th>異動內容<\/th><th>原因<\/th><\/tr><\/thead>/);
 assert.doesNotMatch(src,/生效／異動日期/);
 assert.match(src,/data-label="生效日期"[^>]*className="nowrap">\{date\(row\.effective_date\)\}\{row\.effective_date>taipeiToday\(\)\?<small className="cy-hr-pending">待生效<\/small>/);
 assert.match(src,/data-label="異動日期" className="nowrap"/);
 const css=read('src/runtime/modules/hr-operational.css');
 const block=css.slice(css.indexOf('.cy-hr-status-table{'),css.indexOf('/* 狀態異動：勾選才異動'));
 assert.match(block,/td\.nowrap\{white-space:nowrap/);
 assert.doesNotMatch(css,/\.cy-hr-status-table\s*\{[^}]*font-size/);
});

// ---- 5. shared UI ----
test('focus ring is one complete inset ring; search is compact; year picker shares MonthPicker; roster boundary and borders',()=>{
 const forms=read('src/ui/forms.css');const focus=forms.slice(forms.indexOf('.cy-input:focus'),forms.indexOf('.cy-input:disabled'));
 assert.match(focus,/outline: 2px solid var\(--cy-accent\)/);assert.match(focus,/outline-offset: -2px/);assert.doesNotMatch(focus,/box-shadow: 0 0 0 3px/);
 assert.match(read('src/ui/data/data-view.css'),/\.cy-data-search \{[^}]*max-width: 280px/);
 const picker=read('src/ui/forms/MonthPicker.tsx');assert.match(picker,/precision === "year"/);assert.match(picker,/cy-year-grid/);
 for(const f of ['HrLeavePanel','HrBonusPanel','MyProfilePage','HrPhase2aSettings']){const s=read('src/runtime/modules/'+f+'.tsx');assert.doesNotMatch(s,/>上一年<|>下一年<|>上個月<|>下個月</,f);assert.match(s,/precision="year"/,f)}
 const roster=read('src/runtime/modules/HrRosterPanel.tsx');
 assert.equal((roster.match(/dayClass\(d\)/g)||[]).length,4,'header day, weekday, every cell and 每日人力 share one class function');
 const css=read('src/runtime/modules/hr-phase2a.css');assert.doesNotMatch(css,/hr-group-start/);assert.doesNotMatch(css,/font-size:11px/);
 assert.match(read('src/app.css'),/tbody:last-of-type > tr:last-child > td \{ border-bottom: 0; \}/);
});

// ---- 6. review round (V0.29.1 follow-up) ----
test('roster: uniform fixed day columns that fit a 31-day month, 每日人力 wraps instead of widening',()=>{
 const css=read('src/runtime/modules/hr-phase2a.css'),tsx=read('src/runtime/modules/HrRosterPanel.tsx');
 const block=css.slice(css.indexOf('.hr-roster-table{--cy-roster-holiday'),css.indexOf('/* 國定假日／週末底色'));
 assert.match(block,/table-layout:fixed;width:100%;min-width:1100px/);
 assert.doesNotMatch(block,/min-width:38px|width:max-content/);
 assert.match(block,/\.hr-staffing td\{font-size:13px;[^}]*white-space:normal/);
 assert.match(tsx,/<colgroup><col className="hr-col-title"\/><col className="hr-col-name"\/>\{dates\.map\(d=><col key=\{d\}\/>\)\}<col className="hr-col-note"\/><\/colgroup>/);
 assert.match(block,/font-size:14px/);
});
test('money: a zero deduction is 0, never −0 or $-0, in every HR formatter',()=>{
 for(const f of ['HrOperationalPage','MyProfilePage','HrPayrollDetail','HrBonusPanel','HrSalaryOverview','HrPayrollMonthly']){
  const src=read('src/runtime/modules/'+f+'.tsx');const line=src.split('\n').find(l=>/^const money\s*=/.test(l));
  assert.match(line,/\(\w+\|\|0\)\.toLocaleString/,f+' normalises -0');
 }
 for(const f of ['HrPayrollMonthly','HrPayrollDetail']){const src=read('src/runtime/modules/'+f+'.tsx');assert.match(src,/const minus=\(v:number\)=>v\?'−'\+money\(v\)\.slice\(1\):'0'/,f);assert.doesNotMatch(src,/'−'\+money\(run\.deductions\)|−\{money\(summary/,f)}
 assert.equal((-0||0).toLocaleString('zh-TW'),'0');
});
test('salary dialog: current-pay line is a notice above the form; empty 津貼 shows one message and 「＋ 新增津貼」',()=>{
 const src=read('src/runtime/modules/HrOperationalPage.tsx');
 assert.match(src,/<p className="cy-notice cy-hr-salary-current" role="note">/);assert.doesNotMatch(src,/colSpan=\{4\} data-label="目前設定"/);
 assert.match(src,/allowances\.length===0\?<section className="cy-sheet-rows" aria-label="津貼">/);assert.match(src,/＋ 新增津貼/);
});
test('settings, attendance, leave and phone fixes are in place',()=>{
 const s=read('src/runtime/modules/HrPayrollSettings.tsx');assert.equal((s.match(/empty=\{loaded&&/g)||[]).length,2);
 assert.match(read('src/runtime/modules/HrAttendancePanel.tsx'),/<option value="">無員工<\/option>/);
 assert.match(read('src/runtime/modules/HrRosterPanel.tsx'),/<option value="">無門市<\/option>/);
 const leave=read('src/runtime/modules/HrLeavePanel.tsx');assert.doesNotMatch(leave,/"／"\+period/);assert.match(leave,/" "\+period/);
 const op=read('src/runtime/modules/HrOperationalPage.tsx');assert.equal((op.match(/data-label="異動日期" className="nowrap" data-priority="wide"/g)||[]).length,2,'日期 cell spans the card so no blank block appears beside it');
 const flow=read('src/runtime/modules/hr-payroll-flow.css');assert.match(flow,/\.cy-hr-profile-form \.cy-entry-table td\[data-entry-label\]\{grid-template-columns:minmax\(0,1fr\)\}/);assert.match(flow,/grid-template-areas:"d b" "p p" "a a" "r r"!important/);
 assert.match(read('src/runtime/modules/HrPayrollProfileEditor.tsx'),/cy-hr-profile-form/);
});


test("roster quick picker and staff table use agreed compact controls",()=>{
 const roster=read("src/runtime/modules/HrRosterPanel.tsx"),css=read("src/runtime/modules/hr-phase2a.css");
 const picker=roster.slice(roster.indexOf('<Dialog open={cell!==null}'),roster.indexOf('<Dialog dismissible={!loading} open={staff'));
 assert.match(picker,/size="small"/);assert.match(picker,/休假／請假/);assert.match(picker,/例休日/);assert.doesNotMatch(picker,/例假日|休假日/);assert.match(picker,/<MonthPicker precision="day"/);assert.match(picker,/<ExpandToggle variant="down"/);assert.match(picker,/className="hr-cell-actions"/);assert.match(picker,/套用並下一格/);assert.match(picker,/label="備註"/);assert.doesNotMatch(picker,/註記|EntryFields/);
 assert.match(roster,/<th aria-label="拖拉排序"><\/th><th className="hr-staff-center">項次<\/th><th className="hr-staff-center">員工編號<\/th><th>姓名<\/th><th>職稱<\/th>/);
 assert.match(roster,/title="門市人員設定" size="medium"/);
 assert.match(roster,/const movable=staff\.length>1/);
 assert.doesNotMatch(roster,/sameGroup|old\[from\]\.job_title_id/);
 assert.match(roster,/<td className="hr-staff-center">\{i\+1\}<\/td>/);
 assert.match(css,/vertical-align:middle;text-align:left;padding:6px 8px/);
});


test("roster draft off classification and repeat choice retain existing next cells",()=>{
 const roster=read("src/runtime/modules/HrRosterPanel.tsx"),css=read("src/runtime/modules/hr-phase2a.css");
 assert.match(roster,/if\(!existing\)\{setChoice\(choice\);if\(choice.kind==="hours"\)setHours\(hours\);\}/);
 assert.match(roster,/classifyRoster\(input,context.previousRegular/);
 assert.match(roster,/if\(staff.skip_roster_checks===1\)return ""/);
 assert.match(roster,/classified==="regular_off"\?"例":classified==="rest_day"\?"休":""/);
 assert.match(roster,/classificationMonth:data.month/);
 assert.match(roster,/value\?\.kind==="leave"\|\|value\?\.kind==="off"&&value.off_mark!=="x"\?"hr-roster-off"/);
 assert.match(css,/\.hr-cell-actions\{display:flex;justify-content:flex-end/);
 assert.match(css,/\.hr-cell-leave-row \.cy-expand-toggle\{margin-left:auto\}/);
 assert.match(css,/linear-gradient\(to top right/);
});

test("roster heading, name column and staffing row have stronger section dividers",()=>{
 const css=read("src/runtime/modules/hr-phase2a.css");
 assert.ok(css.includes('thead tr:first-child>th[rowspan]'));
 assert.ok(css.includes('thead tr:last-child>th'));
 assert.ok(css.includes('tbody>tr>th[scope="row"]'));
 assert.ok(css.includes('tbody>tr>th[colspan="2"]'));
 assert.ok(css.includes('tbody>tr.hr-staffing>*{border-top:var(--hr-roster-divider)}'));
 assert.ok(css.includes('tbody>tr.hr-staffing>*{border-bottom:var(--hr-roster-divider)}'));
});

test("roster holiday columns, center alignment and settings shortcut",()=>{
 const roster=read("src/runtime/modules/HrRosterPanel.tsx"),css=read("src/runtime/modules/hr-phase2a.css");
 assert.match(roster,/holidays.has\(d\)\?"hr-national-holiday "/);
 assert.doesNotMatch(roster,/每日人力為全門市|<small>\{holidays.get\(d\)\}/);
 assert.match(roster,/<HrSettingsButton holidayYear=/);
 assert.match(css,/td.hr-national-holiday\{background-color:/);
 assert.match(css,/linear-gradient\(to top right/);
 assert.match(css,/align-items:center;justify-content:center;text-align:center/);
 const settings=read("src/runtime/modules/HrPhase2aSettings.tsx");
 assert.match(settings,/\["","項次","名稱",/);
 assert.match(settings,/method:"PUT",json:\{ids:next.map/);
 assert.doesNotMatch(settings,/<Field label="排序"/);
 assert.match(settings,/<ReorderHandle/);
 assert.match(settings,/<th className="cy-hrs-seq">項次<\/th><th>名稱<\/th><th className="cy-hrs-date">日期<\/th><th>備註<\/th>/);
 assert.match(read("src/runtime/modules/HrPayrollSettings.tsx"),/formatDateTime\(s.checked_at\)/);
});

test("roster text settings, monthly notes and every leave diagonal",()=>{
 const ui=read("src/runtime/modules/HrRosterPanel.tsx"),css=read("src/runtime/modules/hr-phase2a.css");
 assert.match(ui,/value\?\.kind==="leave"\|\|value\?\.kind==="off"&&value.off_mark!=="x"/);
 assert.match(ui,/"國":"國定假日"/);
 assert.ok(ui.indexOf(">不用來</button>")<ui.indexOf('<section aria-label="休假／請假">'));
 assert.match(ui,/noteItems.length<MAX_ROSTER_NOTES/);
 assert.match(ui,/item.prefix===null\?<button/);
 assert.match(ui,/className="hr-roster-rules">\{data.rules\}/);
 assert.match(ui,/staff.name\+"本月備註"/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(read("src/runtime/modules/HrSettingsButton.tsx"),/label:"預設文字"/);
 assert.match(read("src/runtime/modules/HrRosterTextSettings.tsx"),/storeIds.includes\(s.id\)/);
});

test("roster autosave serializes and acknowledges only submitted revisions; staffing and notes layout",()=>{
 const ui=read("src/runtime/modules/HrRosterPanel.tsx"),css=read("src/runtime/modules/hr-phase2a.css");
 assert.match(ui,/sentChanges\[key\]!==value/);
 assert.match(ui,/current.noteItems===sentNotes\?next.noteItems:current.noteItems/);
 assert.match(ui,/if\(saveLane.current\)\{saveAgain.current=true/);
 assert.match(ui,/onBlur=\{\(\)=>void submit\(\)\}/);
 assert.match(ui,/gridColumn:Math.floor\(i\/3\)\+1,gridRow:i%3\+1/);
 assert.match(ui,/className="hr-staffing-line"/);
 assert.match(css,/grid-template-rows:repeat\(3,minmax\(26px,auto\)\)/);
 const save=ui.slice(ui.indexOf(" async function saveSnapshot"),ui.indexOf(" async function chooseMonth"));
 assert.doesNotMatch(save,/await reload\(|setLoading\(true\)|setData\(null\)/);
});
