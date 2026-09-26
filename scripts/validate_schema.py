#!/usr/bin/env python3
"""Local zero-dependency smoke validation for the CY Web initial D1 schema draft.

This intentionally uses Python's stdlib sqlite3 so the schema can be checked without
spending GitHub Actions minutes. It validates SQLite syntax/foreign keys and a few
high-value contracts that were explicitly confirmed during architecture review.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0001_initial.sql"

EXPECTED_TABLES = {
    "app_member_tags",
    "app_members",
    "app_tag_modules",
    "app_tags",
    "audit_events",
    "backup_copies",
    "backup_sets",
    "bom_components",
    "bom_recipes",
    "contractor_contacts",
    "contractor_pricing",
    "contractor_stock_movements",
    "contractors",
    "customer_addresses",
    "customer_categories",
    "customer_contacts",
    "customer_frequent_items",
    "customer_item_quotes",
    "customer_notes",
    "customer_phones",
    "customer_statuses",
    "customer_visits",
    "customers",
    "defect_reports",
    "departments",
    "item_categories",
    "item_number_history",
    "item_unit_conversions",
    "items",
    "outsourcing_order_parts",
    "outsourcing_orders",
    "outsourcing_pricing_items",
    "outsourcing_pricings",
    "outsourcing_receipt_items",
    "outsourcing_receipts",
    "quote_price_breaks",
    "regions",
    "sales_work_order_items",
    "sales_work_orders",
    "work_log_categories",
    "work_log_entries",
    "work_log_entry_categories",
    "work_log_platforms",
    "work_log_scoring_config",
    "work_log_scoring_rows",
    "work_logs",
}


def load_schema() -> str:
    if not MIGRATION.is_file():
        raise AssertionError(f"missing migration: {MIGRATION}")
    return MIGRATION.read_text(encoding="utf-8")


def new_db(schema: str) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema)
    return conn


def assert_integrity_error(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> None:
    try:
        conn.execute(sql, params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError(f"expected integrity failure, but statement succeeded: {sql}")


def seed_member(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        INSERT INTO app_members(
            identity_employee_id, employee_no, is_active, created_at, updated_at
        ) VALUES (?, ?, 1, ?, ?)
        """,
        ("emp-1", "E001", "2026-09-27T00:00:00Z", "2026-09-27T00:00:00Z"),
    )


def validate_schema_shape(schema: str) -> None:
    conn = new_db(schema)
    violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise AssertionError(f"foreign-key violations after schema creation: {violations}")

    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    missing = EXPECTED_TABLES - tables
    unexpected = tables - EXPECTED_TABLES
    if missing or unexpected:
        raise AssertionError(f"table-set mismatch; missing={sorted(missing)}, unexpected={sorted(unexpected)}")
    conn.close()


def validate_customer_number_and_visit_fk(schema: str) -> None:
    conn = new_db(schema)
    seed_member(conn)
    now = "2026-09-27T00:00:00Z"
    conn.execute(
        "INSERT INTO customers(short_name, created_at, updated_at) VALUES ('甲診所', ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO customers(short_name, created_at, updated_at) VALUES ('乙診所', ?, ?)",
        (now, now),
    )
    conn.execute("UPDATE customers SET customer_no='A001' WHERE id=1")
    assert_integrity_error(conn, "UPDATE customers SET customer_no='A001' WHERE id=2")
    assert_integrity_error(
        conn,
        """
        INSERT INTO customer_visits(customer_id, visit_date, employee_id, created_at, updated_at)
        VALUES (999, '2026-09-27', 1, ?, ?)
        """,
        (now, now),
    )
    conn.close()


def validate_order_customer_modes(schema: str) -> None:
    conn = new_db(schema)
    seed_member(conn)
    now = "2026-09-27T00:00:00Z"

    # Name-only field entry is intentionally legal before internal staff reconciles the Customer.
    conn.execute(
        """
        INSERT INTO sales_work_orders(
            work_order_ref, customer_id, customer_no_snapshot, customer_name_snapshot,
            order_date, operator_employee_id, status_code, created_at, updated_at
        ) VALUES ('O1', NULL, NULL, '未知診所', '2026-09-27', 1, 'created', ?, ?)
        """,
        (now, now),
    )

    # An unlinked order may not pretend to carry a formal Customer number.
    assert_integrity_error(
        conn,
        """
        INSERT INTO sales_work_orders(
            work_order_ref, customer_id, customer_no_snapshot, customer_name_snapshot,
            order_date, operator_employee_id, status_code, created_at, updated_at
        ) VALUES ('O2', NULL, 'A001', '未知診所', '2026-09-27', 1, 'created', ?, ?)
        """,
        (now, now),
    )
    conn.close()


def validate_contact_history_retention(schema: str) -> None:
    conn = new_db(schema)
    seed_member(conn)
    now = "2026-09-27T00:00:00Z"
    conn.execute(
        "INSERT INTO customers(short_name, created_at, updated_at) VALUES ('甲診所', ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO customer_contacts(customer_id, name, created_at, updated_at) VALUES (1, '王先生', ?, ?)",
        (now, now),
    )
    conn.execute(
        """
        INSERT INTO customer_visits(
            customer_id, visit_date, contact_id, person_snapshot, employee_id, created_at, updated_at
        ) VALUES (1, '2026-09-27', 1, '王先生', 1, ?, ?)
        """,
        (now, now),
    )
    assert_integrity_error(conn, "DELETE FROM customer_contacts WHERE id=1")
    conn.close()


def validate_worklog_cancel_review_shape(schema: str) -> None:
    conn = new_db(schema)
    seed_member(conn)
    now = "2026-09-27T00:00:00Z"

    # pending_review must not retain the cancelled review's current-effective fields.
    assert_integrity_error(
        conn,
        """
        INSERT INTO work_logs(
            work_log_ref, log_date, date_from, date_to, work_days, type_code,
            employee_id, status_code, review_remark, created_at, updated_at
        ) VALUES (
            'L1', '2026-09-27', '2026-09-27', '2026-09-27', 10000, 'art',
            1, 'pending_review', 'stale review', ?, ?
        )
        """,
        (now, now),
    )

    conn.execute(
        """
        INSERT INTO work_logs(
            work_log_ref, log_date, date_from, date_to, work_days, type_code,
            employee_id, status_code, reviewed_by, reviewed_at, review_remark,
            final_score, average_daily_score, created_at, updated_at
        ) VALUES (
            'L2', '2026-09-27', '2026-09-27', '2026-09-27', 10000, 'art',
            1, 'reviewed', 1, ?, 'ok', 100000, 100000, ?, ?
        )
        """,
        (now, now, now),
    )
    conn.close()


def validate_audit_generic_entity_key(schema: str) -> None:
    conn = new_db(schema)
    seed_member(conn)
    conn.execute(
        """
        INSERT INTO audit_events(entity_type, entity_key, action, actor_employee_id, occurred_at)
        VALUES ('backup', 'CYWeb-20260927T000000Z', 'restore_started', 1, '2026-09-27T00:00:00Z')
        """
    )
    conn.close()


def main() -> int:
    schema = load_schema()
    checks = [
        validate_schema_shape,
        validate_customer_number_and_visit_fk,
        validate_order_customer_modes,
        validate_contact_history_retention,
        validate_worklog_cancel_review_shape,
        validate_audit_generic_entity_key,
    ]
    for check in checks:
        check(schema)
        print(f"PASS {check.__name__}")

    print(f"PASS initial schema: {len(EXPECTED_TABLES)} tables, {len(checks)} validation groups")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL schema validation: {exc}", file=sys.stderr)
        raise
