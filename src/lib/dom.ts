// Kleine DOM-Hilfen.

/** Ist ein modaler Dialog offen? Dann dürfen Tastenkürzel der Übung dahinter nichts auslösen. */
export function modalOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]') !== null;
}
