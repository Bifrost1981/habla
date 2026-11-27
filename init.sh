#!/usr/bin/env bash
# Einrichtung, Start und Smoke-Test für Habla.
#   ./init.sh            Abhängigkeiten installieren, Startprüfung inkl. Smoke-Tests
#   ./init.sh --dev      zusätzlich Entwicklungsserver starten (http://localhost:5173)
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Fehlt: $1 ($2)"; exit 3; }; }
need node "Node.js 22.6 oder neuer"
need npm "kommt mit Node.js"
need python3 "Python 3.10 oder neuer"

node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22 || (a===22 && b<6)) { console.error("Node " + process.versions.node + " ist zu alt (mindestens 22.6)."); process.exit(3); }'

echo "1/3 Abhängigkeiten installieren (npm ci)"
npm ci --no-audit --no-fund

echo "2/3 Startprüfung mit Smoke-Tests"
python3 scripts/project_gate.py start

echo "3/3 Paketstatus"
python3 scripts/project_gate.py status

if [[ "${1:-}" == "--dev" ]]; then
  npm run dev
fi
