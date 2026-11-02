#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
local_qwc=false
catalog_only=false
for arg in "$@"; do
  case "$arg" in
    --catalog-only) catalog_only=true ;;
    --local-qwc) local_qwc=true ;;
    --help|-h) echo 'Usage: scripts/up.sh [--local-qwc | --catalog-only]'; echo 'Start published images, build QWC locally, or start only the catalog backend.'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
if "$local_qwc" && "$catalog_only"; then
  echo "--local-qwc and --catalog-only are mutually exclusive" >&2
  exit 2
fi
cd "$repo_dir"
compose=(docker compose --project-directory "$repo_dir" -f "$repo_dir/compose.yaml")
if "$local_qwc"; then compose+=(-f "$repo_dir/compose.local.yaml"); fi
# Validate interpolation and the configuration before pulling/building anything.
"${compose[@]}" config --quiet
catalog_xtf='./data/kartenkatalog-harvest-ohne-qml.xtf'
while IFS= read -r line; do
  case "$line" in CATALOG_XTF_PATH=*) catalog_xtf="${line#*=}" ;; esac
done < <("${compose[@]}" config --environment)
catalog_xtf="${catalog_xtf:-./data/kartenkatalog-harvest-ohne-qml.xtf}"
if [[ "$catalog_xtf" != /* ]]; then catalog_xtf="$repo_dir/$catalog_xtf"; fi
if [[ ! -f "$catalog_xtf" || ! -r "$catalog_xtf" ]]; then
  echo "XTF file missing or unreadable: $catalog_xtf (set CATALOG_XTF_PATH)" >&2
  exit 1
fi
if "$catalog_only"; then
  "${compose[@]}" pull kartenkatalog
  "${compose[@]}" up -d --no-deps --no-build --pull never --wait --wait-timeout 180 kartenkatalog
  "${compose[@]}" ps kartenkatalog
  catalog_address="$("${compose[@]}" port kartenkatalog 8080)"
  printf '\nKartenkatalog: http://%s/thema\n' "$catalog_address"
  exit 0
fi
if "$local_qwc"; then
  "${compose[@]}" pull kartenkatalog
  "${compose[@]}" build qwc
else
  "${compose[@]}" pull
fi
"${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 180
"${compose[@]}" ps
qwc_address="$("${compose[@]}" port qwc 8080)"
catalog_address="$("${compose[@]}" port kartenkatalog 8080)"
printf '\nWeb GIS Client: http://%s/map/\nKartenkatalog:  http://%s/thema\n' "$qwc_address" "$catalog_address"
