#!/usr/bin/env python3
"""Validate that the operational Defect React page is Worker/D1 authoritative."""

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
    page = read("src/runtime/modules/DefectOperationalPage.tsx")
    client = read("src/runtime/api/defect-runtime-client.ts")
    routes = read("worker/http/business-api-routes.ts")
    lookups = read("worker/reference/business-lookup-service.ts")
    api_doc = read("docs/architecture/API_CONTRACT.md")

    for forbidden in (
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalDefect",
        "nextLocalId",
        "timestampNow",
    ):
        if forbidden in page:
            raise AssertionError(f"Defect operational page still depends on browser-local authority: {forbidden}")

    for token in (
        "loadDefectLookups",
        "searchDefects",
        "loadDefectDetail",
        "createDefect",
        "updateDefect",
        "startDefectProcessing",
        "resolveDefect",
        "reopenDefect",
        "invalidateDefect",
        "deleteDefect",
    ):
        if token not in page or token not in client:
            raise AssertionError(f"Defect transport cutover missing runtime client operation: {token}")

    for endpoint in (
        "/api/business/defects",
        "/api/business/defects/lookups",
        "/api/business/defects/:defectId/start-processing",
        "/api/business/defects/:defectId/resolve",
        "/api/business/defects/:defectId/reopen",
        "/api/business/defects/:defectId/invalidate",
    ):
        if endpoint not in api_doc:
            raise AssertionError(f"Defect transport API contract missing: {endpoint}")

    for token in (
        'requireBusinessModule(request, env, requestId, "DEFECTS")',
        "defectLookups",
        "allowAdministrativeDelete: isWorkspaceAdmin",
        "startProcessing",
        "invalidate",
    ):
        if token not in routes and token not in lookups:
            raise AssertionError(f"Defect server transport boundary missing: {token}")

    for token in (
        "expectedRevision",
        "statusCode",
        "includeInvalid",
        "customerId",
        "itemId",
        "ownerEmployeeId",
    ):
        if token not in page and token not in client:
            raise AssertionError(f"Defect runtime does not carry canonical server state: {token}")

    print("PASS Defect React transport uses Worker API -> D1 with no browser-local fallback")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Defect runtime transport validation: {exc}", file=sys.stderr)
        raise
