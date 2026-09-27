import { FormEvent, useMemo, useState } from "react";
import type { LocalItemCostTaxMode } from "../advanced-local-types";
import {
  mutateLocalDatabase,
  nextLocalId,
  timestampNow,
  type LocalItem,
  type LocalUnitConversion,
  useLocalDatabase,
} from "../local-database";
import "./item-operational.css";

type ItemDraft = Omit<LocalItem, "id" | "revision" | "updatedAt"> & { id?: number };

const taxModeText: Record<LocalItemCostTaxMode, string> = {
  none: "未指定",
  inclusive: "含稅",
  exclusive: "未稅",
};

function newDraft(database: ReturnType<typeof useLocalDatabase>): ItemDraft {
  return {
    itemNo: "",
    name: "",
    spec: null,
    category: database.settings.itemCategories[0] ?? "其他",
    baseUnit: "個",
    isActive: true,
    conversions: [],
    cost: null,
    costTaxMode: null,
    storePrice: null,
    clinicPrice: null,
    notes: null,
    numberHistory: [],
  };
}

function validateConversions(baseUnit: string, conversions: LocalUnitConversion[]): string | null {
  const byFrom = new Map<string, LocalUnitConversion>();
  for (const row of conversions) {
    const from = row.fromUnit.trim();
    const to = row.toUnit.trim();
    if (!from || !to || row.quantity <= 0) return "每筆換算都必須有來源單位、正數數量與目標單位。";
    if (from === baseUnit) return `基準單位「${baseUnit}」不能再作為換算來源。`;
    if (byFrom.has(from)) return `來源單位「${from}」不可重複設定。`;
    byFrom.set(from, { ...row, fromUnit: from, toUnit: to });
  }
  for (const start of byFrom.keys()) {
    const seen = new Set<string>();
    let current = start;
    while (current !== baseUnit) {
      if (seen.has(current)) return `單位換算形成循環：${start}`;
      seen.add(current);
      const edge = byFrom.get(current);
      if (!edge) return `單位「${start}」的換算路徑無法到達基準單位「${baseUnit}」。`;
      current = edge.toUnit;
    }
  }
  return null;
}

function nullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function ItemOperationalPage() {
  const database = useLocalDatabase();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(database.items[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ItemDraft | null>(null);

  const selected = database.items.find((row) => row.id === selectedId) ?? null;
  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return database.items.filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (activeFilter === "active" && !row.isActive) return false;
      if (activeFilter === "inactive" && row.isActive) return false;
      if (!keyword) return true;
      return [row.itemNo, row.name, row.spec, row.category, ...(row.numberHistory ?? []).filter((history) => history.isSearchable).map((history) => history.itemNo)]
        .some((value) => value?.toLowerCase().includes(keyword));
    });
  }, [database.items, query, categoryFilter, activeFilter]);

  function selectItem(id: number) {
    if (editing && !window.confirm("目前商品有尚未儲存修改，確定放棄？")) return;
    setSelectedId(id);
    setEditing(false);
    setCreating(false);
    setDraft(null);
  }

  function startCreate() {
    if (editing && !window.confirm("放棄目前尚未儲存的修改？")) return;
    setSelectedId(null);
    setCreating(true);
    setEditing(true);
    setDraft(newDraft(database));
  }

  function startEdit() {
    if (!selected) return;
    setCreating(false);
    setEditing(true);
    setDraft({ ...selected, conversions: selected.conversions.map((row) => ({ ...row })), numberHistory: (selected.numberHistory ?? []).map((row) => ({ ...row })) });
  }

  function patch(patchValue: Partial<ItemDraft>) {
    setDraft((current) => current ? { ...current, ...patchValue } : current);
  }

  function cancelEdit() {
    setEditing(false);
    setCreating(false);
    setDraft(null);
    if (selectedId == null) setSelectedId(rows[0]?.id ?? null);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.itemNo.trim() || !draft.name.trim() || !draft.baseUnit.trim()) return;
    const itemNo = creating ? draft.itemNo.trim() : selected?.itemNo ?? draft.itemNo.trim();
    if (creating && database.items.some((row) => row.itemNo === itemNo || (row.numberHistory ?? []).some((history) => history.itemNo === itemNo && history.isSearchable))) {
      window.alert("品號與現行／歷史品號重複。");
      return;
    }
    const conversions = draft.conversions
      .filter((row) => row.fromUnit.trim() || row.toUnit.trim() || row.quantity > 0)
      .map((row) => ({ ...row, fromUnit: row.fromUnit.trim(), toUnit: row.toUnit.trim() }));
    const conversionError = validateConversions(draft.baseUnit.trim(), conversions);
    if (conversionError) {
      window.alert(conversionError);
      return;
    }
    let savedId = selected?.id ?? 0;
    mutateLocalDatabase(creating ? "item.created" : "item.updated", `${creating ? "新增" : "修改"}商品：${itemNo}`, (db) => {
      const payload = {
        itemNo,
        name: draft.name.trim(),
        spec: draft.spec?.trim() || null,
        category: draft.category || "其他",
        baseUnit: draft.baseUnit.trim(),
        isActive: draft.isActive,
        conversions,
        cost: draft.cost ?? null,
        costTaxMode: draft.costTaxMode ?? null,
        storePrice: draft.storePrice ?? null,
        clinicPrice: draft.clinicPrice ?? null,
        notes: draft.notes?.trim() || null,
        numberHistory: draft.numberHistory ?? [],
      };
      if (creating) {
        savedId = nextLocalId(db);
        db.items.unshift({ id: savedId, ...payload, revision: 1, updatedAt: timestampNow() });
      } else if (selected) {
        const row = db.items.find((item) => item.id === selected.id);
        if (!row) return;
        Object.assign(row, payload, { itemNo: row.itemNo, revision: row.revision + 1, updatedAt: timestampNow() });
        savedId = row.id;
      }
    });
    setSelectedId(savedId || selectedId);
    setEditing(false);
    setCreating(false);
    setDraft(null);
  }

  function addConversion() {
    if (!draft) return;
    const candidate = draft.conversions.length ? `單位${draft.conversions.length + 1}` : "箱";
    patch({ conversions: [...draft.conversions, { fromUnit: candidate, quantity: 1, toUnit: draft.baseUnit }] });
  }

  function updateConversion(index: number, field: keyof LocalUnitConversion, value: string) {
    if (!draft) return;
    patch({ conversions: draft.conversions.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: field === "quantity" ? Number(value) : value } : row) });
  }

  function changeItemNumber() {
    if (!selected) return;
    const raw = window.prompt("輸入新的 SMART ERP 品號", selected.itemNo);
    if (raw == null) return;
    const next = raw.trim();
    if (!next || next === selected.itemNo) return;
    if (database.items.some((row) => row.id !== selected.id && (row.itemNo === next || (row.numberHistory ?? []).some((history) => history.itemNo === next && history.isSearchable)))) {
      window.alert("新舊品號與其他商品的現行／歷史品號重複。");
      return;
    }
    const reason = window.prompt("品號更正／變更來源", "SMART ERP 品號更正");
    if (reason == null) return;
    if (!window.confirm(`確定將 ${selected.itemNo} 改為 ${next}？舊品號會保留並可搜尋。`)) return;
    mutateLocalDatabase("item.number.changed", `商品品號：${selected.itemNo} → ${next}${reason.trim() ? `（${reason.trim()}）` : ""}`, (db) => {
      const row = db.items.find((item) => item.id === selected.id);
      if (!row) return;
      row.numberHistory ??= [];
      row.numberHistory.unshift({
        id: nextLocalId(db), itemNo: row.itemNo, validFrom: row.updatedAt,
        validTo: timestampNow(), changeSource: reason.trim() || null,
        isSearchable: true, createdAt: timestampNow(),
      });
      row.itemNo = next;
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  function toggleActive() {
    if (!selected) return;
    mutateLocalDatabase("item.active.changed", `${selected.isActive ? "停用" : "啟用"}商品：${selected.itemNo}`, (db) => {
      const row = db.items.find((item) => item.id === selected.id);
      if (!row) return;
      row.isActive = !row.isActive;
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  const defectCount = selected ? (database.defects ?? []).filter((row) => row.itemId === selected.id && !row.invalidatedAt).length : 0;

  return <div className="cy-item-op">
    <div className="cy-op-page-header"><div><h1>商品</h1><p>正式操作商品主檔、價格、單位換算與受控品號更正；歷史舊品號仍可搜尋。</p></div><div className="cy-op-page-actions"><button className="cy-op-button primary" onClick={startCreate}>新增商品</button></div></div>
    <div className="cy-item-workspace">
      <section className="cy-op-panel cy-item-list-pane"><div className="cy-item-search"><input className="cy-op-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋現行／歷史品號、名稱、規格" /><div className="cy-item-filters"><select className="cy-op-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">全部分類</option>{database.settings.itemCategories.map((value) => <option key={value}>{value}</option>)}</select><select className="cy-op-input" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}><option value="">全部狀態</option><option value="active">使用中</option><option value="inactive">已停用</option></select></div><div className="cy-item-count">搜尋結果 {rows.length} 筆</div></div><div className="cy-op-list">{rows.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => selectItem(row.id)}><strong>{row.itemNo} · {row.name}</strong><span>{row.spec ?? "無規格"} · {row.baseUnit}</span><small>{row.isActive ? row.category : "已停用"}</small></button>)}{!rows.length ? <div className="cy-op-empty">沒有符合條件的商品。</div> : null}</div></section>
      <section className="cy-op-panel cy-item-detail-pane">{editing && draft ? <form className="cy-op-form" onSubmit={save}><div className="cy-op-panel-header"><div><h2>{creating ? "新增商品" : `修改 ${selected?.itemNo}`}</h2><p>{creating ? "品號必須是既有 SMART ERP 品號" : "既有品號需使用「更改品號」受控動作"}</p></div><div className="cy-item-inline-actions"><button type="button" className="cy-op-button" onClick={cancelEdit}>取消</button><button className="cy-op-button primary">儲存</button></div></div><div className="cy-item-form-body"><div className="cy-op-form-grid"><label>品號<input className="cy-op-input" value={creating ? draft.itemNo : selected?.itemNo ?? ""} disabled={!creating} onChange={(e) => creating && patch({ itemNo: e.target.value })} required /></label><label>名稱<input className="cy-op-input" value={draft.name} onChange={(e) => patch({ name: e.target.value })} required /></label><label>規格<input className="cy-op-input" value={draft.spec ?? ""} onChange={(e) => patch({ spec: e.target.value || null })} /></label><label>分類<select className="cy-op-input" value={draft.category} onChange={(e) => patch({ category: e.target.value })}>{database.settings.itemCategories.map((value) => <option key={value}>{value}</option>)}</select></label><label>基準單位<input className="cy-op-input" value={draft.baseUnit} onChange={(e) => patch({ baseUnit: e.target.value })} required /></label><label>成本<input className="cy-op-input" type="number" min="0" step="0.0001" value={draft.cost ?? ""} onChange={(e) => patch({ cost: nullableNumber(e.target.value) })} /></label><label>成本稅別<select className="cy-op-input" value={draft.costTaxMode ?? ""} onChange={(e) => patch({ costTaxMode: (e.target.value || null) as LocalItemCostTaxMode | null })}><option value="">未指定</option><option value="inclusive">含稅</option><option value="exclusive">未稅</option><option value="none">無稅別</option></select></label><label>門市價<input className="cy-op-input" type="number" min="0" step="0.0001" value={draft.storePrice ?? ""} onChange={(e) => patch({ storePrice: nullableNumber(e.target.value) })} /></label><label>診所價<input className="cy-op-input" type="number" min="0" step="0.0001" value={draft.clinicPrice ?? ""} onChange={(e) => patch({ clinicPrice: nullableNumber(e.target.value) })} /></label><label className="wide">備註<textarea className="cy-op-input" rows={3} value={draft.notes ?? ""} onChange={(e) => patch({ notes: e.target.value || null })} /></label></div><section className="cy-item-conversions"><div className="cy-item-section-head"><div><h3>單位換算</h3><p>規則：1 來源單位 = 數量 × 目標單位；每條路徑最後必須到基準單位。</p></div><button type="button" className="cy-op-button" onClick={addConversion}>＋ 增加換算</button></div>{draft.conversions.map((row, index) => <div className="cy-item-conversion-row" key={`${index}-${row.fromUnit}`}><span>1</span><input className="cy-op-input" value={row.fromUnit} onChange={(e) => updateConversion(index, "fromUnit", e.target.value)} /><span>=</span><input className="cy-op-input" type="number" step="0.0001" min="0.0001" value={row.quantity} onChange={(e) => updateConversion(index, "quantity", e.target.value)} /><input className="cy-op-input" value={row.toUnit} onChange={(e) => updateConversion(index, "toUnit", e.target.value)} /><button type="button" className="cy-op-button danger" onClick={() => patch({ conversions: draft.conversions.filter((_, i) => i !== index) })}>移除</button></div>)}{!draft.conversions.length ? <p className="cy-item-muted">目前僅使用基準單位。</p> : null}</section></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={cancelEdit}>取消</button><button className="cy-op-button primary">儲存</button></div></form> : selected ? <div><div className="cy-op-panel-header cy-item-detail-header"><div><h2>{selected.itemNo} · {selected.name}</h2><p>{selected.spec ?? "無規格"} · rev.{selected.revision}</p></div><div className="cy-item-action-stack"><button className="cy-op-button primary" onClick={startEdit}>修改</button><button className="cy-op-button" onClick={changeItemNumber}>更改品號</button><button className={`cy-op-button ${selected.isActive ? "danger" : ""}`} onClick={toggleActive}>{selected.isActive ? "停用" : "啟用"}</button></div></div><div className="cy-item-detail-body"><div className="cy-item-info-grid"><Info label="分類" value={selected.category} /><Info label="基準單位" value={selected.baseUnit} /><Info label="成本" value={selected.cost == null ? null : String(selected.cost)} /><Info label="成本稅別" value={selected.costTaxMode ? taxModeText[selected.costTaxMode] : null} /><Info label="門市價" value={selected.storePrice == null ? null : String(selected.storePrice)} /><Info label="診所價" value={selected.clinicPrice == null ? null : String(selected.clinicPrice)} /><Info label="狀態" value={selected.isActive ? "使用中" : "已停用"} /><Info label="有效瑕疵紀錄" value={`${defectCount} 筆`} /><div className="wide"><Info label="備註" value={selected.notes} /></div></div><section className="cy-item-section"><h3>單位換算</h3>{selected.conversions.length ? selected.conversions.map((row, index) => <div className="cy-item-read-row" key={index}>1 {row.fromUnit} = {row.quantity} {row.toUnit}</div>) : <p className="cy-item-muted">目前僅使用基準單位。</p>}</section><section className="cy-item-section"><h3>歷史品號</h3>{(selected.numberHistory ?? []).length ? (selected.numberHistory ?? []).map((row) => <div className="cy-item-history-row" key={row.id}><strong>{row.itemNo}</strong><span>{row.changeSource ?? "未註明原因"} · 至 {new Date(row.validTo ?? row.createdAt).toLocaleString()}</span></div>) : <p className="cy-item-muted">尚無品號變更紀錄。</p>}</section></div></div> : <div className="cy-op-empty">請選擇商品，或新增一筆。</div>}</section>
    </div>
  </div>;
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="cy-item-info"><span>{label}</span><strong>{value || "—"}</strong></div>;
}
