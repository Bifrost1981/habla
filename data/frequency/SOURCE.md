# Häufigkeitsliste Spanisch (WP-11)

`es_top5000.txt` enthält die ersten 5000 Zeilen (Wort, Anzahl) der Liste `content/2018/es/es_50k.txt` aus
**FrequencyWords** von Hermit Dave: https://github.com/hermitdave/FrequencyWords
(Stand: Commit `525f9b560de45753a5ea01069454e72e9aa541c6`, abgerufen am 2026-11-24).

- Grundlage: Untertitel aus OpenSubtitles 2018 (über das OPUS-Korpus), gezählt als Wortformen.
- **Lizenz der Daten: CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/), laut README des Projekts
  („MIT License for code. CC-by-sa-4.0 for content.“). Der Code des Projekts steht unter MIT.
- Namensnennung: „FrequencyWords“ von Hermit Dave, CC BY-SA 4.0. Diese Datei ist ein unveränderter Auszug (die
  ersten 5000 Zeilen); sie steht unter derselben Lizenz.
- SHA-256 von `es_top5000.txt`: `33d6c67aa6d0b5e88d9bbed5ca69b62e6d024d96cc2933bc5c7a69b5b99b8cd9`

## Verwendung

Nur als Prüfdatei: `scripts/test-frequency.ts` misst, wie viele der häufigsten Wörter der Kurs abdeckt und ob die
neuen Wörter der Lektionen „Kleine Wörter“ zu den häufigsten gehören. Die Liste wird **nicht** in die App gebaut und
nicht ausgeliefert; die App enthält keine Daten daraus außer den ausgewählten Vokabeln selbst (einzelne Wörter, keine
Liste). Die Share-alike-Bedingung betrifft daher nur diese Datei und Ableitungen der Liste.

## Grenzen

Untertitel bilden gesprochene Alltagssprache gut ab, überschätzen aber Wörter aus Filmen (z. B. „policía“, „dios“,
Schimpfwörter). Die Liste zählt Wortformen, nicht Grundformen („puede“, „puedo“, „puedes“ getrennt). Deshalb wählt
der Kurs die Lückenwörter von Hand aus der Liste aus, passend zum Thema der Einheit.
