// Paare verbinden: spanisches Wort antippen (wird vorgelesen), dann die deutsche Bedeutung.
import { useMemo, useState } from 'react';
import { useApp, vm } from '../context.tsx';
import { shuffle } from '../lib/text.ts';
import type { MatchExercise } from '../types.ts';
import { ExHeader, type ExProps } from './common.tsx';

export function Match({ ex, uid, done, onDone }: ExProps<MatchExercise>) {
  const { say, feedback } = useApp();
  const left = useMemo(() => shuffle(ex.vocab), [ex]);
  const right = useMemo(() => shuffle(ex.vocab), [ex]);
  const [selL, setSelL] = useState<string | null>(null);
  const [selR, setSelR] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [shake, setShake] = useState<string | null>(null);
  const [missed, setMissed] = useState<string[]>([]);

  const tryPair = (l: string | null, r: string | null) => {
    if (!l || !r) return;
    if (l === r) {
      const next = [...matched, l];
      setMatched(next);
      feedback('tap');
      setSelL(null);
      setSelR(null);
      if (next.length === ex.vocab.length) {
        const wrong = Array.from(new Set(missed));
        onDone({ correct: wrong.length <= 1, right: ex.vocab.filter((v) => !wrong.includes(v)), wrong });
      }
    } else {
      setMissed((m) => [...m, l]);
      setShake(`${l}|${r}`);
      feedback('bad');
      setTimeout(() => {
        setShake(null);
        setSelL(null);
        setSelR(null);
      }, 450);
    }
  };

  const cls = (side: 'l' | 'r', id: string) => {
    const sel = side === 'l' ? selL : selR;
    const isShake = shake && (side === 'l' ? shake.startsWith(`${id}|`) : shake.endsWith(`|${id}`));
    return ['match-tile', matched.includes(id) ? 'is-matched' : '', sel === id ? 'is-selected' : '', isShake ? 'is-shake' : '']
      .filter(Boolean)
      .join(' ');
  };

  return (
    <div className="ex-body">
      <ExHeader kicker="Finde die Paare">
        <p className="ex-hint">Tippe ein spanisches Wort und dann seine Bedeutung.</p>
      </ExHeader>
      <div className="match-grid">
        <div className="match-col" lang="es">
          {left.map((id) => (
            <button
              key={id}
              type="button"
              className={cls('l', id)}
              disabled={done || matched.includes(id)}
              onClick={() => {
                say(vm.get(id)!.es, `${uid}-${id}`);
                setSelL(id);
                tryPair(id, selR);
              }}
            >
              {vm.get(id)!.es}
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((id) => (
            <button
              key={id}
              type="button"
              className={cls('r', id)}
              disabled={done || matched.includes(id)}
              onClick={() => {
                setSelR(id);
                tryPair(selL, id);
              }}
            >
              {vm.get(id)!.de}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
