import { DefectForm } from "./defect/DefectForm";
import { formatItem } from "../../ui/foundation/format";
import { StatusFilter } from "../../ui/data/StatusFilter";
import { defectNextStep, defectTone } from "./status-flow";
import { NextStep } from "../../ui/feedback/NextStep";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { usePendingAction } from "../../ui/feedback/usePendingAction";
import { Loading } from "../../ui/feedback/Loading";
import { LoadMoreRow, useLoadMore } from "../../ui/data/useLoadMore";
import { formatDate, formatDateTime } from "../../ui/foundation/format";
import { taipeiToday } from "../../../shared/erp-query-history";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { useFormPrompt } from "../../ui/overlays/useFormPrompt";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { useEffect, useMemo, useState } from "react";
import type { DefectModuleLookups } from "../../../shared/business-lookups";
import type {
  DefectDetail,
  DefectStatusCode,
  DefectSummary,
} from "../../../shared/defect";
import { ApiClientError } from "../../api/client";
import {
  deleteDefect,
  invalidateDefect,
  loadDefectDetail,
  loadDefectLookups,
  reopenDefect,
  resolveDefect,
  searchDefects,
  startDefectProcessing,
  updateDefect,
} from "../api/defect-runtime-client";
import "./defect-operational.css";

interface DefectDraft {
  reportedDate: string;
  customerId: number | null;
  itemId: number | null;
  ownerEmployeeId: number | null;
  defectDescription: string;
  handling: string;
}

const statusText: Record<DefectStatusCode, string> = {
  created: "已建檔",
  processing: "處理中",
  resolved: "已處理",
};

/** Business dates follow Taiwan time; toISOString() would give yesterday before 08:00. */
function today(): string {
  return taipeiToday();
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code.includes("REVISION_CONFLICT")) {
      return "資料已被其他人修改，請重新載入後再操作。";
    }
    if (error.status === 403) return "你目前沒有執行此瑕疵操作的權限。";
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") return "登入狀態已失效，請重新登入。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "身分服務暫時無法使用，請稍後再試。";
    const field = error.fields ? Object.values(error.fields)[0] : null;
    return field || error.message || error.code;
  }
  return "目前無法完成瑕疵資料操作。";
}

function newDraft(lookups: DefectModuleLookups | null): DefectDraft {
  return {
    reportedDate: today(),
    customerId: null,
    itemId: null,
    ownerEmployeeId: lookups?.actor.appMemberId ?? lookups?.owners.find((row) => row.isActive)?.id ?? null,
    defectDescription: "",
    handling: "",
  };
}

function draftFromDetail(detail: DefectDetail): DefectDraft {
  return {
    reportedDate: detail.reportedDate,
    customerId: detail.customerId,
    itemId: detail.itemId,
    ownerEmployeeId: detail.ownerEmployee.id,
    defectDescription: detail.defectDescription,
    handling: detail.handling ?? "",
  };
}

function detailProfile(detail: DefectDetail, handling = detail.handling): {
  reportedDate: string;
  customerId: number;
  itemId: number;
  ownerEmployeeId: number;
  defectDescription: string;
  handling: string | null;
} {
  return {
    reportedDate: detail.reportedDate,
    customerId: detail.customerId,
    itemId: detail.itemId,
    ownerEmployeeId: detail.ownerEmployee.id,
    defectDescription: detail.defectDescription,
    handling,
  };
}

export function DefectOperationalPage() {
  const [rows, setRows] = useState<readonly DefectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<DefectDetail | null>(null);
  const [lookups, setLookups] = useState<DefectModuleLookups | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [statusCounts, setStatusCounts] = useState<Partial<Record<string, number>> | null>(null);
  const [includeInvalid, setIncludeInvalid] = useState(false);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DefectDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const { pending, track } = usePendingAction();
  const unsavedGuard = useUnsavedChangesGuard({ active: editing, blocked: busy, message: "目前有尚未儲存的瑕疵修改，確定放棄？" });
  const pane = useMasterDetailPane();
  const { confirm, confirmationDialog } = useConfirmation();
  const { ask, promptDialog } = useFormPrompt();
  const canLeave = async () => (await unsavedGuard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", cancelLabel: "繼續編輯", confirmTone: "danger",
  }))).allowed;
  const [loadingList, setLoadingList] = useState(true);
  // The page appears once its first list page is in; until then only the shared spinner shows.
  const [listReady, setListReady] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const paging = useLoadMore(searchDefects, setRows, (error) => reportError(errorMessage(error)));
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      const listQuery = {
        q: query.trim() || undefined,
        statusCode: statusFilter ? statusFilter as DefectStatusCode : undefined,
        includeInvalid,
        limit: 100,
      };
      void searchDefects(listQuery)
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
  }, [query, statusFilter, includeInvalid, refreshEpoch, editing, creating]);

  useEffect(() => {
    if (selectedId == null || creating) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    void loadDefectDetail(selectedId)
      .then((detail) => {
        if (!cancelled) setSelected(detail);
      })
      .catch((error) => {
        if (!cancelled) {
          setSelected(null);
          reportError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, creating, refreshEpoch]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadDefectLookups({
        customerId: selected?.customerId ?? draft?.customerId ?? null,
        itemId: selected?.itemId ?? draft?.itemId ?? null,
        ownerId: selected?.ownerEmployee.id ?? draft?.ownerEmployeeId ?? null,
        limit: 100,
      })
        .then((value) => {
          if (!cancelled) setLookups(value);
        })
        .catch((error) => {
          if (!cancelled) reportError(errorMessage(error));
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    selected?.customerId,
    selected?.itemId,
    selected?.ownerEmployee.id,
    draft?.customerId,
    draft?.itemId,
    draft?.ownerEmployeeId,
  ]);


  async function selectDefect(id: number) {
    if (busy || !(await canLeave())) return;
    pane.open();
    setSelectedId(id);
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setMessage(null);
  }

  async function startCreate() {
    if (busy || !(await canLeave())) return;
    pane.open();
    setSelectedId(null);
    setSelected(null);
    setCreating(true);
    setEditing(true);
    setDraft(newDraft(lookups));
    setMessage(null);
  }

  function startEdit() {
    if (!selected || selected.statusCode === "resolved" || selected.invalidatedAt) return;
    setCreating(false);
    setEditing(true);
    setDraft(draftFromDetail(selected));
    setMessage(null);
  }

  async function cancelEdit() {
    if (busy || !(await canLeave())) return;
    if (creating) pane.close();
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
  }

  async function startProcessing() {
    if (!selected || selected.statusCode !== "created" || selected.invalidatedAt || busy) return;
    await runAction(async () => startDefectProcessing(selected.id, { expectedRevision: selected.revision }), "已開始處理。");
  }

  async function resolve() {
    if (!selected || selected.statusCode !== "processing" || selected.invalidatedAt || busy) return;
    const answer = await ask({ title: "完成處理", description: "填寫處理結果後，瑕疵會標記為已處理。",
      fields: [{ name: "note", label: "處理結果", defaultValue: selected.handling ?? "", required: true, multiline: true }], confirmLabel: "完成處理" });
    const note = answer?.note ?? "";
    if (!note) return;

    setBusy(true);
    setMessage(null);
    try {
      const updated = await updateDefect(selected.id, {
        ...detailProfile(selected, note.trim()),
        expectedRevision: selected.revision,
      });
      const resolved = await resolveDefect(updated.id, { expectedRevision: updated.revision });
      setSelected(resolved);
      setMessage("瑕疵已完成處理。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!selected || selected.statusCode !== "resolved" || selected.invalidatedAt || busy) return;
    const answer = await ask({ title: "重新開啟瑕疵", fields: [{ name: "reason", label: "重新開啟原因", defaultValue: "需要補充處理" }], confirmLabel: "重新開啟" });
    if (!answer) return;
    const reason = answer.reason;
    await runAction(
      async () => reopenDefect(selected.id, {
        expectedRevision: selected.revision,
        reason: reason.trim() || null,
      }),
      "瑕疵已重新開啟。",
    );
  }

  async function invalidate() {
    if (!selected || selected.statusCode === "created" || selected.invalidatedAt || busy) return;
    const answer = await ask({ title: "作廢瑕疵紀錄", description: "作廢後紀錄與原處理狀態都會保留，不會刪除。",
      fields: [{ name: "reason", label: "作廢原因", defaultValue: "整筆瑕疵資料建立錯誤", required: true }], confirmLabel: "作廢", confirmTone: "danger" });
    const reason = answer?.reason ?? "";
    if (!reason) return;
    await runAction(
      async () => invalidateDefect(selected.id, {
        expectedRevision: selected.revision,
        reason: reason.trim(),
      }),
      "瑕疵紀錄已作廢並保留歷史。",
    );
  }

  async function deleteCreated() {
    if (!selected || selected.statusCode !== "created" || selected.invalidatedAt || busy) return;
    if (!(await confirm({ title: "刪除瑕疵紀錄", description: `瑕疵 #${selected.id} 尚未開始處理，刪除後無法復原。`, confirmLabel: "刪除", confirmTone: "danger" }))) return;

    setBusy(true);
    setMessage(null);
    try {
      await deleteDefect(selected.id, { expectedRevision: selected.revision });
      setSelected(null);
      setSelectedId(null);
      pane.close();
      setMessage("尚未開始處理的瑕疵紀錄已刪除。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: () => Promise<DefectDetail>, successMessage: string) {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await action();
      setSelected(saved);
      setMessage(successMessage);
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!listReady) return <Loading />;

  return (
    <div className="cy-defect-op">
      {confirmationDialog}
      {promptDialog}
      
      <FeedbackBanner message={message} tone={messageTone} />

      <div className="cy-md cy-defect-workspace" data-pane={pane.pane}>
        <section className="cy-op-panel cy-md-list" aria-label="瑕疵清單">
          <div className="cy-md-toolbar">
            <div className="cy-md-toolbar-lead">
              <button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增瑕疵</button>
              <input className="cy-op-input" type="search" aria-label="搜尋瑕疵" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋客戶、商品、內容" />
            </div>
            <div className="cy-md-toolbar-row cy-defect-filters">
              <StatusFilter label="瑕疵狀態" value={statusFilter} onChange={setStatusFilter} counts={statusCounts}
                options={(Object.keys(statusText) as (keyof typeof statusText)[]).map((code) => ({ code, label: statusText[code], tone: defectTone[code] }))} />
              <label className="cy-defect-check"><input type="checkbox" checked={includeInvalid} onChange={(e) => setIncludeInvalid(e.target.checked)} /> 顯示作廢</label>
            </div>
          </div>
          <div className="cy-op-list">
            {rows.map((row) => <button key={row.id} type="button" className={`cy-op-list-row cy-status-row ${selectedId === row.id ? "active" : ""}`} aria-current={selectedId === row.id ? "true" : undefined} onClick={() => void selectDefect(row.id)}><strong>{row.customerNameSnapshot}</strong><span>#{row.id} · {row.itemNoSnapshot} {row.itemNameSnapshot}</span><StatusChip tone={defectTone[row.invalidatedAt ? "voided" : row.statusCode]}>{row.invalidatedAt ? "已作廢" : statusText[row.statusCode]}</StatusChip></button>)}
            {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的瑕疵紀錄。</div> : null}
            <LoadMoreRow hasMore={paging.hasMore} loading={paging.loading} onMore={() => void paging.more()} />
            {loadingList ? <Loading /> : null}
          </div>
        </section>

        <section className="cy-op-panel cy-md-detail">
          <MasterDetailBack label="瑕疵清單" disabled={busy} onBack={async () => { if (editing) { if (!(await canLeave())) return; setEditing(false); setCreating(false); setDraft(null); } pane.close(); }} />
          {editing && draft ? (
            <DefectForm mode={creating ? "create" : "edit"} initial={creating ? null : selected}
              onCancel={() => void cancelEdit()} onSaved={detail => {
                setSelected(detail);
                setSelectedId(detail.id);
                setEditing(false);
                setCreating(false);
                setDraft(null);
                setMessage(creating ? "瑕疵紀錄已新增。" : "瑕疵紀錄已儲存。");
                setRefreshEpoch(value => value + 1);
              }} />     </form>
          ) : loadingDetail ? <Loading /> : selected ? (
            <div>
              <div className="cy-record-header">
                <div><h2>{selected.customerNameSnapshot}</h2><p>瑕疵 #{selected.id} · 回報 {formatDate(selected.reportedDate)}</p></div>
                  <div className="cy-record-actions">
                    <StatusChip tone={defectTone[selected.invalidatedAt ? "voided" : selected.statusCode]}>{selected.invalidatedAt ? "已作廢" : statusText[selected.statusCode]}</StatusChip>
                    {!selected.invalidatedAt && selected.statusCode === "created" ? <>
                      <button className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                      <button className="cy-op-button primary" disabled={busy} aria-busy={(busy && pending === "startProcessing") || undefined} onClick={() => track("startProcessing", startProcessing())}>開始處理</button>
                      <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "deleteCreated") || undefined} onClick={() => track("deleteCreated", deleteCreated())}>刪除</button>
                    </> : null}
                    {!selected.invalidatedAt && selected.statusCode === "processing" ? <>
                      <button className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                      <button className="cy-op-button primary" disabled={busy} aria-busy={(busy && pending === "resolve") || undefined} onClick={() => track("resolve", resolve())}>完成處理</button>
                      <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "invalidate") || undefined} onClick={() => track("invalidate", invalidate())}>作廢</button>
                    </> : null}
                    {!selected.invalidatedAt && selected.statusCode === "resolved" ? <>
                      <button className="cy-op-button" disabled={busy} aria-busy={(busy && pending === "reopen") || undefined} onClick={() => track("reopen", reopen())}>重新開啟</button>
                      <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "invalidate") || undefined} onClick={() => track("invalidate", invalidate())}>作廢</button>
                    </> : null}
                </div>
              </div>

              <div className="cy-defect-body">
                <NextStep tone={defectTone[selected.invalidatedAt ? "voided" : selected.statusCode]}>{defectNextStep[selected.invalidatedAt ? "voided" : selected.statusCode]}</NextStep>
                <div className="cy-op-detail-grid">
                  <div><span>回報日期</span><strong>{formatDate(selected.reportedDate)}</strong></div>
                  <div><span>負責人</span><strong>{selected.ownerEmployee.displayName || ownerLabel(selected.ownerEmployee.id, selected.ownerEmployee.employeeNo)}</strong></div>
                  <div><span>客戶</span><strong>{selected.customerNoSnapshot ? `${selected.customerNoSnapshot} · ` : ""}{selected.customerNameSnapshot}</strong></div>
                  <div><span>商品</span><strong>{formatItem(selected.itemNoSnapshot, selected.itemNameSnapshot)}</strong></div>
                  <div className="wide"><span>瑕疵內容</span><strong>{selected.defectDescription}</strong></div>
                  <div className="wide"><span>處理結果</span><strong>{selected.handling ?? "—"}</strong></div>
                  {selected.invalidatedAt ? <div className="wide cy-defect-invalid-note"><span>作廢資訊</span><strong>{formatDateTime(selected.invalidatedAt)} · 原工作狀態 {statusText[selected.statusCode]}</strong></div> : null}
                </div>

              </div>
            </div>
          ) : <MasterDetailEmpty title="尚未選擇瑕疵紀錄" hint="從左側清單選一筆，或按清單上方的「＋ 新增瑕疵」。" />}
        </section>
      </div>
    </div>
  );
}
