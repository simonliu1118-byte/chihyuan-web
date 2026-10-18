import { PagePrimaryActions } from "../../ui/shell/PagePrimaryActions";
import { taipeiToday } from "../../../shared/erp-query-history";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { useFormPrompt } from "../../ui/overlays/useFormPrompt";
import { EntityPicker } from "../../ui/pickers/EntityPicker";
import type { SalesWorkOrderCustomerOption, SalesWorkOrderItemOption as LineItemOption } from "../../../shared/business-lookups";
import "./sales-order-operational.css";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
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

const orderTone: Record<SalesWorkOrderStatusCode, string> = { created: "warning", issued: "info", waiting_stock: "info", picked: "info", shipped: "success", voided: "danger" };
const invoiceText: Record<string, string> = { two_copy: "二聯式", three_copy: "三聯式" };
const receiptText: Record<string, string> = { with_receipt: "附收據", without_receipt: "不附收據" };
/** The normal path of a work order; 作廢 is shown separately. */
const progressSteps: readonly { code: SalesWorkOrderStatusCode; label: string }[] = [
  { code: "created", label: "建立" },
  { code: "issued", label: "ERP 開單" },
  { code: "waiting_stock", label: "待貨" },
  { code: "picked", label: "撿貨" },
  { code: "shipped", label: "出貨" },
];

function OrderProgress({ status }: { status: SalesWorkOrderStatusCode }) {
  if (status === "voided") return <p className="cy-progress-voided">此工單已作廢。</p>;
  const current = progressSteps.findIndex(step => step.code === status);
  return <ol className="cy-progress" aria-label="工單進度">
    {progressSteps.map((step, index) => <li key={step.code} data-state={index < current ? "done" : index === current ? "current" : "todo"}
      aria-current={index === current ? "step" : undefined}>{step.label}</li>)}
  </ol>;
}

/** Business dates follow Taiwan time; toISOString() would give yesterday before 08:00. */
function today(): string {
  return taipeiToday();
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
  return {
    customerId: null,
    customerName: "",
    orderDate: today(),
    operatorEmployeeId: lookups?.actor.appMemberId ?? null,
    note: "",
    hidePriceOnSalesDocument: false,
    invoiceTypeCode: null,
    receiptOptionCode: null,
    lines: [lineFromItem(undefined)],
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
    if (error.code.includes("REVISION_CONFLICT")) {
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
  const [pickedCustomer, setPickedCustomer] = useState<SalesWorkOrderCustomerOption | null>(null);
  const [pickedItems, setPickedItems] = useState<Record<string, LineItemOption>>({});
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<SalesOrderDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const unsavedGuard = useUnsavedChangesGuard({ active: editing, blocked: busy, message: "目前有尚未儲存的工單修改，確定放棄？" });
  const pane = useMasterDetailPane();
  const { confirm, confirmationDialog } = useConfirmation();
  const { ask, promptDialog } = useFormPrompt();
  const canLeave = async () => (await unsavedGuard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", cancelLabel: "繼續編輯", confirmTone: "danger",
  }))).allowed;
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage, reportError] = useFeedbackMessage<string | null>(null);
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
          if (!cancelled) reportError(errorMessage(error));
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
          reportError(errorMessage(error));
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
          if (!cancelled) reportError(errorMessage(error));
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
    creating,
  ]);

  async function selectOrder(id: number) {
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
    if (!selected || selected.statusCode !== "created" || selected.erpNo != null) return;
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

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setDraft((current) => current ? {
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    } : current);
  }

  function changeLineItem(index: number, key: string, item: LineItemOption | null) {
    setPickedItems((current) => {
      const next = { ...current };
      if (item) next[key] = item; else delete next[key];
      return next;
    });
    patchLine(index, { itemId: item?.id ?? null, unit: item?.baseUnit ?? "" });
  }

  function lineItem(line: DraftLine): LineItemOption | null {
    const picked = pickedItems[line.key];
    if (picked && picked.id === line.itemId) return picked;
    return lookups?.items.find((row) => row.id === line.itemId) ?? null;
  }

  function addLine() {
    if (!draft) return;
    setDraft({ ...draft, lines: [...draft.lines, lineFromItem(undefined)] });
  }

  function removeLine(index: number) {
    if (!draft || draft.lines.length <= 1) return;
    setDraft({ ...draft, lines: draft.lines.filter((_, lineIndex) => lineIndex !== index) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    const lineIssue = draft.lines.findIndex((line) => !line.itemId || !line.quantity.trim() || !line.unit.trim() || !line.unitPrice.trim());
    const missing = draft.customerId == null && !draft.customerName.trim() ? "請選擇客戶，或填寫現場客戶名稱。"
      : !draft.operatorEmployeeId ? "請選擇操作人員。"
      : draft.lines.length === 0 ? "請至少加入一筆明細。"
      : lineIssue >= 0 ? `第 ${lineIssue + 1} 列明細請填寫商品、數量、單位與單價。` : null;
    const operatorEmployeeId = draft.operatorEmployeeId;
    if (missing || !operatorEmployeeId) { reportError(missing ?? "請選擇操作人員。"); return; }

    setBusy(true);
    setMessage(null);
    try {
      const profile = {
        customerId: draft.customerId,
        customerName: draft.customerId == null ? draft.customerName.trim() : null,
        orderDate: draft.orderDate,
        operatorEmployeeId,
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
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function fillOrCorrectErp() {
    if (!selected || selected.statusCode === "voided" || busy) return;
    const correction = selected.erpNo != null;
    const answer = await ask({
      title: correction ? "更正 ERP 資料" : "ERP 回填／開單",
      description: correction ? "修改已回填的 ERP 客戶編號或銷售單號，並保留更正紀錄。" : "填入 SMART ERP 開單後的資料，工單會改為「已開單」。",
      fields: [
        { name: "customerNo", label: "ERP 客戶編號", defaultValue: selected.customerNoSnapshot ?? "", required: true, description: "必須與 CY Web 客戶資料中的 ERP 客戶編號相同。" },
        { name: "erpNo", label: "SMART ERP 銷售單號", defaultValue: selected.erpNo ?? "", required: true },
        ...(correction ? [{ name: "reason", label: "更正原因", defaultValue: "ERP 資料更正" }] : []),
      ],
      confirmLabel: correction ? "儲存更正" : "回填並開單",
    });
    if (!answer) return;
    const { customerNo, erpNo } = answer;
    const reason = correction ? answer.reason : null;
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
      const answer = await ask({
        title: action === "reverse" ? "撤銷出貨" : "作廢工單",
        description: action === "reverse" ? "撤銷後工單會回到「已撿貨」。" : "作廢後工單保留紀錄，但不能再繼續流程。",
        fields: [{ name: "reason", label: action === "reverse" ? "撤銷原因" : "作廢原因", required: true }],
        confirmLabel: action === "reverse" ? "撤銷出貨" : "作廢", confirmTone: "danger",
      });
      if (!answer?.reason) return;
      reason = answer.reason;
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
    if (!(await confirm({ title: "刪除工單草稿", description: `草稿 ${selected.workOrderRef} 刪除後無法復原。`, confirmLabel: "刪除", confirmTone: "danger" }))) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteSalesOrderDraft(selected.id, { expectedRevision: selected.revision });
      setSelected(null);
      setSelectedId(null);
      pane.close();
      setMessage("草稿工單已刪除。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
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
      reportError(errorMessage(error));
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
      {confirmationDialog}
      {promptDialog}
      <PagePrimaryActions>
        <button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增工單</button>
      </PagePrimaryActions>

      {message ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-body">{message}</div></div> : null}

      <div className="cy-md cy-order-workspace" data-pane={pane.pane}>
        <section className="cy-op-panel cy-md-list" aria-label="工單清單">
          <div className="cy-md-toolbar">
            <input className="cy-op-input" type="search" aria-label="搜尋工單" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋工單、ERP 單號、客戶" />
            <select className="cy-op-input" aria-label="工單狀態" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部狀態</option>
              {Object.entries(statusText).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <div className="cy-md-count">{loadingList ? "讀取工單中…" : `共 ${rows.length} 筆`}</div>
          </div>
          <div className="cy-op-list">
            {rows.map((row) => (
              <button key={row.id} type="button" className={`cy-op-list-row cy-status-row ${selectedId === row.id ? "active" : ""}`} aria-current={selectedId === row.id ? "true" : undefined} onClick={() => void selectOrder(row.id)}>
                <strong>{row.customerNameSnapshot}</strong>
                <span><span className="cy-mono">{row.erpNo ? `ERP ${row.erpNo}` : row.workOrderRef}</span> · {row.orderDate}</span>
                <small className="cy-flow-status" data-tone={orderTone[row.statusCode]}>{statusText[row.statusCode]}</small>
              </button>
            ))}
            {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的工單。</div> : null}
          </div>
        </section>

        <section className="cy-op-panel cy-md-detail">
          <MasterDetailBack label="工單清單" disabled={busy} onBack={async () => { if (editing) { if (!(await canLeave())) return; setEditing(false); setCreating(false); setDraft(null); } pane.close(); }} />
          {editing && draft ? (
            <form className="cy-op-form" onSubmit={(event) => void save(event)}>
              <div className="cy-record-header">
                <div><h2>{creating ? "新增銷售工單" : `修改 ${selected?.workOrderRef ?? "工單"}`}</h2><p>ERP 開單前可以修改；開單後只能更正 ERP 資料。</p></div>
              </div>

              <div className="cy-op-form-grid cy-form-grid-spaced">
                <EntityPicker<SalesWorkOrderCustomerOption> label="客戶" disabled={busy}
                  value={pickedCustomer?.id === draft.customerId ? pickedCustomer : (lookups?.customers ?? []).find((row) => row.id === draft.customerId) ?? null}
                  onSelect={(row) => { setPickedCustomer(row); setDraft({ ...draft, customerId: row?.id ?? null }); }}
                  search={async (query) => (await loadSalesOrderLookups({ customerQuery: query, limit: 20 })).customers}
                  getKey={(row) => row.id} getLabel={(row) => `${row.customerNo ? `${row.customerNo} · ` : ""}${row.shortName}`}
                  placeholder="輸入客戶編號或名稱" description="未建檔的現場客戶可留空，改填下方名稱。" />
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

              <section className="cy-form-block">
                <div className="cy-form-block-head"><div><h3>工單明細</h3><p>數量與單價最多四位小數。</p></div><button type="button" className="cy-op-button compact" disabled={busy} onClick={addLine}>＋ 增加明細</button></div>
                <div className="cy-form-block-body">
                <div className="cy-order-line cy-order-line-head" aria-hidden="true"><span>商品</span><span>數量</span><span>單位</span><span>單價</span><span>備註</span><span /></div>
                {draft.lines.map((line, index) => {
                  const item = lineItem(line);
                  const units = item?.allowedUnits?.length ? item.allowedUnits : (line.unit ? [line.unit] : []);
                  return (
                    <div className="cy-order-line" key={line.key}>
                      <EntityPicker<LineItemOption> label={<span className="cy-visually-hidden">第 {index + 1} 列商品</span>} disabled={busy}
                        className="cy-order-line-item" value={item} onSelect={(row) => changeLineItem(index, line.key, row)}
                        search={async (query) => (await loadSalesOrderLookups({ itemQuery: query, limit: 20 })).items}
                        getKey={(row) => row.id} getLabel={(row) => `${row.itemNo} · ${row.name}`}
                        getDescription={(row) => [row.spec, row.isActive ? null : "已停用"].filter(Boolean).join(" · ") || null}
                        placeholder="輸入品號、品名或規格" />
                      <input className="cy-op-input" value={line.quantity} inputMode="decimal" disabled={busy} aria-label="數量" onChange={(event) => patchLine(index, { quantity: event.target.value })} placeholder="數量" />
                      <select className="cy-op-input" aria-label="單位" value={line.unit} disabled={busy} onChange={(event) => patchLine(index, { unit: event.target.value })}>
                        {units.map((unit) => <option key={unit}>{unit}</option>)}
                      </select>
                      <input className="cy-op-input" value={line.unitPrice} inputMode="decimal" disabled={busy} aria-label="單價" onChange={(event) => patchLine(index, { unitPrice: event.target.value })} placeholder="單價" />
                      <input className="cy-op-input" value={line.note} disabled={busy} aria-label="明細備註" onChange={(event) => patchLine(index, { note: event.target.value })} placeholder="備註" />
                      <button type="button" className="cy-op-button compact quiet cy-row-remove" disabled={busy || draft.lines.length <= 1} onClick={() => removeLine(index)}>移除</button>
                    </div>
                  );
                })}
                </div>
              </section>

              <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void cancelEdit()}>取消</button><button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : creating ? "建立工單" : "儲存修改"}</button></div>
            </form>
          ) : selected ? (
            <div>
              <div className="cy-record-header">
                <div><h2>{selected.customerNameSnapshot}</h2><p><span className="cy-mono">{selected.workOrderRef}</span>{selected.erpNo ? <> · ERP <span className="cy-mono">{selected.erpNo}</span></> : null} · {selected.orderDate}</p></div>
                <div className="cy-record-actions">
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
              <OrderProgress status={selected.statusCode} />
              {loadingDetail ? <p>更新工單資料中…</p> : null}
              <div className="cy-op-detail-grid">
                <div><span>ERP 單號</span><strong>{selected.erpNo ?? "尚未回填"}</strong></div>
                <div><span>ERP 客戶編號</span><strong>{selected.customerNoSnapshot ?? "—"}</strong></div>
                <div><span>日期</span><strong>{selected.orderDate}</strong></div>
                <div><span>操作人員</span><strong>{selected.operator.displayName ?? selected.operator.employeeNo ?? `員工 #${selected.operator.id}`}</strong></div>
                <div><span>發票</span><strong>{selected.invoiceTypeCode ? invoiceText[selected.invoiceTypeCode] ?? selected.invoiceTypeCode : "—"}</strong></div>
                <div><span>收據</span><strong>{selected.receiptOptionCode ? receiptText[selected.receiptOptionCode] ?? selected.receiptOptionCode : "—"}</strong></div>
                <div className="wide"><span>備註</span><strong>{selected.note ?? "—"}</strong></div>
              </div>

              <div className="cy-op-subsection">
                <h3>明細</h3>
                <div className="cy-op-table-wrap"><table className="cy-op-table">
                  <thead><tr><th>品號</th><th>商品</th><th className="num">數量</th><th>單位</th><th className="num">單價</th></tr></thead>
                  <tbody>{selected.lines.map((line) => <tr key={line.id}><td className="cy-mono">{line.itemNoSnapshot}</td><td>{line.itemNameSnapshot}</td><td className="num">{line.quantity}</td><td>{line.unitSnapshot}</td><td className="num">{line.unitPrice}</td></tr>)}</tbody>
                </table></div>
              </div>

            </div>
          ) : loadingDetail ? <div className="cy-op-empty">讀取工單資料中…</div> : <MasterDetailEmpty title="尚未選擇工單" hint="從左側清單選一張工單，或按右上角「新增工單」。" />}
        </section>
      </div>
    </div>
  );
}
