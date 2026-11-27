// Signalanalyse für die Nachbearbeitung der Rohaufnahmen (WP-03): Sprechpegel und Ende der Sprache.
// Getrennt von make-audio.ts, damit test-audio.ts die Funktionen mit künstlichen Signalen prüfen kann.

/** 16-Bit-Mono-WAV lesen: Abtastwerte (−1…1) und Abtastrate. */
export function readWav(wav: Buffer): { samples: Float32Array; rate: number } {
  let off = 12;
  while (off + 8 <= wav.length && wav.toString('ascii', off, off + 4) !== 'data') off += 8 + wav.readUInt32LE(off + 4);
  const start = off + 8;
  const n = Math.max(0, Math.floor((Math.min(wav.length, start + wav.readUInt32LE(off + 4)) - start) / 2));
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = wav.readInt16LE(start + 2 * i) / 32768;
  return { samples, rate: wav.readUInt32LE(24) };
}

/** 16-Bit-Mono-WAV schreiben (für Tests). */
export function writeWav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + 2 * i));
  return b;
}

type Frame = { rms: number; zcr: number };
const FRAME_S = 0.02;

function frames(samples: Float32Array, rate: number): Frame[] {
  const hop = Math.max(1, Math.round(rate * FRAME_S));
  const out: Frame[] = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let sum = 0;
    let zc = 0;
    for (let j = 0; j < hop; j++) {
      const v = samples[i + j];
      sum += v * v;
      if (j && Math.sign(v) !== Math.sign(samples[i + j - 1])) zc++;
    }
    out.push({ rms: Math.sqrt(sum / hop), zcr: zc / hop });
  }
  return out;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);

/** Sprechpegel: RMS der 20-ms-Fenster bis 20 dB unter dem lautesten (dBFS); −99 bei Stille. */
export function speechLevelDb(samples: Float32Array, rate: number): number {
  const win = frames(samples, rate).map((f) => f.rms);
  const max = Math.max(0, ...win);
  const loud = win.filter((x) => max > 0 && x >= max / 10);
  if (!loud.length) return -99;
  return db(Math.sqrt(loud.reduce((a, x) => a + x * x, 0) / loud.length));
}

/* Ende der Sprache. Pocket TTS holt am Ende mancher Aufnahmen hörbar Luft (Rückmeldung 2026-11-19: „siete“,
   „mañana“; 76 von 880 Aufnahmen). Das Atmen kommt immer nach einer Pause hinter dem letzten stimmhaften Laut
   und ist ein Rauschen (Nulldurchgangsrate ~0,2) ohne Stimme. Ein S am Wortende hängt dagegen ohne Pause am
   Vokal und bleibt erhalten, ebenso ein Laut nach einem kurzen Verschluss („sándwich“, „leche“). Was sonst nach der
   Pause kommt (Atmen, Knacken), wird abgeschnitten. */
const VOICED_BELOW_PEAK_DB = 25; // stimmhaft: höchstens so weit unter der lautesten Stelle …
const VOICED_MAX_ZCR = 0.12; //       … und wenig Nulldurchgänge (Vokal, Nasal, nicht Rauschen)
const PAUSE_BELOW_PEAK_DB = 42; // Pause: leiser als das
const PAUSE_MIN_S = 0.06; //          … mindestens so lange
const SIBILANT_MIN_ZCR = 0.3; // Zischlaut (ch, s: 0,31–0,5); Atmen 0,19–0,27 …
const AFTER_PAUSE_BELOW_PEAK_DB = 30; // … oder leise (−38 dB, „Sevilla“); das „che“ in „leche“: −19 dB

/** Abtastwert, an dem nach dem letzten stimmhaften Laut die erste Pause beginnt; null ohne solche Pause. */
export function speechEndSample(samples: Float32Array, rate: number): number | null {
  const f = frames(samples, rate);
  if (!f.length) return null;
  const peak = db(Math.max(...f.map((x) => x.rms)));
  const voiced = f.map((x) => db(x.rms) > peak - VOICED_BELOW_PEAK_DB && x.zcr < VOICED_MAX_ZCR);
  // Ein einzelnes stimmhaft wirkendes Fenster ist ein Knacken (z. B. ganz am Ende von „entiendo“), kein Laut:
  // Ein Laut dauert mindestens zwei Fenster (40 ms).
  let last = -1;
  voiced.forEach((v, i) => {
    if (v && i > 0 && voiced[i - 1]) last = i;
  });
  if (last < 0) return null;
  const need = Math.round(PAUSE_MIN_S / FRAME_S);
  const quiet = (i: number) => db(f[i].rms) < peak - PAUSE_BELOW_PEAK_DB;
  let run = 0;
  for (let i = last + 1; i < f.length; i++) {
    run = quiet(i) ? run + 1 : 0;
    if (run < need) continue;
    const pause = i - need + 1;
    // Was nach der Pause kommt: Ist es ein Laut (z. B. „ch“ in „sándwich“ oder „che“ in „leche“ nach dem
    // Verschluss), gehört es zum Wort und es geht dahinter weiter.
    let q = i + 1;
    while (q < f.length && quiet(q)) q++;
    let r = q;
    while (r < f.length && !quiet(r)) r++;
    // Laut statt Atmen: mindestens zwei laute Fenster, die zischen (ch, s) oder klingen (Vokal) – Atmen liegt
    // mit seiner Nulldurchgangsrate dazwischen oder ist leise.
    const speechLike = f.slice(q, r).filter(
      (x) => db(x.rms) > peak - AFTER_PAUSE_BELOW_PEAK_DB && (x.zcr >= SIBILANT_MIN_ZCR || x.zcr < VOICED_MAX_ZCR),
    ).length;
    const isSound = speechLike >= 2;
    if (!isSound) return pause * Math.max(1, Math.round(rate * FRAME_S));
    run = 0;
    i = r - 1;
  }
  return null;
}

/** Sekunden Geräusch (lauter als 40 dB unter der lautesten Stelle) nach dem Ende der Sprache – Prüfung der fertigen Aufnahmen. */
export function noiseAfterEndS(samples: Float32Array, rate: number): number {
  const end = speechEndSample(samples, rate);
  if (end === null) return 0;
  const f = frames(samples, rate);
  const peak = db(Math.max(...f.map((x) => x.rms)));
  const from = Math.floor(end / Math.max(1, Math.round(rate * FRAME_S)));
  return f.slice(from).filter((x) => db(x.rms) > peak - 40).length * FRAME_S;
}
