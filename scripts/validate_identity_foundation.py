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


def migration_schema() -> str:
    files = sorted((ROOT / "migrations").glob("*.sql"))
    if not files:
        raise AssertionError("missing migrations")
    return "\n\n".join(path.read_text(encoding="utf-8") for path in files)


def validate_source_contracts() -> None:
    contract = require("worker/identity/contract.ts").read_text(encoding="utf-8")
    provider = require("worker/identity/cycloud-identity-adapter.ts").read_text(encoding="utf-8")
    routes = require("worker/http/auth-routes.ts").read_text(encoding="utf-8")
    access = require("worker/auth/app-access.ts").read_text(encoding="utf-8")
    auth_ui = require("src/auth/AuthGate.tsx").read_text(encoding="utf-8")
    management_routes = require("worker/http/identity-management-routes.ts").read_text(encoding="utf-8")
    doc = require("docs/architecture/IDENTITY_ADAPTER.md").read_text(encoding="utf-8")

    for field in (
        "workspaceId",
        "employeeId",
        "employeeNo",
        "displayName",
        "workspaceRole",
        "isIdentityAdmin",
        "emailVerified",
        "isWorkspaceSuperAdmin",
        "credentialVersion",
        "employeeRevision",
    ):
        if field not in contract:
            raise AssertionError(f"missing normalized principal field: {field}")

    for role in ("SUPER_ADMIN", "ADMIN", "USER"):
        if role not in contract:
            raise AssertionError(f"missing Workspace role contract: {role}")

    for token in (
        "/v1/identity/login",
        "/v1/identity/session/resolve",
        "/v1/identity/logout",
        "/v1/identity/first-login/complete",
        "cyweb_first_login",
        "cyif_",
        "reloginRequired",
        "workspaceRole",
        "isIdentityAdmin",
        "emailVerified",
        "x-identity-application",
        "cyweb_identity_session",
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
    ):
        if token not in provider:
            raise AssertionError(f"CYCloud Identity adapter missing expected token: {token}")

    for forbidden in (
        "credential_verifier",
        "pbkdf2",
        "scrypt",
        "password_hash",
        "password_verifier",
    ):
        if forbidden.lower() in provider.lower():
            raise AssertionError(f"CY Web copied credential internals: {forbidden}")

    for path in ("/api/auth/login", "/api/auth/first-login/complete", "/api/auth/me", "/api/auth/logout"):
        if path not in routes:
            raise AssertionError(f"auth route missing: {path}")

    for token in ("FIRST_LOGIN_REQUIRED", "FIRST_LOGIN_PASSWORD_EXPIRED", "clearFirstLoginCookie"):
        if token not in routes:
            raise AssertionError(f"CY Web auth routes missing first-login boundary: {token}")

    for token in ("IDENTITY_APPLICATION_ID", "IDENTITY_WORKSPACE_ID", "IDENTITY"):
        if token not in routes:
            raise AssertionError(f"auth routes missing deployment-injected Identity value: {token}")

    if "8" not in routes or "16" not in routes:
        raise AssertionError("CY Web login route must enforce the shared 8-16 character password boundary")

    forbidden_credential_logic = (
        "credential_verifier",
        "verifyPassword",
        "pbkdf2",
        "scrypt",
        "password_hash",
        "password_verifier",
    )
    lowered_access = access.lower()
    for token in forbidden_credential_logic:
        if token.lower() in lowered_access:
            raise AssertionError(f"app-local authorization contains credential logic: {token}")

    for token in ("app_members", "app_member_tags", "app_tag_modules", "workspaceRole", "SUPER_ADMIN"):
        if token not in access:
            raise AssertionError(f"app access service missing expected boundary token: {token}")

    if "groupKeys" in access:
        raise AssertionError("CY Web module authorization must not derive authority from legacy Identity Groups")

    if "啟用帳號" in auth_ui or "startEmployeeActivation" in auth_ui or "confirmEmployeeActivation" in auth_ui:
        raise AssertionError("CY Web login UI must not expose the legacy activation flow")
    for token in ("完成 Email 驗證", "設定正式密碼", "completeFirstLogin"):
        if token not in auth_ui:
            raise AssertionError(f"CY Web first-login UI missing expected token: {token}")

    for legacy_path in ("/api/identity/activation/start", "/api/identity/activation/confirm"):
        if legacy_path in management_routes:
            raise AssertionError(f"legacy public activation route must not remain exposed: {legacy_path}")

    if "CYCloud Identity" not in doc:
        raise AssertionError("Identity boundary document must name the concrete shared authority")
    if "CYAccountingWeb" not in doc or "CYInvoice" not in doc:
        raise AssertionError("Identity boundary document must state cross-project ownership limits")


def validate_schema_access_shape() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(migration_schema())

    now = "2026-09-29T00:00:00Z"
    conn.execute(
        """
        INSERT INTO app_members(identity_employee_id, employee_no, is_active, created_at, updated_at)
        VALUES ('employee-1', '3001', 1, ?, ?)
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

    web_sessions = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='web_sessions'"
    ).fetchone()
    if web_sessions is not None:
        raise AssertionError("CY Web must not retain a competing local Identity session table")

    conn.close()


def main() -> int:
    validate_source_contracts()
    print("PASS CYCloud Identity 0.3 source contracts")
    validate_schema_access_shape()
    print("PASS Identity app-tag/schema authority split")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL identity foundation validation: {exc}", file=sys.stderr)
        raise
