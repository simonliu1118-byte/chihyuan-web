#!/usr/bin/env python3
"""Zero-dependency source checks for the first Customer composition preview."""

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
    preview = require("src/modules/customer/CustomerWorkspacePreview.tsx")
    preview_css = require("src/modules/customer/customer-preview.css")
    composition = require("docs/architecture/CUSTOMER_UI_COMPOSITION.md")
    contract = require("docs/architecture/CUSTOMER_MODULE_CONTRACT.md")

    if "CustomerWorkspacePreview" not in app or 'activeNavigationKey="customers"' not in app:
        raise AssertionError("Customer preview is not mounted through the shared App Shell")

    for required in (
        "DataViewToolbar",
        "DataView",
        "客戶管理",
        "拜訪紀錄",
        "報價紀錄",
        "常用商品",
        "按需載入",
    ):
        if required not in preview:
            raise AssertionError(f"Customer preview requirement missing: {required}")

    if "grid-template-columns" not in preview_css or "@media (max-width: 920px)" not in preview_css:
        raise AssertionError("Customer preview adaptive workspace CSS missing")

    for required in (
        "search-and-detail workspace",
        "View mode versus edit mode",
        "Explicit differences from Legacy GAS",
        "Desktop first",
    ):
        if required not in composition:
            raise AssertionError(f"Customer composition contract missing: {required}")

    if "expectedRevision" not in contract or "DUPLICATE_TAX_ID_CONFIRM_REQUIRED" not in contract:
        raise AssertionError("Customer business contract safeguards are missing")

    print("PASS Customer composition source checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer composition validation: {exc}", file=sys.stderr)
        raise
