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
    defect = read("src/runtime/modules/DefectOperationalPage.tsx")
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

    for token in [
        "SalesOrderPage",
        "OutsourcingPage",
        "WorkLogPage",
        "SettingsPage",
        "AuditPage",
        "ERP 回填",
        "確認出庫",
        "審核計分",
    ]:
        if token not in workspace:
            raise AssertionError(f"missing operational UI behavior: {token}")

    for token in [
        "新增拜訪",
        "修正紀錄",
        "常用商品",
        "customer.number.changed",
        "customer.visit.deleted",
        "duplicateTax",
        "cy-customer-action-stack",
    ]:
        if token not in customer:
            raise AssertionError(f"missing full Customer operational behavior: {token}")

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
        "defect.processing.started",
        "defect.resolved",
        "defect.reopened",
        "defect.invalidated",
        "defect.deleted",
        "顯示作廢",
        "不是第四個工作狀態",
    ]:
        if token not in defect:
            raise AssertionError(f"missing Defect operational behavior: {token}")

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

    print("PASS mixed operational runtime source contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
