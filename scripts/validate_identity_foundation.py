#!/usr/bin/env python3
"""Zero-dependency structural checks for the CY Web Identity adapter foundation."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(path: str) -> Path:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target


def validate_source_contracts() -> None:
    contract = require("worker/identity/contract.ts").read_text(encoding="utf-8")
    access = require("worker/auth/app-access.ts").read_text(encoding="utf-8")
    doc = require("docs/architecture/IDENTITY_ADAPTER.md").read_text(encoding="utf-8")

    for role in ("EMPLOYEE", "ADMIN", "SUPER_ADMIN"):
        if role not in contract:
            raise AssertionError(f"missing shared Identity role: {role}")

    for field in ("employeeId", "employeeNo", "displayName", "workspaceId"):
        if field not in contract:
            raise AssertionError(f"missing normalized principal field: {field}")

    if "credential" in access.lower() or "password" in access.lower():
        raise AssertionError("app-local authorization must not copy credential/password logic")

    for token in ("app_members", "app_member_tags", "app_tag_modules"):
        if token not in access:
            raise AssertionError(f"app access service does not use expected table: {token}")

    if "CYAccountingWeb" not in doc or "CYInvoice" not in doc:
        raise AssertionError("Identity boundary document must state cross-project ownership limits")


def validate_schema_access_shape() -> None:
    schema = require("migrations/0001_initial.sql").read_text(encoding="utf-8")
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema)

    now = "2026-09-27T00:00:00Z"
    conn.execute(
        """
        INSERT INTO app_members(identity_employee_id, employee_no, is_active, created_at, updated_at)
        VALUES ('employee-1', '0001', 1, ?, ?)
        """,
        (now, now),
    )
    conn.execute(
        "INSERT INTO app_tags(code, name, is_active, updated_at) VALUES ('sales', 'Sales', 1, ?)",
        (now,),
    )
    conn.execute("INSERT INTO app_tag_modules(tag_id, module_code) VALUES (1, 'customer')")
    conn.execute("INSERT INTO app_member_tags(member_id, tag_id) VALUES (1, 1)")

    row = conn.execute(
        """
        SELECT 1
          FROM app_member_tags AS mt
          JOIN app_tags AS t ON t.id = mt.tag_id AND t.is_active = 1
          JOIN app_tag_modules AS tm ON tm.tag_id = t.id
         WHERE mt.member_id = 1 AND tm.module_code = 'customer'
         LIMIT 1
        """
    ).fetchone()
    if row != (1,):
        raise AssertionError("active tag/module grant was not resolved")

    conn.execute("UPDATE app_tags SET is_active = 0 WHERE id = 1")
    row = conn.execute(
        """
        SELECT 1
          FROM app_member_tags AS mt
          JOIN app_tags AS t ON t.id = mt.tag_id AND t.is_active = 1
          JOIN app_tag_modules AS tm ON tm.tag_id = t.id
         WHERE mt.member_id = 1 AND tm.module_code = 'customer'
         LIMIT 1
        """
    ).fetchone()
    if row is not None:
        raise AssertionError("inactive app tag must not grant module access")

    conn.close()


def main() -> int:
    validate_source_contracts()
    print("PASS identity source contracts")
    validate_schema_access_shape()
    print("PASS identity app-tag schema shape")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL identity foundation validation: {exc}", file=sys.stderr)
        raise
