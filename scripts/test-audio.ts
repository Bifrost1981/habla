// Test der Vertonung (WP-03): `npm run test:audio [-- --dialect es-ES] [-- --texts-only]`
// 1. Wächter: Die Vorlese-Orte im Code entsprechen der geprüften Liste. Ein neuer Aufruf von say()/speak()
//    oder ein neues <SpokenText>/<Speakable> heißt: spokenTexts() prüfen und die Liste hier anpassen.
// 2. Gegenprobe: Was die Übungsgeneratoren tatsächlich vorlesen lassen (Lektionen, Wiederholung mit
//    Zufall, Ersatzübungen ohne Mikrofon, Tests), ist vollständig in spokenTexts() enthalten.
// Dazu: Die Nachbearbeitung erkennt das Ende der Sprache vor einem Atemgeräusch (künstliche Signale).
// 3. Verzeichnis: audio/<dialekt>/manifest.json hat für jeden Text eine vorhandene, nicht leere Aufnahme;
//    bei Pocket TTS ohne Atemgeräusch am Ende.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { clipKey, type AudioManifest } from '../src/lib/audioKey.ts';
import { buildAssessment } from '../src/lib/assessment.ts';
import { buildReview, buildTiles, speakToBuild } from '../src/lib/course.ts';
import { expandCourse, type MoreContent } from '../src/lib/generate.ts';
import { seeded } from '../src/lib/generate.ts';
import { spokenTexts } from '../src/lib/spokenTexts.ts';
import { STORIES } from '../src/lib/stories.ts';
import { ROLEPLAYS } from '../src/lib/roleplays.ts';
import { noiseAfterEndS, readWav, speechEndSample, speechLevelDb, writeWav } from './audio-signal.ts';
import type { Course, Exercise } from '../src/types.ts';

const root = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const dialect = argv.includes('--dialect') ? argv[argv.indexOf('--dialect') + 1] : 'es-ES';
const textsOnly = argv.includes('--texts-only');

/* 1. Wächter über die Vorlese-Orte */
const EXPECTED_CALL_SITES: Record<string, number> = {
  'src/components/Speakable.tsx': 3,
  'src/components/VoicePicker.tsx': 1,
  'src/context.tsx': 1,
  'src/exercises/Build.tsx': 2,
  'src/exercises/Card.tsx': 3,
  'src/exercises/Match.tsx': 1,
  'src/exercises/Pick.tsx': 1,
  'src/exercises/Speak.tsx': 4,
  'src/screens/AssessmentScreen.tsx': 1,
  'src/screens/LessonScreen.tsx': 2,
  'src/screens/Onboarding.tsx': 1,
  'src/screens/ResultScreen.tsx': 2,
  'src/screens/SettingsScreen.tsx': 2,
  'src/screens/RoleplayScreen.tsx': 4,
  'src/screens/StoryScreen.tsx': 2,
};
const SKIP = new Set(['src/lib/speech.ts', 'src/lib/spokenTexts.ts']);
const found: Record<string, number> = {};
const walk = (dir: string) => {
  for (const f of readdirSync(join(root, dir))) {
    const rel = `${dir}/${f}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel);
    else if (/\.(ts|tsx)$/.test(f) && !SKIP.has(rel)) {
      const n = (readFileSync(join(root, rel), 'utf8').match(/\b(say|speak)\(|<(SpokenText|Speakable)\b/g) ?? []).length;
      if (n) found[rel] = n;
    }
  }
};
walk('src');
assert.deepEqual(found, EXPECTED_CALL_SITES, 'Vorlese-Orte haben sich geändert: spokenTexts() prüfen, dann EXPECTED_CALL_SITES anpassen');

/* 2. Gegenprobe gegen die Generatoren */
const read = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const course: Course = expandCourse(read('src/content/course.json'), read('src/content/more.json') as MoreContent);
const texts = spokenTexts(course);
const have = new Set(texts);
const vm = new Map(course.vocab.map((v) => [v.id, v]));
const missing = new Set<string>();
const need = (t: string | undefined) => {
  if (t && !have.has(t.trim())) missing.add(t.trim());
};
const spoken = (e: Exercise, rand: () => number) => {
  switch (e.type) {
    case 'card':
      need(vm.get(e.vocab)?.es);
      need(vm.get(e.vocab)?.exEs);
      break;
    case 'pick':
      need(vm.get(e.target)?.es);
      break;
    case 'match':
      e.vocab.forEach((id) => need(vm.get(id)?.es));
      break;
    case 'gap':
      need(e.es.replace('___', e.answer));
      break;
    case 'build':
    case 'dictation':
      need(e.es);
      buildTiles(e, rand).forEach(need);
      break;
    case 'speak':
    case 'say': {
      need(e.es);
      const b = speakToBuild(e, course, rand);
      buildTiles(b, rand).forEach(need);
      break;
    }
  }
};
for (let run = 0; run < 25; run++) {
  const rand = seeded(`test-audio-${run}`);
  course.units.forEach((u) => u.lessons.forEach((l) => l.exercises.forEach((e) => spoken(e, rand))));
  // Wiederholung: jedes Wort einmal in jeder Rolle (Diktat, Übersetzen-Sprechen, Karte, Paare)
  const ids = course.vocab.map((v) => v.id);
  for (let shift = 0; shift < 3; shift++) {
    const order = [...ids.slice(shift), ...ids.slice(0, shift)];
    for (let i = 0; i < order.length; i += 12) buildReview(course, order.slice(i, i + 12), rand).forEach((e) => spoken(e, rand));
  }
}
for (const u of course.units) buildAssessment(course, u.id).forEach((item) => need(item.es));
for (const st of STORIES) st.lines.forEach((l) => need(l.es)); // Hörgeschichten, Satz für Satz
// Rollenspiele: Gegenseite, Schlusssatz und jede Antwort, die im Verlauf erscheinen (und angetippt werden) kann
for (const rp of ROLEPLAYS) {
  rp.turns.forEach((t) => [t.partner?.es, ...t.answers].forEach(need));
  need(rp.end.es);
}
assert.deepEqual([...missing].slice(0, 20), [], `${missing.size} vorlesbare Texte fehlen in spokenTexts()`);
assert.ok(texts.length > 800, `plausible Anzahl Texte (${texts.length})`);

/* Gegenprobe des Wächters: ein zusätzlicher Vorlese-Ort muss auffallen */
assert.notDeepEqual({ ...found, 'src/neu.tsx': 1 }, EXPECTED_CALL_SITES);

/* Nachbearbeitung: Ende der Sprache vor dem Atmen erkennen (künstliche Signale, 24 kHz) */
{
  const rate = 24000;
  let s = 1;
  const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const part = (sec: number, f: (t: number, i: number) => number) => Float32Array.from({ length: Math.round(sec * rate) }, (_, i) => f(i / rate, i));
  const vowel = (sec: number, g = 1) => part(sec, (t) => g * (0.3 * Math.sin(2 * Math.PI * 200 * t) + 0.1 * Math.sin(2 * Math.PI * 400 * t)));
  const sibilant = (sec: number) => part(sec, (t) => 0.06 * noise() * (1 - t / sec)); // S am Wortende, klingt aus
  const silence = (sec: number) => part(sec, () => 0.0003 * noise());
  let prev = 0;
  const breath = (sec: number, amp = 0.03) => part(sec, () => (prev = 0.85 * prev + 0.15 * 1.45 * amp * noise())); // gedämpftes Rauschen wie echtes Atmen (Nulldurchgangsrate ~0,2)
  const cat = (...p: Float32Array[]) => {
    const out = new Float32Array(p.reduce((a, x) => a + x.length, 0));
    p.reduce((o, x) => (out.set(x, o), o + x.length), 0);
    return out;
  };
  const at = (x: Float32Array) => {
    const { samples, rate: r } = readWav(writeWav(x, rate)); // über WAV, wie in make-audio
    const e = speechEndSample(samples, r);
    return e === null ? null : e / r;
  };
  const near = (got: number | null, lo: number, hi: number, what: string) => assert.ok(got !== null && got >= lo && got <= hi, `${what}: ${got}`);
  near(at(cat(vowel(0.4), silence(0.15), breath(0.35))), 0.38, 0.46, '„siete“: Schnitt vor dem Atmen');
  near(at(cat(vowel(0.4), sibilant(0.12), silence(0.15), breath(0.35))), 0.5, 0.58, '„lunes“: S bleibt, Atmen weg');
  near(at(cat(vowel(0.4), silence(0.15), breath(0.35, 0.1))), 0.38, 0.46, 'lautes Atmen (−20 dB) ist trotzdem keine Stimme');
  near(at(cat(vowel(0.4), silence(0.15), breath(0.35), vowel(0.02))), 0.38, 0.46, '„entiendo“: Knacken nach dem Atmen ist kein Laut');
  near(at(cat(vowel(0.4), silence(0.08), sibilant(0.15), silence(0.3))), 0.6, 0.66, '„sándwich“: ch nach dem Verschluss bleibt');
  near(at(cat(vowel(0.4), silence(0.08), sibilant(0.15), silence(0.15), breath(0.35))), 0.6, 0.66, '„sándwich“ mit Atmen danach');
  near(at(cat(vowel(0.4), silence(0.15), part(0.35, () => 0.004 * noise()))), 0.38, 0.46, '„Sevilla“: leises Rauschen mit vielen Nulldurchgängen ist Atmen');
  near(at(cat(vowel(0.4), silence(0.08), sibilant(0.08), vowel(0.06), silence(0.15), breath(0.3))), 0.6, 0.66, '„leche“: „che“ nach dem Verschluss bleibt');
  near(at(cat(vowel(0.4), silence(0.08), vowel(0.08, 0.05), silence(0.15), breath(0.3))), 0.54, 0.6, 'leiser Vokal nach dem Verschluss bleibt (−26 dB)');
  near(at(cat(vowel(0.3), silence(0.2), vowel(0.3), silence(0.2))), 0.78, 0.84, 'Pause im Satz bleibt, Schnitt nach dem letzten Wort');
  assert.equal(at(cat(silence(0.1), vowel(0.5))), null, 'ohne Pause am Ende: nichts abschneiden');
  assert.equal(at(silence(0.5)), null, 'Stille: nichts abschneiden');
  assert.ok(noiseAfterEndS(cat(vowel(0.4), silence(0.15), breath(0.35)), rate) >= 0.2, 'Prüfung erkennt Atmen');
  assert.equal(noiseAfterEndS(cat(vowel(0.4), sibilant(0.12), silence(0.3)), rate), 0, 'Prüfung: ohne Atmen nichts');
  assert.ok(Math.abs(speechLevelDb(vowel(0.5), rate) - 20 * Math.log10(Math.sqrt(0.3 ** 2 / 2 + 0.1 ** 2 / 2))) < 0.5, 'Sprechpegel');
}

if (textsOnly) {
  console.log(`OK – ${texts.length} vorlesbare Texte vollständig; Vorlese-Orte unverändert (${Object.keys(found).length} Dateien). Verzeichnis nicht geprüft (--texts-only).`);
  process.exit(0);
}

/* 3. Aufnahme-Verzeichnis */
const dir = join(root, 'audio', dialect);
const manifestPath = join(dir, 'manifest.json');
assert.ok(existsSync(manifestPath), `audio/${dialect}/manifest.json fehlt – noch nicht vertont`);
const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as AudioManifest;
assert.equal(m.dialect, dialect);
assert.ok(m.provider && m.voice && m.voiceLabel, 'Verzeichnis nennt Anbieter und Stimme');
const absent = texts.filter((t) => !m.clips[clipKey(t)]);
assert.deepEqual(absent.slice(0, 10), [], `${absent.length} von ${texts.length} Texten ohne Aufnahme`);
const broken = Object.values(m.clips).filter((f) => !existsSync(join(dir, f)) || statSync(join(dir, f)).size < 1000);
assert.deepEqual(broken.slice(0, 10), [], `${broken.length} Aufnahmen fehlen oder sind leer`);
// Kein Atemgeräusch am Ende (Pocket TTS; Rückmeldung 2026-11-19). Braucht ffmpeg zum Dekodieren.
if (m.provider === 'pocket') {
  const breathy = Object.values(m.clips).filter((f) => {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', join(dir, f), '-f', 's16le', '-ac', '1', '-ar', '24000', 'pipe:1'], { maxBuffer: 1 << 26 });
    const x = Float32Array.from({ length: pcm.length >> 1 }, (_, i) => pcm.readInt16LE(2 * i) / 32768);
    return noiseAfterEndS(x, 24000) >= 0.06;
  });
  assert.deepEqual(breathy.slice(0, 10), [], `${breathy.length} Aufnahmen mit Geräusch nach dem Ende der Sprache (Atmen)`);
}
console.log(`OK – ${texts.length} vorlesbare Texte, alle vertont (${m.voiceLabel}, ${m.provider}); Vorlese-Orte unverändert.`);
