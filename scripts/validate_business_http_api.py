#!/usr/bin/env python3
"""Validate protected business HTTP route boundaries across all CY Web modules."""

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
    service_pos = block.find(f"new {service}(env.DB")
    if guard < 0:
        raise AssertionError(f"{handler} does not require {module} Module Access")
    if service_pos < 0:
        raise AssertionError(f"{handler} does not call {service}")
    if guard > service_pos:
        raise AssertionError(f"{handler} touches the business service before authorization")


def main() -> int:
    routes = read("worker/http/business-api-routes.ts")
    phase2 = read("worker/http/business-api-phase2-routes.ts")
    index = read("worker/index.ts")
    api_doc = read("docs/architecture/API_CONTRACT.md")

    assert_guard_before_service(routes, "handleCustomers", "CUSTOMERS", "CustomerService")
    assert_guard_before_service(routes, "handleItems", "ITEMS", "ItemService")
    assert_guard_before_service(routes, "handleDefects", "DEFECTS", "DefectService")
    assert_guard_before_service(phase2, "handleOrders", "ORDERS", "SalesWorkOrderService")
    assert_guard_before_service(phase2, "handleOutsourcing", "OUTSOURCING", "ContractorService")
    assert_guard_before_service(phase2, "handleWorkLogs", "WORKLOGS", "WorkLogService")

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
            raise AssertionError(f"phase 1 business HTTP boundary missing: {token}")

    for token in (
        "requireModuleAccess",
        "knownFailure",
        "SalesWorkOrderServiceError",
        "ContractorServiceError",
        "BomServiceError",
        "OutsourcingServiceError",
        "WorkLogServiceError",
        "actorMemberId: guarded.gate.member.id",
        "allowHardDelete: admin",
        "allowShipmentReversal: admin",
        "allowOutboundCorrection: admin",
        "allowOutboundCancellation: admin",
        "allowReview: admin",
        "allowCrossEmployeeRead: admin",
        'opaqueReference("WO")',
        'opaqueReference("OUT")',
        'opaqueReference("WL", logDate)',
    ):
        if token not in phase2:
            raise AssertionError(f"phase 2 business HTTP boundary missing: {token}")

    for endpoint in (
        "/api/business/customers",
        "/api/business/items",
        "/api/business/defects",
    ):
        if endpoint not in routes:
            raise AssertionError(f"phase 1 business HTTP route missing: {endpoint}")
        if endpoint not in api_doc:
            raise AssertionError(f"API contract missing business route: {endpoint}")

    for endpoint in (
        "/api/business/orders",
        "/api/business/outsourcing/contractors",
        "/api/business/outsourcing/boms",
        "/api/business/outsourcing/stock",
        "/api/business/outsourcing/orders",
        "/api/business/worklogs",
    ):
        if endpoint not in phase2:
            raise AssertionError(f"phase 2 business HTTP route missing: {endpoint}")
        if endpoint not in api_doc:
            raise AssertionError(f"API contract missing phase 2 business route: {endpoint}")

    for action in (
        "tax-id-check",
        "number-history",
        "start-processing",
        "invalidate",
    ):
        if action not in routes:
            raise AssertionError(f"phase 1 business action route missing: {action}")

    for action in (
        "reverse-shipment",
        "confirm-outbound",
        "correct-outbound",
        "cancel-outbound",
        "cancel-payment",
        "submit",
        "review",
        "cancel-review",
    ):
        if action not in phase2:
            raise AssertionError(f"phase 2 business action route missing: {action}")

    if "handleBusinessApiRoute" not in index:
        raise AssertionError("Worker index does not route protected business API phase 1")
    if "handleBusinessApiPhase2Route" not in index:
        raise AssertionError("Worker index does not route protected business API phase 2")

    if "navigation" in api_doc.lower() and "server-side" not in api_doc.lower():
        raise AssertionError("API contract must keep browser navigation separate from authorization")

    print("PASS protected Customer / Item / Defect / Order / Outsourcing / WorkLog HTTP API boundary")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL protected business HTTP API validation: {exc}", file=sys.stderr)
        raise
