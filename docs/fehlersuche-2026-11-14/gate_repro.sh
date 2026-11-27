#!/usr/bin/env bash
# Reproduktion G1 und G2 in einer Wegwerf-Kopie (das Projekt bleibt unverändert).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; T="$(mktemp -d)"
(cd "$ROOT" && tar --exclude=node_modules --exclude=dist --exclude=docs -cf - .) | tar -xf - -C "$T"; cd "$T"
echo "== G1: ein Kommentar in src/lib/srs.ts"; echo "// Kommentar" >> src/lib/srs.ts
python3 scripts/project_gate.py start --no-smoke | tail -2; echo "Rückgabecode ${PIPESTATUS[0]}"
echo "== G2: App kaputt machen (Paare passen nie) und nur den Hash im Nachweis umschreiben"
sed -i 's/if (l === r) {/if (l === r + "#") {/' src/exercises/Match.tsx
python3 - <<'PY'
import json, sys
sys.path.insert(0, 'scripts'); import project_gate as g
from pathlib import Path
root = Path('.').resolve(); fl = g.load_json(root/'feature_list.json'); st = g.current_state(root, fl)
ev = g.load_json(root/'evidence/WP-02.json'); ev['package_state'] = g.package_state(fl, g.find_package(fl, 'WP-02'), st)
(root/'evidence/WP-02.json').write_text(json.dumps(ev, ensure_ascii=False, indent=2))
PY
python3 scripts/project_gate.py start --no-smoke | tail -1; echo "Rückgabecode ${PIPESTATUS[0]}"
rm -rf "$T"
