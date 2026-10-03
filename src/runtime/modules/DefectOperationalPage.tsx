import { FormEvent, useEffect, useMemo, useState } from "react";
import type { DefectModuleLookups } from "../../../shared/business-lookups";
import type {
  DefectDetail,
  DefectStatusCode,
  DefectSummary,
} from "../../../shared/defect";
import { ApiClientError } from "../../api/client";
import {
  createDefect,
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 409 || error.code.includes("REVISION_CONFLICT")) {
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
    customerId: lookups?.customers[0]?.id ?? null,
    itemId: lookups?.items.find((row) => row.isActive)?.id ?? lookups?.items[0]?.id ?? null,
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
  const [includeInvalid, setIncludeInvalid] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DefectDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      void searchDefects({
        q: query.trim() || undefined,
        statusCode: statusFilter ? statusFilter as DefectStatusCode : undefined,
        includeInvalid,
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
          setMessage(errorMessage(error));
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
        customerQuery: customerSearch,
        itemQuery: itemSearch,
        limit: 100,
      })
        .then((value) => {
          if (!cancelled) setLookups(value);
        })
        .catch((error) => {
          if (!cancelled) setMessage(errorMessage(error));
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
    customerSearch,
    itemSearch,
  ]);

  const customerOptions = useMemo(() => lookups?.customers ?? [], [lookups]);
  const itemOptions = useMemo(() => lookups?.items ?? [], [lookups]);
  const ownerOptions = useMemo(() => lookups?.owners ?? [], [lookups]);

  function selectDefect(id: number) {
    if (editing && !window.confirm("放棄尚未儲存的修改？")) return;
    setSelectedId(id);
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setCustomerSearch("");
    setItemSearch("");
    setMessage(null);
  }

  function startCreate() {
    if (editing && !window.confirm("放棄目前尚未儲存的修改？")) return;
    setSelectedId(null);
    setSelected(null);
    setCreating(true);
    setEditing(true);
    setDraft(newDraft(lookups));
    setCustomerSearch("");
    setItemSearch("");
    setMessage(null);
  }

  function startEdit() {
    if (!selected || selected.statusCode === "resolved" || selected.invalidatedAt) return;
    setCreating(false);
    setEditing(true);
    setDraft(draftFromDetail(selected));
    setCustomerSearch("");
    setItemSearch("");
    setMessage(null);
  }

  function cancelEdit() {
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setCustomerSearch("");
    setItemSearch("");
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      !draft?.customerId ||
      !draft.itemId ||
      !draft.ownerEmployeeId ||
      !draft.reportedDate ||
      !draft.defectDescription.trim() ||
      busy
    ) return;

    setBusy(true);
    setMessage(null);
    try {
      const profile = {
        reportedDate: draft.reportedDate,
        customerId: draft.customerId,
        itemId: draft.itemId,
        ownerEmployeeId: draft.ownerEmployeeId,
        defectDescription: draft.defectDescription.trim(),
        handling: draft.handling.trim() || null,
      };
      const saved = creating
        ? await createDefect(profile)
        : selected
          ? await updateDefect(selected.id, { ...profile, expectedRevision: selected.revision })
          : null;
      if (!saved) return;
      setSelected(saved);
      setSelectedId(saved.id);
      setEditing(false);
      setCreating(false);
      setDraft(null);
      setMessage(creating ? "瑕疵紀錄已新增。" : "瑕疵紀錄已儲存。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function startProcessing() {
    if (!selected || selected.statusCode !== "created" || selected.invalidatedAt || busy) return;
    await runAction(async () => startDefectProcessing(selected.id, { expectedRevision: selected.revision }), "已開始處理。");
  }

  async function resolve() {
    if (!selected || selected.statusCode !== "processing" || selected.invalidatedAt || busy) return;
    const note = window.prompt("請輸入處理結果／備註", selected.handling ?? "");
    if (note == null || !note.trim()) return;

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
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!selected || selected.statusCode !== "resolved" || selected.invalidatedAt || busy) return;
    const reason = window.prompt("重新開啟原因", "需要補充處理");
    if (reason == null) return;
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
    const reason = window.prompt("請輸入作廢原因", "整筆瑕疵資料建立錯誤");
    if (reason == null || !reason.trim()) return;
    if (!window.confirm("作廢後會保留紀錄與原工作狀態，不會硬刪。確定作廢？")) return;
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
    if (!window.confirm(`確定永久刪除尚未開始處理的瑕疵 #${selected.id}？此動作仍由伺服器檢查建立者／管理權限。`)) return;

    setBusy(true);
    setMessage(null);
    try {
      await deleteDefect(selected.id, { expectedRevision: selected.revision });
      setSelected(null);
      setSelectedId(null);
      setMessage("尚未開始處理的瑕疵紀錄已刪除。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
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
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  function ownerLabel(id: number, employeeNo: string | null): string {
    if (lookups?.actor.appMemberId === id) {
      return `${lookups.actor.displayName}（${employeeNo ?? lookups.actor.employeeNo ?? "目前使用者"}）`;
    }
    return employeeNo ?? `Employee #${id}`;
  }

  return (
    <div className="cy-defect-op">
      <div className="cy-op-page-header">
        <div>
          <h1>瑕疵</h1>
          <p>管理瑕疵紀錄、處理進度及作廢。</p>
        </div>
        <div className="cy-op-page-actions">
          <button className="cy-op-button primary" disabled={busy} onClick={startCreate}>新增瑕疵</button>
        </div>
      </div>

      {message ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-body">{message}</div></div> : null}

      <div className="cy-defect-workspace">
        <section className="cy-op-panel cy-defect-list-pane">
          <div className="cy-defect-search">
            <input className="cy-op-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋客戶、商品、內容" />
            <div className="cy-defect-filters">
              <select className="cy-op-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">全部狀態</option>
                <option value="created">已建檔</option>
                <option value="processing">處理中</option>
                <option value="resolved">已處理</option>
              </select>
              <label className="cy-defect-check"><input type="checkbox" checked={includeInvalid} onChange={(e) => setIncludeInvalid(e.target.checked)} /> 顯示作廢</label>
            </div>
          </div>
          <div className="cy-op-list">
            {rows.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => selectDefect(row.id)}><strong>瑕疵 #{row.id} · {row.customerNameSnapshot}</strong><span>{row.itemNoSnapshot} · {row.itemNameSnapshot}</span><small>{row.invalidatedAt ? `已作廢 · ${statusText[row.statusCode]}` : statusText[row.statusCode]}</small></button>)}
            {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的瑕疵紀錄。</div> : null}
            {loadingList ? <div className="cy-op-empty">讀取瑕疵資料中…</div> : null}
          </div>
        </section>

        <section className="cy-op-panel cy-defect-detail-pane">
          {editing && draft ? (
            <form className="cy-op-form" onSubmit={(event) => void save(event)}>
              <div className="cy-op-panel-header">
                <div><h2>{creating ? "新增瑕疵" : `修改瑕疵 #${selected?.id ?? ""}`}</h2><p>已建檔與處理中可一般修改；已完成需先重新開啟。</p></div>
                <div className="cy-defect-inline-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button><button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button></div>
              </div>

              <div className="cy-defect-form-body">
                <div className="cy-op-form-grid">
                  <label>回報日期<input className="cy-op-input" type="date" value={draft.reportedDate} disabled={busy} onChange={(e) => setDraft({ ...draft, reportedDate: e.target.value })} /></label>

                  <label>客戶搜尋<input className="cy-op-input" value={customerSearch} disabled={busy} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="客戶編號／名稱" /></label>
                  <label>客戶<select className="cy-op-input" value={draft.customerId ?? ""} disabled={busy} onChange={(e) => setDraft({ ...draft, customerId: Number(e.target.value) || null })}><option value="">請選擇</option>{customerOptions.map((row) => <option key={row.id} value={row.id}>{row.customerNo ? `${row.customerNo} · ` : ""}{row.shortName}</option>)}</select></label>

                  <label>商品搜尋<input className="cy-op-input" value={itemSearch} disabled={busy} onChange={(e) => setItemSearch(e.target.value)} placeholder="品號／品名／規格" /></label>
                  <label>商品<select className="cy-op-input" value={draft.itemId ?? ""} disabled={busy} onChange={(e) => setDraft({ ...draft, itemId: Number(e.target.value) || null })}><option value="">請選擇</option>{itemOptions.map((row) => <option key={row.id} value={row.id}>{row.itemNo} · {row.name}{row.isActive ? "" : "（已停用）"}</option>)}</select></label>

                  <label>負責人<select className="cy-op-input" value={draft.ownerEmployeeId ?? ""} disabled={busy} onChange={(e) => setDraft({ ...draft, ownerEmployeeId: Number(e.target.value) || null })}><option value="">請選擇</option>{ownerOptions.map((row) => <option key={row.id} value={row.id}>{ownerLabel(row.id, row.employeeNo)}{row.isActive ? "" : "（已停用）"}</option>)}</select></label>

                  <label className="wide">瑕疵內容<textarea className="cy-op-input" rows={5} value={draft.defectDescription} disabled={busy} onChange={(e) => setDraft({ ...draft, defectDescription: e.target.value })} required /></label>
                  {!creating && selected?.statusCode === "processing" ? <label className="wide">處理中備註<textarea className="cy-op-input" rows={4} value={draft.handling} disabled={busy} onChange={(e) => setDraft({ ...draft, handling: e.target.value })} /></label> : null}
                </div>
              </div>

              <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button><button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button></div>
            </form>
          ) : selected ? (
            <div>
              <div className="cy-op-panel-header cy-defect-detail-header">
                <div><h2>瑕疵 #{selected.id}</h2><p>{selected.customerNameSnapshot} · rev.{selected.revision}</p></div>
                <div className="cy-defect-status-group"><span className={`cy-defect-status ${selected.statusCode}`}>{statusText[selected.statusCode]}</span>{selected.invalidatedAt ? <span className="cy-defect-status invalid">已作廢</span> : null}</div>
              </div>

              <div className="cy-defect-body">
                {loadingDetail ? <p>更新瑕疵資料中…</p> : null}
                <div className="cy-op-detail-grid">
                  <div><span>回報日期</span><strong>{selected.reportedDate}</strong></div>
                  <div><span>負責人</span><strong>{ownerLabel(selected.ownerEmployee.id, selected.ownerEmployee.employeeNo)}</strong></div>
                  <div><span>客戶</span><strong>{selected.customerNoSnapshot ? `${selected.customerNoSnapshot} · ` : ""}{selected.customerNameSnapshot}</strong></div>
                  <div><span>商品</span><strong>{selected.itemNoSnapshot} · {selected.itemNameSnapshot}</strong></div>
                  <div className="wide"><span>瑕疵內容</span><strong>{selected.defectDescription}</strong></div>
                  <div className="wide"><span>處理結果</span><strong>{selected.handling ?? "—"}</strong></div>
                  {selected.invalidatedAt ? <div className="wide cy-defect-invalid-note"><span>作廢資訊</span><strong>{new Date(selected.invalidatedAt).toLocaleString()} · 原工作狀態 {statusText[selected.statusCode]}</strong></div> : null}
                </div>

                <div className="cy-defect-action-bar">
                  {!selected.invalidatedAt && selected.statusCode === "created" ? <>
                    <button className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                    <button className="cy-op-button primary" disabled={busy} onClick={() => void startProcessing()}>開始處理</button>
                    <button className="cy-op-button danger" disabled={busy} onClick={() => void deleteCreated()}>刪除</button>
                  </> : null}
                  {!selected.invalidatedAt && selected.statusCode === "processing" ? <>
                    <button className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                    <button className="cy-op-button primary" disabled={busy} onClick={() => void resolve()}>完成處理</button>
                    <button className="cy-op-button danger" disabled={busy} onClick={() => void invalidate()}>作廢</button>
                  </> : null}
                  {!selected.invalidatedAt && selected.statusCode === "resolved" ? <>
                    <button className="cy-op-button" disabled={busy} onClick={() => void reopen()}>重新開啟</button>
                    <button className="cy-op-button danger" disabled={busy} onClick={() => void invalidate()}>作廢</button>
                  </> : null}
                </div>
              </div>
            </div>
          ) : loadingDetail ? <div className="cy-op-empty">讀取瑕疵資料中…</div> : <div className="cy-op-empty">請選擇瑕疵紀錄，或新增一筆。</div>}
        </section>
      </div>
    </div>
  );
}
