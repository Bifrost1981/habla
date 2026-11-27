export type Gender = 'm' | 'f' | null;

export interface Vocab {
  id: string;
  es: string;
  de: string;
  gender: Gender;
  emoji: string;
  exEs: string;
  exDe: string;
}

/** Wort hören, aus 4 Bildern wählen. `options` sind die 3 Ablenker. */
export interface PickExercise {
  type: 'pick';
  target: string;
  options: string[];
}

/** 5 spanische und 5 deutsche Wörter verbinden. */
export interface MatchExercise {
  type: 'match';
  vocab: string[];
}

/** Lückentext: `es` enthält genau einmal „___“. */
export interface GapExercise {
  type: 'gap';
  es: string;
  de: string;
  answer: string;
  options: string[];
  vocab: string[];
}

/** Satz bauen: deutschen Satz sehen, spanischen Satz aus Kacheln legen. */
export interface BuildExercise {
  type: 'build';
  es: string;
  de: string;
  extra: string[];
  vocab: string[];
  /** Wahr, wenn die Übung als Ersatz für eine Sprechübung erzeugt wurde. */
  fromSpeak?: boolean;
}

/** Nachsprechen: Satz hören und ins Mikrofon sprechen. */
export interface SpeakExercise {
  type: 'speak';
  es: string;
  de: string;
  vocab: string[];
}

/** Hör-Diktat: Satz nur hören (kein Text) und aus Kacheln legen. */
export interface DictationExercise {
  type: 'dictation';
  es: string;
  de: string;
  extra: string[];
  vocab: string[];
}

/** Übersetzen-Sprechen: deutschen Satz sehen und auf Spanisch sagen (ohne Vorlage). */
export interface SayExercise {
  type: 'say';
  es: string;
  de: string;
  vocab: string[];
}

/** Karteikarte mit Selbstbewertung per Wischen. */
export interface CardExercise {
  type: 'card';
  vocab: string;
}

export type Exercise =
  | PickExercise
  | MatchExercise
  | GapExercise
  | BuildExercise
  | SpeakExercise
  | DictationExercise
  | SayExercise
  | CardExercise;

export interface Lesson {
  id: string;
  title: string;
  exercises: Exercise[];
}

export interface Unit {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  lessons: Lesson[];
}

export interface Course {
  vocab: Vocab[];
  units: Unit[];
}

export type Dialect = 'es-ES' | 'es-MX';

export interface Settings {
  dialect: Dialect;
  dailyGoalMin: 5 | 10 | 15;
  /** Sprechtempo der Vorlese-Stimme */
  rate: 'slow' | 'relaxed' | 'normal';
  /** Gewählte Stimme (voiceURI) oder null = automatisch die natürlichste */
  voiceURI: string | null;
  /** „auto“: natürliche Aufnahmen, wenn vorhanden; „device“: immer die Gerätestimme */
  voiceSource: 'auto' | 'device';
  sound: boolean;
  haptics: boolean;
  speechExercises: boolean;
}

/** Planung eines Wortes nach FSRS-6 (siehe src/lib/srs.ts). */
export interface SrsEntry {
  /** Fällig ab diesem Tag (YYYY-MM-DD) */
  due: string;
  /** Tage, nach denen das Wort mit 90 % Wahrscheinlichkeit noch gewusst wird */
  stability: number;
  /** Schwierigkeit 1–10 */
  difficulty: number;
  /** FSRS-Zustand: 0 neu, 1 lernen, 2 wiederholen, 3 neu lernen */
  state: 0 | 1 | 2 | 3;
  reps: number;
  lapses: number;
  seen: number;
  /** Tag der letzten Antwort */
  last: string | null;
}

/** Eine Antwort im Wiederholungsprotokoll (für spätere Anpassung der FSRS-Parameter). */
export interface ReviewLogEntry {
  id: string;
  day: string;
  /** 3 = richtig („Gut“), 1 = falsch („Nochmal“) */
  rating: 1 | 3;
  /** geplantes Intervall in Tagen */
  days: number;
}

export interface LessonRecord {
  accuracy: number;
  completedAt: string;
}

/** Fertigkeit im Vor- und Nachtest (WP-10). */
export type Skill = 'listen' | 'recall' | 'speak';

/** Antwort im Vor- oder Nachtest: 1 richtig, 0 falsch (auch „Weiß ich nicht“), null nicht gemessen. */
export interface AssessmentAnswer {
  skill: Skill;
  es: string;
  score: 0 | 1 | null;
}

export interface AssessmentRecord {
  unit: string;
  kind: 'pre' | 'post';
  /** Zeitpunkt (ISO) */
  at: string;
  answers: AssessmentAnswer[];
}

/** Ergebnis einer Hörgeschichte (WP-08): bestes Ergebnis der Verständnisfragen. */
export interface StoryRecord {
  correct: number;
  total: number;
  /** Zeitpunkt (ISO) */
  at: string;
}

/** Ergebnis eines Rollenspiels (WP-09): bestes Ergebnis. */
export interface RoleplayRecord {
  /** Züge, die ohne Hilfe richtig gesprochen (oder ohne Mikrofon richtig gewählt) wurden */
  spoken: number;
  total: number;
  /** Zeitpunkt (ISO) */
  at: string;
}

export interface Progress {
  onboarded: boolean;
  settings: Settings;
  lessons: Record<string, LessonRecord>;
  srs: Record<string, SrsEntry>;
  reviewLog: ReviewLogEntry[];
  streak: { count: number; lastDay: string | null };
  /** Gelernte Sekunden pro Tag */
  activity: Record<string, number>;
  /** Vor- und Nachtests je Einheit, ältester zuerst */
  assessments: AssessmentRecord[];
  /** Hörgeschichten je Einheit */
  stories: Record<string, StoryRecord>;
  /** Rollenspiele je Einheit */
  roleplays: Record<string, RoleplayRecord>;
}

/** Ergebnis einer einzelnen Übung, wie es die Lektion auswertet. */
export interface ExerciseResult {
  correct: boolean;
  /** Vokabeln, die richtig bzw. falsch waren (für die Wiederholung). */
  right: string[];
  wrong: string[];
  /** Aussprache-Wert 0–1 bei Sprechübungen */
  speechScore?: number;
  /** Die gegebene Antwort als Satz (gelegt, mit eingesetztem Lückenwort oder gehört), für die Fehlerdiagnose. */
  given?: string;
}
