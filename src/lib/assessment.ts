// Lernerfolg messen (WP-10): kurzer Test vor und nach jeder Einheit, getrennt nach Fertigkeit.
// Vor- und Nachtest einer Einheit haben dieselben Aufgaben (fest aus der Einheit gewählt), damit
// der Unterschied die Veränderung zeigt und nicht eine andere Schwierigkeit. Während des Tests
// gibt es kein Feedback, damit der Vortest nicht selbst unterrichtet.
import type { AssessmentAnswer, AssessmentRecord, Course, Progress, Skill, Unit } from '../types.ts';
import { isUnlocked } from './course.ts';
import { checkSpeech, normalize, sameSentence, shuffle, tiles, words } from './text.ts';

export const SKILLS: readonly Skill[] = ['listen', 'recall', 'speak'];
export const SKILL_LABEL: Record<Skill, string> = { listen: 'Hören', recall: 'Abruf', speak: 'Sprechen' };
export const SKILL_TASK: Record<Skill, string> = {
  listen: 'Hör zu: Was bedeutet der Satz?',
  recall: 'Lege den Satz auf Spanisch',
  speak: 'Sag es auf Spanisch',
};
/** Aufgaben je Fertigkeit und Test. */
export const ITEMS_PER_SKILL = 4;
/** Höchstzahl gespeicherter Tests (älteste fallen weg). */
export const ASSESSMENT_MAX = 200;

export interface AssessmentItem {
  skill: Skill;
  es: string;
  de: string;
  /** Hören: drei deutsche Bedeutungen (eine richtig), feste Reihenfolge */
  options: string[];
  /** Abruf: zwei Ablenker-Kacheln, die im Satz nicht vorkommen */
  extra: string[];
}

/** Fester Zufallsgenerator (mulberry32), Startwert aus dem Text. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sätze einer Einheit je Lektion (aus Satz bauen, Diktat, Nachsprechen, Übersetzen-Sprechen), ohne Doppelte. */
export function unitSentences(unit: Unit): { es: string; de: string; lesson: string }[][] {
  const seen = new Set<string>();
  return unit.lessons.map((l) => {
    const out: { es: string; de: string; lesson: string }[] = [];
    for (const e of l.exercises) {
      if (e.type !== 'build' && e.type !== 'dictation' && e.type !== 'speak' && e.type !== 'say') continue;
      const key = words(e.es).join(' ');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ es: e.es, de: e.de, lesson: l.id });
    }
    return out;
  });
}

/**
 * Die Aufgaben einer Einheit: je Fertigkeit `ITEMS_PER_SKILL` verschiedene Sätze, über alle Lektionen verteilt,
 * immer gleich (Startwert = Einheit). Reihenfolge: erst Hören, dann Abruf, dann Sprechen.
 */
export function buildAssessment(course: Course, unitId: string): AssessmentItem[] {
  const unit = course.units.find((u) => u.id === unitId);
  if (!unit) return [];
  const rand = seeded(`habla-test-${unitId}`);
  const perLesson = unitSentences(unit).map((list) => shuffle(list, rand));
  const pool = perLesson.flat();
  // Reihum aus den Lektionen ziehen, damit jede Lektion vorkommt.
  const picked: { es: string; de: string }[] = [];
  const need = ITEMS_PER_SKILL * SKILLS.length;
  for (let round = 0; picked.length < need && perLesson.some((l) => l.length > round); round++) {
    for (const list of perLesson) if (list[round] && picked.length < need) picked.push(list[round]);
  }
  const order = shuffle(picked, rand);
  const vocabWords = [...new Set(pool.flatMap((s) => tiles(s.es).map((w) => w.toLowerCase())))];
  return SKILLS.flatMap((skill, k) =>
    order.slice(k * ITEMS_PER_SKILL, (k + 1) * ITEMS_PER_SKILL).map((s): AssessmentItem => {
      const inS = new Set(words(s.es));
      const others = shuffle(
        pool.filter((o) => o.de !== s.de && !sameSentence(o.es, s.es)).map((o) => o.de),
        rand,
      ).slice(0, 2);
      return {
        skill,
        es: s.es,
        de: s.de,
        options: skill === 'listen' ? shuffle([s.de, ...others], rand) : [],
        extra: skill === 'recall' ? shuffle(vocabWords.filter((w) => !inS.has(normalize(w))), rand).slice(0, 2) : [],
      };
    }),
  );
}

/* ───── Bewertung einzelner Antworten (0 = falsch, 1 = richtig, null = nicht gemessen) ───── */

export const scoreListen = (item: AssessmentItem, chosen: string | null): 0 | 1 => (chosen !== null && chosen === item.de ? 1 : 0);
export const scoreRecall = (item: AssessmentItem, built: string | null): 0 | 1 => (built !== null && sameSentence(built, item.es) ? 1 : 0);
/** Sprechen: bestanden wie in den Übungen (Abgleich ≥ 80 %); `null` = übersprungen oder kein Mikrofon. */
export function scoreSpeak(item: AssessmentItem, alternatives: string[] | null): 0 | 1 | null {
  if (alternatives === null) return null;
  return alternatives.length && checkSpeech(item.es, alternatives).passed ? 1 : 0;
}

/* ───── Auswertung ───── */

export type SkillScores = Record<Skill, number | null>;

/** Anteil richtiger Antworten je Fertigkeit (0–1); `null`, wenn die Fertigkeit nicht gemessen wurde. */
export function skillScores(answers: AssessmentAnswer[]): SkillScores {
  const out = {} as SkillScores;
  for (const s of SKILLS) {
    const measured = answers.filter((a) => a.skill === s && a.score !== null);
    out[s] = measured.length ? measured.reduce((n, a) => n + (a.score ?? 0), 0) / measured.length : null;
  }
  return out;
}

export interface UnitResult {
  unit: Unit;
  pre: AssessmentRecord | null;
  /** alle Nachtests, ältester zuerst */
  posts: AssessmentRecord[];
  /** Veränderung je Fertigkeit in Prozentpunkten (letzter Nachtest minus Vortest); `null`, wenn ein Wert fehlt */
  change: Record<Skill, number | null>;
}

const pct = (x: number) => Math.round(x * 100);

/** Veränderung in Prozentpunkten zwischen zwei Messungen. */
export function changeOf(pre: SkillScores | null, post: SkillScores | null): Record<Skill, number | null> {
  const out = {} as Record<Skill, number | null>;
  for (const s of SKILLS) {
    const a = pre?.[s];
    const b = post?.[s];
    out[s] = a === null || a === undefined || b === null || b === undefined ? null : pct(b) - pct(a);
  }
  return out;
}

export function unitResult(course: Course, records: AssessmentRecord[], unitId: string): UnitResult | null {
  const unit = course.units.find((u) => u.id === unitId);
  if (!unit) return null;
  const mine = records.filter((r) => r.unit === unitId).sort((a, b) => a.at.localeCompare(b.at));
  const pre = mine.find((r) => r.kind === 'pre') ?? null;
  const posts = mine.filter((r) => r.kind === 'post');
  const last = posts[posts.length - 1];
  return {
    unit,
    pre,
    posts,
    change: changeOf(pre ? skillScores(pre.answers) : null, last ? skillScores(last.answers) : null),
  };
}

/** Durchschnittliche Veränderung je Fertigkeit über alle Einheiten mit Vor- und Nachtest. */
export function overallChange(results: UnitResult[]): { units: number; change: Record<Skill, number | null> } {
  const change = {} as Record<Skill, number | null>;
  for (const s of SKILLS) {
    const vals = results.map((r) => r.change[s]).filter((v): v is number => v !== null);
    change[s] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }
  return { units: results.filter((r) => r.pre && r.posts.length).length, change };
}

/* ───── Wann welcher Test angeboten wird ───── */

export interface Availability {
  /** open: noch keine Lektion der Einheit gelernt; done: gemacht; missed: Einheit ohne Vortest begonnen; locked: Einheit noch gesperrt */
  pre: 'open' | 'done' | 'missed' | 'locked';
  /** open: alle Lektionen der Einheit abgeschlossen (beliebig oft); locked: noch nicht */
  post: 'open' | 'locked';
  posts: number;
}

export function availability(course: Course, progress: Progress, unitId: string): Availability {
  const unit = course.units.find((u) => u.id === unitId);
  if (!unit || !unit.lessons.length) return { pre: 'locked', post: 'locked', posts: 0 };
  const mine = progress.assessments.filter((r) => r.unit === unitId);
  const started = unit.lessons.some((l) => progress.lessons[l.id]);
  const finished = unit.lessons.every((l) => progress.lessons[l.id]);
  const pre = mine.some((r) => r.kind === 'pre')
    ? 'done'
    : started
      ? 'missed'
      : isUnlocked(course, progress, unit.lessons[0].id)
        ? 'open'
        : 'locked';
  return { pre, post: finished ? 'open' : 'locked', posts: mine.filter((r) => r.kind === 'post').length };
}

/**
 * Neuen Test anhängen. Ein zweiter Vortest derselben Einheit wird nicht gespeichert.
 * Über der Höchstzahl fallen die ältesten Nachtests weg; Vortests bleiben immer erhalten.
 */
export function addRecord(records: AssessmentRecord[], rec: AssessmentRecord): AssessmentRecord[] {
  if (rec.kind === 'pre' && records.some((r) => r.unit === rec.unit && r.kind === 'pre')) return records;
  return trimRecords([...records, rec]);
}

export function trimRecords(records: AssessmentRecord[]): AssessmentRecord[] {
  let extra = records.length - ASSESSMENT_MAX;
  if (extra <= 0) return records;
  return records.filter((r) => {
    if (extra > 0 && r.kind === 'post') {
      extra -= 1;
      return false;
    }
    return true;
  });
}
