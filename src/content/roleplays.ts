// Geführte Rollenspiele (WP-09), je Einheit eins. Lauras Antworten enthalten nur Wörter, die bis zu dieser Einheit
// im Kurs vorkommen; die erste Antwort ist die Musterantwort. Prüfung: scripts/test-roleplay.ts.
import type { Roleplay } from '../lib/roleplays.ts';

export const ROLEPLAYS: Roleplay[] = [
  {
    unit: 'u1',
    title: 'Im Sprachcafé',
    goal: 'Stell dich Marta vor, sag, woher du kommst, und frag, wie es ihr geht.',
    partner: 'Marta, im Sprachcafé',
    turns: [
      {
        partner: { es: '¡Hola! Me llamo Marta. ¿Y tú?', de: 'Hallo! Ich heiße Marta. Und du?' },
        task: 'Grüß zurück und sag, dass du Laura heißt.',
        answers: ['Hola, me llamo Laura.', 'Hola, soy Laura.', 'Me llamo Laura.', 'Soy Laura.'],
      },
      {
        partner: { es: 'Mucho gusto, Laura. ¿De dónde eres?', de: 'Freut mich, Laura. Woher kommst du?' },
        task: 'Sag, dass du aus Berlin kommst.',
        answers: ['Soy de Berlín.', 'Soy de Alemania, de Berlín.', 'De Berlín.'],
      },
      {
        partner: { es: '¡Qué bien! Yo soy de Madrid.', de: 'Wie schön! Ich komme aus Madrid.' },
        task: 'Frag Marta, wie es ihr geht.',
        answers: ['¿Cómo estás?', '¿Qué tal?', '¿Y tú, cómo estás?'],
      },
      {
        partner: { es: 'Muy bien, gracias. ¡Hasta luego, Laura!', de: 'Sehr gut, danke. Bis später, Laura!' },
        task: 'Verabschiede dich.',
        answers: ['¡Hasta luego, Marta!', 'Hasta luego.', 'Adiós, Marta.', 'Adiós.'],
      },
    ],
    end: { es: '¡Adiós!', de: 'Tschüss!' },
    names: ['Marta', 'Laura', 'Madrid', 'Berlín', 'Alemania'],
    glossary: {},
  },
  {
    unit: 'u2',
    title: 'Frühstück im Café',
    goal: 'Bestell einen Milchkaffee ohne Zucker und ein Croissant und frag nach der Rechnung.',
    partner: 'die Kellnerin im Café',
    turns: [
      {
        partner: { es: '¡Buenos días! ¿Qué quiere?', de: 'Guten Morgen! Was möchten Sie?' },
        task: 'Bestell einen Milchkaffee.',
        answers: ['Un café con leche, por favor.', 'Un café con leche.', 'Quiero un café con leche, por favor.', 'Quiero un café con leche.'],
      },
      {
        partner: { es: '¿Con azúcar?', de: 'Mit Zucker?' },
        task: 'Sag: ohne Zucker, danke.',
        answers: ['Sin azúcar, gracias.', 'No, sin azúcar, gracias.', 'Sin azúcar.'],
      },
      {
        partner: { es: '¿Y un pastel? Es muy rico.', de: 'Und ein Stück Kuchen? Er ist sehr lecker.' },
        task: 'Sag: nein, lieber ein Croissant, bitte.',
        answers: ['No, un cruasán, por favor.', 'Un cruasán, por favor.', 'No, quiero un cruasán.'],
      },
      {
        partner: { es: 'Muy bien. Un café con leche y un cruasán.', de: 'Sehr gut. Ein Milchkaffee und ein Croissant.' },
        task: 'Frag nach der Rechnung.',
        answers: ['La cuenta, por favor.', '¿Cuánto cuesta?', '¿Cuánto es?'],
      },
    ],
    end: { es: 'Son cinco euros. ¡Gracias!', de: 'Das macht fünf Euro. Danke!' },
    names: [],
    glossary: { quiere: 'Sie möchten', son: 'es sind', cinco: 'fünf', euros: 'Euro' },
  },
  {
    unit: 'u3',
    title: 'Verabredung mit Sofía',
    goal: 'Verabrede dich mit Sofía zum Tennis: Samstag und Sonntag passen nicht, Montagnachmittag schon.',
    partner: 'Sofía, am Telefon',
    turns: [
      {
        partner: { es: 'Hola, Laura. ¿Tenis el sábado?', de: 'Hallo, Laura. Tennis am Samstag?' },
        task: 'Sag: Am Samstag gehe ich einkaufen.',
        answers: ['El sábado voy de compras.', 'No, el sábado voy de compras.'],
      },
      {
        partner: { es: '¿Y el domingo?', de: 'Und am Sonntag?' },
        task: 'Sag: Nein, am Sonntag ruhe ich mich aus.',
        answers: ['No, el domingo descanso.', 'El domingo descanso.'],
      },
      {
        partner: { es: '¿Y el lunes?', de: 'Und am Montag?' },
        task: 'Sag: Ja, am Montagnachmittag.',
        answers: ['Sí, el lunes por la tarde.', 'El lunes por la tarde.', 'Sí, por la tarde.'],
      },
      {
        partner: { es: '¡Muy bien! ¡Hasta el lunes!', de: 'Sehr gut! Bis Montag!' },
        task: 'Verabschiede dich bis Montag.',
        answers: ['¡Hasta el lunes, Sofía!', 'Hasta el lunes.', 'Adiós, hasta el lunes.'],
      },
    ],
    end: { es: '¡Adiós, Laura!', de: 'Tschüss, Laura!' },
    names: ['Laura', 'Sofía'],
    glossary: {},
  },
  {
    unit: 'u4',
    title: 'Pedros Mutter',
    goal: 'Stell dich Pedros Mutter vor und erzähl von deinem Bruder.',
    partner: 'Carmen, Pedros Mutter',
    turns: [
      {
        partner: { es: 'Hola, soy Carmen, la madre de Pedro.', de: 'Hallo, ich bin Carmen, Pedros Mutter.' },
        task: 'Sag, dass du Laura bist, die Freundin von Pedro.',
        answers: ['Hola, soy Laura, la amiga de Pedro.', 'Soy Laura, la amiga de Pedro.', 'Me llamo Laura. Soy la amiga de Pedro.'],
      },
      {
        partner: { es: 'Mucho gusto. ¿Tienes hermanos?', de: 'Freut mich. Hast du Geschwister?' },
        task: 'Sag: Ja, ich habe einen Bruder.',
        answers: ['Sí, tengo un hermano.', 'Tengo un hermano.'],
      },
      {
        partner: { es: '¿Y cómo se llama?', de: 'Und wie heißt er?' },
        task: 'Sag: Er heißt Max.',
        answers: ['Se llama Max.', 'Mi hermano se llama Max.'],
      },
      {
        partner: { es: '¿Vive en Berlín?', de: 'Wohnt er in Berlin?' },
        task: 'Sag: Nein, er wohnt in Mexiko.',
        answers: ['No, vive en México.', 'No, mi hermano vive en México.', 'Vive en México.'],
      },
    ],
    end: { es: '¡Qué bien! México es muy bonito.', de: 'Wie schön! Mexiko ist sehr schön.' },
    names: ['Carmen', 'Pedro', 'Laura', 'Max', 'Berlín', 'México'],
    glossary: { bonito: 'schön' },
  },
  {
    unit: 'u5',
    title: 'Der Weg zum Bahnhof',
    goal: 'Frag eine Frau nach dem Weg zum Bahnhof und nach einem Supermarkt.',
    partner: 'eine Frau auf der Straße',
    turns: [
      {
        task: 'Sprich die Frau höflich an und frag, wo der Bahnhof ist.',
        answers: ['Disculpe, ¿dónde está la estación?', 'Perdón, ¿dónde está la estación?', '¿Dónde está la estación?'],
      },
      {
        partner: { es: 'Siga todo recto y gire a la derecha.', de: 'Gehen Sie geradeaus und biegen Sie rechts ab.' },
        task: 'Frag, ob es weit ist.',
        answers: ['¿Está lejos?', '¿Está muy lejos?'],
      },
      {
        partner: { es: 'No, está cerca. Cinco minutos a pie.', de: 'Nein, es ist nah. Fünf Minuten zu Fuß.' },
        task: 'Frag, ob es einen Supermarkt in der Nähe gibt.',
        answers: ['¿Hay un supermercado cerca?', '¿Hay un supermercado?', 'Perdón, ¿hay un supermercado cerca?'],
      },
      {
        partner: { es: 'Sí, en la plaza, cerca de la farmacia.', de: 'Ja, auf dem Platz, in der Nähe der Apotheke.' },
        task: 'Bedank dich.',
        answers: ['Muchas gracias.', 'Gracias, adiós.', 'Muchas gracias, adiós.'],
      },
    ],
    end: { es: 'De nada. ¡Adiós!', de: 'Gern geschehen. Auf Wiedersehen!' },
    names: [],
    glossary: { minutos: 'Minuten' },
  },
  {
    unit: 'u6',
    title: 'Auf dem Markt',
    goal: 'Kauf ein Kilo Tomaten und ein halbes Kilo Äpfel und bezahl mit Karte.',
    partner: 'die Verkäuferin auf dem Markt',
    turns: [
      {
        partner: { es: 'Hola, buenos días. ¿Qué quiere?', de: 'Hallo, guten Tag. Was möchten Sie?' },
        task: 'Bestell ein Kilo Tomaten.',
        answers: ['Un kilo de tomates, por favor.', 'Quiero un kilo de tomates.', 'Un kilo de tomates.'],
      },
      {
        partner: { es: 'Muy bien. ¿Algo más?', de: 'Sehr gut. Noch etwas?' },
        task: 'Frag, was ein Kilo Äpfel kostet.',
        answers: ['¿Cuánto cuesta un kilo de manzanas?', '¿Cuánto cuesta el kilo de manzanas?'],
      },
      {
        partner: { es: 'Dos euros el kilo.', de: 'Zwei Euro das Kilo.' },
        task: 'Nimm ein halbes Kilo.',
        answers: ['Medio kilo, por favor.', 'Quiero medio kilo.', 'Medio kilo de manzanas, por favor.'],
      },
      {
        partner: { es: 'Son tres euros.', de: 'Das macht drei Euro.' },
        task: 'Frag, ob du mit Karte zahlen kannst.',
        answers: ['¿Puedo pagar con tarjeta?', '¿Pago con tarjeta?'],
      },
    ],
    end: { es: 'Sí, claro. ¡Gracias y hasta luego!', de: 'Ja, klar. Danke und bis bald!' },
    names: [],
    glossary: { quiere: 'Sie möchten', algo: 'etwas' },
  },
  {
    unit: 'u7',
    title: 'Im Spanischkurs',
    goal: 'Erzähl der Lehrerin von deinem Tag: aufstehen, frühstücken, Spanisch lernen.',
    partner: 'die Lehrerin im Spanischkurs',
    turns: [
      {
        partner: { es: 'Laura, ¿a qué hora te levantas?', de: 'Laura, um wie viel Uhr stehst du auf?' },
        task: 'Sag: Ich stehe um sieben auf.',
        answers: ['Me levanto a las siete.', 'A las siete.'],
      },
      {
        partner: { es: '¿Y qué desayunas?', de: 'Und was frühstückst du?' },
        task: 'Sag: Ich frühstücke Brot mit Tomate.',
        answers: ['Desayuno pan con tomate.', 'Pan con tomate.'],
      },
      {
        partner: { es: '¿Qué haces por la tarde?', de: 'Was machst du am Nachmittag?' },
        task: 'Sag: Am Nachmittag lerne ich Spanisch.',
        answers: ['Por la tarde estudio español.', 'Estudio español.'],
      },
      {
        partner: { es: '¡Muy bien! ¿Y te gusta?', de: 'Sehr gut! Und gefällt es dir?' },
        task: 'Sag: Ja, sehr.',
        answers: ['Sí, me gusta mucho.', 'Sí, mucho.'],
      },
    ],
    end: { es: '¡Qué bien, Laura! Hasta mañana.', de: 'Wie schön, Laura! Bis morgen.' },
    names: ['Laura'],
    glossary: { levantas: 'du stehst auf', desayunas: 'du frühstückst', haces: 'du machst' },
  },
  {
    unit: 'u8',
    title: 'Besuch von Elena',
    goal: 'Bitte deine Nachbarin herein, zeig ihr die Wohnung und biete ihr einen Kaffee an.',
    partner: 'Elena, deine Nachbarin',
    turns: [
      {
        partner: { es: '¡Hola, Laura! Soy Elena, la vecina.', de: 'Hallo, Laura! Ich bin Elena, die Nachbarin.' },
        task: 'Begrüß Elena und bitte sie herein.',
        answers: ['¡Hola, Elena! Pasa, pasa.', 'Hola, Elena. Pasa, por favor.', 'Pasa, pasa.'],
      },
      {
        partner: { es: '¡Qué bonito! ¿Es grande el apartamento?', de: 'Wie schön! Ist die Wohnung groß?' },
        task: 'Sag: Nein, sie ist klein.',
        answers: ['No, es pequeño.', 'No, es muy pequeño.'],
      },
      {
        partner: { es: '¿Dónde está el baño?', de: 'Wo ist das Bad?' },
        task: 'Sag: neben der Küche.',
        answers: ['Al lado de la cocina.', 'Está al lado de la cocina.'],
      },
      {
        partner: { es: 'Gracias.', de: 'Danke.' },
        task: 'Biete Elena einen Kaffee an.',
        answers: ['¿Quieres un café?', 'Elena, ¿quieres un café?'],
      },
    ],
    end: { es: 'Sí, un café con leche, por favor.', de: 'Ja, einen Milchkaffee, bitte.' },
    names: ['Laura', 'Elena'],
    glossary: { vecina: 'Nachbarin' },
  },
];
