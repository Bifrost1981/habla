// Test der Rollenspiele (WP-09): `node --experimental-strip-types --no-warnings scripts/test-roleplay.ts`
// 1. Je Einheit genau ein Rollenspiel, in Kursreihenfolge; 3–6 Züge, nur der erste darf ohne Satz der Gegenseite sein.
// 2. Lauras Antworten enthalten nur Wörter, die bis zu dieser Einheit im Kurs vorkommen (Namen ausgenommen).
// 3. Neue Wörter der Gegenseite stehen genau im Glossar (höchstens vier je Rollenspiel).
// 4. Abgleich: jede erlaubte Antwort besteht – auch so, wie die Spracherkennung sie liefert (klein, ohne Akzente
//    und Satzzeichen). Nicht bestehen: Antworten anderer Züge, der Satz der Gegenseite, „sí“/„no“, Stille.
// 5. Auswahl ohne Mikrofon: drei verschiedene Antworten, genau eine passt, fest gemischt.
// 6. Freischaltung nach allen Lektionen; Speicherstand mit Reparatur.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandCourse, type MoreContent } from '../src/lib/generate.ts';
import { choiceOptions, matchTurn, missingKeyWords, ROLEPLAYS, roleplayUnlocked } from '../src/lib/roleplays.ts';
import { DEFAULT_PROGRESS, sanitizeProgress } from '../src/lib/storage.ts';
import { knownWords, storyTokens } from '../src/lib/stories.ts';
import type { Course } from '../src/types.ts';

const root = new URL('..', import.meta.url).pathname;
const read = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const course: Course = expandCourse(read('src/content/course.json'), read('src/content/more.json') as MoreContent);

/** So liefert die Spracherkennung oft: klein, ohne Akzente und Satzzeichen. */
const asHeard = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/* 1. Ein Rollenspiel je Einheit */
assert.deepEqual(
  ROLEPLAYS.map((r) => r.unit),
  course.units.map((u) => u.id),
  'je Einheit genau ein Rollenspiel, in Kursreihenfolge',
);

let checks = 0;
for (const rp of ROLEPLAYS) {
  const at = `${rp.unit} „${rp.title}“`;
  assert.ok(rp.title && rp.goal.endsWith('.') && rp.partner, `${at}: Titel, Ziel, Gegenseite`);
  assert.ok(rp.turns.length >= 3 && rp.turns.length <= 6, `${at}: 3–6 Züge`);
  rp.turns.forEach((t, i) => {
    assert.ok(i === 0 || t.partner, `${at}: nur der erste Zug darf ohne Satz der Gegenseite sein (Zug ${i + 1})`);
    assert.ok(/[.?!]$/.test(t.task), `${at}: Auftrag „${t.task}“ endet mit Satzzeichen`);
    assert.ok(t.answers.length >= 1 && new Set(t.answers).size === t.answers.length, `${at}: Antworten zu „${t.task}“`);
  });

  /* 2. Lauras Antworten: nur bekannte Wörter */
  const known = knownWords(course, rp.unit);
  const names = new Set(rp.names.flatMap(storyTokens));
  for (const t of rp.turns)
    for (const a of t.answers) {
      const unknown = storyTokens(a).filter((w) => !known.has(w) && !names.has(w));
      assert.deepEqual(unknown, [], `${at}: „${a}“ enthält Wörter, die bis ${rp.unit} nicht vorkamen`);
    }

  /* 3. Gegenseite: neue Wörter genau im Glossar */
  const partnerText = [...rp.turns.flatMap((t) => (t.partner ? [t.partner.es] : [])), rp.end.es];
  const newWords = [...new Set(partnerText.flatMap(storyTokens).filter((w) => !known.has(w) && !names.has(w)))];
  assert.deepEqual(Object.keys(rp.glossary).sort(), newWords.sort(), `${at}: Glossar = neue Wörter der Gegenseite`);
  assert.ok(newWords.length <= 4, `${at}: höchstens vier neue Wörter (${newWords.join(', ')})`);
  for (const n of rp.names) assert.ok(/^\p{Lu}/u.test(n), `${at}: Name „${n}“`);

  /* 4. Abgleich */
  rp.turns.forEach((t, i) => {
    for (const a of t.answers) {
      assert.ok(matchTurn(t, [a]).passed, `${at}: „${a}“ besteht`);
      assert.ok(matchTurn(t, [asHeard(a)]).passed, `${at}: „${asHeard(a)}“ (wie gehört) besteht`);
      assert.equal(matchTurn(t, [a]).answer, a, `${at}: passendste Formulierung zu „${a}“`);
      checks += 2;
    }
    rp.turns.forEach((o, j) => {
      if (j === i) return;
      for (const a of o.answers) {
        assert.ok(!matchTurn(t, [a]).passed, `${at}: „${a}“ (Zug ${j + 1}) darf Zug ${i + 1} „${t.task}“ nicht bestehen`);
        checks++;
      }
    });
    const wrong = ['sí', 'no', 'hola', ...(t.partner ? [t.partner.es] : []), rp.end.es];
    for (const w of wrong) {
      if (t.answers.some((a) => asHeard(a) === asHeard(w))) continue;
      assert.ok(!matchTurn(t, [w]).passed, `${at}: „${w}“ darf Zug ${i + 1} „${t.task}“ nicht bestehen`);
      checks++;
    }
    assert.equal(matchTurn(t, []).passed, false, 'Stille besteht nicht');
    // Mehrere Erkennungsvarianten: eine passende genügt.
    assert.ok(matchTurn(t, ['hm', asHeard(t.answers[0])]).passed);

    /* 5. Auswahl ohne Mikrofon */
    const opts = choiceOptions(rp, i);
    assert.equal(opts.length, 3, `${at}: drei Antworten zur Auswahl (Zug ${i + 1})`);
    assert.equal(new Set(opts).size, 3);
    assert.ok(opts.includes(t.answers[0]));
    assert.equal(opts.filter((o) => matchTurn(t, [o]).passed).length, 1, `${at}: genau eine Auswahl passt (Zug ${i + 1})`);
    assert.deepEqual(choiceOptions(rp, i), opts, 'Auswahl fest gemischt');
  });
}
// Auswahl: eine Antwort anderer Züge, die auch hier passen würde, wird nicht angeboten.
const fake = {
  ...ROLEPLAYS[0],
  unit: 'zz',
  turns: [
    { task: 'a.', answers: ['Muchas gracias.'] },
    { partner: { es: 'Hola.', de: 'Hallo.' }, task: 'b.', answers: ['¡Muchas gracias!'] },
    { partner: { es: 'Hola.', de: 'Hallo.' }, task: 'c.', answers: ['Gracias.'] },
  ],
};
assert.equal(choiceOptions(fake, 0).filter((o) => matchTurn(fake.turns[0], [o]).passed).length, 1, 'keine zweite passende Auswahl');
// Die richtige Auswahl steht nicht immer an derselben Stelle.
const positions = new Set(ROLEPLAYS.flatMap((rp) => rp.turns.map((t, i) => choiceOptions(rp, i).indexOf(t.answers[0]))));
assert.equal(positions.size, 3, 'richtige Antwort an wechselnden Stellen');

// Gegenprobe des Abgleichs: ein falsches Inhaltswort fällt durch, ein fehlendes Füllwort nicht.
const cafe = ROLEPLAYS[1].turns[0];
assert.ok(!matchTurn(cafe, ['un té con leche por favor']).passed, 'Tee statt Kaffee fällt durch');
assert.ok(matchTurn(cafe, ['un cafe con leche']).passed, 'ohne „por favor“ erlaubt');

assert.deepEqual(missingKeyWords('Un cruasán, por favor.', ['un cruasan']), [], 'ohne Akzent, ohne Füllwörter');
assert.deepEqual(missingKeyWords('Un cruasán, por favor.', ['un cruazan']), [], 'ein Zeichen Abweichung bei langen Wörtern');
assert.deepEqual(missingKeyWords('¿Está lejos?', ['esta le']), ['lejos'], 'abgeschnittenes Inhaltswort fehlt');
assert.deepEqual(missingKeyWords('Soy de Berlín.', ['soy de']), ['berlin']);

/* 6. Freischaltung und Speicherstand */
const u1 = course.units[0];
const done = (ids: string[]) => ({
  ...structuredClone(DEFAULT_PROGRESS),
  lessons: Object.fromEntries(ids.map((id) => [id, { accuracy: 1, completedAt: '2026-11-23T10:00:00Z' }])),
});
assert.equal(roleplayUnlocked(course, done(u1.lessons.slice(0, -1).map((l) => l.id)), 'u1'), false);
assert.equal(roleplayUnlocked(course, done(u1.lessons.map((l) => l.id)), 'u1'), true);
assert.equal(roleplayUnlocked(course, done(u1.lessons.map((l) => l.id)), 'u2'), false);
const ts = '2026-11-23T10:00:00Z';
assert.deepEqual(
  sanitizeProgress({
    roleplays: {
      u1: { spoken: 3, total: 4, at: ts },
      u2: { spoken: 5, total: 4, at: ts },
      u3: { spoken: 1, total: 0, at: ts },
      u4: { spoken: 1, total: 4, at: 'gestern' },
      u5: null,
      u6: { spoken: 4, total: 4, at: ts, extra: 1 },
    },
  }).roleplays,
  { u1: { spoken: 3, total: 4, at: ts }, u6: { spoken: 4, total: 4, at: ts } },
);
assert.deepEqual(sanitizeProgress({ onboarded: true }).roleplays, {});
assert.deepEqual(DEFAULT_PROGRESS.roleplays, {});

const turns = ROLEPLAYS.reduce((a, r) => a + r.turns.length, 0);
const answers = ROLEPLAYS.reduce((a, r) => a + r.turns.reduce((b, t) => b + t.answers.length, 0), 0);
console.log(`OK – ${ROLEPLAYS.length} Rollenspiele, ${turns} Züge, ${answers} erlaubte Antworten; ${checks} Abgleiche; Auswahl, Freischaltung und Speicherstand geprüft.`);
