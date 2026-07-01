# Bewerbungsassistent

Eine lokale App zum Vorbereiten von Bewerbungsunterlagen. Das Projekt ist Open Source von Michael Schellenberger und für freie, nicht-kommerzielle Nutzung gedacht.

## Idee

Der Bewerbungsassistent nutzt vorhandene Unterlagen und eine Stellenanzeige, um einen editierbaren Textentwurf vorzubereiten. Der Text muss anschließend im Editor geprüft und angepasst werden.

## Nutzung

1. Stammdaten einmalig eintragen.
2. Unterlagen hochladen.
3. Link oder Text der Stellenanzeige einfügen.
4. **Anschreiben erstellen** klicken.
5. Text bei Bedarf anpassen, speichern oder als DOCX herunterladen.

Die App versucht Empfänger, Ansprechpartner und Betreff aus dem eingefügten Link oder Text abzuleiten. Diese Daten sollten vor dem Versand geprüft werden.

## Technischer Stack

- React
- TypeScript
- Vite
- Lucide Icons
- docx für clientseitigen Word-Export

## Lokal starten

```bash
npm install
npm run dev
```

Danach öffnest du die lokale Adresse, die Vite im Terminal ausgibt.

## Build erstellen

```bash
npm run build
npm run preview
```

## Auf einem lokalen Server starten

Für einen Proxmox-Container oder eine VM mit Node.js:

```bash
git clone https://github.com/Schello805/bewerbungsassistent.git
cd bewerbungsassistent
npm install
npm run build
npm start
```

Standardmäßig läuft die App auf `http://localhost:5173/`. Für dauerhaften Betrieb empfiehlt sich später ein Prozessmanager wie `pm2` oder ein systemd-Service.

## Datenbasis

Der Ordner `datenbasis/` ist für lokale Bewerbungsunterlagen vorgesehen. Beispielhafte Dateinamen:

```text
datenbasis/
  lebenslauf.pdf
  zeugnisse.pdf
  zertifikate.pdf
  master-profil.md
```

Die App enthält ein lokales Backend. Einzelne oder mehrere Uploads und Löschvorgänge in der Oberfläche schreiben direkt in den Ordner `datenbasis/`. Fertige Anschreiben werden als Textdateien im Ordner `anschreiben/` gespeichert.

Persönliche Dateien in `datenbasis/` und gespeicherte Anschreiben in `anschreiben/` werden nicht zu GitHub hochgeladen. Nur die `.gitkeep`-Dateien halten die Ordnerstruktur im Repository.

## API-Keys

API-Keys sollten nicht committed werden. Nutze später `.env.local` oder eine lokale, verschlüsselte Speicherung. Die Datei `.env*` ist bereits in `.gitignore` ausgeschlossen.

## Revision

Die Rev.-Nr. im Footer kommt automatisch aus der Version in `package.json`. Bei einem Release kann sie z. B. mit folgendem Befehl erhöht werden:

```bash
npm run release
```

## Rechtliches

Im Footer ist die Datenschutzseite verlinkt. Impressum und Cookiehinweise sind entfernt, da die App lokal läuft und nicht als öffentliche Website gedacht ist.

## Lizenz

Dieses Projekt steht unter der Creative Commons Attribution-NonCommercial 4.0 International Lizenz (`CC-BY-NC-4.0`). Freie Nutzung, Änderung und Weitergabe sind erlaubt, kommerzielle Nutzung ist nicht erlaubt. Details siehe `LICENSE`.
