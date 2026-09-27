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
    workspace = read("src/runtime/OperationalWorkspace.tsx")
    doc = read("docs/architecture/OPERATIONAL_LOCAL_RUNTIME.md")

    for token in ["#customers", "#items", "#orders", "#outsourcing", "#worklogs", "#settings", "#audit"]:
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

    for token in [
        "CustomerPage",
        "ItemPage",
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

    for token in ["reload does not reset", "Worker protected HTTP API", "standalone `preview/*`", "never writes D1"]:
        if token not in doc:
            raise AssertionError(f"missing operational-runtime contract: {token}")

    print("PASS operational local runtime source contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
