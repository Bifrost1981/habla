// Push-to-Talk: Gedrückt halten (Finger, Maus oder Leertaste) und sprechen, loslassen beendet.
import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type ListenSession, type SttError } from '../lib/speech.ts';
import type { Dialect } from '../types.ts';
import { IconMic } from './icons.tsx';

export function usePushToTalk(dialect: Dialect, onResult: (alts: string[]) => void, onError: (e: SttError) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [level, setLevel] = useState(0);
  const session = useRef<ListenSession | null>(null);
  const cbs = useRef({ onResult, onError });
  cbs.current = { onResult, onError };

  const start = useCallback(() => {
    if (session.current) return;
    setInterim('');
    setListening(true);
    session.current = listen(dialect, {
      onInterim: setInterim,
      onLevel: setLevel,
      onResult: (alts) => {
        session.current = null;
        setListening(false);
        cbs.current.onResult(alts);
      },
      onError: (e) => {
        session.current = null;
        setListening(false);
        cbs.current.onError(e);
      },
    });
  }, [dialect]);

  const stop = useCallback(() => {
    session.current?.stop();
  }, []);

  useEffect(() => () => session.current?.abort(), []);

  return { listening, interim, level, start, stop };
}

export function MicButton(props: {
  listening: boolean;
  level: number;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  label?: string;
}) {
  const { listening, level } = props;
  const ring = 1 + Math.min(level, 1) * 0.35;
  return (
    <div className="mic-wrap">
      <button
        type="button"
        className={`mic-btn${listening ? ' is-listening' : ''}`}
        disabled={props.disabled}
        aria-pressed={listening}
        aria-label={listening ? 'Aufnahme läuft – loslassen zum Beenden' : 'Gedrückt halten und sprechen'}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          props.onStart();
        }}
        onPointerUp={() => props.onStop()}
        onPointerCancel={() => props.onStop()}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            props.onStart();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            props.onStop();
          }
        }}
      >
        <span className="mic-ring" style={{ transform: `scale(${listening ? ring : 1})` }} aria-hidden="true" />
        <IconMic width={30} height={30} />
      </button>
      <span className="mic-label">{listening ? 'Ich höre zu …' : (props.label ?? 'Halten & sprechen')}</span>
    </div>
  );
}
