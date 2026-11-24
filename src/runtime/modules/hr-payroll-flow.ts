/**
 * 每月薪資工作清單的純邏輯（無 React、無網路）：狀態分類、篩選、待補事項的動作對應、計算全部／確認全部的批次執行。
 * 畫面只負責呈現；所有計算、驗證、權限與樂觀鎖仍由後端既有 API 負責。
 */
export interface MonthRun {
  id: number; status: "draft" | "confirmed" | "paid"; revision: number; payDate: string;
  gross: number; deductions: number; net: number; issues: string[]; paidDays: number | null; reason: string;
}
export interface MonthRow {
  employeeId: number; employeeNo: string; name: string; storeId: number | null; storeName: string | null;
  run: MonthRun | null; voidCount: number; hasSalary: boolean;
}
export type FlowStatus = "uncalculated" | "pending" | "review" | "confirmed" | "paid";
export const FLOW_ORDER: FlowStatus[] = ["uncalculated", "pending", "review", "confirmed", "paid"];
export const FLOW_LABEL: Record<FlowStatus, string> = { uncalculated: "未計算", pending: "有待補", review: "待確認", confirmed: "已確認", paid: "已發薪" };
export const FLOW_TONE: Record<FlowStatus, "neutral" | "danger" | "info" | "success"> = { uncalculated: "neutral", pending: "danger", review: "info", confirmed: "success", paid: "neutral" };

/** 沒有薪資紀錄、也沒有任何有效薪資設定的人，不必計算就知道待補（尚未設定薪資）。 */
export const MISSING_SALARY_ISSUE = "尚未設定薪資";
export const rowIssues = (row: MonthRow): string[] => row.run ? row.run.issues : row.hasSalary ? [] : [MISSING_SALARY_ISSUE];
export function flowStatus(row: MonthRow): FlowStatus {
  if (!row.run) return row.hasSalary ? "uncalculated" : "pending";
  if (row.run.status === "paid") return "paid";
  if (row.run.status === "confirmed") return "confirmed";
  return row.run.issues.length ? "pending" : "review";
}
export const pendingCount = (row: MonthRow) => flowStatus(row) === "pending" ? rowIssues(row).length : 0;
export function statusCounts(rows: readonly MonthRow[]): Record<FlowStatus, number> {
  const counts: Record<FlowStatus, number> = { uncalculated: 0, pending: 0, review: 0, confirmed: 0, paid: 0 };
  for (const row of rows) counts[flowStatus(row)]++;
  return counts;
}
export function filterRows(rows: readonly MonthRow[], status: FlowStatus | null, search: string): MonthRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter(row => (!status || flowStatus(row) === status) && (!needle || (row.employeeNo + " " + row.name).toLowerCase().includes(needle)));
}
export function totals(rows: readonly MonthRow[]) {
  let gross = 0, net = 0;
  for (const row of rows) if (row.run) { gross += row.run.gross; if (!row.run.issues.length) net += row.run.net; }
  return { gross, net };
}

/** 計算全部：未計算（有薪資設定）與草稿。已確認／已發薪永不處理；撤回過又尚未重算的人需要個別填原因，不在批次內。 */
export const canBatchCalculate = (row: MonthRow) => row.run ? row.run.status === "draft" : row.hasSalary && row.voidCount === 0;
export const calcTargets = (rows: readonly MonthRow[]) => rows.filter(canBatchCalculate);
export const calcSkipped = (rows: readonly MonthRow[]) => rows.filter(row => !row.run && row.hasSalary && row.voidCount > 0);
/** 重算草稿沿用它原本的計薪天數及（需要時的）原因；其他情況不送原因，由後端存預設「YYYY/MM 月薪」。 */
export function calcPayload(row: MonthRow, month: string, payDate: string, extra: { paidDays?: number | null; reason?: string } = {}) {
  const run = row.run, payload: Record<string, unknown> = { employeeId: row.employeeId, month, payDate };
  // extra.paidDays === null 表示明確恢復整月計算；undefined 表示沿用草稿原本的計薪天數。
  const paidDays = extra.paidDays !== undefined ? extra.paidDays : run?.paidDays ?? null;
  if (paidDays !== null) payload.paidDays = paidDays;
  const reason = extra.reason ?? (run && (paidDays !== null || row.voidCount > 0) ? run.reason : undefined);
  if (reason) payload.reason = reason;
  return payload;
}
/** 確認全部只處理沒有待補事項的草稿。 */
export const confirmTargets = (rows: readonly MonthRow[]) => rows.filter(row => row.run?.status === "draft" && row.run.issues.length === 0);

/** 依原順序送出，最多 `limit` 個同時進行；單筆失敗不中斷其他筆。 */
export async function runPool<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>, progress?: (done: number, total: number) => void):
  Promise<({ item: T; ok: true; value: R } | { item: T; ok: false; error: unknown })[]> {
  const results: ({ item: T; ok: true; value: R } | { item: T; ok: false; error: unknown })[] = new Array(items.length);
  let next = 0, done = 0;
  async function lane() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      try { results[index] = { item, ok: true, value: await work(item) }; }
      catch (error) { results[index] = { item, ok: false, error }; }
      progress?.(++done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return results;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : "操作失敗";
export const isConflict = (error: unknown) => (error as { status?: number } | null)?.status === 409;
/** 409 且訊息要求重算＝來源資料（出勤、設定、級距）已異動，該員工須重新計算才能確認。 */
export const needsRecalc = (error: unknown) => isConflict(error) && /重算/.test(errorText(error));
export interface BatchOutcome { total: number; succeeded: number; failures: { employeeId: number; label: string; message: string; conflict: boolean }[] }
const label = (row: MonthRow) => row.employeeNo + " " + row.name;
export async function calculateAll(rows: readonly MonthRow[], month: string, payDate: string, call: (payload: Record<string, unknown>) => Promise<unknown>,
  progress?: (done: number, total: number) => void): Promise<BatchOutcome> {
  const targets = calcTargets(rows);
  const results = await runPool(targets, 2, row => call(calcPayload(row, month, payDate)), progress);
  const failures = results.flatMap(r => r.ok ? [] : [{ employeeId: r.item.employeeId, label: label(r.item), message: errorText(r.error), conflict: needsRecalc(r.error) }]);
  return { total: targets.length, succeeded: targets.length - failures.length, failures };
}
export async function confirmAll(rows: readonly MonthRow[], call: (id: number, revision: number) => Promise<unknown>,
  progress?: (done: number, total: number) => void): Promise<BatchOutcome> {
  const targets = confirmTargets(rows);
  const results = await runPool(targets, 1, row => call(row.run!.id, row.run!.revision), progress);
  const failures = results.flatMap(r => r.ok ? [] : [{ employeeId: r.item.employeeId, label: label(r.item), message: errorText(r.error), conflict: needsRecalc(r.error) }]);
  return { total: targets.length, succeeded: targets.length - failures.length, failures };
}

export type IssueActionType = "attendance" | "leave" | "salary" | "profile" | "review" | "days";
export type ReviewKind = "absence" | "holiday_shifted" | "regular_emergency";
export interface IssueAction { type: IssueActionType; label: string; reviewKind?: ReviewKind }
export interface IssueInfo { text: string; date: string | null; actions: IssueAction[] }
const DATE = /^(\d{4}-\d{2}-\d{2}) /;
const GO_ATTENDANCE: IssueAction = { type: "attendance", label: "到出勤補正" };
const SET_SALARY: IssueAction = { type: "salary", label: "設定薪資" };
const SET_PROFILE: IssueAction = { type: "profile", label: "計薪／投保設定" };
const rules: [RegExp, IssueAction[]][] = [
  [/未打卡須先補正或明確確認曠班/, [GO_ATTENDANCE, { type: "review", label: "確認曠班", reviewKind: "absence" }]],
  [/缺卡須先補正出勤/, [GO_ATTENDANCE]],
  [/例假出勤須另確認法定緊急事由及補假/, [{ type: "review", label: "確認例假緊急出勤", reviewKind: "regular_emergency" }, GO_ATTENDANCE]],
  [/國定假日／例假出勤不可逕以一般加班補休沖抵/, [{ type: "review", label: "確認假日已合法調移", reviewKind: "holiday_shifted" }, GO_ATTENDANCE]],
  [/假日出勤須完整確認加班時數及結算方式|可能加班，請先在出勤確認/, [GO_ATTENDANCE]],
  [/排班假尚未完成正式假單/, [{ type: "leave", label: "到請假補單" }]],
  [/缺少已生效的薪資主檔紀錄|本月前段缺少已生效薪資主檔紀錄|主檔時薪低於本月法定最低工資|月中月薪／時薪方式異動|^尚未設定薪資$/, [SET_SALARY]],
  [/請先新增本月有效的薪資計算／投保設定|半職／兼職月薪需填約定每週正常工時|時薪津貼／全勤須填約定月正常工時|薪資主檔已有同名全勤津貼|月中全勤／約定工時異動須分段核對/, [SET_PROFILE]],
  [/未滿月／月中調薪|手填計薪天數|本月含留職停薪/, [{ type: "days", label: "調整計薪天數" }]],
];
/** 把後端的待補文字對應到可執行的動作；沒有對應的只顯示文字。 */
export function classifyIssue(text: string): IssueInfo {
  const date = DATE.exec(text)?.[1] ?? null;
  const hit = rules.find(([pattern]) => pattern.test(text));
  return { text, date, actions: hit ? hit[1] : [] };
}

export interface ProfileSettings {
  laborEnabled?: boolean; employmentInsurance?: boolean; laborBasis?: number; healthEnabled?: boolean; healthBasis?: number; dependents?: number;
  pensionEnabled?: boolean; pensionEmployerRate?: number; pensionSelfRate?: number; attendanceEnabled?: boolean; attendanceAmount?: number;
}
const num = (v: number | undefined) => (v ?? 0).toLocaleString("zh-TW");
/** 薪資設定展開列右欄：勞保／就保、健保、勞退、全勤的一行摘要。 */
export function profileSummary(p: ProfileSettings): { label: string; value: string }[] {
  return [
    { label: "勞保／就保", value: p.laborEnabled ? "本單位・" + num(p.laborBasis) + (p.employmentInsurance ? "・含就保" : "") : "未由本單位投保" },
    { label: "健保", value: p.healthEnabled ? "本單位・" + num(p.healthBasis) + "・眷口 " + (p.dependents ?? 0) : "未由本單位投保" },
    { label: "勞退", value: p.pensionEnabled ? "雇主 " + (p.pensionEmployerRate ?? 0) + "%・自提 " + (p.pensionSelfRate ?? 0) + "%" : "未提繳" },
    { label: "全勤", value: p.attendanceEnabled ? "每月・$" + num(p.attendanceAmount) : "不適用" },
  ];
}
export const proposedPayday = (month: string) => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 5)).toISOString().slice(0, 10);
export const slashDate = (date: string) => date.replaceAll("-", "/");
export const monthLabel = (month: string) => month.slice(0, 4) + "/" + month.slice(5, 7);

export interface SummaryResult { gross: number; deductions: number; net: number; employer: number; issues: string[]; lines: { label: string; amount: number; kind: string }[] }
const sumLines = (result: SummaryResult, kind: string, labels: readonly string[]) => result.lines.filter(l => l.kind === kind && labels.includes(l.label)).reduce((n, l) => n + l.amount, 0);
/** 本月明細的精簡版：本薪、津貼及其他應發、勞健保／勞退自提、扣繳、其他扣項、實領、公司負擔；逐日明細仍在可展開的區塊。 */
export function monthSummary(result: SummaryResult) {
  const base = sumLines(result, "earning", ["本薪", "時薪工資"]);
  const insurance = sumLines(result, "deduction", ["勞保", "就保", "健保", "勞退個人自提"]);
  const withheld = sumLines(result, "deduction", ["所得稅扣繳", "非每月獎金扣繳", "健保補充保費"]);
  return { base, allowances: result.gross - base, insurance, withheld, otherDeductions: Math.max(0, result.deductions - insurance - withheld),
    gross: result.gross, net: result.net, netPending: result.issues.length > 0, employer: result.employer };
}

/** 待補文字中的完整日期改短（2026-11-12 → 11/12），讓清單一眼看得懂。 */
export const shortIssue = (text: string) => text.replace(/^\d{4}-(\d{2})-(\d{2}) /, "$1/$2 ");
