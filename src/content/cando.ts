// Kann-Beschreibungen je Einheit (WP-11), Stufe A1 des Gemeinsamen Europäischen Referenzrahmens (GER).
// Eigene Formulierungen, zugeordnet zu den GER-Fertigkeiten; keine wörtlichen Deskriptoren des Europarats.
// Prüfung: scripts/test-frequency.ts.
import type { CanDo } from '../lib/cando.ts';

export const CAN_DO: CanDo[] = [
  {
    unit: 'u1',
    items: [
      { skill: 'Gespräch', text: 'Ich kann jemanden begrüßen, mich mit Namen vorstellen und mich verabschieden.' },
      { skill: 'Sprechen', text: 'Ich kann sagen, woher ich komme und wie es mir geht.' },
      { skill: 'Hören', text: 'Ich verstehe einfache Fragen wie „¿Cómo te llamas?“ und „¿De dónde eres?“.' },
    ],
  },
  {
    unit: 'u2',
    items: [
      { skill: 'Gespräch', text: 'Ich kann im Café oder Restaurant etwas zu essen und zu trinken bestellen und nach der Rechnung fragen.' },
      { skill: 'Hören', text: 'Ich verstehe einfache Fragen der Bedienung und einen Preis.' },
      { skill: 'Lesen', text: 'Ich verstehe einfache Wörter auf einer Speisekarte.' },
    ],
  },
  {
    unit: 'u3',
    items: [
      { skill: 'Sprechen', text: 'Ich kann bis zehn zählen, die Uhrzeit sagen und Wochentage nennen.' },
      { skill: 'Gespräch', text: 'Ich kann mich zu einer Uhrzeit und an einem Tag verabreden.' },
      { skill: 'Hören', text: 'Ich verstehe Zahlen, Uhrzeiten und Wochentage, wenn langsam gesprochen wird.' },
    ],
  },
  {
    unit: 'u4',
    items: [
      { skill: 'Sprechen', text: 'Ich kann meine Familie vorstellen und sagen, wie alt jemand ist und was er beruflich macht.' },
      { skill: 'Sprechen', text: 'Ich kann Menschen mit einfachen Wörtern beschreiben.' },
      { skill: 'Gespräch', text: 'Ich kann einfache Fragen zur Familie stellen und beantworten.' },
    ],
  },
  {
    unit: 'u5',
    items: [
      { skill: 'Gespräch', text: 'Ich kann nach dem Weg fragen und einfache Wegbeschreibungen verstehen.' },
      { skill: 'Hören', text: 'Ich verstehe „rechts“, „links“, „geradeaus“, „nah“ und „weit“.' },
      { skill: 'Sprechen', text: 'Ich kann sagen, womit ich fahre und wo etwas in der Stadt ist.' },
    ],
  },
  {
    unit: 'u6',
    items: [
      { skill: 'Gespräch', text: 'Ich kann auf dem Markt und im Geschäft Mengen verlangen, nach dem Preis fragen und bezahlen.' },
      { skill: 'Sprechen', text: 'Ich kann Kleidung und Farben nennen und sagen, was mir gefällt.' },
      { skill: 'Lesen', text: 'Ich verstehe geschriebene Preise und Mengen wie „un kilo“ oder „medio kilo“.' },
    ],
  },
  {
    unit: 'u7',
    items: [
      { skill: 'Sprechen', text: 'Ich kann meinen Tagesablauf mit Uhrzeiten beschreiben.' },
      { skill: 'Sprechen', text: 'Ich kann sagen, was ich in der Freizeit gern mache.' },
      { skill: 'Hören', text: 'Ich verstehe eine kurze, einfache Erzählung über einen Tag.' },
    ],
  },
  {
    unit: 'u8',
    items: [
      { skill: 'Sprechen', text: 'Ich kann meine Wohnung beschreiben und sagen, wo Dinge stehen.' },
      { skill: 'Gespräch', text: 'Ich kann Besuch begrüßen, hereinbitten und etwas anbieten.' },
      { skill: 'Lesen', text: 'Ich verstehe kurze geschriebene Sätze darüber, wo in einer Wohnung etwas steht.' },
    ],
  },
];
