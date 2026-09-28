#!/usr/bin/env python3
"""Zero-dependency checks for Customer related mutation foundations."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def validate_sources() -> None:
    contract = require("shared/customer-related.ts")
    fixed_point = require("shared/fixed-point.ts")
    audit = require("worker/audit/audit-service.ts")
    validation = require("worker/customer/customer-related-validation.ts")
    mutation_repo = require("worker/customer/customer-related-mutation-repository.ts")
    service = require("worker/customer/customer-related-service.ts")
    doc = require("docs/architecture/CUSTOMER_RELATED_FOUNDATION.md")

    for token in (
        "CreateCustomerVisitRequest",
        "UpdateCustomerVisitRequest",
        "DeleteCustomerVisitRequest",
        "CreateCustomerFrequentItemRequest",
        "UpdateCustomerFrequentItemRequest",
        "CreateCustomerItemQuoteRequest",
        "CorrectCustomerItemQuoteRequest",
    ):
        if token not in contract:
            raise AssertionError(f"related mutation contract missing: {token}")

    for token in ("parseScaledInteger", "parseScaled4", "FIXED_POINT_FORMAT_INVALID"):
        if token not in fixed_point:
            raise AssertionError(f"fixed-point parser missing: {token}")

    for token in ("prepareRecord", "AuditInsertCondition", "INVALID_AUDIT_INSERT_CONDITION"):
        if token not in audit:
            raise AssertionError(f"transactional Audit foundation missing: {token}")

    for token in (
        "normalizeCreateVisitRequest",
        "normalizeUpdateFrequentItemRequest",
        "normalizeCreateQuoteRequest",
        "normalizeCorrectQuoteRequest",
        "正式商品與未建檔文字不可同時指定",
        "MAX_QUOTE_BREAKS",
    ):
        if token not in validation:
            raise AssertionError(f"related mutation validation missing: {token}")

    for token in (
        "class CustomerRelatedMutationRepository",
        "createVisit",
        "deleteVisit",
        'entityType: "customer_visit"',
        "createFrequentItem",
        "createQuote",
        "correctQuote",
        'entityType: "customer_item_quote"',
        'action: "corrected"',
        "db.batch",
    ):
        if token not in mutation_repo:
            raise AssertionError(f"related mutation persistence missing: {token}")

    for token in (
        "createVisit",
        "updateVisit",
        "deleteVisit",
        "createFrequentItem",
        "updateFrequentItem",
        "deleteFrequentItem",
        "createQuote",
        "correctQuote",
        "CUSTOMER_QUOTE_REVISION_CONFLICT",
    ):
        if token not in service:
            raise AssertionError(f"related mutation service missing: {token}")

    if "deleteQuote" in service or "DeleteCustomerItemQuoteRequest" in contract:
        raise AssertionError("Quote hard-delete was introduced without a confirmed decision")

    for token in (
        "Visit deletion",
        "exactly one identity path",
        "new quote",
        "correctQuote",
        "Quote hard-delete is deliberately not introduced",
    ):
        if token not in doc:
            raise AssertionError(f"related mutation boundary doc missing: {token}")


def validate_schema_semantics() -> None:
    schema = require("migrations/0001_initial.sql")
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema)
    now = "2026-09-27T06:30:00Z"
    later = "2026-09-27T06:31:00Z"

    conn.execute(
        "INSERT INTO app_members(identity_employee_id, employee_no, created_at, updated_at) VALUES ('identity-1', 'E001', ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO customers(customer_no, short_name, created_at, created_by, updated_at, updated_by) VALUES ('C001', '甲診所', ?, 1, ?, 1)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO customer_contacts(customer_id, name, is_active, created_at, updated_at) VALUES (1, '王小姐', 1, ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO items(item_no, name, base_unit, is_active, created_at, updated_at) VALUES ('A001', '正式商品', '盒', 1, ?, ?)",
        (now, now),
    )

    # Visit optimistic revision and audited hard delete.
    conn.execute(
        "INSERT INTO customer_visits(customer_id, visit_date, contact_id, person_snapshot, employee_id, content, created_at, created_by, updated_at, updated_by) VALUES (1, '2026-09-27', 1, '王小姐', 1, '初次拜訪', ?, 1, ?, 1)",
        (now, now),
    )
    changed = conn.execute(
        "UPDATE customer_visits SET content='更正內容', updated_at=?, revision=revision+1 WHERE id=1 AND revision=1",
        (later,),
    ).rowcount
    if changed != 1:
        raise AssertionError("Visit optimistic revision update failed")
    stale = conn.execute(
        "UPDATE customer_visits SET content='不應成功' WHERE id=1 AND revision=1"
    ).rowcount
    if stale != 0:
        raise AssertionError("stale Visit revision unexpectedly updated")

    before_visit = {
        "customerId": 1,
        "visitDate": "2026-09-27",
        "personSnapshot": "王小姐",
        "content": "更正內容",
        "revision": 2,
    }
    conn.execute(
        "INSERT INTO audit_events(entity_type, entity_key, action, actor_employee_id, occurred_at, before_json, metadata_json) VALUES ('customer_visit', '1', 'deleted', 1, ?, ?, ?)",
        (later, json.dumps(before_visit, ensure_ascii=False), json.dumps({"customerId": 1})),
    )
    conn.execute("DELETE FROM customer_visits WHERE id=1 AND customer_id=1 AND revision=2")
    if conn.execute("SELECT COUNT(*) FROM audit_events WHERE entity_type='customer_visit' AND action='deleted'").fetchone() != (1,):
        raise AssertionError("Visit delete audit evidence missing")

    # Frequent Item allows either formal relation or free text, never both.
    conn.execute(
        "INSERT INTO customer_frequent_items(customer_id, item_id, sort_order, created_at, updated_at) VALUES (1, 1, 0, ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO customer_frequent_items(customer_id, custom_item_name, custom_category_name, sort_order, created_at, updated_at) VALUES (1, '未建檔耗材', '診所用品', 1, ?, ?)",
        (now, now),
    )
    try:
        conn.execute(
            "INSERT INTO customer_frequent_items(customer_id, item_id, custom_item_name, sort_order, created_at, updated_at) VALUES (1, 1, '錯誤混用', 2, ?, ?)",
            (now, now),
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Frequent Item accepted formal + free-text identity together")

    current_token = conn.execute("SELECT updated_at FROM customer_frequent_items WHERE id=1").fetchone()[0]
    changed = conn.execute(
        "UPDATE customer_frequent_items SET sort_order=3, updated_at=? WHERE id=1 AND updated_at=?",
        (later, current_token),
    ).rowcount
    if changed != 1:
        raise AssertionError("Frequent Item timestamp concurrency update failed")
    stale = conn.execute(
        "UPDATE customer_frequent_items SET sort_order=4 WHERE id=1 AND updated_at=?",
        (current_token,),
    ).rowcount
    if stale != 0:
        raise AssertionError("stale Frequent Item timestamp unexpectedly updated")

    # New quote creates history; correction keeps identity and adds Audit evidence.
    conn.execute(
        "INSERT INTO customer_item_quotes(customer_id, item_id, quote_date, employee_id, item_no_snapshot, item_name_snapshot, created_at, created_by, updated_at, updated_by) VALUES (1, 1, '2026-09-20', 1, 'A001', '正式商品', ?, 1, ?, 1)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO quote_price_breaks(quote_id, quantity, unit, unit_price, note, sort_order) VALUES (1, 100000, '盒', 950000, NULL, 0)"
    )
    before_quote = {
        "customerId": 1,
        "itemId": 1,
        "quoteDate": "2026-09-20",
        "priceBreaks": [{"quantity": "10", "unit": "盒", "unitPrice": "95"}],
        "revision": 1,
    }
    after_quote = {
        "customerId": 1,
        "itemId": 1,
        "quoteDate": "2026-09-20",
        "priceBreaks": [{"quantity": "10", "unit": "盒", "unitPrice": "96"}],
        "revision": 2,
    }
    conn.execute(
        "INSERT INTO audit_events(entity_type, entity_key, action, actor_employee_id, occurred_at, before_json, after_json) VALUES ('customer_item_quote', '1', 'corrected', 1, ?, ?, ?)",
        (later, json.dumps(before_quote, ensure_ascii=False), json.dumps(after_quote, ensure_ascii=False)),
    )
    conn.execute(
        "UPDATE customer_item_quotes SET updated_at=?, updated_by=1, revision=revision+1 WHERE id=1 AND revision=1",
        (later,),
    )
    conn.execute("DELETE FROM quote_price_breaks WHERE quote_id=1")
    conn.execute(
        "INSERT INTO quote_price_breaks(quote_id, quantity, unit, unit_price, note, sort_order) VALUES (1, 100000, '盒', 960000, NULL, 0)"
    )
    if conn.execute("SELECT revision FROM customer_item_quotes WHERE id=1").fetchone() != (2,):
        raise AssertionError("Quote correction revision did not advance")
    if conn.execute("SELECT COUNT(*) FROM audit_events WHERE entity_type='customer_item_quote' AND action='corrected'").fetchone() != (1,):
        raise AssertionError("Quote correction Audit evidence missing")

    conn.execute(
        "INSERT INTO customer_item_quotes(customer_id, item_id, quote_date, employee_id, item_no_snapshot, item_name_snapshot, created_at, created_by, updated_at, updated_by) VALUES (1, 1, '2026-09-27', 1, 'A001', '正式商品', ?, 1, ?, 1)",
        (later, later),
    )
    if conn.execute("SELECT COUNT(*) FROM customer_item_quotes WHERE customer_id=1 AND item_id=1").fetchone() != (2,):
        raise AssertionError("new commercial Quote overwrote history instead of creating a new record")

    conn.close()


def main() -> int:
    validate_sources()
    print("PASS Customer related mutation source contracts")
    validate_schema_semantics()
    print("PASS Customer related mutation schema semantics")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer related mutation validation: {exc}", file=sys.stderr)
        raise
