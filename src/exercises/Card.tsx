// Karteikarte: vorne Bild + Audio, antippen zum Umdrehen; rechts wischen = „kann ich“, links = „nochmal“.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useApp, vm } from '../context.tsx';
import { SpeakButtons, SpokenText } from '../components/Speakable.tsx';
import type { CardExercise } from '../types.ts';
import { ExHeader, type ExProps } from './common.tsx';
import { modalOpen } from '../lib/dom.ts';

const THRESHOLD = 90;

export function Card({ ex, uid, done, onDone }: ExProps<CardExercise>) {
  const { say, feedback } = useApp();
  const v = vm.get(ex.vocab)!;
  const [flipped, setFlipped] = useState(false);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<null | 'left' | 'right'>(null);
  const start = useRef<{ x: number; id: number; moved: boolean } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => say(v.es, uid), 250);
    return () => clearTimeout(t);
  }, [v.es, uid, say]);

  const rate = (know: boolean) => {
    if (done || leaving) return;
    setLeaving(know ? 'right' : 'left');
    feedback('tap');
    setTimeout(() => onDone({ correct: know, right: know ? [v.id] : [], wrong: know ? [] : [v.id] }), 260);
  };

  useEffect(() => {
    if (done) return;
    const key = (e: KeyboardEvent) => {
      if (modalOpen()) return;
      if (e.key === 'ArrowRight') rate(true);
      else if (e.key === 'ArrowLeft') rate(false);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') setFlipped((f) => !f);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, id: e.pointerId, moved: false };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const d = e.clientX - s.x;
    if (Math.abs(d) > 6) s.moved = true;
    setDx(d);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    if (!s.moved) {
      setFlipped((f) => !f);
      setDx(0);
      return;
    }
    if (dx > THRESHOLD) rate(true);
    else if (dx < -THRESHOLD) rate(false);
    setDx(0);
  };

  const offset = leaving === 'right' ? 600 : leaving === 'left' ? -600 : dx;
  const hint = dx > 30 ? 'know' : dx < -30 ? 'again' : '';

  return (
    <>
      <div className="ex-body">
        <ExHeader kicker={v.gender ? `Neues Wort · ${v.gender === 'm' ? 'maskulin' : 'feminin'}` : 'Neues Wort'} />
        <div className="card-stage">
          <div
            className={`flashcard${flipped ? ' is-flipped' : ''}${hint ? ` hint-${hint}` : ''}${start.current ? ' is-dragging' : ''}`}
            style={{ transform: `translateX(${offset}px) rotate(${offset / 22}deg)` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              start.current = null;
              setDx(0);
            }}
            role="group"
            aria-label="Karteikarte – antippen zum Umdrehen"
          >
            <div className="flashcard-inner">
              <div className="card-face card-front">
                <span className="card-emoji" aria-hidden="true">
                  {v.emoji}
                </span>
                <SpokenText text={v.es} ttsKey={uid} className="card-word" />
                <SpeakButtons text={v.es} ttsKey={uid} />
                <span className="card-tap">Antippen zum Umdrehen</span>
              </div>
              <div className="card-face card-back" aria-hidden={!flipped}>
                <span className="card-de">{v.de}</span>
                <span className="card-word-small" lang="es">
                  {v.es}
                </span>
                <div className="card-example">
                  <SpeakButtons text={v.exEs} ttsKey={`${uid}-ex`} size="sm" hideSlow />
                  <div>
                    <SpokenText text={v.exEs} ttsKey={`${uid}-ex`} className="card-ex-es" />
                    <span className="card-ex-de">{v.exDe}</span>
                  </div>
                </div>
              </div>
            </div>
            <span className="swipe-badge swipe-know" aria-hidden="true">
              Kann ich
            </span>
            <span className="swipe-badge swipe-again" aria-hidden="true">
              Nochmal
            </span>
          </div>
        </div>
      </div>
      {!done && (
        <div className="ex-actions ex-actions-split">
          <button type="button" className="btn btn-soft-bad" onClick={() => rate(false)}>
            ← Nochmal
          </button>
          <button type="button" className="btn btn-soft-good" onClick={() => rate(true)}>
            Kann ich →
          </button>
        </div>
      )}
    </>
  );
}
