#!/usr/bin/env python3
"""Zero-dependency structural checks for the mixed React business runtime."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    text = (ROOT / path).read_text(encoding="utf-8")
    if not text.strip():
        raise AssertionError(f"empty file: {path}")
    return text


def main() -> int:
    app = read("src/App.tsx")
    store = read("src/runtime/local-database.ts")
    advanced = read("src/runtime/advanced-local-types.ts")
    workspace = read("src/runtime/OperationalWorkspace.tsx")
    customer = read("src/runtime/modules/CustomerOperationalPage.tsx")
    item = read("src/runtime/modules/ItemOperationalPage.tsx")
    item_client = read("src/runtime/api/item-runtime-client.ts")
    customer_client = read("src/runtime/api/customer-runtime-client.ts")
    defect = read("src/runtime/modules/DefectOperationalPage.tsx")
    defect_client = read("src/runtime/api/defect-runtime-client.ts")
    order = read("src/runtime/modules/SalesOrderOperationalPage.tsx")
    order_client = read("src/runtime/api/sales-order-runtime-client.ts")
    outsourcing = read("src/runtime/modules/OutsourcingOperationalPage.tsx")
    outsourcing_client = read("src/runtime/api/outsourcing-runtime-client.ts")
    doc = read("docs/architecture/OPERATIONAL_LOCAL_RUNTIME.md")

    for token in ["#customers", "#items", "#defects", "#orders", "#outsourcing", "#worklogs", "#settings", "#audit"]:
        if token not in app:
            raise AssertionError(f"missing operational navigation: {token}")

    for token in [
        "localStorage",
        "LocalCustomer",
        "LocalItem",
        "LocalSalesOrder",
        "LocalOutsourcingOrder",
        "LocalWorkLog",
        "stockMovements",
        "exportLocalDatabase",
        "importLocalDatabase",
        "resetLocalDatabase",
    ]:
        if token not in store:
            raise AssertionError(f"missing persistent local-store contract: {token}")

    for token in ["LocalCustomerVisit", "LocalCustomerQuote", "LocalCustomerFrequentItem", "LocalItemNumberHistory", "LocalDefect", "defects?:"]:
        if token not in advanced:
            raise AssertionError(f"missing advanced local runtime contract: {token}")

    for forbidden in ["function CustomerPage(", "function ItemPage(", "function SalesOrderPage(", "function OutsourcingPage("]:
        if forbidden in workspace:
            raise AssertionError(f"removed local business page returned: {forbidden}")

    for token in [
        "WorkLogPage",
        "SettingsPage",
        "AuditPage",
        "審核計分",
    ]:
        if token not in workspace:
            raise AssertionError(f"missing operational UI behavior: {token}")

    for token in [
        "新增拜訪",
        "修正紀錄",
        "常用商品",
        "changeCustomerNumber",
        "checkCustomerTaxId",
        "createCustomerVisit",
        "createCustomerQuote",
        "createCustomerFrequentItem",
        "Worker / D1",
    ]:
        if token not in customer:
            raise AssertionError(f"missing D1 Customer operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in customer:
            raise AssertionError(f"Customer operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/customers",
        "/api/business/customers/lookups",
        "/item-options",
        "/tax-id-check",
        "/number",
        "/visits",
        "/quotes",
        "/frequent-items",
        "apiRequest",
    ]:
        if token not in customer_client:
            raise AssertionError(f"missing Customer Worker API transport contract: {token}")

    for token in [
        "validateConversions",
        "changeItemNumberRequest",
        "loadItemNumberHistory",
        "createItem",
        "updateItem",
        "costTaxMode",
        "storePrice",
        "clinicPrice",
        "更改品號",
        "歷史品號",
        "Worker / D1",
    ]:
        if token not in item:
            raise AssertionError(f"missing D1 Item operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in item:
            raise AssertionError(f"Item operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/items",
        "/api/business/items/lookups",
        "/number-history",
        "/number",
        "apiRequest",
    ]:
        if token not in item_client:
            raise AssertionError(f"missing Item Worker API transport contract: {token}")

    for token in [
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
        "Worker / D1",
        "顯示作廢",
        "不是第四個工作狀態",
    ]:
        if token not in defect:
            raise AssertionError(f"missing D1 Defect operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalDefect",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in defect:
            raise AssertionError(f"Defect operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/defects",
        "/lookups",
        "start-processing",
        "resolve",
        "reopen",
        "invalidate",
        "apiRequest",
    ]:
        if token not in defect_client:
            raise AssertionError(f"missing Defect Worker API transport contract: {token}")


    for token in [
        "loadSalesOrderLookups",
        "searchSalesOrders",
        "loadSalesOrderDetail",
        "createSalesOrder",
        "updateSalesOrder",
        "fillOrCorrectSalesOrderErp",
        "markSalesOrderPicked",
        "markSalesOrderShipped",
        "reverseSalesOrderShipment",
        "deleteSalesOrderDraft",
        "Worker / D1",
    ]:
        if token not in order:
            raise AssertionError(f"missing D1 Sales Order operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalSalesOrder",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in order:
            raise AssertionError(f"Sales Order operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/orders",
        "/lookups",
        "/erp",
        "waiting-stock",
        "picked",
        "shipped",
        "reverse-shipment",
        "void",
        "apiRequest",
    ]:
        if token not in order_client:
            raise AssertionError(f"missing Sales Order Worker API transport contract: {token}")


    for token in [
        "loadOutsourcingLookups",
        "searchContractors",
        "searchBoms",
        "loadContractorStock",
        "searchOutsourcingOrders",
        "createOutsourcingOrder",
        "confirmOutsourcingOutbound",
        "receiveOutsourcing",
        "priceOutsourcing",
        "markOutsourcingPaid",
        "Worker / D1",
    ]:
        if token not in outsourcing:
            raise AssertionError(f"missing D1 Outsourcing operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalOutsourcingOrder",
        "stockMovements",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in outsourcing:
            raise AssertionError(f"Outsourcing page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/outsourcing",
        "/lookups",
        "/contractors",
        "/boms",
        "/stock",
        "/orders",
        "confirm-outbound",
        "receive",
        "price",
        "paid",
        "cancel-payment",
        "apiRequest",
    ]:
        if token not in outsourcing_client:
            raise AssertionError(f"missing Outsourcing Worker API transport contract: {token}")

    normalized_doc = doc.lower()
    for token in [
        "mixed transport",
        "item",
        "worker protected http api",
        "standalone `preview/*`",
        "localstorage remains temporary",
    ]:
        if token not in normalized_doc:
            raise AssertionError(f"missing operational-runtime contract: {token}")

    print("PASS mixed operational runtime source contracts (Item + Customer + Defect + Order + Outsourcing Worker/D1 authority)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
