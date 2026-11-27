// Nachsprechen: Satz hören, Mikrofon gedrückt halten, sprechen – Feedback pro Wort.
// Als Übersetzen-Sprechen („say“): nur der deutsche Satz ist zu sehen; der spanische Satz wird weder gezeigt
// noch vorgelesen. Nach dem ersten Fehlversuch gibt es ihn als Hörhilfe, nach dem Prüfen als Text.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context.tsx';
import { MicButton, usePushToTalk } from '../components/MicButton.tsx';
import { SpeakButtons, SpokenText } from '../components/Speakable.tsx';
import { checkSpeech } from '../lib/text.ts';
import type { SttError } from '../lib/speech.ts';
import type { SayExercise, SpeakExercise } from '../types.ts';
import { ExHeader, type ExProps } from './common.tsx';
import { modalOpen } from '../lib/dom.ts';

export function Speak({
  ex,
  uid,
  done,
  onDone,
  onSkip,
}: ExProps<SpeakExercise | SayExercise> & { onSkip: (reason: 'skip' | 'unavailable') => void }) {
  const { say, progress, mic, setMic } = useApp();
  const recall = ex.type === 'say';
  const [attempts, setAttempts] = useState(0);
  const [marks, setMarks] = useState<(boolean | null)[] | undefined>(undefined);
  const [heard, setHeard] = useState('');
  const [note, setNote] = useState<string | null>(null);

  // Nachsprechen: Satz zuerst vorlesen. Übersetzen-Sprechen: nichts vorlesen, der Satz soll abgerufen werden.
  useEffect(() => {
    if (recall) return;
    const t = setTimeout(() => say(ex.es, uid), 250);
    return () => clearTimeout(t);
  }, [recall, ex.es, uid, say]);

  const onResult = useCallback(
    (alts: string[]) => {
      if (mic !== 'ok') setMic('ok');
      if (!alts.length) {
        setNote('Ich habe nichts gehört. Halte den Knopf gedrückt, solange du sprichst.');
        return;
      }
      const res = checkSpeech(ex.es, alts);
      setMarks(res.matched);
      setHeard(res.heard);
      if (res.passed) {
        setNote(null);
        onDone({ correct: true, right: ex.vocab, wrong: [], speechScore: res.score });
        return;
      }
      const n = attempts + 1;
      setAttempts(n);
      if (n >= 2) {
        setNote(null);
        say(ex.es, uid);
        onDone({ correct: false, right: [], wrong: ex.vocab, speechScore: res.score, given: res.heard });
      } else if (recall) {
        // Hörhilfe statt Text: einmal vorlesen, dann zweiter Versuch.
        setMarks(undefined);
        setNote('Noch nicht ganz. Hör dir den Satz an und sag ihn dann noch einmal.');
        say(ex.es, uid);
      } else {
        setNote('Fast! Die roten Wörter waren noch nicht klar. Hör noch einmal hin und versuch es erneut.');
      }
    },
    [attempts, ex, mic, onDone, recall, say, setMic, uid],
  );

  const onError = useCallback(
    (e: SttError) => {
      if (e === 'not-allowed' || e === 'unsupported') {
        setMic('unavailable');
        onSkip('unavailable');
      } else if (e === 'network') {
        setNote('Die Spracherkennung braucht eine Internetverbindung. Versuch es gleich noch einmal oder bilde den Satz.');
      } else {
        setNote('Das hat nicht geklappt. Versuch es noch einmal.');
      }
    },
    [onSkip, setMic],
  );

  const ptt = usePushToTalk(progress.settings.dialect, onResult, onError);

  // Leertaste als Push-to-Talk auf dem Desktop.
  useEffect(() => {
    if (done) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || modalOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) ptt.start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (modalOpen()) {
        // Leertaste gehört dem Dialog (Knopf auslösen): nicht abfangen.
        ptt.stop();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      ptt.stop();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [done, ptt.start, ptt.stop]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="ex-body">
        <ExHeader kicker={recall ? 'Sag es auf Spanisch' : 'Sprich nach'}>
          <p className="ex-prompt-de">{ex.de}</p>
        </ExHeader>
        <div className={`speak-card${recall ? ' say-card' : ''}`}>
          {(!recall || done || attempts > 0) && <SpeakButtons text={ex.es} ttsKey={uid} size="lg" />}
          {(!recall || done) && <SpokenText text={ex.es} ttsKey={uid} className="speak-sentence" marks={marks} />}
          {recall && !done && (
            <p className="say-hint">{attempts > 0 ? 'Anhören und noch einmal sagen' : 'Wie sagst du das auf Spanisch?'}</p>
          )}
        </div>
        <p className="heard" aria-live="polite">
          {ptt.listening ? ptt.interim || '…' : heard ? <>Gehört: „{heard}“</> : ' '}
        </p>
        {note && (
          <p className="note" role="status">
            {note}
          </p>
        )}
      </div>
      {!done && (
        <div className="ex-actions ex-actions-mic">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onSkip('skip')}>
            Gerade nicht sprechen
          </button>
          <MicButton
            listening={ptt.listening}
            level={ptt.level}
            onStart={ptt.start}
            onStop={ptt.stop}
            label={attempts === 1 ? 'Noch ein Versuch' : 'Halten & sprechen'}
          />
          <span className="kbd-hint" aria-hidden="true">
            oder <kbd>Leertaste</kbd> halten
          </span>
        </div>
      )}
    </>
  );
}
