// Wiederholung mit FSRS-6 (Bibliothek ts-fsrs, MIT). Die App rechnet in Kalendertagen:
// Jede Antwort zählt zur Tagesmitte (12:00 UTC), damit Intervalle unabhängig von Uhrzeit und Zeitzone sind.
// Richtig = „Gut“, falsch = „Nochmal“. Lernschritte im Minutenbereich und Zufallsstreuung sind aus,
// damit dieselben Antworten immer dieselben Tagestermine ergeben. Die Kurzzeitformel von FSRS-6 bleibt an:
// Eine zweite Antwort am selben Tag (z. B. Lektion und Wiederholung) ändert die Stabilität wie in der
// Python-Referenz py-fsrs (siehe tests/srs/reference.json).
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { Progress, ReviewLogEntry, SrsEntry } from '../types.ts';

export const FSRS_PARAMS = generatorParameters({ enable_fuzz: false, enable_short_term: true, learning_steps: [], relearning_steps: [] });
const scheduler = fsrs(FSRS_PARAMS);

/** Leitner-Intervalle der Versionen bis 0.3 (nur noch für die Übernahme alter Stände). */
export const LEITNER_INTERVALS = [1, 3, 7, 14, 30];

/** Höchstzahl gespeicherter Wiederholungen (älteste fallen heraus). */
export const REVIEW_LOG_MAX = 5000;

/** Lokales Datum als YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

/** Kalendertag → Zeitpunkt für FSRS (Tagesmitte UTC) und zurück. */
export const dayToDate = (day: string): Date => new Date(`${day}T12:00:00Z`);
export const dateToDay = (d: Date): string => d.toISOString().slice(0, 10);

function toCard(e: SrsEntry): Card {
  return {
    due: dayToDate(e.due),
    stability: e.stability,
    difficulty: e.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: e.reps,
    lapses: e.lapses,
    state: e.state as State,
    last_review: e.last ? dayToDate(e.last) : undefined,
  };
}

export interface ReviewOutcome {
  entry: SrsEntry;
  log: ReviewLogEntry;
}

/** Neue Planung nach einer Antwort. */
export function review(id: string, entry: SrsEntry | undefined, correct: boolean, today: string = dayKey()): ReviewOutcome {
  const now = dayToDate(today);
  const card = entry ? toCard(entry) : createEmptyCard(now);
  const grade: Grade = correct ? Rating.Good : Rating.Again;
  const { card: next } = scheduler.next(card, now, grade);
  const due = dateToDay(next.due);
  return {
    entry: {
      due,
      stability: next.stability,
      difficulty: next.difficulty,
      state: next.state as SrsEntry['state'],
      reps: next.reps,
      lapses: next.lapses,
      seen: (entry?.seen ?? 0) + 1,
      last: today,
    },
    log: { id, day: today, rating: grade === Rating.Good ? 3 : 1, days: next.scheduled_days },
  };
}

/** Wendet die Ergebnisse einer Lektion an. Ein Wort, das einmal falsch war, gilt als falsch. */
export function applyResults(
  srs: Progress['srs'],
  right: string[],
  wrong: string[],
  today: string = dayKey(),
): { srs: Progress['srs']; log: ReviewLogEntry[] } {
  const next = { ...srs };
  const log: ReviewLogEntry[] = [];
  const wrongSet = new Set(wrong);
  for (const id of new Set([...right, ...wrong])) {
    const r = review(id, srs[id], !wrongSet.has(id), today);
    next[id] = r.entry;
    log.push(r.log);
  }
  return { srs: next, log };
}

/** Protokoll anhängen und auf REVIEW_LOG_MAX Einträge begrenzen. */
export function appendLog(log: ReviewLogEntry[], add: ReviewLogEntry[]): ReviewLogEntry[] {
  const all = [...log, ...add];
  return all.length > REVIEW_LOG_MAX ? all.slice(all.length - REVIEW_LOG_MAX) : all;
}

/** Fällige Vokabeln: am längsten fällige zuerst, bei gleichem Tag die unsichersten (geringste Stabilität). */
export function dueVocab(srs: Progress['srs'], today: string = dayKey()): string[] {
  return Object.entries(srs)
    .filter(([, e]) => e.due <= today)
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[1].stability - b[1].stability))
    .map(([id]) => id);
}

/** Schwierigkeit nach einem ersten „Gut“ (für übernommene Leitner-Wörter ohne Fehler). */
const FIRST_GOOD_DIFFICULTY = scheduler.next(createEmptyCard(dayToDate('2000-01-01')), dayToDate('2000-01-01'), Rating.Good).card.difficulty;

/**
 * Übernahme eines Leitner-Eintrags (bis Version 0.3).
 * Der Fälligkeitstag bleibt gleich. Stabilität = Intervall des Fachs: FSRS definiert Stabilität als den
 * Abstand, nach dem man ein Wort mit 90 % Wahrscheinlichkeit noch weiß, und das Intervall eines Fachs
 * ist genau der bisher geplante Abstand. Schwierigkeit: wie nach einem ersten „Gut“, mit früheren
 * Fehlern die Mitte der Skala (5 von 10).
 */
export function fromLeitner(old: { box: number; due: string; lapses: number; seen: number }): SrsEntry {
  const interval = LEITNER_INTERVALS[Math.min(Math.max(old.box, 1), LEITNER_INTERVALS.length) - 1];
  return {
    due: old.due,
    stability: interval,
    difficulty: old.lapses > 0 ? 5 : FIRST_GOOD_DIFFICULTY,
    state: State.Review as SrsEntry['state'],
    reps: old.seen,
    lapses: old.lapses,
    seen: old.seen,
    last: addDays(old.due, -interval),
  };
}

/** Serie nach einer abgeschlossenen Lektion. */
export function bumpStreak(streak: Progress['streak'], today: string = dayKey()): Progress['streak'] {
  if (streak.lastDay === today) return streak;
  if (streak.lastDay === addDays(today, -1)) return { count: streak.count + 1, lastDay: today };
  return { count: 1, lastDay: today };
}

/** Aktuell gültige Serie (verfällt, wenn gestern nicht gelernt wurde). */
export function currentStreak(streak: Progress['streak'], today: string = dayKey()): number {
  if (streak.lastDay === today || streak.lastDay === addDays(today, -1)) return streak.count;
  return 0;
}
