import { StatusFilter } from "../../ui/data/StatusFilter";
import { outsourcingNextStep, outsourcingTone } from "./status-flow";
import { NextStep } from "../../ui/feedback/NextStep";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { BomWorkspace, ContractorWorkspace, outsourcingErrorMessage } from "./OutsourcingMasterData";
import { usePendingAction } from "../../ui/feedback/usePendingAction";
import { Loading } from "../../ui/feedback/Loading";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { LoadMoreRow, useLoadMore } from "../../ui/data/useLoadMore";
import { formatDate, formatDateTime } from "../../ui/foundation/format";
import { taipeiToday } from "../../../shared/erp-query-history";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { useFormPrompt } from "../../ui/overlays/useFormPrompt";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import "./outsourcing-operational.css";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { OutsourcingModuleLookups, OutsourcingItemOption } from "../../../shared/business-lookups";
import type {
  BomSummary,
  ContractorStockBalance,
  ContractorSummary,
  OutsourcingDetail,
  OutsourcingStatusCode,
  OutsourcingSummary,
} from "../../../shared/contractor-outsourcing";
import { ApiClientError } from "../../api/client";
import {
  cancelOutsourcingOutbound,
  cancelOutsourcingPayment,
  cancelOutsourcingPricing,
  cancelOutsourcingReceipt,
  confirmOutsourcingOutbound,
  correctOutsourcingOutbound,
  createOutsourcingOrder,
  deleteOutsourcingPending,
  loadContractorStock,
  loadOutsourcingDetail,
  loadOutsourcingLookups,
  markOutsourcingPaid,
  priceOutsourcing,
  receiveOutsourcing,
  searchBoms,
  searchContractors,
  searchOutsourcingOrders,
  updateOutsourcingPending,
} from "../api/outsourcing-runtime-client";

type Tab = "orders" | "contractors" | "boms" | "stock";

interface PartDraft {
  key: string;
  bomRecipeId: number | null;
  finishedItemId: number | null;
  componentItemId: number | null;
  quantity: string;
  unit: string;
  note: string;
}

interface OrderDraft {
  contractorId: number | null;
  orderDate: string;
  parts: PartDraft[];
}

const statusText: Record<OutsourcingStatusCode, string> = {
  pending_outbound: "待出庫",
  outbound: "已出庫",
  received: "已入庫",
  priced: "已計價",
  paid: "已付款",
  voided: "已作廢",
};

const progressSteps: readonly { code: OutsourcingStatusCode; label: string }[] = [
  { code: "pending_outbound", label: "建立" },
  { code: "outbound", label: "出庫" },
  { code: "received", label: "入庫" },
  { code: "priced", label: "計價" },
  { code: "paid", label: "付款" },
];

function OutsourcingProgress({ status }: { status: OutsourcingStatusCode }) {
  if (status === "voided") return <p className="cy-progress-voided">此代工單已作廢。</p>;
  const current = progressSteps.findIndex(step => step.code === status);
  return <ol className="cy-progress" aria-label="代工進度">
    {progressSteps.map((step, index) => <li key={step.code} data-state={index < current ? "done" : index === current ? "current" : "todo"}
      aria-current={index === current ? "step" : undefined}>{step.label}</li>)}
  </ol>;
}

/** Business dates follow Taiwan time; toISOString() would give yesterday before 08:00. */
function today(): string {
  return taipeiToday();
}

function draftKey(): string {
  return `part-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function itemLine(item: OutsourcingItemOption | undefined): PartDraft {
  return {
    key: draftKey(),
    bomRecipeId: null,
    finishedItemId: null,
    componentItemId: item?.id ?? null,
    quantity: "1",
    unit: item?.baseUnit ?? "",
    note: "",
  };
}

function draftFromDetail(detail: OutsourcingDetail): OrderDraft {
  return {
    contractorId: detail.contractorId,
    orderDate: detail.orderDate,
    parts: detail.parts.map((part) => ({
      key: `existing-${part.id}`,
      bomRecipeId: part.bomRecipeId,
      finishedItemId: part.finishedItemId,
      componentItemId: part.componentItemId,
      quantity: part.quantity,
      unit: part.unitSnapshot,
      note: part.note ?? "",
    })),
  };
}

export function OutsourcingOperationalPage() {
  const [tab, setTab] = useState<Tab>("orders");
  const [lookups, setLookups] = useState<OutsourcingModuleLookups | null>(null);
  const [itemQuery, setItemQuery] = useState("");

  const [orders, setOrders] = useState<readonly OutsourcingSummary[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  // The page appears once its first list page is in; until then only the shared spinner shows.
  const [listReady, setListReady] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [statusCounts, setStatusCounts] = useState<Partial<Record<string, number>> | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OutsourcingDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [correctingOutbound, setCorrectingOutbound] = useState(false);
  const [draft, setDraft] = useState<OrderDraft | null>(null);

  const [contractors, setContractors] = useState<readonly ContractorSummary[]>([]);

  const [boms, setBoms] = useState<readonly BomSummary[]>([]);

  const [stockContractorId, setStockContractorId] = useState<number | null>(null);
  const [stockRows, setStockRows] = useState<readonly ContractorStockBalance[]>([]);

  const [receiptItemId, setReceiptItemId] = useState<number | null>(null);
  const [receiptBomId, setReceiptBomId] = useState<number | null>(null);
  const [receiptQuantity, setReceiptQuantity] = useState("1");
  const [receiptUnit, setReceiptUnit] = useState("");

  const [busy, setBusy] = useState(false);
  const { pending, track } = usePendingAction();
  const unsavedGuard = useUnsavedChangesGuard({ active: editing, blocked: busy, message: "目前有尚未儲存的代工單修改，確定放棄？" });
  const { confirm, confirmationDialog } = useConfirmation();
  const { ask, promptDialog } = useFormPrompt();
  const canLeave = async () => (await unsavedGuard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", cancelLabel: "繼續編輯", confirmTone: "danger",
  }))).allowed;
  async function discardEditing() {
    if (busy || !(await canLeave())) return false;
    setEditing(false); setCreating(false); setCorrectingOutbound(false); setDraft(null);
    return true;
  }
  const pane = useMasterDetailPane();
  // Contractor/BOM editors live in OutsourcingMasterData; their open editor also guards tab switches.
  const [masterEditing, setMasterEditing] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const paging = useLoadMore(searchOutsourcingOrders, setOrders, (error) => reportError(outsourcingErrorMessage(error)));
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  const selectedItemIds = useMemo(() => {
    const fromDraft = draft?.parts.flatMap((part) => [
      ...(part.componentItemId ? [part.componentItemId] : []),
      ...(part.finishedItemId ? [part.finishedItemId] : []),
    ]) ?? [];
    const fromOrder = selectedOrder?.parts.flatMap((part) => [
      part.componentItemId,
      ...(part.finishedItemId ? [part.finishedItemId] : []),
    ]) ?? [];
    return [...new Set([...fromDraft, ...fromOrder, ...(receiptItemId ? [receiptItemId] : [])])];
  }, [draft, selectedOrder, receiptItemId]);
  const selectedItemKey = selectedItemIds.join(",");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadOutsourcingLookups({
        itemIds: selectedItemKey ? selectedItemKey.split(",").map(Number) : [],
        itemQuery,
        limit: 100,
      })
        .then((value) => { if (!cancelled) setLookups(value); })
        .catch((error) => { if (!cancelled) reportError(outsourcingErrorMessage(error)); });
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [selectedItemKey, itemQuery]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      searchContractors({ limit: 100 }),
      searchBoms({ limit: 100 }),
    ])
      .then(([contractorResult, bomResult]) => {
        if (cancelled) return;
        setContractors(contractorResult.items);
        setBoms(bomResult.items);
        setStockContractorId((current) => current ?? contractorResult.items[0]?.id ?? null);
        if (receiptItemId == null) {
          const activeBom = bomResult.items.find((row) => row.isActive);
          if (activeBom) {
            setReceiptItemId(activeBom.finishedItemId);
            setReceiptBomId(activeBom.id);
            setReceiptUnit(activeBom.outputUnit);
          }
        }
      })
      .catch((error) => { if (!cancelled) reportError(outsourcingErrorMessage(error)); });
    return () => { cancelled = true; };
  }, [refreshEpoch]);

  useEffect(() => {
    let cancelled = false;
    setLoadingOrders(true);
    const timer = window.setTimeout(() => {
      const listQuery = {
        q: orderQuery.trim() || undefined,
        statusCode: orderStatus ? orderStatus as OutsourcingStatusCode : undefined,
        limit: 100,
      };
      void searchOutsourcingOrders(listQuery)
        .then((result) => {
          if (cancelled) return;
          setOrders(result.items);
          setStatusCounts(result.statusCounts ?? null);
          paging.reset(listQuery, result.nextCursor);
          if (!editing) {
            setSelectedOrderId((current) => (
              current != null && result.items.some((row) => row.id === current)
                ? current
                : result.items[0]?.id ?? null
            ));
          }
        })
        .catch((error) => { if (!cancelled) reportError(outsourcingErrorMessage(error)); })
        .finally(() => { if (!cancelled) { setLoadingOrders(false); setListReady(true); } });
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [orderQuery, orderStatus, refreshEpoch, editing]);

  useEffect(() => {
    if (selectedOrderId == null || creating) {
      if (creating) setSelectedOrder(null);
      return;
    }
    let cancelled = false;
    void loadOutsourcingDetail(selectedOrderId)
      .then((detail) => { if (!cancelled) setSelectedOrder(detail); })
      .catch((error) => { if (!cancelled) reportError(outsourcingErrorMessage(error)); });
    return () => { cancelled = true; };
  }, [selectedOrderId, creating, refreshEpoch]);

  useEffect(() => {
    if (stockContractorId == null || tab !== "stock") {
      if (stockContractorId == null) setStockRows([]);
      return;
    }
    let cancelled = false;
    void loadContractorStock(stockContractorId)
      .then((rows) => { if (!cancelled) setStockRows(rows); })
      .catch((error) => { if (!cancelled) reportError(outsourcingErrorMessage(error)); });
    return () => { cancelled = true; };
  }, [stockContractorId, tab, refreshEpoch]);

  function activeItem(itemId: number | null): OutsourcingItemOption | undefined {
    return lookups?.items.find((row) => row.id === itemId);
  }

  async function startCreate() {
    if (busy || !(await canLeave())) return;
    pane.open();
    const contractor = contractors.find((row) => row.isActive) ?? contractors[0];
    const item = lookups?.items.find((row) => row.isActive) ?? lookups?.items[0];
    setCreating(true);
    setEditing(true);
    setCorrectingOutbound(false);
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setDraft({
      contractorId: contractor?.id ?? null,
      orderDate: today(),
      parts: [itemLine(item)],
    });
    setMessage(null);
  }

  function startEdit(mode: "pending" | "correct-outbound") {
    if (!selectedOrder) return;
    setCreating(false);
    setEditing(true);
    setCorrectingOutbound(mode === "correct-outbound");
    setDraft(draftFromDetail(selectedOrder));
    setMessage(null);
  }

  async function cancelEdit() {
    if (busy || !(await canLeave())) return;
    if (creating) pane.close();
    setEditing(false);
    setCreating(false);
    setCorrectingOutbound(false);
    setDraft(null);
    setSelectedOrderId((current) => current ?? orders[0]?.id ?? null);
  }

  function patchPart(index: number, patch: Partial<PartDraft>) {
    setDraft((current) => current ? {
      ...current,
      parts: current.parts.map((part, partIndex) => partIndex === index ? { ...part, ...patch } : part),
    } : current);
  }

  function changeComponent(index: number, itemId: number | null) {
    const item = activeItem(itemId);
    patchPart(index, { componentItemId: itemId, unit: item?.baseUnit ?? "" });
  }

  function addPart() {
    if (!draft) return;
    const item = lookups?.items.find((row) => row.isActive) ?? lookups?.items[0];
    setDraft({ ...draft, parts: [...draft.parts, itemLine(item)] });
  }

  function removePart(index: number) {
    if (!draft || draft.parts.length <= 1) return;
    setDraft({ ...draft, parts: draft.parts.filter((_, partIndex) => partIndex !== index) });
  }

  async function saveOrder(event: FormEvent) {
    event.preventDefault();
    if (!draft || !lookups || busy) return;
    const partIssue = draft.parts.findIndex((part) => !part.componentItemId || !part.quantity.trim() || !part.unit.trim());
    if (!draft.contractorId) { reportError("請選擇代工對象。"); return; }
    if (partIssue >= 0) { reportError(`第 ${partIssue + 1} 列料件請填寫商品、數量與單位。`); return; }

    const profile = {
      contractorId: draft.contractorId,
      operatorEmployeeId: lookups.actor.appMemberId,
      orderDate: draft.orderDate,
      parts: draft.parts.map((part, index) => ({
        bomRecipeId: part.bomRecipeId,
        finishedItemId: part.finishedItemId,
        componentItemId: part.componentItemId as number,
        quantity: part.quantity.trim(),
        unit: part.unit.trim(),
        note: part.note.trim() || null,
        sortOrder: index,
      })),
    };

    let correctionReason = "";
    if (!creating && selectedOrder && correctingOutbound) {
      const answer = await ask({ title: "更正已確認的出庫", description: "儲存後以新的出庫資料取代原本的出庫，並保留更正紀錄。",
        fields: [{ name: "reason", label: "更正原因", defaultValue: "出庫資料更正", required: true }], confirmLabel: "儲存更正" });
      if (!answer?.reason) return;
      correctionReason = answer.reason;
    }

    setBusy(true);
    setMessage(null);
    try {
      let saved: OutsourcingDetail;
      let success: string;
      if (creating) {
        saved = await createOutsourcingOrder(profile);
        success = "代工單已建立。";
      } else if (selectedOrder && correctingOutbound) {
        saved = await correctOutsourcingOutbound(selectedOrder.id, {
          ...profile,
          expectedRevision: selectedOrder.revision,
          reason: correctionReason,
        });
        success = "已完成受控出庫更正。";
      } else if (selectedOrder) {
        saved = await updateOutsourcingPending(selectedOrder.id, {
          ...profile,
          expectedRevision: selectedOrder.revision,
        });
        success = "待出庫代工單已儲存。";
      } else {
        return;
      }
      setSelectedOrder(saved);
      setSelectedOrderId(saved.id);
      setEditing(false);
      setCreating(false);
      setCorrectingOutbound(false);
      setDraft(null);
      setMessage(success);
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(outsourcingErrorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: () => Promise<OutsourcingDetail>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const detail = await action();
      setSelectedOrder(detail);
      setSelectedOrderId(detail.id);
      setMessage(success);
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(outsourcingErrorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function confirmOutbound() {
    if (!selectedOrder) return;
    await runAction(
      () => confirmOutsourcingOutbound(selectedOrder.id, {
        expectedRevision: selectedOrder.revision,
        effectiveDate: today(),
      }),
      "已確認實際出庫，代工庫存 movement 已由伺服器建立。",
    );
  }

  function changeReceiptItem(itemId: number | null) {
    setReceiptItemId(itemId);
    const item = activeItem(itemId);
    setReceiptUnit(item?.baseUnit ?? "");
    const candidates = boms.filter((row) => row.isActive && row.finishedItemId === itemId);
    setReceiptBomId(candidates[0]?.id ?? null);
  }

  async function receive() {
    if (!selectedOrder || !lookups || !receiptItemId || !receiptQuantity.trim() || !receiptUnit.trim()) return;
    await runAction(
      () => receiveOutsourcing(selectedOrder.id, {
        expectedRevision: selectedOrder.revision,
        receivedDate: today(),
        operatorEmployeeId: lookups.actor.appMemberId,
        items: [{
          itemId: receiptItemId,
          bomRecipeId: receiptBomId,
          quantity: receiptQuantity.trim(),
          unit: receiptUnit.trim(),
          sortOrder: 0,
        }],
      }),
      "入庫已完成，BOM 消耗 movement 由伺服器計算。",
    );
  }

  async function price() {
    if (!selectedOrder || !lookups) return;
    await runAction(
      () => priceOutsourcing(selectedOrder.id, {
        expectedRevision: selectedOrder.revision,
        pricedDate: today(),
        operatorEmployeeId: lookups.actor.appMemberId,
      }),
      "代工計價已完成。",
    );
  }

  async function reverse(action: "payment" | "pricing" | "receipt" | "outbound") {
    if (!selectedOrder) return;
    const label = { payment: "取消付款", pricing: "取消計價", receipt: "取消入庫", outbound: "取消出庫" }[action];
    const answer = await ask({ title: label, description: action === "outbound" ? "取消出庫後代工單會作廢，相關庫存異動會反轉。" : "取消後會回到上一個步驟，相關庫存異動會反轉。",
      fields: [{ name: "reason", label: "原因", required: true }], confirmLabel: label, confirmTone: "danger" });
    if (!answer?.reason) return;
    const input = { expectedRevision: selectedOrder.revision, reason: answer.reason };
    if (action === "payment") await runAction(() => cancelOutsourcingPayment(selectedOrder.id, input), "付款狀態已取消。");
    if (action === "pricing") await runAction(() => cancelOutsourcingPricing(selectedOrder.id, input), "計價已取消，回到已入庫。");
    if (action === "receipt") await runAction(() => cancelOutsourcingReceipt(selectedOrder.id, input), "入庫已取消，相關料件消耗已反轉。");
    if (action === "outbound") await runAction(() => cancelOutsourcingOutbound(selectedOrder.id, input), "出庫已取消並作廢，相關庫存異動已反轉。");
  }

  async function pay() {
    if (!selectedOrder) return;
    await runAction(
      () => markOutsourcingPaid(selectedOrder.id, { expectedRevision: selectedOrder.revision, effectiveDate: today() }),
      "付款已確認。",
    );
  }

  async function deletePending() {
    if (!selectedOrder || selectedOrder.statusCode !== "pending_outbound") return;
    if (!(await confirm({ title: "刪除代工單", description: `尚未出庫的 ${selectedOrder.outsourcingRef} 刪除後無法復原。`, confirmLabel: "刪除", confirmTone: "danger" }))) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteOutsourcingPending(selectedOrder.id, selectedOrder.revision);
      setSelectedOrder(null);
      setSelectedOrderId(null);
      pane.close();
      setMessage("待出庫代工單已刪除。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(outsourcingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const receiptBoms = boms.filter((row) => row.isActive && row.finishedItemId === receiptItemId);

  if (!listReady) return <Loading />;

  return (
    <div className="cy-outsourcing-op">
      {confirmationDialog}
      {promptDialog}
            <FeedbackBanner message={message} tone={messageTone} />

      <div className="cy-op-tabs">
        {(["orders", "contractors", "boms", "stock"] as Tab[]).map((value) => (
          <button type="button" className={tab === value ? "active" : ""} key={value} onClick={async () => { if (value === tab) return; if (editing && !(await discardEditing())) return; if (masterEditing && !(await confirm({ title: "放棄尚未儲存的修改", description: "切換頁籤會放棄目前尚未儲存的修改。", confirmLabel: "放棄修改", confirmTone: "danger" }))) return; setTab(value); }}>
            {value === "orders" ? "代工單" : value === "contractors" ? "代工對象／單價" : value === "boms" ? "BOM" : "代工庫存"}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        <>
          <div className="cy-md" data-pane={pane.pane}>
            <section className="cy-op-panel cy-md-list" aria-label="代工單清單">
              <div className="cy-md-toolbar">
                <div className="cy-md-toolbar-lead">
                  <button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增代工單</button>
                  <input className="cy-op-input" type="search" aria-label="搜尋代工單" value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="搜尋代工單、代工對象" />
                </div>
                <StatusFilter label="代工單狀態" value={orderStatus} onChange={setOrderStatus} counts={statusCounts}
                  options={(Object.keys(statusText) as (keyof typeof statusText)[]).map((code) => ({ code, label: statusText[code], tone: outsourcingTone[code] }))} />
                <div className="cy-md-count">{loadingOrders ? <Loading inline /> : paging.hasMore ? `已載入 ${orders.length} 筆，還有更多` : `共 ${orders.length} 筆`}</div>
              </div>
              <div className="cy-op-list">
                {orders.map((row) => <button key={row.id} type="button" className={`cy-op-list-row cy-status-row ${selectedOrderId === row.id ? "active" : ""}`} aria-current={selectedOrderId === row.id ? "true" : undefined} onClick={async () => { if (editing && !(await discardEditing())) return; setSelectedOrderId(row.id); pane.open(); }}><strong>{row.contractorNameSnapshot}</strong><span><span className="cy-mono">{row.outsourcingRef}</span> · {formatDate(row.orderDate)}</span><StatusChip tone={outsourcingTone[row.statusCode]}>{statusText[row.statusCode]}</StatusChip></button>)}
                {orders.length === 0 ? loadingOrders ? <Loading /> : <div className="cy-op-empty">尚無代工單。</div> : null}
                <LoadMoreRow hasMore={paging.hasMore} loading={paging.loading} onMore={() => void paging.more()} />
              </div>
            </section>

            <section className="cy-op-panel cy-md-detail">
              <MasterDetailBack label="代工單清單" disabled={busy} onBack={async () => { if (editing && !(await discardEditing())) return; pane.close(); }} />
              {editing && draft ? (
              <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={(event) => void saveOrder(event)}>
                <div className="cy-record-header cy-edit-header">
                  <div><h2>{creating ? "新增代工單" : correctingOutbound ? "更正已確認的出庫" : "修改代工單"}</h2><p>{correctingOutbound ? "儲存後會以新的出庫資料取代原本的出庫，並保留更正紀錄。" : "確認出庫前可以修改內容。"}</p></div>
                <div className="cy-record-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void cancelEdit()}>取消</button><button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>{creating ? "建立代工單" : "儲存修改"}</button></div></div>
                <div className="cy-op-form-grid cy-form-grid-spaced">
                  <label>代工對象
                    <select className="cy-op-input" value={draft.contractorId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, contractorId: Number(event.target.value) || null })}>
                      <option value="">請選擇</option>
                      {contractors.map((row) => <option key={row.id} value={row.id}>{row.displayName}{row.isActive ? "" : "（已停用）"}</option>)}
                    </select>
                  </label>
                  <label>工單日期<input className="cy-op-input" type="date" value={draft.orderDate} disabled={busy} onChange={(event) => setDraft({ ...draft, orderDate: event.target.value })} /></label>
                  <label className="wide">篩選商品選單<input className="cy-op-input" type="search" value={itemQuery} disabled={busy} onChange={(event) => setItemQuery(event.target.value)} placeholder="品號／品名／規格" /></label>
                </div>

                <section className="cy-form-block">
                  <div className="cy-form-block-head"><div><h3>出庫料件</h3><p>交給代工對象的料件；可註明預計做成的成品與 BOM。</p></div><button type="button" className="cy-op-button compact" disabled={busy} onClick={addPart}>＋ 增加料件</button></div>
                  <div className="cy-form-block-body">
                  <div className="cy-out-part cy-out-part-head" aria-hidden="true"><span>料件</span><span>數量</span><span>單位</span><span>預計成品</span><span>BOM</span><span /></div>
                  {draft.parts.map((part, index) => {
                    const component = activeItem(part.componentItemId);
                    const units = component?.allowedUnits?.length ? component.allowedUnits : (part.unit ? [part.unit] : []);
                    return <div className="cy-out-part" key={part.key}>
                      <select className="cy-op-input" value={part.componentItemId ?? ""} disabled={busy} onChange={(event) => changeComponent(index, Number(event.target.value) || null)}>
                        <option value="">選擇料件</option>
                        {(lookups?.items ?? []).map((row) => <option key={row.id} value={row.id}>{row.itemNo} · {row.name}{row.isActive ? "" : "（已停用）"}</option>)}
                      </select>
                      <input className="cy-op-input" value={part.quantity} inputMode="decimal" disabled={busy} onChange={(event) => patchPart(index, { quantity: event.target.value })} placeholder="數量" />
                      <select className="cy-op-input" value={part.unit} disabled={busy} onChange={(event) => patchPart(index, { unit: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select>
                      <select className="cy-op-input" value={part.finishedItemId ?? ""} disabled={busy} onChange={(event) => patchPart(index, { finishedItemId: Number(event.target.value) || null, bomRecipeId: null })}>
                        <option value="">未指定對應成品</option>
                        {(lookups?.items ?? []).map((row) => <option key={row.id} value={row.id}>{row.itemNo} · {row.name}</option>)}
                      </select>
                      <select className="cy-op-input" value={part.bomRecipeId ?? ""} disabled={busy || part.finishedItemId == null} onChange={(event) => patchPart(index, { bomRecipeId: Number(event.target.value) || null })}>
                        <option value="">未指定 BOM</option>
                        {boms.filter((row) => row.finishedItemId === part.finishedItemId).map((row) => <option key={row.id} value={row.id}>{row.recipeRef}</option>)}
                      </select>
                      <button type="button" className="cy-op-button compact quiet cy-row-remove" disabled={busy || draft.parts.length <= 1} onClick={() => removePart(index)}>移除</button>
                    </div>;
                  })}
                  </div>
                </section>
              </form>
              ) : selectedOrder ? <div>
                <div className="cy-record-header"><div><h2>{selectedOrder.contractorNameSnapshot}</h2><p><span className="cy-mono">{selectedOrder.outsourcingRef}</span> · {formatDate(selectedOrder.orderDate)}</p></div>
                <div className="cy-record-actions">
                  {selectedOrder.statusCode === "pending_outbound" ? <>
                    <button className="cy-op-button" disabled={busy} onClick={() => startEdit("pending")}>修改</button>
                    <button className="cy-op-button primary" disabled={busy} aria-busy={(busy && pending === "confirmOutbound") || undefined} onClick={() => track("confirmOutbound", confirmOutbound())}>確認出庫</button>
                    <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "deletePending") || undefined} onClick={() => track("deletePending", deletePending())}>刪除</button>
                  </> : null}
                  {selectedOrder.statusCode === "outbound" ? <>
                    <button className="cy-op-button" disabled={busy} onClick={() => startEdit("correct-outbound")}>更正出庫</button>
                    <button className="cy-op-button primary" disabled={busy} aria-busy={(busy && pending === "receive") || undefined} onClick={() => track("receive", receive())}>確認入庫</button>
                    <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "reverse:outbound") || undefined} onClick={() => track("reverse:outbound", reverse("outbound"))}>取消出庫</button>
                  </> : null}
                  {selectedOrder.statusCode === "received" ? <>
                    <button className="cy-op-button primary" disabled={busy} aria-busy={(busy && pending === "price") || undefined} onClick={() => track("price", price())}>計價</button>
                    <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "reverse:receipt") || undefined} onClick={() => track("reverse:receipt", reverse("receipt"))}>取消入庫</button>
                  </> : null}
                  {selectedOrder.statusCode === "priced" ? <>
                    <button className="cy-op-button primary" disabled={busy} aria-busy={(busy && pending === "pay") || undefined} onClick={() => track("pay", pay())}>確認付款</button>
                    <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "reverse:pricing") || undefined} onClick={() => track("reverse:pricing", reverse("pricing"))}>取消計價</button>
                  </> : null}
                  {selectedOrder.statusCode === "paid" ? <button className="cy-op-button danger" disabled={busy} aria-busy={(busy && pending === "reverse:payment") || undefined} onClick={() => track("reverse:payment", reverse("payment"))}>取消付款</button> : null}
                </div></div>
                <OutsourcingProgress status={selectedOrder.statusCode} />
                {selectedOrder.statusCode !== "voided" ? <NextStep tone={outsourcingTone[selectedOrder.statusCode]}>{outsourcingNextStep[selectedOrder.statusCode]}</NextStep> : null}
                <div className="cy-op-detail-grid"><div><span>工單日期</span><strong>{formatDate(selectedOrder.orderDate)}</strong></div><div><span>出庫日期</span><strong>{formatDate(selectedOrder.outboundDate)}</strong></div><div><span>付款時間</span><strong>{selectedOrder.paidAt ? formatDateTime(selectedOrder.paidAt) : "—"}</strong></div></div>
                <div className="cy-op-subsection"><h3>出庫料件</h3><div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th className="num">數量</th><th>單位</th></tr></thead><tbody>{selectedOrder.parts.map((part) => <tr key={part.id}><td className="cy-mono">{part.componentItemNoSnapshot}</td><td>{part.componentItemNameSnapshot}</td><td className="num">{part.quantity}</td><td>{part.unitSnapshot}</td></tr>)}</tbody></table></div></div>
                {selectedOrder.receipt ? <div className="cy-op-subsection"><h3>入庫</h3>{selectedOrder.receipt.items.map((item) => <div className="cy-op-read-row" key={item.id}>{item.itemNoSnapshot} · {item.itemNameSnapshot} · {item.quantity} {item.unitSnapshot}{item.bomRecipeId ? ` · BOM #${item.bomRecipeId}` : ""}</div>)}</div> : null}
                {selectedOrder.pricing ? <div className="cy-op-subsection"><h3>計價</h3>{selectedOrder.pricing.items.map((item) => <div className="cy-op-read-row" key={item.id}>{item.itemNoSnapshot} · {item.quantity} {item.unitSnapshot} × {item.unitPrice} = {item.subtotal}</div>)}<div className="cy-op-total">總額 NT$ {selectedOrder.pricing.totalAmount}</div></div> : null}

                {selectedOrder.statusCode === "outbound" ? <div className="cy-op-subsection">
                  <h3>入庫資料</h3>
                  <p className="cy-out-hint">填好後按上方「確認入庫」。</p>
                  <div className="cy-out-receipt">
                    <select className="cy-op-input" value={receiptItemId ?? ""} disabled={busy} onChange={(event) => changeReceiptItem(Number(event.target.value) || null)}>
                      <option value="">選擇入庫成品</option>
                      {(lookups?.items ?? []).map((row) => <option key={row.id} value={row.id}>{row.itemNo} · {row.name}</option>)}
                    </select>
                    <select className="cy-op-input" value={receiptBomId ?? ""} disabled={busy} onChange={(event) => setReceiptBomId(Number(event.target.value) || null)}>
                      <option value="">不指定 BOM</option>
                      {receiptBoms.map((row) => <option key={row.id} value={row.id}>{row.recipeRef}</option>)}
                    </select>
                    <input className="cy-op-input" value={receiptQuantity} inputMode="decimal" disabled={busy} onChange={(event) => setReceiptQuantity(event.target.value)} placeholder="入庫數量" />
                    <input className="cy-op-input" value={receiptUnit} disabled={busy} onChange={(event) => setReceiptUnit(event.target.value)} placeholder="單位" />
                  </div>
                </div> : null}

              </div> : <MasterDetailEmpty title="尚未選擇代工單" hint="從左側清單選一張代工單，或按清單上方的「＋ 新增代工單」。" />}
            </section>
          </div>
        </>
      ) : null}

      {tab === "contractors" ? <ContractorWorkspace contractors={contractors} onChanged={() => setRefreshEpoch((value) => value + 1)}
        onEditingChange={setMasterEditing} notify={setMessage} reportError={reportError} /> : null}

      {tab === "boms" ? <BomWorkspace boms={boms} onChanged={() => setRefreshEpoch((value) => value + 1)}
        onEditingChange={setMasterEditing} notify={setMessage} reportError={reportError} /> : null}

      {tab === "stock" ? <section className="cy-op-panel">
        <div className="cy-op-panel-header"><div><h2>代工庫存</h2><p>依出庫、入庫紀錄即時計算的代工對象手上庫存。</p></div><select className="cy-op-input cy-out-stock-select" aria-label="代工對象" value={stockContractorId ?? ""} onChange={(event) => setStockContractorId(Number(event.target.value) || null)}><option value="">選擇代工對象</option>{contractors.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}</select></div>
        <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th className="num">目前庫存</th></tr></thead><tbody>{stockRows.map((row) => <tr key={row.itemId}><td className="cy-mono">{row.itemNo}</td><td>{row.itemName}</td><td className="num">{row.quantity}</td></tr>)}</tbody></table></div>
        {stockRows.length === 0 ? <p>目前沒有非零代工庫存。</p> : null}
      </section> : null}
    </div>
  );
}
