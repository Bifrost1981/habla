// Onboarding: Willkommen → Dialekt (mit Hörprobe) → Tagesziel → Mikrofon-Test → Vortest anbieten (überspringbar).
import { useState } from 'react';
import { useApp } from '../context.tsx';
import { MicButton, usePushToTalk } from '../components/MicButton.tsx';
import { loadRecordings, RATES, speak, sttSupported } from '../lib/speech.ts';
import { VOICE_SAMPLE } from '../content/phrases.ts';
import { VoicePicker } from '../components/VoicePicker.tsx';
import { similarity } from '../lib/text.ts';
import type { Dialect, Settings } from '../types.ts';
import { IconSpeaker } from '../components/icons.tsx';
import { SPEECH_PRIVACY_NOTE } from '../lib/offline.ts';


/** onDone('test'): erst Vortest von Einheit 1, dann erste Lektion; onDone('lesson'): gleich zur ersten Lektion. */
export function Onboarding(props: { onDone: (next: 'test' | 'lesson') => void }) {
  const { progress, update, setMic, mic } = useApp();
  const [step, setStep] = useState(0);
  const s = progress.settings;
  const set = (patch: Partial<Settings>) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  const [micResult, setMicResult] = useState<string | null>(null);
  const ptt = usePushToTalk(
    s.dialect,
    (alts) => {
      setMic('ok');
      if (!alts.length) setMicResult('Nichts gehört. Halte den Knopf gedrückt, während du „Hola“ sagst.');
      else {
        const best = alts.reduce((a, b) => (similarity('hola', b) > similarity('hola', a) ? b : a));
        setMicResult(similarity('hola', best) >= 0.8 ? '¡Perfecto! Dein Mikrofon funktioniert.' : `Gehört: „${best}“. Das Mikrofon funktioniert.`);
      }
    },
    (e) => {
      if (e === 'not-allowed' || e === 'unsupported') {
        setMic('unavailable');
        setMicResult('Kein Zugriff aufs Mikrofon. Sprechübungen werden durch „Satz bauen“ ersetzt. Du kannst das später in den Browser-Einstellungen ändern.');
      } else setMicResult('Das hat nicht geklappt. Versuch es noch einmal.');
    },
  );

  const steps = 5;
  const done = (next: 'test' | 'lesson') => {
    update((p) => ({ ...p, onboarded: true }));
    props.onDone(next);
  };
  return (
    <div className="screen onboarding">
      <div className="dots" aria-label={`Schritt ${step + 1} von ${steps}`}>
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={`dot${i <= step ? ' is-on' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <section className="ob-step ob-hero">
          <p className="ob-hola" lang="es">
            ¡Hola!
          </p>
          <h1>Spanisch lernen, ohne zu tippen.</h1>
          <p className="ob-lead">
            Du tippst auf Bilder, ziehst Wörter in Lücken und sprichst Sätze nach. Jedes spanische Wort hörst du zuerst – in 3 bis 5 Minuten pro Lektion.
          </p>
          <div className="ob-actions">
            <button type="button" className="btn btn-primary btn-wide" onClick={() => setStep(1)}>
              Los geht’s
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="ob-step">
          <h1>Welches Spanisch möchtest du hören?</h1>
          <p className="ob-lead">Tippe auf den Lautsprecher für eine Hörprobe. Darunter kannst du die Stimme wählen, die dir am angenehmsten ist.</p>
          <div className="choice-list" role="radiogroup" aria-label="Dialekt">
            {(
              [
                ['es-ES', 'Spanien', 'Kastilisches Spanisch, z. B. Madrid'],
                ['es-MX', 'Lateinamerika', 'Mexikanisches Spanisch, z. B. Mexiko-Stadt'],
              ] as [Dialect, string, string][]
            ).map(([d, name, desc]) => (
              <div key={d} className={`choice${s.dialect === d ? ' is-selected' : ''}`}>
                <button type="button" role="radio" aria-checked={s.dialect === d} className="choice-main" onClick={() => set({ dialect: d, voiceURI: null })}>
                  <strong>{name}</strong>
                  <span>{desc}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Hörprobe ${name}`}
                  onClick={() => {
                    set({ dialect: d, voiceURI: null });
                    // Erst die Aufnahmen des Dialekts laden, damit die Hörprobe schon natürlich klingt.
                    loadRecordings(d).then(() => speak(VOICE_SAMPLE, { dialect: d, rate: RATES[s.rate], source: s.voiceSource }));
                  }}
                >
                  <IconSpeaker />
                </button>
              </div>
            ))}
          </div>
          <div className="ob-voice">
            <p className="ex-kicker">Stimme</p>
            <VoicePicker />
          </div>
          <div className="ob-actions">
            <button type="button" className="btn btn-primary btn-wide" onClick={() => setStep(2)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="ob-step">
          <h1>Wie viel Zeit hast du täglich?</h1>
          <p className="ob-lead">Kleine, regelmäßige Einheiten bringen mehr als selten lange.</p>
          <div className="choice-list" role="radiogroup" aria-label="Tagesziel">
            {(
              [
                [5, 'Locker', 'etwa 1 Lektion am Tag'],
                [10, 'Normal', 'etwa 2 Lektionen am Tag'],
                [15, 'Ehrgeizig', 'etwa 3 Lektionen am Tag'],
              ] as [Settings['dailyGoalMin'], string, string][]
            ).map(([min, name, desc]) => (
              <button
                key={min}
                type="button"
                role="radio"
                aria-checked={s.dailyGoalMin === min}
                className={`choice choice-main choice-goal${s.dailyGoalMin === min ? ' is-selected' : ''}`}
                onClick={() => set({ dailyGoalMin: min })}
              >
                <span className="choice-min">
                  {min}
                  <small>Min</small>
                </span>
                <span>
                  <strong>{name}</strong>
                  <span>{desc}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="ob-actions">
            <button type="button" className="btn btn-primary btn-wide" onClick={() => setStep(3)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="ob-step">
          <h1>Kurzer Mikrofon-Test</h1>
          {sttSupported && mic !== 'unavailable' ? (
            <>
              <p className="ob-lead">
                Halte den Knopf gedrückt und sag <strong lang="es">„Hola“</strong>.
              </p>
              <p className="ob-note privacy-note">{SPEECH_PRIVACY_NOTE}</p>
              <div className="ob-mic">
                <MicButton listening={ptt.listening} level={ptt.level} onStart={ptt.start} onStop={ptt.stop} />
                <p className="heard" aria-live="polite">
                  {ptt.listening ? ptt.interim || '…' : (micResult ?? ' ')}
                </p>
              </div>
            </>
          ) : (
            <p className="ob-lead">
              {sttSupported
                ? micResult
                : 'Dein Browser unterstützt keine Spracherkennung (z. B. Firefox). Sprechübungen werden durch „Satz bauen“ ersetzt. Für Sprechübungen öffne Habla in Chrome, Edge oder Safari.'}
            </p>
          )}
          <div className="ob-actions">
            <button type="button" className="btn btn-primary btn-wide" onClick={() => setStep(4)}>
              {mic === 'ok' ? 'Weiter' : 'Weiter ohne Mikrofon-Test'}
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="ob-step ob-pretest">
          <h1>Erst ein kurzer Vortest?</h1>
          <p className="ob-lead">
            12 kurze Aufgaben zu Einheit 1, etwa 3 Minuten. Du musst noch nichts können: „Weiß ich nicht“ ist völlig in Ordnung.
          </p>
          <p className="ob-lead">Nach der Einheit machst du denselben Test noch einmal und siehst, was du dazugelernt hast.</p>
          <div className="ob-actions">
            <button type="button" className="btn btn-primary btn-wide" onClick={() => done('test')}>
              Vortest machen
            </button>
            <button type="button" className="btn btn-ghost btn-wide" onClick={() => done('lesson')}>
              Überspringen – zur ersten Lektion
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
