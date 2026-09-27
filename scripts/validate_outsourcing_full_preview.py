#!/usr/bin/env python3
"""Zero-dependency source checks for the integrated Outsourcing browser preview."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    text = (ROOT / path).read_text(encoding="utf-8")
    if not text.strip():
        raise AssertionError(f"empty file: {path}")
    return text


def main() -> int:
    preview = read("preview/outsourcing/full-workspace-v1.html")
    doc = read("docs/architecture/OUTSOURCING_FULL_WORKSPACE_PREVIEW.md")

    for token in [
        "代工工單",
        "代工對象／單價",
        "BOM 配方",
        "代工庫存",
        "confirmOutbound",
        "correctOutbound",
        "cancelOutbound",
        "openReceipt",
        "cancelReceipt",
        "priceOrder",
        "cancelPricing",
        "payOrder",
        "cancelPayment",
        "receipt_consumption",
        "outbound_supply",
        "reversal",
    ]:
        if token not in preview:
            raise AssertionError(f"missing preview behavior: {token}")

    if "待出庫階段不影響實際庫存" not in preview:
        raise AssertionError("preview must make pending-outbound stock timing visible")
    if "重新整理即還原" not in preview or "不連 D1" not in preview:
        raise AssertionError("preview runtime boundary is not visible")
    if "multiple BOM variants" not in doc and "multiple BOM" not in doc:
        raise AssertionError("preview doc must preserve multi-BOM review scenario")
    if "Browser preview arithmetic is illustrative only" not in doc:
        raise AssertionError("preview doc must distinguish demo arithmetic from production fixed-point authority")

    print("PASS Outsourcing full-workspace preview source checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
