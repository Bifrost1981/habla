// Hörgeschichten (WP-08), je Einheit eine. Prüfung: npm run test:stories (Anteil bekannter Wörter, Glossar, Fragen).
// Die richtige Antwort steht an Stelle `answer`; die Ansicht mischt die Antworten.
import type { Story } from '../lib/stories.ts';

export const STORIES: Story[] = [
  {
    unit: 'u1',
    title: 'Laura in Madrid',
    titleEs: 'Laura en Madrid',
    lines: [
      {
        es: 'Hola, buenos días. Me llamo Laura.',
        de: 'Hallo, guten Morgen. Ich heiße Laura.',
      },
      {
        es: 'Soy de Alemania, de Berlín.',
        de: 'Ich komme aus Deutschland, aus Berlin.',
      },
      {
        es: 'Hoy estoy en Madrid, en España.',
        de: 'Heute bin ich in Madrid, in Spanien.',
      },
      {
        es: 'Mi amiga Sofía es de Madrid.',
        de: 'Meine Freundin Sofía kommt aus Madrid.',
      },
      {
        es: 'Sofía es muy simpática.',
        de: 'Sofía ist sehr nett.',
      },
      {
        es: '¿Y Pedro? Pedro es mi amigo. También es de Berlín.',
        de: 'Und Pedro? Pedro ist mein Freund. Er kommt auch aus Berlin.',
      },
      {
        es: 'Pedro está mal hoy.',
        de: 'Pedro geht es heute schlecht.',
      },
      {
        es: 'Yo estoy muy bien. ¡Hasta luego!',
        de: 'Mir geht es sehr gut. Bis später!',
      },
    ],
    names: ['Laura', 'Sofía', 'Pedro', 'Madrid', 'Berlín', 'Alemania', 'España'],
    glossary: {
      simpática: 'nett',
    },
    questions: [
      {
        q: 'Woher kommt Laura?',
        options: ['Aus Berlin', 'Aus Madrid', 'Aus Sevilla'],
        answer: 0,
      },
      {
        q: 'Wo ist Laura heute?',
        options: ['In Madrid', 'In Berlin', 'Zu Hause'],
        answer: 0,
      },
      {
        q: 'Wie geht es Pedro heute?',
        options: ['Schlecht', 'Sehr gut', 'Gut'],
        answer: 0,
      },
    ],
  },
  {
    unit: 'u2',
    title: 'Im Café',
    titleEs: 'En el café',
    lines: [
      {
        es: 'Hoy estoy en un café con mi amigo Pedro.',
        de: 'Heute bin ich mit meinem Freund Pedro in einem Café.',
      },
      {
        es: 'El camarero es muy simpático.',
        de: 'Der Kellner ist sehr nett.',
      },
      {
        es: 'Yo quiero un café con leche, sin azúcar.',
        de: 'Ich möchte einen Milchkaffee, ohne Zucker.',
      },
      {
        es: 'Pedro quiere un té y un cruasán.',
        de: 'Pedro möchte einen Tee und ein Croissant.',
      },
      {
        es: 'El café está muy caliente.',
        de: 'Der Kaffee ist sehr heiß.',
      },
      {
        es: 'El pastel es muy rico, pero cuesta mucho.',
        de: 'Der Kuchen ist sehr lecker, aber er kostet viel.',
      },
      {
        es: 'La cuenta, por favor.',
        de: 'Die Rechnung, bitte.',
      },
      {
        es: 'Muchas gracias y adiós.',
        de: 'Vielen Dank und tschüss.',
      },
    ],
    names: ['Pedro'],
    glossary: {
      quiere: 'er möchte',
      pero: 'aber',
    },
    questions: [
      {
        q: 'Was trinkt Laura?',
        options: ['Milchkaffee ohne Zucker', 'Tee mit Milch', 'Ein Bier'],
        answer: 0,
      },
      {
        q: 'Was möchte Pedro?',
        options: ['Tee und ein Croissant', 'Kaffee und Kuchen', 'Nur Wasser'],
        answer: 0,
      },
      {
        q: 'Wie ist der Kuchen?',
        options: ['Lecker, aber teuer', 'Kalt', 'Nicht gut'],
        answer: 0,
      },
    ],
  },
  {
    unit: 'u3',
    title: 'Meine Woche',
    titleEs: 'Mi semana',
    lines: [
      {
        es: 'Hoy es lunes. Son las ocho y media.',
        de: 'Heute ist Montag. Es ist halb neun.',
      },
      {
        es: 'Trabajo por la mañana, ocho horas.',
        de: 'Ich arbeite vormittags, acht Stunden.',
      },
      {
        es: 'El martes tengo clase.',
        de: 'Am Dienstag habe ich Unterricht.',
      },
      {
        es: 'El miércoles voy al gimnasio con Sofía.',
        de: 'Am Mittwoch gehe ich mit Sofía ins Fitnessstudio.',
      },
      {
        es: 'El jueves juego al tenis con Pedro en el parque.',
        de: 'Am Donnerstag spiele ich mit Pedro im Park Tennis.',
      },
      {
        es: 'Pedro tiene treinta años y un perro.',
        de: 'Pedro ist dreißig Jahre alt und hat einen Hund.',
      },
      {
        es: 'El perro tiene cinco años.',
        de: 'Der Hund ist fünf Jahre alt.',
      },
      {
        es: '¡Por fin es viernes!',
        de: 'Endlich ist Freitag!',
      },
      {
        es: 'El sábado voy de compras y el domingo descanso en casa.',
        de: 'Am Samstag gehe ich einkaufen und am Sonntag ruhe ich mich zu Hause aus.',
      },
    ],
    names: ['Sofía', 'Pedro'],
    glossary: {
      parque: 'Park',
      casa: 'Haus; en casa: zu Hause',
    },
    questions: [
      {
        q: 'Wann hat Laura Unterricht?',
        options: ['Am Dienstag', 'Am Montag', 'Am Samstag'],
        answer: 0,
      },
      {
        q: 'Was macht Laura am Donnerstag?',
        options: ['Tennis mit Pedro', 'Fitnessstudio mit Sofía', 'Einkaufen'],
        answer: 0,
      },
      {
        q: 'Wie alt ist Pedro?',
        options: ['Dreißig', 'Fünf', 'Acht'],
        answer: 0,
      },
    ],
  },
  {
    unit: 'u4',
    title: 'Pedros Familie',
    titleEs: 'La familia de Pedro',
    lines: [
      {
        es: 'Pedro tiene una familia grande.',
        de: 'Pedro hat eine große Familie.',
      },
      {
        es: 'Su madre se llama Carmen. Es profesora.',
        de: 'Seine Mutter heißt Carmen. Sie ist Lehrerin.',
      },
      {
        es: 'Su padre es de Sevilla. Es cocinero.',
        de: 'Sein Vater kommt aus Sevilla. Er ist Koch.',
      },
      {
        es: 'Pedro tiene dos hermanas y un hermano.',
        de: 'Pedro hat zwei Schwestern und einen Bruder.',
      },
      {
        es: 'Su hermana Ana vive en México.',
        de: 'Seine Schwester Ana wohnt in Mexiko.',
      },
      {
        es: 'Su hermano es médico. Es alto y tiene el pelo largo.',
        de: 'Sein Bruder ist Arzt. Er ist groß und hat lange Haare.',
      },
      {
        es: 'La abuela de Pedro ya es mayor. Tiene ochenta años.',
        de: 'Pedros Großmutter ist schon alt. Sie ist achtzig.',
      },
      {
        es: 'Vive con la familia en Madrid y cocina muy bien.',
        de: 'Sie wohnt bei der Familie in Madrid und kocht sehr gut.',
      },
    ],
    names: ['Pedro', 'Carmen', 'Sevilla', 'Ana', 'México', 'Madrid'],
    glossary: {
      hermanas: 'Schwestern',
      cocina: 'sie kocht',
    },
    questions: [
      {
        q: 'Was ist Pedros Mutter von Beruf?',
        options: ['Lehrerin', 'Ärztin', 'Köchin'],
        answer: 0,
      },
      {
        q: 'Wo wohnt Ana?',
        options: ['In Mexiko', 'In Sevilla', 'In Berlin'],
        answer: 0,
      },
      {
        q: 'Wie alt ist die Großmutter?',
        options: ['Achtzig', 'Dreißig', 'Sechzig'],
        answer: 0,
      },
    ],
  },
  {
    unit: 'u5',
    title: 'Wo ist das Museum?',
    titleEs: '¿Dónde está el museo?',
    lines: [
      {
        es: 'Hoy busco el museo.',
        de: 'Heute suche ich das Museum.',
      },
      {
        es: 'Mi hotel está cerca de la plaza.',
        de: 'Mein Hotel ist in der Nähe des Platzes.',
      },
      {
        es: 'Disculpe, señor, ¿dónde está el museo?',
        de: 'Entschuldigung, mein Herr, wo ist das Museum?',
      },
      {
        es: 'Siga todo recto y gire a la izquierda.',
        de: 'Gehen Sie geradeaus und biegen Sie links ab.',
      },
      {
        es: 'El museo está en la esquina, cerca de la farmacia.',
        de: 'Das Museum ist an der Ecke, in der Nähe der Apotheke.',
      },
      {
        es: 'No está lejos. Voy a pie.',
        de: 'Es ist nicht weit. Ich gehe zu Fuß.',
      },
      {
        es: 'Pero el museo está cerrado. Es muy temprano.',
        de: 'Aber das Museum ist geschlossen. Es ist sehr früh.',
      },
      {
        es: 'Abre a las diez. Tomo un café en la plaza.',
        de: 'Es öffnet um zehn. Ich trinke einen Kaffee auf dem Platz.',
      },
    ],
    names: [],
    glossary: {
      pero: 'aber',
      temprano: 'früh',
    },
    questions: [
      {
        q: 'Was sucht Laura?',
        options: ['Das Museum', 'Den Bahnhof', 'Eine Apotheke'],
        answer: 0,
      },
      {
        q: 'Wo ist das Museum?',
        options: ['An der Ecke, nahe der Apotheke', 'Neben dem Hotel', 'Am Flughafen'],
        answer: 0,
      },
      {
        q: 'Warum trinkt Laura erst einen Kaffee?',
        options: ['Das Museum ist noch geschlossen', 'Das Museum ist zu weit weg', 'Sie ist müde'],
        answer: 0,
      },
    ],
  },
  {
    unit: 'u6',
    title: 'Einkaufen mit Sofía',
    titleEs: 'De compras con Sofía',
    lines: [
      {
        es: 'El sábado voy de compras con Sofía.',
        de: 'Am Samstag gehe ich mit Sofía einkaufen.',
      },
      {
        es: 'Quiero un kilo de tomates y dos manzanas.',
        de: 'Ich möchte ein Kilo Tomaten und zwei Äpfel.',
      },
      {
        es: 'La fruta es muy fresca.',
        de: 'Das Obst ist sehr frisch.',
      },
      {
        es: 'Luego busco una chaqueta.',
        de: 'Dann suche ich eine Jacke.',
      },
      {
        es: 'Me gusta la chaqueta azul. ¿Cuánto cuesta?',
        de: 'Mir gefällt die blaue Jacke. Was kostet sie?',
      },
      {
        es: 'Cuesta noventa euros. ¡Es muy caro!',
        de: 'Sie kostet neunzig Euro. Das ist sehr teuer!',
      },
      {
        es: 'Sofía prefiere un vestido rojo.',
        de: 'Sofía nimmt lieber ein rotes Kleid.',
      },
      {
        es: '¿Puedo pagar con tarjeta? Sí, claro.',
        de: 'Kann ich mit Karte bezahlen? Ja, klar.',
      },
    ],
    names: ['Sofía'],
    glossary: {
      noventa: 'neunzig',
      prefiere: 'sie nimmt lieber',
    },
    questions: [
      {
        q: 'Was möchte Laura zuerst?',
        options: ['Tomaten und Äpfel', 'Orangen', 'Bananen'],
        answer: 0,
      },
      {
        q: 'Wie viel kostet die blaue Jacke?',
        options: ['Neunzig Euro', 'Neun Euro', 'Zehn Euro'],
        answer: 0,
      },
      {
        q: 'Was nimmt Sofía lieber?',
        options: ['Ein rotes Kleid', 'Eine blaue Jacke', 'Schwarze Schuhe'],
        answer: 0,
      },
    ],
  },
  {
    unit: 'u7',
    title: 'Lauras Tag',
    titleEs: 'Un día de Laura',
    lines: [
      {
        es: 'Me levanto a las siete.',
        de: 'Ich stehe um sieben auf.',
      },
      {
        es: 'Me ducho y desayuno pan con tomate.',
        de: 'Ich dusche und frühstücke Brot mit Tomate.',
      },
      {
        es: 'Salgo de casa a las ocho.',
        de: 'Ich gehe um acht aus dem Haus.',
      },
      {
        es: 'Trabajo en una oficina.',
        de: 'Ich arbeite in einem Büro.',
      },
      {
        es: 'Como a las dos con mi amiga Sofía.',
        de: 'Ich esse um zwei mit meiner Freundin Sofía.',
      },
      {
        es: 'Por la tarde estudio español.',
        de: 'Am Nachmittag lerne ich Spanisch.',
      },
      {
        es: 'Después cocino la cena y veo la tele.',
        de: 'Danach koche ich das Abendessen und sehe fern.',
      },
      {
        es: 'Estoy muy cansada.',
        de: 'Ich bin sehr müde.',
      },
      {
        es: 'Me acuesto a las once y leo un poco en la cama.',
        de: 'Ich gehe um elf ins Bett und lese ein bisschen im Bett.',
      },
      {
        es: '¡Mañana es sábado! ¡Por fin!',
        de: 'Morgen ist Samstag! Endlich!',
      },
    ],
    names: ['Sofía'],
    glossary: {
      cansada: 'müde (Frau)',
      cama: 'Bett',
    },
    questions: [
      {
        q: 'Wann steht Laura auf?',
        options: ['Um sieben', 'Um acht', 'Um elf'],
        answer: 0,
      },
      {
        q: 'Was macht Laura am Nachmittag?',
        options: ['Sie lernt Spanisch', 'Sie schwimmt', 'Sie geht ins Kino'],
        answer: 0,
      },
      {
        q: 'Wie geht es Laura am Abend?',
        options: ['Sie ist sehr müde', 'Sie ist krank', 'Sie hat Hunger'],
        answer: 0,
      },
    ],
  },
  {
    unit: 'u8',
    title: 'Meine Wohnung',
    titleEs: 'Mi apartamento',
    lines: [
      {
        es: 'Vivo en un apartamento en el centro de Madrid.',
        de: 'Ich wohne in einer Wohnung im Zentrum von Madrid.',
      },
      {
        es: 'Es pequeño, pero muy bonito.',
        de: 'Sie ist klein, aber sehr schön.',
      },
      {
        es: 'Tiene una cocina, un dormitorio y un baño.',
        de: 'Sie hat eine Küche, ein Schlafzimmer und ein Bad.',
      },
      {
        es: 'En el dormitorio hay una cama grande y un armario.',
        de: 'Im Schlafzimmer gibt es ein großes Bett und einen Schrank.',
      },
      {
        es: 'Mi gato Coco duerme en el sofá.',
        de: 'Mein Kater Coco schläft auf dem Sofa.',
      },
      {
        es: 'Mi vecino Pablo es muy simpático.',
        de: 'Mein Nachbar Pablo ist sehr nett.',
      },
      {
        es: '¡Bienvenido, Pablo! Pasa, pasa. ¿Quieres un café?',
        de: 'Willkommen, Pablo! Komm rein, komm rein. Möchtest du einen Kaffee?',
      },
    ],
    names: ['Madrid', 'Coco', 'Pablo'],
    glossary: {
      pero: 'aber',
      duerme: 'er schläft',
    },
    questions: [
      {
        q: 'Wo wohnt Laura?',
        options: ['In einer Wohnung im Zentrum', 'In einem Haus mit Garten', 'In Berlin'],
        answer: 0,
      },
      {
        q: 'Wo schläft der Kater?',
        options: ['Auf dem Sofa', 'Unter dem Bett', 'Im Garten'],
        answer: 0,
      },
      {
        q: 'Was bietet Laura Pablo an?',
        options: ['Einen Kaffee', 'Ein Bier', 'Eine Suppe'],
        answer: 0,
      },
    ],
  },
];
