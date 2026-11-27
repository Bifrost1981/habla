#!/usr/bin/env python3
"""Prüft, ob der Browser-Test echte Fehler erkennt (Mutationstest, WP-02).

Für jede Mutation: Projekt in einen temporären Ordner kopieren (node_modules verlinkt),
einen absichtlichen Fehler einbauen, den passenden Browser-Test laufen lassen.
Erwartet wird, dass der Test FEHLSCHLÄGT. Rückgabecode 0 nur, wenn jede Mutation erkannt wurde.

Aufruf: python3 scripts/e2e_mutation_check.py
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (Name, Datei, Original, Mutation, Test-Filter)
MUTATIONS = [
    ("Paare passen nie zusammen", "src/exercises/Match.tsx",
     "if (l === r) {", "if (l === r + '#') {", "erste Lektion"),
    ("Ablegen in der Lücke wirkungslos", "src/exercises/Gap.tsx",
     "if (!drag.moving || inGap(e.clientX, e.clientY)) place(drag.word);", "if (!drag.moving) place(drag.word);", "erste Lektion"),
    ("Fortschritt wird nicht gespeichert", "src/lib/storage.ts",
     "localStorage.setItem(KEY, JSON.stringify(p));", "void p;", "erste Lektion"),
    ("Aufnahmen werden ignoriert", "src/lib/speech.ts",
     "const file = recordings.clips[clipKey(text)];", "const file = undefined as string | undefined; void clipKey;", "vertonte Aufnahme"),
    ("Dunkelmodus fehlt", "src/styles.css",
     "    --bg: #1b130e;", "    --bg: #fff6ec;", "Dunkelmodus"),
    ("Übersetzen-Sprechen zeigt die Lösung vorab", "src/exercises/Speak.tsx",
     "{(!recall || done) && <SpokenText", "{(recall || done) && <SpokenText", "Hör-Diktat"),
    ("Diktat wird nicht vorgelesen", "src/exercises/Build.tsx",
     "if (!dictation) return;", "if (dictation) return;", "Hör-Diktat"),
    ("Diktat prüft die Reihenfolge nicht mehr richtig", "src/exercises/Build.tsx",
     "const ok = sameSentence(sentence, ex.es);", "const ok = !dictation && sameSentence(sentence, ex.es);", "Hör-Diktat"),
    ("Regelhinweis wird nicht angezeigt", "src/screens/LessonScreen.tsx",
     "? diagnose(sol.es, result.given, lexicon, { speech }) : null;", "? null : null; void diagnose; void lexicon; void speech;", "Regelhinweis"),
    ("ser/estar wird nicht erkannt", "src/lib/diagnose.ts",
     "if (ei >= 0 && SER.indexOf(g) >= 0) {", "if (ei >= 0 && SER.indexOf(g) >= 99) {", "Regelhinweis"),
    ("Lösung der alten Übung wird nach „Weiter“ noch vorgelesen", "src/screens/LessonScreen.tsx",
     "    window.clearTimeout(solutionTimer.current);\n    stopSpeaking();\n    setResult(null);", "    stopSpeaking();\n    setResult(null);", "B3"),
    ("Testergebnis wird nicht gespeichert", "src/App.tsx",
     "assessments: addRecord(p.assessments, rec),", "assessments: p.assessments,", "Lernerfolg"),
    ("Veränderung mit falschem Vorzeichen", "src/lib/assessment.ts",
     ": pct(b) - pct(a);", ": pct(a) - pct(b);", "Lernerfolg"),
    ("Vortest zeigt die Lösung", "src/screens/AssessmentScreen.tsx",
     "<SpeakButtons text={item.es} ttsKey={props.uid} size=\"lg\" />", "<SpeakButtons text={item.es} ttsKey={props.uid} size=\"lg\" /><span className=\"spoken\">{item.es}</span>", "Lernerfolg"),
]


def copy_project(dst: Path) -> None:
    ignore = shutil.ignore_patterns("node_modules", "dist", "dist-single", "dist-artifact", ".git",
                                    "test-results", "playwright-report", "__pycache__",
                                    "audio", "testdaten", "docs", "tools", "evidence")  # groß oder nicht Teil der App
    shutil.copytree(ROOT, dst, ignore=ignore, dirs_exist_ok=True)
    os.symlink(ROOT / "node_modules", dst / "node_modules")


def run(work: Path, grep: str) -> subprocess.CompletedProcess:
    return subprocess.run(["npx", "playwright", "test", "-c", "tests/e2e/playwright.config.ts", "--grep", grep, "--reporter=line"],
                          cwd=work, capture_output=True, text=True, timeout=900)


def main() -> int:
    results = []
    # Kontrolle: ohne Mutation muss derselbe Aufbau grün sein, sonst sagen Fehlschläge nichts aus.
    with tempfile.TemporaryDirectory(prefix="habla-mut-") as tmp:
        work = Path(tmp) / "habla"
        copy_project(work)
        r = run(work, "erste Lektion|vertonte Aufnahme|Dunkelmodus|Hör-Diktat|Regelhinweis|Lernerfolg")
        print(f"  {'✓' if r.returncode == 0 else '✗'} Kontrolle ohne Mutation: Rückgabecode {r.returncode}")
        if r.returncode != 0:
            print(r.stdout[-1500:])
            print("Ergebnis: Kontrolllauf fehlgeschlagen, Mutationstest nicht aussagekräftig")
            return 1
    for name, rel, original, mutated, grep in MUTATIONS:
        with tempfile.TemporaryDirectory(prefix="habla-mut-") as tmp:
            work = Path(tmp) / "habla"
            copy_project(work)
            f = work / rel
            text = f.read_text(encoding="utf-8")
            count = text.count(original)
            if count < 1:
                print(f"  ✗ {name}: Stelle in {rel} nicht gefunden – Mutation veraltet")
                results.append((name, "nicht anwendbar"))
                continue
            f.write_text(text.replace(original, mutated), encoding="utf-8")
            r = run(work, grep)
            killed = r.returncode != 0
            print(f"  {'✓' if killed else '✗'} {name}: Browser-Test {'schlägt fehl (erkannt)' if killed else 'bleibt grün (NICHT erkannt)'}"
                  f" · Rückgabecode {r.returncode}")
            if not killed:
                print(r.stdout[-800:])
            results.append((name, "erkannt" if killed else "nicht erkannt"))
    missed = [n for n, s in results if s != "erkannt"]
    print(f"Ergebnis: {len(results) - len(missed)} von {len(results)} Mutationen erkannt")
    return 0 if not missed else 1


if __name__ == "__main__":
    sys.exit(main())
