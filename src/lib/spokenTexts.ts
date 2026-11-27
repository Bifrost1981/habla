// Alle Texte, die Habla vorlesen kann. Grundlage für die Vertonung (scripts/make-audio.ts)
// und ihren Test (scripts/test-audio.ts). Neue Vorlese-Orte müssen hier ergänzt werden;
// der Test bemerkt neue Aufrufe von say()/speak() im Code.
import type { Course, Exercise } from '../types.ts';
import { FIXED_PHRASES } from '../content/phrases.ts';
import { buildAssessment } from './assessment.ts';
import { distractorPool } from './course.ts';
import { STORIES } from './stories.ts';
import { ROLEPLAYS } from './roleplays.ts';
import { tiles } from './text.ts';

export function spokenTexts(course: Course): string[] {
  const set = new Set<string>();
  const add = (t: string | undefined) => {
    const s = t?.trim();
    if (s) set.add(s);
  };
  const vm = new Map(course.vocab.map((v) => [v.id, v]));

  // Vokabeln: Karteikarte (Wort und Beispielsatz), Bildauswahl, Paare, Wörter-Chips im Ergebnis.
  // Wiederholung: Beispielsatz als Hör-Diktat (Kacheln) und als Übersetzen-Sprechen (Ersatz: Satz bauen).
  for (const v of course.vocab) {
    add(v.es);
    add(v.exEs);
    tiles(v.exEs).forEach(add);
  }
  // Ablenker-Kacheln beim Satzbauen, im Diktat und in Ersatzübungen
  distractorPool(course).forEach(add);

  const fromExercise = (e: Exercise) => {
    switch (e.type) {
      case 'card':
        add(vm.get(e.vocab)?.es);
        add(vm.get(e.vocab)?.exEs);
        break;
      case 'pick':
        add(vm.get(e.target)?.es);
        break;
      case 'match':
        e.vocab.forEach((id) => add(vm.get(id)?.es));
        break;
      case 'gap':
        add(e.es.replace('___', e.answer));
        break;
      case 'build':
      case 'dictation':
        add(e.es);
        tiles(e.es).forEach(add);
        e.extra.forEach(add);
        break;
      case 'speak':
      case 'say':
        add(e.es);
        tiles(e.es).forEach(add); // Ersatz ohne Mikrofon: Satz bauen
        break;
    }
  };
  course.units.forEach((u) => u.lessons.forEach((l) => l.exercises.forEach(fromExercise)));

  // Vor- und Nachtests je Einheit
  for (const u of course.units) buildAssessment(course, u.id).forEach((item) => add(item.es));

  // Hörgeschichten: jeder Satz einzeln (ganz anhören = Satz für Satz nacheinander)
  STORIES.forEach((st) => st.lines.forEach((l) => add(l.es)));

  // Rollenspiele: Gegenseite, Schlusssatz und Lauras Musterantwort (Hörhilfe; im Verlauf auch die gesprochene Formulierung)
  ROLEPLAYS.forEach((rp) => {
    rp.turns.forEach((t) => {
      if (t.partner) add(t.partner.es);
      t.answers.forEach(add);
    });
    add(rp.end.es);
  });

  // Feste Sätze: Stimmproben, Ergebnis-Überschriften
  FIXED_PHRASES.forEach(add);
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}
