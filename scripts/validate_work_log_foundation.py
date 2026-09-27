#!/usr/bin/env python3
"""Zero-dependency source/schema checks for the WorkLog foundation."""

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
    shared = read("shared/work-log.ts")
    service = read("worker/worklog/work-log-service.ts")
    persistence = read("worker/worklog/work-log-persistence.ts")
    repository = read("worker/worklog/work-log-repository.ts")
    doc = read("docs/architecture/WORK_LOG_MODULE_CONTRACT.md")

    for token in ["WorkLogStatusCode", "ReviewWorkLogRequest", "WorkLogStatisticsResult", "WorkLogConfiguration"]:
        if token not in shared:
            raise AssertionError(f"missing shared WorkLog token: {token}")
    for token in ["submitForReview", "withdrawReview", "cancelReview", "roundedScaled4Ratio", "allowCrossEmployeeRead"]:
        if token not in service:
            raise AssertionError(f"missing WorkLog service token: {token}")
    for token in ["work_log.review.submitted", "work_log.review.withdrawn", "work_log.review.cancelled", "work_log.reviewed", "AuditService"]:
        if token not in persistence:
            raise AssertionError(f"missing WorkLog audit token: {token}")
    for token in ["work_log_categories", "work_log_platforms", "work_log_scoring_rows", "weightedAverageDailyScore"]:
        if token not in repository:
            raise AssertionError(f"missing WorkLog repository token: {token}")
    for token in ["work_days", "reviewed -> pending_review", "not source-code defaults", "half away from zero"]:
        if token.lower() not in doc.lower():
            raise AssertionError(f"missing WorkLog contract rule: {token}")


def schema_checks() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema())
    now = "2026-09-27T10:00:00Z"
    conn.execute("INSERT INTO app_members(identity_employee_id,employee_no,is_active,created_at,updated_at) VALUES('e1','E001',1,?,?)", (now, now))
    conn.execute("INSERT INTO work_log_categories(code,name,input_mode,sort_order,is_active,updated_at) VALUES('c1','Example Boolean','boolean',0,1,?)", (now,))
    conn.execute("INSERT INTO work_log_categories(code,name,input_mode,unit_label,sort_order,is_active,updated_at) VALUES('c2','Example Quantity','quantity','件',1,1,?)", (now,))
    conn.execute("INSERT INTO work_log_platforms(code,name,sort_order,is_active,updated_at) VALUES('p1','Example Platform',0,1,?)", (now,))
    conn.execute("INSERT INTO work_logs(work_log_ref,log_date,date_from,date_to,work_days,type_code,employee_id,status_code,created_at,updated_at,revision) VALUES('WL1','2026-09-27','2026-09-27','2026-09-27',5000,'generic',1,'created',?,?,1)", (now, now))
    conn.execute("INSERT INTO work_log_entries(work_log_id,entry_type_code,content,platform_id,sort_order) VALUES(1,'standard','Example',1,0)")
    conn.execute("INSERT INTO work_log_entry_categories(work_log_entry_id,work_log_category_id,quantity,sort_order) VALUES(1,1,10000,0)")

    try:
        conn.execute("UPDATE work_logs SET work_days=0 WHERE id=1")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("schema accepted zero Work Days")

    conn.execute("UPDATE work_logs SET status_code='pending_review' WHERE id=1")
    try:
        conn.execute("UPDATE work_logs SET status_code='reviewed' WHERE id=1")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("schema accepted reviewed WorkLog without finalized review fields")

    conn.execute("UPDATE work_logs SET status_code='reviewed',reviewed_by=1,reviewed_at=?,final_score=100000,average_daily_score=200000 WHERE id=1", (now,))
    row = conn.execute("SELECT final_score,average_daily_score FROM work_logs WHERE id=1").fetchone()
    if row != (100000, 200000):
        raise AssertionError("finalized WorkLog score storage mismatch")
    conn.close()


def main() -> int:
    source_checks()
    print("PASS WorkLog source contracts")
    schema_checks()
    print("PASS WorkLog schema contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
