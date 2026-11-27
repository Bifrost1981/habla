// Eine Lektion: Schleife aus Übung → Prüfen → Feedback; Fehler kommen ans Ende der Lektion.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { course, lexicon, useApp, vm } from '../context.tsx';
import { newKey, Speakable } from '../components/Speakable.tsx';
import { IconClose } from '../components/icons.tsx';
import { speakToBuild } from '../lib/course.ts';
import { diagnose } from '../lib/diagnose.ts';
import { stopSpeaking } from '../lib/speech.ts';
import type { Exercise, ExerciseResult } from '../types.ts';
import { Pick } from '../exercises/Pick.tsx';
import { Match } from '../exercises/Match.tsx';
import { Gap } from '../exercises/Gap.tsx';
import { Build } from '../exercises/Build.tsx';
import { Speak } from '../exercises/Speak.tsx';
import { Card } from '../exercises/Card.tsx';

interface Item {
  ex: Exercise;
  uid: string;
  attempt: number;
  original: boolean;
}

export interface LessonSummary {
  accuracy: number;
  right: string[];
  wrong: string[];
  speechAvg: number | null;
  seconds: number;
}

const MAX_REPEATS = 2;
const PRAISE = ['¡Muy bien!', '¡Perfecto!', '¡Genial!', '¡Eso es!', '¡Excelente!'];

function solutionOf(ex: Exercise): { es: string; de: string } | null {
  switch (ex.type) {
    case 'pick': {
      const v = vm.get(ex.target)!;
      return { es: v.es, de: v.de };
    }
    case 'gap':
      return { es: ex.es.replace('___', ex.answer), de: ex.de };
    case 'build':
    case 'dictation':
    case 'speak':
    case 'say':
      return { es: ex.es, de: ex.de };
    default:
      return null;
  }
}

export function LessonScreen(props: {
  title: string;
  exercises: Exercise[];
  onExit: (seconds: number) => void;
  onFinish: (s: LessonSummary) => void;
}) {
  const { canSpeak, feedback, say } = useApp();
  const startedAt = useRef(Date.now());
  const [micNotice, setMicNotice] = useState(false);
  const [queue, setQueue] = useState<Item[]>(() =>
    props.exercises.map((ex) => ({
      ex: (ex.type === 'speak' || ex.type === 'say') && !canSpeak ? speakToBuild(ex, course) : ex,
      uid: newKey('ex'),
      attempt: 0,
      original: true,
    })),
  );
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  // Zeitgeber für das Vorlesen der Lösung: beim Weiterschalten und Verlassen löschen,
  // sonst spricht die alte Lösung über die nächste Übung.
  const solutionTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(solutionTimer.current), []);
  const stats = useRef({ firstTry: 0, originals: props.exercises.length, right: [] as string[], wrong: [] as string[], speech: [] as number[] });
  const praise = useMemo(() => PRAISE[index % PRAISE.length], [index]);

  const item = queue[index];
  const seconds = () => Math.min(Math.round((Date.now() - startedAt.current) / 1000), 30 * 60);

  const next = useCallback(() => {
    window.clearTimeout(solutionTimer.current);
    stopSpeaking();
    setResult(null);
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      return;
    }
    const s = stats.current;
    props.onFinish({
      accuracy: s.originals ? s.firstTry / s.originals : 1,
      right: s.right,
      wrong: s.wrong,
      speechAvg: s.speech.length ? s.speech.reduce((a, b) => a + b, 0) / s.speech.length : null,
      seconds: seconds(),
    });
  }, [index, queue.length, props]);

  const onDone = useCallback(
    (r: ExerciseResult) => {
      const s = stats.current;
      if (item.original && r.correct) s.firstTry += 1;
      s.right.push(...r.right);
      s.wrong.push(...r.wrong);
      if (r.speechScore !== undefined) s.speech.push(r.speechScore);
      if (!r.correct && item.attempt < MAX_REPEATS) {
        setQueue((q) => [...q, { ex: item.ex, uid: newKey('ex'), attempt: item.attempt + 1, original: false }]);
      }
      // Karteikarten bewertet man selbst: direkt weiter, ohne Feedback-Leiste.
      if (item.ex.type === 'card') {
        setResult(r);
        setTimeout(() => {
          setResult(null);
          setIndex((i) => i + 1);
        }, 0);
        return;
      }
      feedback(r.correct ? 'good' : 'bad');
      setResult(r);
      const sol = solutionOf(item.ex);
      // Sprechübungen lesen die Lösung selbst vor; nach richtigem Übersetzen-Sprechen kommt sie als Vorbild.
      const speaksItself = item.ex.type === 'speak' || (item.ex.type === 'say' && !r.correct);
      if (sol && !speaksItself) solutionTimer.current = window.setTimeout(() => say(sol.es, `${item.uid}-sol`), 350);
    },
    [item, feedback, say],
  );

  // Karteikarte als letzte Übung: nach dem Weiterschalten die Lektion beenden.
  useEffect(() => {
    if (index >= queue.length && queue.length > 0) {
      setIndex(queue.length - 1);
      next();
    }
  }, [index, queue.length, next]);

  const onSkipSpeech = useCallback(
    (reason: 'skip' | 'unavailable') => {
      stopSpeaking();
      if (reason === 'unavailable') setMicNotice(true);
      setQueue((q) =>
        q.map((it, i) =>
          i >= index && (it.ex.type === 'speak' || it.ex.type === 'say') ? { ...it, ex: speakToBuild(it.ex, course), uid: newKey('ex') } : it,
        ),
      );
    },
    [index],
  );

  // Enter = Weiter, wenn die Feedback-Leiste offen ist.
  useEffect(() => {
    if (!result || confirmQuit || item?.ex.type === 'card') return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [result, confirmQuit, next, item]);

  useEffect(() => () => stopSpeaking(), []);

  if (!item) return null;
  const done = result !== null;
  const progress = (index + (done ? 1 : 0)) / queue.length;
  const sol = solutionOf(item.ex);
  // Fehlerhinweis (WP-06): Fehlertyp, betroffene Wörter der Lösung und eine Regel in einem Satz.
  const speech = item.ex.type === 'speak' || item.ex.type === 'say';
  const diag = result && !result.correct && sol && result.given ? diagnose(sol.es, result.given, lexicon, { speech }) : null;
  const common = { uid: item.uid, done, onDone };

  return (
    <div className="screen lesson">
      <header className="lesson-top">
        <button type="button" className="icon-btn" onClick={() => setConfirmQuit(true)} aria-label="Lektion verlassen">
          <IconClose />
        </button>
        <div
          className="progress"
          role="progressbar"
          aria-label={`Fortschritt ${props.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span className="progress-fill" style={{ width: `${Math.max(progress * 100, 4)}%` }} />
        </div>
        {item.attempt > 0 && <span className="repeat-chip">Wiederholung</span>}
      </header>

      {micNotice && (
        <p className="banner" role="status">
          Kein Mikrofon verfügbar. Sprechübungen werden durch „Satz bauen“ ersetzt.
          <button type="button" className="banner-close" onClick={() => setMicNotice(false)} aria-label="Hinweis schließen">
            <IconClose width={18} height={18} />
          </button>
        </p>
      )}

      <main className="ex" key={item.uid}>
        {item.ex.type === 'pick' && <Pick ex={item.ex} {...common} />}
        {item.ex.type === 'match' && <Match ex={item.ex} {...common} />}
        {item.ex.type === 'gap' && <Gap ex={item.ex} {...common} />}
        {(item.ex.type === 'build' || item.ex.type === 'dictation') && <Build ex={item.ex} {...common} />}
        {(item.ex.type === 'speak' || item.ex.type === 'say') && <Speak ex={item.ex} {...common} onSkip={onSkipSpeech} />}
        {item.ex.type === 'card' && <Card ex={item.ex} {...common} />}

        {done && item.ex.type !== 'card' && (
          <div className={`sheet ${result.correct ? 'sheet-good' : 'sheet-bad'}`} role="status" aria-live="assertive">
            <div className="sheet-text">
              <p className="sheet-title">{result.correct ? praise : 'Richtige Lösung'}</p>
              {sol && (
                <div className="sheet-solution">
                  <Speakable text={sol.es} ttsKey={`${item.uid}-sol`} size="sm" highlight={diag?.marks} />
                  <span className="sheet-de">{sol.de}</span>
                </div>
              )}
              {diag && (
                <p className="sheet-rule" data-kind={diag.kind}>
                  <span className="sheet-rule-kind">{diag.label}</span> {diag.rule}
                </p>
              )}
              {!result.correct && item.attempt < MAX_REPEATS && <p className="sheet-note">Kommt am Ende der Lektion noch einmal.</p>}
            </div>
            <button type="button" className="btn btn-primary btn-wide" onClick={next} autoFocus>
              Weiter
            </button>
          </div>
        )}
      </main>

      {confirmQuit && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="quit-title">
          <div className="dialog">
            <p id="quit-title" className="dialog-title">
              Lektion beenden?
            </p>
            <p>Dein Fortschritt in dieser Lektion wird nicht gespeichert.</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => props.onExit(seconds())}>
                Beenden
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setConfirmQuit(false)} autoFocus>
                Weiterlernen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
