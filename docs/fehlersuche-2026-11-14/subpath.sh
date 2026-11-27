#!/usr/bin/env bash
# Reproduktion B7: Build unter einem Unterpfad (wie GitHub Pages /habla/) ausliefern. Vorher prepare.sh ausführen.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; WORK="${HABLA_WORK:-$HERE/work}"
SITE="$(mktemp -d)"; cp -r "$WORK/dist" "$SITE/habla"
(cd "$SITE" && python3 -m http.server 4192 >/dev/null 2>&1) & PID=$!; sleep 1
node -e "
const { chromium } = require('$ROOT/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const bad = [];
  p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + new URL(r.url()).pathname); });
  await p.goto('http://localhost:4192/habla/'); await p.waitForTimeout(1000);
  console.log('root-Länge:', (await p.locator('#root').innerHTML()).length, '| fehlgeschlagen:', bad); await b.close(); })();"
kill $PID
