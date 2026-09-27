#!/usr/bin/env python3
"""Zero-dependency checks for Customer persistence and related-record foundations."""

from __future__ import annotations

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
    persistence = require("worker/customer/customer-persistence.ts")
    child = require("worker/customer/customer-child-persistence.ts")
    service = require("worker/customer/customer-service.ts")
    related_repo = require("worker/customer/customer-related-repository.ts")
    related_service = require("worker/customer/customer-related-service.ts")
    related_contract = require("shared/customer-related.ts")
    fixed_point = require("shared/fixed-point.ts")
    doc = require("docs/architecture/CUSTOMER_RELATED_FOUNDATION.md")

    for token in (
        "class CustomerPersistence",
        "buildCreateCustomerChildStatements",
        "buildUpdateCustomerChildStatements",
        "revision = revision + 1",
        "db.batch",
    ):
        if token not in persistence:
            raise AssertionError(f"Customer persistence missing: {token}")

    for token in (
        "retainReferencedAndDeleteOmittedContacts",
        "is_active = 0",
        "customer_visits",
        "NOT EXISTS",
    ):
        if token not in child:
            raise AssertionError(f"Customer child-retention safeguard missing: {token}")

    for token in ("async create", "async update", "CUSTOMER_REVISION_CONFLICT"):
        if token not in service:
            raise AssertionError(f"Customer service persistence wiring missing: {token}")

    for token in (
        "listVisits",
        "listFrequentItems",
        "listQuotes",
        "getQuoteDetail",
        "formatScaled4",
    ):
        if token not in related_repo:
            raise AssertionError(f"Customer related repository missing: {token}")

    for token in ("class CustomerRelatedService", "requireCustomer", "CUSTOMER_QUOTE_NOT_FOUND"):
        if token not in related_service:
            raise AssertionError(f"Customer related service missing: {token}")

    for token in (
        "CustomerVisitRecord",
        "CustomerFrequentItemRecord",
        "CustomerItemQuoteSummary",
        "CustomerItemQuoteDetail",
    ):
        if token not in related_contract:
            raise AssertionError(f"Customer related shared contract missing: {token}")

    for token in ("formatScaledInteger", "formatScaled4", "formatMoney2"):
        if token not in fixed_point:
            raise AssertionError(f"Fixed-point helper missing: {token}")

    for token in (
        "D1 `batch()` transaction",
        "Visit-referenced",
        "related-record **read** services only",
        "BD-022",
    ):
        if token not in doc:
            raise AssertionError(f"Customer related boundary doc missing: {token}")


def validate_schema_semantics() -> None:
    schema = require("migrations/0001_initial.sql")
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema)
    now = "2026-09-27T05:00:00Z"

    conn.execute(
        "INSERT INTO app_members(identity_employee_id, employee_no, created_at, updated_at) VALUES (?, ?, ?, ?)",
        ("identity-1", "E001", now, now),
    )
    conn.execute(
        "INSERT INTO customers(customer_no, short_name, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, 1)",
        ("C001", "甲診所", now, now),
    )
    conn.execute(
        "INSERT INTO customer_contacts(customer_id, name, sort_order, is_active, created_at, updated_at) VALUES (1, ?, 0, 1, ?, ?)",
        ("王小姐", now, now),
    )
    conn.execute(
        "INSERT INTO customer_visits(customer_id, visit_date, contact_id, person_snapshot, employee_id, content, created_at, created_by, updated_at, updated_by) VALUES (1, '2026-09-27', 1, ?, 1, ?, ?, 1, ?, 1)",
        ("王小姐", "拜訪內容", now, now),
    )

    # Visit-time person text must remain historical even when Contact changes.
    conn.execute("UPDATE customer_contacts SET name='王主任' WHERE id=1")
    snapshot = conn.execute("SELECT person_snapshot FROM customer_visits WHERE id=1").fetchone()
    if snapshot != ("王小姐",):
        raise AssertionError("Visit person snapshot changed with Contact master")

    # Visit-referenced Contact is protected by FK RESTRICT and therefore must be retained/deactivated.
    try:
        conn.execute("DELETE FROM customer_contacts WHERE id=1")
    except sqlite3.IntegrityError:
        conn.rollback()
    else:
        raise AssertionError("Visit-referenced Contact unexpectedly deleted")

    # Recreate after rollback of the attempted delete transaction state if needed.
    contact = conn.execute("SELECT id FROM customer_contacts WHERE id=1").fetchone()
    if contact is None:
        raise AssertionError("referenced Contact retention failed")
    conn.execute("UPDATE customer_contacts SET is_active=0 WHERE id=1")
    if conn.execute("SELECT is_active FROM customer_contacts WHERE id=1").fetchone() != (0,):
        raise AssertionError("referenced Contact could not be deactivated")

    conn.execute(
        "INSERT INTO items(item_no, name, base_unit, created_at, updated_at) VALUES ('A001', '正式商品', '盒', ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO customer_frequent_items(customer_id, item_id, sort_order, created_at, updated_at) VALUES (1, 1, 0, ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO customer_frequent_items(customer_id, custom_item_name, custom_category_name, sort_order, created_at, updated_at) VALUES (1, '未建檔耗材', '診所用品', 1, ?, ?)",
        (now, now),
    )
    if conn.execute("SELECT COUNT(*) FROM customer_frequent_items WHERE customer_id=1").fetchone() != (2,):
        raise AssertionError("formal/free-text Frequent Item semantics failed")

    conn.execute(
        "INSERT INTO customer_item_quotes(customer_id, item_id, quote_date, employee_id, item_no_snapshot, item_name_snapshot, created_at, created_by, updated_at, updated_by) VALUES (1, 1, '2026-09-20', 1, 'A001', '正式商品', ?, 1, ?, 1)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO quote_price_breaks(quote_id, quantity, unit, unit_price, sort_order) VALUES (1, 100000, '盒', 950000, 0)",
    )
    conn.execute(
        "INSERT INTO customer_item_quotes(customer_id, item_id, quote_date, employee_id, item_no_snapshot, item_name_snapshot, created_at, created_by, updated_at, updated_by) VALUES (1, 1, '2026-09-27', 1, 'A001', '正式商品', ?, 1, ?, 1)",
        (now, now),
    )
    if conn.execute("SELECT COUNT(*) FROM customer_item_quotes WHERE customer_id=1 AND item_id=1").fetchone() != (2,):
        raise AssertionError("Quote history was collapsed instead of preserved")

    conn.close()


def main() -> int:
    validate_sources()
    print("PASS Customer persistence/related source contracts")
    validate_schema_semantics()
    print("PASS Customer persistence/related schema semantics")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer persistence/related validation: {exc}", file=sys.stderr)
        raise
