#!/usr/bin/env bash
#
# build.sh — produce a production build in ./dist
#
# Usage:
#   ./build.sh              # clean install + type-check + build
#   ./build.sh --fast       # skip npm ci, skip type-check (vite build only)
#   ./build.sh --no-install # keep existing node_modules
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

APP_NAME="baugraph"
DIST_DIR="dist"

FAST=0
INSTALL=1

for arg in "$@"; do
  case "$arg" in
    --fast)       FAST=1; INSTALL=0 ;;
    --no-install) INSTALL=0 ;;
    -h|--help)    sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "node is not installed"
command -v npm  >/dev/null || die "npm is not installed"

log "Building $APP_NAME"
log "node $(node --version) / npm $(npm --version)"

if [[ "$INSTALL" -eq 1 ]]; then
  if [[ -f package-lock.json ]]; then
    log "Installing dependencies (npm ci)"
    npm ci
  else
    log "No package-lock.json — falling back to npm install"
    npm install
  fi
else
  [[ -d node_modules ]] || die "node_modules missing — run without --no-install/--fast"
  log "Skipping dependency install"
fi

log "Cleaning $DIST_DIR"
rm -rf "$DIST_DIR"

if [[ "$FAST" -eq 1 ]]; then
  log "Building (vite build, no type-check)"
  npm run build-only
  log "Building docs (VitePress)"
  npm run docs:build
else
  log "Building (type-check + vite build + docs)"
  npm run build
fi

[[ -f "$DIST_DIR/index.html" ]] || die "build produced no $DIST_DIR/index.html"

log "Build complete: $(du -sh "$DIST_DIR" | cut -f1) in $DIST_DIR/"
