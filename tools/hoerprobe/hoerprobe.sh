#!/usr/bin/env bash
# Hörprobe offener Stimmen (siehe hoerprobe.py). Im Projektordner ausführen:
#   bash tools/hoerprobe/hoerprobe.sh            # Pocket TTS (Kokoro liegt schon in testdaten/hoerprobe)
#   bash tools/hoerprobe/hoerprobe.sh kokoro,pocket
# Installiert nichts ins Projekt: Pakete landen in ~/.cache/habla-hoerprobe.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENGINES="${1:-pocket}"
OUT="testdaten/hoerprobe"
CACHE="$HOME/.cache/habla-hoerprobe"
PKGS=(pocket-tts==4.0.1 kokoro-onnx==0.6.1 soundfile)
mkdir -p "$OUT" "$CACHE"

if command -v uv >/dev/null 2>&1; then
  # uv bringt ein passendes Python mit (kokoro-onnx braucht 3.10–3.13).
  args=(); for p in "${PKGS[@]}"; do args+=(--with "$p"); done
  UV_CACHE_DIR="$CACHE/uv" uv run --no-project --python 3.12 "${args[@]}" python tools/hoerprobe/hoerprobe.py --engines "$ENGINES" --out "$OUT" --cache "$CACHE/kokoro"
else
  PY=""
  for c in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)'; then PY="$c"; break; fi
  done
  if [ -z "$PY" ]; then
    echo "Kein passendes Python (3.10–3.13) gefunden. Am einfachsten zuerst uv installieren:"
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "Dann dieses Skript erneut starten."
    exit 1
  fi
  [ -x "$CACHE/venv/bin/python" ] || "$PY" -m venv "$CACHE/venv"
  "$CACHE/venv/bin/pip" install -q "${PKGS[@]}"
  "$CACHE/venv/bin/python" tools/hoerprobe/hoerprobe.py --engines "$ENGINES" --out "$OUT" --cache "$CACHE/kokoro"
fi
echo "Vergleichsseite öffnen: open $OUT/index.html"
