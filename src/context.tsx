import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import courseData from './content/course.json';
import moreData from './content/more.json';
import { expandCourse, type MoreContent } from './lib/generate.ts';
import type { Course, Progress, Vocab } from './types.ts';
import { vocabMap } from './lib/course.ts';
import { makeLexicon } from './lib/diagnose.ts';
import { loadRecordings, RATES, speak, sttSupported, ttsStore } from './lib/speech.ts';
import { playCorrect, playTap, playWrong, vibrate } from './lib/feedback.ts';

/** Handgeschriebene Lektionen plus die aus Wörtern und Sätzen erzeugten. */
export const course: Course = expandCourse(courseData as Course, moreData as unknown as MoreContent);
export const vm: Map<string, Vocab> = vocabMap(course);
/** Nomen-Geschlecht und Wortbedeutungen für die Fehlerhinweise. */
export const lexicon = makeLexicon(course);

export type MicState = 'unknown' | 'ok' | 'unavailable';

interface Ctx {
  progress: Progress;
  update: (fn: (p: Progress) => Progress) => void;
  mic: MicState;
  setMic: (m: MicState) => void;
  /** Spanischen Text vorlesen; `onEnd` nach dem Ende (nicht bei Abbruch durch eine neue Ausgabe). */
  say: (text: string, key?: string, slow?: boolean, onEnd?: () => void) => void;
  feedback: (kind: 'good' | 'bad' | 'tap') => void;
  /** Sprechübungen in dieser Sitzung möglich? */
  canSpeak: boolean;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider(props: {
  progress: Progress;
  update: Ctx['update'];
  mic: MicState;
  setMic: Ctx['setMic'];
  children: ReactNode;
}) {
  const { progress, update, mic, setMic } = props;
  const s = progress.settings;

  const say = useCallback(
    (text: string, key?: string, slow?: boolean, onEnd?: () => void) =>
      speak(text, { dialect: s.dialect, rate: slow ? RATES.slow : RATES[s.rate], voiceURI: s.voiceURI, source: s.voiceSource, key, onEnd }),
    [s.dialect, s.rate, s.voiceURI, s.voiceSource],
  );

  // Vorab vertonte Aufnahmen für den gewählten Dialekt laden (falls vorhanden).
  useEffect(() => {
    loadRecordings(s.dialect);
  }, [s.dialect]);

  const feedback = useCallback(
    (kind: 'good' | 'bad' | 'tap') => {
      if (kind === 'tap') {
        if (s.sound) playTap();
        return;
      }
      if (s.sound) (kind === 'good' ? playCorrect : playWrong)();
      if (s.haptics) vibrate(kind === 'good' ? 25 : [40, 60, 40]);
    },
    [s.sound, s.haptics],
  );

  const canSpeak = s.speechExercises && sttSupported && mic !== 'unavailable';

  const value = useMemo(
    () => ({ progress, update, mic, setMic, say, feedback, canSpeak }),
    [progress, update, mic, setMic, say, feedback, canSpeak],
  );
  return <AppCtx.Provider value={value}>{props.children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider fehlt');
  return c;
}

export function useTts() {
  return useSyncExternalStore(ttsStore.subscribe, ttsStore.get);
}
