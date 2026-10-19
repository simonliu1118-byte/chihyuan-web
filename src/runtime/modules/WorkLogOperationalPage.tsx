import { formatDate } from "../../ui/foundation/format";
import { StatusFilter } from "../../ui/data/StatusFilter";
import { workLogNextStep, workLogTone } from "./status-flow";
import { NextStep } from "../../ui/feedback/NextStep";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { usePendingAction } from "../../ui/feedback/usePendingAction";
import { Loading } from "../../ui/feedback/Loading";
import { enterAdvancesFields, enterAdvancesThenSubmits } from "../../ui/foundation/enter-advance";
import { LoadMoreRow, useLoadMore } from "../../ui/data/useLoadMore";
import { taipeiToday } from "../../../shared/erp-query-history";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import "./worklog-operational.css";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { Dialog } from "../../ui/overlays/Dialog";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import type {
  WorkLogCategoryRef,
  WorkLogConfiguration,
  WorkLogDetail,
  WorkLogEntry,
  WorkLogStatisticsResult,
  WorkLogStatusCode,
  WorkLogSummary,
} from "../../../shared/work-log";
import { ApiClientError } from "../../api/client";
import {
  cancelWorkLogReview,
  createWorkLog,
  deleteWorkLogCreated,
  loadWorkLogConfiguration,
  loadWorkLogDetail,
  loadWorkLogStatistics,
  reviewWorkLog,
  searchWorkLogs,
  submitWorkLog,
  updateWorkLogCreated,
  withdrawWorkLog,
} from "../api/work-log-runtime-client";

interface CategoryDraft {
  key: string;
  workLogCategoryId: number | null;
  quantity: string;
}

interface EntryDraft {
  key: string;
  entryTypeCode: string;
  content: string;
  platformId: number | null;
  categories: CategoryDraft[];
}

interface WorkLogDraft {
  logDate: string;
  dateFrom: string;
  dateTo: string;
  workDays: string;
  typeCode: string;
  entries: EntryDraft[];
}

const statusText: Record<WorkLogStatusCode, string> = {
  created: "已建檔",
  pending_review: "待審核",
  reviewed: "已審核",
};

const progressSteps: readonly { code: WorkLogStatusCode; label: string }[] = [
  { code: "created", label: "填寫" },
  { code: "pending_review", label: "待審核" },
  { code: "reviewed", label: "已審核" },
];

/** Business dates follow Taiwan time; toISOString() would give yesterday before 08:00. */
function today(): string {
  return taipeiToday();
}

function key(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newEntry(): EntryDraft {
  return {
    key: key("entry"),
    entryTypeCode: "",
    content: "",
    platformId: null,
    categories: [],
  };
}

function newDraft(): WorkLogDraft {
  const date = today();
  return {
    logDate: date,
    dateFrom: date,
    dateTo: date,
    workDays: "1",
    typeCode: "",
    entries: [newEntry()],
  };
}

function draftFromDetail(detail: WorkLogDetail): WorkLogDraft {
  return {
    logDate: detail.logDate,
    dateFrom: detail.dateFrom,
    dateTo: detail.dateTo,
    workDays: detail.workDays,
    typeCode: detail.typeCode,
    entries: detail.entries.map((entry) => ({
      key: `entry-${entry.id}`,
      entryTypeCode: entry.entryTypeCode,
      content: entry.content ?? "",
      platformId: entry.platformId,
      categories: entry.categories.map((category) => ({
        key: `category-${category.id}`,
        workLogCategoryId: category.workLogCategoryId,
        quantity: category.quantity,
      })),
    })),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code.includes("REVISION_CONFLICT")) {
      return "工作日誌已被其他人修改，請重新載入後再操作。";
    }
    if (error.status === 403) return "你目前沒有執行此工作日誌操作的權限。";
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") return "登入狀態已失效，請重新登入。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "身分服務暫時無法使用，請稍後再試。";
    const field = error.fields ? Object.values(error.fields)[0] : null;
    return field || error.message || error.code;
  }
  return "目前無法完成工作日誌操作。";
}

export function WorkLogOperationalPage() {
  const [configuration, setConfiguration] = useState<WorkLogConfiguration | null>(null);
  const [statistics, setStatistics] = useState<WorkLogStatisticsResult | null>(null);
  const [rows, setRows] = useState<readonly WorkLogSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<WorkLogDetail | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [statusCounts, setStatusCounts] = useState<Partial<Record<string, number>> | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkLogDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const { pending, track } = usePendingAction();
  const [loadingList, setLoadingList] = useState(true);
  // The page appears once its first list page is in; until then only the shared spinner shows.
  const [listReady, setListReady] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const paging = useLoadMore(searchWorkLogs, setRows, (error) => reportError(errorMessage(error)));
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const { confirm, confirmationDialog } = useConfirmation();
  const guard = useUnsavedChangesGuard({ active: editing, blocked: busy });
  const pane = useMasterDetailPane();
  const canLeave = async () => (await guard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改？", description, confirmLabel: "放棄修改", confirmTone: "danger",
  }))).allowed;
  const [reviewDraft, setReviewDraft] = useState<null | { record: WorkLogDetail; workDays: string; remark: string;
    entries: { entryId: number; content: string; score: string; remark: string }[] }>(null);
  const [reasonDraft, setReasonDraft] = useState<null | { record: WorkLogDetail; kind: "withdraw" | "cancel"; reason: string }>(null);
  const reviewFormId = useId(), reasonFormId = useId();
  const reviewGuard = useUnsavedChangesGuard({ active: !!reviewDraft && (reviewDraft.workDays !== reviewDraft.record.workDays ||
    reviewDraft.remark !== (reviewDraft.record.reviewRemark ?? "") || reviewDraft.entries.some(entry => {
      const original = reviewDraft.record.entries.find(row => row.id === entry.entryId);
      return entry.score !== (original?.reviewScore ?? "") || entry.remark !== (original?.reviewRemark ?? "");
    })) });
  const reasonGuard = useUnsavedChangesGuard({ active: !!reasonDraft?.reason });
  async function closeReview() {
    if (busy) return;
    if ((await reviewGuard.confirmNavigationAsync(description => confirm({ title: "放棄審核修改", description,
      confirmLabel: "放棄修改", confirmTone: "danger" }))).allowed) setReviewDraft(null);
  }
  async function closeReason() {
    if (busy) return;
    if ((await reasonGuard.confirmNavigationAsync(description => confirm({ title: "放棄已填原因", description,
      confirmLabel: "放棄修改", confirmTone: "danger" }))).allowed) setReasonDraft(null);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadWorkLogConfiguration(false),
      loadWorkLogStatistics(),
    ])
      .then(([config, stats]) => {
        if (cancelled) return;
        setConfiguration(config);
        setStatistics(stats);
      })
      .catch((error) => {
        if (!cancelled) reportError(errorMessage(error));
      });
    return () => { cancelled = true; };
  }, [refreshEpoch]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      const listQuery = {
        q: query.trim() || undefined,
        statusCode: statusFilter ? statusFilter as WorkLogStatusCode : undefined,
        limit: 100,
      };
      void searchWorkLogs(listQuery)
        .then((result) => {
          if (cancelled) return;
          setRows(result.items);
          setStatusCounts(result.statusCounts ?? null);
          paging.reset(listQuery, result.nextCursor);
          if (!editing && !creating) {
            setSelectedId((current) => (
              current != null && result.items.some((row) => row.id === current)
                ? current
                : result.items[0]?.id ?? null
            ));
          }
        })
        .catch((error) => {
          if (!cancelled) reportError(errorMessage(error));
        })
        .finally(() => {
          if (!cancelled) { setLoadingList(false); setListReady(true); }
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, statusFilter, refreshEpoch, editing, creating]);

  useEffect(() => {
    if (selectedId == null || creating) {
      if (creating) setSelected(null);
      return;
    }
    let cancelled = false;
    void loadWorkLogDetail(selectedId)
      .then((detail) => {
        if (!cancelled) setSelected(detail);
      })
      .catch((error) => {
        if (!cancelled) {
          setSelected(null);
          reportError(errorMessage(error));
        }
      });
    return () => { cancelled = true; };
  }, [selectedId, creating, refreshEpoch]);

  const categoryById = useMemo(
    () => new Map((configuration?.categories ?? []).map((category) => [category.id, category])),
    [configuration],
  );
  const platformById = useMemo(
    () => new Map((configuration?.platforms ?? []).map((platform) => [platform.id, platform])),
    [configuration],
  );

  async function startCreate() {
    if (busy || !await canLeave()) return;
    pane.open();
    setCreating(true);
    setEditing(true);
    setSelectedId(null);
    setSelected(null);
    setDraft(newDraft());
    setMessage(null);
  }

  function startEdit() {
    if (!selected || selected.statusCode !== "created") return;
    setCreating(false);
    setEditing(true);
    setDraft(draftFromDetail(selected));
    setMessage(null);
  }

  async function cancelEdit() {
    if (busy || !await canLeave()) return;
    if (creating) pane.close();
    setCreating(false);
    setEditing(false);
    setDraft(null);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
  }

  function patchEntry(index: number, patch: Partial<EntryDraft>) {
    setDraft((current) => current ? {
      ...current,
      entries: current.entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry),
    } : current);
  }

  function patchCategory(entryIndex: number, categoryIndex: number, patch: Partial<CategoryDraft>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        entries: current.entries.map((entry, index) => index === entryIndex
          ? {
              ...entry,
              categories: entry.categories.map((category, innerIndex) => innerIndex === categoryIndex
                ? { ...category, ...patch }
                : category),
            }
          : entry),
      };
    });
  }

  function addEntry() {
    if (!draft) return;
    setDraft({ ...draft, entries: [...draft.entries, newEntry()] });
  }

  function removeEntry(index: number) {
    if (!draft || draft.entries.length <= 1) return;
    setDraft({ ...draft, entries: draft.entries.filter((_, entryIndex) => entryIndex !== index) });
  }

  function addCategory(entryIndex: number) {
    if (!draft) return;
    const entry = draft.entries[entryIndex];
    if (!entry) return;
    const used = new Set(entry.categories.flatMap((row) => row.workLogCategoryId == null ? [] : [row.workLogCategoryId]));
    const category = configuration?.categories.find((row) => row.isActive && !used.has(row.id));
    if (!category) {
      reportError("沒有其他可加入的工作分類。");
      return;
    }
    patchEntry(entryIndex, {
      categories: [...entry.categories, {
        key: key("category"),
        workLogCategoryId: category.id,
        quantity: category.inputMode === "boolean" ? "1" : "1",
      }],
    });
  }

  function selectCategory(entryIndex: number, categoryIndex: number, categoryId: number | null) {
    const category = categoryId == null ? null : categoryById.get(categoryId);
    patchCategory(entryIndex, categoryIndex, {
      workLogCategoryId: categoryId,
      quantity: category?.inputMode === "boolean" ? "1" : "1",
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    const entryIssue = draft.entries.findIndex((entry) => !entry.entryTypeCode.trim() || (!entry.content.trim() && entry.categories.length === 0));
    if (!draft.typeCode.trim() || draft.entries.length === 0) { reportError("請填寫日誌類型，並至少加入一個工作項目。"); return; }
    if (entryIssue >= 0) { reportError(`工作項目 ${entryIssue + 1} 請填寫項目類型，以及工作內容或計分分類。`); return; }

    const profile = {
      logDate: draft.logDate,
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
      workDays: draft.workDays.trim(),
      typeCode: draft.typeCode.trim(),
      entries: draft.entries.map((entry, entryIndex) => ({
        entryTypeCode: entry.entryTypeCode.trim(),
        content: entry.content.trim() || null,
        platformId: entry.platformId,
        sortOrder: entryIndex,
        categories: entry.categories.flatMap((category, categoryIndex) => category.workLogCategoryId == null ? [] : [{
          workLogCategoryId: category.workLogCategoryId,
          quantity: category.quantity.trim(),
          sortOrder: categoryIndex,
        }]),
      })),
    };

    setBusy(true);
    setMessage(null);
    try {
      const wasCreating = creating;
      const saved = wasCreating
        ? await createWorkLog(profile)
        : selected
          ? await updateWorkLogCreated(selected.id, { ...profile, expectedRevision: selected.revision })
          : null;
      if (!saved) return;
      setSelected(saved);
      setSelectedId(saved.id);
      setCreating(false);
      setEditing(false);
      setDraft(null);
      setMessage(wasCreating ? "工作日誌已建立。" : "工作日誌草稿已儲存。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: () => Promise<WorkLogDetail>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const detail = await action();
      setSelected(detail);
      setSelectedId(detail.id);
      setMessage(success);
      setRefreshEpoch((value) => value + 1);
      return true;
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!selected) return;
    await runAction(
      () => submitWorkLog(selected.id, { expectedRevision: selected.revision }),
      "工作日誌已送出審核。",
    );
  }

  function withdraw() {
    if (!selected) return;
    setMessage(null);
    setReasonDraft({ record: selected, kind: "withdraw", reason: "" });
  }

  function review() {
    if (!selected || selected.statusCode !== "pending_review") return;
    setMessage(null);
    setReviewDraft({ record: selected, workDays: selected.workDays, remark: selected.reviewRemark ?? "",
      entries: selected.entries.map(entry => ({ entryId: entry.id, content: entry.content || `工作項目 ${entry.id}`,
        score: entry.reviewScore ?? "", remark: entry.reviewRemark ?? "" })) });
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!reviewDraft || busy) return;
    const value = reviewDraft;
    if (await runAction(
      () => reviewWorkLog(value.record.id, {
        expectedRevision: value.record.revision,
        workDays: value.workDays.trim(),
        reviewRemark: value.remark.trim() || null,
        entries: value.entries.map(entry => ({ entryId: entry.entryId, reviewScore: entry.score.trim() || null,
          reviewRemark: entry.remark.trim() || null })),
      }),
      "工作日誌審核完成。",
    )) setReviewDraft(null);
  }

  function cancelReview() {
    if (!selected || selected.statusCode !== "reviewed") return;
    setMessage(null);
    setReasonDraft({ record: selected, kind: "cancel", reason: "" });
  }

  async function saveReason(event: FormEvent) {
    event.preventDefault();
    if (!reasonDraft || busy) return;
    const value = reasonDraft, payload = { expectedRevision: value.record.revision, reason: value.reason.trim() || null };
    if (await runAction(() => value.kind === "withdraw" ? withdrawWorkLog(value.record.id, payload)
      : cancelWorkLogReview(value.record.id, payload), value.kind === "withdraw" ? "工作日誌已撤回，可繼續修改。"
      : "審核已取消，工作日誌回到待審核。")) setReasonDraft(null);
  }

  async function deleteDraft() {
    if (!selected || selected.statusCode !== "created" || busy) return;
    if (!await confirm({ title: "刪除工作日誌？", description: `確定刪除 ${selected.workLogRef}？此操作無法復原。`,
      confirmLabel: "刪除", confirmTone: "danger" })) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteWorkLogCreated(selected.id, selected.revision);
      setSelected(null);
      setSelectedId(null);
      pane.close();
      setMessage("工作日誌草稿已刪除。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function categoryLabel(categoryId: number): string {
    return categoryById.get(categoryId)?.name ?? `Category #${categoryId}`;
  }

  function platformLabel(platformId: number | null): string {
    if (platformId == null) return "未指定平台";
    return platformById.get(platformId)?.name ?? `Platform #${platformId}`;
  }

  if (!listReady) return <Loading />;

  return (
    <div className="cy-worklog-op">
      {confirmationDialog}
      <Dialog open={reviewDraft !== null} title="審核工作日誌" size="large" dismissible={!busy}
        onClose={() => void closeReview()} footer={<div className="cy-dialog-action-row">
          <button type="button" className="cy-op-button" disabled={busy} onClick={() => void closeReview()}>取消</button>
          <button type="submit" form={reviewFormId} className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>完成審核</button>
        </div>}>
        {reviewDraft ? <form onKeyDown={enterAdvancesFields} id={reviewFormId} onSubmit={event => void saveReview(event)}>
          <p>{reviewDraft.record.workLogRef}</p>
          {message ? <p role="alert" className="cy-auth-error">{message}</p> : null}
          <div className="cy-op-form-grid">
            <label>工作日數<input className="cy-op-input" inputMode="decimal" required disabled={busy} value={reviewDraft.workDays}
              onChange={event => setReviewDraft({ ...reviewDraft, workDays: event.target.value })} /></label>
            <label className="wide">整體審核備註<textarea className="cy-op-input" disabled={busy} value={reviewDraft.remark}
              onChange={event => setReviewDraft({ ...reviewDraft, remark: event.target.value })} /></label>
          </div>
          {reviewDraft.entries.map((entry, index) => <section className="cy-op-subsection" key={entry.entryId}>
            <h3>工作項目 {index + 1}</h3><p>{entry.content}</p>
            <div className="cy-op-form-grid">
              <label>審核分數（留空不計分）<input className="cy-op-input" inputMode="decimal" disabled={busy} value={entry.score}
                onChange={event => setReviewDraft({ ...reviewDraft, entries: reviewDraft.entries.map((row, i) => i === index ? { ...row, score: event.target.value } : row) })} /></label>
              <label className="wide">項目審核備註<textarea className="cy-op-input" disabled={busy} value={entry.remark}
                onChange={event => setReviewDraft({ ...reviewDraft, entries: reviewDraft.entries.map((row, i) => i === index ? { ...row, remark: event.target.value } : row) })} /></label>
            </div>
          </section>)}
        </form> : null}
      </Dialog>
      <Dialog open={reasonDraft !== null} title={reasonDraft?.kind === "cancel" ? "取消審核" : "撤回審核"}
        size="small" dismissible={!busy} onClose={() => void closeReason()} footer={<div className="cy-dialog-action-row">
          <button type="button" className="cy-op-button" disabled={busy} onClick={() => void closeReason()}>取消</button>
          <button type="submit" form={reasonFormId} className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>確認</button>
        </div>}>
        {reasonDraft ? <form onKeyDown={enterAdvancesThenSubmits} id={reasonFormId} onSubmit={event => void saveReason(event)}>
          <p>{reasonDraft.record.workLogRef}</p>
          {message ? <p role="alert" className="cy-auth-error">{message}</p> : null}
          <label>原因（可留空）<textarea className="cy-op-input" disabled={busy} value={reasonDraft.reason}
            onChange={event => setReasonDraft({ ...reasonDraft, reason: event.target.value })} /></label>
        </form> : null}
      </Dialog>
      
      <FeedbackBanner message={message} tone={messageTone} />

      <section className="cy-worklog-summary" aria-label="已審核統計">
        <div><span>已審核筆數</span><strong>{statistics?.reviewedCount ?? "—"}</strong></div>
        <div><span>工作日數</span><strong>{statistics?.totalWorkDays ?? "—"}</strong></div>
        <div><span>總分</span><strong>{statistics?.totalFinalScore ?? "—"}</strong></div>
        <div><span>加權平均日分</span><strong>{statistics?.weightedAverageDailyScore ?? "—"}</strong>
          <small>目標 {configuration?.scoringConfig?.targetAverageDailyScore ?? "—"} · 最低 {configuration?.scoringConfig?.minimumAverageDailyScore ?? "—"}</small></div>
        {(configuration?.scoringRows ?? []).length ? <details className="cy-worklog-scoring">
          <summary>計分方式</summary>
          <div className="cy-op-chip-list">
            {(configuration?.scoringRows ?? []).map((row) => (
              <span className="cy-op-chip" key={row.id}>
                {row.workLogCategoryId ? categoryLabel(row.workLogCategoryId) : row.customName ?? "自訂"}：{row.scoreValue ?? "—"}
              </span>
            ))}
          </div>
        </details> : null}
      </section>

      <div className="cy-md" data-pane={pane.pane}>
        <section className="cy-op-panel cy-md-list" aria-label="工作日誌清單">
          <div className="cy-md-toolbar">
            <div className="cy-md-toolbar-lead">
              <button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增日誌</button>
              <input className="cy-op-input" type="search" aria-label="搜尋工作日誌" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋日誌編號、類型、內容" />
            </div>
            <StatusFilter label="日誌狀態" value={statusFilter} onChange={setStatusFilter} counts={statusCounts}
              options={(Object.keys(statusText) as (keyof typeof statusText)[]).map((code) => ({ code, label: statusText[code], tone: workLogTone[code] }))} />
            <div className="cy-md-count">{loadingList ? <Loading inline /> : (paging.hasMore ? `已載入 ${rows.length} 筆，還有更多` : `共 ${rows.length} 筆`)}</div>
          </div>
          <div className="cy-op-list">
            {rows.map((row) => <button key={row.id} type="button" className={`cy-op-list-row cy-status-row ${selectedId === row.id ? "active" : ""}`} aria-current={selectedId === row.id ? "true" : undefined} onClick={async () => { if (!busy && await canLeave()) { setEditing(false); setCreating(false); setDraft(null); setSelectedId(row.id); pane.open(); } }}><strong>{formatDate(row.logDate)} · {row.workDays} 日</strong><span><span className="cy-mono">{row.workLogRef}</span> · 員工 #{row.employeeId}</span><StatusChip tone={workLogTone[row.statusCode]}>{statusText[row.statusCode]}</StatusChip></button>)}
            {loadingList && rows.length === 0 ? <Loading /> : null}
            {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的工作日誌。</div> : null}
            <LoadMoreRow hasMore={paging.hasMore} loading={paging.loading} onMore={() => void paging.more()} />
          </div>
        </section>

        <section className="cy-op-panel cy-md-detail">
          <MasterDetailBack label="工作日誌清單" disabled={busy} onBack={async () => { if (editing) { if (busy || !await canLeave()) return; setEditing(false); setCreating(false); setDraft(null); } pane.close(); }} />
          {editing && draft ? (
          <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={(event) => void save(event)}>
            <div className="cy-record-header cy-edit-header">
              <div><h2>{creating ? "新增工作日誌" : `修改 ${selected?.workLogRef ?? "工作日誌"}`}</h2><p>填寫日期與工作內容；儲存後可在明細按「送出審核」。</p></div>
            <div className="cy-record-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void cancelEdit()}>取消</button>
              <button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>{creating ? "建立日誌" : "儲存修改"}</button></div></div>
            <div className="cy-op-form-grid cy-worklog-head-grid cy-form-grid-spaced">
              <label>日誌日期<input className="cy-op-input" type="date" value={draft.logDate} disabled={busy} onChange={(event) => setDraft({ ...draft, logDate: event.target.value })} /></label>
              <label>期間起<input className="cy-op-input" type="date" value={draft.dateFrom} disabled={busy} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} /></label>
              <label>期間迄<input className="cy-op-input" type="date" value={draft.dateTo} disabled={busy} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} /></label>
              <label>工作日數<input className="cy-op-input" value={draft.workDays} inputMode="decimal" disabled={busy} onChange={(event) => setDraft({ ...draft, workDays: event.target.value })} required /></label>
              <label>日誌類型<input className="cy-op-input" value={draft.typeCode} disabled={busy} onChange={(event) => setDraft({ ...draft, typeCode: event.target.value })} placeholder="輸入日誌類型" required /></label>
            </div>

            <section className="cy-form-block">
              <div className="cy-form-block-head"><div><h3>工作內容</h3><p>每個工作項目可選平台，並加上多個計分分類。</p></div><button type="button" className="cy-op-button compact" disabled={busy} onClick={addEntry}>＋ 增加工作項目</button></div>
              <div className="cy-form-block-body">
              {draft.entries.map((entry, entryIndex) => (
                <div className="cy-worklog-entry" key={entry.key}>
                  <div className="cy-worklog-entry-head"><strong>工作項目 {entryIndex + 1}</strong><button type="button" className="cy-op-button compact quiet cy-row-remove" disabled={busy || draft.entries.length <= 1} onClick={() => removeEntry(entryIndex)}>移除</button></div>
                  <div className="cy-op-form-grid">
                    <label>項目類型<input className="cy-op-input" value={entry.entryTypeCode} disabled={busy} onChange={(event) => patchEntry(entryIndex, { entryTypeCode: event.target.value })} placeholder="輸入項目類型" required /></label>
                    <label>平台
                      <select className="cy-op-input" value={entry.platformId ?? ""} disabled={busy} onChange={(event) => patchEntry(entryIndex, { platformId: Number(event.target.value) || null })}>
                        <option value="">未指定</option>
                        {(configuration?.platforms ?? []).map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
                      </select>
                    </label>
                    <label className="wide">工作內容<textarea className="cy-op-input" rows={3} value={entry.content} disabled={busy} onChange={(event) => patchEntry(entryIndex, { content: event.target.value })} /></label>
                  </div>
                  <div className="cy-worklog-categories">
                    <div className="cy-worklog-categories-head"><span>計分分類</span><button type="button" className="cy-op-button compact" disabled={busy} onClick={() => addCategory(entryIndex)}>＋ 加入分類</button></div>
                    {entry.categories.map((category, categoryIndex) => {
                      const config = category.workLogCategoryId == null ? null : categoryById.get(category.workLogCategoryId);
                      return <div className="cy-worklog-category" key={category.key}>
                        <select className="cy-op-input" value={category.workLogCategoryId ?? ""} disabled={busy} onChange={(event) => selectCategory(entryIndex, categoryIndex, Number(event.target.value) || null)}>
                          <option value="">請選擇</option>
                          {(configuration?.categories ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                        </select>
                        <input className="cy-op-input" value={category.quantity} inputMode="decimal" disabled={busy || config?.inputMode === "boolean"} onChange={(event) => patchCategory(entryIndex, categoryIndex, { quantity: event.target.value })} placeholder={config?.unitLabel ?? "數量"} />
                        <button type="button" className="cy-op-button compact quiet cy-row-remove" disabled={busy} onClick={() => patchEntry(entryIndex, { categories: entry.categories.filter((_, index) => index !== categoryIndex) })}>移除</button>
                      </div>;
                    })}
                  </div>
                </div>
              ))}
              </div>
            </section>

          </form>
          ) : selected ? <div>
            <div className="cy-record-header"><div><h2>{formatDate(selected.logDate)} 工作日誌</h2><p><span className="cy-mono">{selected.workLogRef}</span> · {selected.employee.displayName || selected.employee.employeeNo || `員工 #${selected.employeeId}`}</p></div>
              <div className="cy-record-actions">
                {selected.statusCode === "created" ? <>
                <button className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                <button className="cy-op-button primary" disabled={busy} aria-busy={(busy && pending === "submit") || undefined} onClick={() => track("submit", submit())}>送出審核</button>
                <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "deleteDraft") || undefined} onClick={() => track("deleteDraft", deleteDraft())}>刪除</button>
              </> : null}
              {selected.statusCode === "pending_review" ? <>
                <button className="cy-op-button" disabled={busy} onClick={() => withdraw()}>撤回審核</button>
                <button className="cy-op-button primary" disabled={busy} onClick={() => review()}>審核計分</button>
              </> : null}
              {selected.statusCode === "reviewed" ? <button className="cy-op-button danger" disabled={busy} onClick={() => cancelReview()}>取消審核</button> : null}
              </div></div>
            <ol className="cy-progress" aria-label="日誌進度">{progressSteps.map((step, index) => { const current = progressSteps.findIndex(item => item.code === selected.statusCode); return <li key={step.code} data-state={index < current ? "done" : index === current ? "current" : "todo"} aria-current={index === current ? "step" : undefined}>{step.label}</li>; })}</ol>
            <NextStep tone={workLogTone[selected.statusCode]}>{workLogNextStep[selected.statusCode]}</NextStep>
            <div className="cy-op-detail-grid">
              <div><span>日誌日期</span><strong>{formatDate(selected.logDate)}</strong></div>
              <div><span>期間</span><strong>{formatDate(selected.dateFrom)} ～ {formatDate(selected.dateTo)}</strong></div>
              <div><span>工作日數</span><strong>{selected.workDays}</strong></div>
              <div><span>類型</span><strong>{selected.typeCode}</strong></div>
              <div><span>總分</span><strong>{selected.finalScore ?? "—"}</strong></div>
              <div><span>平均日分</span><strong>{selected.averageDailyScore ?? "—"}</strong></div>
              <div className="wide"><span>審核備註</span><strong>{selected.reviewRemark ?? "—"}</strong></div>
            </div>
            <div className="cy-op-subsection">
              <h3>工作內容</h3>
              {selected.entries.map((entry: WorkLogEntry) => <div className="cy-worklog-entry" key={entry.id}>
                <div className="cy-op-read-row"><strong>{entry.entryTypeCode}</strong> · {platformLabel(entry.platformId)}</div>
                <p>{entry.content ?? "—"}</p>
                <div className="cy-op-chip-list">{entry.categories.map((category) => <span className="cy-op-chip" key={category.id}>{categoryLabel(category.workLogCategoryId)}：{category.quantity}</span>)}</div>
                {entry.reviewScore != null || entry.reviewRemark ? <div className="cy-op-read-row">審核：{entry.reviewScore ?? "未計分"}{entry.reviewRemark ? ` · ${entry.reviewRemark}` : ""}</div> : null}
              </div>)}
            </div>
          </div> : <MasterDetailEmpty title="尚未選擇工作日誌" hint="從左側清單選一筆，或按清單上方的「＋ 新增日誌」。" />}
        </section>
      </div>
    </div>
  );
}
