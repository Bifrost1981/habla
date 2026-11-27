// Spanischer Text mit Vorlese-Buttons und Hervorhebung des gerade gesprochenen Worts.
import { useApp, useTts } from '../context.tsx';
import { IconSpeaker, IconTurtle } from './icons.tsx';

let counter = 0;
export function newKey(prefix = 't') {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function SpeakButtons(props: { text: string; ttsKey: string; size?: 'lg' | 'md' | 'sm'; hideSlow?: boolean }) {
  const { say } = useApp();
  const tts = useTts();
  const active = tts.key === props.ttsKey;
  const size = props.size ?? 'md';
  return (
    <span className={`speak-btns speak-${size}`}>
      <button
        type="button"
        className={`icon-btn speak-main${active ? ' is-playing' : ''}`}
        onClick={() => say(props.text, props.ttsKey, false)}
        aria-label="Vorlesen"
        title="Vorlesen"
      >
        <IconSpeaker />
      </button>
      {!props.hideSlow && (
        <button
          type="button"
          className="icon-btn speak-slow"
          onClick={() => say(props.text, props.ttsKey, true)}
          aria-label="Langsam vorlesen"
          title="Langsam vorlesen"
        >
          <IconTurtle />
        </button>
      )}
    </span>
  );
}

/** Text in Wörter zerlegt; das gesprochene Wort wird hervorgehoben. */
export function SpokenText(props: { text: string; ttsKey: string; className?: string; marks?: (boolean | null)[]; highlight?: number[] }) {
  const tts = useTts();
  const parts = props.text.split(/(\s+)/);
  let wi = -1;
  return (
    <span className={`spoken ${props.className ?? ''}`} lang="es">
      {parts.map((p, i) => {
        if (/^\s+$/.test(p)) return p;
        wi += 1;
        const active = tts.key === props.ttsKey && tts.word === wi;
        const mark = props.marks?.[wi];
        const cls = ['w', active ? 'w-active' : '', mark === true ? 'w-good' : mark === false ? 'w-bad' : '', props.highlight?.includes(wi) ? 'w-key' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <span key={i} className={cls}>
            {p}
          </span>
        );
      })}
    </span>
  );
}

export function Speakable(props: { text: string; ttsKey: string; size?: 'lg' | 'md' | 'sm'; className?: string; highlight?: number[] }) {
  return (
    <span className={`speakable speakable-${props.size ?? 'md'} ${props.className ?? ''}`}>
      <SpeakButtons text={props.text} ttsKey={props.ttsKey} size={props.size} />
      <SpokenText text={props.text} ttsKey={props.ttsKey} highlight={props.highlight} />
    </span>
  );
}
