# Aussprache-Feedback auf Lautebene: Machbarkeit (WP-07)

Stand 2026-11-16. Ziel laut Konzept: Rückmeldung zu einzelnen Lauten, mindestens r/rr und Vokale, statt nur eines Gesamtwerts. Standard bleibt lokal; die Cloud ist nur mit Einwilligung erlaubt (Entscheidung vom 2026-11-14).

## Ergebnis in Kürze

- **Machbar ist es auf zwei Wegen:** lokal im Browser mit einem freien Lautmodell oder in der Cloud mit Azure.
- **Lokal:** Das Audio bleibt auf dem Gerät, es kostet nichts, und das Modell unterscheidet die gesuchten Laute (einfaches r [ɾ], gerolltes rr [r], deutsches Zäpfchen-r [ʁ], Schwa [ə]). Ob es die Fehler eines Lernenden zuverlässig erkennt, ist **nicht gemessen**. Dafür fehlen Testaufnahmen, und das Modell ließ sich in den Arbeitsumgebungen nicht herunterladen (siehe „Was geprüft wurde“).
- **Azure:** Liefert für es-ES eine Bewertung je Laut, aber nicht, welcher Laut stattdessen gesprochen wurde. Es kann also „das rr war ungenau“ sagen, nicht „das klang wie ein einfaches r“.
- **Empfehlung:** Zuerst das lokale Verfahren an deinen eigenen Testaufnahmen messen. Erst wenn es dort nicht reicht, Azure mit Einwilligung.

## Möglichkeiten

| | Lokal im Browser | Azure Pronunciation Assessment | Speechace | SpeechSuper |
| --- | --- | --- | --- | --- |
| Verfahren | Lautmodell `wav2vec2-lv-60-espeak-cv-ft` (Meta, Apache-2.0), als ONNX mit Transformers.js | Cloud-Dienst, Referenztext + Aufnahme | Cloud-Dienst | Cloud-Dienst |
| Spanisch | sprachübergreifendes Modell mit spanischen Lauten (ɾ, r, β, ð, ɣ, θ, x …) | es-ES und es-MX | es-es und es-mx | Spanisch (ohne Angabe der Varianten) |
| Was zurückkommt | welcher Laut wahrscheinlich gesprochen wurde | Punktwert je Laut; Lautname und „gesprochener Laut“ nur für Englisch | Punktwert je Laut, Silbe, Wort | Punktwert je Laut, Wort, Satz |
| r/rr erkennbar | ja, als Unterschied ɾ/r/ʁ (zu messen) | nur als „rr-Laut schlecht bewertet“ | nur als Punktwert | nur als Punktwert |
| Audio verlässt das Gerät | nein | ja (Microsoft) | ja (USA) | ja (China) |
| Kosten | 0 € | 5 Audiostunden im Monat frei, danach ca. 1 $ je Stunde | ab ca. 40 $ im Monat | keine öffentlichen Preise |
| Schlüssel | keiner | Azure-Schlüssel (derselbe wie für WP-03) | eigener Schlüssel, Aufruf nur über einen Server | eigener Schlüssel |
| Größe/Last | einmalig ca. 200–320 MB laden, Rechenzeit auf dem Gerät | keine | keine | keine |

SpeechSuper scheidet aus Datenschutzgründen aus. Speechace verlangt einen eigenen Server und ein Abo und bietet für Spanisch nicht mehr als Azure.

## So würde das lokale Verfahren arbeiten

1. Aus dem spanischen Zielsatz die erwartete Lautfolge bilden. Spanisch wird regelmäßig geschrieben, daher reichen Regeln (rr und r am Wortanfang → [r], r sonst → [ɾ], ll/y → [ʝ], c/z → [θ] für es-ES …).
2. Die Aufnahme durch das Lautmodell schicken. Es liefert für jeden 20-ms-Abschnitt Wahrscheinlichkeiten für 392 Laute.
3. Für jede Fehlerstelle die Lautfolge mit dem richtigen Laut gegen Varianten mit typischen Fehlern vergleichen: [r]↔[ɾ], [r]→[ʁ], unbetonte Vokale → [ə], [o]→[u], [e]→[i], [u]→[y]. Ist eine Fehlervariante deutlich wahrscheinlicher, gibt es einen Hinweis, zum Beispiel: „„perro“: Das rr klang wie ein einfaches r. Lass die Zunge mehrmals schlagen.“
4. Ist das Ergebnis unsicher, gibt es keinen Hinweis. Lieber nichts sagen als falsch belehren, wie bei den Regelhinweisen (WP-06).

Die Web-Speech-Erkennung bleibt für „Wort verstanden“ zuständig; das Lautmodell kommt nur dazu, wenn du es einschaltest (einmaliger Download).

## Was geprüft wurde und was nicht

- Recherchiert: Sprachen, Ergebnisfelder und Preise von Azure, Speechace und SpeechSuper; Lizenz, Lautinventar und Dateigrößen des Lautmodells (fp32 1264 MB, int8 318 MB, q4f16 197 MB).
- **Nicht möglich:** Das Modell herunterzuladen. Die Netzfreigabe der Cloud-Arbeitsumgebung und der Mac-Umgebung der Desktop-App sperrt den Speicherort der großen Dateien bei Hugging Face (Fehler 403). Dein normaler Browser lädt ihn ohne Einschränkung.
- **Nicht gemessen:** Wie gut das Modell Fehler eines deutschsprachigen Lernenden erkennt und wie lange es auf deinem Mac oder Handy rechnet.

## Was für die Messung gebraucht wird

1. **Die Modelldatei:** `model_quantized.onnx` (318 MB) aus https://huggingface.co/onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX/tree/main/onnx in den Habla-Ordner laden (Unterordner `testdaten/`, von Git ausgeschlossen).
2. **Testaufnahmen von dir:** 14 Wörter, jedes einmal richtig und einmal mit dem genannten Fehler. Format egal (zum Beispiel Sprachmemos als .m4a), Name `wort_richtig` und `wort_fehler`, ebenfalls in `testdaten/`.

| Wort | richtig | Fehler zum Aufnehmen |
| --- | --- | --- |
| perro | gerolltes rr | einfaches r, wie „pero“ |
| carro | gerolltes rr | einfaches r, wie „caro“ |
| arroz | gerolltes rr | einfaches r |
| rojo | gerolltes r am Anfang | deutsches Zäpfchen-r |
| gracias | einfaches r | deutsches Zäpfchen-r |
| pero | einfaches r | gerolltes rr, wie „perro“ |
| caro | einfaches r | gerolltes rr, wie „carro“ |
| mesa | klares a am Ende | „mesə“ (Endung abgeschwächt) |
| casa | klares a am Ende | „casə“ |
| libro | klares o am Ende | „librə“ |
| como | zwei klare o | „cumu“ |
| tú | u | ü |
| leche | klares e am Ende | „lechə“ |
| bueno | klares o am Ende | „buenə“ |

3. **Messlatte (Vorschlag):** Von den 14 Fehleraufnahmen werden mindestens 11 erkannt (≈ 80 %), und von den 14 richtigen bekommen höchstens 2 einen falschen Hinweis. Reicht das nicht, wird Azure mit Einwilligung geprüft.

## Datenschutz

- Lokal: Aufnahmen und Ergebnisse bleiben im Browser. Das Modell wird einmal von Hugging Face geladen; dabei sieht Hugging Face nur den Download, keine Aufnahmen.
- Azure (falls später): Vor dem ersten Senden eine Einwilligung mit klarer Angabe, dass die Aufnahme an Microsoft geht. Abschaltbar in den Einstellungen; ohne Einwilligung bleibt alles lokal.
- Testaufnahmen: Sie sind Stimmaufnahmen von dir und gehören nicht ins Git-Repository; `testdaten/` wird ausgeschlossen. Der Prüftest läuft dann nur dort, wo die Dateien liegen.

## Aufwand und Risiken

- Messung (lokal): eine Sitzung, sobald Modell und Aufnahmen da sind.
- Einbau in die App: ein bis zwei Sitzungen (Lautfolge aus Rechtschreibung, Modell laden und zwischenspeichern, Hinweise, Einstellung, Browser-Test mit nachgebildetem Modell).
- **Risiko Rechenzeit:** Das Modell ist groß (300 Mio. Parameter). Auf dem Mac sollte es gehen, auf älteren Handys kann eine Bewertung mehrere Sekunden dauern.
- **Risiko Zuverlässigkeit:** Das Modell wurde mit Muttersprachlern trainiert. Bei Lernenden kann es zu streng oder zu nachsichtig sein; genau das soll die Messung zeigen.
- **Risiko Prüfbarkeit:** Weil Modell und Aufnahmen nicht ins Repository gehören, kann der Prüftest die Erkennung nur auf deinem Mac belegen. Im Browser-Test wird das Modell nachgebildet.

## Quellen

- Microsoft: Use pronunciation assessment – https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment
- Microsoft: Sprachunterstützung – https://learn.microsoft.com/azure/ai-services/speech-service/language-support
- Microsoft Q&A: Preise der Aussprachebewertung – https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat
- Speechace API (Spanisch, Lautwerte) – https://developers.qodex.ai/speechace-s-public/speechace-api
- Speechace FAQ (Aufruf über Server) – https://api-docs.speechace.com/other-resources/faqs
- SpeechSuper – https://github.com/speechsuper/SpeechSuper-API-Samples
- Lautmodell als ONNX – https://huggingface.co/onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX
