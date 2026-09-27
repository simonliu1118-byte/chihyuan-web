#!/usr/bin/env python3
"""Zero-dependency structural checks for the persistent React local runtime."""

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
        "item.number.changed",
        "numberHistory",
        "costTaxMode",
        "storePrice",
        "clinicPrice",
        "更改品號",
        "歷史品號",
    ]:
        if token not in item:
            raise AssertionError(f"missing full Item operational behavior: {token}")

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

    for token in ["reload does not reset", "Worker protected HTTP API", "standalone `preview/*`", "never writes D1"]:
        if token not in doc:
            raise AssertionError(f"missing operational-runtime contract: {token}")

    print("PASS operational local runtime source contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
