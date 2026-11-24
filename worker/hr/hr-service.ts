import { annualLeaveSchedule } from "../../shared/hr-annual-leave";
import { maskTaiwanId } from "../../shared/national-id";
import { AuditService } from "../audit/audit-service";
import { date, employeeNumber, HrValidationError, integer, month, nationalId, nullableDate, object, optional, required, rows, status } from "./hr-validation";

export interface HrContext { actor: number; requestId: string; now: string }
const CHILDREN = [
  { field: "contacts", table: "hr_emergency_contacts", columns: ["name","relationship","phone"], names: ["name","relationship","phone"] },
  { field: "education", table: "hr_education", columns: ["school","department","start_month","end_month","note"], names: ["school","department","startMonth","endMonth","note"] },
  { field: "workHistory", table: "hr_work_history", columns: ["company","job_title","start_month","end_month","salary","leave_reason"], names: ["company","jobTitle","startMonth","endMonth","salary","leaveReason"] },
] as const;
const fields = ["employee_no","name","member_id","national_id","birth_date","gender","mobile","phone","mailing_address","registered_address","hire_date","seniority_start_date","note","store_id","job_title_id","roster_sort","employment_type","skip_roster_checks","schedule_mode"] as const;
const bodyFields = ["employeeNo","name","memberId","nationalId","birthDate","gender","mobile","phone","mailingAddress","registeredAddress","hireDate","seniorityStartDate","note","storeId","jobTitleId","rosterSort","employmentType","skipRosterChecks","scheduleMode"] as const;
type Scalar = string | number | null;
function requiredNationalId(value: unknown): string {
  const id = nationalId(value);
  if (!id) throw new HrValidationError("nationalId","身分證字號必填");
  return id;
}
function normalizeProfile(raw: unknown) {
  const v = object(raw);
  const hireDate = date(v.hireDate,"hireDate");
  const memberId = v.memberId == null || v.memberId === "" ? null : integer(v.memberId,"memberId",true);
  const vals: Scalar[] = [
    employeeNumber(v.employeeNo), required(v.name,"name",120), memberId, requiredNationalId(v.nationalId),
    date(v.birthDate,"birthDate"), required(v.gender,"gender",20),
    optional(v.mobile,"mobile",30),optional(v.phone,"phone",30),
    required(v.mailingAddress,"mailingAddress",300),required(v.registeredAddress,"registeredAddress",300),
    hireDate, v.seniorityStartDate ? date(v.seniorityStartDate,"seniorityStartDate") : hireDate,
    optional(v.note,"note",2000),
    integer(v.storeId,"storeId",true),
    integer(v.jobTitleId,"jobTitleId",true),
    integer(v.rosterSort??0,"rosterSort"),
    String(v.employmentType??"full"),
    v.skipRosterChecks===true||v.skipRosterChecks===1?1:0,
    String(v.scheduleMode??"shift"),
  ];
  if(!["full","half","casual"].includes(String(vals[16])))throw new HrValidationError("employmentType","僱用型態錯誤");
  const employment=String(vals[16]),mode=String(vals[18]);
  if(!["shift","hours","none"].includes(mode)||employment==="full"&&mode!=="shift"||employment==="half"&&mode==="none")throw new HrValidationError("scheduleMode","排班方式與僱用型態不符");
  const children = CHILDREN.map(g=>({ ...g, values: rows(v[g.field],g.field).map((row,index)=>{
    const record: Scalar[] = g.names.map((key)=>{
      const value = row[key]; if (key === "startMonth" || key === "endMonth") return month(value,key);
      if (key==="name" || key==="phone" && g.field==="contacts" || key==="school" || key==="company") return required(value,key,150);
      return g.field==="education"&&key==="note"?optional(value,"educationNote",200):optional(value,key,1000);
    });
    if (index>49) throw new HrValidationError(g.field,"過多子表紀錄");
    return record;
  })}));
  if (!vals[6] && !vals[7]) throw new HrValidationError("mobile","手機、市話至少填一個");
  if (!children.find(g=>g.field==="contacts")?.values.length) throw new HrValidationError("contacts","至少要有一位緊急聯絡人");
  return { vals, children };
}
function sanitized(row: Record<string, unknown>) {
  const { national_id, ...rest } = row;
  return { ...rest, nationalIdMasked: maskTaiwanId(typeof national_id==="string" ? national_id : null) };
}
function audit(db:D1Database, ctx:HrContext, type:string, key:string, action:string, before: Record<string, unknown> | null, after:Record<string,unknown>|null) {
  return new AuditService(db).prepareRecord({entityType:type,entityKey:key,action,actorEmployeeId:ctx.actor,requestId:ctx.requestId,before,after});
}
// Anything done for an employee after the record was created. Profile rows (contacts, education, work
// history), the 建檔 status change and the leave entitlement derived on viewing do not count.
const ACTIVITY_TABLES=["hr_salary_records","hr_bonus_payments","hr_leave_records","hr_overtime_days","hr_comp_time_grants","hr_comp_time_settlements","hr_seniority_exclusions","hr_schedule_days","hr_roster_approvals","hr_attendance_days"];
// The 建檔 records (one status record, one assignment record per field) are written with the employee and do not count; any other record does.
const HAS_ACTIVITY="("+ACTIVITY_TABLES.map(t=>`EXISTS(SELECT 1 FROM ${t} WHERE employee_id=?1)`).join(" OR ")+" OR (SELECT COUNT(*) FROM hr_status_changes WHERE employee_id=?1)>1 OR EXISTS(SELECT 1 FROM hr_assignment_changes WHERE employee_id=?1 AND (previous_value IS NOT NULL OR reason<>'建檔')))";
const ASSIGNMENT_FIELDS=[["storeId","store_id"],["jobTitleId","job_title_id"],["employmentType","employment_type"],["scheduleMode","schedule_mode"]] as const;
type AssignmentField=typeof ASSIGNMENT_FIELDS[number][1];
interface StatusRecord{id:number;effective_date:string;previous_status:string;next_status:string}
interface AssignmentRecord{id:number;field:string;effective_date:string;previous_value:string|null;next_value:string}
function earliestOf<T extends {id:number;effective_date:string}>(records:T[]):T|undefined{
  return [...records].sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||a.id-b.id)[0];
}
/** What one assignment field was before its first record: that record's previous value (a 建檔 record has none: its own value). */
function startValue(records:AssignmentRecord[]):string|null{const first=earliestOf(records);return first?first.previous_value??first.next_value:null;}
/** Where a ledger's walk starts. A 建檔 record (no previous value) is its own baseline and is never "no change". */
const assignmentStart=(records:AssignmentRecord[])=>{const first=earliestOf(records);return {base:first?.previous_value??null,anchor:first!==undefined&&first.previous_value==null};};
/** The record in force on `at`: latest effective date not after it, ties by larger id (the ledger's ordering rule). */
function latestAt<T extends {id:number;effective_date:string}>(records:T[],at:string):T|undefined{
  let best:T|undefined;
  for(const r of records){if(r.effective_date>at)continue;if(!best||r.effective_date>best.effective_date||r.effective_date===best.effective_date&&r.id>best.id)best=r;}
  return best;
}
const FIELD_NAMES:Record<"status"|AssignmentField,string>={status:"人事狀態",store_id:"門市",job_title_id:"職稱",employment_type:"僱用型態",schedule_mode:"排班方式"};
const STATUS_NAMES:Record<string,string>={probation:"試用",active:"在職",leave:"留職停薪",terminated:"離職"};
const TYPE_NAMES:Record<string,string>={full:"正職",half:"半職",casual:"兼職",shift:"班別",hours:"時段或時數",none:"不排班"};
/**
 * Walks one field's records in ledger order (生效日期, then id) and tells what each record replaced.
 * `previous` is computed here, not read from the stored previous_value/previous_status, because a back-dated record
 * inserted later changes what came before the records after it. `noEffect` marks a record whose new value equals the
 * value already in force. `anchor` keeps the earliest record of a ledger whose baseline lives in the record itself (建檔).
 */
function walkLedger<T extends {id:number;effective_date:string}>(records:T[],base:string|null,next:(r:T)=>string,anchor=false):Map<T,{previous:string|null;noEffect:boolean}>{
  const sorted=[...records].sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||a.id-b.id),out=new Map<T,{previous:string|null;noEffect:boolean}>();
  let running=base;
  sorted.forEach((r,i)=>{
    const previous=running,value=next(r);
    out.set(r,{previous,noEffect:!(anchor&&i===0)&&previous!==null&&previous===value});
    running=value;
  });
  return out;
}
export class HrService {
  constructor(private db:D1Database) {}
  private employeeRow(id:number) { return this.db.prepare("SELECT e.* FROM hr_employee_current e WHERE e.id=?").bind(id).first<Record<string,unknown>>(); }
  /** Filters match the current projection (today's effective status, store and employment type). */
  async list(q:string,statusFilter:string|undefined,cursor:number,limit=40,filters:{storeId?:number;employmentType?:string}={}) {
    const terms=["e.id>?"],values:(string|number)[]=[cursor];
    if(q){terms.push("(e.employee_no LIKE ? OR e.name LIKE ?)");values.push("%"+q.slice(0,80)+"%","%"+q.slice(0,80)+"%");}
    if(statusFilter){status(statusFilter);terms.push("e.status=?");values.push(statusFilter);}
    if(filters.storeId!==undefined){terms.push("e.store_id=?");values.push(integer(filters.storeId,"storeId",true));}
    if(filters.employmentType!==undefined){
      if(!["full","half","casual"].includes(filters.employmentType))throw new HrValidationError("employmentType","僱用型態錯誤");
      terms.push("e.employment_type=?");values.push(filters.employmentType);
    }
    const found=await this.db.prepare("SELECT e.*,s.name AS store_name FROM hr_employee_current e LEFT JOIN hr_stores s ON s.id=e.store_id WHERE "+terms.join(" AND ")+" ORDER BY e.id LIMIT ?").bind(...values,Math.min(limit,100)+1).all<Record<string,unknown>>();
    const all=found.results??[];return {items:all.slice(0,limit).map(sanitized),nextCursor:all.length>limit?Number(all[limit-1].id):null};
  }
  async get(id:number) {
    const employee=await this.employeeRow(id);
    if(!employee) throw new HrValidationError("id","人事資料不存在",404);
    const result:Record<string,unknown>={...sanitized(employee)};
    if(employee.member_id){const m=await this.db.prepare("SELECT employee_no,display_name FROM app_members WHERE id=?").bind(employee.member_id).first<{employee_no:string|null;display_name:string|null}>();
      result.memberLabel=m?[m.employee_no,m.display_name].filter(Boolean).join(" ")||null:null;}
    for(const child of CHILDREN){const data=await this.db.prepare("SELECT * FROM "+child.table+" WHERE employee_id=? ORDER BY sort_order,id").bind(id).all();result[child.field]=data.results??[];}
    // 異動日期 = the Taipei date the record was written, derived from created_at.
    // 舊值 is computed from the preceding record of the same field (the first record, 建檔, has none); the stored previous_* columns
    // are kept for audit only and returned as stored_previous_*. no_effect marks a record that changes nothing.
    const statusRows=((await this.db.prepare("SELECT *,date(created_at,'+8 hours') AS recorded_date FROM hr_status_changes WHERE employee_id=? ORDER BY effective_date DESC,id DESC").bind(id).all<StatusRecord&Record<string,unknown>>()).results??[]);
    const assignmentRows=((await this.db.prepare("SELECT *,date(created_at,'+8 hours') AS recorded_date FROM hr_assignment_changes WHERE employee_id=? ORDER BY effective_date DESC,id DESC").bind(id).all<AssignmentRecord&Record<string,unknown>>()).results??[]);
    const earliestStatus=[...statusRows].sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||a.id-b.id)[0];
    const statusWalk=walkLedger(statusRows,earliestStatus?.previous_status??null,r=>r.next_status,true);
    // is_creation marks the 建檔 records (the values the employee was created with). They stay in the ledger as the first
    // record's predecessor, but are the employee's 建檔資料, not a 異動, so lists of changes leave them out.
    result.statusChanges=statusRows.map(r=>({...r,stored_previous_status:r.previous_status,previous_status:statusWalk.get(r)?.previous??r.previous_status,no_effect:statusWalk.get(r)?.noEffect??false,
      is_creation:(r as Record<string,unknown>).reason==="建檔"&&r.previous_status===r.next_status}));
    const assignmentWalk=new Map<AssignmentRecord,{previous:string|null;noEffect:boolean}>();
    for(const [,field] of ASSIGNMENT_FIELDS){
      const own=assignmentRows.filter(r=>r.field===field),start=assignmentStart(own);
      for(const [r,x] of walkLedger(own,start.base,r=>r.next_value,start.anchor))assignmentWalk.set(r,x);
    }
    result.assignmentChanges=assignmentRows.map(r=>({...r,stored_previous_value:(r as Record<string,unknown>).previous_value,previous_value:assignmentWalk.get(r)?.previous??null,no_effect:assignmentWalk.get(r)?.noEffect??false,
      is_creation:(r as Record<string,unknown>).reason==="建檔"&&r.previous_value==null}));
    for(const [key,table] of [["salaryRecords","hr_salary_records"],["seniorityExclusions","hr_seniority_exclusions"]] as const){
      const data=await this.db.prepare("SELECT * FROM "+table+" WHERE employee_id=? ORDER BY effective_date DESC,id DESC".replace("effective_date",key==="seniorityExclusions"?"start_date":"effective_date")).bind(id).all();
      result[key]=data.results??[];
    }
    const salary=result.salaryRecords as Record<string,unknown>[];
    for (const item of salary) {
      const allowance=await this.db.prepare("SELECT a.*,t.name AS item_name FROM hr_salary_allowances a JOIN hr_salary_item_types t ON t.id=a.item_type_id WHERE a.salary_record_id=? ORDER BY a.id").bind(item.id).all();
      item.allowances=allowance.results??[];
    }
    result.deletable=!(await this.db.prepare("SELECT "+HAS_ACTIVITY+" AS busy").bind(id).first<{busy:number}>())?.busy;
    return result;
  }
  /** Bulk read for the salary overview. No per-employee requests, no national IDs, no mutations. */
  async salaryOverview(){
    const [employees,salaries]=await Promise.all([
      this.db.prepare("SELECT e.id,e.employee_no,e.name,e.store_id,s.name AS store_name,j.name AS job_title,"+
        "e.status AS effective_status FROM hr_employee_current e LEFT JOIN hr_stores s ON s.id=e.store_id "+
        "LEFT JOIN hr_job_titles j ON j.id=e.job_title_id ORDER BY e.employee_no,e.id").all<{
          id:number;employee_no:string;name:string;store_id:number|null;store_name:string|null;job_title:string|null;effective_status:string
        }>(),
      this.db.prepare("SELECT r.id AS salary_id,r.employee_id,r.effective_date,r.payment_type,r.base_amount,r.reason,"+
        "m.display_name AS created_by_name,a.id AS allowance_id,a.amount AS allowance_amount,a.is_regular,t.name AS item_name "+
        "FROM hr_salary_records r LEFT JOIN hr_salary_allowances a ON a.salary_record_id=r.id "+
        "LEFT JOIN hr_salary_item_types t ON t.id=a.item_type_id LEFT JOIN app_members m ON m.id=r.created_by "+
        "ORDER BY r.employee_id,r.effective_date DESC,r.id DESC,a.id").all<{
          salary_id:number;employee_id:number;effective_date:string;payment_type:string;base_amount:number;reason:string;
          created_by_name:string|null;allowance_id:number|null;allowance_amount:number|null;is_regular:number|null;item_name:string|null
        }>()
    ]);
    type Salary={id:number;effective_date:string;payment_type:string;base_amount:number;reason:string;
      created_by_name:string|null;allowances:{item_name:string;amount:number;is_regular:number}[]};
    const result=(employees.results??[]).map(employee=>({
      id:employee.id,employeeNo:employee.employee_no,name:employee.name,
      storeId:employee.store_id,storeName:employee.store_name,jobTitle:employee.job_title,
      status:employee.effective_status,salaryRecords:[] as Salary[]
    }));
    const byEmployee=new Map(result.map(row=>[row.id,row]));
    const bySalary=new Map<number,Salary>();
    for(const row of salaries.results??[]){
      const employee=byEmployee.get(row.employee_id);
      if(!employee)continue;
      let record=bySalary.get(row.salary_id);
      if(!record){
        record={id:row.salary_id,effective_date:row.effective_date,payment_type:row.payment_type,
          base_amount:row.base_amount,reason:row.reason,created_by_name:row.created_by_name,allowances:[]};
        bySalary.set(row.salary_id,record);employee.salaryRecords.push(record);
      }
      if(row.allowance_id!==null)record.allowances.push({item_name:row.item_name??"",
        amount:row.allowance_amount??0,is_regular:row.is_regular??0});
    }
    return result;
  }

  async create(raw:unknown,ctx:HrContext) {
    const v=object(raw);const profile=normalizeProfile(raw);
    const initial=status(v.status??"probation");
    if(initial==="terminated")throw new HrValidationError("status","離職須透過狀態異動記錄離職日與原因");
    const no=String(profile.vals[0]);
    const statements:D1PreparedStatement[]=[
      this.db.prepare("INSERT INTO hr_employees ("+fields.join(",")+",status,created_at,updated_at,created_by,updated_by) VALUES ("+fields.map(()=>"?").join(",")+",?,?,?,?,?)")
        .bind(...profile.vals,initial,ctx.now,ctx.now,ctx.actor,ctx.actor),
    ];
    for(const child of profile.children)for(const [idx,values] of child.values.entries()){
      statements.push(this.db.prepare("INSERT INTO "+child.table+" (employee_id,"+child.columns.join(",")+",sort_order) SELECT id,"+child.columns.map(()=>"?").join(",")+",? FROM hr_employees WHERE employee_no=?").bind(...values,idx,no));
    }
    statements.push(this.db.prepare("INSERT INTO hr_status_changes(employee_id,effective_date,previous_status,next_status,reason,handled_by,created_at) SELECT id,?,?,?,?,?,? FROM hr_employees WHERE employee_no=?").bind(String(profile.vals[10]),initial,initial,"建檔",ctx.actor,ctx.now,no));
    // 建檔 records: every one of the five fields starts its own history at the hire date.
    for(const [,field] of ASSIGNMENT_FIELDS)statements.push(this.db.prepare("INSERT INTO hr_assignment_changes(employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at) SELECT id,?,?,NULL,CAST("+field+" AS TEXT),?,?,? FROM hr_employees WHERE employee_no=?").bind(field,String(profile.vals[10]),"建檔",ctx.actor,ctx.now,no));
    statements.push(audit(this.db,ctx,"hr_employee",no,"hr_employee.created",null,{employeeNo:no,name:profile.vals[1],status:initial,nationalIdMasked:maskTaiwanId(profile.vals[3] as string|null)}));
    await this.db.batch(statements);
    const row=await this.db.prepare("SELECT id FROM hr_employees WHERE employee_no=?").bind(no).first<{id:number}>();
    return this.get(row!.id);
  }
  async update(id:number,raw:unknown,ctx:HrContext) {
    const v=object(raw);const before=await this.employeeRow(id);
    if(!before) throw new HrValidationError("id","人事資料不存在",404);
    const revision=integer(v.revision,"revision",true);
    if(revision!==before.revision)throw new HrValidationError("revision","資料已由其他人修改，請重新整理",409);
    for(const [key,column] of [["storeId","store_id"],["jobTitleId","job_title_id"],["employmentType","employment_type"],["scheduleMode","schedule_mode"]]){
      if(v[key]!==undefined&&v[key]!==before[column])throw new HrValidationError(key,"此欄位請透過狀態異動變更");
    }
    const profile=normalizeProfile({...v,status:before.status,nationalId:v.nationalId===undefined?before.national_id:v.nationalId,
    storeId:v.storeId===undefined?before.store_id:v.storeId,jobTitleId:v.jobTitleId===undefined?before.job_title_id:v.jobTitleId,
    rosterSort:v.rosterSort===undefined?before.roster_sort:v.rosterSort,employmentType:v.employmentType===undefined?before.employment_type:v.employmentType,
    skipRosterChecks:v.skipRosterChecks===undefined?before.skip_roster_checks:v.skipRosterChecks,scheduleMode:v.scheduleMode===undefined?before.schedule_mode:v.scheduleMode});
    const editable=fields.map((field,index)=>({field,index})).filter(x=>!["store_id","job_title_id","employment_type","schedule_mode"].includes(x.field));
    const assignments=editable.map(x=>x.field+"=?").join(",");
    const stmts:D1PreparedStatement[]=[this.db.prepare("UPDATE hr_employees SET "+assignments+",revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?").bind(...editable.map(x=>profile.vals[x.index]),ctx.now,ctx.actor,id,revision)];
    for(const g of profile.children){
      stmts.push(this.db.prepare("DELETE FROM "+g.table+" WHERE employee_id=? AND EXISTS(SELECT 1 FROM hr_employees WHERE id=? AND revision=? AND updated_at=? AND updated_by=?)").bind(id,id,revision+1,ctx.now,ctx.actor));
      for(const [index,values] of g.values.entries())stmts.push(this.db.prepare("INSERT INTO "+g.table+" (employee_id,"+g.columns.join(",")+",sort_order) SELECT id,"+g.columns.map(()=>"?").join(",")+",? FROM hr_employee_current WHERE id=? AND revision=? AND updated_at=? AND updated_by=?").bind(...values,index,id,revision+1,ctx.now,ctx.actor));
    }
    const previousChildren: Record<string, Scalar[][]> = {};
    for(const g of profile.children){
      const saved=await this.db.prepare("SELECT "+g.columns.join(",")+" FROM "+g.table+" WHERE employee_id=? ORDER BY sort_order,id").bind(id).all<Record<string,Scalar>>();
      previousChildren[g.field]=(saved.results??[]).map(row=>g.columns.map(c=>row[c]??null));
    }
    const beforeAudit:Record<string,unknown>={revision}, afterAudit:Record<string,unknown>={revision:revision+1};
    for(let i=0;i<fields.length;i++){
      const key=bodyFields[i],col=fields[i];
      const previous=col==="national_id"?maskTaiwanId(before[col] as string|null):before[col]??null;
      const updated=col==="national_id"?maskTaiwanId(profile.vals[i] as string|null):profile.vals[i];
      if(previous!==updated){beforeAudit[key]=previous;afterAudit[key]=updated;}
    }
    for(const g of profile.children){
      if(JSON.stringify(previousChildren[g.field])!==JSON.stringify(g.values)){
        const name=g.field==="contacts"?"緊急聯絡人":g.field==="education"?"學歷":"工作經歷";
        beforeAudit[g.field]=name+"（異動前 "+previousChildren[g.field].length+" 筆）";
        afterAudit[g.field]=name+"（異動後 "+g.values.length+" 筆）";
      }
    }
    stmts.push(new AuditService(this.db).prepareRecord({entityType:"hr_employee",entityKey:String(before.employee_no),action:"hr_employee.updated",actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:beforeAudit,after:afterAudit},{sql:"EXISTS(SELECT 1 FROM hr_employees WHERE id=? AND revision=? AND updated_at=? AND updated_by=?)",values:[id,revision+1,ctx.now,ctx.actor]}));
    const results=await this.db.batch(stmts);
    if(!results[0]?.meta?.changes)throw new HrValidationError("revision","資料已由其他人修改，請重新整理",409);
    return this.get(id);
  }
  /**
   * 狀態異動：一筆紀錄只異動一個欄位。狀態寫入 hr_status_changes，門市、職稱、僱用型態、排班方式各寫一筆
   * hr_assignment_changes。每個欄位的當前值只看自己的紀錄（台北今日以前、生效日與 id 最新）；hr_employees 的對應欄位
   * 永遠存台北今日的值，所以寫入紀錄的同一個 batch（同一個 revision 守門）把受影響的欄位設成今日投影。未來生效的紀錄
   * 由每日排程 hrCurrentValues 推進主檔。
   */
  async statusChange(id:number,raw:unknown,ctx:HrContext) {
    const v=object(raw);
    const base=await this.db.prepare("SELECT * FROM hr_employees WHERE id=?").bind(id).first<Record<string,unknown>>();
    if(!base)throw new HrValidationError("id","人事資料不存在",404);
    const effective=date(v.effectiveDate,"effectiveDate"),reason=required(v.reason,"reason",500);
    const revision=Number(base.revision);
    if(v.expectedRevision!==undefined&&integer(v.expectedRevision,"expectedRevision",true)!==revision)throw new HrValidationError("revision","資料已由其他人修改，請重新整理",409);
    const [statusRows,assignmentRows]=await Promise.all([
      this.db.prepare("SELECT * FROM hr_status_changes WHERE employee_id=?").bind(id).all<StatusRecord&Record<string,unknown>>(),
      this.db.prepare("SELECT * FROM hr_assignment_changes WHERE employee_id=?").bind(id).all<AssignmentRecord&Record<string,unknown>>(),
    ]);
    const statuses=statusRows.results??[],assignments=assignmentRows.results??[];
    const today=new Date(Date.parse(ctx.now)+8*3600_000).toISOString().slice(0,10);
    const firstPrevious=[...statuses].sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||a.id-b.id)[0]?.previous_status;
    const statusOn=(records:StatusRecord[],at:string)=>latestAt(records,at)?.next_status??firstPrevious??String(base.status);
    const valueOn=(records:AssignmentRecord[],field:AssignmentField,at:string):string|null=>{
      const own=records.filter(r=>r.field===field);
      return latestAt(own,at)?.next_value??startValue(own)??(base[field]==null?null:String(base[field]));
    };
    const [storeRows,titleRows]=await Promise.all([this.db.prepare("SELECT id,name FROM hr_stores").all<{id:number;name:string}>(),this.db.prepare("SELECT id,name FROM hr_job_titles").all<{id:number;name:string}>()]);
    const names={store_id:new Map((storeRows.results??[]).map(x=>[String(x.id),x.name])),job_title_id:new Map((titleRows.results??[]).map(x=>[String(x.id),x.name]))};
    const shown=(field:"status"|AssignmentField,value:string)=>field==="status"?STATUS_NAMES[value]??value:field==="store_id"||field==="job_title_id"?names[field].get(value)??value:TYPE_NAMES[value]??value;
    // The form sends only the fields the user ticked. A sent field must really change: if it already has that value on the
    // effective date it is rejected (naming the field), never silently skipped.
    const same=(field:"status"|AssignmentField,value:string|null)=>new HrValidationError(field==="status"?"nextStatus":ASSIGNMENT_FIELDS.find(x=>x[1]===field)![0],`「${FIELD_NAMES[field]}」在 ${effective} 已經是「${value===null?"—":shown(field,value)}」，不需異動；請取消勾選該欄位，或改選其他值。`);
    const newStatus:{previous:string;next:string}|null=(()=>{
      if(v.nextStatus===undefined)return null;
      const next=status(v.nextStatus),previous=statusOn(statuses,effective);
      if(next===previous)throw same("status",next);
      return {previous,next};
    })();
    const newAssignments:{field:AssignmentField;previous:string|null;next:string}[]=[];
    for(const [key,field] of ASSIGNMENT_FIELDS){
      if(v[key]===undefined)continue;
      let next:string;
      if(field==="store_id"||field==="job_title_id"){
        const value=integer(v[key],key,true);
        if(!await this.db.prepare("SELECT id FROM "+(field==="store_id"?"hr_stores":"hr_job_titles")+" WHERE id=? AND is_active=1").bind(value).first())throw new HrValidationError(key,"請選擇有效的門市或職稱");
        next=String(value);
      }else{
        next=typeof v[key]==="string"?v[key] as string:"";
        if(!(field==="employment_type"?["full","half","casual"]:["shift","hours","none"]).includes(next))throw new HrValidationError(key,field==="employment_type"?"僱用型態錯誤":"排班方式錯誤");
      }
      const previous=valueOn(assignments,field,effective);
      if(next===previous)throw same(field,next);
      newAssignments.push({field,previous,next});
    }
    if(!newStatus&&!newAssignments.length)throw new HrValidationError("nextStatus","沒有任何要異動的欄位，請至少勾選一個");
    const terminationDate=newStatus?.next==="terminated"?nullableDate(v.terminationDate,"terminationDate"):null;
    const terminationReason=newStatus?.next==="terminated"?optional(v.terminationReason,"terminationReason",500):null;
    if(newStatus?.next==="terminated"&&(!terminationDate||!terminationReason))throw new HrValidationError("terminationDate","離職日與原因必填");
    // Ids of the new rows increase in statement order, so they win ties on the same effective date like real ids.
    const pendingId=(n:number)=>Number.MAX_SAFE_INTEGER-1000+n;
    const nextStatuses:StatusRecord[]=newStatus?[...statuses,{id:pendingId(0),effective_date:effective,previous_status:newStatus.previous,next_status:newStatus.next}]:statuses;
    const nextAssignments:AssignmentRecord[]=[...assignments,...newAssignments.map((x,i)=>({id:pendingId(i+1),field:x.field,effective_date:effective,previous_value:x.previous,next_value:x.next}))];
    // Later records that the new value would leave with nothing to change (their value equals the one already in force).
    // Only records that became pointless because of this save count; ones that already were stay as they are.
    interface Redundant{key:string;table:"hr_status_changes"|"hr_assignment_changes";rowId:number;field:"status"|AssignmentField;effectiveDate:string;previous:string;next:string}
    const redundant:Redundant[]=[];
    const flag=(field:"status"|AssignmentField,table:Redundant["table"],before:{id:number;effective_date:string}[],after:{id:number;effective_date:string}[],start:(records:{id:number;effective_date:string}[])=>{base:string|null;anchor:boolean},value:(r:{id:number;effective_date:string})=>string)=>{
      const was=walkLedger(before,start(before).base,value,start(before).anchor),now=walkLedger(after,start(after).base,value,start(after).anchor);
      for(const [r,x] of now){
        if(r.id>=pendingId(0)||!x.noEffect||was.get(r)?.noEffect||r.effective_date<=effective)continue;
        redundant.push({key:(table==="hr_status_changes"?"s":"a")+r.id,table,rowId:r.id,field,effectiveDate:r.effective_date,previous:x.previous??"",next:value(r)});
      }
    };
    if(newStatus)flag("status","hr_status_changes",statuses,nextStatuses,(rs)=>({base:(earliestOf(rs as unknown as StatusRecord[])?.previous_status)??null,anchor:true}),r=>(r as StatusRecord).next_status);
    for(const x of newAssignments)flag(x.field,"hr_assignment_changes",assignments.filter(r=>r.field===x.field),nextAssignments.filter(r=>r.field===x.field),(rs)=>assignmentStart(rs as unknown as AssignmentRecord[]),r=>(r as AssignmentRecord).next_value);
    const requestedDeletes=v.deleteRedundantIds===undefined?[]:Array.isArray(v.deleteRedundantIds)&&v.deleteRedundantIds.every(x=>typeof x==="string")&&v.deleteRedundantIds.length<=50?[...new Set(v.deleteRedundantIds as string[])]:(()=>{throw new HrValidationError("deleteRedundantIds","要一併刪除的異動紀錄格式不正確")})();
    const keepRedundant=v.keepRedundant===true;
    if(keepRedundant&&requestedDeletes.length)throw new HrValidationError("keepRedundant","不能同時選擇保留與刪除沒有變化的紀錄");
    if(redundant.length&&!keepRedundant&&(requestedDeletes.length!==redundant.length||!redundant.every(r=>requestedDeletes.includes(r.key))))
      throw new HrValidationError("deleteRedundantIds","存檔後有較晚生效的異動會變成沒有變化，請確認要一併刪除或保留。",409,{code:"HR_REDUNDANT_LATER_CHANGES",details:{items:redundant.map(r=>({id:r.key,field:r.field,fieldLabel:FIELD_NAMES[r.field],effectiveDate:r.effectiveDate,previous:r.previous,next:r.next,previousLabel:shown(r.field,r.previous),nextLabel:shown(r.field,r.next)}))}});
    const deletions=keepRedundant?[]:redundant;
    const doomed=new Set(deletions.map(r=>r.key));
    const survivingStatuses=nextStatuses.filter(r=>!doomed.has("s"+r.id));
    if(newAssignments.some(x=>x.field==="employment_type"||x.field==="schedule_mode")){
      const dates=new Set([effective,...nextAssignments.filter(r=>(r.field==="employment_type"||r.field==="schedule_mode")&&r.effective_date>effective).map(r=>r.effective_date)]);
      for(const at of [...dates].sort()){
        const employment=valueOn(nextAssignments,"employment_type",at),schedule=valueOn(nextAssignments,"schedule_mode",at);
        if(employment==="full"&&schedule!=="shift"||employment==="half"&&schedule==="none")
          throw new HrValidationError("scheduleMode",`${at} 起僱用型態與排班方式不相容（正職須為班別，半職不可為不排班），請一併調整`);
      }
    }
    // hr_employees holds today's value of every personnel field (the projection as of the Taipei date). Written here in the same batch as
    // the records, for the fields this save touched; a future-dated record reaches the master columns through the daily hrCurrentValues task.
    // An older-dated record never overwrites newer state: termination data is only touched by the record that decides today's status,
    // or by a future termination; once today's status is not 離職 and no 離職 record is still waiting, it is cleared.
    const projected=statusOn(survivingStatuses,today);
    let cachedTerminationDate=base.termination_date as string|null,cachedTerminationReason=base.termination_reason as string|null;
    if(newStatus){
      const decidesToday=effective<=today&&latestAt(survivingStatuses,today)?.id===pendingId(0);
      if(newStatus.next==="terminated"&&(effective>today||decidesToday)){cachedTerminationDate=terminationDate;cachedTerminationReason=terminationReason;}
      else if(newStatus.next!=="terminated"&&decidesToday){cachedTerminationDate=null;cachedTerminationReason=null;}
    }
    if(projected!=="terminated"&&!survivingStatuses.some(r=>r.next_status==="terminated"&&r.effective_date>today)){cachedTerminationDate=null;cachedTerminationReason=null;}
    const survivingAssignments=nextAssignments.filter(r=>!doomed.has("a"+r.id));
    const touched=newAssignments.map(x=>({field:x.field,value:valueOn(survivingAssignments,x.field,today)}));
    const guard="EXISTS(SELECT 1 FROM hr_employees WHERE id=? AND revision=? AND updated_at=? AND updated_by=?)",guardValues=[id,revision+1,ctx.now,ctx.actor];
    const audits:D1PreparedStatement[]=[],statements:D1PreparedStatement[]=[
      this.db.prepare("UPDATE hr_employees SET status=?,termination_date=?,termination_reason=?"+touched.map(x=>","+x.field+"=?").join("")+",revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?")
        .bind(projected,cachedTerminationDate,cachedTerminationReason,...touched.map(x=>x.value===null?null:x.field==="store_id"||x.field==="job_title_id"?Number(x.value):x.value),ctx.now,ctx.actor,id,revision)];
    const auditService=new AuditService(this.db);
    if(newStatus){
      statements.push(this.db.prepare("INSERT INTO hr_status_changes (employee_id,effective_date,previous_status,next_status,reason,handled_by,created_at) SELECT ?,?,?,?,?,?,? WHERE "+guard)
        .bind(id,effective,newStatus.previous,newStatus.next,reason,ctx.actor,ctx.now,...guardValues));
      audits.push(auditService.prepareRecord({entityType:"hr_status_change",entityKey:String(base.employee_no),action:"hr_employee.status_changed",actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:{status:newStatus.previous},after:{status:newStatus.next,effectiveDate:effective}},{sql:guard,values:guardValues}));
    }
    for(const x of newAssignments){
      statements.push(this.db.prepare("INSERT INTO hr_assignment_changes (employee_id,field,effective_date,previous_value,next_value,reason,handled_by,created_at) SELECT ?,?,?,?,?,?,?,? WHERE "+guard)
        .bind(id,x.field,effective,x.previous,x.next,reason,ctx.actor,ctx.now,...guardValues));
      audits.push(auditService.prepareRecord({entityType:"hr_assignment_change",entityKey:String(base.employee_no),action:"hr_employee.assignment_changed",actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:{[x.field]:x.previous},after:{[x.field]:x.next,effectiveDate:effective}},{sql:guard,values:guardValues}));
    }
    // Records the new value made pointless are deleted in the same batch, under the same revision guard, each with its own audit row.
    for(const d of deletions){
      const row=(d.table==="hr_status_changes"?statuses:assignments).find(r=>r.id===d.rowId) as Record<string,unknown>;
      statements.push(this.db.prepare("DELETE FROM "+d.table+" WHERE id=? AND employee_id=? AND "+guard).bind(d.rowId,id,...guardValues));
      audits.push(auditService.prepareRecord({entityType:d.table==="hr_status_changes"?"hr_status_change":"hr_assignment_change",entityKey:String(base.employee_no),action:d.table==="hr_status_changes"?"hr_employee.status_change_deleted":"hr_employee.assignment_change_deleted",actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:row,after:null},{sql:guard,values:guardValues}));
    }
    const results=await this.db.batch([...statements,...audits]);
    if(!results[0]?.meta?.changes)throw new HrValidationError("revision","資料已由其他人修改，請重新整理",409);
    return this.get(id);
  }
  async exclusions(id:number) {return (await this.db.prepare("SELECT * FROM hr_seniority_exclusions WHERE employee_id=? ORDER BY start_date").bind(id).all()).results??[];}
  async leave(id:number,asOf:string) {
    const emp=await this.employeeRow(id);if(!emp)throw new HrValidationError("id","員工不存在",404);
    const exclusions=await this.exclusions(id);
    return annualLeaveSchedule(String(emp.seniority_start_date),exclusions.map(x=>({startDate:String(x.start_date),endDate:String(x.end_date)})),asOf);
  }
  async addExclusion(id:number,raw:unknown,ctx:HrContext) {
    await this.get(id);const v=object(raw),a=date(v.startDate,"startDate"),b=date(v.endDate,"endDate"),reason=required(v.reason,"reason",500);
    if(a>b)throw new HrValidationError("endDate","不得早於起日");
    await this.db.batch([this.db.prepare("INSERT INTO hr_seniority_exclusions(employee_id,start_date,end_date,reason,created_at,created_by) VALUES(?,?,?,?,?,?)").bind(id,a,b,reason,ctx.now,ctx.actor),audit(this.db,ctx,"hr_seniority_exclusion",String(id),"hr_seniority_exclusion.created",null,{startDate:a,endDate:b,reason})]);
    return this.exclusions(id);
  }
  // Super admin removes an employee only while nothing has been done for them yet: a record entered by
  // mistake (user 2026-11-03; replaces the BD-059 test-only delete). Profile rows go with it.
  async remove(id:number,raw:unknown,ctx:HrContext,files?:R2Bucket) {
    const row=await this.db.prepare("SELECT employee_no,name FROM hr_employees WHERE id=?").bind(id).first<{employee_no:string;name:string}>();
    if(!row)throw new HrValidationError("id","員工不存在",404);
    if(object(raw).confirmEmployeeNo!==row.employee_no)throw new HrValidationError("confirmEmployeeNo","請輸入正確的員工編號確認刪除");
    const filesToDelete=(await this.db.prepare("SELECT object_key FROM hr_leave_attachments WHERE batch_id IN (SELECT batch_id FROM hr_leave_records WHERE employee_id=?) LIMIT 1001").bind(id).all<{object_key:string}>()).results??[];
    if(filesToDelete.length>1000)throw new HrValidationError("files","附件超過單次刪除安全上限 1,000 筆；已中止，避免留下無主檔案",422);
    const del=(sql:string)=>this.db.prepare(sql).bind(id);
    const busy=()=>this.db.prepare("SELECT "+HAS_ACTIVITY+" AS busy").bind(id);
    if((await busy().first<{busy:number}>())?.busy)throw new HrValidationError("id","已有薪資、請假、班表、出勤或異動等紀錄，不能刪除",409);
    await this.db.batch([
      // Re-checked inside the batch: a record added meanwhile aborts the whole delete.
      this.db.prepare("SELECT CASE WHEN "+HAS_ACTIVITY+" THEN json('') END").bind(id),
      del("DELETE FROM hr_salary_allowances WHERE salary_record_id IN (SELECT id FROM hr_salary_records WHERE employee_id=?)"),
      del("DELETE FROM hr_leave_attachments WHERE batch_id IN (SELECT batch_id FROM hr_leave_records WHERE employee_id=?)"),
      del("DELETE FROM hr_comp_time_settlements WHERE employee_id=?"),
      ...["hr_leave_records","hr_annual_leave_years","hr_overtime_days","hr_comp_time_grants"].map(t=>del("DELETE FROM "+t+" WHERE employee_id=?")),
      ...["hr_salary_records","hr_emergency_contacts","hr_education","hr_work_history","hr_status_changes","hr_assignment_changes","hr_seniority_exclusions","hr_schedule_days","hr_roster_approvals","hr_attendance_days"].map(t=>del(`DELETE FROM ${t} WHERE employee_id=?`)),
      del("DELETE FROM hr_employees WHERE id=?"),
      audit(this.db,ctx,"hr_employee",row.employee_no,"hr_employee.deleted",{employeeNo:row.employee_no,name:row.name},null),
    ]);
    if(files)await Promise.all(filesToDelete.map(f=>files.delete(f.object_key)));
  }
  async removeExclusion(id:number,exclusionId:number,ctx:HrContext) {
    const row=await this.db.prepare("SELECT * FROM hr_seniority_exclusions WHERE id=? AND employee_id=?").bind(exclusionId,id).first();
    if(!row)throw new HrValidationError("exclusionId","年資不計期間不存在",404);
    await this.db.batch([this.db.prepare("DELETE FROM hr_seniority_exclusions WHERE id=? AND employee_id=?").bind(exclusionId,id),audit(this.db,ctx,"hr_seniority_exclusion",String(id),"hr_seniority_exclusion.deleted",{exclusionId},null)]);
  }
  async salary(id:number,raw:unknown,ctx:HrContext) {
    await this.get(id);
    const v=object(raw),effective=date(v.effectiveDate,"effectiveDate"),type=required(v.paymentType,"paymentType");
    if(type!=="hourly"&&type!=="monthly")throw new HrValidationError("paymentType","計薪方式錯誤");
    const base=integer(v.baseAmount,"baseAmount"),reason=required(v.reason,"reason",500);
    const allowanceRows=rows(v.allowances,"allowances",30).map(x=>({itemTypeId:integer(x.itemTypeId,"itemTypeId",true),amount:integer(x.amount,"amount"),isRegular:x.isRegular===true}));
    const minimum=await this.db.prepare("SELECT * FROM hr_minimum_wages WHERE effective_date<=? ORDER BY effective_date DESC,id DESC LIMIT 1").bind(effective).first<{monthly_amount:number;hourly_amount:number;effective_date:string}>();
    const total=base+allowanceRows.filter(x=>x.isRegular).reduce((n,x)=>n+x.amount,0);
    if(minimum&&total<(type==="monthly"?minimum.monthly_amount:minimum.hourly_amount))throw new HrValidationError("baseAmount", "本薪＋經常性津貼 "+total+" 元低於 "+minimum.effective_date+" 最低工資 "+(type==="monthly"?minimum.monthly_amount:minimum.hourly_amount)+" 元");
    const member=await this.employeeRow(id);
    const statements:D1PreparedStatement[]=[
      this.db.prepare("INSERT INTO hr_salary_records(employee_id,effective_date,payment_type,base_amount,reason,created_at,created_by) VALUES(?,?,?,?,?,?,?)").bind(id,effective,type,base,reason,ctx.now,ctx.actor),
    ];
    for(const item of allowanceRows)statements.push(this.db.prepare("INSERT INTO hr_salary_allowances(salary_record_id,item_type_id,amount,is_regular) SELECT id,?,?,? FROM hr_salary_records WHERE employee_id=? AND effective_date=? ORDER BY id DESC LIMIT 1").bind(item.itemTypeId,item.amount,item.isRegular?1:0,id,effective));
    statements.push(audit(this.db,ctx,"hr_salary_record",String(member!.employee_no),"hr_salary_record.created",null,{effectiveDate:effective,paymentType:type,baseAmount:base,allowanceTotal:total-base}));
    await this.db.batch(statements);return {saved:true,minimumWageConfigured:!!minimum};
  }
  async reveal(id:number,ctx:HrContext) {
    const e=await this.employeeRow(id);
    if(!e)throw new HrValidationError("id","員工不存在",404);
    await new AuditService(this.db).record({entityType:"hr_employee",entityKey:String(e.employee_no),action:"hr_employee.national_id.viewed",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{nationalIdMasked:maskTaiwanId(e.national_id as string|null)}});
    return {nationalId:e.national_id??null};
  }
}
