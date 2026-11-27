// Satz bauen: Wortkacheln antippen fügt sie hinzu, erneutes Antippen entfernt sie.
// Als Hör-Diktat: derselbe Ablauf, aber der Satz wird nur vorgelesen (kein Text, keine Übersetzung).
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.tsx';
import { buildTiles } from '../lib/course.ts';
import { sameSentence } from '../lib/text.ts';
import { SpeakButtons } from '../components/Speakable.tsx';
import type { BuildExercise, DictationExercise } from '../types.ts';
import { CheckBar, ExHeader, type ExProps } from './common.tsx';

export function Build({ ex, uid, done, onDone }: ExProps<BuildExercise | DictationExercise>) {
  const { say, feedback } = useApp();
  const dictation = ex.type === 'dictation';

  // Diktat: den Satz beim Öffnen vorlesen.
  useEffect(() => {
    if (!dictation) return;
    const t = setTimeout(() => say(ex.es, uid), 250);
    return () => clearTimeout(t);
  }, [dictation, ex.es, uid, say]);

  const bank = useMemo(() => buildTiles(ex), [ex]);
  const [line, setLine] = useState<number[]>([]); // Indizes in `bank`

  const add = (i: number) => {
    setLine((l) => [...l, i]);
    feedback('tap');
    say(bank[i], `${uid}-tile`);
  };
  const remove = (i: number) => setLine((l) => l.filter((x) => x !== i));

  const sentence = line.map((i) => bank[i]).join(' ');
  const check = () => {
    const ok = sameSentence(sentence, ex.es);
    onDone({ correct: ok, right: ok ? ex.vocab : [], wrong: ok ? [] : ex.vocab, given: sentence });
  };
  const state = done ? (sameSentence(sentence, ex.es) ? 'is-right' : 'is-wrong') : '';

  return (
    <>
      <div className={`ex-body${dictation ? ' dictation' : ''}`}>
        {dictation ? (
          <ExHeader kicker="Hör zu und lege den Satz">
            <div className="dictation-listen">
              <SpeakButtons text={ex.es} ttsKey={uid} size="lg" />
            </div>
          </ExHeader>
        ) : (
          <ExHeader kicker={ex.fromSpeak ? 'Bilde den Satz (statt Sprechen)' : 'Übersetze den Satz'}>
            <p className="ex-prompt-de">{ex.de}</p>
          </ExHeader>
        )}
        <div className={`build-line ${state}`} aria-label="Dein Satz" lang="es">
          {line.length === 0 && (
            <span className="build-placeholder">{dictation ? 'Tippe die Wörter, die du hörst' : 'Tippe die Wörter in der richtigen Reihenfolge'}</span>
          )}
          {line.map((i) => (
            <button key={i} type="button" className="tile tile-in-line" disabled={done} onClick={() => remove(i)}>
              {bank[i]}
            </button>
          ))}
        </div>
        <div className="tile-bank" aria-label="Wörter" lang="es">
          {bank.map((w, i) => (
            <button
              key={i}
              type="button"
              className={`tile${line.includes(i) ? ' is-used' : ''}`}
              disabled={done || line.includes(i)}
              onClick={() => add(i)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      {!done && (
        <CheckBar disabled={line.length === 0} onCheck={check}>
          <button type="button" className="btn btn-ghost" disabled={line.length === 0} onClick={() => setLine((l) => l.slice(0, -1))}>
            Rückgängig
          </button>
        </CheckBar>
      )}
    </>
  );
}
