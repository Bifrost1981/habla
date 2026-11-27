// Hörgeschichten (WP-08): je Einheit eine kurze Geschichte mit fast nur bekannten Wörtern.
// „Bekannt“ heißt: Das Wort kommt in dieser oder einer früheren Einheit vor (Vokabel, Beispielsatz,
// Übungssatz, Lückenwort oder Satzkachel). Namen gelten als bekannt. Der Rest steht im Glossar der Geschichte.
import { STORIES } from '../content/stories.ts';
import type { Course, Progress } from '../types.ts';

export interface StoryLine {
  es: string;
  de: string;
}
export interface StoryQuestion {
  /** Frage auf Deutsch */
  q: string;
  /** Antworten auf Deutsch; die richtige steht an Stelle `answer` (die Ansicht mischt sie). */
  options: string[];
  answer: number;
}
export interface Story {
  unit: string;
  title: string;
  titleEs: string;
  lines: StoryLine[];
  /** Eigennamen in der Geschichte (zählen als bekannt) */
  names: string[];
  /** Wörter, die noch nicht im Kurs vorkamen, mit Übersetzung */
  glossary: Record<string, string>;
  questions: StoryQuestion[];
}

export { STORIES };

/** Zielbereich bekannter Wörter (Anteil der laufenden Wörter). */
export const COVERAGE_MIN = 0.95;
export const COVERAGE_MAX = 0.98;

export function storyFor(unitId: string): Story | undefined {
  return STORIES.find((s) => s.unit === unitId);
}

/** Wörter eines spanischen Textes: klein geschrieben, ohne Satzzeichen, Akzente bleiben (tú ≠ tu). */
export function storyTokens(s: string): string[] {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[¿?¡!.,;:"“”«»()…]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Alle Wörter, die bis einschließlich dieser Einheit im Kurs vorkommen. */
export function knownWords(course: Course, unitId: string): Set<string> {
  const known = new Set<string>();
  const vm = new Map(course.vocab.map((v) => [v.id, v]));
  const add = (s: string | undefined) => s && storyTokens(s).forEach((w) => known.add(w));
  const end = course.units.findIndex((u) => u.id === unitId);
  if (end < 0) return known;
  for (const unit of course.units.slice(0, end + 1)) {
    for (const lesson of unit.lessons) {
      for (const e of lesson.exercises) {
        const ids: string[] = [];
        switch (e.type) {
          case 'card':
            ids.push(e.vocab);
            break;
          case 'pick':
            ids.push(e.target);
            break;
          case 'match':
            ids.push(...e.vocab);
            break;
          case 'gap':
            add(e.es.replace('___', e.answer));
            ids.push(...e.vocab);
            break;
          case 'build':
          case 'dictation':
            add(e.es);
            e.extra.forEach(add);
            ids.push(...e.vocab);
            break;
          case 'speak':
          case 'say':
            add(e.es);
            ids.push(...e.vocab);
            break;
        }
        for (const id of ids) {
          const v = vm.get(id);
          add(v?.es);
          add(v?.exEs);
        }
      }
    }
  }
  return known;
}

export interface Coverage {
  /** laufende Wörter */
  total: number;
  /** davon bekannt (einschließlich Namen) */
  known: number;
  ratio: number;
  /** unbekannte Wörter (je einmal, in Reihenfolge des ersten Vorkommens) */
  unknown: string[];
}

export function coverage(story: Story, known: Set<string>): Coverage {
  const names = new Set(story.names.flatMap(storyTokens));
  const tokens = story.lines.flatMap((l) => storyTokens(l.es));
  const unknownTokens = tokens.filter((w) => !known.has(w) && !names.has(w));
  const total = tokens.length;
  return {
    total,
    known: total - unknownTokens.length,
    ratio: total ? (total - unknownTokens.length) / total : 0,
    unknown: [...new Set(unknownTokens)],
  };
}

/** Die Geschichte einer Einheit ist offen, wenn alle Lektionen der Einheit abgeschlossen sind. */
export function storyUnlocked(course: Course, progress: Progress, unitId: string): boolean {
  const unit = course.units.find((u) => u.id === unitId);
  return !!unit && unit.lessons.every((l) => progress.lessons[l.id]);
}
