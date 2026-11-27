// Fehlerdiagnose und Regelhinweise (WP-06): `npm run test:feedback`
// Mit `--list` gibt das Skript alle Hinweise aus, die im Kurs bei typischen Fehlern entstehen (für die fachliche Durchsicht).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { diagnose, KIND_LABEL, makeLexicon, type Diagnosis, type ErrorKind } from '../src/lib/diagnose.ts';
import { expandCourse, type MoreContent } from '../src/lib/generate.ts';
import { normalize, tiles } from '../src/lib/text.ts';
import type { Course } from '../src/types.ts';

const read = (f: string) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const course = expandCourse(read('../src/content/course.json') as Course, read('../src/content/more.json') as MoreContent);
const lex = makeLexicon(course);
const d = (target: string, given: string, speech = false) => diagnose(target, given, lex, { speech });
const marked = (target: string, x: Diagnosis) => x.marks.map((i) => target.split(/\s+/)[i].replace(/[¿?¡!.,]/g, ''));

/** Erwartung: Fehlertyp, markierte Wörter der Lösung, Textstücke der Regel. */
function expectHint(target: string, given: string, kind: ErrorKind, marks: string[], parts: string[], speech = false) {
  const x = d(target, given, speech);
  assert.ok(x, `„${given}“ statt „${target}“: kein Hinweis`);
  assert.equal(x.kind, kind, `„${given}“ statt „${target}“: ${x.kind} (${x.rule})`);
  assert.equal(x.label, KIND_LABEL[kind]);
  assert.deepEqual(marked(target, x), marks, `Markierung bei „${given}“`);
  for (const p of parts) assert.ok(x.rule.includes(p), `Regel „${x.rule}“ enthält nicht „${p}“`);
}

// Lexikon aus den Kursdaten
assert.equal(lex.gender.get('mesa'), 'f');
assert.equal(lex.gender.get('cafe'), 'm');
assert.equal(lex.gender.get('agua'), 'f', '„el agua“ ist weiblich');
assert.equal(lex.meaning.get('sin'), 'ohne');

// 1) Wortstellung
expectHint('Buenos días, señor.', 'señor buenos días', 'order', ['señor'], ['Reihenfolge']);
expectHint('Un té frío.', 'un frío té', 'order', ['té', 'frío'], ['Adjektiv', 'hinter dem Nomen', '„té frío“']);
expectHint('La camiseta es blanca.', 'la blanca camiseta es', 'order', ['blanca'], ['Reihenfolge']);
// 2) Geschlecht: Artikel, Nomenform, Adjektivendung
expectHint('Una mesa para dos.', 'un mesa para dos', 'gender', ['Una', 'mesa'], ['„mesa“ ist weiblich', '„una mesa“']);
expectHint('¿Cuánto cuesta el café?', 'cuánto cuesta la café', 'gender', ['el', 'café'], ['„café“ ist männlich', '„el café“']);
expectHint('El agua está fría.', 'la agua está fría', 'gender', ['El', 'agua'], ['weiblich', 'betonten a', '„el agua“']);
expectHint('Es mi amiga Sofía.', 'es mi amigo Sofía', 'gender', ['amiga'], ['„amiga“ ist die weibliche Form', '„amigo“ die männliche']);
expectHint('El agua está fría.', 'el agua está frío', 'gender', ['fría'], ['Adjektiv richtet sich nach dem Nomen', '„fría“']);
expectHint('Los zapatos son bonitos.', 'las zapatos son bonitos', 'gender', ['Los', 'zapatos'], ['„zapatos“ ist männlich', '„los zapatos“']);
// 3) Artikel: bestimmt/unbestimmt, fehlender Artikel
expectHint('Quiero un café.', 'quiero el café', 'article', ['un'], ['„ein, eine“', '„der, die, das“', 'Hier gehört „un“ hin']);
expectHint('La cuenta, por favor.', 'una cuenta por favor', 'article', ['La'], ['Hier gehört „la“ hin']);
expectHint('La cuenta, por favor.', 'cuenta por favor', 'article', ['La'], ['Vor „cuenta“ fehlt der Artikel „la“']);
// 4) ser/estar in beiden Richtungen und in mehreren Personen
expectHint('Estoy bien.', 'soy bien', 'serestar', ['Estoy'], ['„estar“ (hier „Estoy“)', 'Befinden']);
expectHint('El café está caliente.', 'el café es caliente', 'serestar', ['está'], ['Zustand']);
expectHint('Soy de Alemania.', 'estoy de Alemania', 'serestar', ['Soy'], ['„ser“ (hier „Soy“)', 'Herkunft']);
expectHint('Son las cinco.', 'están las cinco', 'serestar', ['Son'], ['Uhrzeit']);
expectHint('¿Dónde están las llaves?', 'dónde son las llaves', 'serestar', ['están'], ['Ort']);
// 5) Fehlendes Wort
expectHint('Un café, por favor.', 'un café favor', 'missing', ['por'], ['Es fehlt das Wort „por“']);
expectHint('Estoy bien, gracias.', 'estoy bien', 'missing', ['gracias'], ['„gracias“ (danke)']);
expectHint('Una mesa para dos, por favor.', 'una mesa para dos', 'missing', ['por', 'favor'], ['Es fehlen die Wörter „por“ und „favor“']);
// 6) Wort zu viel
expectHint('No, gracias.', 'no gracias hola', 'extra', [], ['„hola“ gehört nicht in diesen Satz']);
// 7) Bedeutung (anderes Wort), z. B. falsches Lückenwort
expectHint('Un café con leche.', 'un café sin leche', 'meaning', ['con'], ['„sin“ heißt „ohne“', '„con“ (mit)']);
expectHint('Muchas gracias.', 'muchas hola', 'meaning', ['gracias'], ['„hola“ heißt „hallo“', '„gracias“ (danke)']);
expectHint('Me llamo Laura.', 'me tal Laura', 'meaning', ['llamo'], ['Statt „tal“ gehört hier „llamo“ hin']);
// Wörter der Antwort erscheinen in ihrer Schreibweise (mit Akzent); mehrdeutige Kurzwörter ohne Übersetzung.
expectHint('Muchas gracias.', 'Muchas sí.', 'meaning', ['gracias'], ['„sí“', '„gracias“']);
expectHint('El café está caliente.', 'El café está frío.', 'meaning', ['caliente'], ['„frío“ heißt „kalt“', '„caliente“ (heiß)']);
assert.ok(!d('No entiendo.', 'entiendo')!.rule.includes('nein'), '„no“ ohne Übersetzung');

// Gesprochenes: gleich klingende Schreibweisen sind kein Fehler; Grammatik und fehlende Wörter werden erkannt,
// einzelne fremde Wörter nicht (die Spracherkennung verhört sich).
assert.equal(d('Hola, buenos días.', 'ola buenos dias', true), null, 'stummes h ist kein Fehler');
assert.equal(d('Me llamo Ana.', 'me yamo ana', true), null);
expectHint('Estoy bien.', 'soy bien', 'serestar', ['Estoy'], ['estar'], true);
expectHint('Una mesa para dos.', 'un mesa para dos', 'gender', ['Una', 'mesa'], ['weiblich'], true);
expectHint('La cuenta, por favor.', 'la cuenta', 'missing', ['por', 'favor'], ['Es fehlen'], true);
assert.equal(d('Muchas gracias.', 'muchas grasas', true), null, 'verhörtes Wort: kein Hinweis');
assert.equal(d('No, gracias.', 'no gracias eh', true), null, 'Füllwort: kein Hinweis');

// Akzente unterscheiden: „Él“ ist kein Artikel, „esta“ (diese) kein „está“.
expectHint('Él es bajo.', 'es bajo', 'missing', ['Él'], ['Es fehlt das Wort „Él“']);
assert.notEqual(d('Esta casa es grande.', 'es casa es grande')?.kind, 'serestar');
// Ohne bekanntes Nomen dahinter gilt ein fehlendes „las“/„una“ als fehlendes Wort (Uhrzeit: „Son las cinco“).
expectHint('Son las cinco.', 'son cinco', 'missing', ['las'], ['Es fehlt das Wort „las“']);
expectHint('Son las cinco.', 'son los cinco', 'gender', ['las'], ['Hier muss es „las“ heißen', 'weiblich']);

// Gegenfälle: kein Hinweis bei richtiger Antwort, bei leerer Antwort und wenn die Antwort zu weit weg ist.
assert.equal(d('La cuenta, por favor.', 'la cuenta por favor'), null, 'richtig');
assert.equal(d('La cuenta, por favor.', 'La cuenta, por favor.'), null);
assert.equal(d('La cuenta, por favor.', ''), null);
assert.equal(d('Quiero un café, por favor.', 'té una gracias'), null, 'zu weit weg');
assert.equal(d('Una mesa para dos, por favor.', 'tres cuenta mesa'), null);
// Verbformen auf -o/-a sind kein Geschlechtsfehler.
assert.notEqual(d('Trabajo en una oficina.', 'trabaja en una oficina')?.kind, 'gender');
assert.notEqual(d('Vivo en Madrid.', 'viva en Madrid')?.kind, 'gender');
// Keine Geschlechtsregel, die dem Nomen widerspricht: „el agua“ wird nie „männlich“ genannt.
assert.ok(!d('El agua está fría.', 'la agua está fría')!.rule.includes('männlich'));

// Jeder Hinweis ist genau ein Satz.
const oneSentence = (rule: string) => /^[^\n]{10,200}\.$/.test(rule) && !/[.!?]\s+[A-ZÄÖÜ„]/.test(rule.replace(/„[^“]*“/g, 'X'));

/* ───── Durchlauf über den ganzen Kurs: typische Fehler in jedem Satz ───── */

const sentences = new Set<string>();
const gaps: { target: string; given: string }[] = [];
for (const u of course.units)
  for (const l of u.lessons)
    for (const e of l.exercises) {
      if (e.type === 'build' || e.type === 'dictation' || e.type === 'speak' || e.type === 'say') sentences.add(e.es);
      if (e.type === 'gap') for (const o of e.options) gaps.push({ target: e.es.replace('___', e.answer), given: e.es.replace('___', o) });
    }

const SWAP: Record<string, string> = {
  el: 'la', la: 'el', un: 'una', una: 'un', los: 'las', las: 'los',
  soy: 'estoy', estoy: 'soy', es: 'está', está: 'es', son: 'están', están: 'son', eres: 'estás', estás: 'eres', somos: 'estamos',
};
const counts: Record<string, number> = {};
const rules = new Map<string, { kind: ErrorKind; example: string }>();
const note = (x: Diagnosis | null, target: string, given: string, want: ErrorKind[] | null) => {
  assert.ok(x, `kein Hinweis: „${given}“ statt „${target}“`);
  if (want) assert.ok(want.includes(x.kind), `„${given}“ statt „${target}“: ${x.kind}, erwartet ${want.join('/')} (${x.rule})`);
  assert.ok(oneSentence(x.rule), `kein einzelner Satz: ${x.rule}`);
  const shown = target.split(/\s+/);
  for (const m of x.marks) assert.ok(m >= 0 && m < shown.length, `Markierung außerhalb: ${m} in „${target}“`);
  if (x.kind !== 'extra') assert.ok(x.marks.length > 0, `keine Markierung: „${given}“ statt „${target}“`);
  counts[x.kind] = (counts[x.kind] ?? 0) + 1;
  // Für die Durchsicht: jede Regel einmal, Eigennamen der Beispiele bleiben stehen.
  if (!rules.has(x.rule)) rules.set(x.rule, { kind: x.kind, example: `${given}  →  ${target}` });
};

for (const es of sentences) {
  const t = tiles(es);
  // a) zwei benachbarte Wörter vertauscht → Wortstellung
  for (let i = 0; i + 1 < t.length; i++) {
    if (normalize(t[i]) === normalize(t[i + 1])) continue;
    const g = [...t];
    [g[i], g[i + 1]] = [g[i + 1], g[i]];
    note(d(es, g.join(' ')), es, g.join(' '), ['order']);
  }
  // b) ein Wort fehlt → fehlendes Wort bzw. Artikel (nur wenn der Rest noch mindestens die Hälfte ist)
  if (t.length >= 2)
    for (let i = 0; i < t.length; i++) {
      const g = t.filter((_, k) => k !== i);
      if (g.map(normalize).join(' ') === t.map(normalize).join(' ')) continue;
      note(d(es, g.join(' ')), es, g.join(' '), ['missing', 'article']);
    }
  // c) Artikel im falschen Geschlecht, ser/estar vertauscht
  t.forEach((w, i) => {
    const s = SWAP[w.toLowerCase()];
    if (!s) return;
    if (w.toLowerCase() === 'es' && /^[¿¡]?Él\b/.test(es) && i === 0) return;
    const g = [...t];
    g[i] = s;
    const ser = ['soy', 'estoy', 'es', 'está', 'son', 'están', 'eres', 'estás', 'somos'].includes(w.toLowerCase());
    note(d(es, g.join(' ')), es, g.join(' '), [ser ? 'serestar' : 'gender']);
  });
  // d) ein fremdes Wort zu viel
  note(d(es, `${t.join(' ')} xyz`), es, `${t.join(' ')} xyz`, t.length >= 2 ? ['extra'] : null);
}
// e) jedes falsche Lückenwort bekommt einen Hinweis
for (const g of gaps) note(d(g.target, g.given), g.target, g.given, ['meaning', 'gender', 'article', 'serestar']);

const kinds = Object.keys(counts).sort();
assert.ok(kinds.length >= 5, `mindestens 5 Fehlertypen mit eigenem Hinweis (${kinds.join(', ')})`);
for (const k of ['order', 'gender', 'article', 'serestar', 'missing'] as ErrorKind[]) assert.ok(counts[k] > 0, `Fehlertyp ${k} kommt im Kurs nicht vor`);

if (process.argv.includes('--list')) {
  const order: ErrorKind[] = ['order', 'gender', 'article', 'serestar', 'missing', 'extra', 'meaning'];
  for (const k of order) {
    const list = [...rules.entries()].filter(([, v]) => v.kind === k);
    console.log(`\n## ${KIND_LABEL[k]} (${list.length} verschiedene Hinweise)`);
    for (const [rule, v] of list) console.log(`- ${rule}\n    Beispiel: ${v.example}`);
  }
}
console.log(
  `OK – ${sentences.size} Sätze und ${gaps.length} falsche Lückenwörter geprüft; Hinweise je Fehlertyp: ` +
    `${kinds.map((k) => `${KIND_LABEL[k as ErrorKind]} ${counts[k]}`).join(', ')}; ${rules.size} verschiedene Hinweistexte.`,
);
