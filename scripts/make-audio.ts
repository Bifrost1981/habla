// Vertont alle spanischen Texte der App einmal mit einer natürlichen neuronalen Stimme.
// Ergebnis: audio/<dialekt>/*.mp3 + manifest.json (außerhalb von Git und Prüfbereich; Vite stellt den
// Ordner unter /audio/ bereit und kopiert ihn in den Build). Die App spielt diese Dateien statt der Gerätestimme.
//
//   npm run audio -- --dry-run                       Texte zählen, nichts senden
//   npm run audio -- --provider pocket --export      Pocket TTS, Schritt 1: Auftrag schreiben
//   bash scripts/vertonen.sh                         Pocket TTS, Schritt 2 (Mac): Lola spricht alle Texte (roh)
//   npm run audio -- --provider pocket               Pocket TTS, Schritt 3: sanft nachbearbeiten, Verzeichnis
//   npm run audio -- --provider azure --dialect es-MX
//   npm run audio -- --provider elevenlabs --dialect es-MX
//
// Zugangsdaten für Azure/ElevenLabs stehen in einer Datei .env im Projektordner (siehe .env.example).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipKey, prepareForSpeech, type AudioManifest } from '../src/lib/audioKey.ts';
import { expandCourse, type MoreContent } from '../src/lib/generate.ts';
import { spokenTexts } from '../src/lib/spokenTexts.ts';
import { readWav, speechEndSample, speechLevelDb } from './audio-signal.ts';
import type { Course } from '../src/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ───── Einstellungen ───── */

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}

function loadEnv() {
  const file = join(root, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = parseArgs(process.argv.slice(2));
loadEnv();
const provider = String(args.provider ?? 'azure');
const dialect = String(args.dialect ?? 'es-ES');
const dryRun = Boolean(args['dry-run']);
const force = Boolean(args.force);
const limit = args.limit ? Number(args.limit) : Infinity;

if (!['es-ES', 'es-MX'].includes(dialect)) {
  console.error('--dialect muss es-ES oder es-MX sein.');
  process.exit(1);
}

/* ───── Alle Texte, die die App vorliest (src/lib/spokenTexts.ts) ───── */

const read = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const course = expandCourse(read('src/content/course.json') as Course, read('src/content/more.json') as MoreContent);
const texts = spokenTexts(course);
const chars = texts.reduce((a, t) => a + prepareForSpeech(t).length, 0);

/* ───── Anbieter ───── */

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Provider {
  voice: string;
  voiceLabel: string;
  /** text: für die Sprachausgabe aufbereitet; key: clipKey des Originaltexts */
  synth: (text: string, key: string) => Promise<Buffer>;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function azure(): Provider {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY und AZURE_SPEECH_REGION fehlen (in .env eintragen).');
  const voice = String(args.voice ?? (dialect === 'es-ES' ? 'es-ES-ElviraNeural' : 'es-MX-DaliaNeural'));
  // Etwas langsamer als normal: angenehm für Lernende.
  const rate = String(args.rate ?? '-12%');
  return {
    voice,
    voiceLabel: voice.replace(/^[a-z]{2}-[A-Z]{2}-/, '').replace(/(Multilingual)?Neural$/, ''),
    synth: async (text) => {
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${dialect}">` +
        `<voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
      const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
          'User-Agent': 'habla-audio',
        },
        body: ssml,
      });
      if (!res.ok) throw new HttpError(res.status, `Azure ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

function elevenlabs(): Provider {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = String(args.voice ?? process.env.ELEVENLABS_VOICE_ID ?? '');
  if (!key || !voice) throw new Error('ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID fehlen (in .env eintragen).');
  const model = String(args.model ?? process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2');
  const speed = Number(args.speed ?? 0.9);
  return {
    voice,
    voiceLabel: String(args.label ?? process.env.ELEVENLABS_VOICE_LABEL ?? 'ElevenLabs'),
    synth: async (text) => {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed },
        }),
      });
      if (!res.ok) throw new HttpError(res.status, `ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

/* Pocket TTS (Kyutai, Gewichte CC-BY-4.0), Stimme „lola“, Einstellung „sanft“ (Entscheidung 2026-11-19).
   Pocket TTS lädt sein Modell von Hugging Face; es läuft deshalb auf dem Mac (scripts/vertonen.sh) und schreibt
   Rohaufnahmen nach testdaten/vertonung/<dialekt>/roh/<schlüssel>.wav. Dieser Schritt bearbeitet sie mit ffmpeg nach
   (gleiche Einstellung wie in der Hörprobe, tools/hoerprobe/hoerprobe.py). */
export const SANFT_FILTER =
  'deesser=i=0.6:m=0.6,equalizer=f=3200:t=q:w=1.4:g=-5,equalizer=f=1800:t=q:w=1:g=-1.5,' +
  'highshelf=f=5000:g=-7,lowpass=f=9500,lowshelf=f=200:g=3.5,' +
  'acompressor=threshold=-22dB:ratio=2.5:attack=12:release=140:makeup=2,alimiter=limit=0.63:level=disabled';
const jobDir = join(root, 'testdaten', 'vertonung', dialect);

function exportPocketJob() {
  mkdirSync(join(jobDir, 'roh'), { recursive: true });
  const items = texts.map((t) => ({ key: clipKey(t), text: prepareForSpeech(t) }));
  writeFileSync(join(jobDir, 'auftrag.json'), JSON.stringify({ dialect, language: 'spanish', voice: 'lola', items }, null, 1));
  const present = items.filter((j) => existsSync(join(jobDir, 'roh', `${j.key}.wav`))).length;
  console.log(`Auftrag: testdaten/vertonung/${dialect}/auftrag.json mit ${items.length} Texten (${present} Rohaufnahmen schon da).`);
  console.log('Weiter auf dem Mac: bash scripts/vertonen.sh');
}

/** Ziel-Sprechpegel vor der Nachbearbeitung (Median der Sätze in den Rohaufnahmen); Anhebung höchstens +12 dB. */
export const POCKET_TARGET_DB = -20;

/** Sprechtempo: Lola etwas langsamer (Rückmeldung 2026-11-19: „ein ganz kleines bisschen langsamer“), Tonhöhe bleibt. */
export const POCKET_TEMPO = 0.92;
/** Nach dem Ende der Sprache: so lange ausblenden, dann so viel Stille anhängen (Sekunden). */
const END_FADE_S = 0.03;
const END_PAD_S = 0.12;

/** ffmpeg-Filter für eine Rohaufnahme: Pegel angleichen, Atmen am Ende abschneiden, etwas langsamer, sanft. */
export function pocketFilter(wav: Buffer): string {
  const { samples, rate } = readWav(wav);
  const level = speechLevelDb(samples, rate);
  if (level < -60) throw new HttpError(422, 'Rohaufnahme ist stumm – scripts/vertonen.sh erneut starten');
  const gain = Math.min(12, Math.max(-6, POCKET_TARGET_DB - level)).toFixed(1);
  const end = speechEndSample(samples, rate);
  const cut = end === null ? [] : [`atrim=end=${(end / rate + END_FADE_S).toFixed(3)}`, `afade=t=out:st=${(end / rate).toFixed(3)}:d=${END_FADE_S}`];
  return [`volume=${gain}dB`, ...cut, `atempo=${POCKET_TEMPO}`, SANFT_FILTER, `apad=pad_dur=${END_PAD_S}`].join(',');
}

function pocket(): Provider {
  if (dialect !== 'es-ES') throw new Error('Pocket TTS hat nur eine spanische Stimme (Spanien): --dialect es-ES');
  return {
    voice: `pocket-tts-4.0.1/lola+sanft+pegel+ohne-atem+tempo${POCKET_TEMPO}`,
    voiceLabel: 'Lola',
    synth: async (_text, key) => {
      const raw = join(jobDir, 'roh', `${key}.wav`);
      if (!existsSync(raw)) throw new HttpError(404, `keine Rohaufnahme (${key}.wav)`); // 404: nicht wiederholen
      const af = pocketFilter(readFileSync(raw));
      return execFileSync('ffmpeg', ['-loglevel', 'error', '-i', raw, '-af', af, '-codec:a', 'libmp3lame', '-q:a', '4', '-f', 'mp3', 'pipe:1']);
    },
  };
}

/** Testmodus ohne Internet: kurze Töne statt Sprache (prüft nur die Technik, braucht ffmpeg). */
function testTones(): Provider {
  return {
    voice: 'test',
    voiceLabel: 'Testton',
    synth: async (text) => {
      const dur = Math.max(0.4, text.length * 0.06).toFixed(2);
      return execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${dur}`, '-ac', '1', '-ar', '24000', '-b:a', '48k', '-f', 'mp3', 'pipe:1']);
    },
  };
}

/* ───── Ablauf ───── */

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e instanceof HttpError ? e.status === 429 || e.status >= 500 : true;
      if (!retryable || attempt >= 4) throw new Error(`„${label}“: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function main() {
  console.log(`${texts.length} Texte, ${chars.toLocaleString('de-DE')} Zeichen (${dialect}).`);
  if (provider === 'azure') console.log('Azure-Gratiskontingent (F0): 500.000 Zeichen pro Monat – reicht für beide Dialekte.');
  if (dryRun) {
    console.log('\nProbelauf, es wird nichts gesendet. Die ersten 15 Texte:');
    texts.slice(0, 15).forEach((t) => console.log(`  ${prepareForSpeech(t)}`));
    return;
  }

  if (provider === 'pocket' && args.export) return exportPocketJob();
  const p =
    provider === 'pocket' ? pocket() : provider === 'azure' ? azure() : provider === 'elevenlabs' ? elevenlabs() : provider === 'test' ? testTones() : null;
  if (!p) throw new Error(`Unbekannter Anbieter „${provider}“ (pocket, azure, elevenlabs oder test).`);

  const outDir = join(root, 'audio', dialect);
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, 'manifest.json');
  const old: AudioManifest | null = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  // Andere Stimme als beim letzten Mal: alles neu vertonen.
  const sameVoice = old?.voice === p.voice && old?.provider === provider;

  const clips: Record<string, string> = {};
  const todo: { text: string; file: string; key: string }[] = [];
  for (const text of texts) {
    const key = clipKey(text);
    const file = `${key}.mp3`;
    const have = !force && sameVoice && old?.clips[key] && existsSync(join(outDir, file));
    // Pocket: neu gesprochene Rohaufnahme (z. B. nach der Selbstprüfung) heißt neu nachbearbeiten.
    const raw = join(jobDir, 'roh', `${key}.wav`);
    const stale = provider === 'pocket' && have && existsSync(raw) && statSync(raw).mtimeMs > statSync(join(outDir, file)).mtimeMs;
    if (have && !stale) clips[key] = file;
    else todo.push({ text, file, key });
  }
  const batch = todo.slice(0, limit);
  console.log(`${Object.keys(clips).length} schon vorhanden, ${batch.length} werden jetzt vertont mit ${p.voiceLabel} (${provider}).`);

  const saveManifest = () => {
    const m: AudioManifest = { dialect, provider, voice: p.voice, voiceLabel: p.voiceLabel, createdAt: new Date().toISOString(), clips };
    writeFileSync(manifestPath, JSON.stringify(m, null, 1));
  };

  let done = 0;
  let failed = 0;
  const queue = [...batch];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const buf = await withRetry(() => p.synth(prepareForSpeech(job.text), job.key), job.text);
        writeFileSync(join(outDir, job.file), buf);
        clips[job.key] = job.file;
      } catch (e) {
        failed++;
        console.error(`  Fehler: ${(e as Error).message}`);
        if (failed >= 5 && done === 0)
          throw new Error(
            provider === 'pocket'
              ? 'Abbruch: Für die ersten Texte gibt es keine Rohaufnahmen. Lief scripts/vertonen.sh auf dem Mac?'
              : 'Abbruch: die ersten Anfragen schlagen alle fehl. Stimmen Schlüssel und Region?',
          );
      }
      done++;
      if (done % 25 === 0) {
        saveManifest();
        process.stdout.write(`  ${done}/${batch.length}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: provider === 'test' ? 4 : 3 }, worker));
  saveManifest();
  console.log(`Fertig: ${Object.keys(clips).length} Aufnahmen in audio/${dialect}${failed ? `, ${failed} fehlgeschlagen (nochmal starten holt sie nach)` : ''}.`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
