# Bewerbungsassistent

Lokale Netzwerk-App zum Erstellen, Vergleichen, Bearbeiten und Verwalten von Bewerbungsanschreiben. Unterlagen, Stammdaten, Einstellungen, API-Keys und gespeicherte Anschreiben liegen zentral auf dem eigenen Server in SQLite und lokalen Dateien.

## Funktionen

- Stammdaten zentral in SQLite speichern
- API-Keys je KI-Anbieter zentral speichern und Anbieter frei wechseln
- Lebenslauf, Zeugnisse und weitere Unterlagen hochladen
- mehrere Dateien gleichzeitig hochladen
- sichtbares Upload-Feedback mit Fortschrittsanimation
- Stellenanzeige oder Link einfügen
- Stellenanzeigen-Link serverseitig auslesen
- Anschreiben per OpenAI, Gemini, Anthropic, Mistral, OpenRouter oder lokalem Llama/Ollama erzeugen
- mehrere KI-Anbieter vergleichen und die beste Version übernehmen
- KI-Vergleich mit Bewertung, kurzen Gründen und grober Kostenschätzung
- Bewerbungsunterlagen strukturiert nach Skills, Rollen, Ausbildung und Stärken analysieren
- Anschreiben mit Absenderdaten, Empfängerblock, Betreff und Schlussformel erstellen
- gewünschte Angaben wie Wunschgehalt, Eintrittstermin oder Referenznummer als Platzhalter erkennen
- Qualitätscheck für Betreff, Empfänger, Platzhalter, Länge und Profilbezug
- Anschreiben direkt bearbeiten
- fertige Versionen zentral in SQLite speichern
- Bewerbungshistorie mit Status, Job-Link, Notizen und Wiedervorlage
- DIN-A4-Vorschau neben dem Editor anzeigen
- DOCX herunterladen, Text kopieren oder per Google OAuth direkt in Google Docs erstellen
- gespeicherte Anschreiben öffnen, weiterbearbeiten und löschen
- Backup, Export und Restore für Datenbank, Unterlagen und Einstellungen
- Update-Prüfung und Update-Button im Footer

## Installation auf Debian 13 oder Ubuntu 24.04

```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/Schello805/bewerbungsassistent/main/scripts/install.sh)
```

Das Installationsscript führt die Einrichtung vollständig aus:

- System prüfen
- benötigte Pakete installieren
- Node.js installieren, falls nötig
- Repository nach `/opt/bewerbungsassistent` klonen
- Abhängigkeiten installieren
- Produktionsbuild erstellen
- systemd-Service einrichten und starten
- Healthcheck ausführen
- lokale URL und Netzwerk-URL ausgeben

### Optionale Parameter

```bash
sudo APP_DIR=/opt/bewerbungsassistent PORT=5173 SERVICE_USER=bewerbungsassistent bash scripts/install.sh
```

Weitere optionale Variablen:

```bash
REPO_URL=https://github.com/Schello805/bewerbungsassistent.git
NODE_MAJOR=22
```

## Update

Auf einem installierten System:

```bash
sudo bash /opt/bewerbungsassistent/scripts/update.sh
```

Das Updatescript führt automatisch aus:

- aktuelle Version von GitHub holen
- Abhängigkeiten aktualisieren
- Produktionsbuild neu erstellen
- systemd-Service neu starten
- Healthcheck ausführen
- Status und URL ausgeben

In der Webapp kann zusätzlich der Update-Button im Footer genutzt werden. Dafür muss die App aus einem Git-Checkout laufen und Zugriff auf das Repository haben. Nach einem erfolgreichen Update startet der Serverprozess neu.

## Betrieb

```bash
systemctl status bewerbungsassistent --no-pager
journalctl -u bewerbungsassistent -f
systemctl restart bewerbungsassistent
sudo bash /opt/bewerbungsassistent/scripts/update.sh
```

Standard-Port: `5173`

Der Server lauscht standardmäßig auf allen Netzwerkinterfaces (`0.0.0.0`). Dadurch kann die App im lokalen Netzwerk über `http://SERVER-IP:5173/` von PC, Tablet, Handy oder Laptop genutzt werden.

## Lokale Ordner

```text
datenbasis/   hochgeladene Unterlagen
data/         SQLite-Datenbank, serverlokaler Schlüssel und gespeicherte Anschreiben
```

Persönliche Dateien in `datenbasis/` und SQLite-Dateien in `data/` werden nicht in das Repository übernommen. Nur `.gitkeep`-Dateien halten die Ordnerstruktur vor.

API-Keys können wahlweise nur für die aktuelle Browser-Sitzung genutzt oder serverseitig verschlüsselt gespeichert werden. Für die Verschlüsselung legt die App beim ersten Start `data/secret.key` an. Schütze Server, Datenbankdatei, Schlüsseldatei und Backups vor unbefugtem Zugriff.

Backups können direkt in der App unter `Einstellungen` heruntergeladen und wieder eingespielt werden. Die Backup-Datei enthält Stammdaten, Unterlagen, gespeicherte Anschreiben und Einstellungen. Serverseitig gespeicherte API-Keys liegen in der Datenbank verschlüsselt vor.

Für `Llama lokal` wird ein laufender Ollama-Server erwartet. Standard: `OLLAMA_URL=http://127.0.0.1:11434/api/generate` und `OLLAMA_MODEL=llama3.1`.

Für direktes Erstellen in Google Docs muss in den Einstellungen eine Google OAuth Client-ID hinterlegt werden. Ohne Client-ID öffnet die App `docs.new` und kopiert den Text in die Zwischenablage.

### Google OAuth

Für die Google-Docs-Integration wird eine OAuth Client-ID vom Typ Webanwendung benötigt. In der Google Cloud Console muss die tatsächlich genutzte App-Adresse als autorisierte JavaScript-Quelle eingetragen werden, zum Beispiel:

```text
http://localhost:5173
http://SERVER-IP:5173
```

Es wird die Client-ID benötigt, nicht der Clientschlüssel.

Zusätzlich muss im selben Google-Cloud-Projekt unter `APIs & Dienste → Bibliothek` die `Google Docs API` aktiviert sein. Nach der Aktivierung kann es einige Minuten dauern, bis Google die Änderung übernimmt.

Die Einstellungen zeigen eine Google-Ampel. Sie prüft lokal, ob eine Client-ID vorhanden und formal gültig ist. Wenn Google beim Export meldet, dass die Docs API deaktiviert ist, zeigt die App den passenden Aktivierungslink zum Projekt an.

## Entwicklung

```bash
npm install
npm run dev
npm run verify
npm run lint
npm run build
```

Die Entwicklungs-App läuft standardmäßig unter `http://localhost:5173/` und ist im lokalen Netzwerk unter der IP-Adresse des Rechners erreichbar.

## Technischer Stack

- React
- TypeScript
- Vite
- Express
- SQLite
- Multer
- pdf-parse
- Mammoth
- docx

## Lizenz

Dieses Projekt steht unter der Creative Commons Attribution-NonCommercial 4.0 International Lizenz (`CC-BY-NC-4.0`). Freie Nutzung, Änderung und Weitergabe sind erlaubt, kommerzielle Nutzung ist nicht erlaubt. Details siehe `LICENSE`.
