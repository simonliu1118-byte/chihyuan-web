#!/usr/bin/env python3
"""Zero-dependency checks for Customer UI foundations after operational-runtime cutover."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def main() -> int:
    app = require("src/App.tsx")
    operational = require("src/runtime/OperationalWorkspace.tsx")
    runtime_doc = require("docs/architecture/OPERATIONAL_RUNTIME.md")
    contract = require("docs/architecture/CUSTOMER_MODULE_CONTRACT.md")

    # The old Customer preview remains in source as design/history evidence only.
    for path in (
        "src/modules/customer/CustomerWorkspacePreview.tsx",
        "src/modules/customer/customer-preview.css",
        "src/modules/customer/customer-edit-preview.css",
        "docs/architecture/CUSTOMER_UI_COMPOSITION.md",
        "docs/architecture/CUSTOMER_EDIT_INTERACTION.md",
    ):
        require(path)

    if "OperationalWorkspace" not in app or 'href: "#customers"' not in app:
        raise AssertionError("Customer route is not mounted through the shared App Shell")

    for required in (
        "function CustomerPage",
        "新增客戶",
        "ERP 客戶編號",
        "搜尋編號、名稱、電話、聯絡人",
        "customer.created",
        "customer.updated",
        "customer.active.changed",
    ):
        if required not in operational:
            raise AssertionError(f"Customer operational behavior missing: {required}")

    if "standalone `preview/*` files remain design/history references" not in runtime_doc:
        raise AssertionError("operational-runtime preview supersession rule missing")

    if "expectedRevision" not in contract or "DUPLICATE_TAX_ID_CONFIRM_REQUIRED" not in contract:
        raise AssertionError("Customer business contract safeguards are missing")

    print("PASS Customer operational UI / retained-reference checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer UI validation: {exc}", file=sys.stderr)
        raise
