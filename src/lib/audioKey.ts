// Gemeinsamer Schlüssel für vorab vertonte Texte (App und Vertonungs-Skript nutzen dieselbe Funktion).

/**
 * Einzelne Wörter klingen mit Satzzeichen am Ende natürlicher (fallende Satzmelodie statt abgehackt).
 * Die Wortpositionen bleiben gleich, es wird nur ein Punkt angehängt.
 */
export function prepareForSpeech(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** cyrb53: schneller 53-Bit-Hash, synchron in Browser und Node. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Dateiname (ohne Endung) für einen gesprochenen Text. */
export function clipKey(text: string): string {
  return cyrb53(prepareForSpeech(text).normalize('NFC')).toString(36);
}

/** Inhalt von public/audio/<dialekt>/manifest.json */
export interface AudioManifest {
  dialect: string;
  provider: string;
  voice: string;
  /** Anzeigename der Stimme, z. B. „Dalia“ */
  voiceLabel: string;
  createdAt: string;
  /** clipKey → Dateiname */
  clips: Record<string, string>;
}
