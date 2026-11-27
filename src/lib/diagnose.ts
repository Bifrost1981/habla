// Fehlerdiagnose (WP-06): vergleicht eine falsche Antwort mit der Lösung, benennt den Fehlertyp,
// markiert die betroffenen Wörter der Lösung und gibt eine Regel in einem Satz.
// Bewusst zurückhaltend: Ist die Antwort zu weit von der Lösung entfernt, gibt es keinen Hinweis (nur die Lösung).
import type { Course } from '../types.ts';
import { normalize, soundKey, words } from './text.ts';

export type ErrorKind = 'order' | 'gender' | 'article' | 'serestar' | 'missing' | 'extra' | 'meaning';

export const KIND_LABEL: Record<ErrorKind, string> = {
  order: 'Wortstellung',
  gender: 'Geschlecht',
  article: 'Artikel',
  serestar: 'ser oder estar',
  missing: 'Fehlendes Wort',
  extra: 'Wort zu viel',
  meaning: 'Bedeutung',
};

export interface Diagnosis {
  kind: ErrorKind;
  /** Kurzname des Fehlertyps, z. B. „Wortstellung“ */
  label: string;
  /** Regel oder Hinweis in genau einem Satz */
  rule: string;
  /** Betroffene Wörter der Lösung (Index der durch Leerzeichen getrennten Wörter) */
  marks: number[];
}

export interface Lexicon {
  /** Nomen (ohne Artikel, normalisiert) → Geschlecht */
  gender: Map<string, 'm' | 'f'>;
  /** Einzelwort (normalisiert) → deutsche Bedeutung */
  meaning: Map<string, string>;
}

const ARTICLE = /^(el|la|los|las)\s+/i;
/** Weibliche Nomen, die wegen des betonten a- im Singular „el“ bekommen. */
const FEMININE_WITH_EL = new Set(['agua']);

export function makeLexicon(course: Course): Lexicon {
  const gender = new Map<string, 'm' | 'f'>();
  const meaning = new Map<string, string>();
  for (const v of course.vocab) {
    const m = v.es.match(ARTICLE);
    const bare = normalize(v.es.replace(ARTICLE, ''));
    if (!bare || bare.includes(' ')) continue;
    if (m) gender.set(bare, FEMININE_WITH_EL.has(bare) ? 'f' : /^(el|los)$/i.test(m[1]) ? 'm' : 'f');
    if (!meaning.has(bare)) meaning.set(bare, v.de);
  }
  return { gender, meaning };
}

const DEFINITE: Record<string, 'm' | 'f'> = { el: 'm', la: 'f', los: 'm', las: 'f' };
const INDEFINITE: Record<string, 'm' | 'f'> = { un: 'm', una: 'f', unos: 'm', unas: 'f' };
const isArticle = (w: string) => w in DEFINITE || w in INDEFINITE;
/** Wörter mit mehreren Bedeutungen (nein/nicht, ich esse/wie …): keine Übersetzung im Hinweis. */
const AMBIGUOUS = new Set(['no', 'como', 'que', 'si', 'el', 'tu', 'mi', 'te']);
const articleGender = (w: string) => DEFINITE[w] ?? INDEFINITE[w];
const isPlural = (w: string) => w === 'los' || w === 'las' || w === 'unos' || w === 'unas';

/** Formen von ser und estar, je Person an gleicher Stelle. Lösung mit Akzent (so wird „esta“ = diese nicht verwechselt), Antwort normalisiert. */
const SER = ['soy', 'eres', 'es', 'somos', 'sois', 'son'];
const ESTAR = ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'];
const ESTAR_PLAIN = ESTAR.map((w) => normalize(w));

/** Adjektive des Kurses (Stamm ohne Endung -o/-a/-os/-as bzw. ganze Form), für die Regel zur Stellung. */
const ADJECTIVES = new Set([
  'frio', 'caliente', 'rico', 'alto', 'bajo', 'joven', 'mayor', 'simpatico', 'guapo', 'caro', 'barato', 'bonito',
  'rojo', 'azul', 'verde', 'amarillo', 'negro', 'blanco', 'cansado', 'grande', 'pequeno', 'comodo', 'limpio', 'sucio',
  'fresco', 'rapido', 'largo', 'nuevo', 'tranquilo', 'favorito', 'aleman',
]);
function isAdjective(w: string): boolean {
  if (ADJECTIVES.has(w)) return true;
  const base = w.replace(/(os|as|es|a|s)$/, '');
  return ADJECTIVES.has(`${base}o`) || ADJECTIVES.has(base) || ADJECTIVES.has(`${base}e`);
}

/** Nomen nachschlagen, auch im Plural („zapatos“ → „zapato“). */
function nounGender(w: string, lex: Lexicon): 'm' | 'f' | undefined {
  return lex.gender.get(w) ?? lex.gender.get(w.replace(/s$/, '')) ?? lex.gender.get(w.replace(/es$/, ''));
}

/** Unterscheiden sich zwei Wörter nur durch die Endung -o/-a (bzw. -os/-as)? */
function genderPair(a: string, b: string): boolean {
  if (a === b || a.length !== b.length || a.length < 3) return false;
  const strip = (w: string) => w.replace(/(o|a)(s?)$/, '#$2');
  return /(o|a)s?$/.test(a) && /(o|a)s?$/.test(b) && strip(a) === strip(b);
}

type Op = { type: 'same' | 'sub' | 'del' | 'ins'; t: number; g: number };

/** Wortweise Ausrichtung (Levenshtein mit Rückverfolgung). `t`/`g` sind Indizes in Lösung bzw. Antwort. */
function align(tw: string[], gw: string[], eq: (a: string, b: string) => boolean): Op[] {
  const n = tw.length;
  const m = gw.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (eq(tw[i - 1], gw[j - 1]) ? 0 : 1));
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && eq(tw[i - 1], gw[j - 1]) && d[i][j] === d[i - 1][j - 1]) ops.push({ type: 'same', t: --i, g: --j });
    else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) ops.push({ type: 'sub', t: --i, g: --j });
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) ops.push({ type: 'del', t: --i, g: j });
    else ops.push({ type: 'ins', t: i, g: --j });
  }
  return ops.reverse();
}

const quote = (s: string) => `„${s}“`;

/**
 * Diagnose einer falschen Antwort.
 * @param target  richtige Lösung (spanischer Satz)
 * @param given   Antwort (gelegter Satz, Satz mit eingesetztem Lückenwort oder Gehörtes)
 * @param opts.speech  Antwort stammt aus der Spracherkennung: gleich klingende Schreibweisen gelten als gleich,
 *                     und es gibt nur Hinweise zu Grammatik und fehlenden Wörtern (keine zu einzelnen fremden Wörtern).
 */
export function diagnose(target: string, given: string, lex: Lexicon, opts: { speech?: boolean } = {}): Diagnosis | null {
  // Wörter der Lösung, wie die Anzeige sie trennt; leere (nur Satzzeichen) bleiben außen vor.
  const shown = target.split(/\s+/).filter(Boolean);
  const pos: number[] = [];
  const tw: string[] = [];
  shown.forEach((w, i) => {
    const n = normalize(w);
    if (n) {
      tw.push(n);
      pos.push(i);
    }
  });
  const gw = words(given);
  if (!tw.length || !gw.length) return null;
  // Wörter der Antwort in ihrer Schreibweise (mit Akzenten), sofern sie sich eindeutig zuordnen lassen.
  const gShown = given.split(/\s+/).map((w) => w.replace(/[¿?¡!.,;:"“”«»()…]/g, '')).filter((w) => normalize(w));
  const written = (gi: number) => (gShown.length === gw.length ? gShown[gi].toLowerCase() : gw[gi]);
  /** Deutsche Bedeutung aus dem Kurs; mehrdeutige Kurzwörter bleiben ohne Angabe. */
  const gloss = (w: string) => (AMBIGUOUS.has(w) ? undefined : lex.meaning.get(w));
  const eq = opts.speech ? (a: string, b: string) => soundKey(a) === soundKey(b) : (a: string, b: string) => a === b;
  const display = (ti: number) => shown[pos[ti]].replace(/[¿?¡!.,;:"“”«»()…]/g, '');
  /** Wort der Lösung in Kleinschreibung, aber mit Akzenten („él“ ist kein Artikel, „esta“ kein „está“). */
  const exact = (ti: number) => display(ti).toLowerCase();
  const make = (kind: ErrorKind, rule: string, marks: number[]): Diagnosis => ({
    kind,
    label: KIND_LABEL[kind],
    rule,
    marks: [...new Set(marks.map((ti) => pos[ti]))].sort((a, b) => a - b),
  });

  const ops = align(tw, gw, eq);
  const subs = ops.filter((o) => o.type === 'sub');
  const dels = ops.filter((o) => o.type === 'del');
  const inss = ops.filter((o) => o.type === 'ins');
  if (!subs.length && !dels.length && !inss.length) return null; // richtig

  // 1) Wortstellung: dieselben Wörter in anderer Reihenfolge.
  const key = (w: string) => (opts.speech ? soundKey(w) : w);
  if (tw.length === gw.length && [...tw].map(key).sort().join(' ') === [...gw].map(key).sort().join(' ')) {
    const moved = ops.filter((o) => o.type !== 'same' && o.type !== 'ins').map((o) => o.t);
    // Sonderfall Adjektiv vor dem Nomen.
    for (let i = 0; i + 1 < tw.length; i++) {
      const gi = gw.findIndex((w) => eq(tw[i], w));
      if (nounGender(tw[i], lex) && isAdjective(tw[i + 1]) && gi > 0 && eq(gw[gi - 1], tw[i + 1])) {
        return make('order', `Das Adjektiv steht im Spanischen meist hinter dem Nomen: ${quote(`${display(i)} ${display(i + 1)}`)}.`, [i, i + 1]);
      }
    }
    return make('order', 'Alle Wörter stimmen, nur die Reihenfolge nicht: Vergleiche deinen Satz Wort für Wort mit der Lösung.', moved);
  }

  // Zu weit weg von der Lösung: kein Hinweis.
  const same = ops.filter((o) => o.type === 'same').length;
  const errors = subs.length + dels.length + inss.length;
  if (errors > 2 || same * 2 < tw.length) {
    if (!(tw.length <= 2 && errors === 1)) return null;
  }

  // 2) Vertauschte Wörter, nach Aussagekraft: ser/estar, Geschlecht, Artikel, sonst Bedeutung.
  const nounAfter = (ti: number) => {
    for (let k = ti + 1; k < Math.min(tw.length, ti + 3); k++) if (nounGender(tw[k], lex)) return k;
    return -1;
  };
  let meaning: Diagnosis | null = null;
  for (const o of subs) {
    const t = tw[o.t];
    const g = gw[o.g];
    const si = SER.indexOf(exact(o.t));
    const ei = ESTAR.indexOf(exact(o.t));
    if (si >= 0 && ESTAR_PLAIN.indexOf(g) >= 0) {
      return make('serestar', `${quote('ser')} (hier ${quote(display(o.t))}) steht für Name, Herkunft, Beruf, Eigenschaften und Uhrzeit, ${quote('estar')} für Befinden, Zustand und Ort.`, [o.t]);
    }
    if (ei >= 0 && SER.indexOf(g) >= 0) {
      return make('serestar', `${quote('estar')} (hier ${quote(display(o.t))}) steht für Befinden, Zustand und Ort, ${quote('ser')} für Name, Herkunft, Beruf, Eigenschaften und Uhrzeit.`, [o.t]);
    }
    if (isArticle(exact(o.t)) && isArticle(g)) {
      const k = nounAfter(o.t);
      if (articleGender(t) !== articleGender(g) && (t in DEFINITE) === (g in DEFINITE)) {
        if (k >= 0 && FEMININE_WITH_EL.has(tw[k]) && t === 'el') {
          return make('gender', `${quote(display(k))} ist weiblich, bekommt aber vor dem betonten a den Artikel ${quote('el')}: ${quote(`el ${display(k)}`)}.`, [o.t, k]);
        }
        if (k >= 0 && nounGender(tw[k], lex) === articleGender(t)) {
          const g2 = articleGender(t) === 'm' ? 'männlich' : 'weiblich';
          return make('gender', `${quote(display(k))} ist ${g2}, deshalb heißt es ${quote(`${display(o.t).toLowerCase()} ${display(k)}`)}.`, [o.t, k]);
        }
        return make('gender', `Hier muss es ${quote(display(o.t).toLowerCase())} heißen, weil das zugehörige Nomen ${articleGender(t) === 'm' ? 'männlich' : 'weiblich'} ist.`, [o.t]);
      }
      const plural = isPlural(t) ? `${quote('los')} und ${quote('las')} bedeuten „die“ (Mehrzahl), ${quote('unos')} und ${quote('unas')} „einige“` : `${quote('el')} und ${quote('la')} bedeuten „der, die, das“, ${quote('un')} und ${quote('una')} „ein, eine“`;
      return make('article', `${plural}: Hier gehört ${quote(display(o.t).toLowerCase())} hin.`, [o.t]);
    }
    const verbLike = (w: string) => /^(ich|er\/sie|es) /.test(lex.meaning.get(w) ?? '');
    if (genderPair(t, g) && !verbLike(t) && !verbLike(g)) {
      if (nounGender(t, lex)) {
        const female = /as?$/.test(t);
        return make('gender', `${quote(display(o.t))} ist die ${female ? 'weibliche' : 'männliche'} Form, ${quote(written(o.g))} die ${female ? 'männliche' : 'weibliche'}.`, [o.t]);
      }
      return make('gender', `Das Adjektiv richtet sich nach dem Nomen, -o für männlich und -a für weiblich: Hier ist es ${quote(display(o.t))}.`, [o.t]);
    }
    if (!meaning && !opts.speech) {
      const deG = gloss(g);
      const deT = gloss(t);
      meaning = make(
        'meaning',
        deG && deT && deG !== deT
          ? `${quote(written(o.g))} heißt ${quote(deG)}, gesucht war ${quote(display(o.t))} (${deT}).`
          : `Statt ${quote(written(o.g))} gehört hier ${quote(display(o.t))} hin.`,
        [o.t],
      );
    }
  }

  // 3) Fehlende Wörter (ein fehlender Artikel ist ein Artikelfehler).
  if (dels.length) {
    const art = dels.find((o) => isArticle(exact(o.t)));
    const k = art ? nounAfter(art.t) : -1;
    if (art && k >= 0 && dels.length === 1 && !subs.length) {
      return make('article', `Vor ${quote(display(k))} fehlt der Artikel ${quote(display(art.t).toLowerCase())}.`, [art.t]);
    }
    if (!subs.length || opts.speech) {
      const list = dels.map((o) => quote(display(o.t)));
      const de = dels.length === 1 ? gloss(tw[dels[0].t]) : undefined;
      return make(
        'missing',
        dels.length === 1 ? `Es fehlt das Wort ${list[0]}${de ? ` (${de})` : ''}.` : `Es fehlen die Wörter ${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}.`,
        dels.map((o) => o.t),
      );
    }
  }
  if (meaning) return meaning;

  // 4) Überzählige Wörter.
  if (inss.length && !subs.length && !dels.length && !opts.speech) {
    const list = inss.map((o) => quote(written(o.g)));
    return make(
      'extra',
      inss.length === 1 ? `Das Wort ${list[0]} gehört nicht in diesen Satz.` : `Die Wörter ${list.join(' und ')} gehören nicht in diesen Satz.`,
      [],
    );
  }
  return null;
}
