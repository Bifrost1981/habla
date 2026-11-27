// Erzeugt tests/srs/reference.json: Referenzwerte direkt aus ts-fsrs (nicht über src/lib/srs.ts).
// Aufruf: node --experimental-strip-types --no-warnings scripts/make-srs-reference.ts
// Danach die Gegenrechnung mit der Python-Referenz: python3 scripts/srs_reference_py.py (braucht `pip install fsrs==6.3.3`).
import { readFileSync, writeFileSync } from 'node:fs';
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs';

// Gleiche Einstellungen wie src/lib/srs.ts (bewusst hier wiederholt, damit der Test eine Abweichung bemerkt).
const params = generatorParameters({ enable_fuzz: false, enable_short_term: true, learning_steps: [], relearning_steps: [] });
const f = fsrs(params);
const version = JSON.parse(readFileSync(new URL('../node_modules/ts-fsrs/package.json', import.meta.url), 'utf8')).version;
const at = (day: string) => new Date(`${day}T12:00:00Z`);
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const plus = (day: string, n: number) => toDay(new Date(at(day).getTime() + n * 864e5));

// Wann wird geantwortet? 'due' am Fälligkeitstag, 'late:N' N Tage danach, 'same' am Tag der letzten Antwort.
type When = 'due' | 'same' | `late:${number}`;
const SEQUENCES: Record<string, [When, 1 | 3][]> = {
  immer_richtig: [['due', 3], ['due', 3], ['due', 3], ['due', 3], ['due', 3], ['due', 3]],
  wechselnd: [['due', 3], ['due', 1], ['due', 3], ['due', 1], ['due', 3], ['due', 3]],
  fehlstart: [['due', 1], ['due', 1], ['due', 3], ['due', 3], ['due', 3]],
  verspaetet: [['due', 3], ['late:5', 3], ['late:20', 3], ['late:2', 1], ['late:10', 3]],
  gleicher_tag: [['due', 1], ['same', 3], ['due', 3], ['same', 3], ['due', 3]],
  viele_fehler: [['due', 1], ['due', 1], ['due', 1], ['due', 1], ['due', 3], ['due', 3]],
};

const out: Record<string, { day: string; rating: 1 | 3; days: number; due: string; stability: number; difficulty: number; state: number; lapses: number }[]> = {};
for (const [name, seq] of Object.entries(SEQUENCES)) {
  let day = '2026-11-02';
  let card: Card = createEmptyCard(at(day));
  let last = day;
  out[name] = seq.map(([when, rating], i) => {
    if (i > 0) day = when === 'due' ? toDay(card.due) : when === 'same' ? last : plus(toDay(card.due), Number(when.split(':')[1]));
    card = f.next(card, at(day), rating === 3 ? Rating.Good : Rating.Again).card;
    last = day;
    return { day, rating, days: card.scheduled_days, due: toDay(card.due), stability: card.stability, difficulty: card.difficulty, state: card.state, lapses: card.lapses };
  });
}
const target = new URL('../tests/srs/reference.json', import.meta.url);
let py: unknown = undefined;
try {
  py = JSON.parse(readFileSync(target, 'utf8')).python;
} catch {
  /* noch keine Datei */
}
const ref = {
  note: 'Referenzwerte für npm run test:srs. ts: direkt aus ts-fsrs; python: Gegenrechnung des Gedächtnismodells mit py-fsrs bei gleichen Zeitpunkten.',
  ts_fsrs: { version, w: params.w, request_retention: params.request_retention, maximum_interval: params.maximum_interval, enable_fuzz: params.enable_fuzz, enable_short_term: params.enable_short_term, learning_steps: params.learning_steps, relearning_steps: params.relearning_steps },
  sequences: out,
  python: py,
};
writeFileSync(target, JSON.stringify(ref, null, 2) + '\n');
console.log(`tests/srs/reference.json: ${Object.keys(out).length} Folgen, ${Object.values(out).flat().length} Antworten, ts-fsrs ${version}`);
