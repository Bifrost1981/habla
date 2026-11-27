// Erzeugt Lektionen aus einer kompakten Beschreibung (Wörter + Beispielsätze).
// So lässt sich der Kurs erweitern, ohne jede Übung von Hand zu schreiben.
import type { Course, Exercise, Gender, Lesson, Unit, Vocab } from '../types.ts';
import { isRetrieval } from './course.ts';
import { normalize, sameSentence, shuffle, words } from './text.ts';

/** [id, spanisch, deutsch, emoji, Beispiel spanisch, Beispiel deutsch] */
export type WordSpec = [string, string, string, string, string, string];
/** [spanisch, deutsch, Lückenwort?, Ablenker für die Lücke?] */
export type SentenceSpec = [string, string, string?, string[]?];

export interface LessonSpec {
  id: string;
  title: string;
  words: WordSpec[];
  sentences: SentenceSpec[];
}
export interface UnitSpec {
  id: string;
  title?: string;
  subtitle?: string;
  emoji?: string;
  lessons: LessonSpec[];
}
export interface MoreContent {
  units: UnitSpec[];
}

const ARTICLE = /^(el|la|los|las)\s+/i;

/** Wort ohne Artikel, z. B. „el café“ → „café“ */
export function stripArticle(es: string): string {
  return es.replace(ARTICLE, '');
}

function genderOf(es: string): Gender {
  const m = es.match(ARTICLE);
  if (!m) return null;
  return /^(el|los)$/i.test(m[1]) ? 'm' : 'f';
}

/** Kleiner deterministischer Zufall, damit eine Lektion immer gleich aufgebaut ist. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toVocab(w: WordSpec): Vocab {
  const [id, es, de, emoji, exEs, exDe] = w;
  return { id, es, de, gender: genderOf(es), emoji, exEs, exDe };
}

/** Welche Lektionswörter kommen in einem Satz vor? */
function vocabInSentence(sentence: string, lessonWords: Vocab[]): string[] {
  const inS = new Set(words(sentence));
  return lessonWords
    .filter((v) => {
      const w = words(stripArticle(v.es));
      return w.length > 0 && w.every((x) => inS.has(x));
    })
    .map((v) => v.id);
}

/** Lückentext: das Wort im Satz durch „___“ ersetzen (nur ganze Wörter). */
export function makeGap(sentence: string, word: string): string | null {
  const parts = sentence.split(/(\s+)/);
  const i = parts.findIndex((p) => p.replace(/[¿?¡!.,;:]/g, '') === word);
  if (i < 0) return null;
  parts[i] = parts[i].replace(word, '___');
  return parts.join('');
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function singleWords(lessonWords: Vocab[]): string[] {
  return lessonWords.map((v) => stripArticle(v.es).replace(/[¿?¡!…]/g, '').trim()).filter((w) => w && !w.includes(' '));
}

export function generateLesson(spec: LessonSpec): { lesson: Lesson; vocab: Vocab[] } {
  const rand = seeded(spec.id);
  const vocab = spec.words.map(toVocab);
  const ids = vocab.map((v) => v.id);
  const singles = singleWords(vocab);

  // 1) Jedes neue Wort einmal einführen: abwechselnd Karteikarte und Bild-Auswahl.
  const intro: Exercise[] = vocab.map((v, i) => {
    if (i % 2 === 0) return { type: 'card', vocab: v.id };
    const others = shuffle(
      vocab.filter((o) => o.id !== v.id && o.emoji !== v.emoji && o.de !== v.de),
      rand,
    ).slice(0, 3);
    return { type: 'pick', target: v.id, options: others.map((o) => o.id) };
  });

  /** Zwei Lektionswörter als Ablenker-Kacheln, die im Satz nicht vorkommen. */
  const extraTiles = (es: string): string[] => {
    const inS = new Set(words(es));
    return shuffle(
      singles.map((w) => w.toLowerCase()).filter((w) => !inS.has(normalize(w))),
      rand,
    ).slice(0, 2);
  };

  // 2) Sätze üben: erst gestützt (Lücke), dann Abruf und Sprechen:
  //    Lücke, Satz bauen, Nachsprechen, Hör-Diktat, Deutsch → Spanisch sprechen.
  const sentenceEx = spec.sentences.map(([es, de, gap, opts], i): Exercise => {
    const sv = vocabInSentence(es, vocab);
    const inS = new Set(words(es));
    const wantGap = gap && i === 0;
    if (wantGap) {
      const masked = makeGap(es, gap);
      if (masked) {
        const capital = gap.charAt(0) === gap.charAt(0).toUpperCase() && gap.charAt(0) !== gap.charAt(0).toLowerCase();
        const pool = opts ?? shuffle(singles.filter((w) => normalize(w) !== normalize(gap) && !inS.has(normalize(w))), rand).slice(0, 2);
        return {
          type: 'gap',
          es: masked,
          de,
          answer: gap,
          options: pool.map((o) => (capital ? capitalize(o) : o)),
          vocab: sv.length ? sv : ids.slice(0, 1),
        };
      }
    }
    if (i === 2) return { type: 'speak', es, de, vocab: sv };
    if (i === 4) return { type: 'say', es, de, vocab: sv };
    if (i === 3) return { type: 'dictation', es, de, extra: extraTiles(es), vocab: sv };
    return { type: 'build', es, de, extra: extraTiles(es), vocab: sv };
  });

  const match: Exercise = { type: 'match', vocab: shuffle(ids, rand).slice(0, 5) };

  // 3) Abruf auffüllen, bis er mindestens die Hälfte der Lektion ausmacht (WP-05):
  //    Beispielsätze der Wörter, abwechselnd als Hör-Diktat und Deutsch → Spanisch sprechen.
  //    Zuerst Wörter, die in keinem Lektionssatz vorkommen. Reichen die Beispielsätze nicht,
  //    kommen Lektionssätze in einer weiteren Form dazu (z. B. erst gebaut, später gesprochen).
  const fixed = [...intro, match, ...sentenceEx];
  const need = fixed.filter((e) => !isRetrieval(e)).length - fixed.filter(isRetrieval).length;
  const covered = new Set(sentenceEx.flatMap((e) => ('vocab' in e && Array.isArray(e.vocab) ? e.vocab : [])));
  const used: string[] = spec.sentences.map((s) => s[0]);
  const fillers: { ex: Exercise; id: string }[] = [];
  const addFiller = (es: string, de: string, id: string, vocabIds: string[]) => {
    const ex: Exercise =
      fillers.length % 2 === 0
        ? { type: 'dictation', es, de, extra: extraTiles(es), vocab: vocabIds }
        : { type: 'say', es, de, vocab: vocabIds };
    fillers.push({ ex, id });
  };
  for (const v of [...vocab.filter((v) => !covered.has(v.id)), ...vocab.filter((v) => covered.has(v.id))]) {
    if (fillers.length >= need) break;
    if (!v.exEs.trim() || used.some((u) => sameSentence(u, v.exEs))) continue;
    used.push(v.exEs);
    addFiller(v.exEs, v.exDe, v.id, [...new Set([v.id, ...vocabInSentence(v.exEs, vocab)])]);
  }
  // Zweite (und notfalls dritte) Form der Lektionssätze: jeweils als Diktat oder gesprochen, was es für den Satz noch nicht gibt.
  const hasForm = (type: 'dictation' | 'say', es: string) =>
    [...sentenceEx, ...fillers.map((f) => f.ex)].some((e) => e.type === type && sameSentence(e.es, es));
  for (let pass = 0; pass < 2 && fillers.length < need; pass++) {
    spec.sentences.forEach(([es, de], i) => {
      if (fillers.length >= need) return;
      const sv = vocabInSentence(es, vocab);
      // Gebaute und Lücken-Sätze zuerst sprechen, gesprochene zuerst als Diktat.
      const order: ('dictation' | 'say')[] = sentenceEx[i].type === 'build' || sentenceEx[i].type === 'gap' ? ['say', 'dictation'] : ['dictation', 'say'];
      const type = order.find((t) => !hasForm(t, es));
      if (!type) return;
      const ex: Exercise = type === 'say' ? { type, es, de, vocab: sv } : { type, es, de, extra: extraTiles(es), vocab: sv };
      // Erst nach allen Einführungen einreihen.
      fillers.push({ ex, id: ids[ids.length - 1] });
    });
  }

  // 4) Mischen: vier Einführungen, Paare, dann abwechselnd Wort, Satz und Abruf eines schon eingeführten Wortes.
  const exercises: Exercise[] = [...intro.slice(0, 4), match];
  const introduced = new Set(ids.slice(0, 4));
  const restIntro = intro.slice(4).map((ex, k) => ({ ex, id: ids[4 + k] }));
  const queue = [...sentenceEx];
  while (restIntro.length || queue.length || fillers.length) {
    if (restIntro.length) {
      const r = restIntro.shift()!;
      exercises.push(r.ex);
      introduced.add(r.id);
    }
    if (queue.length) exercises.push(queue.shift()!);
    const k = fillers.findIndex((f) => introduced.has(f.id));
    if (k >= 0) exercises.push(fillers.splice(k, 1)[0].ex);
  }
  return { lesson: { id: spec.id, title: spec.title, exercises }, vocab };
}

/** Fügt die kompakten Einheiten an den handgeschriebenen Kurs an. */
export function expandCourse(base: Course, more: MoreContent): Course {
  const vocab = [...base.vocab];
  const units: Unit[] = base.units.map((u) => ({ ...u, lessons: [...u.lessons] }));
  for (const us of more.units) {
    const generated = us.lessons.map(generateLesson);
    generated.forEach((g) => vocab.push(...g.vocab));
    const existing = units.find((u) => u.id === us.id);
    if (existing) existing.lessons.push(...generated.map((g) => g.lesson));
    else
      units.push({
        id: us.id,
        title: us.title ?? us.id,
        subtitle: us.subtitle ?? '',
        emoji: us.emoji ?? '📘',
        lessons: generated.map((g) => g.lesson),
      });
  }
  return { vocab, units: linkVocab(units, vocab) };
}

/**
 * Übungen ohne Wortbezug (F5) – etwa „Tengo dos primos.“, wenn kein Lektionswort im Satz steht – bekommen die bis
 * zu ihrer Einheit geübten Wörter, die im Satz vorkommen, notfalls das Wort, dessen Beispielsatz sie sind. Sonst
 * wirkten sie nicht auf die Wiederholungsplanung.
 */
function linkVocab(units: Unit[], vocab: Vocab[]): Unit[] {
  const byId = new Map(vocab.map((v) => [v.id, v]));
  const seen: Vocab[] = [];
  return units.map((u) => {
    const own = new Set<string>();
    u.lessons.forEach((l) =>
      l.exercises.forEach((e) => (e.type === 'card' ? [e.vocab] : e.type === 'pick' ? [e.target] : e.vocab).forEach((id) => own.add(id))),
    );
    const pool = [...seen, ...[...own].map((id) => byId.get(id)).filter((v): v is Vocab => !!v && !seen.includes(v))];
    const lessons = u.lessons.map((l) => ({
      ...l,
      exercises: l.exercises.map((e): Exercise => {
        if (e.type === 'card' || e.type === 'pick' || e.type === 'match' || e.vocab.length) return e;
        const sentence = e.type === 'gap' ? e.es.replace('___', e.answer) : e.es;
        const found = vocabInSentence(sentence, pool);
        // Sonst: Ist der Satz der Beispielsatz eines Wortes („Buenas tardes.“ zu „la tarde“), gehört er zu diesem Wort.
        return { ...e, vocab: found.length ? found : pool.filter((v) => sameSentence(v.exEs, sentence)).map((v) => v.id) };
      }),
    }));
    seen.push(...pool.filter((v) => !seen.includes(v)));
    return { ...u, lessons };
  });
}
