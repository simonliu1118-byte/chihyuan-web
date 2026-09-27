#!/usr/bin/env python3
"""Zero-dependency source checks for the Customer composition/edit interaction preview."""

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
    edit_css = require("src/modules/customer/customer-edit-preview.css")
    composition = require("docs/architecture/CUSTOMER_UI_COMPOSITION.md")
    edit_contract = require("docs/architecture/CUSTOMER_EDIT_INTERACTION.md")
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
        "recordEditorReducer",
        "editableListReducer",
        "useUnsavedChangesGuard",
        "ConfirmDialog",
        "ToastRegion",
        "advanceFocusOnEnter",
        "新增客戶",
        "未儲存",
        'readOnly={editor.mode === "edit"}',
        "此客戶編號已存在",
    ):
        if required not in preview:
            raise AssertionError(f"Customer preview requirement missing: {required}")

    if "grid-template-columns" not in preview_css or "@media (max-width: 920px)" not in preview_css:
        raise AssertionError("Customer preview adaptive workspace CSS missing")
    if "cy-customer-edit-surface" not in edit_css or "cy-customer-repeat-card" not in edit_css:
        raise AssertionError("Customer edit interaction styling missing")

    for required in (
        "search-and-detail workspace",
        "View mode versus edit mode",
        "Explicit differences from Legacy GAS",
        "Desktop first",
    ):
        if required not in composition:
            raise AssertionError(f"Customer composition contract missing: {required}")

    for required in (
        "shared `record-editor` state machine",
        "shared editable-list reducer",
        "Customer number boundary",
        "Duplicate Tax ID preview",
        "Success uses the shared Toast region",
        "Hard delete is intentionally not added",
    ):
        if required not in edit_contract:
            raise AssertionError(f"Customer edit interaction contract missing: {required}")

    if "expectedRevision" not in contract or "DUPLICATE_TAX_ID_CONFIRM_REQUIRED" not in contract:
        raise AssertionError("Customer business contract safeguards are missing")

    print("PASS Customer composition/edit interaction source checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer preview validation: {exc}", file=sys.stderr)
        raise
