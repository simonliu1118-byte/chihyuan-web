#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIRROR_ROOT="$ROOT/docs/contracts/cyid"
BASE="https://raw.githubusercontent.com/simonliu1118-byte/CYapps/main/apps/CYCloudIdentity"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ ! -d "$MIRROR_ROOT" ]; then
  echo "ERROR: missing CYID contract mirror: $MIRROR_ROOT" >&2
  exit 1
fi

curl --fail --silent --show-error --location --retry 3   "$BASE/CONSUMER_SYNC_MANIFEST.json"   -o "$TMP/CONSUMER_SYNC_MANIFEST.json"

if ! cmp --silent "$MIRROR_ROOT/CONSUMER_SYNC_MANIFEST.json" "$TMP/CONSUMER_SYNC_MANIFEST.json"; then
  echo "ERROR: local CYID CONSUMER_SYNC_MANIFEST.json is not synchronized with CYID main." >&2
  exit 1
fi

python3 - "$TMP/CONSUMER_SYNC_MANIFEST.json" <<'PY' > "$TMP/files.tsv"
import json
import pathlib
import sys

manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if manifest.get("schemaVersion") != 1:
    raise SystemExit("ERROR: unsupported CYID consumer sync manifest schema")
if manifest.get("sourceRepository") != "simonliu1118-byte/CYapps":
    raise SystemExit("ERROR: unexpected CYID sync source repository")
if manifest.get("sourceBranch") != "main":
    raise SystemExit("ERROR: unexpected CYID sync source branch")
if manifest.get("sourceRoot") != "apps/CYCloudIdentity":
    raise SystemExit("ERROR: unexpected CYID sync source root")
if manifest.get("consumerMirrorRoot") != "docs/contracts/cyid":
    raise SystemExit("ERROR: unexpected CYID mirror root")

sources = set()
targets = set()
for entry in manifest.get("files", []):
    source = entry.get("source")
    target = entry.get("target")
    if not isinstance(source, str) or not isinstance(target, str):
        raise SystemExit("ERROR: invalid CYID sync manifest entry")
    for value in (source, target):
        parts = pathlib.PurePosixPath(value).parts
        if value.startswith("/") or ".." in parts:
            raise SystemExit(f"ERROR: unsafe CYID sync path: {value}")
    if source in sources or target in targets:
        raise SystemExit("ERROR: duplicate CYID sync manifest entry")
    sources.add(source)
    targets.add(target)
    print(f"{source}\t{target}")
if not targets:
    raise SystemExit("ERROR: empty CYID sync manifest")
PY

while IFS=$'\t' read -r source target; do
  [ -n "$source" ] || continue
  local_path="$MIRROR_ROOT/$target"
  remote_path="$TMP/remote-$(printf '%s' "$target" | tr '/ ' '__')"
  if [ ! -f "$local_path" ]; then
    echo "ERROR: missing mirrored CYID contract file: $target" >&2
    exit 1
  fi
  curl --fail --silent --show-error --location --retry 3     "$BASE/$source"     -o "$remote_path"
  if ! cmp --silent "$local_path" "$remote_path"; then
    echo "ERROR: CYID contract mirror drift: $target" >&2
    echo "Run: bash scripts/sync-cyid-consumer-contract.sh" >&2
    exit 1
  fi
done < "$TMP/files.tsv"

python3 - "$MIRROR_ROOT" "$TMP/files.tsv" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
allowed = {"README.md", "CONSUMER_SYNC_MANIFEST.json"}
for line in pathlib.Path(sys.argv[2]).read_text(encoding="utf-8").splitlines():
    if not line:
        continue
    _source, target = line.split("\t", 1)
    allowed.add(pathlib.PurePosixPath(target).as_posix())

actual = {
    path.relative_to(root).as_posix()
    for path in root.rglob("*")
    if path.is_file()
}
unexpected = sorted(actual - allowed)
missing = sorted(allowed - actual)
if unexpected:
    raise SystemExit(f"ERROR: unexpected stale CYID mirror files: {unexpected}")
if missing:
    raise SystemExit(f"ERROR: missing CYID mirror files: {missing}")
PY

bash "$ROOT/scripts/validate-cyid-consumer-version.sh"

echo "CYID consumer contract mirror matches canonical main."
