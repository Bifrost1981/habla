// Übungsmix (WP-05): `npm run test:mix`
// Prüft für jede Lektion des Kurses, dass mindestens die Hälfte der Übungen Abruf oder Sprechen ist
// (Satz bauen, Hör-Diktat, Nachsprechen, Übersetzen-Sprechen) statt Auswahl (Bild-Auswahl, Paare, Lücke, Karteikarte).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildReview, buildTiles, isRetrieval, retrievalShare, RETRIEVAL_TYPES, speakToBuild } from '../src/lib/course.ts';
import { expandCourse, type MoreContent } from '../src/lib/generate.ts';
import { normalize, sameSentence, tiles, words } from '../src/lib/text.ts';
import type { Course, Exercise } from '../src/types.ts';

const read = (f: string) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const course = expandCourse(read('../src/content/course.json') as Course, read('../src/content/more.json') as MoreContent);
const MIN_SHARE = 0.5;

// Einordnung der Übungstypen: fest, damit eine Umdeutung („Karteikarte zählt als Abruf“) auffällt.
assert.deepEqual([...RETRIEVAL_TYPES].sort(), ['build', 'dictation', 'say', 'speak']);
const of = (type: string) => ({ type }) as unknown as Exercise;
for (const t of ['pick', 'match', 'gap', 'card']) assert.equal(isRetrieval(of(t)), false, `${t} ist Auswahl/Einführung, kein Abruf`);
for (const t of ['build', 'dictation', 'speak', 'say']) assert.equal(isRetrieval(of(t)), true, `${t} ist Abruf oder Sprechen`);

// Gegenprobe der Messung: Der Aufbau einer erzeugten Lektion aus Version 0.3 (3 von 14) fällt durch.
const old03 = ['card', 'pick', 'card', 'pick', 'match', 'card', 'gap', 'pick', 'build', 'card', 'speak', 'pick', 'gap', 'speak'].map(of);
assert.ok(retrievalShare(old03) < MIN_SHARE, 'Aufbau aus 0.3 muss durchfallen');
assert.equal(retrievalShare([]), 0, 'leere Lektion zählt nicht als bestanden');
assert.equal(retrievalShare(['card', 'build'].map(of)), 0.5);

let minShare = 1;
let minLesson = '';
let lessons = 0;
const perType: Record<string, number> = {};
for (const unit of course.units) {
  for (const lesson of unit.lessons) {
    lessons += 1;
    const ex = lesson.exercises;
    const share = retrievalShare(ex);
    if (share < minShare) [minShare, minLesson] = [share, lesson.id];
    assert.ok(share >= MIN_SHARE, `${lesson.id}: nur ${ex.filter(isRetrieval).length} von ${ex.length} Übungen sind Abruf oder Sprechen`);
    // Ohne Mikrofon werden Sprechübungen zu „Satz bauen“: Der Anteil darf dadurch nicht sinken.
    const noMic = ex.map((e) => (e.type === 'speak' || e.type === 'say' ? speakToBuild(e, course) : e));
    assert.ok(retrievalShare(noMic) >= MIN_SHARE, `${lesson.id}: ohne Mikrofon unter 50 %`);
    // Beide neuen Übungen kommen in jeder Lektion vor.
    for (const t of ['dictation', 'say']) assert.ok(ex.some((e) => e.type === t), `${lesson.id}: Übungstyp ${t} fehlt`);
    // Sprechen bleibt Teil jeder Lektion (mit Mikrofon).
    assert.ok(ex.some((e) => e.type === 'speak' || e.type === 'say'), `${lesson.id}: keine Sprechübung`);
    const seen: Record<string, string[]> = {};
    for (const e of ex) {
      perType[e.type] = (perType[e.type] ?? 0) + 1;
      if (e.type === 'dictation') {
        // Diktat ist ohne Tastatur lösbar: alle Wörter des Satzes liegen als Kacheln bereit, Ablenker stehen nicht im Satz.
        const bank = buildTiles(e);
        assert.equal(bank.length, tiles(e.es).length + e.extra.length, `${lesson.id}: Kacheln für „${e.es}“`);
        for (const w of tiles(e.es)) assert.ok(bank.includes(w), `${lesson.id}: Kachel „${w}“ fehlt`);
        for (const w of e.extra) assert.ok(!words(e.es).includes(normalize(w)), `${lesson.id}: Ablenker „${w}“ steht im Satz „${e.es}“`);
        assert.ok(sameSentence(tiles(e.es).join(' '), e.es), `${lesson.id}: Lösung aus Kacheln wird anerkannt`);
      }
      if (e.type === 'dictation' || e.type === 'say') {
        assert.ok(e.es.trim() && e.de.trim(), `${lesson.id}: leerer Satz`);
        // Derselbe Satz nicht zweimal in derselben Übungsform.
        assert.ok(!(seen[e.type] ?? []).some((s) => sameSentence(s, e.es)), `${lesson.id}: „${e.es}“ doppelt als ${e.type}`);
        (seen[e.type] ??= []).push(e.es);
      }
    }
    // Ein Wort wird eingeführt (Karteikarte oder Bild-Auswahl), bevor sein Beispielsatz abgerufen wird.
    const vm = new Map(course.vocab.map((v) => [v.id, v]));
    const introAt = new Map<string, number>();
    ex.forEach((e, i) => {
      const id = e.type === 'card' ? e.vocab : e.type === 'pick' ? e.target : null;
      if (id && !introAt.has(id)) introAt.set(id, i);
    });
    ex.forEach((e, i) => {
      if (e.type !== 'dictation' && e.type !== 'say') return;
      for (const id of e.vocab) {
        const v = vm.get(id)!;
        if (sameSentence(v.exEs, e.es) && introAt.has(id)) assert.ok(introAt.get(id)! < i, `${lesson.id}: „${e.es}“ vor der Einführung von ${id}`);
      }
    });
  }
}

// Tägliche Wiederholung: bei jeder Anzahl fälliger Wörter mindestens die Hälfte Abruf oder Sprechen.
for (let n = 1; n <= 12; n++) {
  const rev = buildReview(course, course.vocab.slice(0, n).map((v) => v.id));
  assert.ok(retrievalShare(rev) >= MIN_SHARE, `Wiederholung mit ${n} Wörtern: ${rev.map((e) => e.type).join(' ')}`);
}

const total = Object.values(perType).reduce((a, b) => a + b, 0);
const retrieval = RETRIEVAL_TYPES.reduce((a, t) => a + (perType[t] ?? 0), 0);
console.log(
  `OK – ${lessons} Lektionen, jede mit mindestens ${Math.round(MIN_SHARE * 100)} % Abruf oder Sprechen ` +
    `(niedrigster Anteil ${(minShare * 100).toFixed(1)} % in ${minLesson}; gesamt ${retrieval} von ${total} Übungen). ` +
    `Typen: ${Object.entries(perType).sort().map(([t, n]) => `${t} ${n}`).join(', ')}.`,
);
