#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_FILE="$ROOT/CYID_CONSUMER_VERSION"
BASE="https://raw.githubusercontent.com/simonliu1118-byte/CYapps/main/apps/CYCloudIdentity"

if [ ! -f "$LOCAL_FILE" ]; then
  echo "ERROR: missing CYID_CONSUMER_VERSION" >&2
  exit 1
fi

local_version="$(tr -d '[:space:]' < "$LOCAL_FILE")"
current_version="$(curl --fail --silent --show-error --location --retry 3 "$BASE/CONSUMER_CONTRACT_VERSION" | tr -d '[:space:]')"
minimum_version="$(curl --fail --silent --show-error --location --retry 3 "$BASE/CONSUMER_MIN_COMPATIBLE_VERSION" | tr -d '[:space:]')"
curl --fail --silent --show-error --location --retry 3 "$BASE/docs/CONSUMER_INTEGRATION_STANDARD.md" >/dev/null

python3 - "$minimum_version" "$local_version" "$current_version" <<'PY'
import re
import sys

values = sys.argv[1:]
for value in values:
    if not re.fullmatch(r"\d+\.\d+\.\d+", value):
        raise SystemExit(f"ERROR: invalid CYID consumer contract version: {value!r}")

minimum, local, current = (tuple(map(int, value.split("."))) for value in values)
if not (minimum <= local <= current):
    raise SystemExit(
        "ERROR: CY Web CYID_CONSUMER_VERSION is outside provider support window: "
        f"{sys.argv[2]} not in {sys.argv[1]}..{sys.argv[3]}"
    )
print(
    "CYID consumer contract supported: "
    f"consumer={sys.argv[2]} provider={sys.argv[1]}..{sys.argv[3]}"
)
PY
