// Lektionsende: Genauigkeit, geübte Wörter, Aussprache und Serie.
import { useEffect } from 'react';
import { useApp, vm } from '../context.tsx';
import { IconFlame } from '../components/icons.tsx';
import { playFinish } from '../lib/feedback.ts';
import type { LessonSummary } from './LessonScreen.tsx';
import { RESULT_HEADLINES } from '../content/phrases.ts';

export function ResultScreen(props: { title: string; summary: LessonSummary; streak: number; onContinue: () => void }) {
  const { progress, say } = useApp();
  const { summary } = props;
  const pct = Math.round(summary.accuracy * 100);
  const words = Array.from(new Set([...summary.right, ...summary.wrong]));
  const weak = new Set(summary.wrong);
  const headline = RESULT_HEADLINES[pct >= 90 ? 0 : pct >= 70 ? 1 : 2];

  useEffect(() => {
    if (progress.settings.sound) playFinish();
    const t = setTimeout(() => say(headline, 'result'), 500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen result">
      <div className="result-hero">
        <p className="result-kicker">{props.title} geschafft</p>
        <p className="result-title" lang="es">
          {headline}
        </p>
      </div>
      <dl className="stats">
        <div className="stat">
          <dt>Genauigkeit</dt>
          <dd>{pct} %</dd>
        </div>
        <div className="stat">
          <dt>Wörter geübt</dt>
          <dd>{words.length}</dd>
        </div>
        <div className="stat">
          <dt>Aussprache</dt>
          <dd>{summary.speechAvg === null ? '–' : `${Math.round(summary.speechAvg * 100)} %`}</dd>
        </div>
        <div className="stat stat-streak">
          <dt>Serie</dt>
          <dd>
            <IconFlame width={22} height={22} /> {props.streak} {props.streak === 1 ? 'Tag' : 'Tage'}
          </dd>
        </div>
      </dl>
      {words.length > 0 && (
        <section className="word-review" aria-label="Geübte Wörter">
          <p className="ex-kicker">Deine Wörter</p>
          <ul>
            {words.map((id) => {
              const v = vm.get(id);
              if (!v) return null;
              return (
                <li key={id}>
                  <button type="button" className={`word-chip${weak.has(id) ? ' is-weak' : ''}`} onClick={() => say(v.es, `chip-${id}`)}>
                    <span aria-hidden="true">{v.emoji}</span>
                    <span lang="es">{v.es}</span>
                    <span className="word-chip-de">{v.de}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {weak.size > 0 && <p className="ex-hint">Orange markierte Wörter kommen morgen in der Wiederholung dran.</p>}
        </section>
      )}
      <div className="result-actions">
        <button type="button" className="btn btn-primary btn-wide" onClick={props.onContinue} autoFocus>
          Weiter
        </button>
      </div>
    </div>
  );
}
