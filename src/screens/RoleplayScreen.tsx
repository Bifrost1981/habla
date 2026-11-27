// Geführtes Rollenspiel (WP-09): Lola spricht die Gegenseite, man antwortet als Laura per Mikrofon.
// Erster Fehlversuch: Hörhilfe (Musterantwort) und, wo erkennbar, ein Regelhinweis; zweiter Fehlversuch: Musterantwort
// zeigen und weiter. Ohne Mikrofon wird die passende Antwort aus drei ausgewählt.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lexicon, useApp } from '../context.tsx';
import { MicButton, usePushToTalk } from '../components/MicButton.tsx';
import { SpeakButtons } from '../components/Speakable.tsx';
import { IconClose } from '../components/icons.tsx';
import { diagnose, type Diagnosis } from '../lib/diagnose.ts';
import { choiceOptions, matchTurn, type Roleplay } from '../lib/roleplays.ts';
import { stopSpeaking, sttSupported, type SttError } from '../lib/speech.ts';
import type { RoleplayRecord } from '../types.ts';

type Line = { who: 'partner' | 'me'; es: string; de?: string; ttsKey: string; helped?: boolean };

export function RoleplayScreen(props: {
  rp: Roleplay;
  unitTitle: string;
  onExit: (seconds: number) => void;
  onFinish: (rec: RoleplayRecord, seconds: number) => void;
}) {
  const { rp } = props;
  const { say, progress, mic, setMic, feedback } = useApp();
  const startedAt = useRef(Date.now());
  const seconds = () => Math.round((Date.now() - startedAt.current) / 1000);
  const [started, setStarted] = useState(false);
  const [ti, setTi] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [heard, setHeard] = useState('');
  /** Zug abgeschlossen, wartet auf „Weiter“ (nach Hilfe) */
  const [waiting, setWaiting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [spoken, setSpoken] = useState(0);
  const [choice, setChoice] = useState(() => !sttSupported || mic === 'unavailable');
  const [picked, setPicked] = useState<string | null>(null);
  const timer = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      stopSpeaking();
    },
    [],
  );
  useEffect(() => {
    // Rückgabewert nicht weiterreichen: neuere Browser liefern hier ein Promise, React erwartet eine Aufräumfunktion.
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [lines.length, waiting, finished]);

  const turn = rp.turns[ti];
  const key = (i: number | 'end', suffix = '') => `rp-${rp.unit}-${i}${suffix}`;
  const options = useMemo(() => choiceOptions(rp, ti), [rp, ti]);

  /** Zug beginnen: Satz der Gegenseite zeigen und vorlesen. */
  const enterTurn = useCallback(
    (i: number) => {
      setTi(i);
      setAttempts(0);
      setNote(null);
      setDiag(null);
      setHeard('');
      setPicked(null);
      setWaiting(false);
      const t = rp.turns[i];
      if (t.partner) {
        setLines((l) => [...l, { who: 'partner', es: t.partner!.es, de: t.partner!.de, ttsKey: key(i) }]);
        say(t.partner.es, key(i));
      }
    },
    [rp, say], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const advance = useCallback(() => {
    if (ti + 1 < rp.turns.length) enterTurn(ti + 1);
    else {
      setLines((l) => [...l, { who: 'partner', es: rp.end.es, de: rp.end.de, ttsKey: key('end') }]);
      say(rp.end.es, key('end'));
      setWaiting(false);
      setFinished(true);
    }
  }, [enterTurn, rp, say, ti]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Antwort gilt: Lauras Satz in den Verlauf, kurz danach weiter. */
  const accept = useCallback(
    (es: string, helped: boolean) => {
      setLines((l) => [...l, { who: 'me', es, ttsKey: key(ti, '-a'), helped }]);
      if (!helped) setSpoken((n) => n + 1);
      feedback(helped ? 'bad' : 'good');
      if (helped) setWaiting(true);
      else timer.current = window.setTimeout(advance, 700);
    },
    [advance, feedback, ti], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onResult = useCallback(
    (alts: string[]) => {
      if (mic !== 'ok') setMic('ok');
      if (!alts.length) {
        setNote('Ich habe nichts gehört. Halte den Knopf gedrückt, solange du sprichst.');
        return;
      }
      const r = matchTurn(turn, alts);
      setHeard(r.heard);
      if (r.passed) {
        setNote(null);
        setDiag(null);
        accept(r.answer, attempts > 0);
        return;
      }
      const model = turn.answers[0];
      setDiag(diagnose(model, r.heard, lexicon, { speech: true }));
      if (attempts === 0) {
        setAttempts(1);
        setNote('Noch nicht ganz. Hör dir an, wie Laura es sagen könnte, und versuch es noch einmal.');
        say(model, key(ti, '-a'));
      } else {
        setNote('So kannst du es sagen:');
        say(model, key(ti, '-a'));
        accept(model, true);
      }
    },
    [accept, attempts, mic, say, setMic, ti, turn], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onError = useCallback(
    (e: SttError) => {
      if (e === 'not-allowed' || e === 'unsupported') {
        setMic('unavailable');
        setChoice(true);
        setNote('Ohne Mikrofon: Wähl die passende Antwort.');
      } else if (e === 'network') setNote('Die Spracherkennung braucht eine Internetverbindung. Versuch es gleich noch einmal oder antworte ohne Mikrofon.');
      else setNote('Das hat nicht geklappt. Versuch es noch einmal.');
    },
    [setMic],
  );
  const ptt = usePushToTalk(progress.settings.dialect, onResult, onError);

  const pick = (o: string) => {
    setPicked(o);
    const ok = o === turn.answers[0];
    if (!ok) setNote('Nicht ganz. Passend ist:');
    accept(turn.answers[0], !ok);
  };

  const header = (
    <header className="lesson-top">
      <button type="button" className="icon-btn" onClick={() => props.onExit(seconds())} aria-label="Rollenspiel verlassen">
        <IconClose />
      </button>
      <span className="repeat-chip">Rollenspiel</span>
    </header>
  );

  if (!started) {
    const gloss = Object.entries(rp.glossary);
    return (
      <div className="screen roleplay">
        {header}
        <main className="assess-intro">
          <p className="ex-kicker">Rollenspiel · {props.unitTitle}</p>
          <h1 className="assess-title">{rp.title}</h1>
          <p>
            <strong>Dein Ziel:</strong> {rp.goal}
          </p>
          <p>
            Du bist Laura. Es spricht: {rp.partner}. Halte zum Antworten das Mikrofon gedrückt
            {sttSupported && mic !== 'unavailable' ? '.' : ' – auf diesem Gerät wählst du die Antwort aus.'}
          </p>
          {gloss.length > 0 && (
            <section className="story-gloss" aria-labelledby="rp-gloss">
              <h2 id="rp-gloss">Neue Wörter</h2>
              <dl>
                {gloss.map(([es, de]) => (
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
              setStarted(true);
              enterTurn(0);
            }}
            autoFocus
          >
            Los geht’s
          </button>
        </div>
      </div>
    );
  }

  const total = rp.turns.length;
  return (
    <div className="screen roleplay">
      {header}
      <main className="rp-body">
        <p className="rp-goal">
          <strong>Ziel:</strong> {rp.goal}
        </p>
        <ol className="rp-chat" aria-label="Gespräch" aria-live="polite">
          {lines.map((l, i) => (
            <li key={i} className={`rp-line rp-${l.who}${l.helped ? ' is-helped' : ''}`}>
              <SpeakButtons text={l.es} ttsKey={l.ttsKey} size="sm" hideSlow />
              <span className="rp-text">
                <span lang="es">{l.es}</span>
                {l.de && <span className="rp-de">{l.de}</span>}
                {l.helped && <span className="rp-tag">mit Hilfe</span>}
              </span>
            </li>
          ))}
        </ol>
        {!finished && (
          <section className="rp-task" aria-labelledby="rp-task">
            <p className="ex-kicker" id="rp-task">
              Du bist dran · {ti + 1} von {total}
            </p>
            <p className="ex-prompt-de">{turn.task}</p>
            {heard && !choice && <p className="heard">Gehört: „{heard}“</p>}
            {note && (
              <p className="note" role="status">
                {note}
              </p>
            )}
            {diag && (
              <p className="sheet-rule" data-kind={diag.kind}>
                <span className="sheet-rule-kind">{diag.label}</span> {diag.rule}
              </p>
            )}
            {choice && (picked !== null || !waiting) && (
              <div className="choice-list" role="radiogroup" aria-label="Antworten">
                {options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={picked === o}
                    disabled={picked !== null}
                    className={`choice story-option${picked === null ? '' : o === turn.answers[0] ? ' is-right' : o === picked ? ' is-wrong' : ''}`}
                    onClick={() => pick(o)}
                    lang="es"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        {finished && (
          <section className="rp-done" aria-labelledby="rp-done">
            <h2 id="rp-done" className="assess-title">
              ¡Objetivo cumplido!
            </h2>
            <p>Ziel erreicht.</p>
            <p className="story-score">
              {spoken} von {total} Antworten ohne Hilfe
            </p>
          </section>
        )}
        <div ref={endRef} />
      </main>
      <div className={`ex-actions${!finished && !waiting && !choice ? ' ex-actions-mic' : ''}`}>
        {finished ? (
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={() => props.onFinish({ spoken, total, at: new Date().toISOString() }, seconds())}
            autoFocus
          >
            Fertig
          </button>
        ) : waiting ? (
          <button type="button" className="btn btn-primary btn-wide" onClick={advance} autoFocus>
            Weiter
          </button>
        ) : choice ? null : (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                setChoice(true);
                setNote(null);
              }}
            >
              Ohne Mikrofon antworten
            </button>
            <MicButton
              listening={ptt.listening}
              level={ptt.level}
              onStart={ptt.start}
              onStop={ptt.stop}
              label={attempts === 1 ? 'Noch ein Versuch' : 'Halten & sprechen'}
            />
          </>
        )}
      </div>
    </div>
  );
}
