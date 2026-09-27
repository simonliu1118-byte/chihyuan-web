#!/usr/bin/env python3
"""Zero-dependency source checks for Customer related-record interaction preview."""

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
    page = require("src/modules/customer/CustomerRelatedReviewPage.tsx")
    preview = require("src/modules/customer/CustomerRelatedInteractionPreview.tsx")
    css = require("src/modules/customer/customer-related-preview.css")
    dialog = require("src/ui/overlays/Dialog.tsx")
    picker = require("src/ui/pickers/EntityPicker.tsx")
    editable = require("src/ui/foundation/editable-list.ts")
    doc = require("docs/architecture/CUSTOMER_RELATED_UI.md")

    for token in (
        "CustomerRelatedInteractionPreview",
        "0.1.23 Preview",
        "不連 D1",
    ):
        if token not in page:
            raise AssertionError(f"related interaction review page missing: {token}")

    for token in (
        "RelatedRecordPanel",
        "Drawer",
        "ConfirmDialog",
        "EntityPicker",
        "useUnsavedChangesGuard",
        "editableListReducer",
        "新增拜訪",
        "修改",
        "刪除拜訪",
        "新增報價紀錄",
        "修正紀錄",
        "編輯常用商品",
        "未建檔／自由文字",
        "沒有「刪除報價」",
    ):
        if token not in preview:
            raise AssertionError(f"related interaction preview missing: {token}")

    if "export function Drawer" not in dialog:
        raise AssertionError("shared Drawer foundation is missing")
    if "export function EntityPicker" not in picker:
        raise AssertionError("shared EntityPicker foundation is missing")
    if "export function editableListReducer" not in editable:
        raise AssertionError("shared editable-list foundation is missing")

    for token in (
        ".cy-related-editor-form",
        ".cy-related-editor-grid-2",
        "@media (max-width: 700px)",
    ):
        if token not in css:
            raise AssertionError(f"related interaction adaptive CSS missing: {token}")

    for token in (
        "interaction review",
        "Drawer",
        "explicitly selects",
        "New commercial quote",
        "correction",
        "not a production route",
    ):
        if token not in doc:
            raise AssertionError(f"related UI contract missing: {token}")

    print("PASS Customer related interaction source checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer related interaction validation: {exc}", file=sys.stderr)
        raise
