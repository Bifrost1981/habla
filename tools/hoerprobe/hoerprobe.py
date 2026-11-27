#!/usr/bin/env python3
"""Hörprobe offener Stimmen für Habla (Entscheidung zu WP-03, nicht Teil der App).

Vertont dieselben Kurssätze mit offenen Sprachmodellen, die lokal laufen, und schreibt eine
Vergleichsseite (index.html). Auf der Seite gibt es zum Vergleich auch die Gerätestimme des Browsers.

Engines:
  kokoro  Kokoro 82M (Apache-2.0) über kokoro-onnx; Stimmen ef_dora (w), em_alex (m).
          Modelldateien von GitHub (thewh1teagle/kokoro-onnx, model-files-v1.0, ~350 MB).
  pocket  Pocket TTS von Kyutai (Code MIT, Gewichte CC-BY-4.0), Sprache „spanish“, Stimme lola.
          Gewichte von Hugging Face (beim ersten Lauf ~400 MB, danach im Cache).

Aufruf (auf dem Mac, im Projektordner):
  bash tools/hoerprobe/hoerprobe.sh            # richtet .venv-hoerprobe ein und vertont mit beiden
  python3 tools/hoerprobe/hoerprobe.py --engines kokoro --out testdaten/hoerprobe   # nur Kokoro

Die Aufnahmen sind in natürlichem Tempo; Habla verlangsamt beim Abspielen selbst (Einstellung „Tempo“).
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

SENTENCES = [
    "Hola, ¿qué tal?",
    "Buenos días, señor.",
    "Quiero un café, por favor.",
    "¿Puedo pagar con tarjeta?",
    "Mi casa tiene un jardín.",
    "La cocina es pequeña.",
]

KOKORO_FILES = {
    # Datei: (Adresse, SHA-256) – feste Version, damit jede Hörprobe dasselbe Modell nutzt.
    "kokoro-v1.0.onnx": ("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
                         "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5"),
    "voices-v1.0.bin": ("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
                        "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"),
}


def sha256(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def kokoro_models(cache: Path) -> tuple[Path, Path]:
    cache.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, (url, digest) in KOKORO_FILES.items():
        p = cache / name
        if not p.exists() or sha256(p) != digest:
            print(f"  lade {name} …", flush=True)
            urllib.request.urlretrieve(url, p)
            if sha256(p) != digest:
                p.unlink()
                raise SystemExit(f"Prüfsumme von {name} stimmt nicht – Download abgebrochen.")
        paths.append(p)
    return paths[0], paths[1]


def write_wav(path: Path, samples, rate: int) -> None:
    import numpy as np
    import soundfile as sf
    sf.write(str(path), np.asarray(samples, dtype="float32"), rate, subtype="PCM_16")


def to_mp3(wav: Path) -> Path:
    """Wandelt in MP3 (kleiner für die Vergleichsseite), wenn ffmpeg da ist; sonst bleibt WAV."""
    if not shutil.which("ffmpeg"):
        return wav
    mp3 = wav.with_suffix(".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "3", str(mp3)], check=True)
    wav.unlink()
    return mp3


# Einstellung „sanft“ (vom Projektverantwortlichen am 2026-11-18 als besser bewertet):
# Kokoro langsamer erzeugt (0,82) mit längeren Komma-Pausen (0,3 s), danach Nachbearbeitung mit ffmpeg:
# De-Esser, Präsenz (3,2 kHz) und Höhen (ab 5 kHz) abgesenkt, Tiefpass 9,5 kHz, Wärme (+3,5 dB um 200 Hz),
# sanfte Kompression gegen harte Silbeneinsätze, Spitzen auf etwa −4 dBFS.
SANFT_SPEED = 0.82
SANFT_CLAUSE_PAUSE = 0.3
SANFT_FILTER = (
    "deesser=i=0.6:m=0.6,equalizer=f=3200:t=q:w=1.4:g=-5,equalizer=f=1800:t=q:w=1:g=-1.5,"
    "highshelf=f=5000:g=-7,lowpass=f=9500,lowshelf=f=200:g=3.5,"
    "acompressor=threshold=-22dB:ratio=2.5:attack=12:release=140:makeup=2,alimiter=limit=0.63:level=disabled"
)
# „gemischt“: 65 % ef_dora + 35 % af_heart (Stimmprofile linear gemischt)
SANFT_MIX = (("ef_dora", 0.65), ("af_heart", 0.35))


def sanft(src: Path, dst: Path) -> Path:
    """Wendet SANFT_FILTER an (braucht ffmpeg) und schreibt MP3."""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af", SANFT_FILTER, "-codec:a", "libmp3lame", "-q:a", "2", str(dst)], check=True)
    return dst


def run_kokoro_sanft(out: Path, cache: Path) -> list[dict]:
    from kokoro_onnx import Kokoro
    if not shutil.which("ffmpeg"):
        raise SystemExit("Für „sanft“ wird ffmpeg gebraucht.")
    model, voices = kokoro_models(cache)
    k = Kokoro(str(model), str(voices))
    mix = sum(w * k.get_voice_style(v) for v, w in SANFT_MIX).astype("float32")
    rows = []
    for key, voice, label in [("dora-sanft", "ef_dora", "Dora · sanft"), ("dora-sanft-gemischt", mix, "Dora · sanft, gemischt"), ("alex-sanft", "em_alex", "Alex · sanft")]:
        for i, text in enumerate(SENTENCES):
            samples, rate = k.create(text, voice=voice, speed=SANFT_SPEED, lang="es", clause_pause=SANFT_CLAUSE_PAUSE)
            wav = _wav(out, f"{key}-{i}", samples, rate)
            f = sanft(wav, wav.with_suffix(".mp3"))
            wav.unlink()
            rows.append({"engine": "kokoro-sanft", "voice": key, "label": label, "i": i, "file": f.name, "seconds": 0})
        print(f"  {label}: 6 Sätze", flush=True)
    return rows


def run_kokoro(out: Path, cache: Path) -> list[dict]:
    from kokoro_onnx import Kokoro
    model, voices = kokoro_models(cache)
    k = Kokoro(str(model), str(voices))
    rows = []
    for voice, label in [("ef_dora", "Kokoro · Dora (weiblich)"), ("em_alex", "Kokoro · Alex (männlich)")]:
        for i, text in enumerate(SENTENCES):
            t0 = time.time()
            samples, rate = k.create(text, voice=voice, speed=1.0, lang="es")
            f = to_mp3(_wav(out, f"kokoro-{voice}-{i}", samples, rate))
            rows.append({"engine": "kokoro", "voice": voice, "label": label, "i": i, "file": f.name, "seconds": round(time.time() - t0, 2)})
            print(f"  {label}: {text}  ({rows[-1]['seconds']} s)", flush=True)
    return rows


def run_pocket(out: Path) -> list[dict]:
    from pocket_tts import TTSModel
    print("  Hinweis: Eine Meldung „Access to model kyutai/pocket-tts is restricted“ ist normal. Pocket TTS nutzt\n"
          "  dann das frei zugängliche Modell ohne Stimmenklonen; die Stimme lola liegt dort als fertiges Profil.", flush=True)
    model = TTSModel.load_model(language="spanish")
    voice = model.get_state_for_audio_prompt("lola")
    rows = []
    for i, text in enumerate(SENTENCES):
        t0 = time.time()
        audio = model.generate_audio(voice, text)
        f = to_mp3(_wav(out, f"pocket-lola-{i}", audio.numpy(), model.sample_rate))
        rows.append({"engine": "pocket", "voice": "lola", "label": "Pocket TTS · Lola (weiblich)", "i": i, "file": f.name, "seconds": round(time.time() - t0, 2)})
        print(f"  Pocket TTS · Lola: {text}  ({rows[-1]['seconds']} s)", flush=True)
    return rows


def _wav(out: Path, stem: str, samples, rate: int) -> Path:
    p = out / f"{stem}.wav"
    write_wav(p, samples, rate)
    return p


def page(rows: list[dict], out: Path, embed: bool) -> str:
    labels = list(dict.fromkeys(r["label"] for r in rows))
    def src(r: dict) -> str:
        if not embed:
            return html.escape(r["file"])
        mime = "audio/mpeg" if r["file"].endswith(".mp3") else "audio/wav"
        return f"data:{mime};base64," + base64.b64encode((out / r["file"]).read_bytes()).decode()
    body = []
    for i, text in enumerate(SENTENCES):
        cells = [f'<li><span class="who">Gerätestimme</span><button type="button" data-say="{html.escape(text)}">▶ abspielen</button></li>']
        for lab in labels:
            r = next((x for x in rows if x["label"] == lab and x["i"] == i), None)
            if r:
                cells.append(f'<li><span class="who">{html.escape(lab)}</span><audio controls preload="none" src="{src(r)}"></audio></li>')
        body.append(f'<section><h2 lang="es">{html.escape(text)}</h2><ul>{"".join(cells)}</ul></section>')
    return f"""<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hörprobe Stimmen</title>
<style>
:root {{ --bg:#fff6ec; --fg:#2b1d14; --muted:#7a6656; --card:#ffffff; --line:#ecd9c6; --accent:#c4502a; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#1b130e; --fg:#f5e9dd; --muted:#b9a593; --card:#271b14; --line:#3a2a20; --accent:#f08a5d; }} }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui, sans-serif; }}
main {{ max-width:720px; margin:0 auto; padding:24px 16px 48px; }}
h1 {{ font-size:1.5rem; margin:0 0 4px; }} p.lead {{ color:var(--muted); margin:0 0 24px; }}
section {{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin-bottom:14px; }}
h2 {{ font-size:1.15rem; margin:0 0 10px; }} ul {{ list-style:none; margin:0; padding:0; display:grid; gap:8px; }}
li {{ display:flex; flex-wrap:wrap; align-items:center; gap:10px; }} .who {{ min-width:220px; color:var(--muted); font-size:.95rem; }}
audio {{ height:36px; max-width:100%; }} button {{ font:inherit; border:1px solid var(--line); background:transparent; color:var(--accent); border-radius:999px; padding:4px 14px; cursor:pointer; }}
</style></head>
<body><main>
<h1>Hörprobe: offene Stimmen für Habla</h1>
<p class="lead">Dieselben Kurssätze in natürlichem Tempo (Habla verlangsamt beim Abspielen selbst). Welche Stimme klingt am wärmsten und natürlichsten?</p>
{"".join(body)}
</main>
<script>
document.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => {{
  try {{ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(b.dataset.say); u.lang = 'es-ES'; u.rate = 0.9; speechSynthesis.speak(u); }} catch (e) {{}}
}}));
</script>
</body></html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engines", default="kokoro,pocket", help="kommagetrennt: kokoro, kokoro-sanft, pocket")
    ap.add_argument("--out", default="testdaten/hoerprobe", help="Ausgabeordner (wird angelegt)")
    ap.add_argument("--cache", default=str(Path.home() / ".cache" / "habla-hoerprobe"), help="Ablage der Kokoro-Modelldateien")
    ap.add_argument("--embed", action="store_true", help="Audio in die Seite einbetten (eine Datei zum Weitergeben)")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rows_file = out / "hoerprobe.json"
    rows = [r for r in (json.loads(rows_file.read_text()) if rows_file.exists() else [])]
    for engine in [e.strip() for e in a.engines.split(",") if e.strip()]:
        print(f"Engine {engine}:", flush=True)
        try:
            new = (run_kokoro(out, Path(a.cache)) if engine == "kokoro" else run_kokoro_sanft(out, Path(a.cache)) if engine == "kokoro-sanft"
                   else run_pocket(out) if engine == "pocket" else None)
        except ImportError as e:
            print(f"  übersprungen, Paket fehlt: {e.name}", file=sys.stderr)
            continue
        if new is None:
            print(f"  unbekannte Engine: {engine}", file=sys.stderr)
            continue
        rows = [r for r in rows if r["engine"] != engine] + new
    rows_file.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    (out / ("hoerprobe-eingebettet.html" if a.embed else "index.html")).write_text(page(rows, out, a.embed), encoding="utf-8")
    print(f"Fertig: {out / ('hoerprobe-eingebettet.html' if a.embed else 'index.html')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
