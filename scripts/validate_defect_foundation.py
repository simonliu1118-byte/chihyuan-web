#!/usr/bin/env python3
"""Zero-dependency structural checks for the Defect lifecycle foundation."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"


def read(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def load_migrations() -> str:
    files = sorted(MIGRATIONS.glob("*.sql"))
    if len(files) < 2:
        raise AssertionError("Defect invalidation forward migration is missing")
    return "\n\n".join(path.read_text(encoding="utf-8") for path in files)


def main() -> int:
    shared = read("shared/defect.ts")
    validation = read("worker/defect/defect-validation.ts")
    repository = read("worker/defect/defect-repository.ts")
    persistence = read("worker/defect/defect-persistence.ts")
    service = read("worker/defect/defect-service.ts")
    contract = read("docs/architecture/DEFECT_MODULE_CONTRACT.md")
    migration = read("migrations/0002_defect_invalidation.sql")

    for token in (
        '"created" | "processing" | "resolved"',
        "invalidatedAt",
        "includeInvalid",
        "DefectTransitionRequest",
    ):
        if token not in shared:
            raise AssertionError(f"missing Defect shared contract: {token}")

    for token in ("requiredIsoDate", "expectedRevision", "defectDescription"):
        if token not in validation:
            raise AssertionError(f"missing Defect validation: {token}")

    if "d.invalidated_at IS NULL" not in repository:
        raise AssertionError("ordinary Defect search must exclude invalidated records by default")

    for action in (
        "defect.processing.started",
        "defect.resolved",
        "defect.reopened",
        "defect.invalidated",
        "defect.deleted",
    ):
        if action not in persistence:
            raise AssertionError(f"missing Defect Audit action: {action}")

    for token in (
        "startProcessing",
        "async resolve(",
        "reopen",
        "invalidate",
        "deleteCreated",
        "allowAdministrativeDelete",
    ):
        if token not in service:
            raise AssertionError(f"missing Defect lifecycle service behavior: {token}")

    if "invalidated_at" not in migration or "invalidated_by" not in migration:
        raise AssertionError("Defect invalidation metadata migration incomplete")

    for phrase in (
        "Invalidation is **not** a fourth workflow status",
        "resolved / 已處理",
        "hard-delete",
        "excluded from ordinary search by default",
    ):
        if phrase not in contract:
            raise AssertionError(f"Defect contract missing: {phrase}")

    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(load_migrations())
    now = "2026-09-27T10:00:00Z"
    db.execute(
        "INSERT INTO app_members(identity_employee_id, employee_no, is_active, created_at, updated_at) VALUES (?,?,?,?,?)",
        ("emp-1", "E001", 1, now, now),
    )
    db.execute(
        "INSERT INTO customers(short_name, created_at, updated_at) VALUES (?,?,?)",
        ("甲診所", now, now),
    )
    db.execute(
        "INSERT INTO items(item_no,name,base_unit,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        ("I001", "測試商品", "盒", 1, now, now),
    )
    db.execute(
        """
        INSERT INTO defect_reports(
          reported_date, customer_id, customer_name_snapshot,
          item_id, item_no_snapshot, item_name_snapshot,
          owner_employee_id, defect_description, status_code,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)
        """,
        ("2026-09-27", 1, "甲診所", 1, "I001", "測試商品", 1, "外觀異常", "processing", now, 1, now, 1),
    )
    db.execute(
        "UPDATE defect_reports SET invalidated_at=?, invalidated_by=?, revision=revision+1 WHERE id=1",
        (now, 1),
    )
    row = db.execute(
        "SELECT status_code, invalidated_at, invalidated_by, revision FROM defect_reports WHERE id=1"
    ).fetchone()
    if row != ("processing", now, 1, 2):
        raise AssertionError(f"Defect invalidation overlay smoke check failed: {row!r}")

    print("PASS Defect lifecycle foundation source/schema checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Defect foundation validation: {exc}", file=sys.stderr)
        raise
