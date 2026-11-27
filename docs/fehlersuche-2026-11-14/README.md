# Fehlersuche 2026-11-14

> **Stand 2026-11-15:** Behoben sind G1 und G3 (WP-15), S1 (WP-16) sowie B1–B4 (WP-17). Die Reproduktionen hier zeigen das Verhalten *vor* der Korrektur; für die behobenen Funde schlagen sie jetzt fehl. Die Regressionstests stehen im Projekt (`npm test`, `npm run e2e`).

Stand: Commit `7466aa9`, Startprüfung grün. Bei der Suche wurde nichts am Projekt geändert. Jeder Fund unten wurde reproduziert. Was nur im Code auffiel und sich nicht nachstellen ließ, steht getrennt unter „Nicht reproduziert“.

Der Ordner liegt außerhalb des Prüfbereichs. Die Reproduktionen hier ändern also weder Paketstände noch Nachweise.

## Reproduzieren

| Skript | Belegt |
| --- | --- |
| `node --experimental-strip-types --no-warnings docs/fehlersuche-2026-11-14/repro_logic.ts` | F1, F3–F6 |
| `node --experimental-strip-types --no-warnings docs/fehlersuche-2026-11-14/coverage.ts` | A1 |
| `bash docs/fehlersuche-2026-11-14/gate_repro.sh` | G1, G2 (in einer Wegwerf-Kopie) |
| `bash docs/fehlersuche-2026-11-14/prepare.sh` | baut eine Arbeitskopie mit Test-Aufnahme (Voraussetzung für die nächsten beiden Zeilen) |
| `cd docs/fehlersuche-2026-11-14 && npx playwright test -c pw.config.ts` | B1–B6 (6 Szenarien; jedes Szenario prüft das *fehlerhafte* Verhalten und ist grün, solange der Fehler besteht) |
| `bash docs/fehlersuche-2026-11-14/subpath.sh` | B7 |

## Funde nach Schwere

### Hoch

**G1 Jede Änderung an der App macht die Startprüfung rot, und die Projektregeln lassen keinen Ausweg.**
WP-02 hat keinen eigenen Paketbereich, sein Prüfstand umfasst also alle Dateien. Ein einzelner Kommentar in `src/lib/srs.ts` ergibt: `start` → „Defekt: WP-02: Nachweis veraltet“, Rückgabecode 1.
Das kollidiert mit `CLAUDE.md`: Bei roter Startprüfung ist die Reparatur das einzige Paket der Sitzung, und pro Sitzung gibt es genau ein Paket. Nach WP-04, WP-05 oder WP-06 beginnt deshalb jede Folgesitzung mit einem Pflicht-Neulauf von WP-02, rund fünf Minuten für e2e plus Mutationstest. Das ist derselbe Fehlertyp, der bei WP-00 schon einmal behoben wurde.
Ein Fehler im Prüfskript ist das nicht, sondern einer in Paketzuschnitt und Ablauf.

**S1 Der „tolerante“ Sprechabgleich toleriert auf Wortebene nichts.**
`similarity` vergleicht ganze Wörter auf exakte Gleichheit. Ein Wort, das um einen Buchstaben abweicht, zählt deshalb als ganz falsch.
- „Hola.“ wird als „ola“ erkannt (gleiche Aussprache, h ist stumm) → 0 %.
- „Gracias.“ wird als „gracia“ erkannt → 0 %.
- „Buenos días.“ wird als „buenas dias“ erkannt → 50 %.

Bei einer Schwelle von 80 % scheitert jede Abweichung in Sätzen mit bis zu 4 Wörtern. Das betrifft 46 der 62 Sprechübungen (2 Wörter: 9, 3 Wörter: 16, 4 Wörter: 21). Die README verspricht „toleranter Wortabgleich (Levenshtein, ≥ 80 %)“.

### Mittel

**P1 Die Entscheidung „Aussprachebewertung … Standard bleibt lokal“ trifft auf den heutigen Stand nicht zu.**
In Chrome und Edge geht das Mikrofon-Audio zur Erkennung an Google bzw. Microsoft; die README sagt das selbst. Zusätzlich lädt `index.html` die Schriften von `fonts.googleapis.com`.
In der App gibt es dazu keinen Hinweis. Für das jetzige Publikum (nur der Projektverantwortliche) ist das Risiko gering. Vor jeder Weitergabe muss es aber gelöst sein.

**B5 Offline startet die App nach dem ersten Besuch nicht.**
Der Service Worker legt beim Installieren nur `/`, `/index.html`, `/manifest.webmanifest` und `/icon.svg` ab. JS und CSS landen erst beim zweiten Laden im Cache. Wer nach dem ersten Besuch offline neu lädt, bekommt eine leere Seite.

**B6 Vertonte Aufnahmen sind offline nie verfügbar.**
Chromium fordert Audio mit `Range: bytes=0-` an, der Server antwortet mit 206. `cache.put` lehnt Teilantworten ab, und der Fehler wird still verschluckt. Offline liefert der Service Worker dann `index.html` statt der Audiodatei, und die Gerätestimme springt ein. Die README verspricht „auch offline“.

**B7 Unter einem Unterpfad (GitHub-Pages-Projektseite `/habla/`) bleibt die Seite leer.**
Die Pfade in `index.html` (`/assets/…`, `/manifest.webmanifest`) und der SW-Pfad `/sw.js` sind absolut, Vite hat keine `base` gesetzt. Die README empfiehlt GitHub Pages.

**B1 Ein beschädigter Speicherstand führt zu einer dauerhaft leeren Seite.**
`loadProgress` übernimmt gespeicherte Felder ungeprüft. Mit `lessons: null` stürzt die App ab („Cannot read properties of null (reading 'u1l1')“), und ohne Entwicklerwerkzeuge gibt es keinen Ausweg.

**G2 Ein Nachweis lässt sich von Hand fälschen, und `start` meldet trotzdem „in Ordnung“.**
In der Wegwerf-Kopie war die App kaputt (Paare passen nie). Danach wurde nur `package_hash` in `evidence/WP-02.json` neu berechnet und eingetragen: Rückgabecode 0.
Das ist die bekannte Grenze „ERZWUNGEN: nichts“, hier mit einem konkreten Beleg. `start` führt die Pflichttests nicht neu aus. Erzwingen kann das nur eine unabhängige Stelle (CI, WP-13).

### Niedrig

- **B2 Fehlt eine Aufnahmedatei, startet die Gerätestimme zweimal.** `onerror` und `play().catch` rufen beide `speakDevice` auf. Protokoll: `play:hola.wav, tts:hola., tts:hola.`. `onEnd` kann dadurch doppelt feuern.
- **B3 Nach schnellem „Weiter“ wird die Lösung der alten Übung über der neuen gesprochen.** Ursache ist ein Zeitgeber von 350 ms, der beim Weiterschalten nicht gelöscht wird. Gemessen: „buenos días.“ 333 ms nach dem Klick, obwohl schon die nächste Übung zu sehen ist. Folgt eine Übung ohne eigenes Vorlesen (Paare, Lücke, Satzbau), bleibt die alte Lösung stehen.
- **B4 Enter bei offenem Dialog „Lektion beenden?“ schaltet die Übung dahinter weiter.** Der Enter-Handler der Feedback-Leiste bleibt aktiv; die Feedback-Leiste verschwindet, der Dialog bleibt offen.
- **F1 Akzente und Tilde werden beim Satzbau und in der Lücke ignoriert.** `año` = `ano`, `tú` = `tu`, `sí` = `si`, `está` = `esta`. Derzeit kollidiert kein Ablenker im Kurs damit (0 Treffer), der Fehler ist also latent. Er wird wirksam, sobald WP-06 Ablenker wie `tu`/`tú` einführt.
- **F4 Ersatzübungen nehmen Ablenker aus dem ganzen Kurs.** Gemeint sind „Satz bauen“ statt Sprechen und die Wiederholung. Bei „Hola, buenos días.“ enthielten 200 von 200 Ersatzübungen Wörter, die in Einheit 1 nicht vorkommen (z. B. `médico`, `jardín`). Unbekannte Wörter sind leicht auszuschließen, die Übung wird dadurch leichter.
- **F5 Fünf Übungen haben keinen Vokabelbezug** (u3l3, u4l2, u8l1 Sprechen; u6l1, u6l4 Satzbau). Ihr Ergebnis wirkt nicht auf die Wiederholung.
- **F6 Die Vokabel `amigo` ist nie Ziel einer Übung,** nur Ablenker. Sie kommt deshalb nie in die Wiederholung.
- **A1 89 Texte, die die App vorlesen kann, vertont `make-audio.ts` nicht.** Es sind Kacheln aus Beispielsätzen in der Wiederholung und großgeschriebene Wortformen wie `Sí`, `Adiós`, `Hoy`. Nach WP-03 wechselt die Stimme mitten in der Übung zur Gerätestimme.
- **A2 `make-audio.ts` vertont ohne `--dialect` es-MX,** obwohl App-Standard und Entscheidung es-ES sind. Ein Aufruf ohne Angabe verbraucht also Kontingent für den falschen Dialekt.
- **D1 Die README ist teils veraltet.** „Fehlt eine es-MX-Stimme …“ stammt aus der Zeit vor es-ES als Standard, und in der Aufbau-Liste steht `scripts/make-audio.ts` mitten zwischen `src/lib`-Dateien.

## Nicht reproduziert (nur Code-Befund, Risiko)

- **Karteikarte, Wischen:** `onUp` nutzt `dx` aus dem letzten Rendern. Bei einem sehr schnellen Wisch könnte der Wert veraltet sein. Die Playwright-Maus ist zu langsam, um das auszulösen.
- **Paare:** Nach einem Fehlgriff löscht ein Zeitgeber von 450 ms die Auswahl, auch eine neue, die in dieser Zeit getippt wurde.
- **iOS:** Die Pegelanzeige öffnet per `getUserMedia` ein zweites Mikrofon-Signal parallel zur Spracherkennung. Von Safari ist bekannt, dass das stören kann. Kein Gerät zum Prüfen vorhanden.
- **Service Worker:** Er speichert auch Fehlerantworten (404, 500) und begrenzt die Cache-Größe nicht.
