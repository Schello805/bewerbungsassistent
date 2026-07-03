export const legalPages = {
  '/impressum': {
    title: 'Impressum',
    intro: 'Platzhalter für die Anbieterkennzeichnung. Bitte vor Veröffentlichung mit deinen echten Angaben ersetzen.',
    sections: [
      { heading: 'Angaben gemäß § 5 TMG', body: 'Michael Schellenberger, Anschrift bitte ergänzen.' },
      { heading: 'Kontakt', body: 'E-Mail-Adresse und weitere Kontaktmöglichkeiten bitte ergänzen.' },
      { heading: 'Haftungshinweis', body: 'Die App unterstützt beim Entwurf von Bewerbungstexten. Inhalte müssen vor Verwendung eigenverantwortlich geprüft werden.' },
    ],
  },
  '/datenschutz': {
    title: 'Datenschutzerklärung',
    intro: 'Diese Datenschutzerklärung beschreibt, welche Daten der Bewerbungsassistent verarbeitet. Die App ist für den Betrieb im eigenen lokalen Netzwerk gedacht und verwendet keine Werbung, kein Tracking und keine Analyse-Cookies.',
    sections: [
      { heading: 'Verantwortlicher', body: 'Verantwortlich ist die Person oder Organisation, die diese Installation betreibt. Bei privater Nutzung im eigenen Netzwerk bleiben die Daten grundsätzlich unter Kontrolle des Betreibers.' },
      { heading: 'Verarbeitete Daten', body: 'Verarbeitet werden Stammdaten wie Name, Kontaktdaten und Absendeort, hochgeladene Bewerbungsunterlagen, Stellenanzeigen oder Links, erstellte Anschreiben, gewählter KI-Anbieter, Schreibstil sowie gespeicherte API-Keys.' },
      { heading: 'Zweck der Verarbeitung', body: 'Die Daten werden verwendet, um Bewerbungsunterlagen auszulesen, Stellenanzeigen zu analysieren, Anschreiben zu erstellen, fertige Versionen zu speichern und den Export als Dokument vorzubereiten.' },
      { heading: 'Speicherung', body: 'Unterlagen werden im Ordner datenbasis/ gespeichert. Stammdaten, gespeicherte Anschreiben und Einstellungen werden in der lokalen SQLite-Datenbank data/app.db gespeichert. Die Daten bleiben auf dem Server, auf dem die App installiert ist.' },
      { heading: 'API-Keys', body: 'API-Keys können nur für die aktuelle Browser-Sitzung verwendet oder serverseitig verschlüsselt gespeichert werden. Für die Verschlüsselung nutzt die App eine lokale Schlüsseldatei unter data/secret.key. Der Schlüssel wird im Frontend nicht im Klartext angezeigt.' },
      { heading: 'Backups', body: 'Backups können Stammdaten, Unterlagen, gespeicherte Anschreiben und Einstellungen enthalten. Serverseitig gespeicherte API-Keys liegen verschlüsselt in der Datenbank vor. Backup-Dateien sollten dennoch vertraulich gespeichert, verschlüsselt abgelegt oder nach Nutzung gelöscht werden.' },
      { heading: 'KI-Anbieter', body: 'Wenn ein KI-Anbieter genutzt wird, können Stellenanzeigen, Auszüge aus Unterlagen, Stammdaten und der Entwurf des Anschreibens an den ausgewählten Anbieter übertragen werden. Dabei gelten zusätzlich die Datenschutz- und Nutzungsbedingungen des jeweiligen KI-Anbieters.' },
      { heading: 'Lokale KI und Google Docs', body: 'Bei Nutzung von Llama lokal werden KI-Anfragen an den konfigurierten lokalen Ollama-Server gesendet. Bei Nutzung der Google-Docs-Integration erfolgt die Anmeldung über Google OAuth; der Anschreibentext wird anschließend an Google Docs übertragen.' },
      { heading: 'Keine Trackingdienste', body: 'Die App setzt keine Analyse-, Marketing- oder Werbedienste ein. Es werden keine Tracking-Cookies gesetzt und keine Nutzungsprofile erstellt.' },
      { heading: 'Speicherdauer und Löschung', body: 'Daten bleiben gespeichert, bis sie in der App gelöscht oder die entsprechenden Dateien beziehungsweise die Datenbank entfernt werden. Hochgeladene Unterlagen können in der App gelöscht werden; gespeicherte Anschreiben und API-Keys können ebenfalls entfernt werden.' },
      { heading: 'Rechte betroffener Personen', body: 'Je nach Nutzungskontext können Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch bestehen. Da die App selbstverwaltet betrieben wird, sind Anfragen an den jeweiligen Betreiber der Installation zu richten.' },
      { heading: 'Sicherheit', body: 'Der Betrieb ist für ein vertrauenswürdiges lokales Netzwerk vorgesehen. Für produktive Installationen sollten Zugriffsschutz, sichere Backups, aktuelle Systemupdates, Schutz der Schlüsseldatei und eine geeignete Absicherung des Servers eingerichtet werden.' },
      { heading: 'Hinweis', body: 'Diese Erklärung ist eine technische Vorlage für dieses Open-Source-Projekt und ersetzt keine individuelle rechtliche Prüfung, insbesondere nicht bei öffentlichem Hosting oder gewerblichem Betrieb.' },
    ],
  },
  '/cookies': {
    title: 'Cookiehinweise',
    intro: 'Die App verwendet keine Tracking-Cookies und keine Werbe-Cookies.',
    sections: [
      { heading: 'Keine Tracking-Cookies', body: 'Es werden keine Analyse-, Marketing-, Retargeting- oder Social-Tracking-Cookies gesetzt.' },
      { heading: 'Technische Speicherung', body: 'Die App speichert Stammdaten, Einstellungen, API-Keys und Anschreiben serverseitig in der lokalen SQLite-Datenbank. Eine frühere lokale Browser-Speicherung von API-Keys wird beim Öffnen der App automatisch in die zentrale Speicherung übernommen und danach aus dem Browser entfernt.' },
      { heading: 'Änderungen', body: 'Wenn externe Dienste ergänzt werden, müssen diese Hinweise entsprechend aktualisiert werden.' },
    ],
  },
};
