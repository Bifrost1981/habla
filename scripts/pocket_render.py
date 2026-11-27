#!/usr/bin/env python3
"""Lässt Pocket TTS (Kyutai) alle Texte eines Vertonungsauftrags sprechen (WP-03, Schritt 2 von 3).

Liest testdaten/vertonung/<dialekt>/auftrag.json (aus `npm run audio -- --provider pocket --export`) und schreibt
je Text eine Rohaufnahme testdaten/vertonung/<dialekt>/roh/<schlüssel>.wav (24 kHz, 16 Bit, mono).
Vorhandene Rohaufnahmen werden übersprungen: Ein abgebrochener Lauf macht beim nächsten Start dort weiter.
Jede Aufnahme wird geprüft (nicht stumm, nicht gehaucht, genug Sprache je Silbe). Durchgefallene – auch schon
vorhandene – werden bis zu fünfmal neu gesprochen, ab dem dritten Versuch mit leicht anderer Schreibweise
(z. B. „a“ statt „a.“); behalten wird der beste Versuch.
Die sanfte Nachbearbeitung und das Aufnahme-Verzeichnis macht Schritt 3 (`npm run audio -- --provider pocket`).

Start auf dem Mac über scripts/vertonen.sh (richtet Python und Pocket TTS ein).
Lizenz: Pocket TTS Code MIT, Gewichte CC-BY-4.0 (Kyutai); Stimme „lola“ aus Mozilla Common Voice.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
import wave
from pathlib import Path

import numpy as np


def write_wav(path: Path, samples, rate: int) -> None:
    pcm = (np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0) * 32767).astype("<i2")
    tmp = path.with_suffix(".tmp")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    os.replace(tmp, path)  # erst vollständig, dann sichtbar: Abbrüche hinterlassen keine halben Dateien


MIN_PEAK_DB = -30.0      # lauteste 20-ms-Stelle mindestens so laut (sonst stumm oder gehaucht)
MIN_VOICED_PER_SYLLABLE = 0.05  # Sekunden deutliche Sprache je Silbe (Sätze: Median 0,11 s)
ATTEMPTS = 5


def quality(samples, rate: int, text: str) -> tuple[bool, float, str]:
    """(bestanden, Punktzahl, Begründung) – Punktzahl wählt unter mehreren Versuchen den besten."""
    x = np.asarray(samples, dtype=np.float32)
    hop = max(1, int(rate * 0.02))
    n = len(x) // hop
    if n == 0:
        return False, -99.0, "leer"
    rms = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1))
    peak = float(rms.max())
    peak_db = 20 * math.log10(peak) if peak > 0 else -99.0
    voiced = float((rms >= peak / 10).sum()) * 0.02 if peak > 0 else 0.0
    syll = max(1, len(re.findall(r"[aeiouáéíóúü]+", text.lower())))
    ok = peak_db >= MIN_PEAK_DB and voiced >= MIN_VOICED_PER_SYLLABLE * syll
    why = f"Spitze {peak_db:.0f} dBFS, {voiced:.2f} s Sprache für {syll} Silbe(n)"
    return ok, peak_db + 10 * min(voiced / syll, 0.15), why


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        rate = w.getframerate()
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
    return pcm.astype(np.float32) / 32768, rate


def variants(text: str) -> list[str]:
    bare = text.rstrip(".").strip()
    return [text, text, bare, f"{bare}…", f"¡{bare}!"]


def main() -> int:
    job_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("testdaten/vertonung/es-ES")
    job = json.loads((job_dir / "auftrag.json").read_text(encoding="utf-8"))
    out = job_dir / "roh"
    out.mkdir(parents=True, exist_ok=True)
    todo, redo = [], []
    for it in job["items"]:
        f = out / f"{it['key']}.wav"
        if not f.exists():
            todo.append(it)
        elif not quality(*read_wav(f), it["text"])[0]:
            redo.append(it)
    print(f"{len(job['items'])} Texte im Auftrag, {len(job['items']) - len(todo) - len(redo)} schon gesprochen und in Ordnung, "
          f"{len(todo)} neu, {len(redo)} neu wegen Prüfung.", flush=True)
    todo += redo
    if not todo:
        return 0

    from pocket_tts import TTSModel

    print("Lade Pocket TTS. Eine Meldung „Access to model kyutai/pocket-tts is restricted“ ist normal:\n"
          "Pocket TTS nimmt dann das frei zugängliche Modell; die Stimme lola liegt dort als fertiges Profil.", flush=True)
    model = TTSModel.load_model(language=job.get("language", "spanish"))
    voice = model.get_state_for_audio_prompt(job.get("voice", "lola"))
    t0 = time.time()
    failed = 0
    weak = 0
    for n, it in enumerate(todo, 1):
        try:
            best = None
            for k, t in enumerate(variants(it["text"])[:ATTEMPTS]):
                samples = model.generate_audio(voice, t).numpy()
                ok, score, why = quality(samples, model.sample_rate, it["text"])
                if best is None or score > best[0]:
                    best = (score, samples, ok, why, t)
                if ok:
                    break
            write_wav(out / f"{it['key']}.wav", best[1], model.sample_rate)
            if not best[2]:
                weak += 1
                print(f"  Nach {ATTEMPTS} Versuchen noch auffällig: „{it['text']}“ ({best[3]}) – bester Versuch behalten", flush=True)
            elif best[4] != it["text"]:
                print(f"  „{it['text']}“ gelang erst als „{best[4]}“ ({best[3]})", flush=True)
        except Exception as e:  # einzelne Fehler nicht den ganzen Lauf abbrechen lassen
            failed += 1
            print(f"  Fehler bei „{it['text']}“: {e}", file=sys.stderr, flush=True)
        if n % 25 == 0 or n == len(todo):
            rest = (time.time() - t0) / n * (len(todo) - n)
            print(f"  {n}/{len(todo)} gesprochen, noch etwa {rest / 60:.0f} min", flush=True)
    print(f"Fertig: {len(todo) - failed} neue Rohaufnahmen in {out}" + (f", {failed} Fehler (nochmal starten holt sie nach)" if failed else "")
          + (f", {weak} trotz Wiederholung auffällig" if weak else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
