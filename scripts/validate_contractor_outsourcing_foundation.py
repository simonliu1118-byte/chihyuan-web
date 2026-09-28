#!/usr/bin/env python3
"""Zero-dependency source/schema checks for Contractor/BOM/Outsourcing foundation."""

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
    return "\n".join(path.read_text(encoding="utf-8") for path in sorted((ROOT / "migrations").glob("*.sql")))


def check_sources() -> None:
    shared = read("shared/contractor-outsourcing.ts")
    unit = read("worker/item/unit-conversion.ts")
    contractor = read("worker/contractor/contractor-service.ts")
    bom = read("worker/bom/bom-service.ts")
    outsourcing = read("worker/outsourcing/outsourcing-service.ts")
    persistence = read("worker/outsourcing/outsourcing-persistence.ts")
    doc = read("docs/architecture/CONTRACTOR_OUTSOURCING_MODULE_CONTRACT.md")

    for token in ["ContractorPrice", "BomDetail", "OutsourcingStatusCode", "ReceiveOutsourcingRequest", "ContractorStockBalance"]:
        if token not in shared:
            raise AssertionError(f"missing shared token: {token}")
    for token in ["1 fromUnit = quantity toUnit", "convertScaled4Exact", "scaled4ProductToMoney2Exact", "MONEY2_PRECISION_EXCEEDED"]:
        if token not in unit:
            raise AssertionError(f"missing exact-conversion token: {token}")
    for token in ["setCurrentPrice", "CONTRACTOR_PRICE_REVISION_CONFLICT", "deleteNeverUsed"]:
        if token not in contractor:
            raise AssertionError(f"missing Contractor token: {token}")
    for token in ["bom_recipes", "bom_components", "allowedUnits", "expectedRevision"]:
        if token not in bom:
            raise AssertionError(f"missing BOM token: {token}")
    for token in ["confirmOutbound", "correctOutbound", "cancelOutbound", "cancelReceipt", "cancelPricing", "cancelPayment", "buildPricingPlan"]:
        if token not in outsourcing:
            raise AssertionError(f"missing Outsourcing service token: {token}")
    for token in ["outbound_supply", "receipt_consumption", "reversal", "outsourcing.outbound.cancelled", "outsourcing.payment.cancelled", "AuditService"]:
        if token not in persistence:
            raise AssertionError(f"missing Outsourcing persistence token: {token}")
    for token in ["pending_outbound", "voided", "no hidden monetary rounding", "multiple active BOMs"]:
        if token.lower() not in doc.lower():
            raise AssertionError(f"missing module-contract rule: {token}")


def check_schema() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema())
    now = "2026-09-27T10:00:00Z"
    conn.execute("INSERT INTO app_members(identity_employee_id,employee_no,is_active,created_at,updated_at) VALUES('e1','E001',1,?,?)", (now, now))
    conn.execute("INSERT INTO items(item_no,name,base_unit,created_at,updated_at) VALUES('FIN1','成品','個',?,?)", (now, now))
    conn.execute("INSERT INTO items(item_no,name,base_unit,created_at,updated_at) VALUES('PART1','料件','個',?,?)", (now, now))
    conn.execute("INSERT INTO contractors(entity_type,display_name,is_active,created_at,updated_at,revision) VALUES('person','代工甲',1,?,?,1)", (now, now))
    conn.execute("INSERT INTO contractor_pricing(contractor_id,item_id,pricing_unit,unit_price,updated_at,revision) VALUES(1,1,'個',50000,?,1)", (now,))
    try:
        conn.execute("INSERT INTO contractor_pricing(contractor_id,item_id,pricing_unit,unit_price,updated_at,revision) VALUES(1,1,'個',60000,?,1)", (now,))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("schema accepted duplicate current Contractor + Item price")

    conn.execute("INSERT INTO bom_recipes(recipe_ref,finished_item_id,output_quantity,output_unit,is_active,created_at,updated_at,revision) VALUES('BOM-A',1,10000,'個',1,?,?,1)", (now, now))
    conn.execute("INSERT INTO bom_recipes(recipe_ref,finished_item_id,output_quantity,output_unit,is_active,created_at,updated_at,revision) VALUES('BOM-B',1,10000,'個',1,?,?,1)", (now, now))
    if conn.execute("SELECT COUNT(*) FROM bom_recipes WHERE finished_item_id=1").fetchone()[0] != 2:
        raise AssertionError("multiple BOM variants were not accepted")
    conn.execute("INSERT INTO bom_components(bom_recipe_id,component_item_id,quantity,unit,sort_order) VALUES(1,2,20000,'個',0)")

    conn.execute("INSERT INTO outsourcing_orders(outsourcing_ref,status_code,operator_employee_id,contractor_id,contractor_name_snapshot,order_date,created_at,updated_at,revision) VALUES('OUT1','pending_outbound',1,1,'代工甲','2026-09-27',?,?,1)", (now, now))
    if conn.execute("SELECT COUNT(*) FROM contractor_stock_movements").fetchone()[0] != 0:
        raise AssertionError("pending Outsourcing unexpectedly changed stock")
    conn.execute("UPDATE outsourcing_orders SET status_code='outbound',outbound_date='2026-09-27',revision=2 WHERE id=1")
    conn.execute("INSERT INTO contractor_stock_movements(contractor_id,item_id,movement_type,quantity_delta,occurred_at,operator_employee_id,outsourcing_order_id,created_at) VALUES(1,2,'outbound_supply',100000,?,1,1,?)", (now, now))
    conn.execute("INSERT INTO contractor_stock_movements(contractor_id,item_id,movement_type,quantity_delta,occurred_at,operator_employee_id,outsourcing_order_id,reversal_of_movement_id,created_at) VALUES(1,2,'reversal',-100000,?,1,1,1,?)", (now, now))
    balance = conn.execute("SELECT SUM(quantity_delta) FROM contractor_stock_movements WHERE contractor_id=1 AND item_id=2").fetchone()[0]
    if balance != 0:
        raise AssertionError(f"stock reversal did not reconcile: {balance}")

    try:
        conn.execute("UPDATE outsourcing_orders SET status_code='unknown' WHERE id=1")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("schema accepted invalid Outsourcing status")
    conn.close()


def main() -> int:
    check_sources()
    print("PASS contractor / BOM / outsourcing source contracts")
    check_schema()
    print("PASS contractor / BOM / outsourcing schema contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
