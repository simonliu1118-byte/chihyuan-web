#!/usr/bin/env python3
"""Zero-dependency source checks for the integrated Customer workspace preview."""

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
    preview = require("preview/customer/full-workspace-v1.html")
    backlog = require("docs/architecture/CUSTOMER_UI_REVIEW_BACKLOG.md")

    for token in (
        "FULL CUSTOMER WORKSPACE PREVIEW",
        "新增客戶",
        "搜尋與選擇客戶",
        "拜訪紀錄",
        "新增拜訪",
        "報價紀錄",
        "新增報價紀錄",
        "修正紀錄",
        "常用商品",
        "編輯常用商品",
        "動態 / 歷史",
        "重新整理即還原",
        "不連 D1",
    ):
        if token not in preview:
            raise AssertionError(f"integrated preview missing token: {token}")

    for token in (
        "saveCustomer",
        "openVisit",
        "deleteVisit",
        "openQuote",
        "openFrequent",
        "beforeunload",
    ):
        if token not in preview:
            raise AssertionError(f"integrated preview missing interaction: {token}")

    for token in (
        "Search Pane / Detail Pane top alignment",
        "Search-result column stability",
        "Customer header action density",
        "Current priority",
    ):
        if token not in backlog:
            raise AssertionError(f"Customer UI review backlog missing: {token}")

    if "functionality" not in backlog.lower():
        raise AssertionError("Customer review priority must explicitly keep functionality first")

    print("PASS Customer full-workspace preview source checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Customer full-preview validation: {exc}", file=sys.stderr)
        raise
