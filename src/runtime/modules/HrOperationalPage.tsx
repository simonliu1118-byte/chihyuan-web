import {salaryAmendmentDraft} from './hr-salary-draft';
import {useLatestRequest} from '../../ui/foundation/useLatestRequest';
import { DateInput } from "../../ui/forms/DateInput";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest, ApiClientError } from "../../api/client";
import { taipeiToday } from "../../../shared/erp-query-history";
import type { HrPaymentType, HrStatus } from "../../../shared/hr";
import type { AnnualLeavePeriod } from "../../../shared/hr-annual-leave";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { Loading } from "../../ui/feedback/Loading";
import { formatDate } from "../../ui/foundation/format";
import { enterAdvancesFields, enterAdvancesThenSubmits } from "../../ui/foundation/enter-advance";
import { CheckField, Field } from "../../ui/forms/Field";
import { useUnsavedChangesGuard, useNavigationGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import { useCompactLayout } from "../../ui/foundation/useCompactLayout";
import { ModuleSections } from "../../ui/mobile/ModuleSections";
import { ListRow } from "../../ui/mobile/ListRow";
import { ActionBar } from "../../ui/mobile/ActionBar";
import { OverflowMenu } from "../../ui/mobile/OverflowMenu";
import { DataViewToolbar } from "../../ui/data/DataViewToolbar";
import { OutlineTag, ResultRow } from "../../ui/data/ResultRow";
import { Dialog } from "../../ui/overlays/Dialog";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { RelatedCard } from "../../ui/records/RelatedCard";
import {HrEmployeeBonusCard} from './HrBonusPanel';
import "./hr-operational.css";
import {HrRosterPanel} from "./HrRosterPanel";
import {HrAttendancePanel} from "./HrAttendancePanel";
import {HrLeavePanel} from "./HrLeavePanel";
import {HrEmployeeLeaveOverview} from "./HrEmployeeLeaveOverview";
import {HrEmployeeSheet} from "./HrEmployeeSheet";
import {EntryTable,EntryHeading} from "../../ui/forms/EntryTable";
import {EntryFields} from "../../ui/forms/EntryFields";
import {RecordRows} from "../../ui/forms/RecordSheet";
import {HrSalaryPanel,type SalaryView} from './HrPayrollPanel';

const ROOT = "/api/business/hr";
const statusLabels: Record<HrStatus, string> = { probation: "試用", active: "在職", leave: "留職停薪", terminated: "離職" };
const statusTone = (status: HrStatus) => status === "active" ? "success" as const
  : status === "probation" ? "info" as const : status === "leave" ? "warning" as const : "neutral" as const;

// Rows come back from the HR API as stored (snake_case); only the fields this page reads are typed.
interface EmployeeRow { id: number; employee_no: string; name: string; status: HrStatus; store_name?: string | null }
interface ContactRow { name: string; relationship: string | null; phone: string }
interface EducationRow { school: string; department: string | null; start_month: string | null; end_month: string | null; note?: string | null }
interface WorkRow { company: string; job_title: string | null; start_month: string | null; end_month: string | null; salary: string | null; leave_reason: string | null }
// previous_* is computed by the server from the preceding record of the same field; no_effect marks a record whose value equals the one already in force.
interface StatusChangeRow { id: number; effective_date: string; next_status: HrStatus; previous_status: HrStatus; reason: string; created_at: string; recorded_date: string; no_effect?: boolean; is_creation?: boolean }
interface AssignmentChangeRow { id: number; field: AssignmentField; effective_date: string; previous_value: string | null; next_value: string; reason: string; created_at: string; recorded_date: string; no_effect?: boolean; is_creation?: boolean }
type AssignmentField = "store_id" | "job_title_id" | "employment_type" | "schedule_mode";
/** One personnel change as shown to the user: exactly one field, its old and new value. */
interface PersonnelChange { key: string; effective_date: string; recorded_date: string; created_at: string; field: "status" | AssignmentField; previous: string | null; next: string; reason: string; noEffect: boolean }
const FIELD_LABELS: Record<PersonnelChange["field"], string> = { status: "人事狀態", store_id: "門市", job_title_id: "職稱", employment_type: "僱用型態", schedule_mode: "排班方式" };
const TYPE_LABELS: Record<string, string> = { full: "正職", half: "半職", casual: "兼職", shift: "班別", hours: "時段或時數", none: "不排班" };
interface SalaryRow { id: number; effective_date: string; payment_type: HrPaymentType; base_amount: number; reason: string;
  allowances: { item_name: string; amount: number; is_regular: number;item_type_id:number }[] }
interface ExclusionRow { id: number; start_date: string; end_date: string; reason: string }
export interface EmployeeDetail extends EmployeeRow {
  /** No salary, leave, roster, attendance or status record yet: a mistaken record may still be deleted. */
  deletable?: boolean;
  member_id: number | null; memberLabel?: string | null; nationalIdMasked: string | null; birth_date: string | null; gender: string | null;
  mobile: string | null; phone: string | null; mailing_address: string | null; registered_address: string | null;
  hire_date: string; seniority_start_date: string; termination_date: string | null; termination_reason: string | null;
  note: string | null; revision: number;
  store_id:number|null;job_title_id:number|null;roster_sort:number;employment_type:"full"|"half"|"casual";skip_roster_checks:number;schedule_mode:"shift"|"hours"|"none";
  contacts: ContactRow[]; education: EducationRow[]; workHistory: WorkRow[];
  statusChanges: StatusChangeRow[]; assignmentChanges: AssignmentChangeRow[]; salaryRecords: SalaryRow[]; seniorityExclusions: ExclusionRow[];
}
/** A live CYID account; memberId is the local CY Web record when one exists. */
export interface MemberOption { employeeId: string; employeeNo: string; name: string; memberId: number | null }
interface SalaryItem { id: number; name: string; is_active: number }

export interface Draft {
  employeeNo: string; name: string; nationalId: string; gender: string; birthDate: string;
  /** Binding: memberIdentityId is set only when the user picks or clears it in this edit. */
  memberIdentityId?: string | null; memberLabel: string; changeNationalId: boolean;
  mobile: string; phone: string; mailingAddress: string; registeredAddress: string;
  hireDate: string; seniorityStartDate: string; note: string; status: HrStatus;
  storeId:string;jobTitleId:string;rosterSort:string;employmentType:"full"|"half"|"casual";skipRosterChecks:boolean;scheduleMode:"shift"|"hours"|"none";
  contacts: { name: string; relationship: string; phone: string }[];
  education: { school: string; department: string; startMonth: string; endMonth: string; note: string }[];
  workHistory: { company: string; jobTitle: string; startMonth: string; endMonth: string; salary: string; leaveReason: string }[];
}
const STATUS_KEYS = ["nextStatus", "storeId", "jobTitleId", "employmentType", "scheduleMode"] as const;
type StatusKey = typeof STATUS_KEYS[number];
const STATUS_KEY_FIELD: Record<StatusKey, PersonnelChange["field"]> = { nextStatus: "status", storeId: "store_id", jobTitleId: "job_title_id", employmentType: "employment_type", scheduleMode: "schedule_mode" };
const STATUS_KEY_SHORT: Record<StatusKey, string> = { nextStatus: "狀態", storeId: "門市", jobTitleId: "職稱", employmentType: "僱用型態", scheduleMode: "排班方式" };
/** A later record the server says would change nothing once the new one is saved. */
interface RedundantItem { id: string; field: PersonnelChange["field"]; fieldLabel: string; effectiveDate: string; previousLabel: string; nextLabel: string }
type ActionKind = "status" | "salary" | "exclusion";
type BrowseKind = "leave" | "salary" | "status" | "exclusion";

const money = (value: number) => `${(value||0).toLocaleString("zh-TW")} 元`;
const date = (value: string | null | undefined) => value ? formatDate(value) : "—";
// Months are stored as YYYY/MM; <input type="month"> works in YYYY-MM.
const toMonthInput = (value: string | null) => value ? value.replace("/", "-") : "";
const fromMonthInput = (value: string) => value ? value.replace("-", "/") : "";
const memberText = (member: MemberOption) => `${member.employeeNo} ${member.name}`.trim();
const errorText = (error: unknown) => error instanceof Error && error.message ? error.message : "人事資料處理失敗，請稍後再試。";

function salaryText(row: SalaryRow): string {
  const regular = row.allowances.filter(item => item.is_regular).reduce((sum, item) => sum + item.amount, 0);
  const base = `${row.payment_type === "hourly" ? "時薪" : "月薪"} ${money(row.base_amount)}`;
  return regular ? `${base}＋經常性津貼 ${money(regular)}` : base;
}

function emptyDraft(): Draft {
  return { employeeNo: "", name: "", memberLabel: "", changeNationalId: true, nationalId: "", gender: "", birthDate: "", mobile: "", phone: "",
    mailingAddress: "", registeredAddress: "", hireDate: taipeiToday(), seniorityStartDate: "", note: "", status: "probation",
    storeId:"",jobTitleId:"",rosterSort:"0",employmentType:"full",skipRosterChecks:false,scheduleMode:"shift",
    contacts: [{ name: "", relationship: "", phone: "" }], education: [], workHistory: [] };
}

function draftFrom(detail: EmployeeDetail): Draft {
  return {
    employeeNo: detail.employee_no, name: detail.name, memberLabel: detail.member_id ? detail.memberLabel ?? "已綁定" : "", changeNationalId: !detail.nationalIdMasked,
    nationalId: detail.nationalIdMasked ?? "", gender: detail.gender ?? "", birthDate: detail.birth_date ?? "", mobile: detail.mobile ?? "",
    phone: detail.phone ?? "", mailingAddress: detail.mailing_address ?? "", registeredAddress: detail.registered_address ?? "",
    hireDate: detail.hire_date, seniorityStartDate: detail.seniority_start_date, note: detail.note ?? "", status: detail.status,
    storeId:detail.store_id?String(detail.store_id):"",jobTitleId:detail.job_title_id?String(detail.job_title_id):"",
    rosterSort:String(detail.roster_sort??0),employmentType:detail.employment_type??"full",
    skipRosterChecks:detail.skip_roster_checks===1,scheduleMode:detail.schedule_mode??"shift",
    // One emergency contact, kept in the sheet (user 2026-11-10).
    contacts: [detail.contacts[0] ? { name: detail.contacts[0].name, relationship: detail.contacts[0].relationship ?? "", phone: detail.contacts[0].phone } : { name: "", relationship: "", phone: "" }],
    education: detail.education.map(row => ({ school: row.school, department: row.department ?? "",
      startMonth: toMonthInput(row.start_month), endMonth: toMonthInput(row.end_month), note: row.note ?? "" })),
    workHistory: detail.workHistory.map(row => ({ company: row.company, jobTitle: row.job_title ?? "",
      startMonth: toMonthInput(row.start_month), endMonth: toMonthInput(row.end_month), salary: row.salary ?? "", leaveReason: row.leave_reason ?? "" })),
  };
}

export function HrOperationalPage() {
  const [tab,setTab]=useState<"people"|"roster"|"attendance"|"leave"|"salary">("people");
 const [initialLeaveEmployeeId,setInitialLeaveEmployeeId]=useState<number|null>(null);
 const [attendanceFocus,setAttendanceFocus]=useState<{employeeId:number;month:string}|null>(null);
 const salaryView=useRef<SalaryView>({mode:"settings"});
  const [stores,setStores]=useState<{id:number;name:string;is_active?:number}[]>([]);
  const [jobTitles,setJobTitles]=useState<{id:number;name:string}[]>([]);
  useEffect(()=>{void Promise.all([
    apiRequest<{id:number;name:string;is_active?:number}[]>(ROOT+"/settings/stores"),
    apiRequest<{id:number;name:string}[]>(ROOT+"/settings/job-titles")
  ]).then(([a,b])=>{setStores(a);setJobTitles(b)}).catch(()=>{});},[]);
  const pane = useMasterDetailPane();
  const compact = useCompactLayout();
  const { confirm, confirmationDialog } = useConfirmation();
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState(""), [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [leave, setLeave] = useState<AnnualLeavePeriod[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [allowances, setAllowances] = useState<{ itemTypeId: string; amount: string; isRegular: boolean }[]>([]);
  const [actionEmployeeId,setActionEmployeeId]=useState<number|null>(null);
  // 狀態異動: only ticked fields are sent. statusCurrent supplies the value shown for unticked (locked) fields.
  const [statusChecked,setStatusChecked]=useState<Partial<Record<StatusKey,boolean>>>({});
  const [statusCurrent,setStatusCurrent]=useState<EmployeeDetail|null>(null);
  const [redundant,setRedundant]=useState<RedundantItem[]|null>(null);
  const [deleteRedundant,setDeleteRedundant]=useState(true);
  const [salaryRefresh,setSalaryRefresh]=useState(0);
  const actionWriting=useRef(false);
  const [actionReady,setActionReady]=useState(false),[actionLoading,setActionLoading]=useState(false),[actionError,setActionError]=useState(""),[actionName,setActionName]=useState(""),[actionSalaryBefore,setActionSalaryBefore]=useState<SalaryRow|null>(null);
  const [salaryItems, setSalaryItems] = useState<SalaryItem[]>([]);
  const [minimumWageSet, setMinimumWageSet] = useState(true);
  const [browse, setBrowse] = useState<BrowseKind | null>(null);
  const [deleteNo, setDeleteNo] = useState<string | null>(null);
  const editing = draft !== null;
  const unsavedGuard = useUnsavedChangesGuard({ active: editing || action !== null, blocked: busy||actionLoading, message: "人事資料尚未儲存，確定放棄？" });
  const canLeave = async () => (await unsavedGuard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", cancelLabel: "繼續編輯", confirmTone: "danger",
  }))).allowed;

  const listRequest=useLatestRequest(query+'|'+statusFilter+'|'+storeFilter+'|'+typeFilter),detailRequest=useLatestRequest(selectedId),actionRequest=useLatestRequest("hr-action");
  const navigation=useNavigationGuard();
  async function switchTab(next:typeof tab){
    if(next===tab)return;
    if(!(await navigation.canLeave({title:'切換人事頁籤？',description:'切換會放棄尚未儲存的內容，確定繼續？',confirmLabel:'確定切換',cancelLabel:'繼續編輯'})))return;
    actionRequest.invalidate();setDraft(null);setCreating(false);setAction(null);setActionEmployeeId(null);if(next!=="attendance")setAttendanceFocus(null);setTab(next);
  }
  async function loadList(append = false) {
    const request=listRequest.begin();
    const params = new URLSearchParams({ limit: "40" });
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (storeFilter) params.set("storeId", storeFilter);
    if (typeFilter) params.set("employmentType", typeFilter);
    if (append && nextCursor) params.set("cursor", String(nextCursor));
    setLoadingList(true);
    try {
      const page = await apiRequest<{ items: EmployeeRow[]; nextCursor: number | null }>(`${ROOT}/employees?${params}`);
      if(!request.current())return;
      setRows(current => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    } catch (error) { if(request.current())reportError(errorText(error)); }
    finally { if(request.current())setLoadingList(false); }
  }

  async function loadDetail(id: number) {
    const request=detailRequest.begin();
    setDetail(null);setLeave([]);setLoadingDetail(true);
    try {
      const [employee, periods] = await Promise.all([
        apiRequest<EmployeeDetail>(`${ROOT}/employees/${id}`),
        apiRequest<AnnualLeavePeriod[]>(`${ROOT}/employees/${id}/annual-leave`),
      ]);
      if(request.current()){setDetail(employee); setLeave(periods);}
    } catch (error) { if(request.current())reportError(errorText(error)); }
    finally { if(request.current())setLoadingDetail(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 200);
    return () => window.clearTimeout(timer);
  }, [query, statusFilter, storeFilter, typeFilter]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId]);
  useEffect(() => {
    void apiRequest<MemberOption[]>(`${ROOT}/members`).then(setMembers).catch(error => reportError(errorText(error)));
  }, []);

  /** 人事狀態、門市、僱用型態: all three are matched against today's effective values on the server. */
  function filterControls(){
    return <>
      <select className="cy-op-input" aria-label="人事狀態" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}>
        <option value="">全部狀態</option>
        {(Object.keys(statusLabels) as HrStatus[]).map(code=><option key={code} value={code}>{statusLabels[code]}</option>)}
      </select>
      <select className="cy-op-input" aria-label="門市" value={storeFilter} onChange={event=>setStoreFilter(event.target.value)}>
        <option value="">全部門市</option>
        {stores.filter(x=>x.is_active!==0).map(x=><option key={x.id} value={String(x.id)}>{x.name}</option>)}
      </select>
      <select className="cy-op-input" aria-label="僱用型態" value={typeFilter} onChange={event=>setTypeFilter(event.target.value)}>
        <option value="">全部型態</option>
        {(["full","half","casual"] as const).map(code=><option key={code} value={code}>{TYPE_LABELS[code]}</option>)}
      </select>
    </>;
  }

  async function select(id: number) {
    if (id === selectedId && !editing) { pane.open(); return; }
    if (editing && !(await canLeave())) return;
    setDraft(null); setCreating(false);setDetail(null);setLeave([]); setSelectedId(id); pane.open();
  }

  async function startCreate() {
    if (editing && !(await canLeave())) return;
    setCreating(true); setDraft(emptyDraft()); pane.open();
  }

  async function cancelEdit() {
    if (!(await canLeave())) return;
    setDraft(null);
    if (creating) { setCreating(false); if (!selectedId) pane.close(); }
  }

  function patch(value: Partial<Draft>) { setDraft(current => current ? { ...current, ...value } : current); }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setMessage(null);
    const body: Record<string, unknown> = {
      employeeNo: draft.employeeNo, name: draft.name,
      gender: draft.gender, birthDate: draft.birthDate, mobile: draft.mobile, phone: draft.phone,
      mailingAddress: draft.mailingAddress, registeredAddress: draft.registeredAddress, hireDate: draft.hireDate,
      seniorityStartDate: draft.seniorityStartDate || draft.hireDate, note: draft.note,
      storeId:draft.storeId?Number(draft.storeId):null,jobTitleId:draft.jobTitleId?Number(draft.jobTitleId):null,
      rosterSort:Number(draft.rosterSort),employmentType:draft.employmentType,skipRosterChecks:draft.skipRosterChecks,scheduleMode:draft.scheduleMode,
      contacts: draft.contacts,
      education: draft.education.map(row => ({ ...row, startMonth: fromMonthInput(row.startMonth), endMonth: fromMonthInput(row.endMonth) })),
      workHistory: draft.workHistory.map(row => ({ ...row, startMonth: fromMonthInput(row.startMonth), endMonth: fromMonthInput(row.endMonth) })),
    };
    if (draft.memberIdentityId !== undefined) body.memberIdentityId = draft.memberIdentityId;
    else if (!creating) body.memberId = detail?.member_id ?? null;
    // Editing leaves the stored 身分證字號 alone unless 變更 was pressed.
    if (creating || draft.changeNationalId) body.nationalId = draft.nationalId.trim().toUpperCase();
    const missing = missingFields(draft);
    if (missing.length) { setBusy(false); reportError(`請填寫：${missing.join("、")}`); return; }
    if (creating) body.status = draft.status; else body.revision = detail?.revision;
    try {
      const saved = await apiRequest<EmployeeDetail>(creating ? `${ROOT}/employees` : `${ROOT}/employees/${detail!.id}`,
        { method: creating ? "POST" : "PATCH", json: body });
      setDraft(null); setCreating(false); setSelectedId(saved.id);
      await Promise.all([loadList(), loadDetail(saved.id)]);
      setMessage(creating ? "已新增員工。" : "人事資料已更新。");
    } catch (error) { reportError(errorText(error)); }
    finally { setBusy(false); }
  }

  function shownValue(field:PersonnelChange["field"],value:string|null){
    if(value===null||value==="")return "—";
    if(field==="status")return statusLabels[value as HrStatus]??value;
    if(field==="store_id")return stores.find(x=>String(x.id)===value)?.name??value;
    if(field==="job_title_id")return jobTitles.find(x=>String(x.id)===value)?.name??value;
    return TYPE_LABELS[value]??value;
  }
  /** Status and assignment ledgers merged, newest effective date first. 建檔 records are the employee's 建檔資料, not a change, so they are left out (they still serve as the first change's previous value on the server). */
  function personnelChanges(employee:EmployeeDetail):PersonnelChange[]{
    return [
      ...employee.statusChanges.filter(r=>r.is_creation!==true).map(r=>({key:"s"+r.id,effective_date:r.effective_date,recorded_date:r.recorded_date,created_at:r.created_at,field:"status" as const,previous:r.previous_status,next:r.next_status,reason:r.reason,noEffect:r.no_effect===true})),
      ...(employee.assignmentChanges??[]).filter(r=>r.is_creation!==true).map(r=>({key:"a"+r.id,effective_date:r.effective_date,recorded_date:r.recorded_date,created_at:r.created_at,field:r.field,previous:r.previous_value,next:r.next_value,reason:r.reason,noEffect:r.no_effect===true})),
    ].sort((a,b)=>b.effective_date.localeCompare(a.effective_date)||b.created_at.localeCompare(a.created_at)||b.key.localeCompare(a.key));
  }
  const changeContent=(row:PersonnelChange)=>row.noEffect?<>{FIELD_LABELS[row.field]}：{shownValue(row.field,row.next)}（無變化）</>:row.previous===null||row.previous===row.next?<>{FIELD_LABELS[row.field]}：{shownValue(row.field,row.next)}</>
    :<>{FIELD_LABELS[row.field]}：{shownValue(row.field,row.previous)} → {shownValue(row.field,row.next)}</>;
  function statusTable(rows:PersonnelChange[]){return <div className="cy-op-table-wrap"><table className="cy-op-table cy-hr-status-table cy-rt" aria-label="狀態異動"><colgroup><col className="date"/><col className="date"/><col className="content"/><col/></colgroup><thead><tr><th>生效日期</th><th>異動日期</th><th>異動內容</th><th>原因</th></tr></thead><tbody>{rows.map(row=><tr key={row.key}><td data-label="生效日期" data-priority="title" className="nowrap">{date(row.effective_date)}{row.effective_date>taipeiToday()?<small className="cy-hr-pending">待生效</small>:null}</td><td data-label="異動日期" className="nowrap" data-priority="wide">{date(row.recorded_date)}</td><td data-label="異動內容" data-priority="wide">{changeContent(row)}</td><td data-label="原因" data-priority="wide">{row.reason}</td></tr>)}</tbody></table></div>}

  function statusSummary(){
    const ticked=STATUS_KEYS.filter(key=>statusChecked[key]);
    return ticked.length?`會存成 ${ticked.length} 筆異動（${ticked.map(key=>STATUS_KEY_SHORT[key]).join("、")}）`:"請勾選要異動的欄位";
  }
  /** Any edit invalidates a pending 「一併刪除」 question: the server asks again for the new combination. */
  function editStatus(patch:Record<string,string>){setForm(current=>({...current,...patch}));setRedundant(null);}
  function statusForm(){
    const current=statusCurrent?.id===actionEmployeeId?statusCurrent:detail?.id===actionEmployeeId?detail:null;
    const currentOf=(key:StatusKey):string=>{
      if(!current)return "";
      return key==="nextStatus"?current.status:key==="storeId"?String(current.store_id??""):key==="jobTitleId"?String(current.job_title_id??""):key==="employmentType"?current.employment_type:current.schedule_mode;
    };
    const optionsOf=(key:StatusKey):[string,string][]=>{
      const base:[string,string][]=key==="nextStatus"?(Object.keys(statusLabels) as HrStatus[]).map(k=>[k,statusLabels[k]])
        :key==="storeId"?stores.map(x=>[String(x.id),x.name]):key==="jobTitleId"?jobTitles.map(x=>[String(x.id),x.name])
        :key==="employmentType"?[["full","正職"],["half","半職"],["casual","兼職"]]:[["shift","班別"],["hours","時段或時數"],["none","不排班"]];
      const now=currentOf(key);
      return now&&!base.some(([value])=>value===now)?[...base,[now,shownValue(STATUS_KEY_FIELD[key],now)]]:base;
    };
    const control=(key:StatusKey)=>{
      const on=!!statusChecked[key],now=currentOf(key);
      return <tr key={key}>
        <th scope="row"><CheckField label={FIELD_LABELS[STATUS_KEY_FIELD[key]]} checked={on} disabled={busy}
          onChange={e=>{setStatusChecked(c=>({...c,[key]:e.target.checked}));editStatus({[key]:""});}}/></th>
        <td><div className="cy-hr-change-cell">
          <Field label={FIELD_LABELS[STATUS_KEY_FIELD[key]]} presentation="cell"><select className="cy-sheet-input" disabled={!on||busy} value={on?form[key]??"":now} onChange={e=>editStatus({[key]:e.target.value})}>
            {on?<option value="">請選擇…</option>:null}{optionsOf(key).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></Field>
          {on&&now?<span className="cy-hr-change-now">目前：{shownValue(STATUS_KEY_FIELD[key],now)}</span>:null}
        </div></td></tr>;
    };
    return <EntryTable label="狀態異動" className="cy-hr-change-table"><tbody>
      <tr><th scope="row"><EntryHeading required>生效日期</EntryHeading></th><td><Field label="生效日期" presentation="cell" required><DateInput density="regular" max="9999-12-31" className="cy-sheet-input" value={form.effectiveDate??""} onChange={v=>editStatus({effectiveDate:v})}/></Field></td></tr>
      {STATUS_KEYS.map(control)}
      {statusChecked.nextStatus&&form.nextStatus==="terminated"?<>
        <tr><th scope="row"><EntryHeading required>離職日</EntryHeading></th><td><Field label="離職日" presentation="cell" required><DateInput density="regular" max="9999-12-31" className="cy-sheet-input" value={form.terminationDate??""} onChange={v=>editStatus({terminationDate:v})}/></Field></td></tr>
        <tr><th scope="row"><EntryHeading required>離職原因</EntryHeading></th><td><Field label="離職原因" presentation="cell" required><input className="cy-sheet-input" value={form.terminationReason??""} onChange={e=>editStatus({terminationReason:e.target.value})}/></Field></td></tr>
      </>:null}
      <tr><th scope="row"><EntryHeading required>原因</EntryHeading></th><td><Field label="原因" presentation="cell" required><input className="cy-sheet-input" value={form.reason??""} onChange={e=>setForm({...form,reason:e.target.value})}/></Field></td></tr>
    </tbody></EntryTable>;
  }

  async function openAction(kind: ActionKind,employeeId?:number) {
    const targetId=employeeId??detail?.id;if(!targetId)return;
    const request=actionRequest.begin();setActionReady(kind!=='salary');setActionEmployeeId(targetId);setActionName(detail?.id===targetId?detail.employee_no+' '+detail.name:'');setActionError('');setActionSalaryBefore(null);
    setForm(kind==='status'?{effectiveDate:taipeiToday(),nextStatus:'',storeId:'',jobTitleId:'',employmentType:'',scheduleMode:''}:kind==='salary'?{effectiveDate:taipeiToday(),paymentType:'monthly'}:{});
    setStatusChecked({});setRedundant(null);setDeleteRedundant(true);setStatusCurrent(kind==='status'&&detail?.id===targetId?detail:null);
    setAllowances([]);setAction(kind);
    if(kind==='status'&&detail?.id!==targetId){
      // Locked fields show the employee's current values, so they are read first.
      setActionReady(false);setActionLoading(true);
      try{
       const employee=await apiRequest<EmployeeDetail>(`${ROOT}/employees/${targetId}`);
       if(!request.current())return;
       setStatusCurrent(employee);setActionName(employee.employee_no+' '+employee.name);setActionReady(true);
      }catch(error){if(request.current())setActionError(errorText(error))}finally{if(request.current())setActionLoading(false)}
    }
    if(kind==='salary'){
      setActionLoading(true);
      try{
       const [items,wages,employee]=await Promise.all([
        apiRequest<SalaryItem[]>(`${ROOT}/settings/salary-item-types`),apiRequest<unknown[]>(`${ROOT}/settings/minimum-wages`),
        detail?.id===targetId?Promise.resolve(detail):apiRequest<EmployeeDetail>(`${ROOT}/employees/${targetId}`),
       ]);
       if(!request.current())return;
       const amendment=salaryAmendmentDraft(employee.salaryRecords,taipeiToday()),current=amendment.current;
       setActionReady(true);setActionName(employee.employee_no+' '+employee.name);setActionSalaryBefore(current);
       const used=new Set(current?.allowances.map(row=>row.item_type_id)??[]);
       setSalaryItems(items.filter(item=>item.is_active===1||used.has(item.id)));setMinimumWageSet(wages.length>0);
       setForm(amendment.form);setAllowances(amendment.allowances);
      }catch(error){if(request.current())setActionError(errorText(error))}finally{if(request.current())setActionLoading(false)}
    }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    if (!action || actionEmployeeId===null||actionLoading||busy||!actionReady||actionWriting.current) return;actionWriting.current=true;setActionError("");
    const targetId=actionEmployeeId;
    const endpoint = action === "status" ? "status-changes" : action === "salary" ? "salary-records" : "seniority-exclusions";
    const body: Record<string, unknown> = { ...form };
    if(action==="status"){
      // Only ticked fields are sent; each becomes its own record on the effective date.
      const ticked=STATUS_KEYS.filter(key=>statusChecked[key]);
      for(const key of STATUS_KEYS)delete body[key];
      if(!ticked.length){actionWriting.current=false;setActionError("請至少勾選一個要異動的欄位。");return;}
      for(const key of ticked){
        if(!form[key]){actionWriting.current=false;setActionError(`請選擇「${STATUS_KEY_SHORT[key]}」的新值。`);return;}
        body[key]=key==="storeId"||key==="jobTitleId"?Number(form[key]):form[key];
      }
      if(body.nextStatus!=="terminated"){delete body.terminationDate;delete body.terminationReason;}
      if(redundant?.length){if(deleteRedundant)body.deleteRedundantIds=redundant.map(item=>item.id);else body.keepRedundant=true;}
      const known=statusCurrent?.id===targetId?statusCurrent:detail?.id===targetId?detail:null;
      if(known)body.expectedRevision=known.revision;
    }
    if (action === "salary") {
      body.baseAmount = Number(form.baseAmount);
      body.allowances = allowances.filter(row => row.itemTypeId && row.amount)
        .map(row => ({ itemTypeId: Number(row.itemTypeId), amount: Number(row.amount), isRegular: row.isRegular }));
    }
    setBusy(true);
    try {
      await apiRequest(`${ROOT}/employees/${targetId}/${endpoint}`, { method: "POST", json: body });
      setAction(null);setActionEmployeeId(null);
      await Promise.all([...(detail?.id===targetId?[loadDetail(targetId)]:[]),loadList()]);
      if(action==="salary")setSalaryRefresh(n=>n+1);
      setMessage(action === "status" ? "已新增狀態異動。" : action === "salary" ? "已新增薪資異動。" : "已新增年資不計期間。");
    } catch (error) {
      if(action==="status"&&error instanceof ApiClientError&&error.code==="HR_REDUNDANT_LATER_CHANGES"){
        // Not a failure: the form stays open and asks what to do with the records that would become pointless.
        const items=(error.details as {items?:RedundantItem[]}|undefined)?.items;
        if(Array.isArray(items)&&items.length){setRedundant(items);setDeleteRedundant(true);return;}
      }
      setActionError(errorText(error));reportError(errorText(error));
    }
    finally { actionWriting.current=false;setBusy(false); }
  }

  // Only while nothing has been done for the employee yet (detail.deletable; the server checks again).
  async function removeEmployee(event: FormEvent) {
    event.preventDefault();
    if (!detail || deleteNo === null) return;
    setBusy(true);
    try {
      await apiRequest(`${ROOT}/employees/${detail.id}`, { method: "DELETE", json: { confirmEmployeeNo: deleteNo.trim() } });
      setDeleteNo(null); setDetail(null); setSelectedId(null);
      await loadList(false);
      setMessage(`已刪除 ${detail.employee_no} ${detail.name} 的人事資料。`);
    } catch (error) { reportError(errorText(error)); }
    finally { setBusy(false); }
  }

  async function removeExclusion(row: ExclusionRow) {
    if (!detail) return;
    const ok = await confirm({ title: "刪除年資不計期間", description: `${date(row.start_date)}～${date(row.end_date)}，刪除後特休會重新計算。`,
      confirmLabel: "刪除", cancelLabel: "取消", confirmTone: "danger" });
    if (!ok) return;
    setBusy(true);
    try {
      await apiRequest(`${ROOT}/employees/${detail.id}/seniority-exclusions/${row.id}`, { method: "DELETE" });
      await loadDetail(detail.id);
      setMessage("已刪除年資不計期間。");
    } catch (error) { reportError(errorText(error)); }
    finally { setBusy(false); }
  }

  /** 人事管理端取完整身分證字號：沿用既有 API，後端照舊留存取紀錄。 */
  async function loadNationalId(): Promise<string | null> {
    if (!detail) return null;
    const result = await apiRequest<{ nationalId: string | null }>(`${ROOT}/employees/${detail.id}/national-id/reveal`, { method: "POST", json: {} });
    return result.nationalId;
  }

  const today = taipeiToday();
  const currentLeave = [...leave].reverse().find(period => period.periodStart <= today) ?? null;
  const currentSalary = detail?.salaryRecords.find(row => row.effective_date <= today) ?? null;

  return <>
    {compact?<ModuleSections label="人事頁籤" sections={[{key:"people",label:"人員"},{key:"roster",label:"排班"},{key:"attendance",label:"出勤"},{key:"leave",label:"請假"},{key:"salary",label:"薪資"}] as const}
      value={tab} onChange={key=>void switchTab(key)}/>
    :    <nav className="cy-op-tabs cy-hr-top-tabs" aria-label="人事頁籤">
      <button type="button" className={tab==="people"?"active":""} onClick={()=>void switchTab("people")}>人員</button>
      <button type="button" className={tab==="roster"?"active":""} onClick={()=>void switchTab("roster")}>排班</button>
      <button type="button" className={tab==="attendance"?"active":""} onClick={()=>void switchTab("attendance")}>出勤</button>
      <button type="button" className={tab==="leave"?"active":""} onClick={()=>void switchTab("leave")}>請假</button>
      <button type="button" className={tab==="salary"?"active":""} onClick={()=>void switchTab("salary")}>薪資</button>
    </nav>}
    {tab==="people"?<div className="cy-op-module">
    {confirmationDialog}
    <FeedbackBanner message={message} tone={messageTone} />
    <div className="cy-md cy-hr-workspace" data-pane={pane.pane}>
      <section className="cy-op-panel cy-md-list" aria-label="人事清單">
        {compact?<DataViewToolbar searchValue={query} onSearchChange={setQuery} searchLabel="搜尋員工"
          searchPlaceholder="搜尋員工編號、姓名"
          filters={filterControls()}
          activeFilterCount={[statusFilter,storeFilter,typeFilter].filter(Boolean).length}
          actions={<button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>void startCreate()}>＋ 新增員工</button>}
          resultSummary={loadingList?"載入中":nextCursor?`已載入 ${rows.length} 筆，還有更多`:`共 ${rows.length} 筆`}/>
        :        <div className="cy-md-toolbar">
          <div className="cy-md-toolbar-lead">
            <button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增員工</button>
            <input className="cy-op-input" type="search" aria-label="搜尋員工" placeholder="搜尋員工編號、姓名" value={query} onChange={event => setQuery(event.target.value)} />
          </div>
          <div className="cy-md-toolbar-row cy-hr-filter-row">{filterControls()}</div>
          <div className="cy-md-count">{loadingList ? <Loading inline /> : nextCursor ? `已載入 ${rows.length} 筆，還有更多` : `共 ${rows.length} 筆`}</div>
        </div>}
        <div className="cy-op-list">
          {rows.map(row=>compact?<ListRow key={row.id} title={<span className="cy-hr-row-title">{row.name}{row.store_name?<OutlineTag>{row.store_name}</OutlineTag>:null}</span>} subtitle={row.employee_no}
              trailing={<StatusChip tone={statusTone(row.status)}>{statusLabels[row.status]}</StatusChip>}
              selected={selectedId===row.id} onClick={()=>void select(row.id)}/>
            :<ResultRow key={row.id} no={row.employee_no} name={row.name} tag={row.store_name?<OutlineTag>{row.store_name}</OutlineTag>:undefined}
              status={<StatusChip tone={statusTone(row.status)}>{statusLabels[row.status]}</StatusChip>}
              selected={selectedId===row.id} onClick={()=>void select(row.id)}/>)}
          {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的員工。</div> : null}
          {nextCursor ? <button type="button" className="cy-op-button soft" disabled={loadingList} onClick={() => void loadList(true)}>載入更多</button> : null}
        </div>
      </section>

      <section className="cy-op-panel cy-md-detail">
        <MasterDetailBack label="人事清單" disabled={busy} onBack={async () => { if (editing && !(await canLeave())) return; setDraft(null); setCreating(false); pane.close(); }} />
        {draft ? <EmployeeForm draft={draft} detail={creating?null:detail} creating={creating} busy={busy} members={members} stores={stores} jobTitles={jobTitles} patch={patch}
          onCancel={() => void cancelEdit()} onSubmit={saveEmployee} />
          : loadingDetail ? <Loading />
          : detail ? <div>
            <div className="cy-record-header">
              <div>
                <h2>{detail.employee_no} {detail.name} <StatusChip tone={statusTone(detail.status)}>{statusLabels[detail.status]}</StatusChip></h2>
              </div>
              {compact?<OverflowMenu items={detail.deletable?[{label:"刪除",danger:true,disabled:busy,onClick:()=>setDeleteNo("")}]:[]}/>
              :<div className="cy-record-actions">
                <button type="button" className="cy-op-button" disabled={busy} onClick={() => {setCreating(false);setDraft(draftFrom(detail))}}>修改</button>
                {detail.deletable?<button type="button" className="cy-op-button danger" disabled={busy} onClick={()=>setDeleteNo("")}>刪除</button>:null}
              </div>}
            </div>
            {compact?<ActionBar><button type="button" className="cy-op-button primary" disabled={busy} onClick={()=>{setCreating(false);setDraft(draftFrom(detail))}}>修改</button></ActionBar>:null}
            <div className="cy-hr-detail-body">
              <HrEmployeeSheet value={draftFrom(detail)} detail={detail} editing={false} creating={false} busy={busy}
                members={members} stores={stores} jobTitles={jobTitles} patch={patch} loadNationalId={loadNationalId}/>
              <section className="cy-customer-cards" aria-label="人事紀錄">
                <HrEmployeeLeaveOverview employeeId={detail.id} onManage={()=>{setInitialLeaveEmployeeId(detail.id);void switchTab("leave")}} />
                <RelatedCard title="薪資" count={detail.salaryRecords.length} empty="尚無薪資異動。"
                  summary={currentSalary ? <strong>目前 {salaryText(currentSalary)}</strong> : null}
                  rows={detail.salaryRecords.slice(0, 3).map(row => <span key={row.id}>{date(row.effective_date)}　{salaryText(row)}　{row.reason}</span>)}
                  onAdd={() => void openAction("salary")} onView={() => setBrowse("salary")} />
                <HrEmployeeBonusCard employee={detail}/>
                <RelatedCard className="cy-hr-status-card" title="狀態異動" count={personnelChanges(detail).length} empty="尚無狀態異動。"
                  rows={personnelChanges(detail).length?[statusTable(personnelChanges(detail).slice(0,3))]:[]}
                  onAdd={() => void openAction("status")} onView={personnelChanges(detail).length>3?() => setBrowse("status"):undefined} />
                <RelatedCard title="年資不計期間" count={detail.seniorityExclusions.length} empty="沒有年資不計期間。"
                  rows={detail.seniorityExclusions.slice(0, 3).map(row => <span key={row.id}>{date(row.start_date)}～{date(row.end_date)}　{row.reason}</span>)}
                  onAdd={() => void openAction("exclusion")} onView={() => setBrowse("exclusion")} />
              </section>
            </div>
          </div>
          : <MasterDetailEmpty title="尚未選擇員工" />}
      </section>
    </div>

    {detail && browse ? <Dialog open size="large" onClose={() => setBrowse(null)}
      title={`${browse === "leave" ? "特休" : browse === "salary" ? "薪資異動" : browse === "status" ? "狀態異動" : "年資不計期間"} — ${detail.employee_no} ${detail.name}`}>
      <div className="cy-op-table-wrap"><table className="cy-op-table cy-rt" aria-label="人事歷史紀錄">
       <thead><tr>{(browse==='leave'?['年資','應給日數','年度起訖']:browse==='salary'?['生效日','計薪／本薪','津貼','原因']:browse==='status'?['生效日期','異動日期','異動內容','原因']:['起日','迄日','原因','操作']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
        {browse==='leave'?[...leave].reverse().map(row=><tr key={row.periodStart}><td data-label="年資" data-priority="title">{row.serviceYearsLabel}</td><td data-label="應給">{row.days} 日</td><td data-label="年度">{date(row.periodStart)}～{date(row.periodEnd)}</td></tr>):null}
        {browse==='salary'?detail.salaryRecords.map(row=><tr key={row.id}><td data-label="生效日" data-priority="title">{date(row.effective_date)}</td><td data-label="計薪／本薪">{salaryText(row)}</td><td data-label="津貼">{row.allowances.map(a=>a.item_name+' '+money(a.amount)+(a.is_regular?'':'（非經常性）')).join('、')||'—'}</td><td data-label="原因" data-priority="wide">{row.reason}</td></tr>):null}
        {browse==='status'?personnelChanges(detail).map(row=><tr key={row.key}><td data-label="生效日期" data-priority="title" className="nowrap">{date(row.effective_date)}{row.effective_date>taipeiToday()?<small className="cy-hr-pending">待生效</small>:null}</td><td data-label="異動日期" className="nowrap" data-priority="wide">{date(row.recorded_date)}</td><td data-label="異動內容" data-priority="wide">{changeContent(row)}</td><td data-label="原因" data-priority="wide">{row.reason}</td></tr>):null}
        {browse==='exclusion'?detail.seniorityExclusions.map(row=><tr key={row.id}><td data-label="起日" data-priority="title">{date(row.start_date)}</td><td data-label="迄日">{date(row.end_date)}</td><td data-label="原因">{row.reason}</td><td data-label="操作"><button type="button" className="cy-op-button compact soft" disabled={busy} onClick={()=>void removeExclusion(row)}>刪除</button></td></tr>):null}
       </tbody></table></div>

    </Dialog> : null}

    {deleteNo !== null && detail ? <Dialog showCloseButton={false} open size="small" title="刪除人事資料" onClose={() => setDeleteNo(null)}>
      <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={event => void removeEmployee(event)}>
    <>
        <p>這筆人事資料還沒有任何薪資、請假、班表或出勤紀錄，可以刪除（例如建錯了）。會一併刪除 {detail.employee_no} {detail.name} 的學經歷與聯絡人，無法復原。請輸入員工編號確認。</p>
        <EntryFields columns={2} label="確認刪除員工" rows={[{label:"員工編號",required:true,content:<input className="cy-sheet-input" autoFocus value={deleteNo} onChange={e=>setDeleteNo(e.target.value)}/>}]} />
        <div className="cy-op-form-footer">
          <button type="button" className="cy-op-button" disabled={busy} onClick={() => setDeleteNo(null)}>取消</button>
          <button className="cy-op-button danger" disabled={busy || deleteNo.trim() !== detail.employee_no} aria-busy={busy || undefined}>刪除</button>
        </div>
      
    </>
  </form>
    </Dialog> : null}
  </div>:tab==="roster"?<HrRosterPanel/>:tab==="attendance"?<HrAttendancePanel initialEmployeeId={attendanceFocus?.employeeId} initialMonth={attendanceFocus?.month}/>:tab==="leave"?<HrLeavePanel initialEmployeeId={initialLeaveEmployeeId}/>:<HrSalaryPanel refreshToken={salaryRefresh} onRaise={(id)=>void openAction("salary",id)} initialView={salaryView.current} onViewChange={view=>{salaryView.current=view}}
   onNavigate={target=>{if(target.tab==="leave")setInitialLeaveEmployeeId(target.employeeId);else setAttendanceFocus({employeeId:target.employeeId,month:target.month});void switchTab(target.tab)}}/>}
    {action&&actionEmployeeId!==null?<Dialog showCloseButton={false} open
      size={action==="salary"?"large":action==="exclusion"?"small":"medium"} dismissible={!busy&&!actionLoading}
      title={(action==="status"?"新增狀態異動":action==="salary"?"新增薪資異動":"新增年資不計期間")+(actionName?"｜"+actionName:"")}
      onClose={()=>{actionRequest.invalidate();setAction(null);setActionEmployeeId(null)}}>
      {actionLoading?<Loading/>:<form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={e=>void submitAction(e)}>
       {action==="salary"?<>
        <p className="cy-notice cy-hr-salary-current" role="note">{actionSalaryBefore?"目前："+salaryText(actionSalaryBefore):"尚無已生效薪資設定"}。本視窗為薪資設定異動，非當月實發。</p>
        <EntryTable label="調薪資料">
         <thead><tr><th><EntryHeading required>生效日</EntryHeading></th><th>計薪方式</th>
          <th><EntryHeading required>本薪</EntryHeading></th><th><EntryHeading required>原因</EntryHeading></th></tr></thead>
         <tbody><tr>
          <td><Field label="生效日" presentation="cell" required><DateInput density="regular" max="9999-12-31" className="cy-sheet-input" value={form.effectiveDate??""} onChange={v=>setForm({...form,effectiveDate:v})}/></Field></td>
          <td><Field label="計薪方式" presentation="cell"><select className="cy-sheet-input" value={form.paymentType??"monthly"} onChange={e=>setForm({...form,paymentType:e.target.value})}>
           <option value="monthly">月薪</option><option value="hourly">時薪</option></select></Field></td>
          <td><Field label={form.paymentType==="hourly"?"時薪（元）":"本薪（元）"} presentation="cell" required><input className="cy-sheet-input" type="number" min="0" step="1" value={form.baseAmount??""} onChange={e=>setForm({...form,baseAmount:e.target.value})}/></Field></td>
          <td><Field label="異動原因" presentation="cell" required><input className="cy-sheet-input" value={form.reason??""} onChange={e=>setForm({...form,reason:e.target.value})}/></Field></td>
         </tr></tbody>
        </EntryTable>
        {allowances.length===0?<section className="cy-sheet-rows" aria-label="津貼"><h3 className="cy-sheet-rows-title">津貼</h3>
          <p className="cy-op-empty cy-hr-allowance-empty">{salaryItems.length?"目前沒有津貼。":"尚未設定津貼項目（請先到人事設定新增）。"}</p>
          {salaryItems.length?<button type="button" className="cy-op-button" disabled={busy} onClick={()=>setAllowances([{itemTypeId:String(salaryItems[0].id),amount:"",isRegular:true}])}>＋ 新增津貼</button>:null}</section>
         :<RecordRows title="津貼" editing busy={busy} rows={allowances} rowKey={(_,index)=>index}
          columns={[
           {label:"項目",view:row=>salaryItems.find(item=>String(item.id)===row.itemTypeId)?.name??"",
            edit:(row,index)=><select className="cy-sheet-input" aria-label="津貼項目" disabled={busy} value={row.itemTypeId}
             onChange={e=>setAllowances(current=>current.map((x,i)=>i===index?{...x,itemTypeId:e.target.value}:x))}>
             {salaryItems.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>},
           {label:"金額",view:row=>row.amount,edit:(row,index)=><input type="number" min="0" step="1"
             aria-label="津貼金額" disabled={busy} className="cy-sheet-input" value={row.amount}
             onChange={e=>setAllowances(current=>current.map((x,i)=>i===index?{...x,amount:e.target.value}:x))}/>},
           {label:"經常性",view:row=>row.isRegular?"是":"否",
            edit:(row,index)=><CheckField label="經常性" checked={row.isRegular} disabled={busy}
             onChange={e=>setAllowances(current=>current.map((x,i)=>i===index?{...x,isRegular:e.target.checked}:x))}/>}
          ]}
          onInsert={index=>setAllowances(current=>[...current.slice(0,index+1),
            {itemTypeId:String(salaryItems[0]?.id??""),amount:"",isRegular:true},...current.slice(index+1)])}
          onRemove={index=>setAllowances(current=>current.filter((_,i)=>i!==index))}/>}
        {!minimumWageSet?<p className="cy-notice cy-notice-warning">尚未設定最低工資，無法比對；仍可存檔。</p>:null}
       </>:action==="status"?statusForm():<EntryFields columns={2} label="年資不計期間" rows={[
        {label:"起日",required:true,content:<DateInput density="regular" max="9999-12-31" className="cy-sheet-input" value={form.startDate??""} onChange={v=>setForm({...form,startDate:v})}/>},
        {label:"迄日",required:true,content:<DateInput density="regular" max="9999-12-31" className="cy-sheet-input" value={form.endDate??""} onChange={v=>setForm({...form,endDate:v})}/>},
        {label:"原因",required:true,content:<input className="cy-sheet-input" value={form.reason??""} onChange={e=>setForm({...form,reason:e.target.value})}/>}
       ]}/>}
       {actionError?<><p role="alert" className="cy-notice cy-notice-danger">{actionError}</p>{!actionReady?<button type="button" className="cy-op-button soft" onClick={()=>void openAction(action,actionEmployeeId)}>重新讀取目前設定</button>:null}</>:null}
       {action==="status"&&redundant?.length?<div role="alert" className="cy-notice cy-notice-warning cy-hr-redundant">
        <div>{redundant.map(item=><p key={item.id}>已有「{date(item.effectiveDate)} {item.fieldLabel}：{item.previousLabel} → {item.nextLabel}」，存檔後那筆會變成沒有變化。</p>)}</div>
        <CheckField label={redundant.length>1?"一併刪除這些筆":"一併刪除該筆"} checked={deleteRedundant} onChange={e=>setDeleteRedundant(e.target.checked)}/>
       </div>:null}
       <div className="cy-op-form-footer">
        {action==="status"?<span className="cy-hr-change-summary">{statusSummary()}</span>:null}
        <button type="button" className="cy-op-button" disabled={busy} onClick={()=>{actionRequest.invalidate();setAction(null);setActionEmployeeId(null)}}>取消</button>
        <button className="cy-op-button primary" disabled={busy||!actionReady} aria-busy={busy||undefined}>{action==="status"?"儲存":"新增"}</button>
       </div>
      </form>}
    </Dialog>:null}
</>;
}

/** Every field except 備註 and 學經歷 is required; one of 手機／市話 is enough. */
function missingFields(draft: Draft): string[] {
  const missing: string[] = [];
  const need = (label: string, value: string) => { if (!value.trim()) missing.push(label); };
  need("員工編號", draft.employeeNo); need("姓名", draft.name);
  if (draft.changeNationalId) need("身分證字號", draft.nationalId);
  need("性別", draft.gender); need("出生日期", draft.birthDate); need("到職日", draft.hireDate);
  if (!draft.mobile.trim() && !draft.phone.trim()) missing.push("手機或市話");
  need("門市", draft.storeId); need("職稱", draft.jobTitleId);
  need("戶籍地址", draft.registeredAddress); need("通訊地址", draft.mailingAddress);
  if (!draft.contacts[0]?.name.trim()) missing.push("緊急聯絡人姓名");
  if (!draft.contacts[0]?.phone.trim()) missing.push("緊急聯絡人電話");
  return missing;
}

function EmployeeForm({draft,detail,creating,busy,members,stores,jobTitles,patch,onCancel,onSubmit}:{
 draft:Draft;detail:EmployeeDetail|null;creating:boolean;busy:boolean;members:MemberOption[];
 stores:{id:number;name:string}[];jobTitles:{id:number;name:string}[];patch:(value:Partial<Draft>)=>void;
 onCancel:()=>void;onSubmit:(event:FormEvent)=>Promise<void>;
}){
 const compact=useCompactLayout();
 return <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={e=>void onSubmit(e)}>
  <div className="cy-record-header cy-edit-header">
   <h2>{creating?"新增員工":"修改 "+draft.employeeNo+" "+draft.name}</h2>
   {compact?<ActionBar>
    <button type="button" className="cy-op-button" disabled={busy} onClick={onCancel}>取消</button>
    <button className="cy-op-button primary" disabled={busy} aria-busy={busy||undefined}>{creating?"建立員工":"儲存修改"}</button>
   </ActionBar>:<div className="cy-record-actions">
    <button type="button" className="cy-op-button" disabled={busy} onClick={onCancel}>取消</button>
    <button className="cy-op-button primary" disabled={busy} aria-busy={busy||undefined}>{creating?"建立員工":"儲存修改"}</button>
   </div>}
  </div>
  <div className="cy-hr-form-body">
   <HrEmployeeSheet value={draft} detail={detail} editing creating={creating} busy={busy}
    members={members} stores={stores} jobTitles={jobTitles} patch={patch} loadNationalId={async()=>null}/>
  </div>
 </form>;
}
