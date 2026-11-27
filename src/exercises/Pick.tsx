// Bild-Auswahl: Wort hören, aus 4 Bildern wählen.
import { useEffect, useMemo, useState } from 'react';
import { useApp, vm } from '../context.tsx';
import { SpeakButtons } from '../components/Speakable.tsx';
import { shuffle } from '../lib/text.ts';
import type { PickExercise } from '../types.ts';
import { CheckBar, ExHeader, type ExProps } from './common.tsx';

export function Pick({ ex, uid, done, onDone }: ExProps<PickExercise>) {
  const { say } = useApp();
  const target = vm.get(ex.target)!;
  const options = useMemo(() => shuffle([ex.target, ...ex.options]).map((id) => vm.get(id)!), [ex]);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => say(target.es, uid), 250);
    return () => clearTimeout(t);
  }, [target.es, uid, say]);

  const check = () => {
    if (!sel) return;
    const ok = sel === ex.target;
    onDone({ correct: ok, right: ok ? [ex.target] : [], wrong: ok ? [] : [ex.target] });
  };

  return (
    <>
      <div className="ex-body">
        <ExHeader kicker="Was hörst du?">
          <div className="listen-hero">
            <SpeakButtons text={target.es} ttsKey={uid} size="lg" />
          </div>
        </ExHeader>
        <div className="pick-grid" role="radiogroup" aria-label="Antworten">
          {options.map((o) => {
            const state = done ? (o.id === ex.target ? 'is-right' : o.id === sel ? 'is-wrong' : '') : sel === o.id ? 'is-selected' : '';
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={sel === o.id}
                className={`pick-card ${state}`}
                disabled={done}
                onClick={() => setSel(o.id)}
              >
                <span className="pick-emoji" aria-hidden="true">
                  {o.emoji}
                </span>
                <span className="pick-label">{o.de}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!done && <CheckBar disabled={!sel} onCheck={check} />}
    </>
  );
}
