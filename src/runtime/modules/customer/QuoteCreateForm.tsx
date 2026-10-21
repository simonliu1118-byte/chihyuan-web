import {Field,FormSection} from "../../../ui/forms/Field";
import { enterAdvancesFields } from "../../../ui/foundation/enter-advance";
import { FormEvent, useState } from "react";
import type { CustomerItemOption } from "../../../../shared/business-lookups";
import { taipeiToday } from "../../../../shared/erp-query-history";
import { formatItem } from "../../../ui/foundation/format";
import { EntityPicker } from "../../../ui/pickers/EntityPicker";
import { createCustomerQuoteBatch, searchCustomerItemOptions } from "../../api/customer-runtime-client";
import { ApiClientError } from "../../../api/client";
import "../customer-operational.css";

export interface QuoteCreateLine {
  item: CustomerItemOption | null;
  quantity: string;
  unit: string;
  unitPrice: string;
}
export interface QuoteCreateFormProps {
  customerId: number | null;
  initialLines?: readonly { item: CustomerItemOption; unit?: string }[];
  onSaved: () => void;
  onCancel: () => void;
}

const searchItems = async (q: string) => searchCustomerItemOptions(q, 20);
const itemLabel = (item: CustomerItemOption) => formatItem(item.itemNo, item.name);
const emptyLine = (): QuoteCreateLine => ({ item: null, quantity: "1", unit: "個", unitPrice: "0" });

/** Shared between Customer + Item modules: one API, one validation and one form. */
export function QuoteCreateForm({ customerId, initialLines, onSaved, onCancel }: QuoteCreateFormProps) {
  const [quoteDate, setQuoteDate] = useState(taipeiToday);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<QuoteCreateLine[]>(() => initialLines?.length
    ? initialLines.map(row => ({ ...emptyLine(), item: row.item, unit: row.unit ?? row.item.baseUnit }))
    : [emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patchLine = (index: number, patch: Partial<QuoteCreateLine>) =>
    setLines(current => current.map((line, n) => n === index ? { ...line, ...patch } : line));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!customerId || !quoteDate || !lines.length || lines.some(row =>
      !row.item || !row.quantity.trim() || !row.unit.trim() || !row.unitPrice.trim())) {
      setError("請先選擇客戶，並確認每列的商品、數量、單位及單價均已填寫。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCustomerQuoteBatch(customerId, {
        quoteDate, note: note.trim() || null,
        lines: lines.map(row => ({
          itemId: row.item!.id, quantity: row.quantity.trim(),
          unit: row.unit.trim(), unitPrice: row.unitPrice.trim(),
        })),
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof ApiClientError
        ? Object.values(reason.fields ?? {})[0] || reason.message
        : "報價儲存失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }
  return <form onKeyDown={enterAdvancesFields} className="cy-customer-quote-form" onSubmit={event => void save(event)}>
    <FormSection>
    <div className="cy-customer-quote-header-fields">
      <Field label="日期" size="s" required><input type="date" max="9999-12-31" className="cy-op-input" value={quoteDate} disabled={busy}
        onChange={event => setQuoteDate(event.target.value)} /></Field>
      <Field label="備註" size="l"><input className="cy-op-input" value={note} disabled={busy} maxLength={120}
        onChange={event => setNote(event.target.value)} /></Field>
    </div>
    <div className="cy-customer-quote-lines">
      {lines.map((line, index) => <div key={index} className="cy-customer-quote-line">
        <EntityPicker<CustomerItemOption> label="商品" value={line.item} required disabled={busy}
          search={searchItems} getKey={item => item.id} getLabel={itemLabel}
          minQueryLength={1} placeholder="輸入品號或品名搜尋"
          onSelect={item => patchLine(index, { item, unit: item?.baseUnit ?? line.unit })} />
        <Field label="數量" size="s" required><input className="cy-op-input" inputMode="decimal" disabled={busy} value={line.quantity}
          onChange={event => patchLine(index, { quantity: event.target.value })} /></Field>
        <Field label="單位" size="s" required><input className="cy-op-input" disabled={busy} value={line.unit}
          onChange={event => patchLine(index, { unit: event.target.value })} /></Field>
        <Field label="單價" size="s" required><input className="cy-op-input" inputMode="decimal" disabled={busy} value={line.unitPrice}
          onChange={event => patchLine(index, { unitPrice: event.target.value })} /></Field>
        <button type="button" className="cy-op-button compact" disabled={busy} title="移除品項"
          onClick={() => setLines(current => current.filter((_, n) => n !== index))}>移除</button>
      </div>)}
    </div>
    <button type="button" className="cy-op-button compact" disabled={busy || lines.length >= 100}
      onClick={() => setLines(current => [...current, emptyLine()])}>＋ 加一列</button>
    {error ? <p role="alert" className="cy-notice cy-notice-error">{error}</p> : null}
    <div className="cy-customer-related-form-actions">
      <button type="button" className="cy-op-button" disabled={busy} onClick={onCancel}>取消</button>
      <button className="cy-op-button primary" disabled={busy || !customerId || lines.length === 0}>儲存報價</button>
    </div>
      </FormSection>
  </form>;
}
