// Lückentext: Wort per Ziehen & Ablegen (Maus oder Finger) in die Lücke – oder einfach antippen.
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useApp } from '../context.tsx';
import { shuffle, normalize } from '../lib/text.ts';
import type { GapExercise } from '../types.ts';
import { CheckBar, ExHeader, type ExProps } from './common.tsx';

interface Drag {
  word: string;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  moving: boolean;
}

export function Gap({ ex, done, onDone }: ExProps<GapExercise>) {
  const { feedback } = useApp();
  const options = useMemo(() => shuffle([ex.answer, ...ex.options]), [ex]);
  const [placed, setPlaced] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState(false);
  const gapRef = useRef<HTMLButtonElement>(null);
  const [before, after] = ex.es.split('___');

  const inGap = (x: number, y: number) => {
    const r = gapRef.current?.getBoundingClientRect();
    if (!r) return false;
    const pad = 24;
    return x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad;
  };

  const place = (w: string) => {
    setPlaced(w);
    feedback('tap');
  };

  const onDown = (e: RPointerEvent<HTMLButtonElement>, word: string) => {
    if (done || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ word, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moving: false });
  };
  const onMove = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moving = drag.moving || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moving });
    setOver(moving && inGap(e.clientX, e.clientY));
  };
  const onUp = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.moving || inGap(e.clientX, e.clientY)) place(drag.word); // Tippen = einsetzen
    setDrag(null);
    setOver(false);
  };

  const check = () => {
    if (!placed) return;
    const ok = normalize(placed) === normalize(ex.answer);
    onDone({ correct: ok, right: ok ? ex.vocab : [], wrong: ok ? [] : ex.vocab, given: ex.es.replace('___', placed) });
  };

  const gapState = done ? (placed && normalize(placed) === normalize(ex.answer) ? 'is-right' : 'is-wrong') : over ? 'is-over' : placed ? 'is-filled' : '';

  return (
    <>
      <div className="ex-body">
        <ExHeader kicker="Fülle die Lücke">
          <p className="ex-prompt-de">{ex.de}</p>
        </ExHeader>
        <p className="gap-sentence" lang="es">
          {before}
          <button
            ref={gapRef}
            type="button"
            className={`gap-slot ${gapState}`}
            disabled={done || !placed}
            onClick={() => setPlaced(null)}
            aria-label={placed ? `${placed} – antippen zum Entfernen` : 'Lücke'}
          >
            {placed ?? ' '}
          </button>
          {after}
        </p>
        <div className="tile-bank" aria-label="Wörter">
          {options.map((w) => (
            <button
              key={w}
              type="button"
              className={`tile${placed === w ? ' is-used' : ''}${drag?.moving && drag.word === w ? ' is-dragging' : ''}`}
              disabled={done || placed === w}
              lang="es"
              onPointerDown={(e) => onDown(e, w)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => {
                setDrag(null);
                setOver(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  place(w);
                }
              }}
            >
              {w}
            </button>
          ))}
        </div>
        {drag?.moving && (
          <div className="tile tile-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
            {drag.word}
          </div>
        )}
      </div>
      {!done && <CheckBar disabled={!placed} onCheck={check} />}
    </>
  );
}
