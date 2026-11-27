// Referenztest der Wiederholungsplanung (WP-04): `npm run test:srs`
// 1. App-Einstellungen = Einstellungen der Referenzwerte, installierte ts-fsrs-Version = Referenzversion.
// 2. src/lib/srs.ts trifft die Referenzwerte von ts-fsrs exakt (Tage, Termin, Zustand, Stabilität, Schwierigkeit).
// 3. Gedächtnismodell = Python-Referenz py-fsrs bei gleichen Zeitpunkten (Stabilität und Schwierigkeit).
// 4. Intervalle weichen von py-fsrs nur durch die Anordnungsregel von ts-fsrs ab („Gut“ ≥ „Schwer“ + 1 Tag).
// 5. Gegenprobe: Der Vergleich erkennt schon eine Abweichung von einem Millionstel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FSRS_PARAMS, review } from '../src/lib/srs.ts';
import type { SrsEntry } from '../src/types.ts';

interface Step { day: string; rating: 1 | 3; days: number; due: string; stability: number; difficulty: number; state: number; lapses: number }
interface PyStep { stability: number; difficulty: number; days: number }
const ref = JSON.parse(readFileSync(new URL('../tests/srs/reference.json', import.meta.url), 'utf8')) as {
  ts_fsrs: Record<string, unknown> & { version: string };
  sequences: Record<string, Step[]>;
  python?: { fsrs_version: string; sequences: Record<string, PyStep[]> };
};
const installed = JSON.parse(readFileSync(new URL('../node_modules/ts-fsrs/package.json', import.meta.url), 'utf8')).version;

// 1. Einstellungen und Version
assert.equal(installed, ref.ts_fsrs.version, 'installierte ts-fsrs-Version = Version der Referenzwerte (sonst Referenz neu erzeugen und prüfen)');
for (const key of ['w', 'request_retention', 'maximum_interval', 'enable_fuzz', 'enable_short_term', 'learning_steps', 'relearning_steps'] as const) {
  assert.deepEqual((FSRS_PARAMS as unknown as Record<string, unknown>)[key], ref.ts_fsrs[key], `Einstellung ${key} wie in der Referenz`);
}

const TOL = 1e-9;
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/** Spielt alle Folgen mit src/lib/srs.ts nach und gibt jede Abweichung von den Referenzwerten zurück. */
function mismatches(sequences: Record<string, Step[]>): string[] {
  const out: string[] = [];
  for (const [name, steps] of Object.entries(sequences)) {
    let entry: SrsEntry | undefined;
    steps.forEach((st, i) => {
      const r = review('x', entry, st.rating === 3, st.day);
      entry = r.entry;
      const where = `${name}[${i}]`;
      if (r.log.days !== st.days) out.push(`${where}: Tage ${r.log.days} ≠ ${st.days}`);
      if (entry.due !== st.due) out.push(`${where}: Termin ${entry.due} ≠ ${st.due}`);
      if (entry.state !== st.state) out.push(`${where}: Zustand ${entry.state} ≠ ${st.state}`);
      if (entry.lapses !== st.lapses) out.push(`${where}: Lapses ${entry.lapses} ≠ ${st.lapses}`);
      if (!close(entry.stability, st.stability, TOL)) out.push(`${where}: Stabilität ${entry.stability} ≠ ${st.stability}`);
      if (!close(entry.difficulty, st.difficulty, TOL)) out.push(`${where}: Schwierigkeit ${entry.difficulty} ≠ ${st.difficulty}`);
    });
  }
  return out;
}

// 2. App = ts-fsrs-Referenz
const steps = Object.values(ref.sequences).flat().length;
assert.ok(Object.keys(ref.sequences).length >= 6 && steps >= 30, 'genug Referenzfolgen');
assert.deepEqual(mismatches(ref.sequences), [], 'App-Planung = Referenzwerte von ts-fsrs');

// 3. und 4. Gegenrechnung mit py-fsrs
assert.ok(ref.python, 'Gegenrechnung mit py-fsrs vorhanden (python3 scripts/srs_reference_py.py)');
let intervalDiffs = 0;
let worst = 0;
for (const [name, st] of Object.entries(ref.sequences)) {
  const py = ref.python.sequences[name];
  assert.equal(py?.length, st.length, `${name}: py-fsrs hat alle Antworten`);
  st.forEach((s, i) => {
    const p = py[i];
    worst = Math.max(worst, Math.abs(s.stability - p.stability), Math.abs(s.difficulty - p.difficulty));
    assert.ok(close(s.stability, p.stability, 1e-4), `${name}[${i}]: Stabilität ts ${s.stability} = py ${p.stability}`);
    assert.ok(close(s.difficulty, p.difficulty, 1e-4), `${name}[${i}]: Schwierigkeit ts ${s.difficulty} = py ${p.difficulty}`);
    if (s.days !== p.days) {
      intervalDiffs++;
      assert.ok(s.rating === 3 && s.days === p.days + 1, `${name}[${i}]: Intervall weicht nur durch die Anordnungsregel ab (ts ${s.days}, py ${p.days})`);
    }
  });
}

// 5. Gegenprobe: winzige Verfälschung der Referenz muss auffallen
const tampered = structuredClone(ref.sequences);
tampered.immer_richtig[3].stability *= 1 + 1e-6;
assert.equal(mismatches(tampered).length, 1, 'Vergleich erkennt eine Abweichung von 1e-6');
const tamperedDay = structuredClone(ref.sequences);
tamperedDay.wechselnd[2].days += 1;
assert.equal(mismatches(tamperedDay).length, 1, 'Vergleich erkennt einen Tag Unterschied');

console.log(
  `OK – ${steps} Antworten in ${Object.keys(ref.sequences).length} Folgen: App = ts-fsrs ${installed}; ` +
    `Modell = py-fsrs ${ref.python.fsrs_version} (größte Abweichung ${worst.toExponential(1)}); ` +
    `${intervalDiffs} Intervalle +1 Tag durch die Anordnungsregel von ts-fsrs.`,
);
