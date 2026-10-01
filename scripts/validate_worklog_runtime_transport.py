#!/usr/bin/env python3
"""Validate that the active WorkLog React route is Worker/D1 authoritative."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def main() -> int:
    app = read("src/App.tsx")
    page = read("src/runtime/modules/WorkLogOperationalPage.tsx")
    client = read("src/runtime/api/work-log-runtime-client.ts")
    routes = read("worker/http/business-api-phase2-routes.ts")
    api_doc = read("docs/architecture/API_CONTRACT.md")

    if 'route === "worklogs"' not in app or "WorkLogOperationalPage" not in app:
        raise AssertionError("App does not route WORKLOGS to the Worker/D1 page")

    for forbidden in (
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalWorkLog",
        "nextLocalId",
        "timestampNow",
    ):
        if forbidden in page:
            raise AssertionError(f"WorkLog page still depends on browser-local authority: {forbidden}")

    for token in (
        "loadWorkLogConfiguration",
        "loadWorkLogStatistics",
        "searchWorkLogs",
        "loadWorkLogDetail",
        "createWorkLog",
        "updateWorkLogCreated",
        "submitWorkLog",
        "withdrawWorkLog",
        "reviewWorkLog",
        "cancelWorkLogReview",
        "deleteWorkLogCreated",
    ):
        if token not in page or token not in client:
            raise AssertionError(f"WorkLog transport cutover missing runtime operation: {token}")

    for endpoint in (
        "/api/business/worklogs",
        "/api/business/worklogs/configuration",
        "/api/business/worklogs/statistics",
        "/api/business/worklogs/:workLogId/submit",
        "/api/business/worklogs/:workLogId/withdraw",
        "/api/business/worklogs/:workLogId/review",
        "/api/business/worklogs/:workLogId/cancel-review",
    ):
        if endpoint not in api_doc:
            raise AssertionError(f"WorkLog transport API contract missing: {endpoint}")

    for token in (
        'requireBusinessModule(request, env, requestId, "WORKLOGS")',
        "allowReview: admin",
        "allowAdministrativeDelete: admin",
        "allowCrossEmployeeRead: admin",
        "actorMemberId: guarded.gate.member.id",
        "configuration",
        "statistics",
    ):
        if token not in routes:
            raise AssertionError(f"WorkLog server authority boundary missing: {token}")

    for token in (
        "expectedRevision",
        "workDays",
        "typeCode",
        "entryTypeCode",
        "workLogCategoryId",
        "platformId",
    ):
        if token not in page and token not in client:
            raise AssertionError(f"WorkLog runtime does not carry canonical server state: {token}")

    print("PASS WorkLog React route uses Worker API -> D1 with no browser-local fallback")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL WorkLog runtime transport validation: {exc}", file=sys.stderr)
        raise
