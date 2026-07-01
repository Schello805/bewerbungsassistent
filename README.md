# Bewerbungsassistent

Eine lokale App zum Vorbereiten von Bewerbungsunterlagen. Das Projekt ist Open Source von Michael Schellenberger und für freie, nicht-kommerzielle Nutzung gedacht.

## Idee

Der Bewerbungsassistent nutzt vorhandene Unterlagen und eine Stellenanzeige, um einen editierbaren Textentwurf vorzubereiten. Der Text muss anschließend im Editor geprüft und angepasst werden.

## Workflow

1. **Phase A: Onboarding**
   - Dokumente wie Lebenslauf, Zeugnisse und Zertifikate im lokalen Ordner `datenbasis/` verwalten.
   - Optional einen Tonfall festlegen, z. B. locker, formell oder selbstbewusst.
   - API-Anbieter und API-Key nutzerkontrolliert eintragen.

2. **Phase B: Matching**
   - Stellenanzeige oder Link einfügen.
   - Anforderungen, vorhandene Stärken und mögliche Lücken prüfen.
   - Erst nach Bestätigung einen Entwurf generieren lassen.

3. **Phase C: Nachbearbeitung**
   - Anschreiben direkt in der App bearbeiten.
   - Formulierungen variieren oder kürzen.
   - Als `.docx` herunterladen oder Text für Google Docs kopieren.

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

Die App enthält ein lokales Backend. Uploads und Löschvorgänge in der Oberfläche schreiben direkt in den Ordner `datenbasis/`. Fertige Anschreiben werden als Textdateien im Ordner `anschreiben/` gespeichert.

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
