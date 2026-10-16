import { arrangeSales, erpMoney, erpNumber } from "../../../shared/erp-sales-links";
import type { ErpSalesOrder } from "../../../shared/erp-item-query";
import { ErpQueryRows } from "./ErpQueryRows";

const LINE_COLUMNS = ["序號", "品號", "品名", "規格", "數量", "單位", "單價", "金額", "類型", "贈/備品量", "庫別", "批號", "備註", "原銷貨單"];
const anchor = (orderNo: string) => "erp-order-" + orderNo.replace(/[^A-Za-z0-9-]/g, "_");

/**
 * 銷貨銷退單 newest first; a 銷退單 with its 原銷貨單 sits right under that 銷貨單 and both link to
 * each other (user 2026-10-17). Each order opens to its lines; the lines use the shared list.
 */
export function ErpSalesOrders({ orders, total, truncated, defaultOpen = false }: { orders: readonly ErpSalesOrder[]; total: number; truncated: boolean; defaultOpen?: boolean }) {
  const entries = arrangeSales(orders);
  const sum = (kind: ErpSalesOrder["kind"]) => orders.filter(o => o.kind === kind).reduce((acc, o) => acc + erpNumber(o.total), 0);
  const count = (kind: ErpSalesOrder["kind"]) => orders.filter(o => o.kind === kind).length;
  return <>
    <h3>銷貨 {count("銷貨")} 張（合計 {erpMoney(sum("銷貨"))}）、銷退 {count("銷退")} 張（合計 {erpMoney(sum("銷退"))}）</h3>
    {truncated && <p className="cy-erp-error">共 {total} 張，只顯示最新 {orders.length} 張，請縮小日期範圍。</p>}
    <div className="cy-erp-orders">
      {entries.map(({ order, under, related }) => <details key={order.kind + order.orderNo} id={anchor(order.orderNo)} open={defaultOpen || undefined}
        className={"cy-erp-order" + (order.kind === "銷退" ? " is-return" : "") + (under ? " is-linked" : "")}>
        <summary>
          <span className="cy-erp-order-kind">{order.kind}</span>
          <span>{order.date}</span>
          <strong>{order.orderNo}</strong>
          <span>{order.lines.length} 項</span>
          <span className="cy-erp-order-total">{erpMoney(order.total)}</span>
        </summary>
        <div className="cy-erp-order-body">
          {related.length > 0 && <p className="cy-erp-order-links">{order.kind === "銷貨" ? "銷退單：" : "原銷貨單："}
            {related.map(link => link.inList
              ? <a key={link.orderNo} href={"#" + anchor(link.orderNo)} onClick={event => {
                event.preventDefault();
                const target = document.getElementById(anchor(link.orderNo));
                if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView({ block: "start", behavior: "smooth" }); }
              }}>{link.orderNo}</a>
              : <span key={link.orderNo}>{link.orderNo}（不在查詢範圍）</span>)}
          </p>}
          <dl className="cy-erp-fields">
            {[["業務員", order.salesperson], ["部門", order.department], ["付款條件", order.paymentTerm], ["課稅別", order.taxType],
              ["發票聯數", order.invoiceType], ["總數量", order.totalQuantity], ["金額", erpMoney(order.amount)], ["稅額", erpMoney(order.tax)],
              ["備註", order.note], ["銷退原因", order.reason]].filter(([, value]) => value).map(([name, value]) =>
              <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
          </dl>
          <ErpQueryRows label={order.orderNo + " 明細"} columns={LINE_COLUMNS} summaryColumns={[1, 2, 4, 7]}
            rows={order.lines.map(l => [String(l.seq), l.itemCode, l.itemName, l.specification, l.quantity, l.unit, erpMoney(l.unitPrice),
              erpMoney(l.amount), l.giftType, l.giftQuantity, l.warehouse, l.batch, l.note, l.sourceOrder])} />
        </div>
      </details>)}
    </div>
  </>;
}
