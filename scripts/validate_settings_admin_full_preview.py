#!/usr/bin/env python3
"""Zero-dependency source checks for the Settings/Admin browser preview."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    text = (ROOT / path).read_text(encoding="utf-8")
    if not text.strip():
        raise AssertionError(f"empty file: {path}")
    return text


def main() -> int:
    preview = read("preview/settings/full-workspace-v1.html")
    doc = read("docs/architecture/SETTINGS_ADMIN_FULL_WORKSPACE_PREVIEW.md")

    for token in [
        "SUPER_ADMIN",
        "ADMIN",
        "EMPLOYEE",
        "結構設定",
        "App Tag／模組",
        "WorkLog 設定",
        "Audit Log",
        "備份／還原",
        "restoreStep2",
        "RESTORE",
        "setMemberTags" if False else "assignTags",
    ]:
        if token not in preview:
            raise AssertionError(f"missing Settings/Admin preview behavior: {token}")

    if "不連 D1/R2/GCS" not in preview:
        raise AssertionError("preview must expose the no-production-resource boundary")
    for token in ["SUPER_ADMIN only", "ADMIN or SUPER_ADMIN", "two-step pattern", "browser memory"]:
        if token.lower() not in doc.lower():
            raise AssertionError(f"missing Settings/Admin preview contract: {token}")

    print("PASS Settings/Admin full-workspace preview source checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
