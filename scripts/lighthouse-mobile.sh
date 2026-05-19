#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://voice.silverjrom.app/login}"
OUT_DIR="${LIGHTHOUSE_OUT_DIR:-plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-6/lighthouse}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$ROOT_DIR/$OUT_DIR"

JSON_OUT="$ROOT_DIR/$OUT_DIR/lighthouse-mobile-baseline.json"
HTML_OUT="$ROOT_DIR/$OUT_DIR/lighthouse-mobile-baseline.html"

if [ -z "${CHROME_PATH:-}" ]; then
  PLAYWRIGHT_CHROME="$(node -e "try { process.stdout.write(require('playwright').chromium.executablePath()) } catch {}")"
  if [ -n "$PLAYWRIGHT_CHROME" ] && [ -x "$PLAYWRIGHT_CHROME" ]; then
    export CHROME_PATH="$PLAYWRIGHT_CHROME"
  fi
fi

LH_FLAGS=(
  "$URL"
  "--emulated-form-factor=mobile"
  "--only-categories=performance,accessibility,best-practices,seo"
  "--chrome-flags=--headless=new --no-sandbox"
)

echo "Running Lighthouse mobile baseline for $URL"
echo "Output directory: $OUT_DIR"

if command -v npx >/dev/null 2>&1; then
  npx --yes lighthouse "${LH_FLAGS[@]}" --output=json --output-path="$JSON_OUT"
  npx --yes lighthouse "${LH_FLAGS[@]}" --output=html --output-path="$HTML_OUT"
else
  node "$ROOT_DIR/scripts/lighthouse-mobile-fallback.mjs" "$URL" "$JSON_OUT" "$HTML_OUT"
fi

node - "$JSON_OUT" <<'NODE'
const fs = require('node:fs');
const reportPath = process.argv[2];
const lhr = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const categories = lhr.categories || {};
const scores = Object.entries(categories)
  .map(([key, value]) => `${key}=${Math.round((value.score || 0) * 100)}`)
  .join(' ');
console.log(`Lighthouse scores: ${scores}`);
NODE
