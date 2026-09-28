#!/usr/bin/env python3
"""Run CY Web migrations and core/domain transaction checks against Wrangler local D1."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
MAIN_CONFIG = ROOT / "wrangler.jsonc"
ACCEPTANCE_CONFIG = ROOT / "wrangler.d1-acceptance.jsonc"
EXPECTED_MIGRATIONS = {
    "0001_initial.sql",
    "0002_defect_invalidation.sql",
    "0003_identity_web_sessions.sql",
}


def npx_command() -> str:
    candidate = shutil.which("npx.cmd" if os.name == "nt" else "npx")
    if candidate:
        return candidate
    fallback = shutil.which("npx")
    if fallback:
        return fallback
    raise RuntimeError("npx is required; run npm install with a supported Node.js installation first")


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault("WRANGLER_SEND_METRICS", "false")
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and completed.returncode != 0:
        raise RuntimeError(
            "command failed:\n"
            + " ".join(command)
            + f"\nexit={completed.returncode}\nstdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    return completed


def wrangler(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return run([npx_command(), "wrangler", *args], check=check)


def d1_json(state_dir: Path, sql: str) -> list[dict[str, Any]]:
    completed = wrangler(
        "d1",
        "execute",
        "DB",
        "--local",
        "--persist-to",
        str(state_dir),
        "--config",
        str(MAIN_CONFIG),
        "--command",
        sql,
        "--json",
    )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Wrangler returned non-JSON D1 output: {completed.stdout}") from exc

    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected Wrangler D1 JSON shape: {payload!r}")
    for entry in payload:
        if not isinstance(entry, dict) or entry.get("success") is False:
            raise RuntimeError(f"D1 command did not succeed: {payload!r}")
    return payload


def result_rows(payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for entry in payload:
        value = entry.get("results", [])
        if isinstance(value, list):
            rows.extend(row for row in value if isinstance(row, dict))
    return rows


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def worker_log(log_path: Path) -> str:
    return log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else ""


def wait_for_acceptance(port: int, process: subprocess.Popen[str], log_path: Path) -> dict[str, Any]:
    url = f"http://127.0.0.1:{port}/__d1_acceptance"
    deadline = time.monotonic() + 60
    last_error: Exception | None = None

    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                f"Wrangler acceptance Worker exited early with {process.returncode}\n{worker_log(log_path)}"
            )
        try:
            with urlopen(url, timeout=2) as response:
                body = response.read().decode("utf-8")
                payload = json.loads(body)
                if response.status != 200 or payload.get("ok") is not True:
                    raise RuntimeError(f"D1 acceptance Worker failed: HTTP {response.status} {payload!r}")
                return payload
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                payload: Any = json.loads(body)
            except json.JSONDecodeError:
                payload = body
            raise RuntimeError(
                f"D1 acceptance Worker failed: HTTP {exc.code} {payload!r}\n{worker_log(log_path)}"
            ) from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            time.sleep(0.5)

    raise RuntimeError(
        f"Timed out waiting for D1 acceptance Worker: {last_error}\n{worker_log(log_path)}"
    )


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=8)


def validate_identity_session_d1(state_dir: Path) -> None:
    columns = {
        str(row.get("name", ""))
        for row in result_rows(d1_json(state_dir, "PRAGMA table_info(web_sessions)"))
    }
    required = {
        "session_hash",
        "identity_employee_id",
        "employee_no",
        "employee_name",
        "role",
        "workspace_id",
        "credential_version",
        "employee_revision",
        "created_at",
        "expires_at",
    }
    missing = required - columns
    if missing:
        raise RuntimeError(f"web_sessions migration columns missing: {sorted(missing)}")

    d1_json(
        state_dir,
        """
        INSERT OR IGNORE INTO app_members(
          identity_employee_id, employee_no, is_active, created_at, updated_at
        ) VALUES(
          'identity-session-acceptance', '9999', 1,
          '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.000Z'
        );
        INSERT INTO web_sessions(
          session_hash, identity_employee_id, employee_no, employee_name, role,
          credential_version, employee_revision, created_at, expires_at
        ) VALUES(
          'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          'identity-session-acceptance', '9999', 'Identity Acceptance', 'ADMIN',
          2, 3, '2026-09-28T00:00:00.000Z', '2026-09-28T08:00:00.000Z'
        );
        """,
    )
    rows = result_rows(
        d1_json(
            state_dir,
            """
            SELECT identity_employee_id, employee_no, employee_name, role,
                   credential_version, employee_revision
              FROM web_sessions
             WHERE session_hash =
               'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
            """,
        )
    )
    if rows != [{
        "identity_employee_id": "identity-session-acceptance",
        "employee_no": "9999",
        "employee_name": "Identity Acceptance",
        "role": "ADMIN",
        "credential_version": 2,
        "employee_revision": 3,
    }]:
        raise RuntimeError(f"D1 identity session round-trip mismatch: {rows!r}")


def main() -> int:
    if not MAIN_CONFIG.is_file() or not ACCEPTANCE_CONFIG.is_file():
        raise RuntimeError("Wrangler local D1 configuration is missing")

    with tempfile.TemporaryDirectory(prefix="cyweb-d1-acceptance-") as temporary:
        state_dir = Path(temporary) / "state"
        state_dir.mkdir(parents=True, exist_ok=True)

        wrangler(
            "d1",
            "migrations",
            "apply",
            "DB",
            "--local",
            "--persist-to",
            str(state_dir),
            "--config",
            str(MAIN_CONFIG),
        )

        migrations = result_rows(
            d1_json(state_dir, "SELECT name FROM d1_migrations ORDER BY id")
        )
        applied = {str(row.get("name", "")) for row in migrations}
        missing = EXPECTED_MIGRATIONS - applied
        if missing:
            raise RuntimeError(f"Expected D1 migrations were not applied: {sorted(missing)}; applied={sorted(applied)}")

        wrangler(
            "d1",
            "migrations",
            "apply",
            "DB",
            "--local",
            "--persist-to",
            str(state_dir),
            "--config",
            str(MAIN_CONFIG),
        )

        port = free_port()
        log_path = Path(temporary) / "wrangler-acceptance.log"
        env = os.environ.copy()
        env.setdefault("WRANGLER_SEND_METRICS", "false")
        with log_path.open("w", encoding="utf-8") as log_file:
            process = subprocess.Popen(
                [
                    npx_command(),
                    "wrangler",
                    "dev",
                    "--config",
                    str(ACCEPTANCE_CONFIG),
                    "--persist-to",
                    str(state_dir),
                    "--ip",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ],
                cwd=ROOT,
                env=env,
                text=True,
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )
            try:
                payload = wait_for_acceptance(port, process, log_path)
            finally:
                stop_process(process)

        checks = payload.get("checks")
        expected_checks = {
            "customerBatchCreate",
            "optimisticRevision",
            "batchRollback",
            "auditAtomicBatch",
            "fixedPointIntegers",
            "foreignKeys",
            "defectInvalidationMigration",
            "itemConversionExact",
            "outsourcingReversalStock",
            "workLogReviewLifecycle",
        }
        if not isinstance(checks, dict):
            raise RuntimeError(f"Acceptance response did not include checks: {payload!r}")
        failed = sorted(name for name in expected_checks if checks.get(name) is not True)
        if failed:
            raise RuntimeError(f"D1 acceptance checks failed or were missing: {failed}; payload={payload!r}")

        validate_identity_session_d1(state_dir)

        print("PASS Wrangler local D1 migrations:", ", ".join(sorted(applied)))
        print("PASS Worker + D1 acceptance:", ", ".join(sorted(expected_checks)))
        print("PASS Identity session migration + D1 round-trip")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
