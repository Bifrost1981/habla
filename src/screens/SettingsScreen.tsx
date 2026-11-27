// Einstellungen: Dialekt, Tempo, Ton, Haptik, Sprechübungen, Tagesziel, Offline und Datenschutz, Zurücksetzen.
import { useState, type ReactNode } from 'react';
import { useApp } from '../context.tsx';
import { IconBack } from '../components/icons.tsx';
import { getRecordings, loadRecordings, RATES, speak, sttSupported } from '../lib/speech.ts';
import { offlineReady, saveRecordingsOffline, SPEECH_PRIVACY_NOTE } from '../lib/offline.ts';
import { RATE_SAMPLE, SHORT_SAMPLE } from '../content/phrases.ts';
import { VoicePicker } from '../components/VoicePicker.tsx';
import type { Settings } from '../types.ts';

function Toggle(props: { id: string; label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="row">
      <label htmlFor={props.id} className="row-text">
        <strong>{props.label}</strong>
        {props.desc && <span>{props.desc}</span>}
      </label>
      <button
        id={props.id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        className={`switch${props.checked ? ' is-on' : ''}`}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

function Segmented<T extends string | number>(props: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; extra?: ReactNode }) {
  return (
    <div className="row row-stack">
      <span className="row-text">
        <strong>{props.label}</strong>
      </span>
      <div className="segmented" role="radiogroup" aria-label={props.label}>
        {props.options.map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={props.value === v} className={props.value === v ? 'is-on' : ''} onClick={() => props.onChange(v)}>
            {l}
          </button>
        ))}
      </div>
      {props.extra}
    </div>
  );
}

export function SettingsScreen(props: { onBack: () => void; onReset: () => void }) {
  const { progress, update, mic } = useApp();
  const s = progress.settings;
  const set = (patch: Partial<Settings>) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  const [confirm, setConfirm] = useState(false);
  const [offline, setOffline] = useState<{ done: number; total: number; ok?: number } | null>(null);
  const recordings = getRecordings();
  const clipCount = recordings ? new Set(Object.values(recordings.clips)).size : 0;
  const saveOffline = async () => {
    const m = recordings ?? (await loadRecordings(s.dialect));
    if (!m) return;
    setOffline({ done: 0, total: new Set(Object.values(m.clips)).size });
    const ok = await saveRecordingsOffline(m, (done, total) => setOffline({ done, total }));
    setOffline((o) => ({ done: o?.total ?? ok, total: o?.total ?? ok, ok }));
  };

  return (
    <div className="screen settings">
      <header className="subbar">
        <button type="button" className="icon-btn" onClick={props.onBack} aria-label="Zurück">
          <IconBack />
        </button>
        <h1>Einstellungen</h1>
      </header>

      <section className="group" aria-label="Sprache">
        <Segmented
          label="Aussprache"
          value={s.dialect}
          options={[
            ['es-ES', 'Spanien'],
            ['es-MX', 'Lateinamerika'],
          ]}
          onChange={(d) => {
            set({ dialect: d, voiceURI: null });
            loadRecordings(d).then(() => speak(SHORT_SAMPLE, { dialect: d, rate: RATES[s.rate], source: s.voiceSource }));
          }}
        />
        <Segmented
          label="Sprechtempo"
          value={s.rate}
          options={[
            ['slow', 'Langsam'],
            ['relaxed', 'Ruhig'],
            ['normal', 'Normal'],
          ]}
          onChange={(v) => {
            set({ rate: v });
            speak(RATE_SAMPLE, { dialect: s.dialect, rate: RATES[v], voiceURI: s.voiceURI, source: s.voiceSource });
          }}
        />
        <div className="row row-stack">
          <span className="row-text">
            <strong>Stimme</strong>
            <span>Tippe auf eine Stimme, um sie zu hören und auszuwählen.</span>
          </span>
          <VoicePicker />
        </div>
        <Segmented
          label="Tagesziel"
          value={s.dailyGoalMin}
          options={[
            [5, '5 Min'],
            [10, '10 Min'],
            [15, '15 Min'],
          ]}
          onChange={(v) => set({ dailyGoalMin: v })}
        />
      </section>

      <section className="group" aria-label="Feedback und Sprechen">
        <Toggle id="set-sound" label="Töne" desc="Kurzer Klang bei richtig und falsch" checked={s.sound} onChange={(v) => set({ sound: v })} />
        <Toggle id="set-haptics" label="Vibration" desc="Auf Geräten, die es unterstützen" checked={s.haptics} onChange={(v) => set({ haptics: v })} />
        <Toggle
          id="set-speech"
          label="Sprechübungen"
          desc={
            !sttSupported
              ? 'Dein Browser unterstützt keine Spracherkennung. Nutze Chrome, Edge oder Safari.'
              : mic === 'unavailable'
                ? 'Kein Mikrofonzugriff. Erlaube das Mikrofon in den Browser-Einstellungen und lade die Seite neu.'
                : 'Aus: Sätze werden stattdessen aus Kacheln gebaut'
          }
          checked={s.speechExercises && sttSupported}
          disabled={!sttSupported}
          onChange={(v) => set({ speechExercises: v })}
        />
      </section>

      <section className="group" aria-label="Offline und Datenschutz">
        {clipCount > 0 && (
          <div className="row row-stack">
            <span className="row-text">
              <strong>Aufnahmen offline speichern</strong>
              <span>
                {!offlineReady()
                  ? 'Offline-Speicher ist hier nicht verfügbar (z. B. privates Fenster). Gehörte Aufnahmen werden sonst automatisch gespeichert.'
                  : offline?.ok !== undefined
                    ? `Fertig: ${offline.ok} von ${offline.total} Aufnahmen gespeichert. Lola spricht jetzt auch ohne Internet.`
                    : offline
                      ? `Speichere … ${offline.done} von ${offline.total}`
                      : `Alle ${clipCount} Aufnahmen von Lola (etwa 9 MB) für unterwegs. Gehörte Aufnahmen werden ohnehin gespeichert.`}
              </span>
            </span>
            {offlineReady() && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={!!offline && offline.ok === undefined}
                onClick={saveOffline}
              >
                {offline?.ok !== undefined ? 'Erneut speichern' : 'Offline speichern'}
              </button>
            )}
          </div>
        )}
        <div className="row row-stack">
          <span className="row-text">
            <strong>Datenschutz bei der Spracherkennung</strong>
            <span className="privacy-note">{SPEECH_PRIVACY_NOTE}</span>
          </span>
        </div>
      </section>

      <section className="group" aria-label="Fortschritt">
        {!confirm ? (
          <div className="row">
            <span className="row-text">
              <strong>Fortschritt zurücksetzen</strong>
              <span>Löscht Lektionen, Wortschatz und Serie auf diesem Gerät.</span>
            </span>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirm(true)}>
              Zurücksetzen
            </button>
          </div>
        ) : (
          <div className="row row-stack">
            <span className="row-text">
              <strong>Wirklich alles löschen?</strong>
              <span>Das lässt sich nicht rückgängig machen.</span>
            </span>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
                Abbrechen
              </button>
              <button type="button" className="btn btn-danger" onClick={props.onReset}>
                Alles löschen
              </button>
            </div>
          </div>
        )}
      </section>
      <p className="path-foot">Habla 0.3 · Dein Fortschritt bleibt nur in diesem Browser gespeichert.</p>
    </div>
  );
}
