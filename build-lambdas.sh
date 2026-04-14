#!/usr/bin/env bash
set -e

DESKTOP="/home/max-normand/Desktop"
ROOT="/home/max-normand/projects/prompty-employed/packages/infra/lambda"

package_lambda() {
  local name="$1"          # e.g. draft-cv
  local dir="$ROOT/$name"
  local staging
  staging=$(mktemp -d)

  echo "=== Packaging $name ==="

  # Copy only production compiled files (exclude dev.js and *.test.js)
  mkdir -p "$staging/dist/lib"
  for f in "$dir/dist/"*.js; do
    base=$(basename "$f")
    [[ "$base" == *.test.js ]] && continue
    [[ "$base" == "dev.js" ]] && continue
    cp "$f" "$staging/dist/"
  done
  cp "$dir/dist/lib/"*.js "$staging/dist/lib/"

  # Install prod-only dependencies (deps-only package.json, no devDependencies key)
  node -e "
    const pkg = require('$dir/package.json');
    const prod = { dependencies: pkg.dependencies || {} };
    require('fs').writeFileSync('$staging/package.json', JSON.stringify(prod, null, 2));
  "
  cd "$staging"
  npm install --no-package-lock --ignore-scripts --silent

  # Zip into Desktop
  local out="$DESKTOP/${name}-v2.zip"
  rm -f "$out"
  zip -r "$out" dist/ node_modules/ --quiet
  echo "Created: $out ($(du -sh "$out" | cut -f1))"

  # Cleanup staging
  rm -rf "$staging"
  cd "$ROOT"
}

package_lambda "draft-cv"
package_lambda "critique-cv"

echo ""
echo "Done. Lambdas on Desktop:"
ls -lh "$DESKTOP/"*-v2.zip
