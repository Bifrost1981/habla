// Test der Hörgeschichten (WP-08, content-coverage): `npm run test:stories`
// 1. Je Einheit genau eine Geschichte, in Kursreihenfolge.
// 2. 95–98 % der laufenden Wörter sind bis zu dieser Einheit bekannt (Namen zählen als bekannt).
// 3. Das Glossar erklärt genau die unbekannten Wörter; Namen kommen im Text vor.
// 4. Je drei Verständnisfragen mit drei verschiedenen Antworten und gültiger Lösung.
// 5. Gegenproben: Die Messung hängt vom Stand im Kurs ab und erkennt zu viele oder zu wenige neue Wörter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandCourse, type MoreContent } from '../src/lib/generate.ts';
import { COVERAGE_MAX, COVERAGE_MIN, coverage, knownWords, STORIES, storyTokens, storyUnlocked, type Story } from '../src/lib/stories.ts';
import { DEFAULT_PROGRESS, sanitizeProgress } from '../src/lib/storage.ts';
import type { Course } from '../src/types.ts';

const root = new URL('..', import.meta.url).pathname;
const read = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const course: Course = expandCourse(read('src/content/course.json'), read('src/content/more.json') as MoreContent);

/* 1. Eine Geschichte je Einheit */
assert.deepEqual(
  STORIES.map((s) => s.unit),
  course.units.map((u) => u.id),
  'je Einheit genau eine Geschichte, in Kursreihenfolge',
);

const pct = (x: number) => `${(100 * x).toFixed(1)} %`;
const rows: string[] = [];
const inRange = (r: number) => r >= COVERAGE_MIN - 1e-9 && r <= COVERAGE_MAX + 1e-9;

for (const s of STORIES) {
  const known = knownWords(course, s.unit);
  const c = coverage(s, known);
  rows.push(
    `${s.unit}  ${pct(c.ratio).padStart(7)}  ${String(c.known).padStart(3)}/${String(c.total).padEnd(3)}  neu: ${c.unknown.join(', ')}`,
  );

  /* 2. Anteil bekannter Wörter */
  assert.ok(inRange(c.ratio), `${s.unit}: ${pct(c.ratio)} bekannte Wörter (Ziel 95–98 %), unbekannt: ${c.unknown.join(', ')}`);

  /* 3. Glossar und Namen */
  assert.deepEqual(Object.keys(s.glossary).sort(), [...c.unknown].sort(), `${s.unit}: Glossar = genau die unbekannten Wörter`);
  for (const [w, de] of Object.entries(s.glossary)) assert.ok(de.trim(), `${s.unit}: Übersetzung für „${w}“`);
  const text = s.lines.map((l) => l.es).join(' ');
  for (const n of s.names) {
    assert.ok(new RegExp(`(^|[^\\p{L}])${n}([^\\p{L}]|$)`, 'u').test(text), `${s.unit}: Name „${n}“ kommt im Text vor`);
    assert.ok(/^\p{Lu}/u.test(n), `${s.unit}: Name „${n}“ groß geschrieben`);
  }

  /* Zeilen */
  assert.ok(s.title && s.titleEs, `${s.unit}: Titel`);
  assert.ok(s.lines.length >= 6 && s.lines.length <= 12, `${s.unit}: 6–12 Sätze (${s.lines.length})`);
  for (const l of s.lines) {
    assert.ok(/[.!?]$/.test(l.es.trim()) && /[.!?]$/.test(l.de.trim()), `${s.unit}: Satzende in „${l.es}“`);
    assert.equal(l.es, l.es.trim());
  }

  /* 4. Fragen */
  assert.equal(s.questions.length, 3, `${s.unit}: drei Fragen`);
  for (const q of s.questions) {
    assert.ok(q.q.trim().endsWith('?'), `${s.unit}: Frage „${q.q}“`);
    assert.equal(q.options.length, 3, `${s.unit}: drei Antworten zu „${q.q}“`);
    assert.equal(new Set(q.options).size, 3, `${s.unit}: verschiedene Antworten zu „${q.q}“`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${s.unit}: Lösung zu „${q.q}“`);
  }
}

/* 5. Gegenproben */
// Mit dem Stand der Einheit davor wären die Geschichten ab Einheit 2 zu schwer: Die Messung hängt vom Kurs ab.
for (let i = 1; i < STORIES.length; i++) {
  const c = coverage(STORIES[i], knownWords(course, course.units[i - 1].id));
  assert.ok(
    c.ratio < COVERAGE_MIN,
    `${STORIES[i].unit} mit dem Stand von ${course.units[i - 1].id}: ${pct(c.ratio)} müsste unter 95 % liegen`,
  );
}
// Zu viele neue Wörter, keine neuen Wörter, Akzent zählt (tú ≠ tu), Name zählt als bekannt.
const base: Story = STORIES[0];
const k1 = knownWords(course, 'u1');
const withLine = (es: string): Story => ({ ...base, lines: [...base.lines, { es, de: '–' }] });
assert.ok(coverage(withLine('Mi perro come una manzana grande.'), k1).ratio < COVERAGE_MIN, 'zu viele neue Wörter fallen auf');
assert.ok(
  coverage({ ...base, lines: base.lines.filter((l) => !l.es.includes('simpática')) }, k1).ratio > COVERAGE_MAX,
  'ohne neues Wort über 98 %',
);
assert.ok(k1.has('tú') && coverage(withLine('Él.'), k1).unknown.includes('él'), 'Akzente zählen: él ist nicht el');
assert.deepEqual(coverage({ ...withLine('Ramón.'), names: ['Ramón'] }, k1).unknown, ['simpática'], 'genannte Namen zählen als bekannt');
assert.deepEqual(coverage({ ...withLine('Ramón.'), names: [] }, k1).unknown, ['simpática', 'ramón'], 'nicht genannter Name ist unbekannt');
assert.deepEqual(storyTokens('¡Hola, ¿qué tal? Bien… y tú.'), ['hola', 'qué', 'tal', 'bien', 'y', 'tú']);
assert.equal(knownWords(course, 'gibt-es-nicht').size, 0);

/* Freischaltung: erst nach allen Lektionen der Einheit */
const u1 = course.units[0];
const done = (ids: string[]) => ({
  ...structuredClone(DEFAULT_PROGRESS),
  lessons: Object.fromEntries(ids.map((id) => [id, { accuracy: 1, completedAt: '2026-11-19T10:00:00Z' }])),
});
assert.equal(storyUnlocked(course, done([]), 'u1'), false);
assert.equal(storyUnlocked(course, done(u1.lessons.slice(0, -1).map((l) => l.id)), 'u1'), false, 'eine Lektion fehlt: gesperrt');
assert.equal(storyUnlocked(course, done(u1.lessons.map((l) => l.id)), 'u1'), true, 'alle Lektionen: offen');
assert.equal(storyUnlocked(course, done(u1.lessons.map((l) => l.id)), 'u2'), false);

/* Speicherstand: gültige Ergebnisse bleiben, kaputte fallen weg, alter Stand ohne Geschichten bekommt {} */
const at = '2026-11-19T10:00:00Z';
assert.deepEqual(
  sanitizeProgress({
    stories: {
      u1: { correct: 2, total: 3, at },
      u2: { correct: 4, total: 3, at },
      u3: { correct: 1, total: 0, at },
      u4: { correct: 1, total: 3, at: 'gestern' },
      u5: 'kaputt',
      u6: { correct: 3, total: 3, at, extra: true },
    },
  }).stories,
  { u1: { correct: 2, total: 3, at }, u6: { correct: 3, total: 3, at } },
);
assert.deepEqual(sanitizeProgress({ onboarded: true }).stories, {});
assert.deepEqual(DEFAULT_PROGRESS.stories, {});

console.log('Einheit  bekannt  Wörter   neue Wörter (mit Übersetzung)');
rows.forEach((r) => console.log(r));
console.log(
  `OK – ${STORIES.length} Geschichten, je ${pct(COVERAGE_MIN)}–${pct(COVERAGE_MAX)} bekannte Wörter, Glossar und Fragen vollständig.`,
);
