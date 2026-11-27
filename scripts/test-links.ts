// Test Wortbezug und Ablenker (WP-20, Defekte F4–F6): `node --experimental-strip-types --no-warnings scripts/test-links.ts`
// 1. F4: Ablenker-Kacheln in Ersatzübungen (Sprechen ohne Mikrofon) und in der Wiederholung stammen nur aus Wörtern,
//    die bis zur Einheit der Übung geübt wurden – über viele Zufallsfolgen.
// 2. F5: Jede Satzübung (Lücke, Satz bauen, Diktat, Nachsprechen, Übersetzen-Sprechen) hat einen Wortbezug und wirkt
//    damit auf die Wiederholungsplanung; jeder Bezug ist ein Wort, das bis zu dieser Einheit geübt wird.
// 3. F6: Jede Vokabel ist Ziel mindestens einer Übung.
// 4. Gegenproben: ohne Einschränkung kämen Ablenker aus späteren Einheiten vor; die Zuordnung erkennt fehlende Bezüge.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReview, distractorPool, speakToBuild, vocabUnitIndex } from '../src/lib/course.ts';
import { expandCourse, seeded, type MoreContent } from '../src/lib/generate.ts';
import type { Course, Exercise } from '../src/types.ts';

const root = new URL('..', import.meta.url).pathname;
const read = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const course: Course = expandCourse(read('src/content/course.json'), read('src/content/more.json') as MoreContent);
const unitOf = vocabUnitIndex(course);
const plain = (es: string) => es.replace(/^(el|la|los|las)\s+/i, '');
/** Einheit, ab der ein Ablenker-Wort bekannt ist (frühestes Vorkommen unter allen Vokabeln mit dieser Schreibung). */
const wordUnit = new Map<string, number>();
for (const v of course.vocab) {
  const w = plain(v.es);
  wordUnit.set(w, Math.min(wordUnit.get(w) ?? Infinity, unitOf.get(v.id) ?? Infinity));
}
const ids = (e: Exercise) => (e.type === 'card' ? [e.vocab] : e.type === 'pick' ? [e.target] : e.vocab);

/* 1. F4 */
let checked = 0;
const later: string[] = [];
course.units.forEach((u, ui) =>
  u.lessons.forEach((l) =>
    l.exercises.forEach((e) => {
      if (e.type !== 'speak' && e.type !== 'say') return;
      for (let k = 0; k < 10; k++) {
        const b = speakToBuild(e, course, seeded(`links-${l.id}-${k}-${e.es}`));
        checked++;
        for (const w of b.extra) if ((wordUnit.get(w) ?? Infinity) > ui) later.push(`${l.id} „${e.es}“: ${w}`);
        assert.equal(b.extra.length, 2, `${l.id}: zwei Ablenker für „${e.es}“`);
      }
    }),
  ),
);
assert.deepEqual(later.slice(0, 10), [], `${later.length} Ersatzübungen mit Ablenkern aus späteren Einheiten`);
// Wiederholung: jede Vokabel als Diktat (jeder dritte Platz), Ablenker höchstens aus ihrer Einheit
const all = course.vocab.map((v) => v.id);
let reviewChecked = 0;
for (let shift = 0; shift < 3; shift++)
  for (let i = 0; i < all.length; i += 12) {
    const due = [...all.slice(shift), ...all.slice(0, shift)].slice(i, i + 12);
    for (const e of buildReview(course, due, seeded(`review-${shift}-${i}`)))
      if (e.type === 'dictation') {
        reviewChecked++;
        const ui = unitOf.get(e.vocab[0]) ?? Infinity;
        for (const w of e.extra)
          assert.ok((wordUnit.get(w) ?? Infinity) <= ui, `Wiederholung „${e.es}“: Ablenker „${w}“ aus späterer Einheit`);
      }
  }
assert.ok(reviewChecked > 100, `Wiederholungs-Diktate geprüft (${reviewChecked})`);

/* 2. F5 */
const noLink: string[] = [];
const futureLink: string[] = [];
course.units.forEach((u, ui) =>
  u.lessons.forEach((l) =>
    l.exercises.forEach((e) => {
      if (e.type === 'card' || e.type === 'pick' || e.type === 'match') return;
      if (!e.vocab.length) noLink.push(`${l.id} ${e.type} „${e.es}“`);
      for (const id of e.vocab) if ((unitOf.get(id) ?? Infinity) > ui) futureLink.push(`${l.id} „${e.es}“ → ${id}`);
    }),
  ),
);
assert.deepEqual(noLink, [], 'Satzübungen ohne Wortbezug');
assert.deepEqual(futureLink, [], 'Wortbezug auf ein Wort aus einer späteren Einheit');

/* 3. F6 */
const used = new Set(course.units.flatMap((u) => u.lessons.flatMap((l) => l.exercises.flatMap(ids))));
assert.deepEqual(
  course.vocab.filter((v) => !used.has(v.id)).map((v) => v.id),
  [],
  'Vokabeln ohne Übung',
);

/* 4. Gegenproben */
const firstSpeak = course.units[0].lessons.flatMap((l) => l.exercises).find((e) => e.type === 'speak')!;
assert.ok(distractorPool(course).length > distractorPool(course, 0).length, 'ohne Einschränkung mehr Ablenker');
const unrestricted = distractorPool(course).filter((w) => (wordUnit.get(w) ?? Infinity) > 0);
assert.ok(unrestricted.length > 50, 'ohne Einschränkung wären Wörter späterer Einheiten im Pool');
assert.ok(
  distractorPool(course, 0).every((w) => wordUnit.get(w) === 0),
  'Pool für Einheit 1 nur aus Einheit 1',
);
assert.ok(firstSpeak.type === 'speak' && firstSpeak.vocab.length > 0);
// Die Zuordnung ohne Nachtrag: Ein Satz ohne Lektionswort hätte keinen Bezug (so war es vor WP-20).
const raw = read('src/content/more.json') as MoreContent;
const rawUnit = raw.units.find((u) => u.id === 'u4')!;
const sentence = rawUnit.lessons.flatMap((l) => l.sentences).find((s) => s[0] === 'Tengo dos primos.');
assert.ok(sentence, 'Beispiel aus der Fehlersuche vorhanden');
const linked = course.units[3].lessons.flatMap((l) => l.exercises).find((e) => 'es' in e && e.es === 'Tengo dos primos.');
assert.ok(
  linked && linked.type !== 'card' && linked.type !== 'pick' && linked.type !== 'match' && linked.vocab.length > 0,
  '„Tengo dos primos.“ hat jetzt einen Wortbezug',
);

console.log(
  `OK – ${checked} Ersatzübungen und ${reviewChecked} Wiederholungs-Diktate ohne Ablenker aus späteren Einheiten; ` +
    `alle Satzübungen mit Wortbezug aus der eigenen oder früheren Einheiten; alle ${course.vocab.length} Vokabeln geübt.`,
);
