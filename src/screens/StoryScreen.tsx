// Hörgeschichte einer Einheit (WP-08): anhören (ganz oder Satz für Satz), auf Wunsch mitlesen und
// übersetzen, neue Wörter nachschlagen, dann drei Verständnisfragen per Antippen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context.tsx';
import { SpeakButtons, SpokenText } from '../components/Speakable.tsx';
import { IconClose, IconSpeaker } from '../components/icons.tsx';
import { seeded } from '../lib/generate.ts';
import { stopSpeaking } from '../lib/speech.ts';
import { shuffle } from '../lib/text.ts';
import type { Story } from '../lib/stories.ts';
import type { StoryRecord } from '../types.ts';

type Phase = 'listen' | 'questions' | 'done';

export function StoryScreen(props: {
  story: Story;
  unitTitle: string;
  onExit: (seconds: number) => void;
  onFinish: (rec: StoryRecord, seconds: number) => void;
}) {
  const { story } = props;
  const { say, feedback } = useApp();
  const startedAt = useRef(Date.now());
  const seconds = () => Math.round((Date.now() - startedAt.current) / 1000);
  const [phase, setPhase] = useState<Phase>('listen');
  const [showText, setShowText] = useState(false);
  const [showDe, setShowDe] = useState(false);
  /** Satz, der gerade beim Durchhören läuft (−1: keiner) */
  const [playing, setPlaying] = useState(-1);
  const [qi, setQi] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);

  const gapTimer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(gapTimer.current);
      stopSpeaking();
    },
    [],
  );

  const key = (i: number) => `story-${story.unit}-${i}`;
  const playFrom = (i: number) => {
    if (i >= story.lines.length) {
      setPlaying(-1);
      return;
    }
    setPlaying(i);
    say(story.lines[i].es, key(i), false, () => {
      gapTimer.current = window.setTimeout(() => playFrom(i + 1), 450);
    });
  };
  const stopAll = () => {
    window.clearTimeout(gapTimer.current);
    stopSpeaking();
    setPlaying(-1);
  };

  // Antworten je Frage fest gemischt, damit die richtige nicht immer oben steht.
  const order = useMemo(
    () =>
      story.questions.map((q, i) =>
        shuffle(
          q.options.map((_, j) => j),
          seeded(`${story.unit}-${i}`),
        ),
      ),
    [story],
  );

  const glossary = Object.entries(story.glossary);
  const isNew = (w: string) => w.toLowerCase().replace(/[¿?¡!.,;:"“”«»()…]/g, '') in story.glossary;

  const header = (
    <header className="lesson-top">
      <button type="button" className="icon-btn" onClick={() => props.onExit(seconds())} aria-label="Geschichte verlassen">
        <IconClose />
      </button>
      <span className="repeat-chip">Hörgeschichte</span>
    </header>
  );

  if (phase === 'listen') {
    return (
      <div className="screen story">
        {header}
        <main className="story-body">
          <p className="ex-kicker">Hörgeschichte · {props.unitTitle}</p>
          <h1 className="assess-title" lang="es">
            {story.titleEs}
          </h1>
          <p className="story-sub">{story.title}</p>
          <button
            type="button"
            className={`btn btn-primary btn-wide story-play${playing >= 0 ? ' is-playing' : ''}`}
            onClick={() => (playing >= 0 ? stopAll() : playFrom(0))}
          >
            <IconSpeaker width={22} height={22} />
            {playing >= 0 ? 'Anhalten' : 'Ganze Geschichte anhören'}
          </button>
          <div className="story-toggles">
            <label className="story-toggle">
              <input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} />
              Text mitlesen
            </label>
            <label className="story-toggle">
              <input type="checkbox" checked={showDe} disabled={!showText} onChange={(e) => setShowDe(e.target.checked)} />
              Übersetzung
            </label>
          </div>
          <ol className="story-lines" aria-label="Sätze der Geschichte">
            {story.lines.map((l, i) => (
              <li key={i} className={`story-line${playing === i ? ' is-playing' : ''}`}>
                <SpeakButtons text={l.es} ttsKey={key(i)} size="sm" hideSlow />
                <span className="story-line-text">
                  {showText ? (
                    <SpokenText text={l.es} ttsKey={key(i)} highlight={l.es.split(/\s+/).flatMap((w, wi) => (isNew(w) ? [wi] : []))} />
                  ) : (
                    <span className="story-hidden">Satz {i + 1}</span>
                  )}
                  {showText && showDe && <span className="story-de">{l.de}</span>}
                </span>
              </li>
            ))}
          </ol>
          {glossary.length > 0 && (
            <section className="story-gloss" aria-labelledby="gloss-title">
              <h2 id="gloss-title">Neue Wörter</h2>
              <dl>
                {glossary.map(([es, de]) => (
                  <div key={es}>
                    <dt lang="es">{es}</dt>
                    <dd>{de}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </main>
        <div className="ex-actions">
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={() => {
              stopAll();
              setPhase('questions');
            }}
          >
            Weiter zu den Fragen
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'questions') {
    const q = story.questions[qi];
    const answered = chosen !== null;
    const next = () => {
      if (qi + 1 >= story.questions.length) setPhase('done');
      else {
        setQi(qi + 1);
        setChosen(null);
      }
    };
    return (
      <div className="screen story">
        {header}
        <main className="ex">
          <div className="ex-body">
            <header className="ex-head">
              <p className="ex-kicker">
                Frage {qi + 1} von {story.questions.length}
              </p>
              <h1 className="ex-prompt-de">{q.q}</h1>
            </header>
            <div className="choice-list" role="radiogroup" aria-label="Antworten">
              {order[qi].map((j) => {
                const state = !answered ? '' : j === q.answer ? ' is-right' : j === chosen ? ' is-wrong' : '';
                return (
                  <button
                    key={j}
                    type="button"
                    role="radio"
                    aria-checked={chosen === j}
                    disabled={answered}
                    className={`choice assess-option story-option${state}`}
                    onClick={() => {
                      setChosen(j);
                      const ok = j === q.answer;
                      if (ok) setCorrect((c) => c + 1);
                      feedback(ok ? 'good' : 'bad');
                    }}
                  >
                    {q.options[j]}
                  </button>
                );
              })}
            </div>
            {answered && (
              <p className={`story-verdict ${chosen === q.answer ? 'is-good' : 'is-bad'}`} role="status">
                {chosen === q.answer ? '¡Muy bien! Richtig.' : `Nicht ganz. Richtig ist: ${q.options[q.answer]}`}
              </p>
            )}
          </div>
        </main>
        <div className="ex-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPhase('listen')}>
            Nochmal hören
          </button>
          <button type="button" className="btn btn-primary btn-wide" disabled={!answered} onClick={next}>
            Weiter
          </button>
        </div>
      </div>
    );
  }

  const total = story.questions.length;
  return (
    <div className="screen story">
      {header}
      <main className="assess-intro">
        <p className="ex-kicker">Hörgeschichte · {props.unitTitle}</p>
        <h1 className="assess-title">{correct === total ? '¡Perfecto!' : correct > 0 ? '¡Bien hecho!' : '¡Ánimo!'}</h1>
        <p className="story-score">
          {correct} von {total} Fragen richtig
        </p>
        <p>
          {correct === total
            ? 'Du hast die Geschichte vollständig verstanden.'
            : 'Hör die Geschichte ruhig noch einmal an, mit oder ohne Text.'}
        </p>
      </main>
      <div className="ex-actions">
        <button
          type="button"
          className="btn btn-primary btn-wide"
          onClick={() => props.onFinish({ correct, total, at: new Date().toISOString() }, seconds())}
          autoFocus
        >
          Fertig
        </button>
      </div>
    </div>
  );
}
