import test from "node:test";
import assert from "node:assert/strict";
import { arrangePurchases, arrangeSales, groupBills, sourceOrderNo } from "../shared/erp-sales-links.ts";

const line = (sourceOrder = "") => ({ seq: 1, itemCode: "X1", itemName: "", specification: "", warehouse: "", quantity: "1", unit: "", unitPrice: "1", amount: "1", giftType: "", giftQuantity: "0", batch: "", note: "", sourceOrder });
const order = (kind, orderNo, date, sources = [""]) => ({ kind, orderNo, date, customerCode: "CU1", customerName: "", salesperson: "", department: "", paymentTerm: "", taxType: "", invoiceType: "", totalQuantity: "1", amount: "1", tax: "0", total: "1", note: "", reason: "", lines: sources.map(line) });

test("line reference splits into the 銷貨單 number", () => {
  assert.equal(sourceOrderNo("901A-20260101001-0003"), "901A-20260101001");
  assert.equal(sourceOrderNo("--"), null);
  assert.equal(sourceOrderNo(""), null);
});

test("a 銷退單 sits under its 銷貨單; one without stands alone; outside the range is marked", () => {
  const sale1 = order("銷貨", "901A-20260101001", "2026-01-01");
  const sale2 = order("銷貨", "901A-20260110001", "2026-01-10");
  const linked = order("銷退", "902A-20260112001", "2026-01-12", ["901A-20260101001-0001"]);
  const alone = order("銷退", "902A-20260105001", "2026-01-05", ["--"]);
  const outside = order("銷退", "902A-20260103001", "2026-01-03", ["901A-20250101001-0001"]);
  const entries = arrangeSales([sale1, sale2, linked, alone, outside]);
  assert.deepEqual(entries.map(e => e.order.orderNo), ["901A-20260110001", "902A-20260105001", "902A-20260103001", "901A-20260101001", "902A-20260112001"]);
  assert.equal(entries[4].under, "901A-20260101001");
  assert.deepEqual(entries[3].related, [{ orderNo: "902A-20260112001", inList: true }]);
  assert.deepEqual(entries[2].related, [{ orderNo: "901A-20250101001", inList: false }]);
  assert.deepEqual(entries[1].related, []);
});

test("bills group by customer with CY Web's subtotal", () => {
  const bill = (customerCode, unpaid) => ({ customerCode, customerName: "", date: "2026-01-01", billNo: "B" + unpaid, salespersonCode: "", salespersonName: "", invoiceNo: "", currency: "NTD", receivable: unpaid, receivableTax: "0", unpaid, vouchers: [] });
  const groups = groupBills([bill("CU1", "100"), bill("CU2", "-30"), bill("CU1", "1,200.5")]);
  assert.deepEqual(groups.map(g => [g.customerCode, g.bills.length, g.unpaid]), [["CU1", 2, 1300.5], ["CU2", 1, -30]]);
});

test("money shows with $ and keeps negatives readable", async () => {
  const { erpMoney } = await import("../shared/erp-sales-links.ts");
  assert.equal(erpMoney("1420"), "$1,420");
  assert.equal(erpMoney("-3250"), "-$3,250");
  assert.equal(erpMoney("4266.667"), "$4,266.667");
  assert.equal(erpMoney(0), "$0");
  assert.equal(erpMoney(""), "");
});

test("a 退貨單 sits under its 進貨單 the same way", () => {
  const purchase = (kind, orderNo, date, sources = [""]) => ({ kind, orderNo, date, lines: sources.map(sourceOrder => ({ sourceOrder })) });
  const entries = arrangePurchases([
    purchase("進貨", "341A-20260212001", "2026-02-12"),
    purchase("退貨", "351A-20260301001", "2026-03-01", ["341A-20260212001-0002"]),
    purchase("退貨", "351A-20260302001", "2026-03-02", ["--"]),
  ]);
  assert.deepEqual(entries.map(e => [e.order.orderNo, e.under]), [
    ["351A-20260302001", null], ["341A-20260212001", null], ["351A-20260301001", "341A-20260212001"],
  ]);
});
