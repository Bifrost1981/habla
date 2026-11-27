import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const t = await import(root + 'src/lib/text.ts');
const g = await import(root + 'src/lib/generate.ts');
const cs = await import(root + 'src/lib/course.ts');
const srs = await import(root + 'src/lib/srs.ts');
const c = g.expandCourse(JSON.parse(fs.readFileSync(root + 'src/content/course.json', 'utf8')), JSON.parse(fs.readFileSync(root + 'src/content/more.json', 'utf8')));

console.log('## F1 Tilde/Akzent');
for (const [a, b] of [['año', 'ano'], ['tú', 'tu'], ['él', 'el'], ['sí', 'si'], ['está', 'esta'], ['más', 'mas']]) console.log(`  sameSentence(${a},${b}) =`, t.sameSentence(a, b));

console.log('## F2 Lücke/Satzbau: Ablenker, die nach normalize gleich der Lösung sind');
let hits = 0;
for (const u of c.units) for (const l of u.lessons) for (const e of l.exercises) {
  if (e.type === 'gap') for (const o of e.options) if (t.normalize(o) === t.normalize(e.answer)) { hits++; console.log('  gap', l.id, e.answer, 'vs', o); }
  if (e.type === 'build') { const ws = new Set(t.tiles(e.es).map(t.normalize)); for (const x of e.extra) if (ws.has(t.normalize(x))) { hits++; console.log('  build', l.id, JSON.stringify(e.es), 'Ablenker', x); } }
}
console.log('  Treffer:', hits);

console.log('## F3 Sprechschwelle bei kurzen Sätzen');
for (const [s, h] of [['Hola.', 'ola'], ['Buenos días.', 'buenos dias'], ['Buenos días.', 'buenas dias'], ['Me llamo Ana.', 'me llamo ana'], ['Gracias.', 'gracia']]) {
  const r = t.checkSpeech(s, [h]); console.log(`  ${JSON.stringify(s)} gehört ${JSON.stringify(h)} → score ${r.score.toFixed(2)} passed=${r.passed}`);
}

console.log('## F4 Ersatzübung zieht Wörter aus späteren Einheiten');
const firstSpeak = c.units[0].lessons.flatMap((l) => l.exercises).find((e) => e.type === 'speak');
const unit1 = new Set(c.units[0].lessons.flatMap((l) => l.exercises).flatMap((e) => e.type === 'pick' ? [e.target, ...e.options] : e.type === 'card' ? [e.vocab] : e.vocab ?? []));
const words1 = new Set(c.vocab.filter((v) => unit1.has(v.id)).map((v) => v.es.replace(/^(el|la|los|las)\s+/i, '')));
let foreign = 0; const N = 200;
for (let i = 0; i < N; i++) { const b = cs.speakToBuild(firstSpeak, c); if (b.extra.some((x) => !words1.has(x))) foreign++; }
console.log(`  ${JSON.stringify(firstSpeak.es)}: ${foreign}/${N} Ersatzübungen mit Ablenkern, die in Einheit 1 nicht vorkommen; Beispiel`, cs.speakToBuild(firstSpeak, c).extra);

console.log('## F5 Übungen ohne Vokabelbezug (wirken nicht auf die Wiederholung)');
const empty = c.units.flatMap((u) => u.lessons.flatMap((l) => l.exercises.filter((e) => (e.type === 'speak' || e.type === 'build' || e.type === 'gap') && !(e.vocab ?? []).length).map((e) => `${l.id}:${e.type}`)));
console.log('  Anzahl', empty.length, empty.slice(0, 8));

console.log('## F6 Vokabeln, die nie Ziel einer Übung sind');
const used = new Set(); for (const u of c.units) for (const l of u.lessons) for (const e of l.exercises) (e.type === 'pick' ? [e.target] : e.type === 'card' ? [e.vocab] : e.vocab ?? []).forEach((x) => used.add(x));
console.log('  ', c.vocab.filter((v) => !used.has(v.id)).map((v) => `${v.id} (${v.es})`));

console.log('## F7 Wiederholung: Anzahl fälliger Wörter vs. geübte');
const st = {}; const ids = c.vocab.slice(0, 40).map((v) => v.id);
const s2 = srs.applyResults(st, ids, [], '2026-11-01');
const due = srs.dueVocab(s2, '2026-11-14');
const rev = cs.buildReview(c, due);
console.log(`  fällig ${due.length}, Übungen ${rev.length}, abgedeckte Wörter`, new Set(rev.flatMap((e) => e.type === 'pick' ? [e.target] : e.type === 'card' ? [e.vocab] : e.vocab ?? [])).size);
