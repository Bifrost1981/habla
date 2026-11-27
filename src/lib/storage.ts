// Fortschritt lokal im Browser speichern (kein Konto nötig).
import type { AssessmentAnswer, AssessmentRecord, Progress, SrsEntry } from '../types.ts';
import { trimRecords } from './assessment.ts';
import { fromLeitner, REVIEW_LOG_MAX } from './srs.ts';

const KEY = 'habla.progress.v1';

export const DEFAULT_PROGRESS: Progress = {
  onboarded: false,
  settings: {
    dialect: 'es-ES',
    dailyGoalMin: 10,
    rate: 'relaxed',
    voiceURI: null,
    voiceSource: 'auto',
    sound: true,
    haptics: true,
    speechExercises: true,
  },
  lessons: {},
  srs: {},
  reviewLog: [],
  streak: { count: 0, lastDay: null },
  activity: {},
  assessments: [],
  stories: {},
  roleplays: {},
};

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (x: unknown): x is string => typeof x === 'string' && DAY.test(x);
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const oneOf = <T,>(x: unknown, allowed: readonly T[], fallback: T): T => ((allowed as readonly unknown[]).includes(x) ? (x as T) : fallback);
const bool = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback);

function entries<T>(x: unknown, keep: (key: string, v: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObj(x)) return out;
  for (const [k, v] of Object.entries(x)) {
    const ok = keep(k, v);
    if (ok !== null) out[k] = ok;
  }
  return out;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Ein Planungseintrag: FSRS-Format (ab 0.4) oder Leitner-Format (bis 0.3, wird übernommen). */
function srsEntry(v: unknown): SrsEntry | null {
  if (!isObj(v) || !isDay(v.due)) return null;
  const lapses = isCount(v.lapses) ? v.lapses : 0;
  const seen = isCount(v.seen) ? v.seen : 0;
  if ('stability' in v) {
    if (!isNum(v.stability) || v.stability <= 0 || !isNum(v.difficulty) || v.difficulty < 1 || v.difficulty > 10) return null;
    if (!(v.state === 0 || v.state === 1 || v.state === 2 || v.state === 3)) return null;
    return {
      due: v.due,
      stability: v.stability,
      difficulty: v.difficulty,
      state: v.state,
      reps: isCount(v.reps) ? v.reps : seen,
      lapses,
      seen,
      last: isDay(v.last) ? v.last : null,
    };
  }
  if (isCount(v.box) && v.box >= 1 && v.box <= 5) return fromLeitner({ box: v.box, due: v.due, lapses, seen });
  return null;
}

/** Ein Vor- oder Nachtest: kaputte Antworten fallen weg, ein Test ohne gültige Antwort wird verworfen. */
function assessmentRecord(v: unknown): AssessmentRecord | null {
  if (!isObj(v) || typeof v.unit !== 'string' || !v.unit || (v.kind !== 'pre' && v.kind !== 'post')) return null;
  if (typeof v.at !== 'string' || Number.isNaN(Date.parse(v.at)) || !Array.isArray(v.answers)) return null;
  const answers = v.answers
    .filter(
      (a): a is AssessmentAnswer =>
        isObj(a) &&
        (a.skill === 'listen' || a.skill === 'recall' || a.skill === 'speak') &&
        typeof a.es === 'string' &&
        (a.score === 0 || a.score === 1 || a.score === null),
    )
    .map(({ skill, es, score }) => ({ skill, es, score }));
  return answers.length ? { unit: v.unit, kind: v.kind, at: v.at, answers } : null;
}

/**
 * Gespeicherten Stand prüfen und reparieren: Unbekannte oder kaputte Felder fallen auf den
 * Standard zurück, kaputte Einträge werden verworfen, gültige bleiben erhalten.
 */
export function sanitizeProgress(raw: unknown): Progress {
  const d = structuredClone(DEFAULT_PROGRESS);
  if (!isObj(raw)) return d;
  const s = isObj(raw.settings) ? raw.settings : {};
  const ds = d.settings;
  const settings: Progress['settings'] = {
    dialect: oneOf(s.dialect, ['es-ES', 'es-MX'] as const, ds.dialect),
    dailyGoalMin: oneOf(s.dailyGoalMin, [5, 10, 15] as const, ds.dailyGoalMin),
    // Ältere Version 0.1 kannte nur „langsam an/aus“.
    rate: s.slowByDefault === true ? 'slow' : oneOf(s.rate, ['slow', 'relaxed', 'normal'] as const, ds.rate),
    voiceURI: typeof s.voiceURI === 'string' ? s.voiceURI : null,
    voiceSource: oneOf(s.voiceSource, ['auto', 'device'] as const, ds.voiceSource),
    sound: bool(s.sound, ds.sound),
    haptics: bool(s.haptics, ds.haptics),
    speechExercises: bool(s.speechExercises, ds.speechExercises),
  };
  const lessons = entries(raw.lessons, (_, v) =>
    isObj(v) && typeof v.accuracy === 'number' && v.accuracy >= 0 && v.accuracy <= 1 && typeof v.completedAt === 'string'
      ? { accuracy: v.accuracy, completedAt: v.completedAt }
      : null,
  );
  const srs = entries(raw.srs, (_, v) => srsEntry(v));
  const reviewLog = (Array.isArray(raw.reviewLog) ? raw.reviewLog : [])
    .filter(
      (x): x is Progress['reviewLog'][number] =>
        isObj(x) && typeof x.id === 'string' && isDay(x.day) && (x.rating === 1 || x.rating === 3) && isCount(x.days),
    )
    .map(({ id, day, rating, days }) => ({ id, day, rating, days }))
    .slice(-REVIEW_LOG_MAX);
  const st = isObj(raw.streak) ? raw.streak : {};
  const streak = isCount(st.count) && (st.lastDay === null || isDay(st.lastDay)) ? { count: st.count, lastDay: st.lastDay } : d.streak;
  const activity = entries(raw.activity, (k, v) => (isDay(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null));
  const assessments: AssessmentRecord[] = [];
  for (const x of Array.isArray(raw.assessments) ? raw.assessments : []) {
    const r = assessmentRecord(x);
    // Je Einheit zählt nur der erste Vortest.
    if (r && !(r.kind === 'pre' && assessments.some((o) => o.unit === r.unit && o.kind === 'pre'))) assessments.push(r);
  }
  const stories = entries(raw.stories, (_, v) =>
    isObj(v) && isCount(v.total) && v.total > 0 && isCount(v.correct) && v.correct <= v.total && typeof v.at === 'string' && !Number.isNaN(Date.parse(v.at))
      ? { correct: v.correct, total: v.total, at: v.at }
      : null,
  );
  const roleplays = entries(raw.roleplays, (_, v) =>
    isObj(v) && isCount(v.total) && v.total > 0 && isCount(v.spoken) && v.spoken <= v.total && typeof v.at === 'string' && !Number.isNaN(Date.parse(v.at))
      ? { spoken: v.spoken, total: v.total, at: v.at }
      : null,
  );
  return {
    onboarded: bool(raw.onboarded, false),
    settings,
    lessons,
    srs,
    reviewLog,
    streak,
    activity,
    assessments: trimRecords(assessments),
    stories,
    roleplays,
  };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROGRESS);
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_PROGRESS);
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Speicher nicht verfügbar (z. B. privates Fenster): App läuft trotzdem weiter.
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}
