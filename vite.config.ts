import { createHash } from 'node:crypto';
import { cpSync, createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        → normale PWA in dist/
// `npm run build:single` → eine einzige HTML-Datei in dist-single/ (zum Teilen/Ausprobieren)

const AUDIO_DIR = resolve(__dirname, 'audio');
const TYPES: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.json': 'application/json' };

/**
 * Vertonte Aufnahmen liegen in audio/<dialekt>/ (außerhalb von Git und Prüfbereich, siehe scripts/make-audio.ts).
 * Entwicklung: unter /audio/ ausliefern, mit Range-Anfragen (Safari spielt Audio nur damit ab).
 * Build: nach <outDir>/audio/ kopieren, wie es bisher public/audio tat.
 */
function hablaAudio(): Plugin {
  const off = process.env.HABLA_AUDIO === 'off'; // Browser-Test: ohne Aufnahmen bauen
  return {
    name: 'habla-audio',
    configureServer(server) {
      if (off) return;
      server.middlewares.use('/audio', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const file = normalize(join(AUDIO_DIR, rel));
        if (!file.startsWith(AUDIO_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        const size = statSync(file).size;
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        if (m && (m[1] || m[2])) {
          const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
          const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          if (start > end || start >= size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${size}`);
            return res.end();
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          return createReadStream(file, { start, end }).pipe(res);
        }
        res.setHeader('Content-Length', String(size));
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      if (off || !existsSync(AUDIO_DIR) || !options.dir) return;
      cpSync(AUDIO_DIR, join(options.dir, 'audio'), { recursive: true, filter: (src) => !src.endsWith('.gitignore') });
    },
  };
}

/** Alle Dateien unter dir (relativ, mit „/“), rekursiv. */
function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p, base) : [relative(base, p).split(sep).join('/')];
  });
}

/**
 * Service Worker (WP-19): trägt die Liste der App-Dateien zum Vorab-Speichern und die Versionen in dist/sw.js ein.
 * App-Version = Hash über alle App-Dateien; Aufnahmen-Version = Hash über manifest.json und die Dateigrößen der
 * Aufnahmen. Aufnahmen selbst werden nicht vorab gespeichert (rund 9 MB), sondern beim Abspielen oder auf Wunsch.
 */
function hablaServiceWorker(): Plugin {
  return {
    name: 'habla-sw',
    writeBundle(options) {
      const out = options.dir;
      if (!out || !existsSync(join(out, 'sw.js'))) return;
      const files = listFiles(out)
        .filter((f) => f !== 'sw.js' && !f.startsWith('audio/') && !f.endsWith('.map') && !f.endsWith('.gitignore') && !f.endsWith('.woff'))
        .sort();
      const appHash = createHash('sha256');
      for (const f of files) appHash.update(f).update(readFileSync(join(out, f)));
      const audioHash = createHash('sha256');
      // Aus der Quelle, nicht aus dist/audio: writeBundle-Schritte laufen parallel zum Kopieren der Aufnahmen.
      const audioDir = AUDIO_DIR;
      if (process.env.HABLA_AUDIO !== 'off' && existsSync(audioDir))
        for (const f of listFiles(audioDir).sort()) audioHash.update(f).update(f.endsWith('.json') ? readFileSync(join(audioDir, f)) : String(statSync(join(audioDir, f)).size));
      const precache = ['./', ...files];
      const sw = readFileSync(join(out, 'sw.js'), 'utf8')
        .replace(/^const VERSION = .*__HABLA_VERSION__$/m, `const VERSION = '${appHash.digest('hex').slice(0, 12)}';`)
        .replace(/^const PRECACHE = .*__HABLA_PRECACHE__$/m, `const PRECACHE = ${JSON.stringify(precache)};`)
        .replace(/^const AUDIO_VERSION = .*__HABLA_AUDIO_VERSION__$/m, `const AUDIO_VERSION = '${audioHash.digest('hex').slice(0, 12)}';`);
      if (/\/\/ __HABLA_\w+__$/m.test(sw)) throw new Error('sw.js: Platzhalter nicht ersetzt');
      writeFileSync(join(out, 'sw.js'), sw);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative Pfade: Die App läuft auch unter einem Unterpfad wie …/habla/ (B7).
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react(), hablaAudio(), hablaServiceWorker()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
