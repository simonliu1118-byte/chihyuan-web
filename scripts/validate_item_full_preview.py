#!/usr/bin/env python3
"""Zero-dependency checks for the integrated Item/Defect browser preview."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def main() -> int:
    preview = read("preview/item/full-workspace-v1.html")
    docs = read("docs/architecture/ITEM_FULL_WORKSPACE_PREVIEW.md")
    item_contract = read("docs/architecture/ITEM_MODULE_CONTRACT.md")
    defect_contract = read("docs/architecture/DEFECT_MODULE_CONTRACT.md")

    for token in (
        "搜尋與選擇商品",
        "更改品號",
        "品號歷史",
        "單位換算",
        "瑕疵紀錄",
        "開始處理",
        "標記已處理",
        "重新開啟",
        "作廢紀錄",
        "formactions",
        "topedit",
    ):
        if token not in preview:
            raise AssertionError(f"integrated Item preview missing: {token}")

    if "font-size:16px" not in preview or ".field input,.field select,.field textarea" not in preview:
        raise AssertionError("Item preview readability baseline missing")

    for phrase in (
        "top and bottom Cancel/Save",
        "invalidated rather than hard-deleted",
        "no actual Audit/D1 transaction occurs",
    ):
        if phrase not in docs:
            raise AssertionError(f"Item preview contract missing: {phrase}")

    if "CY Web never generates a formal SMART ERP Item number" not in item_contract:
        raise AssertionError("Item ERP-number boundary missing")
    if "Invalidation is **not** a fourth workflow status" not in defect_contract:
        raise AssertionError("Defect invalidation boundary missing")

    print("PASS integrated Item/Defect preview source checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL Item full-preview validation: {exc}", file=sys.stderr)
        raise
