// Offline (WP-19): alle Aufnahmen eines Dialekts auf einmal laden. Der Service Worker (public/sw.js) speichert jede
// vollständig geladene Aufnahme; danach spielen sie auch ohne Netz. Ohne Service Worker (Entwicklung, Einzeldatei,
// privater Modus) gibt es nichts zu speichern.
import type { AudioManifest } from './audioKey.ts';

/** Ein Service Worker kontrolliert die Seite (Voraussetzung fürs Offline-Speichern). */
export function offlineReady(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
}

/** Hinweis zur Spracherkennung (P1): wohin das Mikrofon-Audio geht. */
export const SPEECH_PRIVACY_NOTE =
  'Die Spracherkennung übernimmt dein Browser: Chrome und Edge schicken die Aufnahme dafür an Google bzw. Microsoft, ' +
  'Safari an Apple (auf neueren Geräten teils direkt auf dem Gerät). Habla selbst speichert und sendet keine Aufnahmen. ' +
  'Ohne Mikrofon kannst du stattdessen Sätze bauen.';

/**
 * Lädt alle Aufnahmen aus dem Verzeichnis (je 4 gleichzeitig). `onProgress(fertig, gesamt)` nach jeder Datei.
 * Gibt die Zahl der erfolgreich geladenen Dateien zurück.
 */
export async function saveRecordingsOffline(
  manifest: AudioManifest,
  onProgress: (done: number, total: number) => void,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const files = [...new Set(Object.values(manifest.clips))];
  let next = 0;
  let done = 0;
  let ok = 0;
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++];
      try {
        const res = await fetchFn(`audio/${manifest.dialect}/${f}`);
        if (res.ok) {
          await res.arrayBuffer(); // ganz lesen: erst dann ist die Datei gespeichert
          ok++;
        }
      } catch {
        /* einzelne Datei fehlt: weiter mit den anderen */
      }
      onProgress(++done, files.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return ok;
}
