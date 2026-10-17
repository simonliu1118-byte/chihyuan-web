import { FormEvent, useEffect, useRef, useState } from "react";
import { parseErpCode, parseErpNameKeyword } from "../../../shared/erp-name-search";
import { ERP_SUPPLIER_SEARCH_FIELDS, type ErpField } from "../../../shared/erp-item-query";
import { ErpQueryRows } from "./ErpQueryRows";
import { ErpJobStatus, Fields, showsData } from "./ErpJobStatus";
import type { ErpJob } from "./useErpJob";

type Mode = "CODE" | "NAME";
const MODES: { key: Mode; label: string }[] = [{ key: "CODE", label: "廠商代號" }, { key: "NAME", label: "廠商名稱" }];
const rowsOf = (rows: readonly ErpField[][]) =>
  rows.map(row => { const values = new Map(row.map(f => [f.name, f.value])); return ERP_SUPPLIER_SEARCH_FIELDS.map(name => values.get(name) || ""); });

/**
 * 廠商 (PURI01, user 2026-10-17: the same page and flow as 客戶): one supplier by 廠商代號, or a
 * list by 簡稱／公司全名 where a pick or a single match queries that supplier.
 */
export function ErpSupplierQuery({ job }: { job: ErpJob }) {
  const [mode, setMode] = useState<Mode>("CODE");
  const [text, setText] = useState("");
  const autoFollowed = useRef<string | null>(null);
  const { result, busy, submitting, setError } = job;

  const querySupplier = (code: string) => job.start({ queryType: "SUPPLIER_NO", supplierCode: code });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mode === "CODE") {
      const code = parseErpCode(text);
      if (!code) { setError("廠商代號只能輸入 1～40 個英文字母或數字。"); return; }
      await querySupplier(code);
      return;
    }
    const keyword = parseErpNameKeyword(text);
    if (!keyword) { setError("請輸入 1～40 字廠商名稱，不可含單引號或 % _ [ ]、控制字元。"); return; }
    await job.start({ queryType: "SUPPLIER_NAME", keyword });
  }
  const mine = result && (result.queryType === "SUPPLIER_NO" || result.queryType === "SUPPLIER_NAME") ? result : null;
  // One matching supplier: query it at once, once per list (as 客戶).
  useEffect(() => {
    if (!mine || mine.queryType !== "SUPPLIER_NAME" || !showsData(mine) || mine.items.length !== 1 || busy) return;
    if (autoFollowed.current === mine.id) return;
    autoFollowed.current = mine.id;
    const code = mine.items[0].find(f => f.name === "廠商代號")?.value;
    if (code) void querySupplier(code);
  }, [mine, busy]);
  return <>
    <div className="cy-op-panel cy-erp-query-box">
      <form className="cy-erp-form" onSubmit={event => void submit(event)} noValidate>
        <div className="cy-erp-mode-switch" role="group" aria-label="查詢方式">
          {MODES.map(m => <button key={m.key} type="button" aria-pressed={mode === m.key} disabled={busy}
            className={mode === m.key ? "is-active" : ""} onClick={() => { setMode(m.key); setError(null); }}>{m.label}</button>)}
        </div>
        <div className="cy-erp-query-row">
          <input value={text} maxLength={40} autoComplete="off" disabled={busy} required
            aria-label={mode === "CODE" ? "廠商代號" : "廠商名稱"}
            placeholder={mode === "CODE" ? "請輸入廠商代號" : "請輸入廠商簡稱或全名"}
            onChange={e => setText(e.target.value)} />
          <button className="cy-op-button primary" type="submit" disabled={busy}>
            {submitting ? "送出中…" : busy ? "查詢中…" : "查詢"}
          </button>
        </div>
      </form>
    </div>
    {mine && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <ErpJobStatus result={mine} />
      {showsData(mine) && mine.queryType === "SUPPLIER_NAME" && <>
        <h3>符合的廠商（{mine.total} 筆）</h3>
        {mine.truncated && <p className="cy-erp-error">結果已達 {mine.items.length} 筆，可能有更多資料，請輸入更完整的名稱。</p>}
        <ErpQueryRows key={mine.id} label="廠商搜尋結果" columns={ERP_SUPPLIER_SEARCH_FIELDS} rows={rowsOf(mine.items)}
          disabled={busy} onItemSelect={code => void querySupplier(code)} />
        <p className="cy-erp-search-hint">點選廠商代號，重新向 ERP 查詢該廠商完整資料。</p>
      </>}
      {showsData(mine) && mine.queryType === "SUPPLIER_NO" && <>
        <h3>廠商資料</h3>
        <Fields fields={mine.fields} />
      </>}
    </div>}
  </>;
}
