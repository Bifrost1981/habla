// Geführte Rollenspiele (WP-09): je Einheit ein kurzes Gespräch mit Ziel, regelbasiert ohne KI.
// Lola spricht die Gegenseite, die Lernenden spielen Laura (wie in den Hörgeschichten) und antworten per Mikrofon.
// Eine Antwort gilt, wenn die Spracherkennung zu einer der erlaubten Formulierungen passt (gleiche Toleranz wie
// beim Nachsprechen). Ohne Mikrofon wird die passende Antwort aus drei ausgewählt.
import { ROLEPLAYS } from '../content/roleplays.ts';
import type { Course, Progress } from '../types.ts';
import { seeded } from './generate.ts';
import { checkSpeech, shuffle, words, type SpeechCheck } from './text.ts';

export interface RoleplayTurn {
  /** Was die Gegenseite sagt (fehlt, wenn Laura das Gespräch beginnt) */
  partner?: { es: string; de: string };
  /** Auftrag auf Deutsch: was Laura jetzt sagen soll */
  task: string;
  /** Erlaubte Antworten; die erste ist die Musterantwort (wird als Hörhilfe vorgelesen) */
  answers: string[];
}
export interface Roleplay {
  unit: string;
  title: string;
  /** Ziel des Gesprächs auf Deutsch */
  goal: string;
  /** Wer die Gegenseite spricht, z. B. „Marta, im Sprachcafé“ */
  partner: string;
  turns: RoleplayTurn[];
  /** Letzter Satz der Gegenseite */
  end: { es: string; de: string };
  /** Eigennamen (zählen als bekannt) */
  names: string[];
  /** Neue Wörter der Gegenseite mit Übersetzung (Lauras Antworten enthalten nur bekannte Wörter) */
  glossary: Record<string, string>;
}

export { ROLEPLAYS };

export function roleplayFor(unitId: string): Roleplay | undefined {
  return ROLEPLAYS.find((r) => r.unit === unitId);
}

/**
 * Füllwörter: dürfen fehlen oder anders gehört werden. Alle anderen Wörter einer Antwort sind Inhaltswörter und
 * müssen erkannt werden – sonst gälte „un té con leche“ als Bestellung eines Milchkaffees (beim Nachsprechen
 * genügt ein Anteil von 80 %, im Rollenspiel zählt der Inhalt).
 */
const FILLER = new Set(['por', 'favor', 'el', 'la', 'los', 'las', 'un', 'una', 'y', 'de', 'al', 'en', 'con', 'muy', 'si', 'no', 'mi', 'es']);

/** Einfacher Abstand (Einfügen, Löschen, Ersetzen) zweier normalisierter Wörter. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Inhaltswörter der Antwort, die in keiner Erkennungsvariante vorkommen (ab 5 Buchstaben ist ein Zeichen Abweichung erlaubt). */
export function missingKeyWords(answer: string, heard: string[]): string[] {
  const variants = heard.map((h) => words(h));
  return words(answer).filter(
    (k) => !FILLER.has(k) && !variants.some((hw) => hw.some((w) => w === k || (k.length >= 5 && distance(w, k) <= 1))),
  );
}

/**
 * Bestes Ergebnis über alle erlaubten Antworten eines Zugs; `answer` ist die passendste Formulierung.
 * Bestanden: Übereinstimmung wie beim Nachsprechen und alle Inhaltswörter erkannt.
 */
export function matchTurn(turn: RoleplayTurn, heard: string[]): SpeechCheck & { answer: string } {
  const check = (a: string) => {
    const c = checkSpeech(a, heard);
    return { ...c, passed: c.passed && missingKeyWords(a, heard).length === 0, answer: a };
  };
  let best = check(turn.answers[0]);
  for (const a of turn.answers.slice(1)) {
    const c = check(a);
    if ((c.passed && !best.passed) || (c.passed === best.passed && c.score > best.score)) best = c;
  }
  return best;
}

/**
 * Auswahl ohne Mikrofon: die Musterantwort und zwei Musterantworten anderer Züge (aus diesem und den anderen
 * Rollenspielen), fest gemischt. Liefert die Antworttexte; richtig ist `turn.answers[0]`.
 */
export function choiceOptions(rp: Roleplay, turnIndex: number): string[] {
  const turn = rp.turns[turnIndex];
  const rand = seeded(`roleplay-${rp.unit}-${turnIndex}`);
  const own = rp.turns.filter((_, i) => i !== turnIndex).map((t) => t.answers[0]);
  const others = ROLEPLAYS.filter((r) => r.unit !== rp.unit).flatMap((r) => r.turns.map((t) => t.answers[0]));
  const pool = [...shuffle(own, rand), ...shuffle(others, rand)].filter(
    (a, i, all) => all.indexOf(a) === i && !matchTurn(turn, [a]).passed,
  );
  return shuffle([turn.answers[0], ...pool.slice(0, 2)], rand);
}

/** Das Rollenspiel einer Einheit ist offen, wenn alle Lektionen der Einheit abgeschlossen sind (wie die Geschichte). */
export function roleplayUnlocked(course: Course, progress: Progress, unitId: string): boolean {
  const unit = course.units.find((u) => u.id === unitId);
  return !!unit && unit.lessons.every((l) => progress.lessons[l.id]);
}
