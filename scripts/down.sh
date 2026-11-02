#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for arg in "$@"; do
  case "$arg" in
    --help|-h) echo 'Usage: scripts/down.sh'; echo 'Stop the stack; keep images and source data.'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
cd "$repo_dir"
docker compose --project-directory "$repo_dir" -f "$repo_dir/compose.yaml" down
