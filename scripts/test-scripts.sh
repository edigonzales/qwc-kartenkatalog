#!/usr/bin/env bash
# Command-contract tests: no Docker daemon, pull, build or publish is contacted.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
cat > "$scratch/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$COMMAND_LOG"
case "$*" in *'config --environment') echo "CATALOG_XTF_PATH=${TEST_XTF}" ;; esac
MOCK
chmod +x "$scratch/docker"
export PATH="$scratch:$PATH" COMMAND_LOG="$scratch/commands" TEST_XTF="$repo_dir/data/kartenkatalog-harvest-ohne-qml.xtf"
cd "$scratch"
"$repo_dir/scripts/up.sh" --help > /dev/null
"$repo_dir/scripts/down.sh" --help > /dev/null
[[ ! -f "$COMMAND_LOG" ]]
if "$repo_dir/scripts/up.sh" --bogus 2>/dev/null; then exit 1; fi
if "$repo_dir/scripts/down.sh" --local-qwc 2>/dev/null; then exit 1; fi
"$repo_dir/scripts/up.sh" > /dev/null
grep -q ' pull$' "$COMMAND_LOG"
! grep -q ' build ' "$COMMAND_LOG"
: > "$COMMAND_LOG"
"$repo_dir/scripts/up.sh" --local-qwc > /dev/null
grep -q 'pull kartenkatalog$' "$COMMAND_LOG"
grep -q 'build qwc$' "$COMMAND_LOG"
! grep -q ' pull$' "$COMMAND_LOG"
grep -q 'up -d --no-build --pull never --wait' "$COMMAND_LOG"
"$repo_dir/scripts/down.sh"
grep -q ' down$' "$COMMAND_LOG"
: > "$COMMAND_LOG"
export TEST_XTF="$scratch/missing.xtf"
if "$repo_dir/scripts/up.sh" 2>/dev/null; then exit 1; fi
! grep -q ' pull' "$COMMAND_LOG"
echo 'Script contracts passed'
