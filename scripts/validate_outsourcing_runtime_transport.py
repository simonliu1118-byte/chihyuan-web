#!/usr/bin/env python3
"""Validate that the active Outsourcing React route is Worker/D1 authoritative."""

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
    page = read("src/runtime/modules/OutsourcingOperationalPage.tsx")
    client = read("src/runtime/api/outsourcing-runtime-client.ts")
    routes = read("worker/http/business-api-phase2-routes.ts")
    lookups = read("worker/reference/business-lookup-service.ts")
    api_doc = read("docs/architecture/API_CONTRACT.md")

    if 'route === "outsourcing"' not in app or "OutsourcingOperationalPage" not in app:
        raise AssertionError("App does not route OUTSOURCING to the Worker/D1 page")

    for forbidden in (
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalOutsourcingOrder",
        "stockMovements",
        "nextLocalId",
        "timestampNow",
    ):
        if forbidden in page:
            raise AssertionError(f"Outsourcing page still depends on browser-local authority: {forbidden}")

    for token in (
        "loadOutsourcingLookups",
        "searchContractors",
        "loadContractorDetail",
        "searchBoms",
        "loadBomDetail",
        "loadContractorStock",
        "searchOutsourcingOrders",
        "loadOutsourcingDetail",
        "createOutsourcingOrder",
        "updateOutsourcingPending",
        "confirmOutsourcingOutbound",
        "correctOutsourcingOutbound",
        "cancelOutsourcingOutbound",
        "receiveOutsourcing",
        "cancelOutsourcingReceipt",
        "priceOutsourcing",
        "cancelOutsourcingPricing",
        "markOutsourcingPaid",
        "cancelOutsourcingPayment",
        "deleteOutsourcingPending",
    ):
        if token not in page and token not in client:
            raise AssertionError(f"Outsourcing transport cutover missing runtime operation: {token}")

    for endpoint in (
        "/api/business/outsourcing/lookups",
        "/api/business/outsourcing/contractors",
        "/api/business/outsourcing/boms",
        "/api/business/outsourcing/stock",
        "/api/business/outsourcing/orders",
        "/api/business/outsourcing/orders/:orderId/confirm-outbound",
        "/api/business/outsourcing/orders/:orderId/correct-outbound",
        "/api/business/outsourcing/orders/:orderId/cancel-outbound",
        "/api/business/outsourcing/orders/:orderId/receive",
        "/api/business/outsourcing/orders/:orderId/cancel-receipt",
        "/api/business/outsourcing/orders/:orderId/price",
        "/api/business/outsourcing/orders/:orderId/cancel-pricing",
        "/api/business/outsourcing/orders/:orderId/paid",
        "/api/business/outsourcing/orders/:orderId/cancel-payment",
    ):
        if endpoint not in api_doc:
            raise AssertionError(f"Outsourcing transport API contract missing: {endpoint}")

    for token in (
        'requireBusinessModule(request, env, requestId, "OUTSOURCING")',
        "outsourcingLookups",
        "allowHardDelete: admin",
        "allowOutboundCorrection: admin",
        "allowOutboundCancellation: admin",
    ):
        if token not in routes and token not in lookups:
            raise AssertionError(f"Outsourcing server transport boundary missing: {token}")

    print("PASS Outsourcing React route uses Worker API -> D1 with no browser-local fallback")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Outsourcing runtime transport validation: {exc}", file=sys.stderr)
        raise
