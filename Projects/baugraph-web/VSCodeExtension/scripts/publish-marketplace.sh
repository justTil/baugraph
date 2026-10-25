#!/usr/bin/env bash
#
# publish-marketplace.sh — publish the Baugraph extension to the VS Code
# Marketplace under the `justtil` publisher.
#
# This is the justtil-only release script — see ../PUBLISH_TO_MARKETPLACE.md
# for the one-time account setup (publisher, Azure DevOps org, PAT) it
# assumes is already done. Anyone building their own package for local use
# or a fork should use build-vsix.sh instead; this script pushes a public
# release and requires a Personal Access Token for the `justtil` publisher.
#
# Usage:
#   VSCE_PAT=xxxxx ./publish-marketplace.sh            # build + publish (asks to confirm)
#   VSCE_PAT=xxxxx ./publish-marketplace.sh --yes       # build + publish, no confirmation prompt
#   ./publish-marketplace.sh --dry-run                  # build + package only, do not publish
#
# VSCE_PAT can be omitted if you have already run `npx vsce login justtil`
# once on this machine (the token is then cached by vsce).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXT_DIR="$REPO_ROOT/extension"
PUBLISHER="publisher_name"

DRY_RUN=0
ASSUME_YES=0
INSTALL_DEPS=1

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    --no-install) INSTALL_DEPS=0 ;;
    -h|--help)    sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

cd "$REPO_ROOT"

# --- Preflight ---------------------------------------------------------

command -v node >/dev/null || die "node is not installed"
command -v npm  >/dev/null || die "npm is not installed"
command -v git  >/dev/null || die "git is not installed"

if [[ -n "$(git status --porcelain)" ]]; then
  warn "Working tree has uncommitted changes. Publishing from a dirty tree" \
       "means the .vsix may not match any commit."
fi

APP_VERSION="$(tr -d '[:space:]' < version.txt)"
EXT_VERSION="$(node -p "require('./extension/package.json').version")"
if [[ "$APP_VERSION" != "$EXT_VERSION" ]]; then
  die "version.txt ($APP_VERSION) and extension/package.json ($EXT_VERSION)" \
      " disagree. Bump both to the same version before publishing."
fi
log "Publishing version $EXT_VERSION as publisher '$PUBLISHER'"

if [[ "$DRY_RUN" -eq 0 && -z "${VSCE_PAT:-}" ]]; then
  warn "VSCE_PAT is not set. This only works if 'npx vsce login $PUBLISHER'" \
       "has already been run on this machine."
fi

# --- Build ---------------------------------------------------------------

if [[ "$INSTALL_DEPS" -eq 1 ]]; then
  log "Installing root dependencies (npm ci)"
  npm ci
  log "Installing extension dependencies (npm ci)"
  npm --prefix extension ci
fi

log "Building the webview and the extension host, then packaging the .vsix"
npm run extension:package

VSIX="$(ls -t "$EXT_DIR"/*.vsix 2>/dev/null | head -n1 || true)"
[[ -n "$VSIX" ]] || die "vsce did not produce a .vsix in $EXT_DIR"
log "Packaged: $VSIX ($(du -h "$VSIX" | cut -f1))"

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "Dry run — stopping before publish. Inspect the package with:"
  echo "    npx --prefix extension vsce show $PUBLISHER.baugraph"
  echo "    unzip -l \"$VSIX\""
  exit 0
fi

# --- Publish ---------------------------------------------------------------

if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Publish $PUBLISHER.baugraph@$EXT_VERSION to the VS Code Marketplace? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { log "Aborted."; exit 1; }
fi

log "Publishing to the Marketplace"
(cd "$EXT_DIR" && npx vsce publish --packagePath "$VSIX")

log "Published $PUBLISHER.baugraph@$EXT_VERSION"
echo "    https://marketplace.visualstudio.com/items?itemName=$PUBLISHER.baugraph"
