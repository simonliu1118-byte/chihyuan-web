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
    "0004_remove_local_identity_sessions.sql",
    "0005_direct_module_access.sql",
    "0006_backup_catalog.sql",
    "0007_retired_entity_ids.sql",
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
    origin = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 60
    last_error: Exception | None = None

    # Probe a non-mutating route while Wrangler starts. The acceptance route
    # writes fixtures and must never be used as a readiness/retry probe.
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                f"Wrangler acceptance Worker exited early with {process.returncode}\n{worker_log(log_path)}"
            )
        try:
            with urlopen(origin + "/__d1_ready", timeout=2) as response:
                raise RuntimeError(f"Unexpected acceptance readiness response: {response.status}")
        except HTTPError as exc:
            payload = json.loads(exc.read().decode("utf-8"))
            if exc.code != 404 or payload.get("error") != "NOT_FOUND":
                raise RuntimeError(f"Unexpected acceptance readiness response: {exc.code} {payload!r}") from exc
            break
        except (URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(0.5)
    else:
        raise RuntimeError(
            f"Timed out waiting for D1 acceptance Worker: {last_error}\n{worker_log(log_path)}"
        )

    # One request with a bounded suite timeout. Timeout, invalid JSON or an HTTP
    # failure is terminal: the first request may already have written fixtures.
    try:
        with urlopen(origin + "/__d1_acceptance", timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if response.status != 200 or payload.get("ok") is not True:
                raise RuntimeError(f"D1 acceptance Worker failed: HTTP {response.status} {payload!r}")
            return payload
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = body
        raise RuntimeError(
            f"D1 acceptance Worker failed: HTTP {exc.code} {payload!r}\n{worker_log(log_path)}"
        ) from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"D1 acceptance request failed; not retried: {exc}\n{worker_log(log_path)}"
        ) from exc


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=8)


def validate_identity_session_removed(state_dir: Path) -> None:
    rows = result_rows(
        d1_json(
            state_dir,
            "SELECT name FROM sqlite_master WHERE type='table' AND name='web_sessions'",
        )
    )
    if rows:
        raise RuntimeError(f"retired web_sessions table still exists: {rows!r}")


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

        wrangler(
            "d1", "migrations", "apply", "RESTORE_DB", "--local",
            "--persist-to", str(state_dir), "--config", str(ACCEPTANCE_CONFIG),
        )
        wrangler(
            "d1", "migrations", "apply", "REHEARSAL_DB", "--local",
            "--persist-to", str(state_dir), "--config", str(ACCEPTANCE_CONFIG),
        )

        validate_identity_session_removed(state_dir)

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
            "settingsAuditHttpAuthority",
            "businessHttpAuthority",
            "retiredEntityIds",
            "portableBackupRecovery",
        "tieredBackup",
        "isolatedRecovery",
        }
        if not isinstance(checks, dict):
            raise RuntimeError(f"Acceptance response did not include checks: {payload!r}")
        failed = sorted(name for name in expected_checks if checks.get(name) is not True)
        if failed:
            raise RuntimeError(f"D1 acceptance checks failed or were missing: {failed}; payload={payload!r}")

        print("PASS Wrangler local D1 migrations:", ", ".join(sorted(applied)))
        print("PASS Worker + D1 acceptance:", ", ".join(sorted(expected_checks)))
        print("PASS retired local Identity session table removed")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
