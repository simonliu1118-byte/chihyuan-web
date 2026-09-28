#!/usr/bin/env python3
"""Static zero-dependency checks for the integrated Sales Work Order preview."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "preview" / "sales-work-order" / "full-workspace-v1.html"
DOC = ROOT / "docs" / "architecture" / "SALES_WORK_ORDER_UI_PREVIEW.md"


def require(text: str, token: str, source: str) -> None:
    if token not in text:
        raise AssertionError(f"missing {token!r} in {source}")


def main() -> int:
    html = HTML.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    for token in [
        "Full Preview 0.1.30",
        "搜尋與選擇工單",
        "新增工單",
        "回填 ERP 資料",
        "更正 ERP 資料",
        "等到貨",
        "確認撿貨",
        "確認出貨",
        "取消出貨／退回已撿貨",
        "作廢工單",
        "現場僅輸入名稱",
        "重新整理即還原",
        "font-size:15px",
        "editorbottom",
        "function applyErp()",
        "function reverseShipment()",
        "function voidOrder()",
        "function deleteDraft()",
    ]:
        require(html, token, str(HTML))

    for token in [
        "browser-local functional review surface",
        "no auto-linking",
        "created -> issued",
        "shipped -> picked",
        "not a production numbering decision",
    ]:
        require(doc, token, str(DOC))

    if "google.script.run" in html:
        raise AssertionError("Sales Work Order preview must not use GAS runtime")
    if "fetch('/api" in html or 'fetch("/api' in html:
        raise AssertionError("Sales Work Order preview must not call protected API")

    print("PASS Sales Work Order integrated functional preview")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
