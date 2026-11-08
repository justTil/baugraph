#!/usr/bin/env bash
#
# test.sh — run the schema fixture tests
#
# Fixture directories under tests/fixtures/ are named after the release version
# (from version.txt, e.g. 1.28.0), so a failing test points straight at the
# release where a document stopped parsing / validating.
#
# Usage:
#   ./test.sh                 # run every fixture suite once
#   ./test.sh --watch         # re-run on change
#   ./test.sh --new           # create tests/fixtures/<version.txt>/ from the
#                             # newest existing release, then run once
#   ./test.sh <vitest args…>  # anything else is passed through to vitest
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

VERSION="$(tr -d '[:space:]' < version.txt)"
FIXTURES="tests/fixtures"

# highest x.y.z directory under tests/fixtures/, or empty
newest_release() {
  ls -1 "$FIXTURES" 2>/dev/null \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -t. -k1,1n -k2,2n -k3,3n \
    | tail -1
}

scaffold() {
  target="$FIXTURES/$VERSION"
  if [ -d "$target" ]; then
    echo "$target already exists — nothing to scaffold"
    return
  fi
  mkdir -p "$target/valid" "$target/invalid"
  prev="$(newest_release)"
  if [ -n "$prev" ]; then
    cp -R "$FIXTURES/$prev/valid/." "$target/valid/" 2>/dev/null || true
    cp -R "$FIXTURES/$prev/invalid/." "$target/invalid/" 2>/dev/null || true
    echo "scaffolded $target from $prev"
  else
    echo "scaffolded empty $target"
  fi
}

MODE="run"
set +u
PASSTHROUGH=()
for arg in "$@"; do
  case "$arg" in
    --new)   scaffold ;;
    --watch) MODE="watch" ;;
    *)       PASSTHROUGH+=("$arg") ;;
  esac
done
set -u

echo "baugraph $VERSION — schema fixture tests"
echo

VITEST=(npx vitest)
if [ "$MODE" = "run" ]; then VITEST+=(run); fi
VITEST+=(tests/schema)
if [ "${#PASSTHROUGH[@]}" -gt 0 ]; then VITEST+=("${PASSTHROUGH[@]}"); fi

exec "${VITEST[@]}"
