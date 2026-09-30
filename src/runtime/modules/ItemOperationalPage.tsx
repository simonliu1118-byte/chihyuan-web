import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ItemModuleLookups } from "../../../shared/business-lookups";
import type {
  ItemCostTaxMode,
  ItemDetail,
  ItemProfileInput,
  ItemSummary,
  ItemUnitConversionInput,
} from "../../../shared/item";
import { ApiClientError } from "../../api/client";
import {
  changeItemNumber as changeItemNumberRequest,
  createItem,
  loadItemDetail,
  loadItemLookups,
  loadItemNumberHistory,
  searchItems,
  updateItem,
} from "../api/item-runtime-client";
import "./item-operational.css";

interface ItemDraft {
  itemNo: string;
  name: string;
  spec: string;
  itemCategoryId: number | null;
  baseUnit: string;
  isActive: boolean;
  cost: string;
  costTaxMode: ItemCostTaxMode | null;
  storePrice: string;
  clinicPrice: string;
  notes: string;
  unitConversions: ItemUnitConversionInput[];
}

const taxModeText: Record<ItemCostTaxMode, string> = {
  none: "未指定",
  inclusive: "含稅",
  exclusive: "未稅",
};

function activeCategoryId(lookups: ItemModuleLookups | null): number | null {
  return lookups?.itemCategories.find((row) => row.isActive)?.id ?? null;
}

function newDraft(lookups: ItemModuleLookups | null): ItemDraft {
  return {
    itemNo: "",
    name: "",
    spec: "",
    itemCategoryId: activeCategoryId(lookups),
    baseUnit: "個",
    isActive: true,
    cost: "",
    costTaxMode: null,
    storePrice: "",
    clinicPrice: "",
    notes: "",
    unitConversions: [],
  };
}

function draftFromDetail(item: ItemDetail): ItemDraft {
  return {
    itemNo: item.itemNo,
    name: item.name,
    spec: item.spec ?? "",
    itemCategoryId: item.category?.id ?? null,
    baseUnit: item.baseUnit,
    isActive: item.isActive,
    cost: item.cost ?? "",
    costTaxMode: item.costTaxMode,
    storePrice: item.storePrice ?? "",
    clinicPrice: item.clinicPrice ?? "",
    notes: item.notes ?? "",
    unitConversions: item.unitConversions.map((row) => ({
      fromUnit: row.fromUnit,
      quantity: row.quantity,
      toUnit: row.toUnit,
      sortOrder: row.sortOrder,
    })),
  };
}

function profileFromDraft(draft: ItemDraft): ItemProfileInput {
  return {
    name: draft.name.trim(),
    spec: draft.spec.trim() || null,
    baseUnit: draft.baseUnit.trim(),
    itemCategoryId: draft.itemCategoryId,
    cost: draft.cost.trim() || null,
    costTaxMode: draft.costTaxMode,
    storePrice: draft.storePrice.trim() || null,
    clinicPrice: draft.clinicPrice.trim() || null,
    notes: draft.notes.trim() || null,
    isActive: draft.isActive,
    unitConversions: draft.unitConversions.map((row, index) => ({
      fromUnit: row.fromUnit.trim(),
      quantity: row.quantity.trim(),
      toUnit: row.toUnit.trim(),
      sortOrder: row.sortOrder ?? index,
    })),
  };
}

function profileFromDetail(item: ItemDetail, isActive = item.isActive): ItemProfileInput {
  return {
    name: item.name,
    spec: item.spec,
    baseUnit: item.baseUnit,
    itemCategoryId: item.category?.id ?? null,
    cost: item.cost,
    costTaxMode: item.costTaxMode,
    storePrice: item.storePrice,
    clinicPrice: item.clinicPrice,
    notes: item.notes,
    isActive,
    unitConversions: item.unitConversions.map((row) => ({
      fromUnit: row.fromUnit,
      quantity: row.quantity,
      toUnit: row.toUnit,
      sortOrder: row.sortOrder,
    })),
  };
}

function validateConversions(baseUnit: string, conversions: readonly ItemUnitConversionInput[]): string | null {
  const base = baseUnit.trim();
  const byFrom = new Map<string, ItemUnitConversionInput>();

  for (const row of conversions) {
    const from = row.fromUnit.trim();
    const to = row.toUnit.trim();
    const quantity = Number(row.quantity);
    if (!from || !to || !Number.isFinite(quantity) || quantity <= 0) {
      return "每筆換算都必須有來源單位、正數數量與目標單位。";
    }
    if (from === base) return `基準單位「${base}」不能再作為換算來源。`;
    if (byFrom.has(from)) return `來源單位「${from}」不可重複設定。`;
    byFrom.set(from, { ...row, fromUnit: from, toUnit: to });
  }

  for (const start of byFrom.keys()) {
    const seen = new Set<string>();
    let current = start;
    while (current !== base) {
      if (seen.has(current)) return `單位換算形成循環：${start}`;
      seen.add(current);
      const edge = byFrom.get(current);
      if (!edge) return `單位「${start}」的換算路徑無法到達基準單位「${base}」。`;
      current = edge.toUnit;
    }
  }

  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code.includes("REVISION_CONFLICT")) return "資料已被其他人修改，請重新載入後再操作。";
    if (error.code === "ACCESS_DENIED") return "你目前沒有商品模組使用權。";
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") return "登入狀態已失效，請重新登入。";
    const fieldMessage = error.fields ? Object.values(error.fields)[0] : null;
    return fieldMessage || error.message || error.code;
  }
  return "目前無法完成商品資料操作。";
}

function categoryName(item: ItemSummary): string {
  return item.category?.name ?? "未分類";
}

export function ItemOperationalPage() {
  const [lookups, setLookups] = useState<ItemModuleLookups | null>(null);
  const [rows, setRows] = useState<readonly ItemSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ItemDetail | null>(null);
  const [numberHistory, setNumberHistory] = useState<Awaited<ReturnType<typeof loadItemNumberHistory>>>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadItemLookups()
      .then((value) => {
        if (!cancelled) setLookups(value);
      })
      .catch((error) => {
        if (!cancelled) setMessage(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      const itemCategoryId = categoryFilter ? Number(categoryFilter) : undefined;
      const isActive = activeFilter === "active" ? true : activeFilter === "inactive" ? false : undefined;
      void searchItems({
        q: query.trim() || undefined,
        itemCategoryId: Number.isSafeInteger(itemCategoryId) && (itemCategoryId ?? 0) > 0 ? itemCategoryId : undefined,
        isActive,
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
  }, [query, categoryFilter, activeFilter, refreshEpoch, editing, creating]);

  useEffect(() => {
    if (selectedId == null || creating) {
      setSelected(null);
      setNumberHistory([]);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    void Promise.all([
      loadItemDetail(selectedId),
      loadItemNumberHistory(selectedId, 100),
    ])
      .then(([detail, history]) => {
        if (cancelled) return;
        setSelected(detail);
        setNumberHistory(history);
      })
      .catch((error) => {
        if (!cancelled) {
          setSelected(null);
          setNumberHistory([]);
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

  const categories = useMemo(
    () => lookups?.itemCategories ?? [],
    [lookups],
  );

  function selectItem(id: number) {
    if (editing && !window.confirm("目前商品有尚未儲存修改，確定放棄？")) return;
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
    setMessage(null);
  }

  function startEdit() {
    if (!selected) return;
    setCreating(false);
    setEditing(true);
    setDraft(draftFromDetail(selected));
    setMessage(null);
  }

  function patch(patchValue: Partial<ItemDraft>) {
    setDraft((current) => current ? { ...current, ...patchValue } : current);
  }

  function cancelEdit() {
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
    setMessage(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.itemNo.trim() || !draft.name.trim() || !draft.baseUnit.trim()) return;

    const conversions = draft.unitConversions.filter((row) => (
      row.fromUnit.trim() || row.toUnit.trim() || row.quantity.trim()
    ));
    const conversionError = validateConversions(draft.baseUnit, conversions);
    if (conversionError) {
      setMessage(conversionError);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const profile = { ...profileFromDraft({ ...draft, unitConversions: conversions }) };
      const saved = creating
        ? await createItem({ itemNo: draft.itemNo.trim(), ...profile })
        : selected
          ? await updateItem(selected.id, { ...profile, expectedRevision: selected.revision })
          : null;
      if (!saved) return;
      setSelectedId(saved.id);
      setSelected(saved);
      setEditing(false);
      setCreating(false);
      setDraft(null);
      setMessage(creating ? "商品已新增。" : "商品已儲存。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) {
        setRefreshEpoch((value) => value + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  function addConversion() {
    if (!draft) return;
    const candidate = draft.unitConversions.length ? `單位${draft.unitConversions.length + 1}` : "箱";
    patch({
      unitConversions: [
        ...draft.unitConversions,
        { fromUnit: candidate, quantity: "1", toUnit: draft.baseUnit, sortOrder: draft.unitConversions.length },
      ],
    });
  }

  function updateConversion(index: number, field: "fromUnit" | "quantity" | "toUnit", value: string) {
    if (!draft) return;
    patch({
      unitConversions: draft.unitConversions.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      )),
    });
  }

  async function changeItemNumber() {
    if (!selected || busy) return;
    const raw = window.prompt("輸入新的 SMART ERP 品號", selected.itemNo);
    if (raw == null) return;
    const next = raw.trim();
    if (!next || next === selected.itemNo) return;
    const reason = window.prompt("品號更正／變更來源", "SMART ERP 品號更正");
    if (reason == null) return;
    if (!window.confirm(`確定將 ${selected.itemNo} 改為 ${next}？舊品號會保留並可搜尋。`)) return;

    setBusy(true);
    setMessage(null);
    try {
      const saved = await changeItemNumberRequest(selected.id, {
        newItemNo: next,
        expectedRevision: selected.revision,
        changeSource: reason.trim() || null,
      });
      setSelected(saved);
      setMessage("品號已更新，舊品號已保留於歷史。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!selected || busy) return;
    const action = selected.isActive ? "停用" : "啟用";
    if (!window.confirm(`確定${action}商品「${selected.itemNo} · ${selected.name}」？`)) return;

    setBusy(true);
    setMessage(null);
    try {
      const saved = await updateItem(selected.id, {
        ...profileFromDetail(selected, !selected.isActive),
        expectedRevision: selected.revision,
      });
      setSelected(saved);
      setMessage(`商品已${action}。`);
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return <div className="cy-item-op">
    <div className="cy-op-page-header">
      <div>
        <h1>商品</h1>
        <p>商品資料直接由 CY Web Worker / D1 讀寫；品號更正、revision 與單位換算由伺服器權威驗證。</p>
      </div>
      <div className="cy-op-page-actions"><button className="cy-op-button primary" disabled={busy} onClick={startCreate}>新增商品</button></div>
    </div>

    {message ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-body">{message}</div></div> : null}

    <div className="cy-item-workspace">
      <section className="cy-op-panel cy-item-list-pane">
        <div className="cy-item-search">
          <input className="cy-op-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋現行／歷史品號、名稱、規格" />
          <div className="cy-item-filters">
            <select className="cy-op-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">全部分類</option>
              {categories.map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}
            </select>
            <select className="cy-op-input" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
              <option value="">全部狀態</option>
              <option value="active">使用中</option>
              <option value="inactive">已停用</option>
            </select>
          </div>
          <div className="cy-item-count">{loadingList ? "讀取商品中…" : `搜尋結果 ${rows.length} 筆`}</div>
        </div>
        <div className="cy-op-list">
          {rows.map((row) => (
            <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => selectItem(row.id)}>
              <strong>{row.itemNo} · {row.name}</strong>
              <span>{row.spec ?? "無規格"} · {row.baseUnit}</span>
              <small>{row.isActive ? categoryName(row) : "已停用"}</small>
            </button>
          ))}
          {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的商品。</div> : null}
        </div>
      </section>

      <section className="cy-op-panel cy-item-detail-pane">
        {editing && draft ? (
          <form className="cy-op-form" onSubmit={(event) => void save(event)}>
            <div className="cy-op-panel-header">
              <div>
                <h2>{creating ? "新增商品" : `修改 ${selected?.itemNo ?? "商品"}`}</h2>
                <p>{creating ? "品號必須是既有 SMART ERP 品號" : "既有品號需使用「更改品號」受控動作"}</p>
              </div>
              <div className="cy-item-inline-actions">
                <button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button>
                <button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
              </div>
            </div>
            <div className="cy-item-form-body">
              <div className="cy-op-form-grid">
                <label>品號<input className="cy-op-input" value={creating ? draft.itemNo : selected?.itemNo ?? draft.itemNo} disabled={!creating || busy} onChange={(event) => creating && patch({ itemNo: event.target.value })} required /></label>
                <label>名稱<input className="cy-op-input" value={draft.name} disabled={busy} onChange={(event) => patch({ name: event.target.value })} required /></label>
                <label>規格<input className="cy-op-input" value={draft.spec} disabled={busy} onChange={(event) => patch({ spec: event.target.value })} /></label>
                <label>分類<select className="cy-op-input" value={draft.itemCategoryId ?? ""} disabled={busy} onChange={(event) => patch({ itemCategoryId: event.target.value ? Number(event.target.value) : null })}><option value="">未分類</option>{categories.filter((row) => row.isActive || row.id === draft.itemCategoryId).map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}</select></label>
                <label>基準單位<input className="cy-op-input" value={draft.baseUnit} disabled={busy} onChange={(event) => patch({ baseUnit: event.target.value })} required /></label>
                <label>成本<input className="cy-op-input" inputMode="decimal" value={draft.cost} disabled={busy} onChange={(event) => patch({ cost: event.target.value })} /></label>
                <label>成本稅別<select className="cy-op-input" value={draft.costTaxMode ?? ""} disabled={busy} onChange={(event) => patch({ costTaxMode: (event.target.value || null) as ItemCostTaxMode | null })}><option value="">未指定</option><option value="inclusive">含稅</option><option value="exclusive">未稅</option><option value="none">無稅別</option></select></label>
                <label>門市價<input className="cy-op-input" inputMode="decimal" value={draft.storePrice} disabled={busy} onChange={(event) => patch({ storePrice: event.target.value })} /></label>
                <label>診所價<input className="cy-op-input" inputMode="decimal" value={draft.clinicPrice} disabled={busy} onChange={(event) => patch({ clinicPrice: event.target.value })} /></label>
                <label className="wide">備註<textarea className="cy-op-input" rows={3} value={draft.notes} disabled={busy} onChange={(event) => patch({ notes: event.target.value })} /></label>
              </div>

              <section className="cy-item-conversions">
                <div className="cy-item-section-head">
                  <div><h3>單位換算</h3><p>規則：1 來源單位 = 數量 × 目標單位；每條路徑最後必須到基準單位。</p></div>
                  <button type="button" className="cy-op-button" disabled={busy} onClick={addConversion}>＋ 增加換算</button>
                </div>
                {draft.unitConversions.map((row, index) => (
                  <div className="cy-item-conversion-row" key={`${index}-${row.fromUnit}`}>
                    <span>1</span>
                    <input className="cy-op-input" value={row.fromUnit} disabled={busy} onChange={(event) => updateConversion(index, "fromUnit", event.target.value)} />
                    <span>=</span>
                    <input className="cy-op-input" inputMode="decimal" value={row.quantity} disabled={busy} onChange={(event) => updateConversion(index, "quantity", event.target.value)} />
                    <input className="cy-op-input" value={row.toUnit} disabled={busy} onChange={(event) => updateConversion(index, "toUnit", event.target.value)} />
                    <button type="button" className="cy-op-button danger" disabled={busy} onClick={() => patch({ unitConversions: draft.unitConversions.filter((_, rowIndex) => rowIndex !== index) })}>移除</button>
                  </div>
                ))}
                {draft.unitConversions.length === 0 ? <p className="cy-item-muted">目前僅使用基準單位。</p> : null}
              </section>
            </div>
            <div className="cy-op-form-footer">
              <button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button>
              <button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
            </div>
          </form>
        ) : loadingDetail ? (
          <div className="cy-op-empty">正在讀取商品明細…</div>
        ) : selected ? (
          <div>
            <div className="cy-op-panel-header cy-item-detail-header">
              <div><h2>{selected.itemNo} · {selected.name}</h2><p>{selected.spec ?? "無規格"} · rev.{selected.revision}</p></div>
              <div className="cy-item-action-stack">
                <button className="cy-op-button primary" disabled={busy} onClick={startEdit}>修改</button>
                <button className="cy-op-button" disabled={busy} onClick={() => void changeItemNumber()}>更改品號</button>
                <button className={`cy-op-button ${selected.isActive ? "danger" : ""}`} disabled={busy} onClick={() => void toggleActive()}>{selected.isActive ? "停用" : "啟用"}</button>
              </div>
            </div>
            <div className="cy-item-detail-body">
              <div className="cy-item-info-grid">
                <Info label="分類" value={selected.category?.name ?? null} />
                <Info label="基準單位" value={selected.baseUnit} />
                <Info label="成本" value={selected.cost} />
                <Info label="成本稅別" value={selected.costTaxMode ? taxModeText[selected.costTaxMode] : null} />
                <Info label="門市價" value={selected.storePrice} />
                <Info label="診所價" value={selected.clinicPrice} />
                <Info label="狀態" value={selected.isActive ? "使用中" : "已停用"} />
                <div className="wide"><Info label="備註" value={selected.notes} /></div>
              </div>
              <section className="cy-item-section">
                <h3>單位換算</h3>
                {selected.unitConversions.length
                  ? selected.unitConversions.map((row) => <div className="cy-item-read-row" key={row.id}>1 {row.fromUnit} = {row.quantity} {row.toUnit}</div>)
                  : <p className="cy-item-muted">目前僅使用基準單位。</p>}
              </section>
              <section className="cy-item-section">
                <h3>歷史品號</h3>
                {numberHistory.length
                  ? numberHistory.map((row) => <div className="cy-item-history-row" key={row.id}><strong>{row.itemNo}</strong><span>{row.changeSource ?? "未註明原因"} · 至 {new Date(row.validTo ?? row.createdAt).toLocaleString()}</span></div>)
                  : <p className="cy-item-muted">尚無品號變更紀錄。</p>}
              </section>
            </div>
          </div>
        ) : (
          <div className="cy-op-empty">請選擇商品，或新增一筆。</div>
        )}
      </section>
    </div>
  </div>;
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="cy-item-info"><span>{label}</span><strong>{value || "—"}</strong></div>;
}
