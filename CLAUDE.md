# Habla – Projektanweisung

Spanisch-Lern-PWA (React, TypeScript, Vite) für deutschsprachige Anfänger. Konzept: siehe `feature_list.json` → `concept_doc`.

## Zu Beginn jeder Sitzung

1. `project-progress.md` lesen, vor allem den Abschnitt „Übergabe“.
2. `feature_list.json` und `git status` / `git log --oneline -5` ansehen.
3. `./init.sh` ausführen (oder `python3 scripts/project_gate.py start`). Schlägt die Startprüfung fehl, ist die Reparatur das einzige Paket dieser Sitzung.
4. Sonst das höchstpriorisierte offene Paket mit erfüllten Abhängigkeiten wählen und ID, Ziel und Abnahmetest nennen, bevor etwas geändert wird.

## Regeln

- Pro Sitzung genau ein Arbeitspaket. Keine Ausführungen, Testergebnisse, Freigaben oder Commits erfinden.
- `passes=true` setzt nur `python3 scripts/project_gate.py finish --package <ID>`, nie Handarbeit.
- `passes`, `was_accepted` und `evidence` nie von Hand ändern, auch nicht auf `false`: Ein Rückschritt muss sichtbar bleiben.
- Freigaben (`approve`) trägt nur die berechtigte Person ein oder lässt sie ausdrücklich eintragen.
- Tests nicht abschwächen. Geänderte Kriterien in `project-progress.md` begründen.
- Keine Geheimnisse ins Repository (`.env` ist ausgeschlossen). Kein Force-Push, kein destruktiver Reset.
- Deployment, externe Dienste mit Kosten, Repository-Regeln: nur nach ausdrücklicher Freigabe.

## Am Ende jeder Sitzung

1. Abschnitt „Übergabe“ in `project-progress.md` aktualisieren (Paket, Kontrollstatus, geänderte Dateien, Testbefehle und Ergebnisse, geprüfter Zustand, letzter Commit, offene Freigaben, Blocker, „Nächster Schritt:“).
2. `finish --package <ID>` für das Paket der Sitzung ausführen.
3. Folgeprüfung: `python3 scripts/project_gate.py start` ausführen. Für jedes Paket, das es unter „Neu prüfen“ nennt, `finish` ausführen. Das zählt zum laufenden Paket und ist kein zweites. Schlägt eine Folgeprüfung fehl, hat das laufende Paket einen Rückschritt verursacht: in derselben Sitzung beheben oder als Defekt in die Übergabe schreiben. Fehlt nur eine Freigabe, steht sie unter „Fehlende Freigaben“.
4. Zwischenstands-Commit anlegen. Die Sitzung endet mit grüner Startprüfung oder mit benanntem Defekt.
