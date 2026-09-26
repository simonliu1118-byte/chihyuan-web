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

    api_client = require("src/api/client.ts").read_text(encoding="utf-8")
    if "ApiClientError" not in api_client or 'cache: "no-store"' not in api_client:
        raise AssertionError("shared browser API client safeguards missing")

    for path in (
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
        "src/app.css",
        "src/api/request-state.ts",
        "src/ui/foundation/record-editor.ts",
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
