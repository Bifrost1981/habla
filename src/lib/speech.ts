// Sprachausgabe (speechSynthesis) und Spracheingabe (SpeechRecognition) über die Web Speech API.
import type { Dialect } from '../types.ts';
import { clipKey, prepareForSpeech, type AudioManifest } from './audioKey.ts';

export { prepareForSpeech };

/* ───────────────────────── Sprachausgabe ───────────────────────── */

export const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Sprechtempo: ruhig ist Standard, die Schildkröte nutzt „slow“. */
export const RATES = { slow: 0.58, relaxed: 0.75, normal: 0.9 } as const;
export type RateName = keyof typeof RATES;

let voices: SpeechSynthesisVoice[] = [];
let voicesVersion = 0;
const voiceListeners = new Set<() => void>();
function refreshVoices() {
  if (!ttsAvailable) return;
  const next = window.speechSynthesis.getVoices();
  if (next.length === voices.length && next.every((v, i) => v === voices[i])) return;
  voices = next;
  voicesVersion += 1;
  voiceListeners.forEach((l) => l());
}
/** Ändert sich, sobald der Browser neue Stimmen meldet (für useSyncExternalStore). */
export const getVoicesVersion = () => voicesVersion;
if (ttsAvailable) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  // Manche Browser liefern die Stimmen erst verzögert.
  setTimeout(refreshVoices, 500);
}
export function subscribeVoices(l: () => void) {
  voiceListeners.add(l);
  return () => voiceListeners.delete(l);
}

const DIALECT_LANGS: Record<Dialect, string[]> = {
  'es-ES': ['es-es'],
  'es-MX': ['es-mx', 'es-us', 'es-419'],
};
const normLang = (l: string) => l.replace('_', '-').toLowerCase();

/** Spaßstimmen von macOS, die auch für Spanisch auftauchen. */
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|eddy|flo|good news|grandma|grandpa|jester|organ|reed|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox)\b/i;
/** Stimmen, die meist warm und natürlich klingen. */
const WARM = /(elvira|ximena|dalia|paulina|marisol|m[oó]nica|luc[ií]a|paloma|abril|beatriz|alvaro|jorge|irene|lola|ana)\b/i;

/** Qualitätspunkte einer Stimme: höher = natürlicher. */
export function voiceScore(v: SpeechSynthesisVoice): number {
  const n = v.name;
  let s = 0;
  if (/natural|neural/i.test(n)) s += 40; // Microsoft Edge „Online (Natural)“
  if (/premium/i.test(n)) s += 35; // Apple Premium
  if (/enhanced|erweitert|mejorad/i.test(n)) s += 28; // Apple Erweitert
  if (/google/i.test(n)) s += 15;
  if (WARM.test(n)) s += 6;
  if (/compact|espeak|e-speak/i.test(n)) s -= 15;
  if (/^microsoft (helena|laura|pablo|sabina|raul)\b/i.test(n) && !/online/i.test(n)) s -= 5; // ältere Windows-Stimmen
  if (NOVELTY.test(n)) s -= 60;
  return s;
}

export function voiceQuality(v: SpeechSynthesisVoice): 'natürlich' | 'gut' | 'einfach' {
  const s = voiceScore(v);
  return s >= 28 ? 'natürlich' : s >= 10 ? 'gut' : 'einfach';
}

/** Lesbarer Name: „Microsoft Dalia Online (Natural) - Spanish (Mexico)“ → „Dalia“ */
export function voiceLabel(v: SpeechSynthesisVoice): string {
  return (
    v.name
      .replace(/^(microsoft|google|apple)\s+/i, '')
      .replace(/\s*online\s*\(natural\)/i, '')
      .replace(/\s*-\s*(spanish|español|spanisch).*$/i, '')
      .replace(/\s*\((premium|enhanced|erweitert|mejorada?)\)/i, '')
      .trim() || v.name
  );
}

/** Alle spanischen Stimmen, die besten zuerst; Stimmen des Dialekts vor anderen. */
export function spanishVoices(dialect: Dialect): SpeechSynthesisVoice[] {
  if (!voices.length && ttsAvailable) voices = window.speechSynthesis.getVoices();
  const wanted = DIALECT_LANGS[dialect];
  return voices
    .filter((v) => normLang(v.lang).startsWith('es') && !NOVELTY.test(v.name))
    .sort((a, b) => {
      const da = wanted.includes(normLang(a.lang)) ? 1 : 0;
      const db = wanted.includes(normLang(b.lang)) ? 1 : 0;
      return db - da || voiceScore(b) - voiceScore(a);
    });
}

/** Gewählte Stimme oder die beste verfügbare für den Dialekt. */
export function pickVoice(dialect: Dialect, voiceURI?: string | null): SpeechSynthesisVoice | null {
  const list = spanishVoices(dialect);
  if (voiceURI) {
    const chosen = list.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  return list[0] ?? null;
}

export interface TtsState {
  /** Schlüssel des Textes, der gerade gesprochen wird (z. B. „ex-3“) */
  key: string | null;
  /** Index des gerade gesprochenen Worts */
  word: number;
}

let state: TtsState = { key: null, word: -1 };
const listeners = new Set<() => void>();
function setState(next: TtsState) {
  state = next;
  listeners.forEach((l) => l());
}
export const ttsStore = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

let timers: number[] = [];
function clearTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}
/** Zählt Aufrufe hoch, damit das Ende einer abgebrochenen Ausgabe die neue nicht stört. */
let generation = 0;
let startTimer = 0;

export interface SpeakOptions {
  dialect: Dialect;
  /** Sprechtempo (0.5–1); Standard: ruhig */
  rate?: number;
  voiceURI?: string | null;
  /** „device“ erzwingt die Gerätestimme, sonst werden vorhandene Aufnahmen bevorzugt. */
  source?: 'auto' | 'device';
  key?: string;
  lang?: string;
  onEnd?: () => void;
}

/** Startpositionen der Wörter (gleiche Zerlegung wie in der Anzeige). */
export function wordStarts(text: string): number[] {
  const starts: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) starts.push(m.index);
  return starts;
}

/* ───── Vorab vertonte Aufnahmen (natürliche Stimme) ───── */

let recordings: AudioManifest | null = null;
let audioEl: HTMLAudioElement | null = null;

/** Lädt public/audio/<dialekt>/manifest.json; fehlt es, bleibt es bei der Gerätestimme. */
export async function loadRecordings(dialect: Dialect): Promise<AudioManifest | null> {
  if (typeof window === 'undefined') return null;
  if (recordings?.dialect === dialect) return recordings;
  let next: AudioManifest | null = null;
  try {
    const res = await fetch(`audio/${dialect}/manifest.json`, { cache: 'no-cache' });
    if (res.ok) {
      const m = (await res.json()) as AudioManifest;
      if (m && m.clips && Object.keys(m.clips).length) next = m;
    }
  } catch {
    /* keine Aufnahmen vorhanden (z. B. Einzeldatei-Version) */
  }
  recordings = next;
  voicesVersion += 1;
  voiceListeners.forEach((l) => l());
  return next;
}

export const getRecordings = () => recordings;

function recordedUrl(text: string, dialect: Dialect): string | null {
  if (!recordings || recordings.dialect !== dialect) return null;
  const file = recordings.clips[clipKey(text)];
  return file ? `audio/${dialect}/${file}` : null;
}

export function hasRecording(text: string, dialect: Dialect): boolean {
  return recordedUrl(text, dialect) !== null;
}

function playRecorded(url: string, text: string, opts: SpeakOptions, gen: number) {
  audioEl ??= new Audio();
  const a = audioEl;
  a.pause();
  a.src = url;
  // Tempo ändern, ohne dass die Stimme höher oder tiefer klingt.
  a.preservesPitch = true;
  a.playbackRate = Math.min(1.4, Math.max(0.6, (opts.rate ?? RATES.relaxed) / RATES.relaxed));
  const key = opts.key ?? null;
  const starts = wordStarts(text);
  const len = Math.max(1, text.length);
  const done = () => {
    if (gen !== generation) return;
    clearTimers();
    setState({ key: null, word: -1 });
    opts.onEnd?.();
  };
  a.onplaying = () => {
    if (gen !== generation) return;
    setState({ key, word: 0 });
    // Wortgrenzen anteilig nach Zeichenposition schätzen (ohne kurze Stille am Anfang und Ende).
    const total = (Number.isFinite(a.duration) ? a.duration : len * 0.07) / a.playbackRate;
    const speech = Math.max(0.2, total - 0.25);
    starts.forEach((s, i) => {
      timers.push(window.setTimeout(() => gen === generation && setState({ key, word: i }), (0.12 + (s / len) * speech) * 1000));
    });
  };
  a.onended = done;
  // Datei fehlt oder ist kaputt: Gerätestimme übernimmt – genau einmal, auch wenn
  // sowohl onerror als auch das abgelehnte play()-Versprechen den Fehler melden.
  let fellBack = false;
  const fallBack = () => {
    if (fellBack || gen !== generation) return;
    fellBack = true;
    speakDevice(text, opts, gen);
  };
  a.onerror = fallBack;
  a.play().catch(fallBack);
}

export function speak(text: string, opts: SpeakOptions): void {
  const gen = ++generation;
  clearTimers();
  clearTimeout(startTimer);
  audioEl?.pause();
  const url = !opts.lang && opts.source !== 'device' ? recordedUrl(text, opts.dialect) : null;
  if (url) {
    if (ttsAvailable) window.speechSynthesis.cancel();
    playRecorded(url, text, opts, gen);
    return;
  }
  speakDevice(text, opts, gen);
}

function speakDevice(text: string, opts: SpeakOptions, gen: number): void {
  if (!ttsAvailable) {
    opts.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  const wasBusy = synth.speaking || synth.pending;
  synth.cancel();

  const u = new SpeechSynthesisUtterance(prepareForSpeech(text));
  u.lang = opts.lang ?? opts.dialect;
  if (!opts.lang) {
    const v = pickVoice(opts.dialect, opts.voiceURI);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
  }
  const rate = opts.rate ?? RATES.relaxed;
  u.rate = rate;
  u.pitch = 1;
  const key = opts.key ?? null;
  const starts = wordStarts(text);
  let gotBoundary = false;

  u.onstart = () => {
    if (gen !== generation) return;
    setState({ key, word: 0 });
    // Nicht jede Stimme meldet Wortgrenzen: Hervorhebung dann grob schätzen.
    const msPerChar = 62 / rate;
    starts.forEach((s, i) => {
      timers.push(
        window.setTimeout(() => {
          if (!gotBoundary && gen === generation) setState({ key, word: i });
        }, s * msPerChar),
      );
    });
  };
  u.onboundary = (e) => {
    if (gen !== generation) return;
    if (e.name && e.name !== 'word') return;
    gotBoundary = true;
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= e.charIndex) idx = i;
    setState({ key, word: idx });
  };
  const done = () => {
    if (gen !== generation) return;
    clearTimers();
    setState({ key: null, word: -1 });
    opts.onEnd?.();
  };
  u.onend = done;
  u.onerror = done;
  // Direkt nach cancel() verschluckt Chrome gern den Anfang: kurz warten, dann sprechen.
  if (wasBusy) startTimer = window.setTimeout(() => gen === generation && synth.speak(u), 90);
  else synth.speak(u);
}

export function stopSpeaking() {
  generation++;
  clearTimeout(startTimer);
  audioEl?.pause();
  if (ttsAvailable) window.speechSynthesis.cancel();
  clearTimers();
  setState({ key: null, word: -1 });
}

/* ───────────────────────── Spracheingabe ───────────────────────── */

// Minimale Typen, da SpeechRecognition (noch) nicht in lib.dom enthalten ist.
interface RecAlternative {
  transcript: string;
  confidence: number;
}
interface RecResult {
  isFinal: boolean;
  length: number;
  [i: number]: RecAlternative;
}
interface RecEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecResult };
}
interface RecErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: RecErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const sttSupported = getCtor() !== null;

export type SttError = 'not-allowed' | 'no-speech' | 'network' | 'unsupported' | 'other';

export interface ListenHandlers {
  onInterim?: (text: string) => void;
  /** Alle Alternativen des Gesprochenen (kann leer sein, wenn nichts gehört wurde). */
  onResult: (alternatives: string[]) => void;
  onError: (error: SttError) => void;
  /** Lautstärke 0–1 für die Pegelanzeige */
  onLevel?: (level: number) => void;
}

export interface ListenSession {
  stop: () => void;
  abort: () => void;
}

/** Push-to-Talk: startet die Aufnahme, `stop()` beim Loslassen liefert das Ergebnis. */
export function listen(dialect: Dialect, h: ListenHandlers): ListenSession {
  const Ctor = getCtor();
  if (!Ctor) {
    h.onError('unsupported');
    return { stop() {}, abort() {} };
  }
  stopSpeaking();
  const rec = new Ctor();
  rec.lang = dialect;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;

  const finals: RecResult[] = [];
  let interim = '';
  let failed = false;
  let finished = false;
  const level = startLevelMeter(h.onLevel);

  rec.onresult = (e) => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finals[i] = r;
      else interim += r[0].transcript;
    }
    const finalText = finals.filter(Boolean).map((r) => r[0].transcript).join(' ');
    h.onInterim?.(`${finalText} ${interim}`.trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return;
    if (e.error === 'no-speech') return; // wird beim Ende als „nichts gehört“ gemeldet
    failed = true;
    level.stop();
    h.onError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'not-allowed' : e.error === 'network' ? 'network' : 'other');
  };
  rec.onend = () => {
    level.stop();
    if (failed || finished) return;
    finished = true;
    const results = finals.filter(Boolean);
    if (!results.length && interim) {
      h.onResult([interim]);
      return;
    }
    // Alternative k = jedes Teilergebnis in seiner k-ten Variante.
    const alts: string[] = [];
    const maxAlt = Math.max(0, ...results.map((r) => r.length));
    for (let k = 0; k < maxAlt; k++) {
      alts.push(results.map((r) => (r[k] ?? r[0]).transcript).join(' ').trim());
    }
    h.onResult(alts.filter(Boolean));
  };

  try {
    rec.start();
  } catch {
    level.stop();
    h.onError('other');
  }
  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* schon beendet */
      }
    },
    abort: () => {
      finished = true;
      level.stop();
      try {
        rec.abort();
      } catch {
        /* schon beendet */
      }
    },
  };
}

/** Pegelanzeige über ein eigenes Mikrofon-Signal (optional; scheitert still). */
function startLevelMeter(onLevel?: (l: number) => void): { stop: () => void } {
  if (!onLevel || !navigator.mediaDevices?.getUserMedia) return { stop() {} };
  let stopped = false;
  let raf = 0;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((s) => {
      if (stopped) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(s);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf = requestAnimationFrame(tick);
      };
      tick();
    })
    .catch(() => {});
  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      onLevel(0);
    },
  };
}
