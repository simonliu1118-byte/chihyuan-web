import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { apiRequest } from "../../api/client";
import { taipeiToday } from "../../../shared/erp-query-history";
import type { HrPaymentType, HrStatus } from "../../../shared/hr";
import type { AnnualLeavePeriod } from "../../../shared/hr-annual-leave";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { Loading } from "../../ui/feedback/Loading";
import { formatDate } from "../../ui/foundation/format";
import { enterAdvancesFields, enterAdvancesThenSubmits } from "../../ui/foundation/enter-advance";
import { CheckField, Field, FormSection, RequiredRows } from "../../ui/forms/Field";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import { Dialog } from "../../ui/overlays/Dialog";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { RelatedCard } from "../../ui/records/RelatedCard";
import "./hr-operational.css";
import {HrRosterPanel} from "./HrRosterPanel";
import {HrAttendancePanel} from "./HrAttendancePanel";
import {HrLeavePanel} from "./HrLeavePanel";
import {HrEmployeeLeaveOverview} from "./HrEmployeeLeaveOverview";

const ROOT = "/api/business/hr";
const statusLabels: Record<HrStatus, string> = { probation: "試用", active: "在職", leave: "留職停薪", terminated: "離職" };
const statusTone = (status: HrStatus) => status === "active" ? "success" as const
  : status === "probation" ? "info" as const : status === "leave" ? "warning" as const : "neutral" as const;

// Rows come back from the HR API as stored (snake_case); only the fields this page reads are typed.
interface EmployeeRow { id: number; employee_no: string; name: string; status: HrStatus }
interface ContactRow { name: string; relationship: string | null; phone: string }
interface EducationRow { school: string; department: string | null; degree: string | null; graduation_month: string | null }
interface WorkRow { company: string; job_title: string | null; start_month: string | null; end_month: string | null; note: string | null }
interface StatusChangeRow { id: number; effective_date: string; next_status: HrStatus; reason: string }
interface SalaryRow { id: number; effective_date: string; payment_type: HrPaymentType; base_amount: number; reason: string;
  allowances: { item_name: string; amount: number; is_regular: number }[] }
interface ExclusionRow { id: number; start_date: string; end_date: string; reason: string }
interface EmployeeDetail extends EmployeeRow {
  member_id: number | null; memberLabel?: string | null; nationalIdMasked: string | null; birth_date: string | null; gender: string | null;
  mobile: string | null; phone: string | null; mailing_address: string | null; registered_address: string | null;
  hire_date: string; seniority_start_date: string; termination_date: string | null; termination_reason: string | null;
  note: string | null; revision: number;
  store_id:number|null;job_title_id:number|null;roster_sort:number;employment_type:"full"|"half"|"casual";skip_roster_checks:number;schedule_mode:"shift"|"hours"|"none";
  contacts: ContactRow[]; education: EducationRow[]; workHistory: WorkRow[];
  statusChanges: StatusChangeRow[]; salaryRecords: SalaryRow[]; seniorityExclusions: ExclusionRow[];
}
/** A live CYID account; memberId is the local CY Web record when one exists. */
interface MemberOption { employeeId: string; employeeNo: string; name: string; memberId: number | null }
interface SalaryItem { id: number; name: string; is_active: number }

interface Draft {
  employeeNo: string; name: string; nationalId: string; gender: string; birthDate: string;
  /** Binding: memberIdentityId is set only when the user picks or clears it in this edit. */
  memberIdentityId?: string | null; memberLabel: string; changeNationalId: boolean;
  mobile: string; phone: string; mailingAddress: string; registeredAddress: string;
  hireDate: string; seniorityStartDate: string; note: string; status: HrStatus;
  storeId:string;jobTitleId:string;rosterSort:string;employmentType:"full"|"half"|"casual";skipRosterChecks:boolean;scheduleMode:"shift"|"hours"|"none";
  contacts: { name: string; relationship: string; phone: string }[];
  education: { school: string; department: string; degree: string; graduationMonth: string }[];
  workHistory: { company: string; jobTitle: string; startMonth: string; endMonth: string; note: string }[];
}
type ActionKind = "status" | "salary" | "exclusion";
type BrowseKind = "leave" | "salary" | "status" | "exclusion";

const money = (value: number) => `${value.toLocaleString("zh-TW")} 元`;
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
    contacts: [], education: [], workHistory: [] };
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
    contacts: detail.contacts.map(row => ({ name: row.name, relationship: row.relationship ?? "", phone: row.phone })),
    education: detail.education.map(row => ({ school: row.school, department: row.department ?? "", degree: row.degree ?? "",
      graduationMonth: toMonthInput(row.graduation_month) })),
    workHistory: detail.workHistory.map(row => ({ company: row.company, jobTitle: row.job_title ?? "",
      startMonth: toMonthInput(row.start_month), endMonth: toMonthInput(row.end_month), note: row.note ?? "" })),
  };
}

export function HrOperationalPage() {
  const [tab,setTab]=useState<"people"|"roster"|"attendance"|"leave">("people");
 const [initialLeaveEmployeeId,setInitialLeaveEmployeeId]=useState<number|null>(null);
  const [stores,setStores]=useState<{id:number;name:string}[]>([]);
  const [jobTitles,setJobTitles]=useState<{id:number;name:string}[]>([]);
  useEffect(()=>{void Promise.all([
    apiRequest<{id:number;name:string}[]>(ROOT+"/settings/stores"),
    apiRequest<{id:number;name:string}[]>(ROOT+"/settings/job-titles")
  ]).then(([a,b])=>{setStores(a);setJobTitles(b)}).catch(()=>{});},[]);
  const pane = useMasterDetailPane();
  const { confirm, confirmationDialog } = useConfirmation();
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const [salaryItems, setSalaryItems] = useState<SalaryItem[]>([]);
  const [minimumWageSet, setMinimumWageSet] = useState(true);
  const [browse, setBrowse] = useState<BrowseKind | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [deleteNo, setDeleteNo] = useState<string | null>(null);
  const editing = draft !== null;
  const unsavedGuard = useUnsavedChangesGuard({ active: editing || action !== null, blocked: busy, message: "人事資料尚未儲存，確定放棄？" });
  const canLeave = async () => (await unsavedGuard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", cancelLabel: "繼續編輯", confirmTone: "danger",
  }))).allowed;

  async function loadList(append = false) {
    const params = new URLSearchParams({ limit: "40" });
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (append && nextCursor) params.set("cursor", String(nextCursor));
    setLoadingList(true);
    try {
      const page = await apiRequest<{ items: EmployeeRow[]; nextCursor: number | null }>(`${ROOT}/employees?${params}`);
      setRows(current => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    } catch (error) { reportError(errorText(error)); }
    finally { setLoadingList(false); }
  }

  async function loadDetail(id: number) {
    setLoadingDetail(true);
    try {
      const [employee, periods] = await Promise.all([
        apiRequest<EmployeeDetail>(`${ROOT}/employees/${id}`),
        apiRequest<AnnualLeavePeriod[]>(`${ROOT}/employees/${id}/annual-leave`),
      ]);
      setDetail(employee); setLeave(periods);
    } catch (error) { reportError(errorText(error)); }
    finally { setLoadingDetail(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 200);
    return () => window.clearTimeout(timer);
  }, [query, statusFilter]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId]);
  useEffect(() => {
    void apiRequest<MemberOption[]>(`${ROOT}/members`).then(setMembers).catch(error => reportError(errorText(error)));
  }, []);

  async function select(id: number) {
    if (id === selectedId && !editing) { pane.open(); return; }
    if (editing && !(await canLeave())) return;
    setDraft(null); setCreating(false); setSelectedId(id); pane.open();
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
      education: draft.education.map(row => ({ ...row, graduationMonth: fromMonthInput(row.graduationMonth) })),
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

  async function openAction(kind: ActionKind) {
    setForm(kind === "status" ? { effectiveDate: taipeiToday(), nextStatus: "active" }
      : kind === "salary" ? { effectiveDate: taipeiToday(), paymentType: "monthly" } : {});
    setAllowances([]);
    setAction(kind);
    if (kind === "salary") {
      try {
        const [items, wages] = await Promise.all([
          apiRequest<SalaryItem[]>(`${ROOT}/settings/salary-item-types`),
          apiRequest<unknown[]>(`${ROOT}/settings/minimum-wages`),
        ]);
        setSalaryItems(items.filter(item => item.is_active === 1)); setMinimumWageSet(wages.length > 0);
      } catch (error) { reportError(errorText(error)); }
    }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    if (!detail || !action) return;
    const endpoint = action === "status" ? "status-changes" : action === "salary" ? "salary-records" : "seniority-exclusions";
    const body: Record<string, unknown> = { ...form };
    if (action === "salary") {
      body.baseAmount = Number(form.baseAmount);
      body.allowances = allowances.filter(row => row.itemTypeId && row.amount)
        .map(row => ({ itemTypeId: Number(row.itemTypeId), amount: Number(row.amount), isRegular: row.isRegular }));
    }
    setBusy(true);
    try {
      await apiRequest(`${ROOT}/employees/${detail.id}/${endpoint}`, { method: "POST", json: body });
      setAction(null);
      await Promise.all([loadDetail(detail.id), loadList()]);
      setMessage(action === "status" ? "已新增狀態異動。" : action === "salary" ? "已新增薪資異動。" : "已新增年資不計期間。");
    } catch (error) { reportError(errorText(error)); }
    finally { setBusy(false); }
  }

  // Temporary for testing (BD-059): removed before launch.
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

  async function reveal() {
    if (!detail) return;
    try {
      const result = await apiRequest<{ nationalId: string | null }>(`${ROOT}/employees/${detail.id}/national-id/reveal`, { method: "POST", json: {} });
      setRevealed(result.nationalId ?? "未填寫");
    } catch (error) { reportError(errorText(error)); }
  }

  const today = taipeiToday();
  const currentLeave = [...leave].reverse().find(period => period.periodStart <= today) ?? null;
  const currentSalary = detail?.salaryRecords.find(row => row.effective_date <= today) ?? null;

  return <>
    <nav className="cy-op-tabs cy-hr-top-tabs" aria-label="人事頁籤">
      <button type="button" className={tab==="people"?"active":""} onClick={()=>setTab("people")}>人員</button>
      <button type="button" className={tab==="roster"?"active":""} onClick={()=>setTab("roster")}>排班</button>
      <button type="button" className={tab==="attendance"?"active":""} onClick={()=>setTab("attendance")}>出勤</button>
      <button type="button" className={tab==="leave"?"active":""} onClick={()=>setTab("leave")}>請假</button>
    </nav>
    {tab==="people"?<div className="cy-op-module">
    {confirmationDialog}
    <FeedbackBanner message={message} tone={messageTone} />
    <div className="cy-md cy-hr-workspace" data-pane={pane.pane}>
      <section className="cy-op-panel cy-md-list" aria-label="人事清單">
        <div className="cy-md-toolbar">
          <div className="cy-md-toolbar-lead">
            <button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增員工</button>
            <input className="cy-op-input" type="search" aria-label="搜尋員工" placeholder="搜尋員工編號、姓名" value={query} onChange={event => setQuery(event.target.value)} />
          </div>
          <div className="cy-md-toolbar-row">
            <select className="cy-op-input" aria-label="人事狀態" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="">全部狀態</option>
              {(Object.keys(statusLabels) as HrStatus[]).map(code => <option key={code} value={code}>{statusLabels[code]}</option>)}
            </select>
          </div>
          <div className="cy-md-count">{loadingList ? <Loading inline /> : nextCursor ? `已載入 ${rows.length} 筆，還有更多` : `共 ${rows.length} 筆`}</div>
        </div>
        <div className="cy-op-list">
          {rows.map(row => <button key={row.id} type="button" className={`cy-op-list-row cy-hr-row ${selectedId === row.id ? "active" : ""}`}
            aria-current={selectedId === row.id ? "true" : undefined} onClick={() => void select(row.id)}>
            <span className="cy-mono">{row.employee_no}</span>
            <strong>{row.name}</strong>
            <StatusChip tone={statusTone(row.status)}>{statusLabels[row.status]}</StatusChip>
          </button>)}
          {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的員工。</div> : null}
          {nextCursor ? <button type="button" className="cy-op-button quiet" disabled={loadingList} onClick={() => void loadList(true)}>載入更多</button> : null}
        </div>
      </section>

      <section className="cy-op-panel cy-md-detail">
        <MasterDetailBack label="人事清單" disabled={busy} onBack={async () => { if (editing && !(await canLeave())) return; setDraft(null); setCreating(false); pane.close(); }} />
        {draft ? <EmployeeForm draft={draft} creating={creating} busy={busy} members={members} stores={stores} jobTitles={jobTitles} patch={patch}
          onCancel={() => void cancelEdit()} onSubmit={saveEmployee} />
          : loadingDetail ? <Loading />
          : detail ? <div>
            <div className="cy-record-header">
              <div>
                <h2>{detail.employee_no} {detail.name} <StatusChip tone={statusTone(detail.status)}>{statusLabels[detail.status]}</StatusChip></h2>
              </div>
              <div className="cy-record-actions">
                <button type="button" className="cy-op-button" disabled={busy} onClick={() => { setCreating(false); setDraft(draftFrom(detail)); }}>修改</button>
                <button type="button" className="cy-op-button danger" disabled={busy} onClick={() => setDeleteNo("")}>刪除</button>
              </div>
            </div>
            <div className="cy-hr-detail-body">
              <dl className="cy-customer-facts">
                <Fact label="門市" value={stores.find(x=>x.id===detail.store_id)?.name??"未設定"} />
              <Fact label="職稱" value={jobTitles.find(x=>x.id===detail.job_title_id)?.name??"未設定"} />
              <Fact label="僱用型態" value={{full:"正職",half:"半職",casual:"兼職"}[detail.employment_type]??"—"} />
              <Fact label="排班方式" value={{shift:"班別",hours:"時段或時數",none:"不排班"}[detail.schedule_mode]??"—"} />
              <Fact label="排序" value={String(detail.roster_sort)} />
              <Fact label="不須檢核" value={detail.skip_roster_checks?"是":"否"} />
              <Fact label="到職日" value={date(detail.hire_date)} />
                <Fact label="年資起算日" value={date(detail.seniority_start_date)} />
                <Fact label="身分證字號" value={detail.nationalIdMasked ? <span className="cy-hr-id">{detail.nationalIdMasked}
                  <button type="button" className="cy-op-button compact quiet" onClick={() => void reveal()}>顯示</button></span> : null} />
                <Fact label="綁定使用者" value={detail.member_id ? detail.memberLabel ?? "已綁定" : "未綁定"} />
                <Fact label="出生日期" value={date(detail.birth_date)} />
                <Fact label="性別" value={detail.gender} />
                <Fact label="手機" value={detail.mobile} />
                <Fact label="市話" value={detail.phone} />
                <Fact label="戶籍地址" value={detail.registered_address} wide />
                <Fact label="通訊地址" value={detail.mailing_address} wide />
                {detail.termination_date ? <Fact label="離職" value={`${date(detail.termination_date)}　${detail.termination_reason ?? ""}`} wide /> : null}
                {detail.note ? <Fact label="備註" value={detail.note} wide /> : null}
              </dl>
              <section className="cy-customer-cards" aria-label="人事紀錄">
                <HrEmployeeLeaveOverview employeeId={detail.id} onManage={()=>{setInitialLeaveEmployeeId(detail.id);setTab("leave")}} />
                <RelatedCard title="薪資" count={detail.salaryRecords.length} empty="尚無薪資異動。"
                  summary={currentSalary ? <strong>目前 {salaryText(currentSalary)}</strong> : null}
                  rows={detail.salaryRecords.slice(0, 3).map(row => <span key={row.id}>{date(row.effective_date)}　{salaryText(row)}　{row.reason}</span>)}
                  onAdd={() => void openAction("salary")} onView={() => setBrowse("salary")} />
                <RelatedCard title="狀態異動" count={detail.statusChanges.length} empty="尚無狀態異動。"
                  rows={detail.statusChanges.slice(0, 3).map(row => <span key={row.id}>{date(row.effective_date)}　{statusLabels[row.next_status]}　{row.reason}</span>)}
                  onAdd={() => void openAction("status")} onView={() => setBrowse("status")} />
                <RelatedCard title="年資不計期間" count={detail.seniorityExclusions.length} empty="沒有年資不計期間。"
                  rows={detail.seniorityExclusions.slice(0, 3).map(row => <span key={row.id}>{date(row.start_date)}～{date(row.end_date)}　{row.reason}</span>)}
                  onAdd={() => void openAction("exclusion")} onView={() => setBrowse("exclusion")} />
                <RelatedCard title="緊急聯絡人" count={detail.contacts.length} empty="尚未填寫。"
                  rows={detail.contacts.map((row, index) => <span key={index}>{row.name}{row.relationship ? `（${row.relationship}）` : ""}　{row.phone}</span>)} />
                <RelatedCard title="學歷" count={detail.education.length} empty="尚未填寫。"
                  rows={detail.education.map((row, index) => <span key={index}>{[row.school, row.department, row.degree, row.graduation_month ? `${row.graduation_month} 畢業` : null].filter(Boolean).join("　")}</span>)} />
                <RelatedCard title="工作經歷" count={detail.workHistory.length} empty="尚未填寫。"
                  rows={detail.workHistory.map((row, index) => <span key={index}>{[row.company, row.job_title, row.start_month || row.end_month ? `${row.start_month ?? ""}～${row.end_month ?? ""}` : null].filter(Boolean).join("　")}</span>)} />
              </section>
            </div>
          </div>
          : <MasterDetailEmpty title="尚未選擇員工" hint="從左側清單選一位員工，或按清單上方的「＋ 新增員工」。" />}
      </section>
    </div>

    {detail && action ? <Dialog open size="medium" dismissible={!busy}
      title={action === "status" ? "新增狀態異動" : action === "salary" ? "新增薪資異動" : "新增年資不計期間"}
      onClose={() => { setAction(null); }}>
      <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={event => void submitAction(event)}>
    <FormSection>
        <div className="cy-f-grid">
          {action === "exclusion" ? <>
            <FormField label="起日" type="date" required value={form.startDate} onChange={value => setForm({ ...form, startDate: value })} />
            <FormField label="迄日" type="date" required value={form.endDate} onChange={value => setForm({ ...form, endDate: value })} />
          </> : <FormField label="生效日" type="date" required value={form.effectiveDate} onChange={value => setForm({ ...form, effectiveDate: value })} />}
          {action === "status" ? <Field  label="新狀態" size="s"><select className="cy-op-input" value={form.nextStatus} onChange={event => setForm({ ...form, nextStatus: event.target.value })}>
            {(Object.keys(statusLabels) as HrStatus[]).map(code => <option key={code} value={code}>{statusLabels[code]}</option>)}</select></Field> : null}
          {action === "status" && form.nextStatus === "terminated" ? <>
            <FormField label="離職日" type="date" required value={form.terminationDate} onChange={value => setForm({ ...form, terminationDate: value })} />
            <FormField label="離職原因" required value={form.terminationReason} onChange={value => setForm({ ...form, terminationReason: value })} />
          </> : null}
          {action === "salary" ? <>
            <Field  label="計薪方式" size="m"><select className="cy-op-input" value={form.paymentType} onChange={event => setForm({ ...form, paymentType: event.target.value })}>
              <option value="monthly">月薪</option><option value="hourly">時薪</option></select></Field>
            <FormField label={form.paymentType === "hourly" ? "時薪（元）" : "本薪（元）"} type="number" required value={form.baseAmount}
              onChange={value => setForm({ ...form, baseAmount: value })} />
          </> : null}
          <FormField label={action === "salary" ? "異動原因" : "原因"} required wide value={form.reason} onChange={value => setForm({ ...form, reason: value })} />
        </div>
        {action === "salary" ? <section className="cy-form-block">
          <div className="cy-form-block-head"><div><h3>津貼</h3></div>
            <button type="button" className="cy-op-button compact" disabled={busy || !salaryItems.length}
              onClick={() => setAllowances([...allowances, { itemTypeId: String(salaryItems[0]?.id ?? ""), amount: "", isRegular: true }])}>＋ 增加津貼</button></div>
          <div className="cy-form-block-body">
            {!salaryItems.length ? <p className="cy-form-block-empty">尚未設定津貼項目（右上角「設定」）。</p> : null}
            {allowances.map((row, index) => <div className="cy-hr-allowance-row" key={index}>
              <select className="cy-op-input" aria-label="津貼項目" value={row.itemTypeId}
                onChange={event => setAllowances(allowances.map((item, n) => n === index ? { ...item, itemTypeId: event.target.value } : item))}>
                {salaryItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <input className="cy-op-input" aria-label="金額" type="number" min="0" step="1" placeholder="金額" value={row.amount}
                onChange={event => setAllowances(allowances.map((item, n) => n === index ? { ...item, amount: event.target.value } : item))} />
              <CheckField  label="經常性" size="s"  checked={row.isRegular}
                onChange={event => setAllowances(allowances.map((item, n) => n === index ? { ...item, isRegular: event.target.checked } : item))} />
              <button type="button" className="cy-op-button compact quiet cy-row-remove" onClick={() => setAllowances(allowances.filter((_, n) => n !== index))}>移除</button>
            </div>)}
          </div>
        </section> : null}
        {action === "salary" && !minimumWageSet ? <p className="cy-notice cy-notice-warning">尚未設定最低工資，無法比對；仍可存檔。</p> : null}
        <div className="cy-op-form-footer">
          <button type="button" className="cy-op-button" disabled={busy} onClick={() => { setAction(null); }}>取消</button>
          <button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>新增</button>
        </div>
      
    </FormSection>
  </form>
    </Dialog> : null}

    {detail && browse ? <Dialog open size="large" onClose={() => setBrowse(null)}
      title={`${browse === "leave" ? "特休" : browse === "salary" ? "薪資異動" : browse === "status" ? "狀態異動" : "年資不計期間"} — ${detail.employee_no} ${detail.name}`}>
      <div className="cy-hr-browse">
        {browse === "leave" ? [...leave].reverse().map(period => <div key={period.periodStart} className="cy-hr-browse-row">
          <strong>{period.serviceYearsLabel}</strong><span>{period.days} 日</span><span>{date(period.periodStart)}～{date(period.periodEnd)}</span></div>) : null}
        {browse === "salary" ? detail.salaryRecords.map(row => <div key={row.id} className="cy-hr-browse-row">
          <strong>{date(row.effective_date)}</strong><span>{salaryText(row)}</span><span>{row.reason}</span>
          {row.allowances.length ? <small>{row.allowances.map(item => `${item.item_name} ${money(item.amount)}${item.is_regular ? "" : "（非經常性）"}`).join("、")}</small> : null}
        </div>) : null}
        {browse === "status" ? detail.statusChanges.map(row => <div key={row.id} className="cy-hr-browse-row">
          <strong>{date(row.effective_date)}</strong><span>{statusLabels[row.next_status]}</span><span>{row.reason}</span></div>) : null}
        {browse === "exclusion" ? detail.seniorityExclusions.map(row => <div key={row.id} className="cy-hr-browse-row">
          <strong>{date(row.start_date)}～{date(row.end_date)}</strong><span>{row.reason}</span>
          <button type="button" className="cy-op-button compact quiet cy-row-remove" disabled={busy} onClick={() => void removeExclusion(row)}>刪除</button></div>) : null}
      </div>
    </Dialog> : null}

    {revealed !== null ? <Dialog open size="small" title="身分證字號" onClose={() => setRevealed(null)}>
      <p className="cy-hr-revealed">{revealed}</p>
      <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => setRevealed(null)}>關閉</button></div>
    </Dialog> : null}
    {deleteNo !== null && detail ? <Dialog open size="small" title="刪除人事資料（測試用）" onClose={() => setDeleteNo(null)}>
      <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={event => void removeEmployee(event)}>
    <FormSection>
        <p>會一併刪除 {detail.employee_no} {detail.name} 的學經歷、聯絡人、異動、薪資、班表與出勤，無法復原。請輸入員工編號確認。</p>
        <Field  label="員工編號" size="s"><input className="cy-op-input" autoFocus value={deleteNo} onChange={e => setDeleteNo(e.target.value)} /></Field>
        <div className="cy-op-form-footer">
          <button type="button" className="cy-op-button" disabled={busy} onClick={() => setDeleteNo(null)}>取消</button>
          <button className="cy-op-button danger" disabled={busy || deleteNo.trim() !== detail.employee_no} aria-busy={busy || undefined}>刪除</button>
        </div>
      
    </FormSection>
  </form>
    </Dialog> : null}
  </div>:tab==="roster"?<HrRosterPanel/>:tab==="attendance"?<HrAttendancePanel/>:<HrLeavePanel initialEmployeeId={initialLeaveEmployeeId}/>}</>;
}

function Fact({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return <div className={`cy-customer-info${wide ? " cy-hr-fact-wide" : ""}`}><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}

function FormField({ label, value, onChange, type = "text", required, wide }: {
  label: string; value: string | undefined; onChange: (value: string) => void; type?: string; required?: boolean; wide?: boolean;
}) {
  return <label className={wide ? "wide" : undefined}>{label}
    <input className="cy-op-input" type={type} required={required} max={type === "date" ? "9999-12-31" : undefined} min={type === "number" ? 0 : undefined} step={type === "number" ? 1 : undefined}
      value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>;
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
  if (!draft.contacts.length) missing.push("緊急聯絡人");
  return missing;
}

function EmployeeForm({ draft, creating, busy, members, stores, jobTitles, patch, onCancel, onSubmit }: {
  draft: Draft; creating: boolean; busy: boolean; members: MemberOption[]; stores: { id: number; name: string }[]; jobTitles: { id: number; name: string }[];
  patch: (value: Partial<Draft>) => void; onCancel: () => void; onSubmit: (event: FormEvent) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const text = (key: keyof Draft, type = "text") => <input className="cy-op-input" type={type} max={type === "date" ? "9999-12-31" : undefined} disabled={busy}
    value={draft[key] as string ?? ""} onChange={event => patch({ [key]: event.target.value } as Partial<Draft>)} />;
  const select = (key: keyof Draft, options: ReactNode) => <select className="cy-op-input" disabled={busy} value={draft[key] as string}
    onChange={event => patch({ [key]: event.target.value } as Partial<Draft>)}><option value="">請選擇</option>{options}</select>;
  const sameAddress = draft.mailingAddress !== "" && draft.registeredAddress === draft.mailingAddress;
  const noPhone = !draft.mobile.trim() && !draft.phone.trim();
  return <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={event => void onSubmit(event)}>
    <div className="cy-record-header cy-edit-header">
      <div><h2>{creating ? "新增員工" : `修改 ${draft.employeeNo} ${draft.name}`}</h2></div>
      <div className="cy-record-actions">
        <button type="button" className="cy-op-button" disabled={busy} onClick={onCancel}>取消</button>
        <button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>{creating ? "建立員工" : "儲存修改"}</button>
      </div>
    </div>
    <div className="cy-hr-form-body">
      <FormSection title="基本資料">
        <Field label="員工編號" required size="s">{text("employeeNo")}</Field>
        <Field label="姓名" required size="s">{text("name")}</Field>
        {draft.changeNationalId ? <Field label="身分證字號" required size="s">{text("nationalId")}</Field>
          : <Field label="身分證字號" size="s"><span className="cy-hr-picker">
            <input className="cy-op-input" readOnly value={draft.nationalId} aria-label="身分證字號" />
            <button type="button" className="cy-op-button" disabled={busy} onClick={() => patch({ changeNationalId: true, nationalId: "" })}>變更</button>
          </span></Field>}
        <Field label="性別" required size="s">{select("gender", <><option value="男">男</option><option value="女">女</option><option value="其他">其他</option></>)}</Field>
        <Field label="出生日期" required size="s">{text("birthDate", "date")}</Field>
        <Field label="綁定使用者" size="m"><span className="cy-hr-picker">
          <input className="cy-op-input" readOnly value={draft.memberLabel || "不綁定"} aria-label="綁定使用者" />
          <button type="button" className="cy-op-button" disabled={busy} onClick={() => setPicking(true)}>選擇</button>
        </span></Field>
      </FormSection>
      <FormSection title="聯絡方式">
        <Field label="手機" required={noPhone} oneOf="與市話擇一" reportAs="手機或市話" size="s">{text("mobile")}</Field>
        <Field label="市話" required={noPhone} oneOf="與手機擇一" reportAs="手機或市話" size="s">{text("phone")}</Field>
        <Field label="戶籍地址" required size="l"><input className="cy-op-input" value={draft.registeredAddress} disabled={busy}
          onChange={event => patch(sameAddress ? { registeredAddress: event.target.value, mailingAddress: event.target.value } : { registeredAddress: event.target.value })} /></Field>
        <Field label="通訊地址" required size="l"><input className="cy-op-input" value={draft.mailingAddress} disabled={busy || sameAddress}
          onChange={event => patch({ mailingAddress: event.target.value })} /></Field>
        <CheckField label="通訊地址同戶籍地址" size="l" checked={sameAddress} disabled={busy || !draft.registeredAddress}
          onChange={event => patch({ mailingAddress: event.target.checked ? draft.registeredAddress : "" })} />
      </FormSection>
      <FormSection title="任職與排班">
        {creating ? <Field label="人事狀態" required size="s"><select className="cy-op-input" value={draft.status} disabled={busy} onChange={event => patch({ status: event.target.value as HrStatus })}>
          <option value="probation">試用</option><option value="active">在職</option></select></Field> : null}
        <Field label="到職日" required size="s">{text("hireDate", "date")}</Field>
        <Field label="年資起算日" size="s" hint="空白＝到職日">{text("seniorityStartDate", "date")}</Field>
        <Field label="門市" required size="s">{select("storeId", stores.map(x => <option key={x.id} value={x.id}>{x.name}</option>))}</Field>
        <Field label="職稱" required size="s">{select("jobTitleId", jobTitles.map(x => <option key={x.id} value={x.id}>{x.name}</option>))}</Field>
        <Field label="僱用型態" required size="s"><select className="cy-op-input" value={draft.employmentType} disabled={busy} onChange={e => { const employmentType = e.target.value as Draft["employmentType"];
          patch({ employmentType, scheduleMode: employmentType === "full" ? "shift" : employmentType !== "casual" && draft.scheduleMode === "none" ? "shift" : draft.scheduleMode }); }}>
          <option value="full">正職</option><option value="half">半職</option><option value="casual">兼職</option></select></Field>
        <Field label="排班方式" required size="s"><select className="cy-op-input" value={draft.scheduleMode} disabled={busy} onChange={e => patch({ scheduleMode: e.target.value as Draft["scheduleMode"] })}>
          <option value="shift">班別</option>{draft.employmentType !== "full" ? <option value="hours">時段或時數</option> : null}{draft.employmentType === "casual" ? <option value="none">不排班</option> : null}</select></Field>
        <Field label="班表排序" size="s"><input className="cy-op-input" type="number" step="1" value={draft.rosterSort} disabled={busy} onChange={e => patch({ rosterSort: e.target.value })} /></Field>
        <CheckField label="不須檢核" checked={draft.skipRosterChecks} disabled={busy} onChange={e => patch({ skipRosterChecks: e.target.checked })} />
        <Field label="備註" size="l"><textarea className="cy-op-input" rows={2} value={draft.note} disabled={busy} onChange={event => patch({ note: event.target.value })} /></Field>
      </FormSection>

      <RequiredRows label="緊急聯絡人" satisfied={draft.contacts.length > 0} />
      <RowsBlock title={<>緊急聯絡人<span className="cy-field-required" aria-hidden="true">＊</span><small>至少一位</small></>} addLabel="增加聯絡人" busy={busy} empty={!draft.contacts.length}
        onAdd={() => patch({ contacts: [...draft.contacts, { name: "", relationship: "", phone: "" }] })}>
        {draft.contacts.map((row, index) => <div className="cy-hr-edit-row contact" key={index}>
          <RowInput label="姓名" value={row.name} required onChange={name => patch({ contacts: draft.contacts.map((item, n) => n === index ? { ...item, name } : item) })} />
          <RowInput label="關係" value={row.relationship} onChange={relationship => patch({ contacts: draft.contacts.map((item, n) => n === index ? { ...item, relationship } : item) })} />
          <RowInput label="電話" value={row.phone} required onChange={phone => patch({ contacts: draft.contacts.map((item, n) => n === index ? { ...item, phone } : item) })} />
          <RemoveRow busy={busy} onRemove={() => patch({ contacts: draft.contacts.filter((_, n) => n !== index) })} />
        </div>)}
      </RowsBlock>

      <RowsBlock title="學歷" addLabel="增加學歷" busy={busy} empty={!draft.education.length}
        onAdd={() => patch({ education: [...draft.education, { school: "", department: "", degree: "", graduationMonth: "" }] })}>
        {draft.education.map((row, index) => <div className="cy-hr-edit-row education" key={index}>
          <RowInput label="學校" value={row.school} required onChange={school => patch({ education: draft.education.map((item, n) => n === index ? { ...item, school } : item) })} />
          <RowInput label="科系" value={row.department} onChange={department => patch({ education: draft.education.map((item, n) => n === index ? { ...item, department } : item) })} />
          <RowInput label="學位" value={row.degree} onChange={degree => patch({ education: draft.education.map((item, n) => n === index ? { ...item, degree } : item) })} />
          <RowInput label="畢業年月" type="month" value={row.graduationMonth} onChange={graduationMonth => patch({ education: draft.education.map((item, n) => n === index ? { ...item, graduationMonth } : item) })} />
          <RemoveRow busy={busy} onRemove={() => patch({ education: draft.education.filter((_, n) => n !== index) })} />
        </div>)}
      </RowsBlock>

      <RowsBlock title="工作經歷" addLabel="增加經歷" busy={busy} empty={!draft.workHistory.length}
        onAdd={() => patch({ workHistory: [...draft.workHistory, { company: "", jobTitle: "", startMonth: "", endMonth: "", note: "" }] })}>
        {draft.workHistory.map((row, index) => <div className="cy-hr-edit-row work" key={index}>
          <RowInput label="公司" value={row.company} required onChange={company => patch({ workHistory: draft.workHistory.map((item, n) => n === index ? { ...item, company } : item) })} />
          <RowInput label="職稱" value={row.jobTitle} onChange={jobTitle => patch({ workHistory: draft.workHistory.map((item, n) => n === index ? { ...item, jobTitle } : item) })} />
          <RowInput label="起年月" type="month" value={row.startMonth} onChange={startMonth => patch({ workHistory: draft.workHistory.map((item, n) => n === index ? { ...item, startMonth } : item) })} />
          <RowInput label="迄年月" type="month" value={row.endMonth} onChange={endMonth => patch({ workHistory: draft.workHistory.map((item, n) => n === index ? { ...item, endMonth } : item) })} />
          <RemoveRow busy={busy} onRemove={() => patch({ workHistory: draft.workHistory.filter((_, n) => n !== index) })} />
        </div>)}
      </RowsBlock>
    </div>
    {picking ? <MemberPicker members={members} employeeNo={draft.employeeNo} onClose={() => setPicking(false)}
      onPick={member => { patch(member ? { memberIdentityId: member.employeeId, memberLabel: memberText(member) } : { memberIdentityId: null, memberLabel: "" }); setPicking(false); }} /> : null}
  </form>;
}

/** Searchable list of live CYID accounts; the account with the same 員工編號 comes first. */
function MemberPicker({ members, employeeNo, onPick, onClose }: {
  members: MemberOption[]; employeeNo: string; onPick: (member: MemberOption | null) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = members.filter(row => !q || row.employeeNo.toLowerCase().includes(q) || row.name.toLowerCase().includes(q))
    .sort((a, b) => Number(b.employeeNo === employeeNo) - Number(a.employeeNo === employeeNo) || a.employeeNo.localeCompare(b.employeeNo));
  return <Dialog open size="small" title="選擇綁定使用者" onClose={onClose}>
    <input className="cy-op-input" type="search" autoFocus placeholder="搜尋員工編號、姓名" aria-label="搜尋使用者" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="cy-hr-member-list">
      <button type="button" className="cy-op-list-row" onClick={() => onPick(null)}><strong>不綁定</strong></button>
      {rows.map(row => <button key={row.employeeId} type="button" className="cy-op-list-row" onClick={() => onPick(row)}>
        <span className="cy-mono">{row.employeeNo}</span><strong>{row.name || "（未命名）"}</strong>
        {row.employeeNo === employeeNo ? <StatusChip tone="info">員工編號相同</StatusChip> : null}
      </button>)}
      {!rows.length ? <p className="cy-op-empty">沒有符合的使用者。</p> : null}
    </div>
  </Dialog>;
}

function RowsBlock({ title, addLabel, onAdd, empty, busy, children }: {
  title: ReactNode; addLabel: string; onAdd: () => void; empty: boolean; busy: boolean; children: ReactNode;
}) {
  return <section className="cy-form-block">
    <div className="cy-form-block-head"><div><h3>{title}</h3></div>
      <button type="button" className="cy-op-button compact" disabled={busy} onClick={onAdd}>＋ {addLabel}</button></div>
    <div className="cy-form-block-body">{empty ? <p className="cy-form-block-empty">尚未填寫。</p> : children}</div>
  </section>;
}

function RowInput({ label, value, onChange, type = "text", required }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean;
}) {
  return <input className="cy-op-input" aria-label={label} placeholder={label} type={type} required={required} max={type === "month" ? "9999-12" : undefined}
    value={value} onChange={event => onChange(event.target.value)} />;
}

function RemoveRow({ busy, onRemove }: { busy: boolean; onRemove: () => void }) {
  return <button type="button" className="cy-op-button compact quiet cy-row-remove" disabled={busy} onClick={onRemove}>移除</button>;
}
