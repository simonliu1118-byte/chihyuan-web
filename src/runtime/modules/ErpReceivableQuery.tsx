import { formatDate } from "../../ui/foundation/format";
import { FormEvent, useEffect, useRef, useState } from "react";
import { parseErpCode, parseErpNameKeyword, parseErpOrderNo } from "../../../shared/erp-name-search";
import { ERP_CUSTOMER_SEARCH_FIELDS, type ErpReceivableScope } from "../../../shared/erp-item-query";
import { erpMoney, erpNumber, groupBills } from "../../../shared/erp-sales-links";
import { ErpOrderDialog } from "./ErpOrderDialog";
import { ErpQueryRows } from "./ErpQueryRows";
import { ErpJobStatus, showsData } from "./ErpJobStatus";
import type { ErpJob } from "./useErpJob";

const SCOPES: { key: ErpReceivableScope; label: string }[] = [
  { key: "CUSTOMER", label: "客戶" }, { key: "SALESPERSON", label: "業務員" }, { key: "ALL", label: "全部" },
];
const BILL_COLUMNS = ["結帳單號", "日期", "業務員", "發票號碼", "應收帳款", "應收稅額", "未收帳款", "憑證"];

/**
 * 未收款 (ACRR18, user 2026-10-17): one customer (at the customer's), one 業務員 (what that person has
 * to collect) or everyone. CY Web groups the 結帳單 by customer and adds the subtotals.
 */
export function ErpReceivableQuery({ job, canSearchCustomers }: { job: ErpJob; canSearchCustomers: boolean }) {
  const [scope, setScope] = useState<ErpReceivableScope>("CUSTOMER");
  const [text, setText] = useState("");
  // The 憑證 opened in its own dialog; the 未收款 result above stays as it is.
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const autoFollowed = useRef<string | null>(null);
  const { result, busy, submitting, setError } = job;
  const queryCustomer = (code: string) => job.start({ queryType: "RECEIVABLE", scope: "CUSTOMER", code });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (scope === "ALL") { await job.start({ queryType: "RECEIVABLE", scope: "ALL", code: null }); return; }
    const code = parseErpCode(text);
    if (code) { await job.start({ queryType: "RECEIVABLE", scope, code }); return; }
    // A customer name finds the customer first (needs ERP 客戶查詢 too).
    const keyword = scope === "CUSTOMER" && canSearchCustomers ? parseErpNameKeyword(text) : null;
    if (!keyword) { setError(scope === "CUSTOMER" ? "請輸入客戶代號（英文字母或數字）" + (canSearchCustomers ? "或客戶名稱。" : "。") : "業務員代號只能輸入 1～40 個英文字母或數字。"); return; }
    await job.start({ queryType: "CUSTOMER_NAME", keyword });
  }
  const mine = result && (result.queryType === "RECEIVABLE" || result.queryType === "CUSTOMER_NAME") ? result : null;
  useEffect(() => {
    if (!mine || mine.queryType !== "CUSTOMER_NAME" || !showsData(mine) || mine.items.length !== 1 || busy) return;
    if (autoFollowed.current === mine.id) return;
    autoFollowed.current = mine.id;
    const code = mine.items[0].find(f => f.name === "客戶代號")?.value;
    if (code) void queryCustomer(code);
  }, [mine, busy]);
  const groups = mine?.queryType === "RECEIVABLE" ? groupBills(mine.bills) : [];
  const totalUnpaid = groups.reduce((acc, g) => acc + g.unpaid, 0);
  return <>
    <div className="cy-op-panel cy-erp-query-box">
      <form className="cy-erp-form" onSubmit={event => void submit(event)} noValidate>
        <div className="cy-segmented" role="group" aria-label="查詢範圍">
          {SCOPES.map(s => <button key={s.key} type="button" aria-pressed={scope === s.key} disabled={busy}
            onClick={() => { setScope(s.key); setError(null); }}>{s.label}</button>)}
        </div>
        <div className="cy-erp-query-row">
          {scope !== "ALL" && <input className="cy-op-input" value={text} maxLength={40} autoComplete="off" disabled={busy} required
            aria-label={scope === "CUSTOMER" ? "客戶" : "業務員代號"}
            placeholder={scope === "CUSTOMER" ? (canSearchCustomers ? "請輸入客戶代號或名稱" : "請輸入客戶代號") : "請輸入業務員代號"}
            onChange={e => setText(e.target.value)} />}
          <button className="cy-op-button primary" type="submit" disabled={busy} aria-busy={submitting || busy || undefined}>
            {scope === "ALL" ? "查詢全部未收款" : "查詢"}
          </button>
        </div>
      </form>
    </div>
    {mine && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <ErpJobStatus result={mine} />
      {showsData(mine) && mine.queryType === "CUSTOMER_NAME" && <>
        <h3>符合的客戶（{mine.total} 筆）</h3>
        <ErpQueryRows key={mine.id} label="客戶搜尋結果" columns={ERP_CUSTOMER_SEARCH_FIELDS} disabled={busy}
          rows={mine.items.map(row => { const v = new Map(row.map(f => [f.name, f.value])); return ERP_CUSTOMER_SEARCH_FIELDS.map(n => v.get(n) || ""); })}
          onItemSelect={code => void queryCustomer(code)} />
        
      </>}
      {showsData(mine) && mine.queryType === "RECEIVABLE" && <>
        <h3>未收合計 {erpMoney(totalUnpaid)}（{groups.length} 位客戶、{mine.bills.length} 張結帳單）</h3>
        {mine.truncated && <p className="cy-notice cy-notice-warning">共 {mine.total} 張，只顯示 {mine.bills.length} 張。</p>}
        <div className="cy-erp-orders">
          {groups.map(group => <details key={group.customerCode} className="cy-erp-order" open={groups.length === 1}>
            <summary>
              <strong>{group.customerCode}</strong><span>{group.customerName}</span>
              <span>{group.bills.length} 張</span><span className="cy-erp-order-total">{erpMoney(group.unpaid)}</span>
            </summary>
            <div className="cy-erp-order-body">
              <ErpQueryRows label={group.customerCode + " 結帳單"} columns={BILL_COLUMNS} summaryColumns={[0, 1, 6]}
                rows={group.bills.map(b => [b.billNo, formatDate(b.date), [b.salespersonCode, b.salespersonName].filter(Boolean).join(" "),
                  b.invoiceNo, erpMoney(b.receivable), erpMoney(b.receivableTax), erpMoney(b.unpaid),
                  b.vouchers.map(v => `${v.voucherNo}（${formatDate(v.date)} ${erpMoney(v.amount)}）`).join("\n")])}
                cell={(row, column) => column !== 7 ? undefined : <span className="cy-erp-vouchers">
                  {group.bills[row].vouchers.map(v => {
                    const orderNo = parseErpOrderNo(v.voucherNo);
                    return <span key={v.voucherNo}>
                      {orderNo ? <button type="button" className="cy-erp-item-link" disabled={busy}
                        onClick={() => setOpenOrder(orderNo)}>{v.voucherNo}</button> : v.voucherNo}
                      （{formatDate(v.date)} {erpMoney(v.amount)}）</span>;
                  })}</span>} />
            </div>
          </details>)}
        </div>
        <p className="cy-erp-search-hint">金額為 ERP 原幣；未收合計由各結帳單未收帳款相加（{erpMoney(mine.bills.reduce((a, b) => a + erpNumber(b.unpaid), 0))}）。</p>
      </>}
    </div>}
    {openOrder && <ErpOrderDialog key={openOrder} orderNo={openOrder} onClose={() => setOpenOrder(null)} />}
  </>;
}
