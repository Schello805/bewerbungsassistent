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
    intro: 'Diese lokale App ist datensparsam konzipiert. Bitte passe die Erklärung an, sobald Hosting, Analytics oder externe APIs produktiv genutzt werden.',
    sections: [
      { heading: 'Lokale Verarbeitung', body: 'Profil- und Bewerbungsdaten sollen primär lokal auf dem Gerät verarbeitet und im Ordner datenbasis/ verwaltet werden.' },
      { heading: 'KI-Anbieter', body: 'Bei Nutzung eines API-Keys können Inhalte an den jeweils ausgewählten KI-Anbieter übertragen werden. Prüfe dessen Datenschutzbedingungen vor der Nutzung.' },
      { heading: 'Speicherung', body: 'Diese Vorlage sieht keine serverseitige Speicherung vor. Browserdaten können lokal im Browser entstehen.' },
    ],
  },
  '/cookies': {
    title: 'Cookiehinweise',
    intro: 'Die App ist ohne Tracking-Cookies geplant. Diese Hinweise sollten aktualisiert werden, falls später Analyse- oder Marketingdienste ergänzt werden.',
    sections: [
      { heading: 'Technisch notwendige Speicherung', body: 'Für Komfortfunktionen können lokale Browser-Speicher wie localStorage verwendet werden.' },
      { heading: 'Keine Werbung', body: 'Es sind keine Werbe-, Retargeting- oder Social-Tracking-Cookies vorgesehen.' },
      { heading: 'Änderungen', body: 'Wenn externe Dienste ergänzt werden, müssen diese Hinweise entsprechend aktualisiert werden.' },
    ],
  },
};
