import { annualLeaveSchedule } from "../../shared/hr-annual-leave";
import { maskTaiwanId } from "../../shared/national-id";
import { AuditService } from "../audit/audit-service";
import { date, employeeNumber, HrValidationError, integer, month, nationalId, nullableDate, object, optional, required, rows, status } from "./hr-validation";

export interface HrContext { actor: number; requestId: string; now: string }
const CHILDREN = [
  { field: "contacts", table: "hr_emergency_contacts", columns: ["name","relationship","phone"], names: ["name","relationship","phone"] },
  { field: "education", table: "hr_education", columns: ["school","department","degree","graduation_month"], names: ["school","department","degree","graduationMonth"] },
  { field: "workHistory", table: "hr_work_history", columns: ["company","job_title","start_month","end_month","note"], names: ["company","jobTitle","startMonth","endMonth","note"] },
] as const;
const fields = ["employee_no","name","member_id","national_id","birth_date","gender","mobile","phone","mailing_address","registered_address","hire_date","seniority_start_date","note"] as const;
const bodyFields = ["employeeNo","name","memberId","nationalId","birthDate","gender","mobile","phone","mailingAddress","registeredAddress","hireDate","seniorityStartDate","note"] as const;
type Scalar = string | number | null;
function normalizeProfile(raw: unknown) {
  const v = object(raw);
  const hireDate = date(v.hireDate,"hireDate");
  const memberId = v.memberId == null || v.memberId === "" ? null : integer(v.memberId,"memberId",true);
  const vals: Scalar[] = [
    employeeNumber(v.employeeNo), required(v.name,"name",120), memberId, nationalId(v.nationalId),
    nullableDate(v.birthDate,"birthDate"), optional(v.gender,"gender",20),
    optional(v.mobile,"mobile",30),optional(v.phone,"phone",30),
    optional(v.mailingAddress,"mailingAddress",300),optional(v.registeredAddress,"registeredAddress",300),
    hireDate, v.seniorityStartDate ? date(v.seniorityStartDate,"seniorityStartDate") : hireDate,
    optional(v.note,"note",2000),
  ];
  const children = CHILDREN.map(g=>({ ...g, values: rows(v[g.field],g.field).map((row,index)=>{
    const record: Scalar[] = g.names.map((key)=>{
      const value = row[key]; if (key === "graduationMonth" || key === "startMonth" || key === "endMonth") return month(value,key);
      if (key==="name" || key==="phone" && g.field==="contacts" || key==="school" || key==="company") return required(value,key,150);
      return optional(value,key,1000);
    });
    if (index>49) throw new HrValidationError(g.field,"過多子表紀錄");
    return record;
  })}));
  return { vals, children };
}
function sanitized(row: Record<string, unknown>) {
  const { national_id, effective_status, ...rest } = row;
  return { ...rest, status:effective_status ?? row.status, nationalIdMasked: maskTaiwanId(typeof national_id==="string" ? national_id : null) };
}
function audit(db:D1Database, ctx:HrContext, type:string, key:string, action:string, before: Record<string, unknown> | null, after:Record<string,unknown>|null) {
  return new AuditService(db).prepareRecord({entityType:type,entityKey:key,action,actorEmployeeId:ctx.actor,requestId:ctx.requestId,before,after});
}
export class HrService {
  constructor(private db:D1Database) {}
  private employeeRow(id:number) { return this.db.prepare("SELECT e.*,COALESCE((SELECT c.next_status FROM hr_status_changes c WHERE c.employee_id=e.id AND c.effective_date<=date('now','+8 hours') ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),e.status) AS effective_status FROM hr_employees e WHERE e.id=?").bind(id).first<Record<string,unknown>>(); }
  async list(q:string,statusFilter:string|undefined,cursor:number,limit=40) {
    const todayStatus="COALESCE((SELECT c.next_status FROM hr_status_changes c WHERE c.employee_id=e.id AND c.effective_date<=date('now','+8 hours') ORDER BY c.effective_date DESC,c.id DESC LIMIT 1),e.status)";
    const terms=["e.id>?"],values:(string|number)[]=[cursor];
    if(q){terms.push("(e.employee_no LIKE ? OR e.name LIKE ?)");values.push("%"+q.slice(0,80)+"%","%"+q.slice(0,80)+"%");}
    if(statusFilter){status(statusFilter);terms.push(todayStatus+"=?");values.push(statusFilter);}
    const found=await this.db.prepare("SELECT e.*,"+todayStatus+" AS effective_status FROM hr_employees e WHERE "+terms.join(" AND ")+" ORDER BY e.id LIMIT ?").bind(...values,Math.min(limit,100)+1).all<Record<string,unknown>>();
    const all=found.results??[];return {items:all.slice(0,limit).map(sanitized),nextCursor:all.length>limit?Number(all[limit-1].id):null};
  }
  async get(id:number) {
    const employee=await this.employeeRow(id);
    if(!employee) throw new HrValidationError("id","人事資料不存在",404);
    const result:Record<string,unknown>={...sanitized(employee)};
    for(const child of CHILDREN){const data=await this.db.prepare("SELECT * FROM "+child.table+" WHERE employee_id=? ORDER BY sort_order,id").bind(id).all();result[child.field]=data.results??[];}
    for(const [key,table] of [["statusChanges","hr_status_changes"],["salaryRecords","hr_salary_records"],["seniorityExclusions","hr_seniority_exclusions"]] as const){
      const data=await this.db.prepare("SELECT * FROM "+table+" WHERE employee_id=? ORDER BY effective_date DESC,id DESC".replace("effective_date",key==="seniorityExclusions"?"start_date":"effective_date")).bind(id).all();
      result[key]=data.results??[];
    }
    const salary=result.salaryRecords as Record<string,unknown>[];
    for (const item of salary) {
      const allowance=await this.db.prepare("SELECT a.*,t.name AS item_name FROM hr_salary_allowances a JOIN hr_salary_item_types t ON t.id=a.item_type_id WHERE a.salary_record_id=? ORDER BY a.id").bind(item.id).all();
      item.allowances=allowance.results??[];
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
    const profile=normalizeProfile({...v,status:before.status,nationalId:v.nationalId===undefined?before.national_id:v.nationalId});
    const assignments=fields.map(x=>x+"=?").join(",");
    const stmts:D1PreparedStatement[]=[this.db.prepare("UPDATE hr_employees SET "+assignments+",revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?").bind(...profile.vals,ctx.now,ctx.actor,id,revision)];
    for(const g of profile.children){
      stmts.push(this.db.prepare("DELETE FROM "+g.table+" WHERE employee_id=? AND EXISTS(SELECT 1 FROM hr_employees WHERE id=? AND revision=? AND updated_at=? AND updated_by=?)").bind(id,id,revision+1,ctx.now,ctx.actor));
      for(const [index,values] of g.values.entries())stmts.push(this.db.prepare("INSERT INTO "+g.table+" (employee_id,"+g.columns.join(",")+",sort_order) SELECT id,"+g.columns.map(()=>"?").join(",")+",? FROM hr_employees WHERE id=? AND revision=? AND updated_at=? AND updated_by=?").bind(...values,index,id,revision+1,ctx.now,ctx.actor));
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
  async statusChange(id:number,raw:unknown,ctx:HrContext) {
    const v=object(raw),employee=await this.employeeRow(id);
    if(!employee)throw new HrValidationError("id","人事資料不存在",404);
    const effective=date(v.effectiveDate,"effectiveDate"),next=status(v.nextStatus),reason=required(v.reason,"reason",500);
    const today=ctx.now.slice(0,10);
    if(next==="terminated"&&(!nullableDate(v.terminationDate,"terminationDate")||!required(v.terminationReason,"terminationReason",500)))throw new HrValidationError("terminationDate","離職日與原因必填");
    const statements=[this.db.prepare("INSERT INTO hr_status_changes (employee_id,effective_date,previous_status,next_status,reason,handled_by,created_at) VALUES (?,?,?,?,?,?,?)").bind(id,effective,employee.status,next,reason,ctx.actor,ctx.now)];
    if(next==="terminated" || effective<=today)statements.push(this.db.prepare("UPDATE hr_employees SET status=CASE WHEN ? THEN ? ELSE status END,termination_date=?,termination_reason=?,revision=revision+1,updated_at=? WHERE id=?").bind(effective<=today?1:0,next,next==="terminated"?date(v.terminationDate,"terminationDate"):null,next==="terminated"?required(v.terminationReason,"terminationReason",500):null,ctx.now,id));
    statements.push(audit(this.db,ctx,"hr_status_change",String(employee.employee_no),"hr_employee.status_changed",{status:employee.status},{status:next,effectiveDate:effective}));
    await this.db.batch(statements);return this.get(id);
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
