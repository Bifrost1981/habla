# Hörprobe offener Stimmen (WP-03, Entscheidungshilfe)

Nicht Teil der App. Vertont sechs Kurssätze mit offenen Sprachmodellen, die lokal laufen, und schreibt eine Vergleichsseite `testdaten/hoerprobe/index.html` (mit Gerätestimme zum Vergleich). `testdaten/` bleibt außerhalb von Git.

| Engine | Stimmen | Lizenz | Herkunft der Modelldateien |
| --- | --- | --- | --- |
| Kokoro 82M über `kokoro-onnx` 0.6.1 | `ef_dora` (w), `em_alex` (m) | Modell Apache-2.0, `kokoro-onnx` MIT | GitHub-Release `thewh1teagle/kokoro-onnx` `model-files-v1.0`, SHA-256 im Skript festgehalten |
| Pocket TTS 4.0.1 (Kyutai), Sprache `spanish` | `lola` | Code MIT, Gewichte CC-BY-4.0 (Namensnennung), Stimme aus Mozilla Common Voice | Hugging Face `kyutai/pocket-tts-without-voice-cloning`, Version im Paket festgelegt |

Die Nutzungsbedingungen von Pocket TTS verbieten unter anderem, eine Stimme ohne Zustimmung nachzubilden oder Aufnahmen als echte Aufnahmen realer Personen auszugeben. Habla nutzt nur die mitgelieferte Stimme.

## Ausführen (auf dem Mac)

```bash
bash tools/hoerprobe/hoerprobe.sh          # Pocket TTS ergänzen (Kokoro liegt schon bereit)
open testdaten/hoerprobe/index.html
```

Das Skript braucht `uv` oder Python 3.10–3.13. Fehlt beides, nennt es den Installationsbefehl für `uv`. Nichts davon landet im Projekt: Pakete und die Kokoro-Modelldateien liegen in `~/.cache/habla-hoerprobe`, das Pocket-Modell im eigenen Cache von Pocket TTS bzw. Hugging Face (`~/.cache/`). Beim ersten Lauf lädt das Skript PyTorch und das Pocket-Modell (zusammen einige hundert MB), danach dauert die Vertonung je Satz nur Sekunden.

Beim Laden meldet Pocket TTS zuerst „Access to model kyutai/pocket-tts is restricted“: Es versucht das zugangsbeschränkte Modell mit Stimmenklonen und weicht dann von selbst auf das freie Modell aus. Das ist normal, eine Anmeldung ist nicht nötig.

Aus der Cloud-Arbeitsumgebung sind Hugging Face und der PyTorch-Server gesperrt; deshalb lief dort nur Kokoro. Der Pocket-Teil ist mit dem echten Paket (4.0.1) bis zum Modell-Download und mit einer Attrappe gleicher Schnittstelle bis zur fertigen Vergleichsseite geprüft.
