#!/usr/bin/env bash
# build-lambdas.sh — Compile and package Lambda functions for deployment.
#
# Usage:
#   ./build-lambdas.sh                  # packages all lambdas
#   ./build-lambdas.sh draft-cv         # packages a single lambda
#   OUT_DIR=/tmp/lambdas ./build-lambdas.sh  # override output directory
#
# The handler in AWS must be set to: index.handler
# (compiled index.js is placed at the zip root, not inside dist/)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/packages/infra/lambda"
OUT_DIR="${OUT_DIR:-"$HOME/Desktop"}"
VERSION="${VERSION:-v2}"

# Guard: required tools
for cmd in node npm zip; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: required command '$cmd' not found" >&2
    exit 1
  fi
done

package_lambda() {
  local name="$1"
  local dir="$ROOT/$name"

  if [[ ! -d "$dir" ]]; then
    echo "ERROR: lambda directory not found: $dir" >&2
    return 1
  fi

  echo "=== [$name] Compiling TypeScript ==="
  # Clean previous build to prevent stale compiled output from being packaged
  rm -rf "$dir/dist"
  # Use the lambda's own local tsc binary to avoid version mismatches
  local tsc_bin="$dir/node_modules/.bin/tsc"
  if [[ ! -x "$tsc_bin" ]]; then
    echo "ERROR: tsc not found at $tsc_bin — run 'pnpm install' first" >&2
    return 1
  fi
  (cd "$dir" && "$tsc_bin" --project tsconfig.json)

  echo "=== [$name] Staging production build ==="
  local staging
  staging=$(mktemp -d)
  # Ensure staging dir is always cleaned up, even on error
  trap 'rm -rf "$staging"' RETURN

  # Copy compiled JS to zip root (not dist/) so Lambda can find index.handler.
  # Exclude dev.js and *.test.js — they are not needed at runtime.
  mkdir -p "$staging/lib"
  for f in "$dir/dist/"*.js; do
    local base
    base=$(basename "$f")
    [[ "$base" == *.test.js ]] && continue
    [[ "$base" == "dev.js" ]]  && continue
    cp "$f" "$staging/"
  done
  cp "$dir/dist/lib/"*.js "$staging/lib/"

  # Generate a deps-only package.json (no devDependencies key) so npm install
  # cannot accidentally pull in test tooling.
  node -e "
    const pkg = require('$dir/package.json');
    const prod = { dependencies: pkg.dependencies || {} };
    require('fs').writeFileSync('$staging/package.json', JSON.stringify(prod, null, 2));
  "

  echo "=== [$name] Installing production dependencies ==="
  (cd "$staging" && npm install --no-package-lock --ignore-scripts --silent)

  # Sanity check: ensure no dev packages made it in
  for dev_pkg in jest babel ts-node istanbul typescript; do
    if [[ -d "$staging/node_modules/$dev_pkg" ]]; then
      echo "ERROR: dev package '$dev_pkg' found in production bundle — aborting" >&2
      return 1
    fi
  done

  echo "=== [$name] Creating zip ==="
  mkdir -p "$OUT_DIR"
  local out="$OUT_DIR/${name}-${VERSION}.zip"
  rm -f "$out"
  # Zip from staging root so index.js lands at the root of the archive
  (cd "$staging" && zip -r "$out" . --exclude "package.json" --quiet)

  local size
  size=$(du -sh "$out" | cut -f1)
  echo "Created: $out ($size)"
  echo "  Handler: index.handler"
  echo "  Runtime: nodejs20.x (or nodejs22.x)"
}

# Run for specified lambda(s), or all if none given
LAMBDAS=("${@:-draft-cv critique-cv}")
if [[ $# -gt 0 ]]; then
  LAMBDAS=("$@")
else
  LAMBDAS=(draft-cv critique-cv)
fi

for lambda in "${LAMBDAS[@]}"; do
  package_lambda "$lambda"
done

echo ""
echo "Done. Lambdas in $OUT_DIR:"
ls -lh "$OUT_DIR/"*-"${VERSION}".zip
