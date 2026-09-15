#!/usr/bin/env bash
#
# build-vsix.sh — build an installable .vsix of the Baugraph extension
#
# Anyone can run this on a clone of the repository to produce their own
# package — no marketplace account or token needed. See ../BUILD_YOUR_OWN.md
# for the full walkthrough. The .vsix is written to ../output/.
#
# Usage:
#   ./build-vsix.sh              # npm ci (root + extension) + build + package
#   ./build-vsix.sh --no-install # reuse existing node_modules in both places
#   ./build-vsix.sh --install    # also run `code --install-extension` on the result
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXT_DIR="$REPO_ROOT/extension"
OUT_DIR="$REPO_ROOT/VSCodeExtension/output"

INSTALL_DEPS=1
INSTALL_EXTENSION=0

for arg in "$@"; do
  case "$arg" in
    --no-install) INSTALL_DEPS=0 ;;
    --install)    INSTALL_EXTENSION=1 ;;
    -h|--help)    sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "node is not installed"
command -v npm  >/dev/null || die "npm is not installed"

cd "$REPO_ROOT"
log "Building the Baugraph VS Code extension"
log "node $(node --version) / npm $(npm --version)"

if [[ "$INSTALL_DEPS" -eq 1 ]]; then
  log "Installing root dependencies (npm ci)"
  npm ci
  log "Installing extension dependencies (npm ci)"
  npm --prefix extension ci
else
  [[ -d node_modules ]] || die "node_modules missing at repo root — run without --no-install"
  [[ -d extension/node_modules ]] || die "extension/node_modules missing — run without --no-install"
  log "Skipping dependency install"
fi

log "Building the webview and the extension host"
npm run extension:build

VERSION="$(node -p "require('$EXT_DIR/package.json').version")"
mkdir -p "$OUT_DIR"
VSIX="$OUT_DIR/baugraph-$VERSION.vsix"

log "Packaging the .vsix"
(cd "$EXT_DIR" && npx vsce package --no-dependencies -o "$VSIX")

log "Built: $VSIX ($(du -h "$VSIX" | cut -f1))"

if [[ "$INSTALL_EXTENSION" -eq 1 ]]; then
  command -v code >/dev/null || die "--install requested but the 'code' CLI is not on PATH"
  log "Installing into VS Code"
  code --install-extension "$VSIX"
fi

log "Done. Install manually with:"
echo "    code --install-extension \"$VSIX\""
echo "or via the Extensions view's … menu → Install from VSIX…"
