// Lernerfolg messen (WP-10): `npm run test:assessment`
// Prüft Vor- und Nachtest je Einheit, die Bewertung mit bekannten Antworten, die Auswertung je Fertigkeit,
// wann welcher Test angeboten wird und das Speichern.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  addRecord,
  ASSESSMENT_MAX,
  availability,
  buildAssessment,
  changeOf,
  ITEMS_PER_SKILL,
  overallChange,
  scoreListen,
  scoreRecall,
  scoreSpeak,
  SKILLS,
  skillScores,
  unitResult,
  unitSentences,
  type AssessmentItem,
} from '../src/lib/assessment.ts';
import { expandCourse, type MoreContent } from '../src/lib/generate.ts';
import { DEFAULT_PROGRESS, sanitizeProgress } from '../src/lib/storage.ts';
import { normalize, sameSentence, tiles, words } from '../src/lib/text.ts';
import type { AssessmentAnswer, AssessmentRecord, Course, Progress, Skill } from '../src/types.ts';

const read = (f: string) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const course = expandCourse(read('../src/content/course.json') as Course, read('../src/content/more.json') as MoreContent);
const fresh = (): Progress => structuredClone(DEFAULT_PROGRESS);
const at = (n: number) => new Date(Date.UTC(2026, 10, 1, 12, n)).toISOString();

/** Antworten so geben, dass je Fertigkeit genau `right[skill]` von 4 richtig sind (über die echte Bewertung). */
function answer(items: AssessmentItem[], right: Record<Skill, number | null>): AssessmentAnswer[] {
  const used: Record<Skill, number> = { listen: 0, recall: 0, speak: 0 };
  return items.map((it) => {
    const want = right[it.skill];
    const ok = want !== null && used[it.skill]++ < want;
    let score: 0 | 1 | null;
    if (it.skill === 'listen') score = scoreListen(it, ok ? it.de : it.options.find((o) => o !== it.de)!);
    else if (it.skill === 'recall') score = scoreRecall(it, ok ? tiles(it.es).join(' ') : [...tiles(it.es)].reverse().concat(it.extra).join(' '));
    else score = want === null ? scoreSpeak(it, null) : scoreSpeak(it, ok ? [it.es.toLowerCase()] : ['no sé']);
    return { skill: it.skill, es: it.es, score };
  });
}
const rec = (unit: string, kind: 'pre' | 'post', answers: AssessmentAnswer[], n: number): AssessmentRecord => ({ unit, kind, at: at(n), answers });

/* ───── 1) Für jede Einheit ein Test: Aufbau ───── */

for (const unit of course.units) {
  const items = buildAssessment(course, unit.id);
  const id = unit.id;
  assert.equal(items.length, ITEMS_PER_SKILL * SKILLS.length, `${id}: Anzahl Aufgaben`);
  SKILLS.forEach((s, k) => {
    const block = items.slice(k * ITEMS_PER_SKILL, (k + 1) * ITEMS_PER_SKILL);
    assert.ok(block.every((it) => it.skill === s), `${id}: Block ${s}`);
  });
  // Vor- und Nachtest sind dieselben Aufgaben: der Aufbau ist fest.
  assert.deepEqual(buildAssessment(course, id), items, `${id}: Aufgaben müssen bei jedem Aufruf gleich sein`);
  // Verschiedene Sätze, alle aus dieser Einheit, aus mindestens drei Lektionen.
  const sentences = unitSentences(unit).flat();
  assert.equal(new Set(items.map((i) => words(i.es).join(' '))).size, items.length, `${id}: Satz doppelt`);
  for (const it of items) assert.ok(sentences.some((s) => s.es === it.es && s.de === it.de), `${id}: „${it.es}“ nicht aus der Einheit`);
  const lessons = new Set(items.map((it) => sentences.find((s) => s.es === it.es)!.lesson));
  assert.ok(lessons.size >= Math.min(3, unit.lessons.length), `${id}: nur ${lessons.size} Lektionen abgedeckt`);
  for (const it of items) {
    if (it.skill === 'listen') {
      assert.equal(it.options.length, 3, `${id}: drei Bedeutungen`);
      assert.equal(new Set(it.options).size, 3, `${id}: Bedeutungen verschieden`);
      assert.equal(it.options.filter((o) => o === it.de).length, 1, `${id}: richtige Bedeutung genau einmal`);
      for (const o of it.options) assert.ok(sentences.some((s) => s.de === o), `${id}: Bedeutung „${o}“ nicht aus der Einheit`);
      assert.equal(scoreListen(it, it.de), 1);
      for (const o of it.options.filter((x) => x !== it.de)) assert.equal(scoreListen(it, o), 0);
    } else assert.deepEqual(it.options, [], `${id}: Bedeutungen nur beim Hören`);
    if (it.skill === 'recall') {
      assert.equal(it.extra.length, 2, `${id}: zwei Ablenker-Kacheln`);
      for (const w of it.extra) assert.ok(!words(it.es).includes(normalize(w)), `${id}: Ablenker „${w}“ steht im Satz`);
      assert.equal(scoreRecall(it, tiles(it.es).join(' ')), 1, `${id}: mit Kacheln lösbar`);
      if (tiles(it.es).length > 1) assert.equal(scoreRecall(it, [...tiles(it.es)].reverse().join(' ')), sameSentence([...tiles(it.es)].reverse().join(' '), it.es) ? 1 : 0);
    } else assert.deepEqual(it.extra, [], `${id}: Kacheln nur beim Abruf`);
    if (it.skill === 'speak') {
      assert.equal(scoreSpeak(it, [it.es]), 1, `${id}: richtig gesprochen`);
      assert.equal(scoreSpeak(it, ['no sé nada']), 0, `${id}: falsch gesprochen`);
      assert.equal(scoreSpeak(it, []), 0, 'nichts erkannt = falsch');
      assert.equal(scoreSpeak(it, null), null, 'übersprungen = nicht gemessen');
    }
  }
}
assert.deepEqual(buildAssessment(course, 'gibt-es-nicht'), []);
// Verschiedene Einheiten haben verschiedene Tests.
assert.notDeepEqual(buildAssessment(course, 'u1').map((i) => i.es), buildAssessment(course, 'u2').map((i) => i.es));

/* ───── 2) Bewertung mit bekannten Antworten ───── */

const items1 = buildAssessment(course, 'u1');
assert.deepEqual(skillScores(answer(items1, { listen: 4, recall: 4, speak: 4 })), { listen: 1, recall: 1, speak: 1 });
assert.deepEqual(skillScores(answer(items1, { listen: 0, recall: 0, speak: 0 })), { listen: 0, recall: 0, speak: 0 });
assert.deepEqual(skillScores(answer(items1, { listen: 2, recall: 1, speak: 3 })), { listen: 0.5, recall: 0.25, speak: 0.75 });
assert.deepEqual(skillScores(answer(items1, { listen: 4, recall: 3, speak: null })), { listen: 1, recall: 0.75, speak: null }, 'ohne Mikrofon');
// Zwei Sprechaufgaben übersprungen, eine von zwei richtig → 50 % (nur Gemessenes zählt).
const partial = answer(items1, { listen: 0, recall: 0, speak: 1 }).map((a, i) => (a.skill === 'speak' && i >= 10 ? { ...a, score: null } : a));
assert.equal(skillScores(partial).speak, 0.5);
assert.deepEqual(skillScores([]), { listen: null, recall: null, speak: null });

/* ───── 3) Auswertung: Veränderung je Fertigkeit ───── */

assert.deepEqual(changeOf({ listen: 0.25, recall: 0, speak: null }, { listen: 1, recall: 0.75, speak: 0.5 }), { listen: 75, recall: 75, speak: null });
assert.deepEqual(changeOf({ listen: 0.75, recall: 0.5, speak: 0.5 }, { listen: 0.5, recall: 0.5, speak: 1 }), { listen: -25, recall: 0, speak: 50 });
assert.deepEqual(changeOf(null, { listen: 1, recall: 1, speak: 1 }), { listen: null, recall: null, speak: null }, 'ohne Vortest kein Vergleich');
{
  let records: AssessmentRecord[] = [];
  records = addRecord(records, rec('u1', 'pre', answer(items1, { listen: 1, recall: 0, speak: 0 }), 1));
  records = addRecord(records, rec('u1', 'post', answer(items1, { listen: 3, recall: 2, speak: 2 }), 2));
  records = addRecord(records, rec('u1', 'post', answer(items1, { listen: 4, recall: 3, speak: 4 }), 3));
  // Ein zweiter Vortest wird nicht gespeichert (der erste bleibt die Ausgangslage).
  records = addRecord(records, rec('u1', 'pre', answer(items1, { listen: 4, recall: 4, speak: 4 }), 4));
  assert.equal(records.length, 3);
  const r = unitResult(course, records, 'u1')!;
  assert.equal(r.pre!.at, at(1));
  assert.equal(r.posts.length, 2);
  assert.deepEqual(r.change, { listen: 75, recall: 75, speak: 100 }, 'letzter Nachtest gegen Vortest');
  const items2 = buildAssessment(course, 'u2');
  records = addRecord(records, rec('u2', 'pre', answer(items2, { listen: 2, recall: 2, speak: null }), 5));
  records = addRecord(records, rec('u2', 'post', answer(items2, { listen: 2, recall: 4, speak: 2 }), 6));
  const r2 = unitResult(course, records, 'u2')!;
  assert.deepEqual(r2.change, { listen: 0, recall: 50, speak: null });
  // Nur Einheit 3 mit Nachtest ohne Vortest: zählt im Schnitt nicht mit.
  records = addRecord(records, rec('u3', 'post', answer(buildAssessment(course, 'u3'), { listen: 4, recall: 4, speak: 4 }), 7));
  const all = course.units.map((u) => unitResult(course, records, u.id)!).filter((x) => x.pre || x.posts.length);
  const o = overallChange(all);
  assert.equal(o.units, 2);
  assert.deepEqual(o.change, { listen: 38, recall: 63, speak: 100 }, 'Mittel (75+0)/2, (75+50)/2, nur u1 beim Sprechen');
}
// Durchlauf über den ganzen Kurs: vorher alles „Weiß ich nicht“, nachher alles richtig → +100 je Fertigkeit.
{
  let records: AssessmentRecord[] = [];
  course.units.forEach((u, k) => {
    const it = buildAssessment(course, u.id);
    records = addRecord(records, rec(u.id, 'pre', it.map((i) => ({ skill: i.skill, es: i.es, score: 0 })), 2 * k));
    records = addRecord(records, rec(u.id, 'post', answer(it, { listen: 4, recall: 4, speak: 4 }), 2 * k + 1));
  });
  for (const u of course.units) assert.deepEqual(unitResult(course, records, u.id)!.change, { listen: 100, recall: 100, speak: 100 }, u.id);
  assert.equal(overallChange(course.units.map((u) => unitResult(course, records, u.id)!)).units, course.units.length);
}

/* ───── 4) Wann welcher Test angeboten wird ───── */

{
  const done = (p: Progress, ids: string[]) => ids.forEach((id) => (p.lessons[id] = { accuracy: 1, completedAt: at(0) }));
  const u1 = course.units[0].lessons.map((l) => l.id);
  let p = fresh();
  assert.deepEqual(availability(course, p, 'u1'), { pre: 'open', post: 'locked', posts: 0 }, 'neu: Vortest Einheit 1 offen');
  assert.equal(availability(course, p, 'u2').pre, 'locked', 'Einheit 2 noch gesperrt');
  done(p, [u1[0]]);
  assert.equal(availability(course, p, 'u1').pre, 'missed', 'nach der ersten Lektion ohne Vortest kein Vortest mehr');
  p = fresh();
  p.assessments = addRecord([], rec('u1', 'pre', [{ skill: 'listen', es: 'x', score: 0 }], 1));
  done(p, u1.slice(0, -1));
  assert.deepEqual(availability(course, p, 'u1'), { pre: 'done', post: 'locked', posts: 0 }, 'Nachtest erst nach allen Lektionen');
  assert.equal(availability(course, p, 'u2').pre, 'locked');
  done(p, u1);
  assert.deepEqual(availability(course, p, 'u1'), { pre: 'done', post: 'open', posts: 0 });
  assert.equal(availability(course, p, 'u2').pre, 'open', 'nach Einheit 1: Vortest Einheit 2 offen');
  p.assessments = addRecord(p.assessments, rec('u1', 'post', [{ skill: 'listen', es: 'x', score: 1 }], 2));
  assert.deepEqual(availability(course, p, 'u1'), { pre: 'done', post: 'open', posts: 1 }, 'Nachtest wiederholbar');
}

/* ───── 5) Speichern ───── */

{
  // Höchstzahl: älteste Nachtests fallen weg, Vortests bleiben.
  let records: AssessmentRecord[] = [rec('u1', 'pre', [{ skill: 'recall', es: 'a', score: 0 }], 0)];
  for (let i = 1; i <= ASSESSMENT_MAX + 5; i++) records = addRecord(records, rec('u1', 'post', [{ skill: 'recall', es: 'a', score: 1 }], i));
  assert.equal(records.length, ASSESSMENT_MAX);
  assert.equal(records[0].kind, 'pre');
  assert.equal(records[1].at, at(7), '1 Vortest + 205 Nachtests: die 6 ältesten Nachtests sind weg');

  const good = rec('u2', 'pre', [{ skill: 'speak', es: 'Hola.', score: null }, { skill: 'listen', es: 'Sí.', score: 1 }], 3);
  const raw = {
    ...fresh(),
    assessments: [
      good,
      { ...good, at: at(4) }, // zweiter Vortest derselben Einheit
      { unit: 'u2', kind: 'post', at: at(5), answers: [{ skill: 'recall', es: 'x', score: 2 }, { skill: 'talk', es: 'y', score: 1 }, { skill: 'recall', es: 'z', score: 0, extra: 1 }] },
      { unit: 'u3', kind: 'mid', at: at(6), answers: [{ skill: 'recall', es: 'x', score: 1 }] },
      { unit: 'u3', kind: 'post', at: 'gestern', answers: [{ skill: 'recall', es: 'x', score: 1 }] },
      { unit: 'u3', kind: 'post', at: at(7), answers: [{ skill: 'recall', es: 'x', score: '1' }] },
      null,
      'kaputt',
    ],
  };
  const clean = sanitizeProgress(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(clean.assessments, [good, { unit: 'u2', kind: 'post', at: at(5), answers: [{ skill: 'recall', es: 'z', score: 0 }] }]);
  assert.deepEqual(sanitizeProgress({ ...fresh(), assessments: 'x' }).assessments, []);
  // Stand aus älteren Versionen ohne Testfeld.
  const old = fresh() as Partial<Progress>;
  delete old.assessments;
  assert.deepEqual(sanitizeProgress(old).assessments, []);
  assert.deepEqual(sanitizeProgress(JSON.parse(JSON.stringify({ ...fresh(), assessments: [good] }))).assessments, [good], 'gültiger Test bleibt unverändert');
}

console.log(
  `OK – ${course.units.length} Einheiten mit Vor- und Nachtest (je ${ITEMS_PER_SKILL * SKILLS.length} Aufgaben: ` +
    `${SKILLS.map((s) => `${ITEMS_PER_SKILL} ${s}`).join(', ')}); Bewertung, Auswertung, Angebot und Speichern geprüft.`,
);
