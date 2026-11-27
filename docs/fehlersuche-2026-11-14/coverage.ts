// Welche Texte kann die App vorlesen, die make-audio.ts NICHT vertont?
import fs from 'node:fs';
const R = new URL('../../', import.meta.url).pathname;
const { expandCourse, stripArticle } = await import(R + 'src/lib/generate.ts');
const { tiles, words } = await import(R + 'src/lib/text.ts');
const { clipKey } = await import(R + 'src/lib/audioKey.ts');
const { FIXED_PHRASES } = await import(R + 'src/content/phrases.ts');
const c = expandCourse(JSON.parse(fs.readFileSync(R + 'src/content/course.json', 'utf8')), JSON.parse(fs.readFileSync(R + 'src/content/more.json', 'utf8')));
// Nachbau von collectTexts aus scripts/make-audio.ts (1:1)
const set = new Set<string>(); const add = (t?: string) => t && t.trim() && set.add(t.trim());
const vm = new Map(c.vocab.map((v) => [v.id, v]));
for (const v of c.vocab) { add(v.es); add(v.exEs); for (const w of tiles(stripArticle(v.es))) add(w); }
for (const u of c.units) for (const l of u.lessons) for (const e of l.exercises) {
  if (e.type === 'pick') add(vm.get(e.target)?.es);
  if (e.type === 'gap') add(e.es.replace('___', e.answer));
  if (e.type === 'build') { add(e.es); tiles(e.es).forEach(add); e.extra.forEach(add); }
  if (e.type === 'speak') { add(e.es); tiles(e.es).forEach(add); }
}
FIXED_PHRASES.forEach(add);
const keys = new Set([...set].map(clipKey));
// Was die App zusätzlich sagen kann: Kacheln der Wiederholungs-Ersatzübung (Beispielsatz als „Satz bauen“)
const missing = new Set<string>();
for (const v of c.vocab) for (const t of tiles(v.exEs)) if (!keys.has(clipKey(t))) missing.add(t);
// Ablenker der Ersatzübung (speakToBuild): Vokabel ohne Artikel
for (const v of c.vocab) { const w = v.es.replace(/^(el|la|los|las)\s+/i, ''); if (!w.includes(' ') && !/[¿?¡!]/.test(w) && !keys.has(clipKey(w))) missing.add(w); }
console.log('Texte im Vertonungsskript:', set.size, '| vorlesbar, aber nicht vertont:', missing.size, [...missing].slice(0, 12));
