#!/usr/bin/env python3
"""Validate that the operational Customer React page is Worker/D1 authoritative."""

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
    page = read("src/runtime/modules/CustomerOperationalPage.tsx")
    client = read("src/runtime/api/customer-runtime-client.ts")
    routes = read("worker/http/business-api-routes.ts")
    service = read("worker/customer/customer-service.ts")
    persistence = read("worker/customer/customer-persistence.ts")
    api_doc = read("docs/architecture/API_CONTRACT.md")

    for forbidden in (
        "useLocalDatabase",
        "mutateLocalDatabase",
        "localStorage",
        "LocalCustomer",
        "nextLocalId",
        "timestampNow",
    ):
        if forbidden in page:
            raise AssertionError(f"Customer operational page still depends on browser-local authority: {forbidden}")

    for token in (
        "loadCustomerLookups",
        "searchCustomerItemOptions",
        "searchCustomers",
        "loadCustomerDetail",
        "checkCustomerTaxId",
        "createCustomer",
        "updateCustomer",
        "changeCustomerNumber",
        "loadCustomerVisits",
        "createCustomerVisit",
        "updateCustomerVisit",
        "deleteCustomerVisit",
        "loadCustomerQuotes",
        "loadCustomerQuote",
        "createCustomerQuote",
        "correctCustomerQuote",
        "loadCustomerFrequentItems",
        "createCustomerFrequentItem",
        "deleteCustomerFrequentItem",
    ):
        if token not in page or token not in client:
            raise AssertionError(f"Customer transport cutover missing runtime client operation: {token}")

    for endpoint in (
        "/api/business/customers/lookups",
        "/api/business/customers/item-options",
        "/api/business/customers/tax-id-check",
        "/api/business/customers/:customerId/number",
    ):
        if endpoint not in api_doc:
            raise AssertionError(f"Customer transport API contract missing: {endpoint}")

    for token in (
        "customerItemOptions",
        "changeCustomerNumber",
        "CUSTOMER_NO_CONTROLLED_ACTION_REQUIRED",
    ):
        if token not in routes and token not in service:
            raise AssertionError(f"Customer server transport boundary missing: {token}")

    for token in (
        "customer.number.changed",
        "AuditService",
        "expectedRevision",
    ):
        if token not in persistence:
            raise AssertionError(f"controlled Customer-number persistence missing: {token}")

    if "isActive" in page and "contacts" not in page:
        raise AssertionError("Customer page appears to reintroduce Customer-level isActive authority")

    print("PASS Customer React transport uses Worker API -> D1 with no browser-local fallback")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer runtime transport validation: {exc}", file=sys.stderr)
        raise
