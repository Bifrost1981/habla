// Offline-Unterstützung für Habla (WP-19).
// - App-Dateien: beim Installieren vollständig vorab im Cache (B5), danach Cache zuerst; Seitenaufrufe Netz zuerst.
// - Aufnahmen (audio/…): beim ersten Abspielen ganz (ohne Range) geladen und gespeichert; Range-Anfragen des
//   Audio-Elements werden aus der gespeicherten Datei beantwortet (B6). „Aufnahmen offline speichern“ in den
//   Einstellungen lädt alle auf einmal.
// - Alle Pfade relativ zum Gültigkeitsbereich: läuft auch unter einem Unterpfad (B7).
// Der Build (vite.config.ts, hablaServiceWorker) ersetzt die beiden Zeilen mit __HABLA_…__.
const VERSION = 'dev'; // __HABLA_VERSION__
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg']; // __HABLA_PRECACHE__
const AUDIO_VERSION = 'dev'; // __HABLA_AUDIO_VERSION__

const APP_CACHE = `habla-app-${VERSION}`;
const AUDIO_CACHE = `habla-audio-${AUDIO_VERSION}`;
const scope = () => self.registration.scope;
const abs = (path) => new URL(path, scope()).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((c) => c.addAll(PRECACHE.map(abs)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('habla-') && k !== APP_CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Antwort mit Teilbereich aus einer vollständig gespeicherten Datei (für Safari/Chrome-Audio mit Range). */
async function rangeResponse(full, rangeHeader) {
  const buf = await full.arrayBuffer();
  const size = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
  if (!m || (!m[1] && !m[2])) {
    return new Response(buf, { status: 200, headers: { 'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg', 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function audioFile(request) {
  const key = request.url.split('#')[0];
  const cache = await caches.open(AUDIO_CACHE);
  let full = await cache.match(key);
  if (!full) {
    const res = await fetch(key); // ohne Range: ganze Datei, Status 200, speicherbar
    if (!res.ok || res.status !== 200) return res;
    await cache.put(key, res.clone());
    full = res;
  }
  return rangeResponse(full.clone(), request.headers.get('range'));
}

async function networkFirst(request, cacheName, fallback) {
  try {
    const res = await fetch(request);
    if (res.ok && res.status === 200) {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(request, copy)).catch(() => {});
    }
    return res;
  } catch {
    const hit = (await caches.match(request, { ignoreSearch: true })) || (fallback && (await caches.match(abs(fallback))));
    return hit || Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) {
    const copy = res.clone();
    caches.open(APP_CACHE).then((c) => c.put(request, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !request.url.startsWith(scope())) return;
  const rel = request.url.slice(scope().length);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_CACHE, 'index.html'));
  } else if (rel.startsWith('audio/') && rel.endsWith('/manifest.json')) {
    event.respondWith(networkFirst(request, AUDIO_CACHE));
  } else if (rel.startsWith('audio/')) {
    event.respondWith(audioFile(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
