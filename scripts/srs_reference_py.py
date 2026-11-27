#!/usr/bin/env python3
"""Gegenrechnung der FSRS-Referenzwerte mit der Python-Referenz py-fsrs (gleiches Projekt, MIT).

Liest tests/srs/reference.json, rechnet jede Folge mit py-fsrs zu denselben Zeitpunkten nach und
schreibt Stabilität, Schwierigkeit und das eigene py-fsrs-Intervall unter „python“ in die Datei.
Voraussetzung: pip install fsrs==6.3.3 (nur zum Erzeugen; npm run test:srs braucht kein Python).
"""
import json
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

from fsrs import Card, Rating, Scheduler

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / "tests" / "srs" / "reference.json"
ref = json.loads(path.read_text(encoding="utf-8"))
p = ref["ts_fsrs"]
sched = Scheduler(parameters=tuple(p["w"]), desired_retention=p["request_retention"], learning_steps=(), relearning_steps=(),
                  maximum_interval=p["maximum_interval"], enable_fuzzing=False)
seqs = {}
for name, steps in ref["sequences"].items():
    card, rows = Card(), []
    for st in steps:
        t = datetime.fromisoformat(st["day"] + "T12:00:00+00:00")
        card, _ = sched.review_card(card, Rating(st["rating"]), t)
        rows.append({"stability": card.stability, "difficulty": card.difficulty, "days": (card.due - t).days})
    seqs[name] = rows
ref["python"] = {"fsrs_version": version("fsrs"), "sequences": seqs}
path.write_text(json.dumps(ref, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"python: {sum(len(v) for v in seqs.values())} Antworten mit py-fsrs {version('fsrs')} gegengerechnet")
