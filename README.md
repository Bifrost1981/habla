# Habla – Spanisch lernen ohne Tastatur

MVP einer Lern-Web-App (PWA) für deutschsprachige Anfänger (Ziel A1). Alle Eingaben laufen über Antippen, Ziehen & Ablegen, Wischen oder die Stimme; jedes spanische Wort wird vorgelesen.

## Starten

Voraussetzung: [Node.js](https://nodejs.org) 22.6 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver, öffnet http://localhost:5173
```

Weitere Befehle:

| Befehl | Zweck |
| --- | --- |
| `npm run build` | Fertige PWA nach `dist/` (Service Worker mit Offline-Cache, Manifest; relative Pfade, läuft auch unter einem Unterpfad) |
| `npm run preview` | Den Build lokal unter http://localhost:4173 ansehen |
| `npm run build:single` | Alles in einer einzigen HTML-Datei (`dist-single/index.html`) |
| `npm test` | Selbsttest der Lernlogik und der Kursdaten |
| `npm run test:srs` | Wiederholungsplanung gegen Referenzwerte von ts-fsrs und py-fsrs |
| `npm run test:mix` | Übungsmix: in jeder Lektion mindestens die Hälfte Abruf oder Sprechen |
| `npm run test:feedback` | Fehlerdiagnose und Regelhinweise; mit `-- --list` alle Hinweistexte des Kurses |
| `npm run test:assessment` | Vor- und Nachtests je Einheit und ihre Auswertung |
| `npm run audio` | Alle Texte mit natürlicher Stimme vertonen (siehe unten) |
| `npm run test:audio` | Prüft, dass jeder vorlesbare Text eine Aufnahme hat (und keine am Ende Luft holt) |
| `npm run test:stories` | Hörgeschichten: 95–98 % bekannte Wörter, Glossar, Fragen |
| `node --experimental-strip-types scripts/test-roleplay.ts` | Rollenspiele: erlaubte Antworten, Abgleich, Auswahl ohne Mikrofon |
| `node --experimental-strip-types scripts/test-frequency.ts` | Häufige Wörter (FrequencyWords) und Kann-Beschreibungen |
| `npm run e2e` | Browser-Test mit Playwright (einmalig vorher: `npx playwright install chromium`) |
| `npx playwright test -c tests/delivery/playwright.config.ts` | Auslieferung: Build unter `/habla/`, offline, Aufnahmen offline, keine fremden Server |
| `python3 scripts/project_gate.py start` | Startprüfung: Projektdateien, Nachweise, Smoke-Tests |

Auf dem Handy testen: `npm run dev -- --host` und die angezeigte Netzwerk-Adresse öffnen. Spracheingabe braucht dort allerdings HTTPS (siehe unten); am einfachsten ist ein Deployment auf einen HTTPS-Host wie Netlify, Vercel oder GitHub Pages (Inhalt von `dist/` hochladen, auch in einen Unterordner wie `…/habla/`).

## Browser-Einschränkungen der Spracherkennung

Die App nutzt die Web Speech API (`SpeechRecognition` und `speechSynthesis`).

- **Chrome, Edge (Desktop & Android):** Spracherkennung funktioniert, die Audiodaten werden dafür an die Server von Google bzw. Microsoft geschickt. Ohne Internet keine Erkennung.
- **Safari (macOS, iOS ab 14.5):** funktioniert; unter iOS nutzen alle Browser die Safari-Engine. Siri/Diktat muss in den Systemeinstellungen aktiviert sein.
- **Firefox:** keine Spracherkennung. Habla ersetzt Sprechübungen dann automatisch durch „Satz bauen“. Vorlesen funktioniert.
- **Nur über HTTPS oder `localhost`:** Browser geben das Mikrofon sonst nicht frei.
- **Mikrofon-Erlaubnis:** Wird sie verweigert, schaltet Habla auf „Satz bauen“ um. Die Erlaubnis lässt sich in den Website-Einstellungen des Browsers wieder geben.
- **Stimmen:** Welche spanischen Stimmen es gibt, hängt vom Gerät ab (siehe „Natürlichere Stimme“). Fehlt eine Stimme für den gewählten Dialekt, wird eine andere spanische Stimme verwendet. Nicht jede Stimme meldet Wortgrenzen; die Wort-Hervorhebung wird dann geschätzt.
- **Eingebettete Seiten** (z. B. in iframes) bekommen oft keinen Mikrofonzugriff – dann greift ebenfalls der „Satz bauen“-Ersatz.

## Natürliche Stimme (empfohlen)

Gerätestimmen klingen oft künstlich. Deshalb kann Habla alle spanischen Texte **einmal vorab** mit einer neuronalen Stimme vertonen und spielt dann diese Aufnahmen ab – auf jedem Gerät gleich, auch offline. Fehlt eine Aufnahme, springt die Gerätestimme ein.

**Standard: Lola (Pocket TTS, offen, kostenlos, nur Spanien).** Ein offenes Sprachmodell von Kyutai spricht alle Texte (derzeit 1197) auf dem eigenen Mac; Atmen am Ende wird abgeschnitten, das Tempo um 8 % verlangsamt; danach werden die Aufnahmen ruhiger und weicher nachbearbeitet (Einstellung „sanft“, ausgewählt per Hörprobe in `tools/hoerprobe/`).

```bash
npm run audio -- --provider pocket --export   # 1. Auftrag: alle Texte, die die App vorlesen kann
bash scripts/vertonen.sh                      # 2. auf dem Mac: Lola spricht (Modell von Hugging Face, einige hundert MB beim ersten Mal)
npm run audio -- --provider pocket            # 3. sanft nachbearbeiten (braucht ffmpeg), Verzeichnis schreiben
npm run test:audio                            # prüft: jeder vorlesbare Text hat eine Aufnahme
```

Schritt 2 überspringt schon gesprochene Texte; ein abgebrochener Lauf macht beim nächsten Start dort weiter. Lizenz: Code MIT, Modellgewichte CC-BY-4.0 (Namensnennung in `public/THIRD-PARTY-LICENSES.txt`).

**Mit Microsoft Azure (Gratis-Kontingent reicht):** Der ganze Kurs hat 1197 Texte mit knapp 17.000 Zeichen pro Dialekt. Azure vertont im Gratistarif (F0) 500.000 Zeichen pro Monat.

1. Im [Azure-Portal](https://portal.azure.com) eine Ressource „Speech“ (Sprachdienst) mit Tarif **Free F0** anlegen, z. B. Region „West Europe“.
2. Unter „Schlüssel und Endpunkt“ den Schlüssel kopieren.
3. `.env.example` nach `.env` kopieren, `AZURE_SPEECH_KEY` und `AZURE_SPEECH_REGION` eintragen (Region z. B. `westeurope`).
4. Vertonen und neu bauen:

```bash
npm run audio -- --provider azure --dialect es-MX   # Stimme „Dalia“ (Mexiko)
npm run audio -- --provider azure --dialect es-ES   # Stimme „Elvira“ (Spanien)
npm run build
```

Andere Stimme ausprobieren: `--voice es-ES-XimenaNeural` oder `--voice es-MX-JorgeNeural`; Tempo: `--rate -20%` (langsamer) bis `--rate 0%`. Wird die Stimme gewechselt, vertont das Skript alles neu, sonst nur Fehlendes. Mit `--dry-run` zählt es nur die Texte.

**Mit ElevenLabs (noch wärmer, kostenpflichtig):** `ELEVENLABS_API_KEY` und die gewünschte `ELEVENLABS_VOICE_ID` aus deiner Stimmenbibliothek in `.env` eintragen, dann `npm run audio -- --provider elevenlabs --dialect es-MX`. Eine Stimme mit spanischer Muttersprache wählen, sonst klingen einzelne Wörter mit Akzent.

Die Aufnahmen liegen danach in `audio/<dialekt>/` (außerhalb von Git; Vite liefert den Ordner unter `/audio/` aus und kopiert ihn in den Build). In den Einstellungen erscheint die Stimme oben als „natürliche Stimme“. Neue Stellen, an denen die App vorliest, gehören in `src/lib/spokenTexts.ts`; `npm run test:audio -- --texts-only` bemerkt neue Vorlese-Orte im Code.

**Ohne Vertonung** nutzt Habla die beste Gerätestimme und spricht ruhig. Am natürlichsten sind dann Microsoft Edge („Elvira“, „Dalia“) oder auf Mac/iPhone eine geladene „Premium“-Stimme.

## Offline und Datenschutz

- **Offline:** Nach dem ersten Besuch speichert ein Service Worker alle App-Dateien; Habla startet danach auch ohne Netz. Lolas Aufnahmen werden beim ersten Abspielen gespeichert; in den Einstellungen lädt „Aufnahmen offline speichern“ alle auf einmal (etwa 9 MB). Neue Versionen ersetzen den Cache automatisch.
- **Schriften** (Bricolage Grotesque, Figtree) liegen in der App; es gibt keine Anfragen an Google Fonts oder andere fremde Server.
- **Spracherkennung:** Sie übernimmt der Browser. Chrome und Edge schicken die Aufnahme dafür an Google bzw. Microsoft, Safari an Apple (auf neueren Geräten teils auf dem Gerät). Habla selbst speichert und sendet keine Aufnahmen; Einführung und Einstellungen weisen darauf hin. Ohne Mikrofon gibt es „Satz bauen“.
- Fortschritt bleibt im Browser (`localStorage`), ein Konto gibt es nicht.

## Aufbau

```
src/
  content/course.json   Handgeschriebene Lektionen (Einheit 1 und 2, je 3 Lektionen)
  content/more.json     Weitere Lektionen als Wörter + Beispielsätze (zusammen 8 Einheiten mit je 5 Lektionen,
                        40 Lektionen, 287 Vokabeln, 708 Übungen; Lektion 5 je Einheit: „Kleine Wörter“)
  content/stories.ts    Hörgeschichten je Einheit (95–98 % bekannte Wörter)
  content/roleplays.ts  Geführte Rollenspiele je Einheit (regelbasiert, ohne KI)
  content/cando.ts      Kann-Beschreibungen je Einheit (GER A1)
  lib/generate.ts       Baut aus Wörtern und Sätzen fertige Lektionen (immer gleich gemischt, mindestens die Hälfte Abruf oder Sprechen)
  lib/text.ts           Normalisieren, toleranter Wortabgleich (Lautschlüssel je Wort, ähnliche Wörter anteilig, ≥ 80 %)
  lib/diagnose.ts       Fehlerdiagnose: Fehlertyp, Markierung und Regel in einem Satz (siehe docs/wp06-regelhinweise.md)
  lib/assessment.ts     Vor- und Nachtest je Einheit: Aufgaben, Bewertung, Veränderung je Fertigkeit
  lib/srs.ts            Wiederholung mit FSRS-6 (ts-fsrs), Übernahme alter Leitner-Stände, Serie
  lib/speech.ts         Aufnahmen bzw. Gerätestimme abspielen, Wort-Hervorhebung, Push-to-Talk
  lib/audioKey.ts       Dateinamen der Aufnahmen (gleich in App und Skript)
  lib/stories.ts, lib/roleplays.ts, lib/cando.ts, lib/offline.ts
  lib/course.ts         Freischalten, tägliche Wiederholung, Ersatzübungen, Einordnung Abruf/Auswahl
  exercises/            Pick, Match, Gap, Build (auch Hör-Diktat), Speak (auch Übersetzen-Sprechen), Card
  screens/              Onboarding, Lernpfad, Lektion, Ergebnis, Einstellungen, Kurztest, Lernerfolg,
                        Hörgeschichte, Rollenspiel
scripts/                make-audio.ts (Vertonung), vertonen.sh + pocket_render.py (Lola auf dem Mac), Tests
public/                 Manifest, Icon, Service Worker (Liste der App-Dateien trägt der Build ein)
data/frequency/         Häufigkeitsliste (nur für Tests, nicht in der App)
```

Neue Inhalte: Am einfachsten eine Lektion in `src/content/more.json` ergänzen – 7–8 Wörter im Format `[id, spanisch, deutsch, emoji, Beispiel es, Beispiel de]` und 5 Sätze `[spanisch, deutsch, Lückenwort?, [Ablenker]?]`. Die Übungen entstehen daraus automatisch. Danach `npm test` und `npm run test:mix` ausführen; die Tests prüfen Verweise, Lückenwörter, doppelte Emojis und den Übungsmix.

Übungsarten: Auswahl und Einführung sind Karteikarte, Bild-Auswahl, Paare und Lücke. Abruf und Sprechen sind „Satz bauen“, Hör-Diktat (Satz nur hören und aus Kacheln legen), Nachsprechen und Übersetzen-Sprechen (deutschen Satz sehen, auf Spanisch sagen; nach dem ersten Fehlversuch gibt es den Satz zum Anhören). Ohne Mikrofon werden beide Sprechübungen zu „Satz bauen“. Eine erzeugte Lektion hat 17–20 Übungen: Einführung der Wörter, Paare, eine Lücke, vier Satzübungen und Beispielsätze der Wörter abwechselnd als Diktat und Übersetzen-Sprechen.

## Änderungen einbringen (geschützter Zweig `main`)

`main` auf GitHub ist geschützt: Änderungen kommen nur über einen Pull Request hinein, und nur wenn beide Prüfungen grün sind – „Startprüfung und Tests“ (`.github/workflows/pruefung.yml`: Startprüfung, Selbsttest des Prüfskripts, Logik, Typen, Build, alle Inhaltstests, Browser-Tests, Auslieferungstest, Gegenprobe) und „gate“ (`.github/workflows/gate.yml`). Der Zweig muss dabei auf dem neuesten Stand von `main` sein. Direktes Pushen, Force-Push und Löschen von `main` sind gesperrt, auch für Admins.

Ablauf:

```bash
git switch -c mein-zweig
# ändern, testen, Nachweise mit `python3 scripts/project_gate.py finish --package <ID>` erneuern
git push -u origin mein-zweig
# auf GitHub Pull Request öffnen, warten bis beide Prüfungen grün sind, dann mergen
```

Ändert ein Pull Request Dateien im Prüfbereich (`src/`, `scripts/`, `tests/` …), ohne die Nachweise zu erneuern, schlägt schon die Startprüfung fehl.

## Lernerfolg messen

Jede Einheit hat einen Kurztest mit 12 Aufgaben: 4 zum Hören (Satz hören, deutsche Bedeutung wählen), 4 zum Abruf (deutschen Satz als Kacheln auf Spanisch legen) und 4 zum Sprechen (deutschen Satz auf Spanisch sagen). Der **Vortest** steht am Anfang der Einheit, solange noch keine ihrer Lektionen abgeschlossen ist. Der **Nachtest** erscheint nach der letzten Lektion und lässt sich wiederholen. Beide haben dieselben Aufgaben. Während des Tests gibt es keine Lösungen; „Weiß ich nicht“ zählt als falsch. Ohne Mikrofon oder mit „Gerade nicht sprechen“ wird Sprechen nicht gemessen. Die Auswertung (Symbol in der Kopfzeile) zeigt je Einheit und Fertigkeit Vorher, Nachher und die Veränderung in Prozentpunkten sowie den Verlauf aller Tests. Die Tests ändern die Wiederholungsplanung nicht und bleiben auf dem Gerät.

## Lizenzen

Habla liefert Code dieser Bibliotheken mit aus (alle MIT): React, React DOM, Scheduler und [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (Wiederholungsplanung). Die Schriften Bricolage Grotesque und Figtree stehen unter der SIL Open Font License 1.1 (über Fontsource). Die Häufigkeitsliste in `data/frequency/` (FrequencyWords, CC BY-SA 4.0) dient nur den Tests, siehe `data/frequency/SOURCE.md`. Die Lizenztexte stehen in `public/THIRD-PARTY-LICENSES.txt` und liegen jedem Build bei. Die Python-Bibliothek [fsrs](https://github.com/open-spaced-repetition/py-fsrs) (MIT) dient nur zum Erzeugen der Referenzwerte (`scripts/srs_reference_py.py`) und ist nicht Teil der App.
