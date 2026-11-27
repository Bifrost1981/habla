// Test Wortschatz nach Häufigkeit und Kann-Beschreibungen (WP-11):
//   node --experimental-strip-types --no-warnings scripts/test-frequency.ts
// 1. Häufigkeitsliste: Quelle und Lizenz dokumentiert (CC BY-SA 4.0), Datei unverändert (SHA-256), Format plausibel.
// 2. Jede Einheit hat die Lektion „Kleine Wörter“ (…l5) mit 6 Wörtern, alle unter den 500 häufigsten Wortformen.
// 3. Diese Lektionen bringen keine weiteren unbekannten Wörter mit (Beispielsätze, Satzübungen, Lückenwörter).
// 4. Abdeckung der häufigsten Wörter liegt über den Schwellen (vorher: Top 100 63 %, Top 300 36 %).
// 5. Jede Einheit hat 2–4 Kann-Beschreibungen (GER A1) mit gültiger Fertigkeit; Gegenproben für die Prüfung.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAN_DO, CAN_DO_LEVEL, CAN_DO_SKILLS, canDoFor, type CanDo } from '../src/lib/cando.ts';
import { expandCourse, type MoreContent } from '../src/lib/generate.ts';
import { knownWords, storyTokens } from '../src/lib/stories.ts';
import type { Course } from '../src/types.ts';

const root = new URL('..', import.meta.url).pathname;
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const base = JSON.parse(read('src/content/course.json'));
const more = JSON.parse(read('src/content/more.json')) as MoreContent;
const course: Course = expandCourse(base, more);

/* 1. Häufigkeitsliste */
const SHA = '33d6c67aa6d0b5e88d9bbed5ca69b62e6d024d96cc2933bc5c7a69b5b99b8cd9';
const listText = read('data/frequency/es_top5000.txt');
assert.equal(createHash('sha256').update(listText).digest('hex'), SHA, 'Häufigkeitsliste unverändert');
const source = read('data/frequency/SOURCE.md');
for (const need of ['CC BY-SA 4.0', 'https://github.com/hermitdave/FrequencyWords', 'OpenSubtitles', SHA, 'nicht** in die App'])
  assert.ok(source.includes(need), `SOURCE.md nennt „${need}“`);
const rows = listText
  .trim()
  .split('\n')
  .map((l) => l.split(' '));
assert.equal(rows.length, 5000);
rows.forEach(([w, n], i) => {
  assert.ok(w && /^\d+$/.test(n), `Zeile ${i + 1}: „Wort Anzahl“`);
  if (i) assert.ok(Number(n) <= Number(rows[i - 1][1]), `Zeile ${i + 1}: absteigend sortiert`);
});
const freq = rows.map(([w]) => w);
const rank = new Map(freq.map((w, i) => [w, i + 1]));
// Die App enthält die Liste nicht.
assert.ok(!read('vite.config.ts').includes('data/frequency') && !read('src/lib/cando.ts').includes('frequency'), 'Liste nicht in der App');

/* 2. und 3. Lektionen „Kleine Wörter“ */
const MAX_RANK = 500;
for (const spec of more.units) {
  const l5 = spec.lessons.find((l) => l.id === `${spec.id}l5`);
  assert.ok(l5, `${spec.id}: Lektion ${spec.id}l5 vorhanden`);
  assert.ok(l5.title.startsWith('Kleine Wörter: '), `${spec.id}l5: Titel`);
  assert.equal(l5.words.length, 6, `${spec.id}l5: 6 Wörter`);
  for (const w of l5.words) {
    const tokens = storyTokens(w[1]).filter((t) => !['el', 'la', 'los', 'las'].includes(t));
    for (const t of tokens) {
      const r = rank.get(t);
      assert.ok(
        r !== undefined && r <= MAX_RANK,
        `${spec.id}l5: „${t}“ unter den ${MAX_RANK} häufigsten (Rang ${r ?? 'nicht in Top 5000'})`,
      );
    }
  }
  // Was bis zu dieser Einheit ohne diese Lektion bekannt ist, plus die Wörter der Lektion selbst
  const without = expandCourse(base, {
    units: more.units.map((u) => (u.id === spec.id ? { ...u, lessons: u.lessons.filter((l) => l !== l5) } : u)),
  });
  const allowed = knownWords(without, spec.id);
  l5.words.forEach((w) => storyTokens(w[1]).forEach((t) => allowed.add(t)));
  const texts = [...l5.words.map((w) => w[4]), ...l5.sentences.flatMap((s) => [s[0], s[2] ?? '', ...(s[3] ?? [])])];
  const extra = [...new Set(texts.flatMap(storyTokens).filter((t) => !allowed.has(t)))];
  assert.deepEqual(extra, [], `${spec.id}l5: Wörter, die weder bekannt noch neu in der Lektion sind`);
}

/* 4. Abdeckung */
const known = knownWords(course, course.units.at(-1)!.id);
const share = (n: number) => freq.slice(0, n).filter((w) => known.has(w)).length / n;
const top100 = share(100);
const top300 = share(300);
assert.ok(top100 >= 0.78, `Top 100: ${(100 * top100).toFixed(0)} % im Kurs (Schwelle 78 %, vorher 63 %)`);
assert.ok(top300 >= 0.5, `Top 300: ${(100 * top300).toFixed(0)} % im Kurs (Schwelle 50 %, vorher 36 %)`);
// Themenwörter außerhalb der 5000 häufigsten (Speisen, Namen, Möbel …) sind erlaubt, aber nur als kleiner Teil.
const rare = [...known].filter((w) => !rank.has(w)).sort();
const rareShare = rare.length / known.size;
assert.ok(rareShare <= 0.15, `${rare.length} von ${known.size} Kurswörtern nicht unter den 5000 häufigsten (Schwelle 15 %)`);

/* 5. Kann-Beschreibungen */
function problems(c: CanDo): string[] {
  const p: string[] = [];
  if (c.items.length < 2 || c.items.length > 4) p.push('2–4 Beschreibungen');
  if (new Set(c.items.map((i) => i.skill)).size < 2) p.push('mindestens zwei Fertigkeiten');
  for (const i of c.items) {
    if (!(CAN_DO_SKILLS as readonly string[]).includes(i.skill)) p.push(`Fertigkeit „${i.skill}“`);
    if (!/^Ich (kann|verstehe) /.test(i.text) || !/[.!]$/.test(i.text)) p.push(`Form „${i.text}“`);
  }
  if (new Set(c.items.map((i) => i.text)).size !== c.items.length) p.push('doppelt');
  return p;
}
assert.equal(CAN_DO_LEVEL, 'A1');
assert.deepEqual(
  CAN_DO.map((c) => c.unit),
  course.units.map((u) => u.id),
  'je Einheit Kann-Beschreibungen, in Kursreihenfolge',
);
for (const c of CAN_DO) assert.deepEqual(problems(c), [], `${c.unit}: Kann-Beschreibungen`);
const skillsUsed = new Set(CAN_DO.flatMap((c) => c.items.map((i) => i.skill)));
for (const s of ['Hören', 'Lesen', 'Sprechen', 'Gespräch']) assert.ok(skillsUsed.has(s as never), `Fertigkeit ${s} kommt vor`);
assert.deepEqual(canDoFor('gibt-es-nicht'), []);
// Gegenproben der Prüfung
const ok = CAN_DO[0];
assert.notDeepEqual(problems({ ...ok, items: ok.items.slice(0, 1) }), []);
assert.notDeepEqual(problems({ ...ok, items: ok.items.map((i) => ({ ...i, skill: 'Hören' as const })) }), []);
assert.notDeepEqual(problems({ ...ok, items: [...ok.items.slice(0, 2), { skill: 'Tanzen' as never, text: 'Ich kann tanzen.' }] }), []);
assert.notDeepEqual(problems({ ...ok, items: [...ok.items.slice(0, 2), { skill: 'Lesen', text: 'Lesen von Speisekarten' }] }), []);

console.log(
  `OK – Liste FrequencyWords (CC BY-SA 4.0) geprüft; 8 Lektionen „Kleine Wörter“ mit je 6 Wörtern unter den ${MAX_RANK} häufigsten; ` +
    `Top 100: ${(100 * top100).toFixed(0)} % (vorher 63 %), Top 300: ${(100 * top300).toFixed(0)} % (vorher 36 %); ` +
    `${(100 * rareShare).toFixed(0)} % seltene Themenwörter; ${CAN_DO.reduce((a, c) => a + c.items.length, 0)} Kann-Beschreibungen (GER ${CAN_DO_LEVEL}) in 8 Einheiten.`,
);
