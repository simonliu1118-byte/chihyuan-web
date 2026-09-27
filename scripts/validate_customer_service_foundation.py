#!/usr/bin/env python3
"""Zero-dependency checks for the Customer repository/service foundation."""

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
    repository = require("worker/customer/customer-repository.ts")
    service = require("worker/customer/customer-service.ts")
    validation = require("worker/customer/customer-validation.ts")
    contract = require("shared/customer.ts")
    doc = require("docs/architecture/CUSTOMER_SERVICE_FOUNDATION.md")

    for token in (
        "class CustomerRepository",
        "async search",
        "async getDetail",
        "findTaxIdMatches",
        "validateReferences",
        "findForeignChildIds",
    ):
        if token not in repository:
            raise AssertionError(f"Customer repository missing: {token}")

    for token in (
        "CUSTOMER_REVISION_CONFLICT",
        "CUSTOMER_NO_CONTROLLED_ACTION_REQUIRED",
        "DUPLICATE_TAX_ID_CONFIRM_REQUIRED",
        "expectedRevision",
        "findForeignChildIds",
    ):
        if token not in service:
            raise AssertionError(f"Customer service safeguard missing: {token}")

    for token in (
        "統一編號需為 8 碼數字",
        "MAX_PROFILE_ROWS",
        "normalizeCreateCustomerRequest",
        "normalizeUpdateCustomerRequest",
    ):
        if token not in validation:
            raise AssertionError(f"Customer validation missing: {token}")

    for token in (
        "CustomerSearchQuery",
        "CustomerDetail",
        "expectedRevision",
        "confirmDuplicateTaxId",
    ):
        if token not in contract:
            raise AssertionError(f"Customer shared contract missing: {token}")

    for token in (
        "on demand",
        "child-row ownership",
        "Shared Identity",
        "does not by itself",
    ):
        if token not in doc:
            raise AssertionError(f"Customer service boundary doc missing: {token}")


def validate_schema_semantics() -> None:
    schema = require("migrations/0001_initial.sql")
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema)
    now = "2026-09-27T00:00:00Z"

    conn.execute(
        "INSERT INTO customers(customer_no, short_name, tax_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ("C001", "甲診所", "12345678", now, now),
    )
    conn.execute(
        "INSERT INTO customers(customer_no, short_name, tax_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ("C002", "乙診所", "12345678", now, now),
    )

    # Tax ID duplicates are deliberately legal.
    count = conn.execute("SELECT COUNT(*) FROM customers WHERE tax_id='12345678'").fetchone()[0]
    if count != 2:
        raise AssertionError("duplicate Tax ID contract was not preserved")

    # Customer number remains unique when present.
    try:
        conn.execute(
            "INSERT INTO customers(customer_no, short_name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("C001", "丙診所", now, now),
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("duplicate Customer number unexpectedly succeeded")

    conn.execute(
        "INSERT INTO customer_phones(customer_id, phone_number, sort_order, created_at, updated_at) VALUES (1, '07-1111-1111', 0, ?, ?)",
        (now, now),
    )
    owner = conn.execute("SELECT customer_id FROM customer_phones WHERE id=1").fetchone()
    if owner != (1,):
        raise AssertionError("Customer child ownership shape is invalid")

    conn.close()


def main() -> int:
    validate_sources()
    print("PASS Customer service source contracts")
    validate_schema_semantics()
    print("PASS Customer service schema semantics")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer service foundation validation: {exc}", file=sys.stderr)
        raise
