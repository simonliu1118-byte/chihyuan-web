#!/usr/bin/env python3
"""Zero-dependency structural smoke checks for Sales Work Order foundation."""

from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    text = (ROOT / path).read_text(encoding="utf-8")
    if not text.strip():
        raise AssertionError(f"empty file: {path}")
    return text


def schema() -> str:
    parts = []
    for path in sorted((ROOT / "migrations").glob("*.sql")):
        parts.append(path.read_text(encoding="utf-8"))
    if not parts:
        raise AssertionError("no migrations found")
    return "\n".join(parts)


def check_source_contracts() -> None:
    shared = read("shared/sales-work-order.ts")
    validation = read("worker/sales-order/sales-order-validation.ts")
    repo = read("worker/sales-order/sales-order-repository.ts")
    persistence = read("worker/sales-order/sales-order-persistence.ts")
    service = read("worker/sales-order/sales-order-service.ts")
    doc = read("docs/architecture/SALES_WORK_ORDER_MODULE_CONTRACT.md")

    required_shared = [
        '"created"', '"issued"', '"waiting_stock"', '"picked"', '"shipped"', '"voided"',
        "FillOrCorrectErpRequest", "SalesWorkOrderLineInput",
    ]
    for token in required_shared:
        if token not in shared:
            raise AssertionError(f"missing shared contract token: {token}")

    for token in ["parseScaled4", "最多 4 位小數", "customerName", "MAX_LINES"]:
        if token not in validation:
            raise AssertionError(f"missing validation token: {token}")

    for token in ["item_unit_conversions", "allowedUnits", "customer_no = ?", "LIMIT ?"]:
        if token not in repo:
            raise AssertionError(f"missing repository token: {token}")

    # Persistence owns the actual Audit write boundary. Generic lifecycle action
    # names are selected by SalesWorkOrderService and passed into persistence.
    for token in [
        "sales_work_order.erp.filled",
        "sales_work_order.erp.corrected",
        "sales_work_order.deleted",
        "AuditService",
        "status_code = 'created'",
        "erp_no IS NULL",
    ]:
        if token not in persistence:
            raise AssertionError(f"missing persistence token: {token}")

    for token in [
        "markWaitingStock",
        "markPicked",
        "markShipped",
        "reverseShipment",
        "voidOrder",
        "allowShipmentReversal",
        "allowHardDelete",
        "nextReference",
        "sales_work_order.shipment.reversed",
        "sales_work_order.voided",
    ]:
        if token not in service:
            raise AssertionError(f"missing service token: {token}")

    if "fuzzy" not in doc.lower() or "hard delete" not in doc.lower():
        raise AssertionError("module contract must preserve no-guessing and delete/void boundary")


def check_schema_contracts() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema())
    now = "2026-09-27T00:00:00Z"
    conn.execute(
        "INSERT INTO app_members(identity_employee_id, employee_no, is_active, created_at, updated_at) VALUES ('e1','E001',1,?,?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO customers(customer_no, short_name, created_at, updated_at) VALUES ('C001','甲診所',?,?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO items(item_no,name,base_unit,created_at,updated_at) VALUES ('I001','商品甲','盒',?,?)",
        (now, now),
    )
    conn.execute(
        """
        INSERT INTO sales_work_orders(
          work_order_ref, customer_id, customer_no_snapshot, customer_name_snapshot,
          order_date, operator_employee_id, status_code, created_at, created_by, updated_at, updated_by
        ) VALUES ('W1',1,'C001','甲診所','2026-09-27',1,'created',?,1,?,1)
        """,
        (now, now),
    )
    conn.execute(
        """
        INSERT INTO sales_work_order_items(
          sales_work_order_id,item_id,item_no_snapshot,item_name_snapshot,quantity,unit_snapshot,unit_price
        ) VALUES (1,1,'I001','商品甲',10000,'盒',250000)
        """
    )
    row = conn.execute("SELECT status_code, revision FROM sales_work_orders WHERE id=1").fetchone()
    if row != ("created", 1):
        raise AssertionError(f"unexpected initial work-order state: {row}")

    # Name-only draft remains explicitly supported.
    conn.execute(
        """
        INSERT INTO sales_work_orders(
          work_order_ref, customer_id, customer_no_snapshot, customer_name_snapshot,
          order_date, operator_employee_id, status_code, created_at, updated_at
        ) VALUES ('W2',NULL,NULL,'現場新客戶','2026-09-27',1,'created',?,?)
        """,
        (now, now),
    )

    # Unlinked rows may never pretend to carry a formal Customer number.
    try:
        conn.execute(
            """
            INSERT INTO sales_work_orders(
              work_order_ref, customer_id, customer_no_snapshot, customer_name_snapshot,
              order_date, operator_employee_id, status_code, created_at, updated_at
            ) VALUES ('W3',NULL,'C999','錯誤組合','2026-09-27',1,'created',?,?)
            """,
            (now, now),
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("schema accepted unlinked Customer number/name combination")

    # Fixed workflow remains bounded.
    try:
        conn.execute("UPDATE sales_work_orders SET status_code='unknown' WHERE id=1")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("schema accepted unknown Sales Work Order status")

    conn.close()


def main() -> int:
    check_source_contracts()
    print("PASS sales work order source contracts")
    check_schema_contracts()
    print("PASS sales work order schema contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
