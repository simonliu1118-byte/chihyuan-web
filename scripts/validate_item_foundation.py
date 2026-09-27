#!/usr/bin/env python3
"""Zero-dependency structural checks for the Item module foundation."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def main() -> int:
    shared = read("shared/item.ts")
    validation = read("worker/item/item-validation.ts")
    repository = read("worker/item/item-repository.ts")
    persistence = read("worker/item/item-persistence.ts")
    service = read("worker/item/item-service.ts")
    contract = read("docs/architecture/ITEM_MODULE_CONTRACT.md")
    migration = read("migrations/0001_initial.sql")

    for token in (
        "CreateItemRequest",
        "UpdateItemRequest",
        "ChangeItemNumberRequest",
        "ItemNumberHistoryRecord",
    ):
        if token not in shared:
            raise AssertionError(f"missing Item shared contract: {token}")

    for token in (
        "parseScaled4",
        "換算路徑存在循環",
        "目標單位",
        "quantityScaled4",
    ):
        if token not in validation:
            raise AssertionError(f"missing Item validation guard: {token}")

    if "item_number_history" not in repository or "inh.is_searchable = 1" not in repository:
        raise AssertionError("Item search must include searchable historical Item numbers")

    for token in (
        "item.number.changed",
        "item_number_history",
        "prepareRecord",
        "revision = revision + 1",
    ):
        if token not in persistence:
            raise AssertionError(f"missing controlled Item-number behavior: {token}")

    if "ITEM_NO_CONTROLLED" in service:
        raise AssertionError("ordinary Item update should not carry an Item-number field to overwrite")

    for phrase in (
        "CY Web never generates a formal SMART ERP Item number",
        "entire graph must resolve to the base unit",
        "No universally enabled hard-delete operation",
        "created -> processing -> resolved",
    ):
        if phrase not in contract:
            raise AssertionError(f"Item architecture contract missing: {phrase}")

    db = sqlite3.connect(":memory:")
    db.executescript(migration)
    now = "2026-09-27T09:30:00.000Z"
    db.execute(
        "INSERT INTO items (item_no,name,base_unit,is_active,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,1)",
        ("P0001", "測試商品", "盒", 1, now, now),
    )
    item_id = db.execute("SELECT id FROM items WHERE item_no='P0001'").fetchone()[0]
    db.execute(
        "INSERT INTO item_unit_conversions (item_id,from_unit,quantity,to_unit,sort_order) VALUES (?,?,?,?,?)",
        (item_id, "箱", 120000, "盒", 0),
    )
    db.execute(
        "INSERT INTO item_number_history (item_id,item_no,valid_from,valid_to,is_searchable,created_at) VALUES (?,?,?,?,1,?)",
        (item_id, "OLD-P0001", now, now, now),
    )
    if db.execute("SELECT COUNT(*) FROM item_unit_conversions WHERE item_id=?", (item_id,)).fetchone()[0] != 1:
        raise AssertionError("Item unit-conversion schema smoke check failed")
    if db.execute("SELECT COUNT(*) FROM item_number_history WHERE item_id=?", (item_id,)).fetchone()[0] != 1:
        raise AssertionError("Item number-history schema smoke check failed")

    print("PASS Item module foundation source/schema checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Item foundation validation: {exc}", file=sys.stderr)
        raise
