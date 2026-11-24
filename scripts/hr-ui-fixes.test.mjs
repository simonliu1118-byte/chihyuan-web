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
 assert.equal(CURRENT_MIGRATION,'0084_hr_education_note');
 const f=botCenterFixture();t.after(()=>f.sql.close());
 assert.ok(f.sql.prepare('PRAGMA table_info(hr_education)').all().some(c=>c.name==='note'&&c.notnull===0));
 const edu=[{school:'合成大學',department:'合成系',startMonth:'2010/09',endMonth:'2014/06',note:'學士，輔系'},{school:'合成高中',department:'',startMonth:'',endMonth:''}];
 const {service,id,e}=await created(f,{education:edu});
 assert.deepEqual(e.education.map(r=>r.note),['學士，輔系',null]);
 await assert.rejects(service.update(id,profile('SYNTH-UI',{education:[{school:'甲',note:'字'.repeat(201)}],revision:e.revision}),ctx),/格式不正確/);
 const ok=await service.update(id,profile('SYNTH-UI',{education:[{school:'甲',note:'字'.repeat(200)}],revision:e.revision}),ctx);
 assert.equal(ok.education[0].note.length,200);
 const me=await new HrSelfService(f.db).profile(id,day(0));
 assert.equal(me.education[0].note.length,200,'the self-service profile returns the note too');
});
test('education 備註 survives backup and restore; a pre-0084 backup (no note column) restores with NULL notes',async t=>{
 const f=botCenterFixture(),target=botCenterFixture('SUPER_ADMIN',false,{seedMember:false}),older=botCenterFixture('SUPER_ADMIN',false,{seedMember:false});t.after(()=>{f.sql.close();target.sql.close();older.sql.close()});
 const {id}=await created(f,{education:[{school:'合成大學',department:'合成系',startMonth:'2010/09',endMonth:'2014/06',note:'學士'}]});
 const bundle=await exportPortableBackup(f.db,{workspaceScope:'synthetic',appVersion:'0.29.1'});
 assert.equal(JSON.parse(new TextDecoder().decode(bundle.manifestBytes)).schemaMigration,'0084_hr_education_note');
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
