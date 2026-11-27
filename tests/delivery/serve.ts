// Testserver für den Auslieferungstest (WP-19): liefert dist/ unter einem Unterpfad aus (wie GitHub Pages
// …/habla/) und stellt Testaufnahmen bereit: ein Verzeichnis mit allen vorlesbaren Texten, jede Datei ein kurzer
// Ton. Unterstützt Range-Anfragen (206) wie ein echter Server.
// Aufruf: node --experimental-strip-types --no-warnings tests/delivery/serve.ts <port>
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { clipKey } from '../../src/lib/audioKey.ts';
import { expandCourse, type MoreContent } from '../../src/lib/generate.ts';
import { spokenTexts } from '../../src/lib/spokenTexts.ts';

const root = new URL('../..', import.meta.url).pathname;
const DIST = join(root, 'dist');
const BASE = '/habla/';
const port = Number(process.argv[2] ?? 4174);
const read = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const course = expandCourse(read('src/content/course.json'), read('src/content/more.json') as MoreContent);

/** 0,3 s Sinuston als WAV (16 Bit, 16 kHz). */
function tone(): Buffer {
  const rate = 16000;
  const n = Math.round(rate * 0.3);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + 2 * i);
  return b;
}
const TONE = tone();
const clips = Object.fromEntries(spokenTexts(course).map((t) => [clipKey(t), `${clipKey(t)}.wav`]));
const MANIFEST = Buffer.from(
  JSON.stringify({ dialect: 'es-ES', provider: 'test', voice: 'testton', voiceLabel: 'Testton', generatedAt: '2026-11-24T00:00:00Z', clips }),
);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
};

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/habla') {
    res.writeHead(301, { Location: BASE }).end();
    return;
  }
  if (!path.startsWith(BASE)) {
    res.writeHead(404).end('nur unter /habla/');
    return;
  }
  const rel = path.slice(BASE.length) || 'index.html';
  let body: Buffer | null = null;
  if (rel === 'audio/es-ES/manifest.json') body = MANIFEST;
  else if (/^audio\/es-ES\/[a-z0-9]+\.wav$/.test(rel) && Object.values(clips).includes(rel.split('/').pop()!)) body = TONE;
  else {
    const file = normalize(join(DIST, rel));
    if (file.startsWith(DIST + sep) && existsSync(file) && statSync(file).isFile()) body = readFileSync(file);
  }
  if (!body) {
    res.writeHead(404).end();
    return;
  }
  const headers: Record<string, string> = { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, body.length - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': String(end - start + 1) });
    res.end(body.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': String(body.length) });
  res.end(body);
}).listen(port, () => console.log(`Habla unter http://localhost:${port}${BASE}`));
