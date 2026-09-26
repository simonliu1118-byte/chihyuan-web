#!/usr/bin/env python3
"""Zero-dependency source checks for the CY Web Worker/Vite local foundation."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(path: str) -> Path:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing required file: {path}")
    return target


def main() -> int:
    package = json.loads(require("package.json").read_text(encoding="utf-8"))
    version = require("VERSION").read_text(encoding="utf-8").strip()
    if package.get("version") != version:
        raise AssertionError("package.json version must match VERSION")

    wrangler = json.loads(require("wrangler.jsonc").read_text(encoding="utf-8"))
    if wrangler.get("main") != "./worker/index.ts":
        raise AssertionError("Worker entrypoint mismatch")
    assets = wrangler.get("assets") or {}
    if assets.get("not_found_handling") != "single-page-application":
        raise AssertionError("SPA asset fallback is not configured")
    if "/api/*" not in (assets.get("run_worker_first") or []):
        raise AssertionError("/api/* must run through the Worker first")

    d1 = wrangler.get("d1_databases") or []
    if len(d1) != 1 or d1[0].get("binding") != "DB":
        raise AssertionError("exactly one local DB binding named DB is expected")
    if d1[0].get("database_id") != "00000000-0000-0000-0000-000000000000":
        raise AssertionError("public foundation config must not contain a production D1 id")
    if d1[0].get("migrations_dir") != "migrations":
        raise AssertionError("D1 migration source directory mismatch")

    worker = require("worker/index.ts").read_text(encoding="utf-8")
    if '"/api/health"' not in worker:
        raise AssertionError("health route missing")
    if "crypto.randomUUID()" not in worker:
        raise AssertionError("request correlation id generation missing")

    response_helper = require("worker/http/response.ts").read_text(encoding="utf-8")
    if '"cache-control": "no-store"' not in response_helper:
        raise AssertionError("API no-store header missing")
    if "ApiSuccess" not in response_helper or "ApiFailure" not in response_helper:
        raise AssertionError("shared API response envelope helper missing")

    request_helper = require("worker/http/request.ts").read_text(encoding="utf-8")
    if "REQUEST_TOO_LARGE" not in request_helper or "INVALID_JSON" not in request_helper:
        raise AssertionError("bounded JSON request parsing checks missing")

    validation_helper = require("worker/validation/fields.ts").read_text(encoding="utf-8")
    if "FieldValidationError" not in validation_helper or "ValidationBag" not in validation_helper:
        raise AssertionError("shared field validation helper missing")

    error_helper = require("worker/http/errors.ts").read_text(encoding="utf-8")
    if "VALIDATION_ERROR" not in error_helper or "INTERNAL_ERROR" not in error_helper:
        raise AssertionError("shared request error mapping missing")

    api_client = require("src/api/client.ts").read_text(encoding="utf-8")
    if "ApiClientError" not in api_client or 'cache: "no-store"' not in api_client:
        raise AssertionError("shared browser API client safeguards missing")

    app_shell = require("src/ui/shell/AppShell.tsx").read_text(encoding="utf-8")
    if "cy-main-content" not in app_shell or "NavigationGroup" not in app_shell:
        raise AssertionError("shared app shell structure missing")

    unsaved_guard = require("src/ui/foundation/useUnsavedChangesGuard.ts").read_text(encoding="utf-8")
    if "beforeunload" not in unsaved_guard or "confirmNavigation" not in unsaved_guard:
        raise AssertionError("shared unsaved-change guard missing")

    data_view = require("src/ui/data/DataView.tsx").read_text(encoding="utf-8")
    if "cy-data-table-wrap" not in data_view or "cy-data-cards" not in data_view:
        raise AssertionError("adaptive shared data view projections missing")
    if 'status === "loading"' not in data_view or 'status === "error"' not in data_view:
        raise AssertionError("shared data view request states missing")

    entity_picker = require("src/ui/pickers/EntityPicker.tsx").read_text(encoding="utf-8")
    if "AbortController" not in entity_picker or 'role="combobox"' not in entity_picker:
        raise AssertionError("shared async entity picker contract missing")
    if "skipNextNullSyncRef" not in entity_picker or "onSelect(null)" not in entity_picker:
        raise AssertionError("entity picker stale-selection invalidation missing")

    editable_list = require("src/ui/foundation/editable-list.ts").read_text(encoding="utf-8")
    for required_action in ('type: "add"', 'type: "update"', 'type: "remove"', 'type: "move"', 'type: "commit"'):
        if required_action not in editable_list:
            raise AssertionError(f"shared editable-list action missing: {required_action}")
    if "baselineRows" not in editable_list or "serializeEditableList" not in editable_list:
        raise AssertionError("editable-list baseline/serialization contract missing")

    for path in (
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
        "src/app.css",
        "src/api/request-state.ts",
        "src/ui/forms.css",
        "src/ui/data/data-view.css",
        "src/ui/data/DataPagination.tsx",
        "src/ui/data/DataView.tsx",
        "src/ui/data/DataViewToolbar.tsx",
        "src/ui/foundation/editable-list.ts",
        "src/ui/foundation/record-editor.ts",
        "src/ui/foundation/navigation.ts",
        "src/ui/foundation/useDebouncedValue.ts",
        "src/ui/foundation/useUnsavedChangesGuard.ts",
        "src/ui/pickers/entity-picker.css",
        "src/ui/pickers/EntityPicker.tsx",
        "src/ui/primitives/Button.tsx",
        "src/ui/primitives/FieldFrame.tsx",
        "src/ui/primitives/Notice.tsx",
        "src/ui/primitives/Section.tsx",
        "src/ui/primitives/SelectField.tsx",
        "src/ui/primitives/StatusChip.tsx",
        "src/ui/primitives/TextArea.tsx",
        "src/ui/primitives/TextInput.tsx",
        "docs/architecture/APP_SHELL_FOUNDATION.md",
        "docs/architecture/FORM_FOUNDATION.md",
        "docs/architecture/DATA_VIEW_FOUNDATION.md",
        "docs/architecture/ENTITY_PICKER_FOUNDATION.md",
        "docs/architecture/EDITABLE_LIST_FOUNDATION.md",
        "shared/api.ts",
        "vite.config.ts",
        "tsconfig.json",
        "tsconfig.worker.json",
        "migrations/0001_initial.sql",
        "scripts/validate_schema.py",
    ):
        require(path)

    print("PASS foundation source/config checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL foundation validation: {exc}", file=sys.stderr)
        raise
