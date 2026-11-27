// Hilfen rund um den Kurs: Nachschlagen, Freischalten, Wiederholung und Ersatzübungen.
import type { BuildExercise, Course, DictationExercise, Exercise, Lesson, Progress, SayExercise, SpeakExercise, Unit, Vocab } from '../types.ts';
import { shuffle, tiles, words } from './text.ts';

export function vocabMap(course: Course): Map<string, Vocab> {
  return new Map(course.vocab.map((v) => [v.id, v]));
}

export function allLessons(course: Course): { unit: Unit; lesson: Lesson; index: number }[] {
  const out: { unit: Unit; lesson: Lesson; index: number }[] = [];
  let index = 0;
  for (const unit of course.units) for (const lesson of unit.lessons) out.push({ unit, lesson, index: index++ });
  return out;
}

/** Eine Lektion ist frei, wenn die vorherige abgeschlossen ist. */
export function isUnlocked(course: Course, progress: Progress, lessonId: string): boolean {
  const list = allLessons(course);
  const i = list.findIndex((l) => l.lesson.id === lessonId);
  if (i <= 0) return true;
  return Boolean(progress.lessons[list[i - 1].lesson.id]);
}

/** Die nächste noch nicht abgeschlossene Lektion. */
export function nextLessonId(course: Course, progress: Progress): string | null {
  const next = allLessons(course).find((l) => !progress.lessons[l.lesson.id]);
  return next ? next.lesson.id : null;
}

/** Alle Vokabel-IDs, die eine Übung abfragt. */
export function exerciseVocab(ex: Exercise): string[] {
  switch (ex.type) {
    case 'pick':
      return [ex.target];
    case 'card':
      return [ex.vocab];
    case 'match':
      return ex.vocab;
    default:
      return ex.vocab;
  }
}

/**
 * Abruf oder Sprechen (statt Auswahl): Satz aus Kacheln legen, Hör-Diktat, Nachsprechen, Übersetzen-Sprechen.
 * Auswahl und Einführung sind Bild-Auswahl, Paare, Lücke mit Vorgaben und Karteikarte.
 * Maßstab für WP-05: in jeder Lektion mindestens die Hälfte (prüft `npm run test:mix`).
 */
export const RETRIEVAL_TYPES: readonly Exercise['type'][] = ['build', 'dictation', 'speak', 'say'];

export function isRetrieval(ex: Exercise): boolean {
  return RETRIEVAL_TYPES.includes(ex.type);
}

/** Anteil der Abruf- und Sprechübungen (0–1). */
export function retrievalShare(exercises: Exercise[]): number {
  return exercises.length ? exercises.filter(isRetrieval).length / exercises.length : 0;
}

/** Zwei Kurswörter als Ablenker-Kacheln, die im Satz nicht vorkommen. */
/** Alle Wörter, die als Ablenker-Kachel vorkommen können: Vokabeln aus einem Wort, ohne Artikel. */
/** Einheit (Index), in der eine Vokabel zuerst geübt wird – Karte, Bildauswahl-Ziel oder Wortbezug einer Übung. */
const unitIndexCache = new WeakMap<Course, Map<string, number>>();
export function vocabUnitIndex(course: Course): Map<string, number> {
  let m = unitIndexCache.get(course);
  if (m) return m;
  m = new Map();
  course.units.forEach((u, i) =>
    u.lessons.forEach((l) =>
      l.exercises.forEach((e) => {
        const ids = e.type === 'card' ? [e.vocab] : e.type === 'pick' ? [e.target] : e.vocab;
        for (const id of ids) if (!m!.has(id)) m!.set(id, i);
      }),
    ),
  );
  unitIndexCache.set(course, m);
  return m;
}

/**
 * Einzelwörter als Ablenker-Kacheln. Mit `maxUnit` nur Wörter, die bis zu dieser Einheit (Index) geübt wurden (F4):
 * Ablenker aus späteren Einheiten wären Wörter, die man noch nie gesehen hat.
 */
export function distractorPool(course: Course, maxUnit = Infinity): string[] {
  const unitOf = vocabUnitIndex(course);
  return course.vocab
    .filter((v) => (unitOf.get(v.id) ?? Infinity) <= maxUnit)
    .map((v) => v.es.replace(/^(el|la|los|las)\s+/i, ''))
    .filter((w) => !w.includes(' ') && !/[¿?¡!]/.test(w));
}

function distractors(es: string, course: Course, rand: () => number, maxUnit = Infinity): string[] {
  const inSentence = new Set(words(es));
  const candidates = distractorPool(course, maxUnit).filter((w) => !inSentence.has(words(w)[0]));
  return shuffle(candidates, rand).slice(0, 2);
}

/** Einheit einer Übung: späteste Einheit ihrer Wörter, sonst die Einheit, in der der Satz vorkommt. */
function exerciseUnit(course: Course, vocabIds: string[], es: string): number {
  const unitOf = vocabUnitIndex(course);
  const known = vocabIds.map((id) => unitOf.get(id)).filter((i): i is number => i !== undefined);
  if (known.length) return Math.max(...known);
  const i = course.units.findIndex((u) => u.lessons.some((l) => l.exercises.some((e) => 'es' in e && e.es === es)));
  return i >= 0 ? i : Infinity;
}

/** Ersatz für eine Sprechübung (Nachsprechen oder Übersetzen-Sprechen), wenn kein Mikrofon verfügbar ist. */
export function speakToBuild(ex: SpeakExercise | SayExercise, course: Course, rand: () => number = Math.random): BuildExercise {
  return {
    type: 'build',
    es: ex.es,
    de: ex.de,
    extra: distractors(ex.es, course, rand, exerciseUnit(course, ex.vocab, ex.es)),
    vocab: ex.vocab,
    fromSpeak: true,
  };
}

/** Übungen für die tägliche Wiederholung aus fälligen Wörtern. */
export function buildReview(course: Course, due: string[], rand: () => number = Math.random): Exercise[] {
  const vm = vocabMap(course);
  const ids = due.filter((id) => vm.has(id)).slice(0, 12);
  const out: Exercise[] = [];
  if (ids.length >= 5) out.push({ type: 'match', vocab: shuffle(ids, rand).slice(0, 5) });
  ids.forEach((id, i) => {
    const v = vm.get(id)!;
    // Abruf überwiegt: Beispielsatz als Hör-Diktat, dann Deutsch → Spanisch sprechen, dann Karteikarte.
    const kind = i % 3;
    if (kind === 0) {
      out.push({ type: 'dictation', es: v.exEs, de: v.exDe, extra: distractors(v.exEs, course, rand, exerciseUnit(course, [id], v.exEs)), vocab: [id] });
    } else if (kind === 1) {
      out.push({ type: 'say', es: v.exEs, de: v.exDe, vocab: [id] });
    } else {
      out.push({ type: 'card', vocab: id });
    }
  });
  return out;
}

/** Kacheln einer Satz-bauen-Übung oder eines Diktats (Lösung + Ablenker, gemischt). */
export function buildTiles(ex: BuildExercise | DictationExercise, rand: () => number = Math.random): string[] {
  return shuffle([...tiles(ex.es), ...ex.extra], rand);
}
