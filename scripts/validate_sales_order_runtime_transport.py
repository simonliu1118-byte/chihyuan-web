#!/usr/bin/env python3
"""Validate that the Sales Work Order React route is Worker/D1 authoritative."""

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
    page = read("src/runtime/modules/SalesOrderOperationalPage.tsx")
    client = read("src/runtime/api/sales-order-runtime-client.ts")
    routes = read("worker/http/business-api-phase2-routes.ts")
    lookups = read("worker/reference/business-lookup-service.ts")
    api_doc = read("docs/architecture/API_CONTRACT.md")

    if 'route === "orders"' not in app or "SalesOrderOperationalPage" not in app:
        raise AssertionError("App does not route ORDERS to the Worker/D1 Sales Order page")

    for forbidden in (
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalSalesOrder",
        "nextLocalId",
        "timestampNow",
    ):
        if forbidden in page:
            raise AssertionError(f"Sales Order operational page still depends on browser-local authority: {forbidden}")

    for token in (
        "loadSalesOrderLookups",
        "searchSalesOrders",
        "loadSalesOrderDetail",
        "createSalesOrder",
        "updateSalesOrder",
        "fillOrCorrectSalesOrderErp",
        "markSalesOrderWaitingStock",
        "markSalesOrderPicked",
        "markSalesOrderShipped",
        "reverseSalesOrderShipment",
        "voidSalesOrder",
        "deleteSalesOrderDraft",
    ):
        if token not in page or token not in client:
            raise AssertionError(f"Sales Order transport cutover missing runtime client operation: {token}")

    for endpoint in (
        "/api/business/orders",
        "/api/business/orders/lookups",
        "/api/business/orders/:orderId/erp",
        "/api/business/orders/:orderId/waiting-stock",
        "/api/business/orders/:orderId/picked",
        "/api/business/orders/:orderId/shipped",
        "/api/business/orders/:orderId/reverse-shipment",
        "/api/business/orders/:orderId/void",
    ):
        if endpoint not in api_doc:
            raise AssertionError(f"Sales Order transport API contract missing: {endpoint}")

    for token in (
        'requireBusinessModule(request, env, requestId, "ORDERS")',
        "salesWorkOrderLookups",
        "allowHardDelete: admin",
        "allowShipmentReversal: admin",
    ):
        if token not in routes and token not in lookups:
            raise AssertionError(f"Sales Order server transport boundary missing: {token}")

    for token in (
        "expectedRevision",
        "operatorEmployeeId",
        "quantity",
        "unitPrice",
        "customerId",
        "itemId",
    ):
        if token not in page and token not in client:
            raise AssertionError(f"Sales Order runtime does not carry canonical server state: {token}")

    print("PASS Sales Work Order React route uses Worker API -> D1 with no browser-local fallback")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Sales Work Order runtime transport validation: {exc}", file=sys.stderr)
        raise
