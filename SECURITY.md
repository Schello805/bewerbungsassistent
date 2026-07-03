# Sicherheit

Der Bewerbungsassistent verarbeitet potenziell sehr sensible Bewerbungsdaten.

## Bitte nicht veröffentlichen

- API-Keys
- `data/secret.key`
- `data/app.db`
- echte Lebensläufe oder Zeugnisse
- Bewerbungsanschreiben mit personenbezogenen Daten
- private Arbeitgeber- oder Kontaktdaten

## Sicherheitsmeldungen

Bitte Sicherheitsprobleme nicht öffentlich als Issue mit sensiblen Details posten. Nutze stattdessen einen privaten Kontaktweg zum Projektinhaber, sobald dieser im Impressum ergänzt wurde.

## Lokales Konzept

Das Projekt ist privacy-first gedacht. Basisdaten sollen lokal im Ordner `datenbasis/` liegen. Externe KI-Anbieter erhalten nur Daten, die der Nutzer aktiv zur Verarbeitung freigibt.

API-Keys können nur temporär für die aktuelle Browser-Sitzung verwendet oder serverseitig verschlüsselt gespeichert werden. Für die serverseitige Verschlüsselung nutzt die App die lokale Datei `data/secret.key`; diese Datei muss genauso geschützt werden wie die Datenbank.
