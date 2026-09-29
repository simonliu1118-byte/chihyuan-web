#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIRROR_ROOT="$ROOT/docs/contracts/cyid"
BASE="https://raw.githubusercontent.com/simonliu1118-byte/CYapps/main/apps/CYCloudIdentity"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$MIRROR_ROOT"

curl --fail --silent --show-error --location --retry 3   "$BASE/CONSUMER_SYNC_MANIFEST.json"   -o "$TMP/CONSUMER_SYNC_MANIFEST.json"

python3 - "$TMP/CONSUMER_SYNC_MANIFEST.json" <<'PY' > "$TMP/files.tsv"
import json
import pathlib
import sys

manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if manifest.get("schemaVersion") != 1:
    raise SystemExit("Unsupported CYID consumer sync manifest schema")
if manifest.get("consumerMirrorRoot") != "docs/contracts/cyid":
    raise SystemExit("Unexpected CYID consumer mirror root")

seen_sources = set()
seen_targets = set()
for entry in manifest.get("files", []):
    source = entry.get("source")
    target = entry.get("target")
    if not isinstance(source, str) or not isinstance(target, str):
        raise SystemExit("Invalid CYID sync manifest entry")
    for value in (source, target):
        parts = pathlib.PurePosixPath(value).parts
        if value.startswith("/") or ".." in parts:
            raise SystemExit(f"Unsafe CYID sync path: {value}")
    if source in seen_sources or target in seen_targets:
        raise SystemExit("Duplicate CYID sync manifest source/target")
    seen_sources.add(source)
    seen_targets.add(target)
    print(f"{source}\t{target}")
PY

cp "$TMP/CONSUMER_SYNC_MANIFEST.json" "$MIRROR_ROOT/CONSUMER_SYNC_MANIFEST.json"

while IFS=$'\t' read -r source target; do
  [ -n "$source" ] || continue
  mkdir -p "$(dirname "$MIRROR_ROOT/$target")"
  curl --fail --silent --show-error --location --retry 3     "$BASE/$source"     -o "$MIRROR_ROOT/$target"
  echo "Synced CYID contract: $target"
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

for path in sorted(root.rglob("*"), reverse=True):
    if path.is_file():
        rel = path.relative_to(root).as_posix()
        if rel not in allowed:
            path.unlink()
            print(f"Removed stale CYID mirror file: {rel}")
for path in sorted(root.rglob("*"), reverse=True):
    if path.is_dir() and not any(path.iterdir()):
        path.rmdir()
PY

echo "CYID consumer contract mirror synchronized."
