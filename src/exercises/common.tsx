import type { ReactNode } from 'react';
import type { ExerciseResult } from '../types.ts';

export interface ExProps<E> {
  ex: E;
  /** Eindeutiger Schlüssel dieser Übungsinstanz (für Vorlese-Hervorhebung). */
  uid: string;
  done: boolean;
  onDone: (r: ExerciseResult) => void;
}

export function ExHeader(props: { kicker: string; children?: ReactNode }) {
  return (
    <header className="ex-head">
      <p className="ex-kicker">{props.kicker}</p>
      {props.children}
    </header>
  );
}

export function CheckBar(props: { disabled: boolean; onCheck: () => void; children?: ReactNode }) {
  return (
    <div className="ex-actions">
      {props.children}
      <button type="button" className="btn btn-primary btn-wide" disabled={props.disabled} onClick={props.onCheck}>
        Prüfen
      </button>
    </div>
  );
}
