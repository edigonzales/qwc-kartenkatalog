#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
catalog_only=false
for arg in "$@"; do
  case "$arg" in
    --catalog-only) catalog_only=true ;;
    --help|-h) echo 'Usage: scripts/down.sh [--catalog-only]'; echo 'Stop the stack, or only the catalog backend; keep images and source data.'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
cd "$repo_dir"
if "$catalog_only"; then
  docker compose --project-directory "$repo_dir" -f "$repo_dir/compose.yaml" stop kartenkatalog
else
  docker compose --project-directory "$repo_dir" -f "$repo_dir/compose.yaml" down
fi
