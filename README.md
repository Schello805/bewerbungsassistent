# Bewerbungsassistent

Lokale App zum Erstellen und Bearbeiten von Bewerbungsanschreiben. Unterlagen bleiben auf dem eigenen System, hochgeladene Dokumente werden lokal abgelegt.

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
- Bewerbungsunterlagen strukturiert nach Skills, Rollen, Ausbildung und Stärken analysieren
- Anschreiben mit Absenderdaten, Empfängerblock, Betreff und Schlussformel erstellen
- gewünschte Angaben wie Wunschgehalt, Eintrittstermin oder Referenznummer als Platzhalter erkennen
- Anschreiben direkt bearbeiten
- fertige Versionen zentral in SQLite speichern
- DIN-A4-Vorschau neben dem Editor anzeigen
- DOCX herunterladen, Text kopieren oder per Google OAuth direkt in Google Docs erstellen
- gespeicherte Anschreiben öffnen, weiterbearbeiten und löschen

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
- lokale URL und Netzwerk-URL ausgeben

### Optionale Parameter

```bash
sudo APP_DIR=/opt/bewerbungsassistent PORT=5173 SERVICE_USER=bewerbungsassistent bash scripts/install.sh
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
- Status und URL ausgeben

## Betrieb

```bash
systemctl status bewerbungsassistent --no-pager
journalctl -u bewerbungsassistent -f
systemctl restart bewerbungsassistent
```

Standard-Port: `5173`

Der Server lauscht standardmäßig auf allen Netzwerkinterfaces (`0.0.0.0`). Dadurch kann die App im lokalen Netzwerk über `http://SERVER-IP:5173/` von PC, Tablet, Handy oder Laptop genutzt werden.

## Lokale Ordner

```text
datenbasis/   hochgeladene Unterlagen
data/         SQLite-Datenbank mit Stammdaten, API-Keys und gespeicherten Anschreiben
```

Persönliche Dateien in `datenbasis/` und SQLite-Dateien in `data/` werden nicht in das Repository übernommen. Nur `.gitkeep`-Dateien halten die Ordnerstruktur vor.

API-Keys werden zentral in der lokalen SQLite-Datenbank gespeichert, damit die App im lokalen Netzwerk von mehreren Geräten genutzt werden kann. Schütze Server, Datenbankdatei und Backups vor unbefugtem Zugriff.

Backups können direkt in der App unter `Einstellungen` heruntergeladen und wieder eingespielt werden. Die Backup-Datei enthält Stammdaten, Unterlagen, gespeicherte Anschreiben, Einstellungen und API-Keys.

Für `Llama lokal` wird ein laufender Ollama-Server erwartet. Standard: `OLLAMA_URL=http://127.0.0.1:11434/api/generate` und `OLLAMA_MODEL=llama3.1`.

Für direktes Erstellen in Google Docs muss in den Einstellungen eine Google OAuth Client-ID hinterlegt werden. Ohne Client-ID öffnet die App `docs.new` und kopiert den Text in die Zwischenablage.

## Entwicklung

```bash
npm install
npm run dev
npm run lint
npm run build
```

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
