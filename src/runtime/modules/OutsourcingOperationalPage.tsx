import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { OutsourcingModuleLookups, OutsourcingItemOption } from "../../../shared/business-lookups";
import type {
  BomDetail,
  BomSummary,
  ContractorDetail,
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
  loadBomDetail,
  loadContractorDetail,
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
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

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 409 || error.code.includes("REVISION_CONFLICT")) return "資料已被其他人修改，請重新載入後再操作。";
    if (error.status === 403) return "你目前沒有執行此代工操作的權限。";
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") return "登入狀態已失效，請重新登入。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "身分服務暫時無法使用，請稍後再試。";
    const field = error.fields ? Object.values(error.fields)[0] : null;
    return field || error.message || error.code;
  }
  return "目前無法完成委外／代工操作。";
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
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OutsourcingDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [correctingOutbound, setCorrectingOutbound] = useState(false);
  const [draft, setDraft] = useState<OrderDraft | null>(null);

  const [contractors, setContractors] = useState<readonly ContractorSummary[]>([]);
  const [selectedContractorId, setSelectedContractorId] = useState<number | null>(null);
  const [selectedContractor, setSelectedContractor] = useState<ContractorDetail | null>(null);

  const [boms, setBoms] = useState<readonly BomSummary[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<number | null>(null);
  const [selectedBom, setSelectedBom] = useState<BomDetail | null>(null);

  const [stockContractorId, setStockContractorId] = useState<number | null>(null);
  const [stockRows, setStockRows] = useState<readonly ContractorStockBalance[]>([]);

  const [receiptItemId, setReceiptItemId] = useState<number | null>(null);
  const [receiptBomId, setReceiptBomId] = useState<number | null>(null);
  const [receiptQuantity, setReceiptQuantity] = useState("1");
  const [receiptUnit, setReceiptUnit] = useState("");

  const [busy, setBusy] = useState(false);
  useUnsavedChangesGuard({ active: editing, blocked: busy });
  const [message, setMessage] = useState<string | null>(null);
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
        .catch((error) => { if (!cancelled) setMessage(errorMessage(error)); });
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
        setSelectedContractorId((current) => current ?? contractorResult.items[0]?.id ?? null);
        setStockContractorId((current) => current ?? contractorResult.items[0]?.id ?? null);
        setSelectedBomId((current) => current ?? bomResult.items[0]?.id ?? null);
        if (receiptItemId == null) {
          const activeBom = bomResult.items.find((row) => row.isActive);
          if (activeBom) {
            setReceiptItemId(activeBom.finishedItemId);
            setReceiptBomId(activeBom.id);
            setReceiptUnit(activeBom.outputUnit);
          }
        }
      })
      .catch((error) => { if (!cancelled) setMessage(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [refreshEpoch]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchOutsourcingOrders({
        q: orderQuery.trim() || undefined,
        statusCode: orderStatus ? orderStatus as OutsourcingStatusCode : undefined,
        limit: 100,
      })
        .then((result) => {
          if (cancelled) return;
          setOrders(result.items);
          if (!editing) {
            setSelectedOrderId((current) => (
              current != null && result.items.some((row) => row.id === current)
                ? current
                : result.items[0]?.id ?? null
            ));
          }
        })
        .catch((error) => { if (!cancelled) setMessage(errorMessage(error)); });
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
      .catch((error) => { if (!cancelled) setMessage(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [selectedOrderId, creating, refreshEpoch]);

  useEffect(() => {
    if (selectedContractorId == null) {
      setSelectedContractor(null);
      return;
    }
    let cancelled = false;
    void loadContractorDetail(selectedContractorId)
      .then((detail) => { if (!cancelled) setSelectedContractor(detail); })
      .catch((error) => { if (!cancelled) setMessage(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [selectedContractorId, refreshEpoch]);

  useEffect(() => {
    if (selectedBomId == null) {
      setSelectedBom(null);
      return;
    }
    let cancelled = false;
    void loadBomDetail(selectedBomId)
      .then((detail) => { if (!cancelled) setSelectedBom(detail); })
      .catch((error) => { if (!cancelled) setMessage(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [selectedBomId, refreshEpoch]);

  useEffect(() => {
    if (stockContractorId == null || tab !== "stock") {
      if (stockContractorId == null) setStockRows([]);
      return;
    }
    let cancelled = false;
    void loadContractorStock(stockContractorId)
      .then((rows) => { if (!cancelled) setStockRows(rows); })
      .catch((error) => { if (!cancelled) setMessage(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [stockContractorId, tab, refreshEpoch]);

  function activeItem(itemId: number | null): OutsourcingItemOption | undefined {
    return lookups?.items.find((row) => row.id === itemId);
  }

  function startCreate() {
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

  function cancelEdit() {
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
    if (!draft || !lookups || !draft.contractorId || busy) return;
    if (draft.parts.some((part) => !part.componentItemId || !part.quantity.trim() || !part.unit.trim())) return;

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

    setBusy(true);
    setMessage(null);
    try {
      let saved: OutsourcingDetail;
      let success: string;
      if (creating) {
        saved = await createOutsourcingOrder(profile);
        success = "代工單已建立。";
      } else if (selectedOrder && correctingOutbound) {
        const reason = window.prompt("請輸入此次出庫更正原因", "出庫資料更正");
        if (reason == null || !reason.trim()) return;
        saved = await correctOutsourcingOutbound(selectedOrder.id, {
          ...profile,
          expectedRevision: selectedOrder.revision,
          reason: reason.trim(),
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
      setMessage(errorMessage(error));
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
      setMessage(errorMessage(error));
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
    const reason = window.prompt("請輸入取消／反向操作原因", "");
    if (reason == null || !reason.trim()) return;
    const input = { expectedRevision: selectedOrder.revision, reason: reason.trim() };
    if (action === "payment") await runAction(() => cancelOutsourcingPayment(selectedOrder.id, input), "付款狀態已取消。");
    if (action === "pricing") await runAction(() => cancelOutsourcingPricing(selectedOrder.id, input), "計價已取消，回到已入庫。");
    if (action === "receipt") await runAction(() => cancelOutsourcingReceipt(selectedOrder.id, input), "入庫已取消，相關消耗 movement 已反轉。");
    if (action === "outbound") await runAction(() => cancelOutsourcingOutbound(selectedOrder.id, input), "出庫已取消並作廢，相關 movement 已反轉。");
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
    if (!window.confirm(`確定永久刪除尚未出庫的 ${selectedOrder.outsourcingRef}？伺服器仍會重新確認目前角色權限。`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteOutsourcingPending(selectedOrder.id, selectedOrder.revision);
      setSelectedOrder(null);
      setSelectedOrderId(null);
      setMessage("待出庫代工單已刪除。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const receiptBoms = boms.filter((row) => row.isActive && row.finishedItemId === receiptItemId);

  return (
    <div className="cy-outsourcing-op">
      <div className="cy-op-page-header">
        <div><h1>委外／代工</h1><p>管理代工單、材料清單、代工單價與庫存。</p></div>
        {tab === "orders" ? <div className="cy-op-page-actions"><button className="cy-op-button primary" disabled={busy} onClick={startCreate}>新增代工單</button></div> : null}
      </div>
      {message ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-body">{message}</div></div> : null}

      <div className="cy-op-tabs">
        {(["orders", "contractors", "boms", "stock"] as Tab[]).map((value) => (
          <button className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>
            {value === "orders" ? "代工單" : value === "contractors" ? "代工對象／單價" : value === "boms" ? "BOM" : "代工庫存"}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        <>
          {editing && draft ? (
            <section className="cy-op-panel cy-op-form-card">
              <form onSubmit={(event) => void saveOrder(event)}>
                <div className="cy-op-panel-header">
                  <div><h2>{creating ? "新增代工單" : correctingOutbound ? "更正已確認出庫" : "修改待出庫代工單"}</h2><p>{correctingOutbound ? "伺服器會反轉舊 movement 並建立新 movement。" : "確認出庫前才是一般可編輯資料。"}</p></div>
                  <button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button>
                </div>
                <div className="cy-op-form-grid">
                  <label>代工對象
                    <select className="cy-op-input" value={draft.contractorId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, contractorId: Number(event.target.value) || null })}>
                      <option value="">請選擇</option>
                      {contractors.map((row) => <option key={row.id} value={row.id}>{row.displayName}{row.isActive ? "" : "（已停用）"}</option>)}
                    </select>
                  </label>
                  <label>工單日期<input className="cy-op-input" type="date" value={draft.orderDate} disabled={busy} onChange={(event) => setDraft({ ...draft, orderDate: event.target.value })} /></label>
                  <label>商品搜尋<input className="cy-op-input" value={itemQuery} disabled={busy} onChange={(event) => setItemQuery(event.target.value)} placeholder="品號／品名／規格" /></label>
                </div>

                <div className="cy-op-subsection">
                  <div className="cy-op-panel-header"><h3>預計出庫料件</h3><button type="button" className="cy-op-button" disabled={busy} onClick={addPart}>增加料件</button></div>
                  {draft.parts.map((part, index) => {
                    const component = activeItem(part.componentItemId);
                    const units = component?.allowedUnits?.length ? component.allowedUnits : (part.unit ? [part.unit] : []);
                    return <div className="cy-op-inline-row" key={part.key}>
                      <select className="cy-op-input" value={part.componentItemId ?? ""} disabled={busy} onChange={(event) => changeComponent(index, Number(event.target.value) || null)}>
                        <option value="">料件商品</option>
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
                      <button type="button" className="cy-op-button danger" disabled={busy || draft.parts.length <= 1} onClick={() => removePart(index)}>移除</button>
                    </div>;
                  })}
                </div>
                <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button><button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button></div>
              </form>
            </section>
          ) : null}

          <div className="cy-op-split">
            <section className="cy-op-panel cy-op-list-panel">
              <input className="cy-op-input" value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="搜尋代工單／代工對象" />
              <select className="cy-op-input" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)}>
                <option value="">全部狀態</option>
                {Object.entries(statusText).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <div className="cy-op-list">
                {orders.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedOrderId === row.id ? "active" : ""}`} onClick={() => { if (!editing || window.confirm("放棄尚未儲存的修改？")) { setEditing(false); setCreating(false); setDraft(null); setSelectedOrderId(row.id); } }}><strong>{row.outsourcingRef}</strong><span>{row.contractorNameSnapshot}</span><small>{statusText[row.statusCode]} · {row.orderDate}</small></button>)}
                {orders.length === 0 ? <div className="cy-op-empty">尚無代工單。</div> : null}
              </div>
            </section>

            <section className="cy-op-panel">
              {selectedOrder ? <div>
                <div className="cy-op-panel-header"><div><h2>{selectedOrder.outsourcingRef}</h2><p>{selectedOrder.contractorNameSnapshot} · rev.{selectedOrder.revision}</p></div><span className="cy-op-badge">{statusText[selectedOrder.statusCode]}</span></div>
                <div className="cy-op-detail-grid"><div><span>工單日期</span><strong>{selectedOrder.orderDate}</strong></div><div><span>出庫日期</span><strong>{selectedOrder.outboundDate ?? "—"}</strong></div><div><span>付款時間</span><strong>{selectedOrder.paidAt ?? "—"}</strong></div><div><span>操作人員 ID</span><strong>{selectedOrder.operatorEmployeeId}</strong></div></div>
                <div className="cy-op-subsection"><h3>出庫料件</h3><table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th>數量</th><th>單位</th></tr></thead><tbody>{selectedOrder.parts.map((part) => <tr key={part.id}><td>{part.componentItemNoSnapshot}</td><td>{part.componentItemNameSnapshot}</td><td>{part.quantity}</td><td>{part.unitSnapshot}</td></tr>)}</tbody></table></div>
                {selectedOrder.receipt ? <div className="cy-op-subsection"><h3>入庫</h3>{selectedOrder.receipt.items.map((item) => <div className="cy-op-read-row" key={item.id}>{item.itemNoSnapshot} · {item.itemNameSnapshot} · {item.quantity} {item.unitSnapshot}{item.bomRecipeId ? ` · BOM #${item.bomRecipeId}` : ""}</div>)}</div> : null}
                {selectedOrder.pricing ? <div className="cy-op-subsection"><h3>計價</h3>{selectedOrder.pricing.items.map((item) => <div className="cy-op-read-row" key={item.id}>{item.itemNoSnapshot} · {item.quantity} {item.unitSnapshot} × {item.unitPrice} = {item.subtotal}</div>)}<div className="cy-op-total">總額：NT$ {selectedOrder.pricing.totalAmount}</div></div> : null}

                {selectedOrder.statusCode === "outbound" ? <div className="cy-op-subsection">
                  <h3>入庫資料</h3>
                  <div className="cy-op-inline-row">
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

                <div className="cy-op-action-bar">
                  {selectedOrder.statusCode === "pending_outbound" ? <>
                    <button className="cy-op-button" disabled={busy} onClick={() => startEdit("pending")}>修改</button>
                    <button className="cy-op-button primary" disabled={busy} onClick={() => void confirmOutbound()}>確認出庫</button>
                    <button className="cy-op-button danger" disabled={busy} onClick={() => void deletePending()}>刪除</button>
                  </> : null}
                  {selectedOrder.statusCode === "outbound" ? <>
                    <button className="cy-op-button" disabled={busy} onClick={() => startEdit("correct-outbound")}>更正出庫</button>
                    <button className="cy-op-button primary" disabled={busy} onClick={() => void receive()}>確認入庫</button>
                    <button className="cy-op-button danger" disabled={busy} onClick={() => void reverse("outbound")}>取消出庫</button>
                  </> : null}
                  {selectedOrder.statusCode === "received" ? <>
                    <button className="cy-op-button primary" disabled={busy} onClick={() => void price()}>計價</button>
                    <button className="cy-op-button danger" disabled={busy} onClick={() => void reverse("receipt")}>取消入庫</button>
                  </> : null}
                  {selectedOrder.statusCode === "priced" ? <>
                    <button className="cy-op-button primary" disabled={busy} onClick={() => void pay()}>確認付款</button>
                    <button className="cy-op-button danger" disabled={busy} onClick={() => void reverse("pricing")}>取消計價</button>
                  </> : null}
                  {selectedOrder.statusCode === "paid" ? <button className="cy-op-button danger" disabled={busy} onClick={() => void reverse("payment")}>取消付款</button> : null}
                </div>
              </div> : <div className="cy-op-empty">請選擇代工單。</div>}
            </section>
          </div>
        </>
      ) : null}

      {tab === "contractors" ? <div className="cy-op-split">
        <section className="cy-op-panel cy-op-list-panel"><div className="cy-op-list">{contractors.map((row) => <button className={`cy-op-list-row ${selectedContractorId === row.id ? "active" : ""}`} key={row.id} onClick={() => setSelectedContractorId(row.id)}><strong>{row.displayName}</strong><span>{row.phone ?? "—"}</span><small>{row.isActive ? "使用中" : "停用"} · rev.{row.revision}</small></button>)}</div></section>
        <section className="cy-op-panel">{selectedContractor ? <div><div className="cy-op-panel-header"><div><h2>{selectedContractor.displayName}</h2><p>{selectedContractor.legalName ?? selectedContractor.entityType}</p></div><span className="cy-op-badge">{selectedContractor.isActive ? "使用中" : "停用"}</span></div><div className="cy-op-detail-grid"><div><span>統編</span><strong>{selectedContractor.taxId ?? "—"}</strong></div><div><span>電話</span><strong>{selectedContractor.phone ?? "—"}</strong></div><div><span>地址</span><strong>{selectedContractor.address ?? "—"}</strong></div></div><div className="cy-op-subsection"><h3>現行代工單價</h3><table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th>單價</th><th>單位</th></tr></thead><tbody>{selectedContractor.pricing.map((row) => <tr key={row.id}><td>{row.itemNo}</td><td>{row.itemName}</td><td>{row.unitPrice}</td><td>{row.pricingUnit}</td></tr>)}</tbody></table>{selectedContractor.pricing.length === 0 ? <p>尚未設定現行單價。</p> : null}</div></div> : <div className="cy-op-empty">請選擇代工對象。</div>}</section>
      </div> : null}

      {tab === "boms" ? <div className="cy-op-split">
        <section className="cy-op-panel cy-op-list-panel"><div className="cy-op-list">{boms.map((row) => <button className={`cy-op-list-row ${selectedBomId === row.id ? "active" : ""}`} key={row.id} onClick={() => setSelectedBomId(row.id)}><strong>{row.recipeRef}</strong><span>{row.finishedItemNo} · {row.finishedItemName}</span><small>{row.isActive ? "使用中" : "停用"} · rev.{row.revision}</small></button>)}</div></section>
        <section className="cy-op-panel">{selectedBom ? <div><div className="cy-op-panel-header"><div><h2>{selectedBom.recipeRef}</h2><p>{selectedBom.finishedItemNo} · {selectedBom.finishedItemName}</p></div><span className="cy-op-badge">{selectedBom.isActive ? "使用中" : "停用"}</span></div><div className="cy-op-detail-grid"><div><span>產出</span><strong>{selectedBom.outputQuantity} {selectedBom.outputUnit}</strong></div></div><div className="cy-op-subsection"><h3>BOM 組成</h3><table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th>數量</th><th>單位</th></tr></thead><tbody>{selectedBom.components.map((row) => <tr key={row.id}><td>{row.itemNo}</td><td>{row.itemName}</td><td>{row.quantity}</td><td>{row.unit}</td></tr>)}</tbody></table></div></div> : <div className="cy-op-empty">請選擇 BOM。</div>}</section>
      </div> : null}

      {tab === "stock" ? <section className="cy-op-panel">
        <div className="cy-op-panel-header"><div><h2>代工庫存</h2><p>由 contractor_stock_movements 即時計算，不保存第二份可變餘額。</p></div><select className="cy-op-input" value={stockContractorId ?? ""} onChange={(event) => setStockContractorId(Number(event.target.value) || null)}><option value="">選擇代工對象</option>{contractors.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}</select></div>
        <table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th>目前庫存</th></tr></thead><tbody>{stockRows.map((row) => <tr key={row.itemId}><td>{row.itemNo}</td><td>{row.itemName}</td><td>{row.quantity}</td></tr>)}</tbody></table>
        {stockRows.length === 0 ? <p>目前沒有非零代工庫存。</p> : null}
      </section> : null}
    </div>
  );
}
