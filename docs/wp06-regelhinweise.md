# Regelhinweise bei falschen Antworten (WP-06)

Stand 2026-11-15. Diese Liste ist die Grundlage für die fachliche Freigabe. Sie zeigt jede Hinweisform mit einem Beispiel aus dem Kurs. Alle 664 Hinweistexte, die bei typischen Fehlern im Kurs entstehen, gibt `npm run test:feedback -- --list` aus.

Wo der Hinweis erscheint: in der Feedback-Leiste unter der richtigen Lösung, nur bei falscher Antwort. Die betroffenen Wörter der Lösung sind unterstrichen. Hinweise gibt es bei „Satz bauen“, Hör-Diktat, Lücke, Nachsprechen und Übersetzen-Sprechen; nicht bei Bild-Auswahl, Paaren und Karteikarte.

Wann es keinen Hinweis gibt: wenn die Antwort mehr als zwei Fehler hat oder weniger als die Hälfte der Wörter stimmt. Dann steht nur die Lösung da. Bei gesprochenen Antworten gibt es Hinweise nur zu Wortstellung, Geschlecht, Artikel, ser/estar und fehlenden Wörtern, weil sich die Spracherkennung bei einzelnen Wörtern verhören kann.

| Fehlertyp | Antwort → Lösung | Hinweis |
| --- | --- | --- |
| Wortstellung | Un frío té → Un té frío. | Das Adjektiv steht im Spanischen meist hinter dem Nomen: „té frío“. |
| Wortstellung | días Buenos señor → Buenos días, señor. | Alle Wörter stimmen, nur die Reihenfolge nicht: Vergleiche deinen Satz Wort für Wort mit der Lösung. |
| Geschlecht | un mesa para dos → Una mesa para dos. | „mesa“ ist weiblich, deshalb heißt es „una mesa“. |
| Geschlecht | cuánto cuesta la café → ¿Cuánto cuesta el café? | „café“ ist männlich, deshalb heißt es „el café“. |
| Geschlecht | la agua está fría → El agua está fría. | „agua“ ist weiblich, bekommt aber vor dem betonten a den Artikel „el“: „el agua“. |
| Geschlecht | es mi amigo Sofía → Es mi amiga Sofía. | „amiga“ ist die weibliche Form, „amigo“ die männliche. |
| Geschlecht | el agua está frío → El agua está fría. | Das Adjektiv richtet sich nach dem Nomen, -o für männlich und -a für weiblich: Hier ist es „fría“. |
| Geschlecht | son los cinco → Son las cinco. | Hier muss es „las“ heißen, weil das zugehörige Nomen weiblich ist. |
| Artikel | quiero el café → Quiero un café. | „el“ und „la“ bedeuten „der, die, das“, „un“ und „una“ „ein, eine“: Hier gehört „un“ hin. |
| Artikel | unos zapatos … → los zapatos … | „los“ und „las“ bedeuten „die“ (Mehrzahl), „unos“ und „unas“ „einige“: Hier gehört „los“ hin. |
| Artikel | cuenta por favor → La cuenta, por favor. | Vor „cuenta“ fehlt der Artikel „la“. |
| ser oder estar | soy bien → Estoy bien. | „estar“ (hier „Estoy“) steht für Befinden, Zustand und Ort, „ser“ für Name, Herkunft, Beruf, Eigenschaften und Uhrzeit. |
| ser oder estar | estoy de Alemania → Soy de Alemania. | „ser“ (hier „Soy“) steht für Name, Herkunft, Beruf, Eigenschaften und Uhrzeit, „estar“ für Befinden, Zustand und Ort. |
| Fehlendes Wort | estoy bien → Estoy bien, gracias. | Es fehlt das Wort „gracias“ (danke). |
| Fehlendes Wort | una mesa para dos → Una mesa para dos, por favor. | Es fehlen die Wörter „por“ und „favor“. |
| Wort zu viel | no gracias hola → No, gracias. | Das Wort „hola“ gehört nicht in diesen Satz. |
| Bedeutung | un café sin leche → Un café con leche. | „sin“ heißt „ohne“, gesucht war „con“ (mit). |
| Bedeutung | me tal Laura → Me llamo Laura. | Statt „tal“ gehört hier „llamo“ hin. |

Grundlagen der Hinweise:

- **Geschlecht der Nomen** kommt aus den Artikeln der Kursvokabeln (`el café`, `la mesa`). Ausnahme von Hand: `agua` ist weiblich trotz „el“.
- **Bedeutungen** in Klammern kommen aus den Kursvokabeln. Mehrdeutige Kurzwörter (`no`, `como`, `que`, `si`, `el`, `tu`, `mi`, `te`) bleiben ohne Übersetzung.
- **Adjektive** für die Stellungsregel sind eine feste Liste der Adjektive des Kurses.
- **ser/estar** wird erkannt, wenn die Antwort die Form derselben Person des anderen Verbs enthält (soy/estoy, eres/estás, es/está, somos/estamos, sois/estáis, son/están).

Bekannte Grenzen:

- Die Regel zu ser/estar ist die übliche Anfängerfassung. Fälle wie Anzahl („Somos cuatro“) oder Veranstaltungen („La cena es a las nueve“) nennt sie nicht ausdrücklich.
- Bei „Wortstellung“ gibt es außer der Adjektivregel nur den allgemeinen Hinweis; Regeln zu Verneinung und Fragen fehlen.
- Eine andere richtige Übersetzung gilt weiter als falsch und kann einen Hinweis bekommen, der zur Musterlösung führt.
