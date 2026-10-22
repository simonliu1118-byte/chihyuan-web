#!/usr/bin/env python3
"""Local zero-dependency smoke validation for the CY Web D1 schema migration chain.

This intentionally uses Python's stdlib sqlite3 so the schema can be checked without
spending GitHub Actions minutes. It validates SQLite syntax/foreign keys and a few
high-value contracts that were explicitly confirmed during architecture review.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "migrations"

EXPECTED_TABLES = {
    "ordering_sources",
    "ordering_orders",
    "ordering_lines",
    "ordering_receipts",
    "ordering_receipt_lines",
    "ordering_vendor_items",
    "ordering_item_last_source",
    "ordering_revisions",
    "hr_leave_records",
    "hr_leave_attachments",
    "hr_annual_leave_years",
    "hr_overtime_days",
    "hr_comp_time_grants",
    "hr_comp_time_settlements",
    "hr_stores",
    "hr_job_titles",
    "hr_shift_types",
    "hr_leave_types",
    "hr_holidays",
    "hr_schedule_days",
    "hr_schedule_months",
    "hr_roster_approvals",
    "hr_attendance_days",
    "hr_employees",
    "hr_emergency_contacts",
    "hr_education",
    "hr_work_history",
    "hr_status_changes",
    "hr_seniority_exclusions",
    "hr_salary_records",
    "hr_salary_allowances",
    "hr_salary_item_types",
    "hr_minimum_wages",
    "program_catalog_state",
    "erp_item_queries",
    "erp_item_agent_status",
    "erp_item_agent_credentials",
    "erp_sales_daily",
    "erp_sales_days",
    "erp_sales_items",
    "entity_id_high_watermarks",
    "app_member_module_access",
    "app_member_module_groups",
    "module_access_groups",
    "module_access_group_modules",
    "module_access_group_applications",
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
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        raise AssertionError(f"missing migrations in: {MIGRATIONS_DIR}")
    return "\n\n".join(path.read_text(encoding="utf-8") for path in migration_files)


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
    assert "display_name" in {row[1] for row in conn.execute("PRAGMA table_info(app_members)")}
    # cache is nullable but cannot be blank or exceed 120 Unicode characters
    seed_member(conn)
    conn.execute("UPDATE app_members SET display_name='測試人員' WHERE id=1")
    assert conn.execute("SELECT display_name FROM app_members WHERE id=1").fetchone()[0] == "測試人員"
    assert_integrity_error(conn, "UPDATE app_members SET display_name='' WHERE id=1")
    source = (ROOT / "worker/backup/schema-columns.ts").read_text()
    declared = json.loads(source.split(" = ", 1)[1].rstrip().removesuffix(";"))
    actual = {table: sorted(row[1] for row in conn.execute(f'PRAGMA table_info("{table}")'))
              for table in sorted(EXPECTED_TABLES - {"backup_sets", "backup_copies", "program_catalog_state", "erp_item_queries", "erp_item_agent_status", "erp_item_agent_credentials", "erp_sales_daily", "erp_sales_days", "erp_sales_items", "ordering_sources", "ordering_orders", "ordering_lines", "ordering_receipts", "ordering_receipt_lines", "ordering_vendor_items", "ordering_item_last_source", "ordering_revisions"})}
    if declared != actual:
        raise AssertionError("backup schema columns differ from canonical migrations")
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

    conn.execute(
        """
        INSERT INTO sales_work_orders(
            work_order_ref, customer_id, customer_no_snapshot, customer_name_snapshot,
            order_date, operator_employee_id, status_code, created_at, updated_at
        ) VALUES ('O1', NULL, NULL, '未知診所', '2026-09-27', 1, 'created', ?, ?)
        """,
        (now, now),
    )

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


def validate_defect_invalidation_shape(schema: str) -> None:
    conn = new_db(schema)
    seed_member(conn)
    now = "2026-09-27T00:00:00Z"
    columns = {row[1] for row in conn.execute("PRAGMA table_info(defect_reports)")}
    if not {"invalidated_at", "invalidated_by"}.issubset(columns):
        raise AssertionError("Defect invalidation migration columns missing")

    conn.execute(
        "INSERT INTO customers(short_name, created_at, updated_at) VALUES ('甲診所', ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO items(item_no, name, base_unit, created_at, updated_at) VALUES ('I001', '測試品', '盒', ?, ?)",
        (now, now),
    )
    conn.execute(
        """
        INSERT INTO defect_reports(
            reported_date, customer_id, customer_name_snapshot,
            item_id, item_no_snapshot, item_name_snapshot,
            owner_employee_id, defect_description, status_code,
            created_at, updated_at
        ) VALUES ('2026-09-27', 1, '甲診所', 1, 'I001', '測試品', 1, '瑕疵', 'processing', ?, ?)
        """,
        (now, now),
    )
    conn.execute(
        "UPDATE defect_reports SET invalidated_at=?, invalidated_by=? WHERE id=1",
        (now, 1),
    )
    invalidated = conn.execute(
        "SELECT invalidated_at, invalidated_by FROM defect_reports WHERE id=1"
    ).fetchone()
    if invalidated != (now, 1):
        raise AssertionError("Defect invalidation metadata did not persist")
    conn.close()


def validate_no_local_identity_session(schema: str) -> None:
    conn = new_db(schema)
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='web_sessions'"
    ).fetchone()
    if row is not None:
        raise AssertionError("retired local Identity session table still exists")
    conn.close()


def validate_retired_identity_migration(schema: str) -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys=ON")
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name < "0007_retired_entity_ids.sql":
            conn.executescript(path.read_text())
    conn.execute("INSERT INTO customers(id,short_name,created_at,updated_at) VALUES(4,'Migration fixture','2026-10-02','2026-10-02')")
    conn.execute("INSERT INTO audit_events(entity_type,entity_key,action,occurred_at) VALUES('customer','20','deleted','2026-10-02')")
    conn.execute("INSERT INTO audit_events(entity_type,entity_key,action,occurred_at) VALUES('customer','not-an-id','historical','2026-10-02')")
    before = conn.execute("SELECT * FROM customers").fetchall(), conn.execute("SELECT * FROM audit_events ORDER BY id").fetchall()
    conn.executescript((MIGRATIONS_DIR / "0007_retired_entity_ids.sql").read_text())
    after = conn.execute("SELECT * FROM customers").fetchall(), conn.execute("SELECT * FROM audit_events ORDER BY id").fetchall()
    if before != after or conn.execute("SELECT last_id FROM entity_id_high_watermarks WHERE table_name='customers'").fetchone() != (20,):
        raise AssertionError("retired identity migration changed history or missed an absent audited identity")
    conn.execute("DELETE FROM customers WHERE id=4")
    if conn.execute("SELECT last_id FROM entity_id_high_watermarks WHERE table_name='customers'").fetchone() != (20,):
        raise AssertionError("lower deletion reduced retired identity high-water mark")
    conn.execute("INSERT INTO customers(id,short_name,created_at,updated_at) VALUES(30,'Rollback fixture','2026-10-02','2026-10-02')")
    conn.execute("SAVEPOINT retirement")
    conn.execute("DELETE FROM customers WHERE id=30")
    conn.execute("ROLLBACK TO retirement")
    if conn.execute("SELECT id FROM customers").fetchall() != [(30,)] or conn.execute("SELECT last_id FROM entity_id_high_watermarks WHERE table_name='customers'").fetchone() != (20,):
        raise AssertionError("retirement trigger was not rolled back with parent deletion")
    conn.close()
    fresh = new_db(schema)
    if fresh.execute("SELECT COUNT(*) FROM entity_id_high_watermarks").fetchone() != (0,):
        raise AssertionError("fresh recovery target is not empty")
    fresh.close()



def validate_ordering_receipt_d1_pattern_limit(schema: str) -> None:
    """Simulate D1's 50-byte GLOB limit and verify the forward migration keeps history."""
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys=ON")
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name >= "0023_ordering_receipt_d1_glob.sql":
            break
        conn.executescript(path.read_text(encoding="utf-8"))

    now = "2026-10-22T00:00:00Z"
    conn.execute(
        "INSERT INTO ordering_sources(id,name,kind,conditions,sort_order,created_at,updated_at) "
        "VALUES(1,'台中','GENERAL','',0,?,?)", (now, now)
    )
    conn.execute(
        "INSERT INTO ordering_orders(id,source_id,status,sent_at,created_at,updated_at) "
        "VALUES(1,1,'SENT',?,?,?)", (now, now, now)
    )
    conn.execute(
        "INSERT INTO ordering_lines(id,order_id,sort_order,item_name,quantity_text,quantity) "
        "VALUES(1,1,0,'Synthetic item','5',5)"
    )
    conn.execute(
        "INSERT INTO ordering_receipts(id,order_id,erp_purchase_no,received_date,created_at) "
        "VALUES(1,1,'341A-20261022001','2026-10-22',?)", (now,)
    )
    conn.execute("INSERT INTO ordering_receipt_lines(receipt_id,line_id,quantity) VALUES(1,1,3)")
    conn.commit()
    headers = conn.execute("SELECT * FROM ordering_receipts ORDER BY id").fetchall()
    details = conn.execute("SELECT * FROM ordering_receipt_lines ORDER BY receipt_id,line_id").fetchall()

    conn.setlimit(sqlite3.SQLITE_LIMIT_LIKE_PATTERN_LENGTH, 50)
    try:
        conn.execute(
            "INSERT INTO ordering_receipts(id,order_id,erp_purchase_no,received_date,created_at) "
            "VALUES(2,1,'341A-20261022002','2026-10-22',?)", (now,)
        )
        raise AssertionError("Old 60-byte GLOB did not fail at D1's 50-byte limit")
    except sqlite3.OperationalError as error:
        if "LIKE or GLOB pattern too complex" not in str(error):
            raise
    conn.rollback()

    migration = (MIGRATIONS_DIR / "0023_ordering_receipt_d1_glob.sql").read_text(encoding="utf-8")
    conn.executescript("BEGIN;\n" + migration + "\nCOMMIT;")
    if conn.execute("SELECT * FROM ordering_receipts ORDER BY id").fetchall() != headers:
        raise AssertionError("Migration changed existing receipt headers")
    if conn.execute("SELECT * FROM ordering_receipt_lines ORDER BY receipt_id,line_id").fetchall() != details:
        raise AssertionError("Migration lost or changed receipt lines")
    if conn.execute("PRAGMA foreign_key_check").fetchall():
        raise AssertionError("Migration left invalid foreign keys")
    child_fks = conn.execute("PRAGMA foreign_key_list(ordering_receipt_lines)").fetchall()
    if not any(row[2] == "ordering_receipts" for row in child_fks):
        raise AssertionError("Receipt detail foreign key points at wrong table")

    conn.execute(
        "INSERT INTO ordering_receipts(id,order_id,erp_purchase_no,received_date,created_at) "
        "VALUES(2,1,'341A-20261022002','2026-10-22',?)", (now,)
    )
    conn.execute("INSERT INTO ordering_receipt_lines(receipt_id,line_id,quantity) VALUES(2,1,2)")
    if conn.execute("SELECT SUM(quantity) FROM ordering_receipt_lines").fetchone() != (5,):
        raise AssertionError("New receipt failed or historical quantity was lost")
    for invalid in ("341A-2026102200X", "341A-2026102200", "341A-202610220001"):
        try:
            conn.execute(
                "INSERT INTO ordering_receipts(id,order_id,erp_purchase_no,received_date,created_at) "
                "VALUES(3,1,?,'2026-10-22',?)", (invalid, now)
            )
        except sqlite3.IntegrityError:
            continue
        raise AssertionError("Invalid ERP purchase number bypassed CHECK: " + invalid)
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
        validate_defect_invalidation_shape,
        validate_no_local_identity_session,
        validate_retired_identity_migration,
        validate_ordering_receipt_d1_pattern_limit,
    ]
    for check in checks:
        check(schema)
        print(f"PASS {check.__name__}")

    migration_count = len(list(MIGRATIONS_DIR.glob("*.sql")))
    print(
        f"PASS schema migration chain: {migration_count} migrations, "
        f"{len(EXPECTED_TABLES)} tables, {len(checks)} validation groups"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL schema validation: {exc}", file=sys.stderr)
        raise
