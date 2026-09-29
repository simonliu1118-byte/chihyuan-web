#!/usr/bin/env python3
"""Validate the CY Web direct Employee × Module Access boundary."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_MODULES = {
    "CUSTOMERS",
    "ITEMS",
    "DEFECTS",
    "ORDERS",
    "OUTSOURCING",
    "WORKLOGS",
}


def require(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def schema() -> str:
    files = sorted((ROOT / "migrations").glob("*.sql"))
    if not files:
        raise AssertionError("missing migrations")
    return "\n\n".join(path.read_text(encoding="utf-8") for path in files)


def validate_source_contract() -> None:
    catalog = require("shared/modules.ts")
    access = require("worker/auth/app-access.ts")
    routes = require("worker/http/module-access-routes.ts")
    index = require("worker/index.ts")
    browser_client = require("src/access/module-access-client.ts")
    app = require("src/App.tsx")
    identity_ui = require("src/identity/SharedIdentityPage.tsx")
    api_doc = require("docs/architecture/API_CONTRACT.md")
    identity_doc = require("docs/architecture/IDENTITY_ADAPTER.md")

    for module in EXPECTED_MODULES:
        if f'"{module}"' not in catalog:
            raise AssertionError(f"module catalog missing: {module}")

    for token in (
        "app_member_module_access",
        "allowedModuleCodes",
        "checkModuleAccess",
        'principal.workspaceRole === "SUPER_ADMIN"',
    ):
        if token not in access:
            raise AssertionError(f"runtime Module Access service missing: {token}")

    for forbidden in ("JOIN app_member_tags", "JOIN app_tag_modules"):
        if forbidden in access:
            raise AssertionError(f"legacy tag authority still present in runtime Module Access: {forbidden}")

    for path in ("/api/module-access", "/api/module-access/admin"):
        if path not in routes:
            raise AssertionError(f"Module Access route contract missing: {path}")
    for pattern in ("module-access\\/check", "module-access\\/admin\\/employees", "\\/modules\\/"):
        if pattern not in routes:
            raise AssertionError(f"Module Access regex route contract missing: {pattern}")

    for token in (
        "requireIdentity",
        "requireModuleAccess",
        "SELF_ACCESS_CHANGE_NOT_ALLOWED",
        "SUPER_ADMIN_ACCESS_PROTECTED",
        "IDENTITY_UNAVAILABLE",
        "env.DB.batch",
        "module_access.updated",
    ):
        if token not in routes:
            raise AssertionError(f"Module Access server enforcement missing: {token}")

    if "handleModuleAccessRoute" not in index:
        raise AssertionError("Worker index does not route Module Access API")

    for token in ("loadCurrentModuleAccess", "loadModuleAccessAdminSnapshot", "setEmployeeModuleAccess", "checkModuleAccess"):
        if token not in browser_client:
            raise AssertionError(f"Module Access browser client missing: {token}")

    for token in ("loadCurrentModuleAccess", "checkModuleAccess", "moduleCodeForRoute", "allowedModules"):
        if token not in app:
            raise AssertionError(f"App shell Module Access filtering/check missing: {token}")

    for token in ("ModuleAccessPanel", "CY Web 模組使用權", "setEmployeeModuleAccess"):
        if token not in identity_ui:
            raise AssertionError(f"account-management Module Access UI missing: {token}")

    for doc in (api_doc, identity_doc):
        if "app_member_module_access" not in doc:
            raise AssertionError("canonical Module Access document does not identify direct authority")
        if "navigation" in doc.lower() and "authorization" not in doc.lower():
            raise AssertionError("Module Access document must not imply navigation is authority")


def validate_schema_contract() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema())
    now = "2026-09-30T00:00:00Z"

    columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(app_member_module_access)")
    }
    expected_columns = {"member_id", "module_code", "enabled", "updated_at", "updated_by"}
    if columns != expected_columns:
        raise AssertionError(f"direct Module Access columns mismatch: {sorted(columns)}")

    conn.execute(
        """
        INSERT INTO app_members(identity_employee_id, employee_no, is_active, created_at, updated_at)
        VALUES ('employee-1', '3001', 1, ?, ?), ('employee-2', '3002', 1, ?, ?)
        """,
        (now, now, now, now),
    )
    conn.execute(
        """
        INSERT INTO app_member_module_access(member_id, module_code, enabled, updated_at, updated_by)
        VALUES (2, 'CUSTOMERS', 1, ?, 1)
        """,
        (now,),
    )
    row = conn.execute(
        """
        SELECT enabled, updated_by
          FROM app_member_module_access
         WHERE member_id = 2 AND module_code = 'CUSTOMERS'
        """
    ).fetchone()
    if row != (1, 1):
        raise AssertionError(f"direct Module Access grant did not persist: {row!r}")

    try:
        conn.execute(
            """
            INSERT INTO app_member_module_access(member_id, module_code, enabled, updated_at)
            VALUES (2, 'UNKNOWN', 1, ?)
            """,
            (now,),
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("unknown module code was accepted")

    conn.execute(
        """
        INSERT INTO audit_events(
            entity_type, entity_key, action, actor_employee_id, occurred_at,
            before_json, after_json, metadata_json
        ) VALUES(
            'module_access', 'employee-2:CUSTOMERS', 'module_access.updated',
            1, ?, '{"enabled":false}', '{"enabled":true}',
            '{"targetEmployeeId":"employee-2","moduleCode":"CUSTOMERS"}'
        )
        """,
        (now,),
    )
    audit = conn.execute(
        "SELECT action FROM audit_events WHERE entity_key='employee-2:CUSTOMERS'"
    ).fetchone()
    if audit != ("module_access.updated",):
        raise AssertionError("Module Access audit shape did not persist")

    conn.close()


def main() -> int:
    validate_source_contract()
    print("PASS Module Access source/server/UI contract")
    validate_schema_contract()
    print("PASS direct Employee × Module D1 authority")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Module Access validation: {exc}", file=sys.stderr)
        raise
