import { FormEvent, useEffect, useMemo, useState } from "react";
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
    if (error.status === 409 || error.code.includes("REVISION_CONFLICT")) {
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
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkLogDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshEpoch, setRefreshEpoch] = useState(0);

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
        if (!cancelled) setMessage(errorMessage(error));
      });
    return () => { cancelled = true; };
  }, [refreshEpoch]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      void searchWorkLogs({
        q: query.trim() || undefined,
        statusCode: statusFilter ? statusFilter as WorkLogStatusCode : undefined,
        limit: 100,
      })
        .then((result) => {
          if (cancelled) return;
          setRows(result.items);
          if (!editing && !creating) {
            setSelectedId((current) => (
              current != null && result.items.some((row) => row.id === current)
                ? current
                : result.items[0]?.id ?? null
            ));
          }
        })
        .catch((error) => {
          if (!cancelled) setMessage(errorMessage(error));
        })
        .finally(() => {
          if (!cancelled) setLoadingList(false);
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
          setMessage(errorMessage(error));
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

  function startCreate() {
    if (editing && !window.confirm("放棄目前尚未儲存的修改？")) return;
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

  function cancelEdit() {
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
      setMessage("沒有其他可加入的工作分類。");
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
    if (!draft.typeCode.trim() || draft.entries.length === 0) return;
    if (draft.entries.some((entry) => !entry.entryTypeCode.trim() || (!entry.content.trim() && entry.categories.length === 0))) return;

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
      setMessage(errorMessage(error));
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
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
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

  async function withdraw() {
    if (!selected) return;
    const reason = window.prompt("撤回原因（可留空）", "");
    if (reason == null) return;
    await runAction(
      () => withdrawWorkLog(selected.id, {
        expectedRevision: selected.revision,
        reason: reason.trim() || null,
      }),
      "工作日誌已撤回，可繼續修改。",
    );
  }

  async function review() {
    if (!selected || selected.statusCode !== "pending_review") return;
    const workDays = window.prompt("確認／更正工作日數", selected.workDays);
    if (workDays == null || !workDays.trim()) return;
    const overall = window.prompt("整體審核備註（可留空）", selected.reviewRemark ?? "");
    if (overall == null) return;

    const entries: { entryId: number; reviewRemark: string | null; reviewScore: string | null }[] = [];
    for (const entry of selected.entries) {
      const label = entry.content?.slice(0, 40) || `Entry #${entry.id}`;
      const score = window.prompt(`「${label}」審核分數；留空代表不計分`, entry.reviewScore ?? "");
      if (score == null) return;
      const remark = window.prompt(`「${label}」審核備註（可留空）`, entry.reviewRemark ?? "");
      if (remark == null) return;
      entries.push({
        entryId: entry.id,
        reviewScore: score.trim() || null,
        reviewRemark: remark.trim() || null,
      });
    }

    await runAction(
      () => reviewWorkLog(selected.id, {
        expectedRevision: selected.revision,
        workDays: workDays.trim(),
        reviewRemark: overall.trim() || null,
        entries,
      }),
      "工作日誌審核完成。",
    );
  }

  async function cancelReview() {
    if (!selected || selected.statusCode !== "reviewed") return;
    const reason = window.prompt("取消審核原因（可留空）", "");
    if (reason == null) return;
    await runAction(
      () => cancelWorkLogReview(selected.id, {
        expectedRevision: selected.revision,
        reason: reason.trim() || null,
      }),
      "審核已取消，工作日誌回到待審核。",
    );
  }

  async function deleteDraft() {
    if (!selected || selected.statusCode !== "created" || busy) return;
    if (!window.confirm(`確定刪除 ${selected.workLogRef}？伺服器會依目前身分重新判斷 owner / admin 權限。`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteWorkLogCreated(selected.id, selected.revision);
      setSelected(null);
      setSelectedId(null);
      setMessage("工作日誌草稿已刪除。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
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

  return (
    <div className="cy-worklog-op">
      <div className="cy-op-page-header">
        <div>
          <h1>工作日誌</h1>
          <p>建立、送審、撤回、審核、取消審核與統計全部使用 CY Web Worker / D1；身分與跨人員權限由伺服器判斷。</p>
        </div>
        <div className="cy-op-page-actions">
          <button className="cy-op-button primary" disabled={busy} onClick={startCreate}>新增日誌</button>
        </div>
      </div>

      {message ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-body">{message}</div></div> : null}

      <div className="cy-op-grid-two">
        <section className="cy-op-panel">
          <h2>已審核統計</h2>
          <div className="cy-op-detail-grid">
            <div><span>筆數</span><strong>{statistics?.reviewedCount ?? "—"}</strong></div>
            <div><span>工作日數</span><strong>{statistics?.totalWorkDays ?? "—"}</strong></div>
            <div><span>總分</span><strong>{statistics?.totalFinalScore ?? "—"}</strong></div>
            <div><span>加權平均日分</span><strong>{statistics?.weightedAverageDailyScore ?? "—"}</strong></div>
          </div>
        </section>
        <section className="cy-op-panel">
          <h2>目前評分設定</h2>
          <div className="cy-op-detail-grid">
            <div><span>目標平均</span><strong>{configuration?.scoringConfig?.targetAverageDailyScore ?? "—"}</strong></div>
            <div><span>最低平均</span><strong>{configuration?.scoringConfig?.minimumAverageDailyScore ?? "—"}</strong></div>
          </div>
          <div className="cy-op-chip-list">
            {(configuration?.scoringRows ?? []).map((row) => (
              <span className="cy-op-chip" key={row.id}>
                {row.workLogCategoryId ? categoryLabel(row.workLogCategoryId) : row.customName ?? "自訂"}：{row.scoreValue ?? "—"}
              </span>
            ))}
          </div>
        </section>
      </div>

      {editing && draft ? (
        <section className="cy-op-panel cy-op-form-card">
          <form onSubmit={(event) => void save(event)}>
            <div className="cy-op-panel-header">
              <div><h2>{creating ? "新增工作日誌" : `修改 ${selected?.workLogRef ?? "工作日誌"}`}</h2><p>類型代碼是通用資料欄位；分類／平台名稱由 D1 configuration 提供。</p></div>
              <button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button>
            </div>
            <div className="cy-op-form-grid">
              <label>日誌日期<input className="cy-op-input" type="date" value={draft.logDate} disabled={busy} onChange={(event) => setDraft({ ...draft, logDate: event.target.value })} /></label>
              <label>期間起<input className="cy-op-input" type="date" value={draft.dateFrom} disabled={busy} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} /></label>
              <label>期間迄<input className="cy-op-input" type="date" value={draft.dateTo} disabled={busy} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} /></label>
              <label>工作日數<input className="cy-op-input" value={draft.workDays} inputMode="decimal" disabled={busy} onChange={(event) => setDraft({ ...draft, workDays: event.target.value })} required /></label>
              <label>日誌類型代碼<input className="cy-op-input" value={draft.typeCode} disabled={busy} onChange={(event) => setDraft({ ...draft, typeCode: event.target.value })} placeholder="通用代碼" required /></label>
            </div>

            <div className="cy-op-subsection">
              <div className="cy-op-panel-header"><div><h3>工作內容</h3><p>每筆可帶平台與多個 configured category。</p></div><button type="button" className="cy-op-button" disabled={busy} onClick={addEntry}>增加工作項目</button></div>
              {draft.entries.map((entry, entryIndex) => (
                <div className="cy-op-panel" key={entry.key}>
                  <div className="cy-op-form-grid">
                    <label>項目類型代碼<input className="cy-op-input" value={entry.entryTypeCode} disabled={busy} onChange={(event) => patchEntry(entryIndex, { entryTypeCode: event.target.value })} placeholder="通用代碼" required /></label>
                    <label>平台
                      <select className="cy-op-input" value={entry.platformId ?? ""} disabled={busy} onChange={(event) => patchEntry(entryIndex, { platformId: Number(event.target.value) || null })}>
                        <option value="">未指定</option>
                        {(configuration?.platforms ?? []).map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
                      </select>
                    </label>
                    <label className="wide">工作內容<textarea className="cy-op-input" rows={3} value={entry.content} disabled={busy} onChange={(event) => patchEntry(entryIndex, { content: event.target.value })} /></label>
                  </div>
                  <div className="cy-op-subsection">
                    <div className="cy-op-panel-header"><h4>分類</h4><button type="button" className="cy-op-button" disabled={busy} onClick={() => addCategory(entryIndex)}>加入分類</button></div>
                    {entry.categories.map((category, categoryIndex) => {
                      const config = category.workLogCategoryId == null ? null : categoryById.get(category.workLogCategoryId);
                      return <div className="cy-op-inline-row" key={category.key}>
                        <select className="cy-op-input" value={category.workLogCategoryId ?? ""} disabled={busy} onChange={(event) => selectCategory(entryIndex, categoryIndex, Number(event.target.value) || null)}>
                          <option value="">請選擇</option>
                          {(configuration?.categories ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                        </select>
                        <input className="cy-op-input" value={category.quantity} inputMode="decimal" disabled={busy || config?.inputMode === "boolean"} onChange={(event) => patchCategory(entryIndex, categoryIndex, { quantity: event.target.value })} placeholder={config?.unitLabel ?? "數量"} />
                        <button type="button" className="cy-op-button danger" disabled={busy} onClick={() => patchEntry(entryIndex, { categories: entry.categories.filter((_, index) => index !== categoryIndex) })}>移除分類</button>
                      </div>;
                    })}
                  </div>
                  <button type="button" className="cy-op-button danger" disabled={busy || draft.entries.length <= 1} onClick={() => removeEntry(entryIndex)}>移除工作項目</button>
                </div>
              ))}
            </div>

            <div className="cy-op-form-footer">
              <button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button>
              <button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="cy-op-split">
        <section className="cy-op-panel cy-op-list-panel">
          <input className="cy-op-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋日誌編號、類型、內容" />
          <select className="cy-op-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">全部狀態</option>
            {Object.entries(statusText).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <div className="cy-op-list">
            {rows.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => { if (!editing || window.confirm("放棄尚未儲存的修改？")) { setEditing(false); setCreating(false); setDraft(null); setSelectedId(row.id); } }}><strong>{row.workLogRef}</strong><span>{row.logDate} · {row.workDays} 日</span><small>{statusText[row.statusCode]} · Employee #{row.employeeId}</small></button>)}
            {loadingList ? <div className="cy-op-empty">讀取工作日誌中…</div> : null}
            {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的工作日誌。</div> : null}
          </div>
        </section>

        <section className="cy-op-panel">
          {selected ? <div>
            <div className="cy-op-panel-header"><div><h2>{selected.workLogRef}</h2><p>Employee #{selected.employeeId} · rev.{selected.revision}</p></div><span className="cy-op-badge">{statusText[selected.statusCode]}</span></div>
            <div className="cy-op-detail-grid">
              <div><span>日誌日期</span><strong>{selected.logDate}</strong></div>
              <div><span>期間</span><strong>{selected.dateFrom} ～ {selected.dateTo}</strong></div>
              <div><span>工作日數</span><strong>{selected.workDays}</strong></div>
              <div><span>類型</span><strong>{selected.typeCode}</strong></div>
              <div><span>總分</span><strong>{selected.finalScore ?? "—"}</strong></div>
              <div><span>平均日分</span><strong>{selected.averageDailyScore ?? "—"}</strong></div>
              <div className="wide"><span>審核備註</span><strong>{selected.reviewRemark ?? "—"}</strong></div>
            </div>
            <div className="cy-op-subsection">
              <h3>工作內容</h3>
              {selected.entries.map((entry: WorkLogEntry) => <div className="cy-op-panel" key={entry.id}>
                <div className="cy-op-read-row"><strong>{entry.entryTypeCode}</strong> · {platformLabel(entry.platformId)}</div>
                <p>{entry.content ?? "—"}</p>
                <div className="cy-op-chip-list">{entry.categories.map((category) => <span className="cy-op-chip" key={category.id}>{categoryLabel(category.workLogCategoryId)}：{category.quantity}</span>)}</div>
                {entry.reviewScore != null || entry.reviewRemark ? <div className="cy-op-read-row">審核：{entry.reviewScore ?? "未計分"}{entry.reviewRemark ? ` · ${entry.reviewRemark}` : ""}</div> : null}
              </div>)}
            </div>
            <div className="cy-op-action-bar">
              {selected.statusCode === "created" ? <>
                <button className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                <button className="cy-op-button primary" disabled={busy} onClick={() => void submit()}>送出審核</button>
                <button className="cy-op-button danger" disabled={busy} onClick={() => void deleteDraft()}>刪除</button>
              </> : null}
              {selected.statusCode === "pending_review" ? <>
                <button className="cy-op-button" disabled={busy} onClick={() => void withdraw()}>撤回審核</button>
                <button className="cy-op-button primary" disabled={busy} onClick={() => void review()}>審核計分</button>
              </> : null}
              {selected.statusCode === "reviewed" ? <button className="cy-op-button danger" disabled={busy} onClick={() => void cancelReview()}>取消審核</button> : null}
            </div>
          </div> : <div className="cy-op-empty">請選擇工作日誌，或新增一筆。</div>}
        </section>
      </div>
    </div>
  );
}
