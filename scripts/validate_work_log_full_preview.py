#!/usr/bin/env python3
"""Zero-dependency source checks for the integrated WorkLog browser preview."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    text = (ROOT / path).read_text(encoding="utf-8")
    if not text.strip():
        raise AssertionError(f"empty file: {path}")
    return text


def main() -> int:
    preview = read("preview/worklog/full-workspace-v1.html")
    doc = read("docs/architecture/WORK_LOG_FULL_WORKSPACE_PREVIEW.md")

    for token in [
        "新增日誌",
        "送出審核",
        "撤回審核",
        "審核計分",
        "取消審核",
        "歷史統計",
        "設定參考",
        "工作日數",
        "saveReview",
        "cancelReview",
        "renderStats",
    ]:
        if token not in preview:
            raise AssertionError(f"missing WorkLog preview behavior: {token}")

    if "不是志遠正式設定" not in preview:
        raise AssertionError("preview must make neutral-configuration boundary visible")
    if "重新整理即還原" not in preview or "不連 D1" not in preview:
        raise AssertionError("preview runtime boundary is not visible")
    for token in ["reviewed", "pending_review", "weighted by Work Days", "neutral labels"]:
        if token.lower() not in doc.lower():
            raise AssertionError(f"missing WorkLog preview contract: {token}")

    print("PASS WorkLog full-workspace preview source checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
