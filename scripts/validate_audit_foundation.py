#!/usr/bin/env python3
"""Zero-dependency structural checks for the shared CY Web Audit Core foundation."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(path: str) -> Path:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target


def validate_source_contract() -> None:
    source = require("worker/audit/audit-service.ts").read_text(encoding="utf-8")
    doc = require("docs/architecture/AUDIT_CORE.md").read_text(encoding="utf-8")

    required_source_tokens = (
        "export class AuditService",
        "MAX_JSON_BYTES_EACH",
        "MAX_JSON_BYTES_TOTAL",
        "SECRET_KEY_PATTERN",
        "listTimeline",
        "listDetailed",
        "audit_events",
    )
    for token in required_source_tokens:
        if token not in source:
            raise AssertionError(f"missing AuditService contract token: {token}")

    if "ordinary CRUD" not in doc and "Ordinary CRUD" not in doc:
        raise AssertionError("Audit contract must preserve the ordinary-CRUD no-event boundary")
    if "CY Web only" not in doc:
        raise AssertionError("Audit contract must preserve CY Web-only scope")


def validate_schema_and_query_shape() -> None:
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
    before = json.dumps({"erpNo": "A001"}, ensure_ascii=False, separators=(",", ":"))
    after = json.dumps({"erpNo": "A002"}, ensure_ascii=False, separators=(",", ":"))
    conn.execute(
        """
        INSERT INTO audit_events(
            entity_type, entity_key, action, actor_employee_id, occurred_at,
            status_from, status_to, request_id, before_json, after_json
        ) VALUES ('sales_work_order', 'WO-1', 'erp_no_corrected', 1, ?, 'created', 'created', 'req-1', ?, ?)
        """,
        (now, before, after),
    )

    timeline = conn.execute(
        """
        SELECT ae.action, am.employee_no, ae.occurred_at, ae.status_from, ae.status_to
          FROM audit_events AS ae
          LEFT JOIN app_members AS am ON am.id = ae.actor_employee_id
         WHERE ae.entity_type = 'sales_work_order' AND ae.entity_key = 'WO-1'
         ORDER BY ae.occurred_at DESC, ae.id DESC
         LIMIT 30
        """
    ).fetchone()
    if timeline != ("erp_no_corrected", "0001", now, "created", "created"):
        raise AssertionError(f"unexpected timeline projection: {timeline!r}")

    detail = conn.execute(
        """
        SELECT before_json, after_json
          FROM audit_events
         WHERE entity_type = 'sales_work_order' AND entity_key = 'WO-1'
        """
    ).fetchone()
    if detail != (before, after):
        raise AssertionError("detailed Audit payload did not round-trip")

    conn.close()


def main() -> int:
    validate_source_contract()
    print("PASS audit source contract")
    validate_schema_and_query_shape()
    print("PASS audit schema/query shape")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL audit foundation validation: {exc}", file=sys.stderr)
        raise
