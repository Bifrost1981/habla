// Kurztest vor oder nach einer Einheit (WP-10): Hören, Abruf, Sprechen – ohne Feedback während des Tests.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context.tsx';
import { MicButton, usePushToTalk } from '../components/MicButton.tsx';
import { newKey, SpeakButtons } from '../components/Speakable.tsx';
import { IconClose } from '../components/icons.tsx';
import {
  ITEMS_PER_SKILL,
  SKILL_LABEL,
  SKILL_TASK,
  scoreListen,
  scoreRecall,
  scoreSpeak,
  type AssessmentItem,
} from '../lib/assessment.ts';
import { stopSpeaking, type SttError } from '../lib/speech.ts';
import { shuffle, tiles } from '../lib/text.ts';
import type { AssessmentAnswer, AssessmentRecord } from '../types.ts';

type Answer = { score: 0 | 1 | null };

export function AssessmentScreen(props: {
  unitId: string;
  unitTitle: string;
  kind: 'pre' | 'post';
  items: AssessmentItem[];
  onExit: (seconds: number) => void;
  onFinish: (rec: AssessmentRecord, seconds: number) => void;
}) {
  const { canSpeak } = useApp();
  const startedAt = useRef(Date.now());
  const seconds = () => Math.round((Date.now() - startedAt.current) / 1000);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AssessmentAnswer[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);
  // Ohne Mikrofon (oder wenn es während des Tests ausfällt) wird Sprechen nicht gemessen.
  const [speakOff, setSpeakOff] = useState(!canSpeak);
  const uid = useMemo(() => newKey('test'), [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopSpeaking(), []);

  const record = (a: Answer) => {
    const item = props.items[index];
    const next = [...answers, { skill: item.skill, es: item.es, score: a.score }];
    stopSpeaking();
    if (index + 1 >= props.items.length) {
      props.onFinish({ unit: props.unitId, kind: props.kind, at: new Date().toISOString(), answers: next }, seconds());
      return;
    }
    setAnswers(next);
    setIndex(index + 1);
  };

  // Sprechaufgaben ohne Mikrofon sofort als „nicht gemessen“ eintragen.
  const item = props.items[index];
  useEffect(() => {
    if (started && item?.skill === 'speak' && speakOff) record({ score: null });
  }, [started, index, speakOff]); // eslint-disable-line react-hooks/exhaustive-deps

  const what = props.kind === 'pre' ? 'Vortest' : 'Nachtest';

  if (!started) {
    return (
      <div className="screen assess">
        <header className="lesson-top">
          <button type="button" className="icon-btn" onClick={() => props.onExit(0)} aria-label="Test verlassen">
            <IconClose />
          </button>
        </header>
        <main className="assess-intro">
          <p className="ex-kicker">
            {what} · {props.unitTitle}
          </p>
          <h1 className="assess-title">{props.kind === 'pre' ? 'Was kannst du schon?' : 'Was kannst du jetzt?'}</h1>
          <p>
            {props.items.length} kurze Aufgaben, je {ITEMS_PER_SKILL} zu Hören, Abruf und Sprechen. Etwa 4 Minuten.
          </p>
          <p>
            Während des Tests gibt es keine Lösungen und keine Bewertung. „Weiß ich nicht“ ist völlig in Ordnung
            {props.kind === 'pre' ? ': Du lernst das ja erst noch.' : '.'}
          </p>
          {props.kind === 'pre' ? (
            <p>Nach der Einheit machst du denselben Test noch einmal und siehst, was du dazugelernt hast.</p>
          ) : (
            <p>Danach siehst du den Vergleich mit dem Vortest.</p>
          )}
          {speakOff && <p className="note">Ohne Mikrofon wird Sprechen in diesem Test nicht gemessen.</p>}
        </main>
        <div className="ex-actions">
          <button type="button" className="btn btn-primary btn-wide" onClick={() => setStarted(true)} autoFocus>
            Test starten
          </button>
        </div>
      </div>
    );
  }
  if (!item || (item.skill === 'speak' && speakOff)) return <div className="screen assess" />;

  const progress = index / props.items.length;
  return (
    <div className="screen assess">
      <header className="lesson-top">
        <button type="button" className="icon-btn" onClick={() => setConfirmQuit(true)} aria-label="Test verlassen">
          <IconClose />
        </button>
        <div
          className="progress"
          role="progressbar"
          aria-label={`Fortschritt ${what}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span className="progress-fill" style={{ width: `${Math.max(progress * 100, 4)}%` }} />
        </div>
        <span className="repeat-chip">{what}</span>
      </header>
      <main className="ex" key={uid} data-skill={item.skill}>
        {item.skill === 'listen' && <ListenItem item={item} uid={uid} onAnswer={record} />}
        {item.skill === 'recall' && <RecallItem item={item} onAnswer={record} />}
        {item.skill === 'speak' && <SpeakItem item={item} onAnswer={record} onMicLost={() => setSpeakOff(true)} />}
      </main>
      {confirmQuit && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="quit-title">
          <div className="dialog">
            <p id="quit-title" className="dialog-title">
              Test abbrechen?
            </p>
            <p>Ein abgebrochener Test wird nicht gespeichert.</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => props.onExit(seconds())}>
                Abbrechen
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setConfirmQuit(false)} autoFocus>
                Weitermachen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Head(props: { item: AssessmentItem; children?: ReactNode }) {
  return (
    <header className="ex-head">
      <p className="ex-kicker">
        {SKILL_LABEL[props.item.skill]} · {SKILL_TASK[props.item.skill]}
      </p>
      {props.children}
    </header>
  );
}

function DontKnow(props: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-ghost" onClick={props.onClick}>
      Weiß ich nicht
    </button>
  );
}

/** Hören: Satz hören (kein Text), deutsche Bedeutung wählen. */
function ListenItem(props: { item: AssessmentItem; uid: string; onAnswer: (a: Answer) => void }) {
  const { say } = useApp();
  const { item } = props;
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => say(item.es, props.uid), 250);
    return () => clearTimeout(t);
  }, [item.es, props.uid, say]);
  return (
    <>
      <div className="ex-body">
        <Head item={item}>
          <div className="dictation-listen">
            <SpeakButtons text={item.es} ttsKey={props.uid} size="lg" />
          </div>
        </Head>
        <div className="choice-list" role="radiogroup" aria-label="Bedeutung">
          {item.options.map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={chosen === o}
              className={`choice assess-option${chosen === o ? ' is-selected' : ''}`}
              onClick={() => setChosen(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
      <div className="ex-actions">
        <DontKnow onClick={() => props.onAnswer({ score: 0 })} />
        <button type="button" className="btn btn-primary btn-wide" disabled={chosen === null} onClick={() => props.onAnswer({ score: scoreListen(item, chosen) })}>
          Weiter
        </button>
      </div>
    </>
  );
}

/** Abruf: deutschen Satz sehen, spanischen Satz aus Kacheln legen. */
function RecallItem(props: { item: AssessmentItem; onAnswer: (a: Answer) => void }) {
  const { feedback } = useApp();
  const { item } = props;
  const bank = useMemo(() => shuffle([...tiles(item.es), ...item.extra]), [item]);
  const [line, setLine] = useState<number[]>([]);
  const sentence = line.map((i) => bank[i]).join(' ');
  return (
    <>
      <div className="ex-body">
        <Head item={item}>
          <p className="ex-prompt-de">{item.de}</p>
        </Head>
        <div className="build-line" aria-label="Dein Satz" lang="es">
          {line.length === 0 && <span className="build-placeholder">Tippe die Wörter in der richtigen Reihenfolge</span>}
          {line.map((i) => (
            <button key={i} type="button" className="tile tile-in-line" onClick={() => setLine((l) => l.filter((x) => x !== i))}>
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
              disabled={line.includes(i)}
              onClick={() => {
                setLine((l) => [...l, i]);
                feedback('tap');
              }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="ex-actions">
        <DontKnow onClick={() => props.onAnswer({ score: 0 })} />
        <button type="button" className="btn btn-primary btn-wide" disabled={line.length === 0} onClick={() => props.onAnswer({ score: scoreRecall(item, sentence) })}>
          Weiter
        </button>
      </div>
    </>
  );
}

/** Sprechen: deutschen Satz sehen und auf Spanisch sagen. Ein neuer Versuch ersetzt den vorigen; es gibt keine Bewertung. */
function SpeakItem(props: { item: AssessmentItem; onAnswer: (a: Answer) => void; onMicLost: () => void }) {
  const { progress, mic, setMic } = useApp();
  const { item } = props;
  const [alts, setAlts] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const onResult = useCallback(
    (a: string[]) => {
      if (mic !== 'ok') setMic('ok');
      if (!a.length) {
        setNote('Ich habe nichts gehört. Halte den Knopf gedrückt, solange du sprichst.');
        return;
      }
      setNote(null);
      setAlts(a);
    },
    [mic, setMic],
  );
  const onError = useCallback(
    (e: SttError) => {
      if (e === 'not-allowed' || e === 'unsupported') {
        setMic('unavailable');
        props.onMicLost();
      } else if (e === 'network') setNote('Die Spracherkennung braucht eine Internetverbindung. Versuch es noch einmal.');
      else setNote('Das hat nicht geklappt. Versuch es noch einmal.');
    },
    [props, setMic],
  );
  const ptt = usePushToTalk(progress.settings.dialect, onResult, onError);
  return (
    <>
      <div className="ex-body">
        <Head item={item}>
          <p className="ex-prompt-de">{item.de}</p>
        </Head>
        <p className="heard" aria-live="polite">
          {ptt.listening ? ptt.interim || '…' : alts ? <>Gehört: „{alts[0]}“</> : ' '}
        </p>
        {note && (
          <p className="note" role="status">
            {note}
          </p>
        )}
        <div className="assess-mic">
          <MicButton listening={ptt.listening} level={ptt.level} onStart={ptt.start} onStop={ptt.stop} label={alts ? 'Noch einmal sprechen' : undefined} />
        </div>
      </div>
      <div className="ex-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => props.onAnswer({ score: scoreSpeak(item, null) })}>
          Gerade nicht sprechen
        </button>
        <DontKnow onClick={() => props.onAnswer({ score: 0 })} />
        <button type="button" className="btn btn-primary" disabled={!alts} onClick={() => props.onAnswer({ score: scoreSpeak(item, alts) })}>
          Weiter
        </button>
      </div>
    </>
  );
}
