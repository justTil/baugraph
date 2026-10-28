#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Cleaning previous build artifacts..."
rm -rf dist/ build/ *.egg-info src/*.egg-info

source .venv/bin/activate

echo "Building package..."
python -m build

echo "Build complete. Artifacts in dist/:"
ls dist/
