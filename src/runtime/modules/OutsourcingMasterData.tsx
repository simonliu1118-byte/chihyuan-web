import { formatItem } from "../../ui/foundation/format";
import { FormEvent, useEffect, useId, useState } from "react";
import type { BomDetail, BomSummary, ContractorDetail, ContractorEntityType, ContractorPrice, ContractorSummary } from "../../../shared/contractor-outsourcing";
import type { OutsourcingItemOption } from "../../../shared/business-lookups";
import { ApiClientError } from "../../api/client";
import {
  createBom, createContractor, loadBomDetail, loadContractorDetail, loadOutsourcingLookups, setContractorPrice, updateBom, updateContractor,
} from "../api/outsourcing-runtime-client";
import { Loading } from "../../ui/feedback/Loading";
import { enterAdvancesFields, enterAdvancesThenSubmits } from "../../ui/foundation/enter-advance";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import { Dialog } from "../../ui/overlays/Dialog";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { EntityPicker } from "../../ui/pickers/EntityPicker";
import { StatusChip } from "../../ui/primitives/StatusChip";

export function outsourcingErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code.includes("REVISION_CONFLICT")) return "資料已被其他人修改，請重新載入後再操作。";
    if (error.status === 403) return "你目前沒有執行此代工操作的權限。";
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") return "登入狀態已失效，請重新登入。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "身分服務暫時無法使用，請稍後再試。";
    if (error.code === "BOM_REF_CONFLICT") return "已有相同代號的 BOM，請換一個代號。";
    const field = error.fields ? Object.values(error.fields)[0] : null;
    return field || error.message || error.code;
  }
  return "目前無法完成委外／代工操作。";
}

interface MasterDataProps {
  /** Reloads the shared Contractor/BOM lists (the order editor uses them too). */
  onChanged: () => void;
  onEditingChange: (editing: boolean) => void;
  notify: (message: string) => void;
  reportError: (message: string) => void;
}

const itemLabel = (row: { itemNo: string; name: string }) => formatItem(row.itemNo, row.name);
const searchItems = async (query: string) => (await loadOutsourcingLookups({ itemQuery: query, limit: 20 })).items;
async function itemsById(ids: readonly number[]): Promise<Map<number, OutsourcingItemOption>> {
  if (!ids.length) return new Map();
  const result = await loadOutsourcingLookups({ itemIds: ids, limit: ids.length });
  return new Map(result.items.map((row) => [row.id, row]));
}
function unitsOf(item: OutsourcingItemOption | null, current: string): readonly string[] {
  if (item?.allowedUnits.length) return item.allowedUnits;
  return current ? [current] : [];
}

/** Asks before leaving only when the open editor differs from what it started with. */
function useEditorGuard(draft: unknown, busy: boolean, onEditingChange: (editing: boolean) => void) {
  const [baseline, setBaseline] = useState<string | null>(null);
  const current = draft === null ? null : JSON.stringify(draft);
  useEffect(() => { if (current === null) setBaseline(null); else setBaseline((value) => value ?? current); }, [current]);
  const dirty = current !== null && baseline !== null && current !== baseline;
  const guard = useUnsavedChangesGuard({ active: dirty, blocked: busy, message: "目前有尚未儲存的修改，確定放棄？" });
  const { confirm, confirmationDialog } = useConfirmation();
  useEffect(() => { onEditingChange(dirty); }, [dirty, onEditingChange]);
  useEffect(() => () => onEditingChange(false), [onEditingChange]);
  const canLeave = async () => (await guard.confirmNavigationAsync((description) => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", confirmTone: "danger",
  }))).allowed;
  return { canLeave, confirmationDialog };
}

// ---------- Contractors and their current prices ----------

interface ContactDraft { id?: number; name: string; title: string; phone: string; mobile: string }
interface ContractorDraft {
  entityType: ContractorEntityType; displayName: string; legalName: string; taxId: string;
  phone: string; address: string; note: string; isActive: boolean; contacts: ContactDraft[];
}
interface PriceDraft { item: OutsourcingItemOption | null; existing: ContractorPrice | null; pricingUnit: string; unitPrice: string; note: string }

const blankContractor = (): ContractorDraft => ({ entityType: "organization", displayName: "", legalName: "", taxId: "", phone: "", address: "", note: "", isActive: true, contacts: [] });
function contractorDraft(detail: ContractorDetail): ContractorDraft {
  return {
    entityType: detail.entityType, displayName: detail.displayName, legalName: detail.legalName ?? "", taxId: detail.taxId ?? "",
    phone: detail.phone ?? "", address: detail.address ?? "", note: detail.note ?? "", isActive: detail.isActive,
    contacts: detail.contacts.filter((row) => row.isActive).map((row) => ({ id: row.id, name: row.name, title: row.title ?? "", phone: row.phone ?? "", mobile: row.mobile ?? "" })),
  };
}
const orNull = (value: string) => value.trim() || null;

export function ContractorWorkspace({ contractors, onChanged, onEditingChange, notify, reportError }: MasterDataProps & { contractors: readonly ContractorSummary[] }) {
  const pane = useMasterDetailPane();
  const [selectedId, setSelectedId] = useState<number | null>(contractors[0]?.id ?? null);
  const [detail, setDetail] = useState<ContractorDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<ContractorDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [price, setPrice] = useState<PriceDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const priceFormId = useId();
  const { canLeave, confirmationDialog } = useEditorGuard(draft, busy, onEditingChange);

  useEffect(() => {
    if (selectedId == null) { setDetail(null); return; }
    let cancelled = false;
    setLoadingDetail(true);
    void loadContractorDetail(selectedId)
      .then((value) => { if (!cancelled) setDetail(value); })
      .catch((error) => { if (!cancelled) reportError(outsourcingErrorMessage(error)); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [selectedId, reload, reportError]);

  async function select(id: number) {
    if (draft && !(await canLeave())) return;
    setDraft(null); setCreating(false); setSelectedId(id); pane.open();
  }
  async function startCreate() {
    if (busy || (draft && !(await canLeave()))) return;
    setCreating(true); setDraft(blankContractor()); pane.open();
  }
  function startEdit() { if (detail) { setCreating(false); setDraft(contractorDraft(detail)); } }
  async function cancelEdit() { if (await canLeave()) { setDraft(null); setCreating(false); } }
  const patch = (value: Partial<ContractorDraft>) => setDraft((current) => current ? { ...current, ...value } : current);
  const patchContact = (index: number, value: Partial<ContactDraft>) =>
    setDraft((current) => current ? { ...current, contacts: current.contacts.map((row, i) => i === index ? { ...row, ...value } : row) } : current);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    if (!draft.displayName.trim()) { reportError("請填寫代工對象名稱。"); return; }
    const missing = draft.contacts.findIndex((row) => !row.name.trim());
    if (missing >= 0) { reportError(`第 ${missing + 1} 位聯絡人缺少姓名。`); return; }
    const profile = {
      entityType: draft.entityType, displayName: draft.displayName.trim(), legalName: orNull(draft.legalName), taxId: orNull(draft.taxId),
      phone: orNull(draft.phone), address: orNull(draft.address), note: orNull(draft.note), isActive: draft.isActive,
      contacts: draft.contacts.map((row, index) => ({ id: row.id, name: row.name.trim(), title: orNull(row.title), phone: orNull(row.phone), mobile: orNull(row.mobile), sortOrder: index })),
    };
    setBusy(true);
    try {
      const saved = creating || !detail ? await createContractor(profile) : await updateContractor(detail.id, { ...profile, expectedRevision: detail.revision });
      setDetail(saved); setSelectedId(saved.id); setDraft(null); setCreating(false);
      notify(creating ? "代工對象已新增。" : "代工對象已儲存。");
      onChanged();
    } catch (error) {
      reportError(outsourcingErrorMessage(error));
    } finally { setBusy(false); }
  }

  async function openPrice(existing: ContractorPrice | null) {
    if (!detail || busy) return;
    if (!existing) { setPrice({ item: null, existing: null, pricingUnit: "", unitPrice: "", note: "" }); return; }
    try {
      const item = (await itemsById([existing.itemId])).get(existing.itemId) ?? null;
      setPrice({ item, existing, pricingUnit: existing.pricingUnit, unitPrice: existing.unitPrice, note: existing.note ?? "" });
    } catch (error) { reportError(outsourcingErrorMessage(error)); }
  }
  async function savePrice(event: FormEvent) {
    event.preventDefault();
    if (!detail || !price || busy) return;
    if (!price.item) { reportError("請選擇商品。"); return; }
    if (!price.pricingUnit) { reportError("請選擇計價單位。"); return; }
    if (!price.unitPrice.trim()) { reportError("請填寫單價。"); return; }
    setBusy(true);
    try {
      const current = price.existing ?? detail.pricing.find((row) => row.itemId === price.item?.id) ?? null;
      const saved = await setContractorPrice(detail.id, {
        itemId: price.item.id, pricingUnit: price.pricingUnit, unitPrice: price.unitPrice.trim(), note: orNull(price.note),
        ...(current ? { expectedRevision: current.revision } : {}),
      });
      setDetail(saved); setPrice(null); notify("代工單價已儲存。");
    } catch (error) {
      reportError(outsourcingErrorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setReload((value) => value + 1);
    } finally { setBusy(false); }
  }

  return <>
    {confirmationDialog}
    {price ? <Dialog open title={price.existing ? `修改單價：${price.existing.itemName}` : "設定代工單價"} size="small" dismissible={!busy} onClose={() => setPrice(null)}
      description="同一商品只有一個現行單價；修改後，已計價的代工單不受影響。"
      footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setPrice(null)}>取消</button><button type="submit" form={priceFormId} className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>儲存單價</button></div>}>
      <form id={priceFormId} className="cy-op-form-grid" onKeyDown={enterAdvancesThenSubmits} onSubmit={(event) => void savePrice(event)}>
        <div className="wide"><EntityPicker<OutsourcingItemOption> label="商品" required disabled={busy || price.existing !== null} value={price.item}
          onSelect={(row) => setPrice({ ...price, item: row, pricingUnit: row?.baseUnit ?? "" })} search={searchItems}
          getKey={(row) => row.id} getLabel={itemLabel} placeholder="輸入品號、品名或規格" /></div>
        <label>計價單位<select className="cy-op-input" value={price.pricingUnit} disabled={busy || !price.item} onChange={(event) => setPrice({ ...price, pricingUnit: event.target.value })}>
          {unitsOf(price.item, price.pricingUnit).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        <label>單價（元）<input className="cy-op-input" inputMode="decimal" value={price.unitPrice} disabled={busy} onChange={(event) => setPrice({ ...price, unitPrice: event.target.value })} /></label>
        <label className="wide">備註<input className="cy-op-input" value={price.note} disabled={busy} onChange={(event) => setPrice({ ...price, note: event.target.value })} /></label>
      </form>
    </Dialog> : null}
    <div className="cy-md" data-pane={pane.pane}>
      <section className="cy-op-panel cy-md-list" aria-label="代工對象清單">
        <div className="cy-md-toolbar"><div className="cy-md-toolbar-lead"><button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增代工對象</button></div></div>
        <div className="cy-op-list">
        {contractors.map((row) => <button type="button" className={`cy-op-list-row ${selectedId === row.id && !creating ? "active" : ""}`} key={row.id} onClick={() => void select(row.id)}>
          <strong>{row.displayName}</strong><span>{row.phone ?? "—"}{row.isActive ? "" : " · 停用"}</span></button>)}
        {contractors.length === 0 ? <div className="cy-op-empty">尚無代工對象，請按上方「＋ 新增代工對象」。</div> : null}
      </div></section>
      <section className="cy-op-panel cy-md-detail">
        <MasterDetailBack label="代工對象清單" disabled={busy} onBack={async () => { if (draft && !(await canLeave())) return; setDraft(null); setCreating(false); pane.close(); }} />
        {draft ? <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={(event) => void save(event)}>
          <div className="cy-record-header cy-edit-header"><div><h2>{creating ? "新增代工對象" : `修改 ${detail?.displayName ?? "代工對象"}`}</h2></div><div className="cy-record-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void cancelEdit()}>取消</button>
            <button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>{creating ? "建立代工對象" : "儲存修改"}</button></div></div>
          <div className="cy-op-form-grid">
            <label>名稱<input className="cy-op-input" value={draft.displayName} disabled={busy} onChange={(event) => patch({ displayName: event.target.value })} required /></label>
            <label>類型<select className="cy-op-input" value={draft.entityType} disabled={busy} onChange={(event) => patch({ entityType: event.target.value as ContractorEntityType })}>
              <option value="organization">公司／工廠</option><option value="person">個人</option></select></label>
            <label>正式名稱<input className="cy-op-input" value={draft.legalName} disabled={busy} onChange={(event) => patch({ legalName: event.target.value })} /></label>
            <label>統編<input className="cy-op-input" value={draft.taxId} disabled={busy} onChange={(event) => patch({ taxId: event.target.value })} /></label>
            <label>電話<input className="cy-op-input" value={draft.phone} disabled={busy} onChange={(event) => patch({ phone: event.target.value })} /></label>
            <label>地址<input className="cy-op-input" value={draft.address} disabled={busy} onChange={(event) => patch({ address: event.target.value })} /></label>
            <label className="wide">備註<textarea className="cy-op-input" rows={2} value={draft.note} disabled={busy} onChange={(event) => patch({ note: event.target.value })} /></label>
            <label className="wide"><input type="checkbox" checked={draft.isActive} disabled={busy} onChange={(event) => patch({ isActive: event.target.checked })} />使用中（停用後不會出現在新代工單的選單）</label>
          </div>
          <section className="cy-form-block">
            <div className="cy-form-block-head"><div><h3>聯絡人</h3></div><button type="button" className="cy-op-button compact" disabled={busy} onClick={() => patch({ contacts: [...draft.contacts, { name: "", title: "", phone: "", mobile: "" }] })}>＋ 增加聯絡人</button></div>
            <div className="cy-form-block-body">
              {draft.contacts.length === 0 ? <p className="cy-form-block-empty">尚未填寫。</p> : draft.contacts.map((row, index) => <div className="cy-out-contact" key={row.id ?? `new-${index}`}>
                <input className="cy-op-input" aria-label="姓名" placeholder="姓名" value={row.name} disabled={busy} onChange={(event) => patchContact(index, { name: event.target.value })} />
                <input className="cy-op-input" aria-label="職稱" placeholder="職稱" value={row.title} disabled={busy} onChange={(event) => patchContact(index, { title: event.target.value })} />
                <input className="cy-op-input" aria-label="電話" placeholder="電話" value={row.phone} disabled={busy} onChange={(event) => patchContact(index, { phone: event.target.value })} />
                <input className="cy-op-input" aria-label="手機" placeholder="手機" value={row.mobile} disabled={busy} onChange={(event) => patchContact(index, { mobile: event.target.value })} />
                <button type="button" className="cy-op-button compact quiet cy-row-remove" disabled={busy} onClick={() => patch({ contacts: draft.contacts.filter((_, i) => i !== index) })}>移除</button>
              </div>)}
            </div>
          </section>
        </form> : loadingDetail ? <Loading /> : detail ? <div>
          <div className="cy-record-header"><div><h2>{detail.displayName}</h2><p>{[detail.legalName, detail.entityType === "person" ? "個人" : "公司／工廠"].filter(Boolean).join(" · ")}</p></div>
            <div className="cy-record-actions"><StatusChip tone={detail.isActive ? "success" : "neutral"}>{detail.isActive ? "使用中" : "停用"}</StatusChip>
              <button type="button" className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button></div></div>
          <div className="cy-op-detail-grid">
            <div><span>統編</span><strong>{detail.taxId ?? "—"}</strong></div>
            <div><span>電話</span><strong>{detail.phone ?? "—"}</strong></div>
            <div><span>地址</span><strong>{detail.address ?? "—"}</strong></div>
            {detail.contacts.some((row) => row.isActive) ? <div className="wide"><span>聯絡人</span><strong>{detail.contacts.filter((row) => row.isActive).map((row) => [row.name, row.title, row.mobile ?? row.phone].filter(Boolean).join(" ")).join("、")}</strong></div> : null}
            {detail.note ? <div className="wide"><span>備註</span><strong>{detail.note}</strong></div> : null}
          </div>
          <div className="cy-op-subsection">
            <div className="cy-out-subsection-head"><h3>現行代工單價</h3><button type="button" className="cy-op-button compact" disabled={busy} onClick={() => void openPrice(null)}>＋ 設定單價</button></div>
            {detail.pricing.length ? <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th className="num">單價</th><th>單位</th><th>備註</th><th /></tr></thead>
              <tbody>{detail.pricing.map((row) => <tr key={row.id}><td className="cy-mono">{row.itemNo}</td><td>{row.itemName}</td><td className="num">{row.unitPrice}</td><td>{row.pricingUnit}</td><td>{row.note ?? ""}</td>
                <td className="num"><button type="button" className="cy-op-button compact quiet" disabled={busy} onClick={() => void openPrice(row)}>修改</button></td></tr>)}</tbody></table></div>
              : <p className="cy-out-hint">尚未設定現行單價。計價時會依這裡的單價計算。</p>}
          </div>
        </div> : <MasterDetailEmpty title="尚未選擇代工對象" hint="從左側清單選一位，或按清單上方的「＋ 新增代工對象」。" />}
      </section>
    </div>
  </>;
}

// ---------- BOM ----------

interface ComponentDraft { key: string; item: OutsourcingItemOption | null; quantity: string; unit: string }
interface BomDraft { recipeRef: string; finished: OutsourcingItemOption | null; outputQuantity: string; outputUnit: string; isActive: boolean; components: ComponentDraft[] }
let componentSeq = 0;
const newComponent = (item: OutsourcingItemOption | null = null, quantity = "", unit = ""): ComponentDraft =>
  ({ key: `component-${++componentSeq}`, item, quantity, unit: unit || item?.baseUnit || "" });

export function BomWorkspace({ boms, onChanged, onEditingChange, notify, reportError }: MasterDataProps & { boms: readonly BomSummary[] }) {
  const pane = useMasterDetailPane();
  const [selectedId, setSelectedId] = useState<number | null>(boms[0]?.id ?? null);
  const [detail, setDetail] = useState<BomDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [draft, setDraft] = useState<BomDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const { canLeave, confirmationDialog } = useEditorGuard(draft, busy, onEditingChange);

  useEffect(() => {
    if (selectedId == null) { setDetail(null); return; }
    let cancelled = false;
    setLoadingDetail(true);
    void loadBomDetail(selectedId)
      .then((value) => { if (!cancelled) setDetail(value); })
      .catch((error) => { if (!cancelled) reportError(outsourcingErrorMessage(error)); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [selectedId, reportError]);

  async function select(id: number) {
    if (draft && !(await canLeave())) return;
    setDraft(null); setCreating(false); setSelectedId(id); pane.open();
  }
  async function startCreate() {
    if (busy || (draft && !(await canLeave()))) return;
    setCreating(true); setDraft({ recipeRef: "", finished: null, outputQuantity: "1", outputUnit: "", isActive: true, components: [newComponent()] }); pane.open();
  }
  async function startEdit() {
    if (!detail || busy) return;
    setBusy(true);
    try {
      // Units come from each Item's conversions, so load the current options before editing.
      const items = await itemsById([detail.finishedItemId, ...detail.components.map((row) => row.itemId)]);
      setCreating(false);
      setDraft({
        recipeRef: detail.recipeRef, finished: items.get(detail.finishedItemId) ?? null, outputQuantity: detail.outputQuantity, outputUnit: detail.outputUnit,
        isActive: detail.isActive, components: detail.components.map((row) => newComponent(items.get(row.itemId) ?? null, row.quantity, row.unit)),
      });
    } catch (error) { reportError(outsourcingErrorMessage(error)); } finally { setBusy(false); }
  }
  async function cancelEdit() { if (await canLeave()) { setDraft(null); setCreating(false); } }
  const patch = (value: Partial<BomDraft>) => setDraft((current) => current ? { ...current, ...value } : current);
  const patchComponent = (index: number, value: Partial<ComponentDraft>) =>
    setDraft((current) => current ? { ...current, components: current.components.map((row, i) => i === index ? { ...row, ...value } : row) } : current);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    if (!draft.recipeRef.trim()) { reportError("請填寫 BOM 代號。"); return; }
    if (!draft.finished) { reportError("請選擇成品。"); return; }
    if (!draft.outputQuantity.trim() || !draft.outputUnit) { reportError("請填寫產出數量與單位。"); return; }
    if (!draft.components.length) { reportError("請至少加入一項料件。"); return; }
    const missing = draft.components.findIndex((row) => !row.item || !row.quantity.trim() || !row.unit);
    if (missing >= 0) { reportError(`第 ${missing + 1} 項料件缺少商品、數量或單位。`); return; }
    const input = {
      recipeRef: draft.recipeRef.trim(), finishedItemId: draft.finished.id, outputQuantity: draft.outputQuantity.trim(), outputUnit: draft.outputUnit, isActive: draft.isActive,
      components: draft.components.map((row, index) => ({ itemId: row.item!.id, quantity: row.quantity.trim(), unit: row.unit, sortOrder: index })),
    };
    setBusy(true);
    try {
      const saved = creating || !detail ? await createBom(input) : await updateBom(detail.id, { ...input, expectedRevision: detail.revision });
      setDetail(saved); setSelectedId(saved.id); setDraft(null); setCreating(false);
      notify(creating ? "BOM 已新增。" : "BOM 已儲存。");
      onChanged();
    } catch (error) {
      reportError(outsourcingErrorMessage(error));
    } finally { setBusy(false); }
  }

  return <>
    {confirmationDialog}
    <div className="cy-md" data-pane={pane.pane}>
      <section className="cy-op-panel cy-md-list" aria-label="BOM 清單">
        <div className="cy-md-toolbar"><div className="cy-md-toolbar-lead"><button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增 BOM</button></div></div>
        <div className="cy-op-list">
        {boms.map((row) => <button type="button" className={`cy-op-list-row ${selectedId === row.id && !creating ? "active" : ""}`} key={row.id} onClick={() => void select(row.id)}>
          <strong>{row.finishedItemName}</strong><span><span className="cy-mono">{row.recipeRef}</span> · {row.finishedItemNo}{row.isActive ? "" : " · 停用"}</span></button>)}
        {boms.length === 0 ? <div className="cy-op-empty">尚無 BOM，請按上方「＋ 新增 BOM」。</div> : null}
      </div></section>
      <section className="cy-op-panel cy-md-detail">
        <MasterDetailBack label="BOM 清單" disabled={busy} onBack={async () => { if (draft && !(await canLeave())) return; setDraft(null); setCreating(false); pane.close(); }} />
        {draft ? <form className="cy-op-form" onKeyDown={enterAdvancesFields} onSubmit={(event) => void save(event)}>
          <div className="cy-record-header cy-edit-header"><div><h2>{creating ? "新增 BOM" : `修改 ${detail?.recipeRef ?? "BOM"}`}</h2><p>一個成品可以有多個 BOM；入庫時若有多個使用中的 BOM，需要選擇實際用的那一個。</p></div><div className="cy-record-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void cancelEdit()}>取消</button>
            <button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>{creating ? "建立 BOM" : "儲存修改"}</button></div></div>
          <div className="cy-op-form-grid">
            <label>BOM 代號<input className="cy-op-input" value={draft.recipeRef} disabled={busy} onChange={(event) => patch({ recipeRef: event.target.value })} placeholder="例如：紙袋-標準" required /></label>
            <EntityPicker<OutsourcingItemOption> label="成品" required disabled={busy} value={draft.finished}
              onSelect={(row) => patch({ finished: row, outputUnit: row?.baseUnit ?? "" })} search={searchItems}
              getKey={(row) => row.id} getLabel={itemLabel} placeholder="輸入品號、品名或規格" />
            <label>產出數量<input className="cy-op-input" inputMode="decimal" value={draft.outputQuantity} disabled={busy} onChange={(event) => patch({ outputQuantity: event.target.value })} /></label>
            <label>產出單位<select className="cy-op-input" value={draft.outputUnit} disabled={busy || !draft.finished} onChange={(event) => patch({ outputUnit: event.target.value })}>
              {unitsOf(draft.finished, draft.outputUnit).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label className="wide"><input type="checkbox" checked={draft.isActive} disabled={busy} onChange={(event) => patch({ isActive: event.target.checked })} />使用中</label>
          </div>
          <section className="cy-form-block">
            <div className="cy-form-block-head"><div><h3>料件</h3></div><button type="button" className="cy-op-button compact" disabled={busy} onClick={() => patch({ components: [...draft.components, newComponent()] })}>＋ 增加料件</button></div>
            <div className="cy-form-block-body">
              {draft.components.map((row, index) => <div className="cy-out-component" key={row.key}>
                <EntityPicker<OutsourcingItemOption> label={<span className="cy-visually-hidden">第 {index + 1} 項料件</span>} disabled={busy} value={row.item}
                  onSelect={(item) => patchComponent(index, { item, unit: item?.baseUnit ?? "" })} search={searchItems}
                  getKey={(item) => item.id} getLabel={itemLabel} placeholder="輸入品號、品名或規格" />
                <input className="cy-op-input" aria-label="數量" placeholder="數量" inputMode="decimal" value={row.quantity} disabled={busy} onChange={(event) => patchComponent(index, { quantity: event.target.value })} />
                <select className="cy-op-input" aria-label="單位" value={row.unit} disabled={busy || !row.item} onChange={(event) => patchComponent(index, { unit: event.target.value })}>
                  {unitsOf(row.item, row.unit).map((unit) => <option key={unit}>{unit}</option>)}</select>
                <button type="button" className="cy-op-button compact quiet cy-row-remove" disabled={busy || draft.components.length <= 1} onClick={() => patch({ components: draft.components.filter((_, i) => i !== index) })}>移除</button>
              </div>)}
            </div>
          </section>
        </form> : loadingDetail ? <Loading /> : detail ? <div>
          <div className="cy-record-header"><div><h2>{detail.finishedItemName}</h2><p><span className="cy-mono">{detail.recipeRef}</span> · {detail.finishedItemNo}</p></div>
            <div className="cy-record-actions"><StatusChip tone={detail.isActive ? "success" : "neutral"}>{detail.isActive ? "使用中" : "停用"}</StatusChip>
              <button type="button" className="cy-op-button" disabled={busy} aria-busy={busy || undefined} onClick={() => void startEdit()}>修改</button></div></div>
          <div className="cy-op-detail-grid"><div><span>產出</span><strong>{detail.outputQuantity} {detail.outputUnit}</strong></div></div>
          <div className="cy-op-subsection"><h3>料件</h3><div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th className="num">數量</th><th>單位</th></tr></thead>
            <tbody>{detail.components.map((row) => <tr key={row.id}><td className="cy-mono">{row.itemNo}</td><td>{row.itemName}</td><td className="num">{row.quantity}</td><td>{row.unit}</td></tr>)}</tbody></table></div></div>
        </div> : <MasterDetailEmpty title="尚未選擇 BOM" hint="從左側清單選一個，或按清單上方的「＋ 新增 BOM」。" />}
      </section>
    </div>
  </>;
}
