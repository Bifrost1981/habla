// Kurze Töne (per WebAudio erzeugt, keine Dateien nötig) und Vibration.

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playCorrect() {
  tone(659, 0, 0.14);
  tone(988, 0.1, 0.22);
}

export function playWrong() {
  tone(220, 0, 0.22, 'triangle', 0.14);
  tone(196, 0.12, 0.26, 'triangle', 0.12);
}

export function playTap() {
  tone(880, 0, 0.05, 'sine', 0.05);
}

export function playFinish() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25));
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* nicht unterstützt */
  }
}
