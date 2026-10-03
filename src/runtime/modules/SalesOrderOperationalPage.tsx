import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { SalesWorkOrderModuleLookups, SalesWorkOrderItemOption } from "../../../shared/business-lookups";
import type {
  InvoiceTypeCode,
  ReceiptOptionCode,
  SalesWorkOrderDetail,
  SalesWorkOrderStatusCode,
  SalesWorkOrderSummary,
} from "../../../shared/sales-work-order";
import { ApiClientError } from "../../api/client";
import {
  createSalesOrder,
  deleteSalesOrderDraft,
  fillOrCorrectSalesOrderErp,
  loadSalesOrderDetail,
  loadSalesOrderLookups,
  markSalesOrderPicked,
  markSalesOrderShipped,
  markSalesOrderWaitingStock,
  reverseSalesOrderShipment,
  searchSalesOrders,
  updateSalesOrder,
  voidSalesOrder,
} from "../api/sales-order-runtime-client";

interface DraftLine {
  key: string;
  itemId: number | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  note: string;
}

interface SalesOrderDraft {
  customerId: number | null;
  customerName: string;
  orderDate: string;
  operatorEmployeeId: number | null;
  note: string;
  hidePriceOnSalesDocument: boolean;
  invoiceTypeCode: InvoiceTypeCode | null;
  receiptOptionCode: ReceiptOptionCode | null;
  lines: DraftLine[];
}

const statusText: Record<SalesWorkOrderStatusCode, string> = {
  created: "待 ERP",
  issued: "已開單",
  waiting_stock: "待貨",
  picked: "已撿貨",
  shipped: "已出貨",
  voided: "已作廢",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function lineKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function lineFromItem(item: SalesWorkOrderItemOption | undefined): DraftLine {
  return {
    key: lineKey(),
    itemId: item?.id ?? null,
    quantity: "1",
    unit: item?.baseUnit ?? "",
    unitPrice: "0",
    note: "",
  };
}

function newDraft(lookups: SalesWorkOrderModuleLookups | null): SalesOrderDraft {
  const item = lookups?.items.find((row) => row.isActive) ?? lookups?.items[0];
  return {
    customerId: lookups?.customers[0]?.id ?? null,
    customerName: "",
    orderDate: today(),
    operatorEmployeeId: lookups?.actor.appMemberId ?? null,
    note: "",
    hidePriceOnSalesDocument: false,
    invoiceTypeCode: null,
    receiptOptionCode: null,
    lines: [lineFromItem(item)],
  };
}

function draftFromDetail(detail: SalesWorkOrderDetail): SalesOrderDraft {
  return {
    customerId: detail.customerId,
    customerName: detail.customerId == null ? detail.customerNameSnapshot : "",
    orderDate: detail.orderDate,
    operatorEmployeeId: detail.operator.id,
    note: detail.note ?? "",
    hidePriceOnSalesDocument: detail.hidePriceOnSalesDocument,
    invoiceTypeCode: detail.invoiceTypeCode,
    receiptOptionCode: detail.receiptOptionCode,
    lines: detail.lines.map((line) => ({
      key: `existing-${line.id}`,
      itemId: line.itemId,
      quantity: line.quantity,
      unit: line.unitSnapshot,
      unitPrice: line.unitPrice,
      note: line.note ?? "",
    })),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 409 || error.code.includes("REVISION_CONFLICT")) {
      return "工單已被其他人修改，請重新載入後再操作。";
    }
    if (error.status === 403) return "你目前沒有執行此工單操作的權限。";
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") return "登入狀態已失效，請重新登入。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "身分服務暫時無法使用，請稍後再試。";
    const field = error.fields ? Object.values(error.fields)[0] : null;
    return field || error.message || error.code;
  }
  return "目前無法完成銷售工單操作。";
}

export function SalesOrderOperationalPage() {
  const [rows, setRows] = useState<readonly SalesWorkOrderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<SalesWorkOrderDetail | null>(null);
  const [lookups, setLookups] = useState<SalesWorkOrderModuleLookups | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<SalesOrderDraft | null>(null);
  const [busy, setBusy] = useState(false);
  useUnsavedChangesGuard({ active: editing, blocked: busy });
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      void searchSalesOrders({
        q: query.trim() || undefined,
        statusCode: statusFilter ? statusFilter as SalesWorkOrderStatusCode : undefined,
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
    setLoadingDetail(true);
    void loadSalesOrderDetail(selectedId)
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
    return () => { cancelled = true; };
  }, [selectedId, creating, refreshEpoch]);

  const selectedItemIds = useMemo(
    () => (draft?.lines ?? selected?.lines ?? []).flatMap((line) => line.itemId == null ? [] : [line.itemId]),
    [draft, selected],
  );
  const selectedItemKey = selectedItemIds.join(",");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadSalesOrderLookups({
        customerId: draft?.customerId ?? selected?.customerId ?? null,
        itemIds: selectedItemKey ? selectedItemKey.split(",").map(Number) : [],
        operatorId: draft?.operatorEmployeeId ?? selected?.operator.id ?? null,
        customerQuery: customerSearch,
        itemQuery: itemSearch,
        limit: 100,
      })
        .then((value) => {
          if (cancelled) return;
          setLookups(value);
          if (creating) {
            setDraft((current) => current ? {
              ...current,
              operatorEmployeeId: current.operatorEmployeeId ?? value.actor.appMemberId,
            } : current);
          }
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
    draft?.customerId,
    draft?.operatorEmployeeId,
    selected?.customerId,
    selected?.operator.id,
    selectedItemKey,
    customerSearch,
    itemSearch,
    creating,
  ]);

  function selectOrder(id: number) {
    if (editing && !window.confirm("放棄尚未儲存的工單修改？")) return;
    setSelectedId(id);
    setEditing(false);
    setCreating(false);
    setDraft(null);
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
    if (!selected || selected.statusCode !== "created" || selected.erpNo != null) return;
    setCreating(false);
    setEditing(true);
    setDraft(draftFromDetail(selected));
    setMessage(null);
  }

  function cancelEdit() {
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
  }

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setDraft((current) => current ? {
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    } : current);
  }

  function changeLineItem(index: number, itemId: number | null) {
    const item = lookups?.items.find((row) => row.id === itemId);
    patchLine(index, { itemId, unit: item?.baseUnit ?? "" });
  }

  function addLine() {
    if (!draft) return;
    const item = lookups?.items.find((row) => row.isActive) ?? lookups?.items[0];
    setDraft({ ...draft, lines: [...draft.lines, lineFromItem(item)] });
  }

  function removeLine(index: number) {
    if (!draft || draft.lines.length <= 1) return;
    setDraft({ ...draft, lines: draft.lines.filter((_, lineIndex) => lineIndex !== index) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || !draft.operatorEmployeeId || draft.lines.length === 0) return;
    if (draft.customerId == null && !draft.customerName.trim()) return;
    if (draft.lines.some((line) => !line.itemId || !line.quantity.trim() || !line.unit.trim() || !line.unitPrice.trim())) return;

    setBusy(true);
    setMessage(null);
    try {
      const profile = {
        customerId: draft.customerId,
        customerName: draft.customerId == null ? draft.customerName.trim() : null,
        orderDate: draft.orderDate,
        operatorEmployeeId: draft.operatorEmployeeId,
        note: draft.note.trim() || null,
        hidePriceOnSalesDocument: draft.hidePriceOnSalesDocument,
        invoiceTypeCode: draft.invoiceTypeCode,
        receiptOptionCode: draft.receiptOptionCode,
        lines: draft.lines.map((line, index) => ({
          itemId: line.itemId as number,
          quantity: line.quantity.trim(),
          unit: line.unit.trim(),
          unitPrice: line.unitPrice.trim(),
          note: line.note.trim() || null,
          sortOrder: index,
        })),
      };
      const wasCreating = creating;
      const saved = wasCreating
        ? await createSalesOrder(profile)
        : selected
          ? await updateSalesOrder(selected.id, { ...profile, expectedRevision: selected.revision })
          : null;
      if (!saved) return;
      setSelected(saved);
      setSelectedId(saved.id);
      setEditing(false);
      setCreating(false);
      setDraft(null);
      setMessage(wasCreating ? "銷售工單已建立。" : "銷售工單草稿已儲存。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function fillOrCorrectErp() {
    if (!selected || selected.statusCode === "voided" || busy) return;
    const customerNo = window.prompt("輸入 ERP 客戶編號（必須完全符合 CY Web 客戶主檔）", selected.customerNoSnapshot ?? "");
    if (customerNo == null || !customerNo.trim()) return;
    const erpNo = window.prompt("輸入 SMART ERP 銷售單號", selected.erpNo ?? "");
    if (erpNo == null || !erpNo.trim()) return;
    const correction = selected.erpNo != null;
    const reason = correction ? window.prompt("請輸入 ERP 資料更正原因", "ERP 資料更正") : null;
    if (correction && reason == null) return;
    await runAction(
      () => fillOrCorrectSalesOrderErp(selected.id, {
        customerNo: customerNo.trim(),
        erpNo: erpNo.trim(),
        expectedRevision: selected.revision,
        reason: reason?.trim() || null,
      }),
      correction ? "ERP 資料已更正。" : "ERP 資料已回填並開單。",
    );
  }

  async function transition(
    action: "waiting" | "picked" | "shipped" | "reverse" | "void",
  ) {
    if (!selected || busy) return;
    let reason: string | null = null;
    if (action === "reverse" || action === "void") {
      const prompt = window.prompt(action === "reverse" ? "請輸入撤銷出貨原因" : "請輸入作廢原因", "");
      if (prompt == null || !prompt.trim()) return;
      reason = prompt.trim();
    }
    const input = { expectedRevision: selected.revision, reason };
    if (action === "waiting") await runAction(() => markSalesOrderWaitingStock(selected.id, input), "工單已轉待貨。");
    if (action === "picked") await runAction(() => markSalesOrderPicked(selected.id, input), "工單已完成撿貨。");
    if (action === "shipped") await runAction(() => markSalesOrderShipped(selected.id, input), "工單已確認出貨。");
    if (action === "reverse") await runAction(() => reverseSalesOrderShipment(selected.id, input), "出貨已撤銷，工單回到已撿貨。");
    if (action === "void") await runAction(() => voidSalesOrder(selected.id, input), "工單已作廢。");
  }

  async function deleteDraft() {
    if (!selected || selected.statusCode !== "created" || selected.erpNo != null || busy) return;
    if (!window.confirm(`確定永久刪除草稿 ${selected.workOrderRef}？伺服器仍會重新確認目前角色權限。`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteSalesOrderDraft(selected.id, { expectedRevision: selected.revision });
      setSelected(null);
      setSelectedId(null);
      setMessage("草稿工單已刪除。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: () => Promise<SalesWorkOrderDetail>, successMessage: string) {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await action();
      setSelected(saved);
      setSelectedId(saved.id);
      setMessage(successMessage);
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  function operatorLabel(id: number, employeeNo: string | null): string {
    if (lookups?.actor.appMemberId === id) {
      return `${lookups.actor.displayName}（${employeeNo ?? lookups.actor.employeeNo ?? "目前使用者"}）`;
    }
    return employeeNo ?? `Employee #${id}`;
  }

  return (
    <div className="cy-order-op">
      <div className="cy-op-page-header">
        <div>
          <h1>銷售工單</h1>
          <p>管理銷售工單、ERP 單號與出貨流程；正式單號由 SMART ERP 提供。</p>
        </div>
        <div className="cy-op-page-actions">
          <button className="cy-op-button primary" disabled={busy} onClick={startCreate}>新增工單</button>
        </div>
      </div>

      {message ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-body">{message}</div></div> : null}

      <div className="cy-op-split">
        <section className="cy-op-panel cy-op-list-panel">
          <input className="cy-op-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋工單、ERP 單號、客戶" />
          <select className="cy-op-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">全部狀態</option>
            {Object.entries(statusText).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <div className="cy-op-list">
            {rows.map((row) => (
              <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => selectOrder(row.id)}>
                <strong>{row.workOrderRef}</strong>
                <span>{row.customerNameSnapshot}{row.erpNo ? ` · ERP ${row.erpNo}` : ""}</span>
                <small>{statusText[row.statusCode]} · {row.orderDate}</small>
              </button>
            ))}
            {loadingList ? <div className="cy-op-empty">讀取工單資料中…</div> : null}
            {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的工單。</div> : null}
          </div>
        </section>

        <section className="cy-op-panel">
          {editing && draft ? (
            <form className="cy-op-form" onSubmit={(event) => void save(event)}>
              <div className="cy-op-panel-header">
                <div><h2>{creating ? "新增銷售工單" : `修改 ${selected?.workOrderRef ?? "工單"}`}</h2><p>一般內容只可在 ERP 回填前修改。</p></div>
                <div><button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button> <button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button></div>
              </div>

              <div className="cy-op-form-grid">
                <label>客戶搜尋<input className="cy-op-input" value={customerSearch} disabled={busy} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="客戶編號／名稱" /></label>
                <label>客戶
                  <select className="cy-op-input" value={draft.customerId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, customerId: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">名稱-only 現場客戶</option>
                    {(lookups?.customers ?? []).map((row) => <option key={row.id} value={row.id}>{row.customerNo ? `${row.customerNo} · ` : ""}{row.shortName}</option>)}
                  </select>
                </label>
                {draft.customerId == null ? <label>現場客戶名稱<input className="cy-op-input" value={draft.customerName} disabled={busy} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} required /></label> : null}
                <label>工單日期<input className="cy-op-input" type="date" value={draft.orderDate} disabled={busy} onChange={(event) => setDraft({ ...draft, orderDate: event.target.value })} /></label>
                <label>操作人員
                  <select className="cy-op-input" value={draft.operatorEmployeeId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, operatorEmployeeId: Number(event.target.value) || null })}>
                    <option value="">請選擇</option>
                    {(lookups?.operators ?? []).map((row) => <option key={row.id} value={row.id}>{operatorLabel(row.id, row.employeeNo)}{row.isActive ? "" : "（已停用）"}</option>)}
                  </select>
                </label>
                <label>發票類型
                  <select className="cy-op-input" value={draft.invoiceTypeCode ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, invoiceTypeCode: event.target.value ? event.target.value as InvoiceTypeCode : null })}>
                    <option value="">未指定</option><option value="two_copy">二聯式</option><option value="three_copy">三聯式</option>
                  </select>
                </label>
                <label>收據
                  <select className="cy-op-input" value={draft.receiptOptionCode ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, receiptOptionCode: event.target.value ? event.target.value as ReceiptOptionCode : null })}>
                    <option value="">未指定</option><option value="with_receipt">附收據</option><option value="without_receipt">不附收據</option>
                  </select>
                </label>
                <label><input type="checkbox" checked={draft.hidePriceOnSalesDocument} disabled={busy} onChange={(event) => setDraft({ ...draft, hidePriceOnSalesDocument: event.target.checked })} /> 銷售文件隱藏價格</label>
                <label className="wide">備註<textarea className="cy-op-input" rows={2} value={draft.note} disabled={busy} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
              </div>

              <div className="cy-op-subsection">
                <div className="cy-op-panel-header"><div><h3>工單明細</h3><p>數量與單價最多四位小數。</p></div><button type="button" className="cy-op-button" disabled={busy} onClick={addLine}>增加明細</button></div>
                <input className="cy-op-input" value={itemSearch} disabled={busy} onChange={(event) => setItemSearch(event.target.value)} placeholder="搜尋品號／品名／規格" />
                {draft.lines.map((line, index) => {
                  const item = lookups?.items.find((row) => row.id === line.itemId);
                  const units = item?.allowedUnits?.length ? item.allowedUnits : (line.unit ? [line.unit] : []);
                  return (
                    <div className="cy-op-inline-row" key={line.key}>
                      <select className="cy-op-input" value={line.itemId ?? ""} disabled={busy} onChange={(event) => changeLineItem(index, Number(event.target.value) || null)}>
                        <option value="">請選擇商品</option>
                        {(lookups?.items ?? []).map((row) => <option key={row.id} value={row.id}>{row.itemNo} · {row.name}{row.isActive ? "" : "（已停用）"}</option>)}
                      </select>
                      <input className="cy-op-input" value={line.quantity} inputMode="decimal" disabled={busy} onChange={(event) => patchLine(index, { quantity: event.target.value })} placeholder="數量" />
                      <select className="cy-op-input" value={line.unit} disabled={busy} onChange={(event) => patchLine(index, { unit: event.target.value })}>
                        {units.map((unit) => <option key={unit}>{unit}</option>)}
                      </select>
                      <input className="cy-op-input" value={line.unitPrice} inputMode="decimal" disabled={busy} onChange={(event) => patchLine(index, { unitPrice: event.target.value })} placeholder="單價" />
                      <input className="cy-op-input" value={line.note} disabled={busy} onChange={(event) => patchLine(index, { note: event.target.value })} placeholder="明細備註" />
                      <button type="button" className="cy-op-button danger" disabled={busy || draft.lines.length <= 1} onClick={() => removeLine(index)}>移除</button>
                    </div>
                  );
                })}
              </div>

              <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button><button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button></div>
            </form>
          ) : selected ? (
            <div>
              <div className="cy-op-panel-header">
                <div><h2>{selected.workOrderRef}</h2><p>{selected.customerNameSnapshot} · rev.{selected.revision}</p></div>
                <span className="cy-op-badge">{statusText[selected.statusCode]}</span>
              </div>
              {loadingDetail ? <p>更新工單資料中…</p> : null}
              <div className="cy-op-detail-grid">
                <div><span>ERP 單號</span><strong>{selected.erpNo ?? "尚未回填"}</strong></div>
                <div><span>ERP 客戶編號</span><strong>{selected.customerNoSnapshot ?? "—"}</strong></div>
                <div><span>日期</span><strong>{selected.orderDate}</strong></div>
                <div><span>操作人員</span><strong>{selected.operator.displayName ?? selected.operator.employeeNo ?? `Employee #${selected.operator.id}`}</strong></div>
                <div><span>發票</span><strong>{selected.invoiceTypeCode ?? "—"}</strong></div>
                <div><span>收據</span><strong>{selected.receiptOptionCode ?? "—"}</strong></div>
                <div className="wide"><span>備註</span><strong>{selected.note ?? "—"}</strong></div>
              </div>

              <div className="cy-op-subsection">
                <h3>明細</h3>
                <table className="cy-op-table">
                  <thead><tr><th>品號</th><th>商品</th><th>數量</th><th>單位</th><th>單價</th></tr></thead>
                  <tbody>{selected.lines.map((line) => <tr key={line.id}><td>{line.itemNoSnapshot}</td><td>{line.itemNameSnapshot}</td><td>{line.quantity}</td><td>{line.unitSnapshot}</td><td>{line.unitPrice}</td></tr>)}</tbody>
                </table>
              </div>

              <div className="cy-op-action-bar">
                {selected.statusCode === "created" && selected.erpNo == null ? <>
                  <button className="cy-op-button" disabled={busy} onClick={startEdit}>修改草稿</button>
                  <button className="cy-op-button primary" disabled={busy} onClick={() => void fillOrCorrectErp()}>ERP 回填／開單</button>
                  <button className="cy-op-button danger" disabled={busy} onClick={() => void deleteDraft()}>刪除草稿</button>
                </> : null}
                {selected.statusCode !== "created" && selected.statusCode !== "voided" ? <button className="cy-op-button" disabled={busy} onClick={() => void fillOrCorrectErp()}>更正 ERP 資料</button> : null}
                {selected.statusCode === "issued" ? <>
                  <button className="cy-op-button" disabled={busy} onClick={() => void transition("waiting")}>轉待貨</button>
                  <button className="cy-op-button primary" disabled={busy} onClick={() => void transition("picked")}>直接撿貨</button>
                </> : null}
                {selected.statusCode === "waiting_stock" ? <button className="cy-op-button primary" disabled={busy} onClick={() => void transition("picked")}>完成撿貨</button> : null}
                {selected.statusCode === "picked" ? <button className="cy-op-button primary" disabled={busy} onClick={() => void transition("shipped")}>確認出貨</button> : null}
                {selected.statusCode === "shipped" ? <button className="cy-op-button" disabled={busy} onClick={() => void transition("reverse")}>撤銷出貨</button> : null}
                {["issued", "waiting_stock", "picked", "shipped"].includes(selected.statusCode) ? <button className="cy-op-button danger" disabled={busy} onClick={() => void transition("void")}>作廢</button> : null}
              </div>
            </div>
          ) : loadingDetail ? <div className="cy-op-empty">讀取工單資料中…</div> : <div className="cy-op-empty">請選擇工單，或新增一筆。</div>}
        </section>
      </div>
    </div>
  );
}
