#!/usr/bin/env python3
"""Zero-dependency source/schema checks for Settings/Admin authority foundation."""

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


def source_checks() -> None:
    shared = read("shared/settings.ts")
    service = read("worker/settings/settings-service.ts")
    doc = read("docs/architecture/SETTINGS_ADMIN_MODULE_CONTRACT.md")

    for token in ["StructuralLookupKind", "AppTagSetting", "SetMemberTagsRequest", "WorkLogScoringRowSetting", "SettingsSnapshot"]:
        if token not in shared:
            raise AssertionError(f"missing settings shared token: {token}")
    for token in ["assertSuperAdmin", "assertAdmin", "createStructuralLookup", "updateAppTag", "setMemberTags", "upsertWorkLogScoringRow", "updateWorkLogScoringConfig", "AuditService"]:
        if token not in service:
            raise AssertionError(f"missing settings service token: {token}")
    for token in ["Super Admin only", "Admin or Super Admin", "Public source", "double-confirmation", "updated_at"]:
        if token.lower() not in doc.lower():
            raise AssertionError(f"missing settings contract rule: {token}")


def schema_checks() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema())
    now = "2026-09-27T10:00:00Z"
    conn.execute("INSERT INTO app_members(identity_employee_id,employee_no,is_active,created_at,updated_at) VALUES('e1','E001',1,?,?)", (now, now))
    conn.execute("INSERT INTO departments(code,name,sort_order,is_active,updated_at,updated_by) VALUES('d1','Department',0,1,?,1)", (now,))
    conn.execute("INSERT INTO app_tags(code,name,sort_order,is_active,updated_at,updated_by) VALUES('sales','Sales',0,1,?,1)", (now,))
    conn.execute("INSERT INTO app_tag_modules(tag_id,module_code) VALUES(1,'customer')")
    conn.execute("INSERT INTO app_member_tags(member_id,tag_id) VALUES(1,1)")
    conn.execute("INSERT INTO work_log_categories(code,name,input_mode,sort_order,is_active,updated_at,updated_by) VALUES('c1','Example','boolean',0,1,?,1)", (now,))
    conn.execute("INSERT INTO work_log_scoring_rows(work_log_category_id,score_value,sort_order,is_active,updated_at,updated_by) VALUES(1,10000,0,1,?,1)", (now,))
    try:
        conn.execute("INSERT INTO work_log_scoring_rows(work_log_category_id,score_value,sort_order,is_active,updated_at,updated_by) VALUES(1,20000,1,1,?,1)", (now,))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("schema accepted duplicate category-linked scoring row")
    conn.execute("INSERT INTO work_log_scoring_config(id,target_average_daily_score,minimum_average_daily_score,updated_at,updated_by,revision) VALUES(1,100000,50000,?,1,1)", (now,))
    row = conn.execute("SELECT revision FROM work_log_scoring_config WHERE id=1").fetchone()
    if row != (1,):
        raise AssertionError("WorkLog scoring config singleton fixture failed")
    conn.close()


def main() -> int:
    source_checks()
    print("PASS Settings/Admin source contracts")
    schema_checks()
    print("PASS Settings/Admin schema contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
