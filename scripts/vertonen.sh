#!/usr/bin/env bash
# Vertonung mit Pocket TTS, Schritt 2 von 3 (auf dem Mac, im Habla-Ordner):
#   bash scripts/vertonen.sh
# Lola spricht alle Texte aus testdaten/vertonung/es-ES/auftrag.json; Rohaufnahmen landen in .../roh/.
# Ein abgebrochener Lauf macht beim nächsten Start dort weiter.
# Installiert nichts ins Projekt: Python-Pakete und Modell liegen in ~/.cache.
set -euo pipefail
cd "$(dirname "$0")/.."
JOB="testdaten/vertonung/${1:-es-ES}"
CACHE="$HOME/.cache/habla-hoerprobe"
if [ ! -f "$JOB/auftrag.json" ]; then
  echo "Kein Auftrag in $JOB/auftrag.json – zuerst: npm run audio -- --provider pocket --export"
  exit 1
fi
mkdir -p "$CACHE"
if command -v uv >/dev/null 2>&1; then
  UV_CACHE_DIR="$CACHE/uv" uv run --no-project --python 3.12 --with pocket-tts==4.0.1 python scripts/pocket_render.py "$JOB"
else
  PY=""
  for c in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)'; then PY="$c"; break; fi
  done
  if [ -z "$PY" ]; then
    echo "Kein passendes Python (3.10–3.13) gefunden. Am einfachsten zuerst uv installieren:"
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
  fi
  [ -x "$CACHE/venv/bin/python" ] || "$PY" -m venv "$CACHE/venv"
  "$CACHE/venv/bin/pip" install -q pocket-tts==4.0.1
  "$CACHE/venv/bin/python" scripts/pocket_render.py "$JOB"
fi
echo "Fertig. Sag Claude Bescheid – der Rest (sanft nachbearbeiten, Verzeichnis, Prüfung) läuft ohne dich."
