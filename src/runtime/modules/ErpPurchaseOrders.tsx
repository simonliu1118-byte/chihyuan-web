import { formatDate } from "../../ui/foundation/format";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { arrangePurchases, erpMoney, erpNumber } from "../../../shared/erp-sales-links";
import type { ErpPurchaseOrder } from "../../../shared/erp-item-query";
import { ErpOrderList } from "./ErpOrderList";
import { ErpQueryRows } from "./ErpQueryRows";

const LINE_COLUMNS = ["序號", "品號", "品名", "規格", "數量", "驗收數量", "驗退數量", "單位", "單價", "金額", "庫別", "批號", "驗收日期", "採購單號", "備註", "原進貨單"];
const anchor = (orderNo: string) => "erp-purchase-" + orderNo.replace(/[^A-Za-z0-9-]/g, "_");

/**
 * 進貨退貨單 (user 2026-10-18) newest first, laid out like 銷貨銷退單: a 退貨單 with its 原進貨單 sits
 * right under that 進貨單 and both link to each other. Amounts are 原幣 and shown with $.
 */
export function ErpPurchaseOrders({ orders, total, truncated }: { orders: readonly ErpPurchaseOrder[]; total: number; truncated: boolean }) {
  const entries = arrangePurchases(orders);
  const sum = (kind: ErpPurchaseOrder["kind"]) => orders.filter(o => o.kind === kind).reduce((acc, o) => acc + erpNumber(o.total), 0);
  const count = (kind: ErpPurchaseOrder["kind"]) => orders.filter(o => o.kind === kind).length;
  return <>
    <h3>進貨 {count("進貨")} 張（合計 {erpMoney(sum("進貨"))}）、退貨 {count("退貨")} 張（合計 {erpMoney(sum("退貨"))}）</h3>
    {truncated && <p className="cy-notice cy-notice-warning">共 {total} 張，只顯示最新 {orders.length} 張，請縮小日期範圍。</p>}
    <ErpOrderList columns={["類別", "日期", "單號", "品項", "廠商單號", "合計"]}>
      {entries.map(({ order, under, related }) => <details key={order.kind + order.orderNo} id={anchor(order.orderNo)}
        className={"cy-erp-order" + (order.kind === "退貨" ? " is-return" : "") + (under ? " is-linked" : "")}>
        <summary>
          <StatusChip tone={order.kind === "退貨" ? "danger" : "neutral"}>{order.kind}</StatusChip>
          <span>{formatDate(order.date)}</span>
          <strong>{order.orderNo}</strong>
          <span>{order.lines.length} 項</span>
          <span className="cy-erp-order-extra">{order.supplierOrderNo}</span>
          <span className="cy-erp-order-total">{erpMoney(order.total)}</span>
        </summary>
        <div className="cy-erp-order-body">
          {related.length > 0 && <p className="cy-erp-order-links">{order.kind === "進貨" ? "退貨單：" : "原進貨單："}
            {related.map(link => link.inList
              ? <a key={link.orderNo} href={"#" + anchor(link.orderNo)} onClick={event => {
                event.preventDefault();
                const target = document.getElementById(anchor(link.orderNo));
                if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView({ block: "start", behavior: "smooth" }); }
              }}>{link.orderNo}</a>
              : <span key={link.orderNo}>{link.orderNo}（不在查詢範圍）</span>)}
          </p>}
          <dl className="cy-erp-fields">
            {[["廠商單號", order.supplierOrderNo], ["發票號碼", order.invoiceNo], ["發票聯數", order.invoiceType], ["課稅別", order.taxType],
              ["幣別", order.currency], ["數量合計", order.totalQuantity], [order.kind + "金額", erpMoney(order.amount)],
              ["扣款金額", erpNumber(order.deduction) ? erpMoney(order.deduction) : ""], ["稅額", erpMoney(order.tax)], ["結帳", order.settled],
            ].filter(([, value]) => value).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
          </dl>
          <ErpQueryRows label={order.orderNo + " 明細"} columns={LINE_COLUMNS} summaryColumns={[1, 2, 4, 9]}
            rows={order.lines.map(l => [String(l.seq), l.itemCode, l.itemName, l.specification, l.quantity, l.acceptedQuantity,
              l.returnedQuantity, l.unit, erpMoney(l.unitPrice), erpMoney(l.amount), l.warehouse, l.batch, formatDate(l.acceptDate),
              l.purchaseOrderNo, l.note, l.sourceOrder])} />
        </div>
      </details>)}
    </ErpOrderList>
  </>;
}
