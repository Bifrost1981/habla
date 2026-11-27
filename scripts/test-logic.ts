// Kleiner Selbsttest der Lernlogik: `npm test`
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { checkSpeech, matchedWords, normalize, sameSentence, similarity, tiles } from '../src/lib/text.ts';
import { addDays, appendLog, applyResults, bumpStreak, currentStreak, dueVocab, fromLeitner, LEITNER_INTERVALS, REVIEW_LOG_MAX, review } from '../src/lib/srs.ts';
import { buildReview, buildTiles, speakToBuild } from '../src/lib/course.ts';
import { expandCourse, generateLesson, type MoreContent } from '../src/lib/generate.ts';
import { prepareForSpeech } from '../src/lib/speech.ts';
import { DEFAULT_PROGRESS, sanitizeProgress } from '../src/lib/storage.ts';
import type { Course } from '../src/types.ts';

const read = (f: string) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const more = read('../src/content/more.json') as MoreContent;
const course = expandCourse(read('../src/content/course.json') as Course, more);

// Text
assert.equal(normalize('¿Cuánto cuesta el café?'), 'cuanto cuesta el cafe');
assert.equal(similarity('La cuenta, por favor.', 'la cuenta por favor'), 1);
assert.ok(similarity('Estoy bien, gracias.', 'estoy bien') < 0.8);
assert.ok(checkSpeech('Una mesa para dos.', ['una mesa para 2']).passed, 'Ziffern werden erkannt');
assert.ok(checkSpeech('Me acuesto a las once.', ['me acuesto a las 11']).passed, 'zweistellige Ziffern');
assert.ok(checkSpeech('Mi abuelo tiene ochenta años.', ['mi abuelo tiene 80 años']).passed);
assert.equal(prepareForSpeech('hola'), 'hola.');
assert.equal(prepareForSpeech('¿qué tal?'), '¿qué tal?');
assert.ok(checkSpeech('El pastel es muy rico.', ['el pastel es muy rica']).passed, '4 von 5 Wörtern = 80 %');
assert.deepEqual(matchedWords('Hola, buenos días.', 'hola días'), [true, false, true]);
assert.ok(sameSentence('¿De dónde eres?', 'de donde eres'));
assert.deepEqual(tiles('¿Cuánto cuesta el café?'), ['Cuánto', 'cuesta', 'el', 'café']);

// Sprechabgleich tolerant auf Wortebene (WP-16, Befund S1)
// Gleich klingende Schreibweisen zählen voll:
assert.equal(similarity('Hola.', 'ola'), 1, 'stummes h');
assert.equal(similarity('Me llamo Ana.', 'me yamo ana'), 1, 'll/y');
assert.equal(similarity('Vivo en Madrid.', 'bibo en madrid'), 1, 'b/v');
assert.equal(similarity('Una cerveza, por favor.', 'una serbesa por fabor'), 1, 'c/z/s');
assert.equal(similarity('¿Qué quieres?', 'ke kieres'), 1, 'qu/k');
assert.equal(similarity('Gente', 'jente'), 1, 'g/j vor e');
assert.deepEqual(matchedWords('Hola, buenos días.', 'ola buenos dias'), [true, true, true]);
// Kleine Abweichung zählt anteilig und besteht, das Wort bleibt aber markiert:
const gracias = checkSpeech('Gracias.', ['gracia']);
assert.ok(gracias.passed && gracias.score < 1, `gracia → Gracias. (${gracias.score})`);
assert.deepEqual(gracias.matched, [false], 'fast richtiges Wort bleibt rot');
const buenos = checkSpeech('Buenos días.', ['buenas dias']);
assert.ok(buenos.passed, `buenas dias → Buenos días. (${buenos.score})`);
assert.deepEqual(buenos.matched, [false, true]);
// Gegenfälle: falsche oder fehlende Wörter scheitern weiterhin
assert.ok(!checkSpeech('Hola.', ['adiós']).passed, 'falsches Wort');
assert.ok(!checkSpeech('Me llamo Ana.', ['me llamo eva']).passed, 'anderer Name');
assert.ok(!checkSpeech('Buenos días.', ['buenas noches']).passed, 'anderer Gruß');
assert.ok(!checkSpeech('Buenos días.', ['buenos']).passed, 'fehlendes Wort');
assert.ok(!checkSpeech('Estoy bien, gracias.', ['estoy bien']).passed, 'fehlendes Wort im Dreiwortsatz');
assert.ok(!checkSpeech('Tengo un perro.', ['tengo una pera']).passed, 'zwei Wörter falsch');
assert.ok(!checkSpeech('El café.', ['la casa']).passed, 'kurze Wörter müssen stimmen');
assert.equal(similarity('Hola.', ''), 0);
assert.equal(similarity('', 'hola'), 0);

// Gespeicherten Stand prüfen (WP-17, Befund B1)
for (const junk of [null, 5, 'x', [1, 2], undefined]) assert.deepEqual(sanitizeProgress(junk), DEFAULT_PROGRESS, `Müll: ${String(junk)}`);
const broken = sanitizeProgress({ onboarded: true, lessons: null, srs: [1], streak: 'x', activity: 3, settings: { dialect: 'es-AR', rate: 7, dailyGoalMin: 12, sound: 'ja' } });
assert.equal(broken.onboarded, true);
assert.deepEqual(broken.lessons, {});
assert.deepEqual(broken.srs, {});
assert.deepEqual(broken.streak, DEFAULT_PROGRESS.streak);
assert.deepEqual(broken.settings, DEFAULT_PROGRESS.settings, 'ungültige Einstellungen fallen auf den Standard');
const mixed = sanitizeProgress({
  onboarded: true,
  lessons: { u1l1: { accuracy: 0.9, completedAt: '2026-11-01T10:00:00Z' }, u1l2: { accuracy: 'gut' }, u1l3: null, u1l4: { accuracy: 1.5, completedAt: 'x' } },
  srs: { hola: { box: 3, due: '2026-11-20', lapses: 1, seen: 4 }, adios: { box: 9, due: '2026-11-20' }, gracias: { box: 2, due: 'morgen' }, si: { box: 1, due: '2026-11-16' } },
  streak: { count: 4, lastDay: '2026-11-14' },
  activity: { '2026-11-14': 600, gestern: 5, '2026-11-13': -1 },
  settings: { dialect: 'es-MX', rate: 'normal', dailyGoalMin: 15, voiceURI: 'Paulina', voiceSource: 'device', sound: false, haptics: false, speechExercises: false },
});
assert.deepEqual(Object.keys(mixed.lessons), ['u1l1'], 'nur gültige Lektionen bleiben');
assert.deepEqual(Object.keys(mixed.srs).sort(), ['hola', 'si']);
// Leitner-Einträge (bis 0.3) werden übernommen (WP-04): gleicher Fälligkeitstag, fehlende Zähler werden 0
assert.equal(mixed.srs.si.due, '2026-11-16');
assert.equal(mixed.srs.si.lapses, 0);
assert.equal(mixed.srs.si.seen, 0);
assert.equal(mixed.srs.hola.due, '2026-11-20');
assert.equal(mixed.srs.hola.stability, 7, 'Fach 3 → Stabilität 7 Tage');
assert.deepEqual(mixed.streak, { count: 4, lastDay: '2026-11-14' });
assert.deepEqual(mixed.activity, { '2026-11-14': 600 });
assert.deepEqual(mixed.settings, { dialect: 'es-MX', rate: 'normal', dailyGoalMin: 15, voiceURI: 'Paulina', voiceSource: 'device', sound: false, haptics: false, speechExercises: false }, 'gültige Einstellungen bleiben');
assert.equal(sanitizeProgress({ settings: { slowByDefault: true } }).settings.rate, 'slow', 'Übernahme aus Version 0.1');
const roundtrip = structuredClone(mixed);
assert.deepEqual(sanitizeProgress(JSON.parse(JSON.stringify(roundtrip))), roundtrip, 'gültiger Stand bleibt unverändert');

// FSRS (WP-04). Exakte Referenzwerte prüft `npm run test:srs`; hier das Verhalten.
const today = '2026-10-11';
let o = review('hola', undefined, true, today);
assert.equal(o.entry.state, 2, 'nach erstem „Gut“ in der Wiederholung (Kurzzeitschritte aus)');
assert.equal(o.entry.due, '2026-10-13', 'erstes „Gut“ → 2 Tage');
assert.equal(o.entry.seen, 1);
assert.deepEqual(o.log, { id: 'hola', day: today, rating: 3, days: 2 });
let prevDays = 2;
for (let i = 0; i < 3; i++) {
  const day = o.entry.due;
  o = review('hola', o.entry, true, day);
  assert.ok(o.log.days > prevDays, `Intervall wächst bei „Gut“ (${prevDays} → ${o.log.days})`);
  prevDays = o.log.days;
}
const lapsed = review('hola', o.entry, false, o.entry.due);
assert.equal(lapsed.entry.lapses, 1, 'Fehler zählt als Lapse');
assert.ok(lapsed.log.days < prevDays && lapsed.log.days >= 1, 'falsch → kurzes Intervall');
assert.ok(lapsed.entry.stability < o.entry.stability, 'falsch senkt die Stabilität');
assert.ok(lapsed.entry.difficulty > o.entry.difficulty, 'falsch erhöht die Schwierigkeit');
const res = applyResults({}, ['hola', 'adios'], ['adios'], today);
assert.equal(res.srs.adios.lapses, 0, 'neues Wort falsch: noch kein Lapse');
assert.equal(res.srs.adios.due, addDays(today, 1), 'neues Wort falsch → morgen');
assert.deepEqual(res.log.map((l) => [l.id, l.rating]), [['hola', 3], ['adios', 1]], 'einmal falsch zählt als falsch');
assert.deepEqual(dueVocab(res.srs, addDays(today, 2)), ['adios', 'hola'], 'länger fällige zuerst');
assert.deepEqual(dueVocab(res.srs, today), []);
assert.equal(appendLog(Array.from({ length: REVIEW_LOG_MAX }, () => o.log), [lapsed.log]).length, REVIEW_LOG_MAX, 'Protokoll begrenzt');
assert.deepEqual(appendLog([], [lapsed.log]).at(-1), lapsed.log);
// Übernahme aus Leitner: nichts geht verloren, Termine bleiben
for (let box = 1; box <= 5; box++) {
  const m = fromLeitner({ box, due: '2026-11-20', lapses: box === 2 ? 2 : 0, seen: box * 2 });
  assert.equal(m.due, '2026-11-20');
  assert.equal(m.stability, LEITNER_INTERVALS[box - 1]);
  assert.equal(m.last, addDays('2026-11-20', -LEITNER_INTERVALS[box - 1]));
  assert.equal(m.seen, box * 2);
  assert.equal(m.lapses, box === 2 ? 2 : 0);
  assert.ok(m.difficulty >= 1 && m.difficulty <= 10);
  const after = review('x', m, true, m.due);
  assert.ok(after.log.days >= LEITNER_INTERVALS[box - 1], `Fach ${box}: richtig am Fälligkeitstag → nicht kürzer als bisher`);
}
const legacy = sanitizeProgress({ srs: { hola: { box: 5, due: '2026-12-01', lapses: 0, seen: 9 } } });
assert.deepEqual(sanitizeProgress(JSON.parse(JSON.stringify(legacy))), legacy, 'übernommener Stand bleibt bei erneutem Laden gleich');
assert.equal(sanitizeProgress({ srs: { a: { due: '2026-11-20', stability: -1, difficulty: 5, state: 2 } } }).srs.a, undefined, 'kaputter FSRS-Eintrag wird verworfen');
assert.deepEqual(sanitizeProgress({ reviewLog: [{ id: 'a', day: '2026-11-01', rating: 3, days: 3 }, { id: 'b', rating: 2 }, 'x'] }).reviewLog, [{ id: 'a', day: '2026-11-01', rating: 3, days: 3 }]);

// Serie
let s = bumpStreak({ count: 0, lastDay: null }, today);
assert.equal(s.count, 1);
s = bumpStreak(s, addDays(today, 1));
assert.equal(s.count, 2);
assert.equal(currentStreak(s, addDays(today, 3)), 0);

// Kurs-Integrität
const ids = new Set(course.vocab.map((v) => v.id));
let total = 0;
for (const unit of course.units) {
  assert.ok(unit.lessons.length >= 4, `${unit.id}: mindestens 4 Lektionen`);
  for (const lesson of unit.lessons) {
    const n = lesson.exercises.length;
    total += n;
    assert.ok(n >= 8 && n <= 20, `${lesson.id}: 8–20 Übungen (${n})`);
    for (const ex of lesson.exercises) {
      const refs =
        ex.type === 'pick' ? [ex.target, ...ex.options] : ex.type === 'card' ? [ex.vocab] : ex.vocab;
      for (const r of refs) assert.ok(ids.has(r), `${lesson.id}: unbekannte Vokabel ${r}`);
      if (ex.type === 'match') assert.equal(ex.vocab.length, 5, `${lesson.id}: 5 Paare`);
      if (ex.type === 'pick') assert.equal(new Set([ex.target, ...ex.options]).size, 4);
      if (ex.type === 'gap') {
        assert.equal(ex.es.split('___').length, 2, `${lesson.id}: genau eine Lücke`);
        assert.ok(!ex.options.includes(ex.answer));
      }
      if (ex.type === 'build' || ex.type === 'dictation') {
        const t = buildTiles(ex);
        assert.equal(t.length, tiles(ex.es).length + ex.extra.length);
      }
      if (ex.type === 'speak' || ex.type === 'say') {
        const b = speakToBuild(ex, course);
        assert.equal(b.extra.length, 2);
        for (const w of b.extra) assert.ok(!normalize(ex.es).split(' ').includes(normalize(w)), `Ablenker ${w} im Satz`);
      }
    }
  }
}
// Erzeugte Lektionen: Lücken gefunden, Emojis je Lektion eindeutig, jedes Wort kommt vor.
assert.equal(new Set(course.vocab.map((v) => v.id)).size, course.vocab.length, 'Vokabel-IDs eindeutig');
for (const us of more.units) {
  for (const ls of us.lessons) {
    const emojis = ls.words.map((w) => w[3]);
    assert.equal(new Set(emojis).size, emojis.length, `${ls.id}: Emojis doppelt`);
    for (const [es, , gap] of ls.sentences) {
      if (gap) assert.ok(tiles(es).includes(gap), `${ls.id}: Lückenwort „${gap}“ fehlt in „${es}“`);
    }
    const { lesson } = generateLesson(ls);
    const shown = new Set(lesson.exercises.flatMap((e) => (e.type === 'card' ? [e.vocab] : e.type === 'pick' ? [e.target] : [])));
    for (const w of ls.words) assert.ok(shown.has(w[0]), `${ls.id}: Wort ${w[0]} wird nicht eingeführt`);
    assert.deepEqual(generateLesson(ls).lesson, lesson, `${ls.id}: Aufbau nicht stabil`);
    const types = new Set(lesson.exercises.map((e) => e.type));
    for (const t of ['card', 'pick', 'match', 'gap', 'build', 'speak', 'dictation', 'say']) assert.ok(types.has(t as never), `${ls.id}: Übungstyp ${t} fehlt`);
  }
}
const lessonCount = course.units.reduce((a, u) => a + u.lessons.length, 0);

const rev = buildReview(course, course.vocab.slice(0, 7).map((v) => v.id));
assert.equal(rev[0].type, 'match');
assert.equal(rev.length, 8);

console.log(`OK – ${course.vocab.length} Vokabeln, ${total} Übungen in ${lessonCount} Lektionen und ${course.units.length} Einheiten, alle Tests bestanden.`);
