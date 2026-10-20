import { FormEvent, useEffect, useState } from "react";
import type { DefectCustomerOption, DefectItemOption, DefectModuleLookups } from "../../../../shared/business-lookups";
import type { DefectDetail } from "../../../../shared/defect";
import { taipeiToday } from "../../../../shared/erp-query-history";
import { ApiClientError } from "../../../api/client";
import { enterAdvancesFields } from "../../../ui/foundation/enter-advance";
import { formatItem } from "../../../ui/foundation/format";
import { EntityPicker } from "../../../ui/pickers/EntityPicker";
import { createDefect, loadDefectLookups, updateDefect } from "../../api/defect-runtime-client";
import "../defect-operational.css";

export interface DefectFormProps {
  mode: "create" | "edit";
  initial?: DefectDetail | null;
  fixedItem?: { id: number; itemNo: string; name: string };
  onSaved: (detail: DefectDetail) => void;
  onCancel: () => void;
}

/** One form and one server-side mutation path for the Defect page and Item dialog. */
export function DefectForm({ mode, initial, fixedItem, onSaved, onCancel }: DefectFormProps) {
  const [lookups, setLookups] = useState<DefectModuleLookups | null>(null);
  const [reportedDate, setReportedDate] = useState(initial?.reportedDate ?? taipeiToday);
  const [customer, setCustomer] = useState<DefectCustomerOption | null>(initial ? {
    id: initial.customerId, customerNo: initial.customerNoSnapshot, shortName: initial.customerNameSnapshot,
  } : null);
  const [item, setItem] = useState<DefectItemOption | null>(fixedItem
    ? { ...fixedItem, spec: null, isActive: true } : initial ? {
      id: initial.itemId, itemNo: initial.itemNoSnapshot, name: initial.itemNameSnapshot,
      spec: initial.specSnapshot, isActive: true,
    } : null);
  const [ownerEmployeeId, setOwnerEmployeeId] = useState<number | null>(initial?.ownerEmployee.id ?? null);
  const [description, setDescription] = useState(initial?.defectDescription ?? "");
  const [handling, setHandling] = useState(initial?.handling ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadDefectLookups({ customerId: initial?.customerId, itemId: fixedItem?.id ?? initial?.itemId,
      ownerId: initial?.ownerEmployee.id, limit: 100 }).then(result => {
      if (cancelled) return;
      setLookups(result);
      setOwnerEmployeeId(value => value ?? result.actor.appMemberId ?? result.owners.find(row => row.isActive)?.id ?? null);
    }).catch(() => { if (!cancelled) setError("目前無法載入瑕疵表單選項。"); });
    return () => { cancelled = true; };
  }, [initial?.id, fixedItem?.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const customerId = customer?.id, itemId = fixedItem?.id ?? item?.id;
    if (!customerId || !itemId || !ownerEmployeeId || !reportedDate || !description.trim()) {
      setError("請填寫日期、客戶、商品、負責人與瑕疵內容。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const profile = { reportedDate, customerId, itemId, ownerEmployeeId,
        defectDescription: description.trim(), handling: handling.trim() || null };
      const detail = mode === "edit" && initial
        ? await updateDefect(initial.id, { ...profile, expectedRevision: initial.revision })
        : await createDefect(profile);
      onSaved(detail);
    } catch (reason) {
      setError(reason instanceof ApiClientError ? Object.values(reason.fields ?? {})[0] || reason.message
        : "瑕疵紀錄儲存失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }
  const actions = <>
    <button className="cy-op-button" type="button" disabled={busy} onClick={onCancel}>取消</button>
    <button className="cy-op-button primary" disabled={busy || !lookups} aria-busy={busy || undefined}>
      {mode === "create" ? "建立瑕疵" : "儲存修改"}</button>
  </>;
  // With a fixed item the form sits in the item page's dialog, whose title already names it;
  // there the actions sit at the bottom like the other dialog forms.
  const inDialog = Boolean(fixedItem);
  return <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={event => void submit(event)}>
    {inDialog ? null : <div className="cy-record-header cy-edit-header">
      <div><h2>{mode === "create" ? "新增瑕疵" : `修改瑕疵 #${initial?.id ?? ""}`}</h2>
        <p>已建檔與處理中的瑕疵可以修改；已處理的需先重新開啟。</p></div>
      <div className="cy-record-actions">{actions}</div>
    </div>}
    <div className="cy-defect-form-body"><div className="cy-op-form-grid">
      <label>回報日期<input className="cy-op-input" type="date" max="9999-12-31" required value={reportedDate}
        disabled={busy} onChange={event => setReportedDate(event.target.value)} /></label>
      <EntityPicker<DefectCustomerOption> label="客戶" required disabled={busy}
        value={customer} onSelect={setCustomer}
        search={async q => (await loadDefectLookups({ customerQuery: q, limit: 20 })).customers}
        getKey={row => row.id} getLabel={row => [row.customerNo, row.shortName].filter(Boolean).join(" ")}
        placeholder="輸入客戶編號或名稱" />
      {fixedItem ? <label>商品
        <strong className="cy-defect-fixed-item">{formatItem(fixedItem.itemNo, fixedItem.name)}</strong>
      </label> : <EntityPicker<DefectItemOption> label="商品" required disabled={busy}
        value={item} onSelect={setItem}
        search={async q => (await loadDefectLookups({ itemQuery: q, limit: 20 })).items}
        getKey={row => row.id} getLabel={row => formatItem(row.itemNo, row.name)}
        getDescription={row => row.spec} placeholder="輸入品號或品名" />}
      <label>負責人<select className="cy-op-input" value={ownerEmployeeId ?? ""} disabled={busy}
        onChange={event => setOwnerEmployeeId(Number(event.target.value) || null)}>
        <option value="">請選擇</option>
        {lookups?.owners.map(row => <option key={row.id} value={row.id}>
          {row.displayName || row.employeeNo || `員工 #${row.id}`}{row.isActive ? "" : "（已停用）"}
        </option>)}
      </select></label>
      <label className="wide">瑕疵內容<textarea className="cy-op-input" rows={5} required value={description}
        disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
      {mode === "edit" && initial?.statusCode === "processing" ? <label className="wide">處理中備註
        <textarea className="cy-op-input" rows={4} value={handling} disabled={busy}
          onChange={event => setHandling(event.target.value)} /></label> : null}
    </div></div>
    {error ? <p className="cy-notice cy-notice-error" role="alert">{error}</p> : null}
    {inDialog ? <div className="cy-customer-related-form-actions">{actions}</div> : null}
  </form>;
}
