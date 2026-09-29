#!/usr/bin/env python3
"""Validate protected Customer / Item / Defect HTTP route boundaries."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def assert_guard_before_service(source: str, handler: str, module: str, service: str) -> None:
    start = source.find(f"async function {handler}")
    if start < 0:
        raise AssertionError(f"missing route handler: {handler}")
    next_handler = source.find("\nasync function ", start + 1)
    block = source[start:next_handler if next_handler >= 0 else len(source)]
    guard = block.find(f'requireBusinessModule(request, env, requestId, "{module}")')
    service_pos = block.find(f"new {service}(env.DB)")
    if guard < 0:
        raise AssertionError(f"{handler} does not require {module} Module Access")
    if service_pos < 0:
        raise AssertionError(f"{handler} does not call {service}")
    if guard > service_pos:
        raise AssertionError(f"{handler} touches the business service before authorization")


def main() -> int:
    routes = read("worker/http/business-api-routes.ts")
    index = read("worker/index.ts")
    api_doc = read("docs/architecture/API_CONTRACT.md")

    assert_guard_before_service(routes, "handleCustomers", "CUSTOMERS", "CustomerService")
    assert_guard_before_service(routes, "handleItems", "ITEMS", "ItemService")
    assert_guard_before_service(routes, "handleDefects", "DEFECTS", "DefectService")

    for token in (
        "requireModuleAccess",
        "knownBusinessFailure",
        "FieldValidationError",
        "CustomerServiceError",
        "ItemServiceError",
        "DefectServiceError",
        "actorMemberId: guarded.gate.member.id",
        "allowAdministrativeDelete: isWorkspaceAdmin",
    ):
        if token not in routes:
            raise AssertionError(f"business HTTP boundary missing: {token}")

    for endpoint in (
        "/api/business/customers",
        "/api/business/items",
        "/api/business/defects",
    ):
        if endpoint not in routes:
            raise AssertionError(f"business HTTP route missing: {endpoint}")
        if endpoint not in api_doc:
            raise AssertionError(f"API contract missing business route: {endpoint}")

    for action in (
        "tax-id-check",
        "number-history",
        "start-processing",
        "invalidate",
    ):
        if action not in routes:
            raise AssertionError(f"business action route missing: {action}")

    if "handleBusinessApiRoute" not in index:
        raise AssertionError("Worker index does not route protected business APIs")

    if "navigation" in api_doc.lower() and "server-side" not in api_doc.lower():
        raise AssertionError("API contract must keep browser navigation separate from authorization")

    print("PASS protected Customer / Item / Defect HTTP API boundary")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL protected business HTTP API validation: {exc}", file=sys.stderr)
        raise
