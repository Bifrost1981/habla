// Text-Hilfen: Normalisieren, Zerlegen und toleranter Vergleich gesprochener Antworten (Lautschlüssel + Zeichenähnlichkeit je Wort).

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

/** Zahl 0–100 als spanisches Wort (Spracherkennung liefert oft Ziffern). */
export function spanishNumber(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  if (n === 100) return 'cien';
  if (n < 30) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t];
}

/** Kleinschreibung, Akzente und Satzzeichen entfernen. „¿Cuánto cuesta?“ → „cuanto cuesta“ */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"“”«»()…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalisierte Wörter; Ziffern werden zu spanischen Zahlwörtern. */
export function words(s: string): string[] {
  const n = normalize(s);
  if (!n) return [];
  return n
    .split(' ')
    .flatMap((w) => (/^\d+$/.test(w) ? (normalize(spanishNumber(Number(w)) ?? w).split(' ')) : [w]));
}

/** Wörter für Kacheln: Original-Schreibweise, ohne Satzzeichen. */
export function tiles(s: string): string[] {
  return s
    .replace(/[¿?¡!.,;:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Levenshtein-Distanz auf Wortebene. */
export function wordDistance(a: string[], b: string[]): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * Lautschlüssel eines normalisierten Wortes: gleich klingende Schreibweisen werden gleich.
 * Stummes h, b/v, ll/y, c vor e/i und z wie s, qu und c wie k, g vor e/i wie j, gu vor e/i wie g.
 * Bedeutungstragende Unterschiede (r/rr, n/ñ ist schon durch normalize verloren) bleiben unberührt.
 */
export function soundKey(word: string): string {
  return word
    .replace(/ch/g, '§')
    .replace(/h/g, '')
    .replace(/§/g, 'ch')
    .replace(/ll/g, 'y')
    .replace(/v/g, 'b')
    .replace(/qu(?=[ei])/g, 'k')
    .replace(/c(?=[ei])/g, 's')
    .replace(/z/g, 's')
    .replace(/c(?!h)/g, 'k')
    .replace(/g(?=[ei])/g, 'j')
    .replace(/gu(?=[ei])/g, 'g');
}

function charDistance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Ab dieser Ähnlichkeit zählt ein abweichendes Wort anteilig (bei 4 Buchstaben genau 1 Abweichung). */
export const WORD_CREDIT_MIN = 0.75;

/** Anrechnung 0–1 für ein gehörtes Wort: 1 bei gleichem Lautschlüssel, sonst Zeichenähnlichkeit ab 0,75. */
export function wordCredit(target: string, heard: string): number {
  if (target === heard) return 1;
  const a = soundKey(target);
  const b = soundKey(heard);
  if (a === b) return 1;
  const r = 1 - charDistance(a, b) / Math.max(a.length, b.length);
  return r >= WORD_CREDIT_MIN ? r : 0;
}

interface Alignment {
  score: number;
  /** Anrechnung je Zielwort (0, wenn ausgelassen oder ersetzt). */
  credits: number[];
}

/** Gewichtete Editierdistanz: Ersetzen kostet 1 − Anrechnung, Einfügen und Auslassen je 1. */
function align(target: string, heard: string): Alignment {
  const t = words(target);
  const h = words(heard);
  const len = Math.max(t.length, h.length);
  if (!t.length || !h.length) return { score: 0, credits: t.map(() => 0) };
  const credit = t.map((tw) => h.map((hw) => wordCredit(tw, hw)));
  const dp: number[][] = Array.from({ length: t.length + 1 }, (_, i) =>
    Array.from({ length: h.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1 - credit[i - 1][j - 1]);
    }
  }
  // Rückverfolgung: welches gehörte Wort wurde welchem Zielwort zugeordnet?
  const credits = t.map(() => 0);
  let i = t.length;
  let j = h.length;
  const eps = 1e-9;
  while (i > 0 && j > 0) {
    const c = credit[i - 1][j - 1];
    if (c > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + 1 - c)) < eps) {
      credits[i - 1] = c;
      i--;
      j--;
    } else if (Math.abs(dp[i][j] - (dp[i - 1][j] + 1)) < eps) i--;
    else if (Math.abs(dp[i][j] - (dp[i][j - 1] + 1)) < eps) j--;
    else {
      i--;
      j--;
    }
  }
  return { score: Math.max(0, 1 - dp[t.length][h.length] / len), credits };
}

/** Übereinstimmung 0–1 zwischen Ziel und Gesprochenem (tolerant auf Wortebene, siehe wordCredit). */
export function similarity(target: string, heard: string): number {
  return align(target, heard).score;
}

/**
 * Für jedes Zielwort: wurde es (in der richtigen Reihenfolge) klar gehört?
 * Nur voll angerechnete Wörter gelten als getroffen; fast richtige bleiben markiert.
 */
export function matchedWords(target: string, heard: string): boolean[] {
  return align(target, heard).credits.map((c) => c === 1);
}

export const PASS_THRESHOLD = 0.8;

export interface SpeechCheck {
  score: number;
  passed: boolean;
  matched: boolean[];
  heard: string;
}

/** Bestes Ergebnis über alle Erkennungs-Alternativen. */
export function checkSpeech(target: string, alternatives: string[]): SpeechCheck {
  let best: SpeechCheck = { score: 0, passed: false, matched: words(target).map(() => false), heard: '' };
  for (const alt of alternatives) {
    const { score, credits } = align(target, alt);
    if (score > best.score || !best.heard) {
      best = { score, passed: score >= PASS_THRESHOLD, matched: credits.map((c) => c === 1), heard: alt };
    }
  }
  return best;
}

/** Vergleich gelegter Kacheln mit dem Zielsatz (ohne Groß-/Kleinschreibung und Satzzeichen). */
export function sameSentence(a: string, b: string): boolean {
  return words(a).join(' ') === words(b).join(' ');
}

export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
