#!/usr/bin/env python3
"""Historical Customer related-preview asset checks; not runtime acceptance."""

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
    panel = require("src/ui/related/RelatedRecordPanel.tsx")
    customer = require("src/modules/customer/CustomerRelatedPreview.tsx")
    page = require("src/modules/customer/CustomerRelatedReviewPage.tsx")
    css = require("src/modules/customer/customer-related-preview.css")
    doc = require("docs/architecture/CUSTOMER_RELATED_UI.md")

    for token in (
        "RelatedRecordPanelProps",
        'role="tablist"',
        'role="tab"',
        'role="tabpanel"',
        "headerActions",
    ):
        if token not in panel:
            raise AssertionError(f"shared related-record panel missing: {token}")

    for token in (
        "CustomerRelatedPanelPreview",
        "最近拜訪",
        "報價歷史",
        "正式商品",
        "未建檔",
        "等待 Audit API",
    ):
        if token not in customer:
            raise AssertionError(f"Customer related preview missing: {token}")

    if "CustomerRelatedReviewPage" not in page or "setActiveKey" not in page:
        raise AssertionError("Customer related review page is not interactive")

    for token in (
        ".cy-customer-visit-row",
        ".cy-customer-quote-card",
        ".cy-customer-frequent-grid",
        "@media (max-width: 620px)",
    ):
        if token not in css:
            raise AssertionError(f"Customer related adaptive CSS missing: {token}")

    for token in (
        "not the old GAS `頁內表單`",
        "BD-022",
        "BD-039",
        "on-demand",
        "no separate Mobile business implementation",
    ):
        if token not in doc:
            raise AssertionError(f"Customer related UI document missing: {token}")

    print("PASS historical Customer related-preview assets (not operational UI acceptance)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer related UI validation: {exc}", file=sys.stderr)
        raise
