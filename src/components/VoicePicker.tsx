// Stimmenauswahl: natürliche Aufnahmen (falls vertont) oder eine Stimme des Geräts, jeweils mit Hörprobe.
import { useSyncExternalStore } from 'react';
import { useApp } from '../context.tsx';
import { VOICE_SAMPLE } from '../content/phrases.ts';
import {
  getRecordings,
  getVoicesVersion,
  pickVoice,
  RATES,
  speak,
  spanishVoices,
  subscribeVoices,
  voiceLabel,
  voiceQuality,
} from '../lib/speech.ts';
import type { Settings } from '../types.ts';
import { IconSpeaker } from './icons.tsx';

const REGION: Record<string, string> = {
  'es-es': 'Spanien',
  'es-mx': 'Mexiko',
  'es-us': 'USA',
  'es-419': 'Lateinamerika',
  'es-ar': 'Argentinien',
  'es-co': 'Kolumbien',
  'es-cl': 'Chile',
};
const region = (lang: string) => REGION[lang.replace('_', '-').toLowerCase()] ?? lang;

export function useVoicesVersion() {
  return useSyncExternalStore(subscribeVoices, getVoicesVersion);
}

/** Tipp, wie man auf diesem Gerät an eine natürlichere Stimme kommt. */
export function voiceTip(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua))
    return 'Auf dem iPhone/iPad: Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Spanisch. Lade dort eine Stimme mit „Erweitert“ oder „Premium“ und lade Habla danach neu.';
  if (/Macintosh/.test(ua) && !/Edg\//.test(ua))
    return 'Auf dem Mac: Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme → Stimmen verwalten → Spanisch. Lade eine Stimme mit „Premium“ oder „Erweitert“ und lade Habla neu. Noch einfacher: Microsoft Edge bringt kostenlose natürliche Stimmen mit.';
  if (/Android/.test(ua))
    return 'Auf Android: Einstellungen → Bedienungshilfen → Sprachausgabe → Google → Spanisch → hochwertige Stimme herunterladen. Danach Habla neu laden.';
  if (/Edg\//.test(ua)) return 'Edge bietet natürliche Online-Stimmen. Falls keine angezeigt wird, prüfe die Internetverbindung und lade die Seite neu.';
  return 'Die natürlichsten kostenlosen Stimmen gibt es in Microsoft Edge (z. B. Elvira für Spanien, Dalia für Mexiko). Öffne Habla dort, wenn dir die Stimme hier zu mechanisch klingt.';
}

export function VoicePicker() {
  const { progress, update } = useApp();
  useVoicesVersion();
  const s = progress.settings;
  const rec = getRecordings();
  const hasRec = rec?.dialect === s.dialect;
  const useRec = hasRec && s.voiceSource === 'auto';
  const list = spanishVoices(s.dialect);
  const best = pickVoice(s.dialect);
  const active = pickVoice(s.dialect, s.voiceURI);

  const choose = (patch: Pick<Settings, 'voiceSource' | 'voiceURI'>, sample: string) => {
    update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
    speak(sample, { dialect: s.dialect, voiceURI: patch.voiceURI, source: patch.voiceSource, rate: RATES[s.rate] });
  };
  const deviceSample = (name: string) => `Hola, me llamo ${name}. ¿Qué tal?`;

  return (
    <div className="voice-picker">
      <div className="voice-list" role="radiogroup" aria-label="Stimme">
        {hasRec && rec && (
          <button
            type="button"
            role="radio"
            aria-checked={useRec}
            className={`voice voice-rec${useRec ? ' is-on' : ''}`}
            onClick={() => choose({ voiceSource: 'auto', voiceURI: s.voiceURI }, VOICE_SAMPLE)}
          >
            <span className="voice-name">
              <strong>{rec.voiceLabel} · natürliche Stimme</strong>
              <span>
                Vorab vertont, auch offline · <span className="q q-hi">am natürlichsten</span>
              </span>
            </span>
            <IconSpeaker width={20} height={20} />
          </button>
        )}
        {list.length > 0 && (
          <button
            type="button"
            role="radio"
            aria-checked={!useRec && !s.voiceURI}
            className={`voice${!useRec && !s.voiceURI ? ' is-on' : ''}`}
            onClick={() => choose({ voiceSource: 'device', voiceURI: null }, deviceSample(best ? voiceLabel(best) : 'Habla'))}
          >
            <span className="voice-name">
              <strong>Gerätestimme automatisch</strong>
              <span>{best ? `Die natürlichste auf diesem Gerät: ${voiceLabel(best)}` : 'Beste verfügbare Stimme'}</span>
            </span>
            <IconSpeaker width={20} height={20} />
          </button>
        )}
        {list.slice(0, 12).map((v) => {
          const q = voiceQuality(v);
          const on = !useRec && s.voiceURI === v.voiceURI;
          return (
            <button
              key={v.voiceURI}
              type="button"
              role="radio"
              aria-checked={on}
              className={`voice${on ? ' is-on' : ''}`}
              onClick={() => choose({ voiceSource: 'device', voiceURI: v.voiceURI }, deviceSample(voiceLabel(v)))}
            >
              <span className="voice-name">
                <strong>{voiceLabel(v)}</strong>
                <span>
                  {region(v.lang)} · <span className={`q q-${q === 'natürlich' ? 'hi' : q === 'gut' ? 'mid' : 'lo'}`}>{q}</span>
                </span>
              </span>
              <IconSpeaker width={20} height={20} />
            </button>
          );
        })}
      </div>
      {!hasRec && list.length === 0 && <p className="voice-empty">Auf diesem Gerät ist keine spanische Stimme installiert. {voiceTip()}</p>}
      {!useRec && active && voiceQuality(active) !== 'natürlich' && <p className="voice-tip">{voiceTip()}</p>}
    </div>
  );
}
