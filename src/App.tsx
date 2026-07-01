import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileUp, KeyRound, Link2, RefreshCw, Save, Scissors, Trash2, WandSparkles } from 'lucide-react';
import { Footer } from './components/Footer';
import { LegalPage } from './components/LegalPage';
import { providerOptions, voiceOptions } from './data/workflow';
import { legalPages } from './pages/legalContent';
import './styles/App.css';

type UploadedDocument = {
  id: string;
  name: string;
  type: string;
  size?: number;
};

type SavedLetter = {
  id: string;
  title: string;
  size: number;
  updatedAt: string;
  text?: string;
};

type ProfileDocument = {
  fileName: string;
  type: string;
  summary: string;
  characterCount: number;
};

type ProfileData = {
  documents: ProfileDocument[];
  text: string;
  keywords: string[];
};

type PersonalData = {
  name: string;
  qualification: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  website: string;
  location: string;
  closingName: string;
};

type JobDetails = {
  recipient: string;
  contact: string;
  address: string;
  subject: string;
  salutation: string;
  company: string;
  title: string;
  requestedInfo: RequestedInfo[];
};

type RequestedInfo = 'salary' | 'startDate' | 'availability' | 'reference' | 'documents' | 'motivation';

const defaultPersonalData: PersonalData = {
  name: 'Michael Schellenberger',
  qualification: 'staatl. gepr. Betriebswirt',
  email: 'Michael@Schellenberger.biz',
  phone: '0176-80114354',
  street: 'Ziegeleistraße 32',
  city: '91572 Bechhofen',
  website: 'https://michael.schellenberger.biz',
  location: 'Bechhofen',
  closingName: 'Michael Schellenberger',
};

function App() {
  const currentPath = window.location.pathname;
  const legalPage = legalPages[currentPath as keyof typeof legalPages];

  if (legalPage) {
    return <LegalPage {...legalPage} />;
  }

  return <ApplicationShell />;
}

function ApplicationShell() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [letters, setLetters] = useState<SavedLetter[]>([]);
  const [profile, setProfile] = useState<ProfileData>({ documents: [], text: '', keywords: [] });
  const [personalData, setPersonalData] = useState<PersonalData>(defaultPersonalData);
  const [jobInput, setJobInput] = useState('');
  const [draft, setDraft] = useState('');
  const [documentStatus, setDocumentStatus] = useState('Dokumente werden geladen ...');
  const [letterStatus, setLetterStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeLetterId, setActiveLetterId] = useState<string | null>(null);
  const [voice, setVoice] = useState(voiceOptions[0]);
  const [provider, setProvider] = useState(providerOptions[0]);
  const [apiKey, setApiKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = useMemo(() => draft.trim().split(/\s+/).filter(Boolean).length, [draft]);
  const jobDetails = useMemo(() => extractJobDetails(jobInput), [jobInput]);
  const canCreateLetter = jobInput.trim().length > 8 && personalData.name.trim().length > 0;

  const loadProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/profile');
      if (!response.ok) throw new Error('Profil konnte nicht ausgelesen werden.');
      const data = await response.json() as ProfileData;
      setProfile(data);
    } catch {
      setProfile({ documents: [], text: '', keywords: [] });
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch('/api/documents');
      if (!response.ok) throw new Error('Dokumente konnten nicht geladen werden.');
      const data = await response.json() as { documents: UploadedDocument[] };
      setDocuments(data.documents);
      setDocumentStatus(data.documents.length === 0 ? 'Noch keine Unterlagen hochgeladen.' : `${data.documents.length} Datei(en) geladen.`);
      await loadProfile();
    } catch (error) {
      setDocumentStatus(error instanceof Error ? error.message : 'Dokumente konnten nicht geladen werden.');
    }
  }, [loadProfile]);

  const loadLetters = useCallback(async () => {
    try {
      const response = await fetch('/api/letters');
      if (!response.ok) throw new Error('Gespeicherte Anschreiben konnten nicht geladen werden.');
      const data = await response.json() as { letters: SavedLetter[] };
      setLetters(data.letters);
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'Gespeicherte Anschreiben konnten nicht geladen werden.');
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) return;
      const data = await response.json() as {
        personalData?: PersonalData | null;
        provider?: string | null;
        voice?: string | null;
      };
      if (data.personalData) {
        setPersonalData({ ...defaultPersonalData, ...data.personalData });
      }
      if (data.provider && providerOptions.includes(data.provider)) {
        setProvider(data.provider);
      }
      if (data.voice && voiceOptions.includes(data.voice)) {
        setVoice(data.voice);
      }
    } catch {
      // Settings are optional; defaults keep the app usable.
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadDocuments();
    void loadLetters();
  }, [loadDocuments, loadLetters, loadSettings]);

  useEffect(() => {
    setApiKey(localStorage.getItem(getApiKeyStorageKey(provider)) ?? '');
  }, [provider]);

  async function saveSettings(nextSettings: { personalData?: PersonalData; provider?: string; voice?: string }) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings),
    });
  }

  function updatePersonalData(field: keyof PersonalData, value: string) {
    setPersonalData((current) => {
      const next = { ...current, [field]: value };
      void saveSettings({ personalData: next });
      return next;
    });
  }

  function updateProvider(value: string) {
    setProvider(value);
    void saveSettings({ provider: value });
  }

  function updateVoice(value: string) {
    setVoice(value);
    void saveSettings({ voice: value });
  }

  function updateApiKey(value: string) {
    setApiKey(value);
    const storageKey = getApiKeyStorageKey(provider);

    if (value.trim().length === 0) {
      localStorage.removeItem(storageKey);
      return;
    }

    localStorage.setItem(storageKey, value);
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    setIsUploading(true);
    setDocumentStatus(files.length === 1 ? `${files[0].name} wird gespeichert ...` : `${files.length} Dateien werden gespeichert ...`);

    try {
      const response = await fetch('/api/documents', { method: 'POST', body: formData });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Dateien konnten nicht gespeichert werden.');
      }
      await loadDocuments();
    } catch (error) {
      setDocumentStatus(error instanceof Error ? error.message : 'Dateien konnten nicht gespeichert werden.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  }

  async function removeDocument(id: string) {
    setDocumentStatus(`${id} wird gelöscht ...`);
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Datei konnte nicht gelöscht werden.');
      }
      await loadDocuments();
    } catch (error) {
      setDocumentStatus(error instanceof Error ? error.message : 'Datei konnte nicht gelöscht werden.');
    }
  }

  async function createLetter() {
    setIsGenerating(true);
    setLetterStatus('');
    try {
      const resolvedJobInput = await resolveJobInput(jobInput);
      if (resolvedJobInput !== jobInput) {
        setJobInput(resolvedJobInput);
      }
      const resolvedJobDetails = extractJobDetails(resolvedJobInput);

      if (!apiKey.trim()) {
        setDraft(createDraft({ personalData, jobDetails: resolvedJobDetails, profile, voice }));
        setLetterStatus('Kein API-Key eingetragen. Lokale Vorlage erstellt.');
        return;
      }

      const response = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          voice,
          personalData,
          jobInput: resolvedJobInput,
          jobDetails: resolvedJobDetails,
        }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'KI-Generierung fehlgeschlagen.');
      }
      const data = await response.json() as { text: string };
      setDraft(data.text || createDraft({ personalData, jobDetails: resolvedJobDetails, profile, voice }));
      setActiveLetterId(null);
    } catch (error) {
      setDraft(createDraft({ personalData, jobDetails, profile, voice }));
      setLetterStatus(error instanceof Error ? `KI nicht verfügbar: ${error.message}` : 'KI nicht verfügbar. Lokale Vorlage erstellt.');
    } finally {
      setIsGenerating(false);
      window.setTimeout(() => document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  function shortenDraft() {
    setDraft((current) => current.split('\n').filter((line) => line.trim().length > 0).slice(0, 18).join('\n\n'));
  }

  function varyDraft() {
    setDraft((current) => `${current}\n\nAlternative Formulierung:\nIch bringe eine strukturierte, praxisnahe Arbeitsweise mit und kann mich schnell in neue Aufgaben einarbeiten.`);
  }

  async function saveFinalLetter() {
    setLetterStatus('Fertige Version wird gespeichert ...');
    try {
      const response = await fetch(activeLetterId ? `/api/letters/${encodeURIComponent(activeLetterId)}` : '/api/letters', {
        method: activeLetterId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: jobDetails.subject || 'anschreiben', text: draft }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Anschreiben konnte nicht gespeichert werden.');
      }
      await loadLetters();
      const data = await response.json() as { letter?: SavedLetter };
      if (data.letter?.id) setActiveLetterId(data.letter.id);
      setLetterStatus(activeLetterId ? 'Änderungen gespeichert.' : 'Fertige Version gespeichert.');
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'Anschreiben konnte nicht gespeichert werden.');
    }
  }

  async function downloadDocx() {
    const { AlignmentType, Document, Packer, Paragraph, TextRun } = await import('docx');
    const lines = draft.split('\n');
    const subjectIndex = lines.findIndex((line) => line.trim().toLowerCase().startsWith('bewerbung'));
    const dateIndex = lines.findIndex((line) => /\b\d{2}\.\d{2}\.\d{4}\b/.test(line));
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children: lines.map((line, index) => new Paragraph({
          alignment: index === dateIndex ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({
            text: line || ' ',
            bold: index === 0 || index === subjectIndex,
            italics: index === 1,
            size: index === subjectIndex ? 24 : 22,
          })],
          spacing: {
            before: index === subjectIndex ? 260 : 0,
            after: line.trim() === '' ? 100 : index === subjectIndex ? 260 : 170,
          },
        })),
      }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(jobDetails.subject || 'anschreiben')}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyForGoogleDocs() {
    await navigator.clipboard.writeText(draft);
  }

  async function resolveJobInput(input: string) {
    const url = extractUrl(input.trim());
    if (!url || input.trim().replace(url, '').trim().length > 30) return input;

    const response = await fetch('/api/fetch-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) return input;
    const data = await response.json() as { job?: { title?: string; text?: string; url?: string } };
    return [data.job?.title, data.job?.url, data.job?.text].filter(Boolean).join('\n\n') || input;
  }

  async function openLetter(id: string) {
    setLetterStatus('Gespeicherte Version wird geladen ...');
    try {
      const response = await fetch(`/api/letters/${encodeURIComponent(id)}`);
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Anschreiben konnte nicht geladen werden.');
      }
      const data = await response.json() as { letter: SavedLetter };
      setDraft(data.letter.text ?? '');
      setActiveLetterId(data.letter.id);
      setLetterStatus('Gespeicherte Version geladen.');
      window.setTimeout(() => document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'Anschreiben konnte nicht geladen werden.');
    }
  }

  async function deleteLetter(id: string) {
    setLetterStatus('Gespeicherte Version wird gelöscht ...');
    try {
      const response = await fetch(`/api/letters/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Anschreiben konnte nicht gelöscht werden.');
      }
      if (activeLetterId === id) {
        setActiveLetterId(null);
        setDraft('');
      }
      await loadLetters();
      setLetterStatus('Gespeicherte Version gelöscht.');
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'Anschreiben konnte nicht gelöscht werden.');
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <nav className="topbar" aria-label="Hauptnavigation">
          <a href="/" className="brand">
            <img src="/logo-bewerbungsassistent.png" alt="" />
            Bewerbungsassistent
          </a>
          <span className="header-badge">Netzwerkfähig · SQLite · KI</span>
        </nav>
      </header>

      <main className="app-main">
        <section id="create" className="create-grid">
          <article className="panel create-panel">
            <p className="eyebrow">Anschreiben</p>
            <h1>Link oder Stellenanzeige einfügen</h1>
            <label>
              Stellenanzeige / Link
              <textarea
                value={jobInput}
                onChange={(event) => setJobInput(event.target.value)}
                placeholder="Link oder Text der Stellenanzeige hier einfügen ..."
              />
            </label>
            <button type="button" className="button primary big-action" onClick={createLetter} disabled={!canCreateLetter || isGenerating}>
              <WandSparkles size={18} />
              {isGenerating ? 'Anschreiben wird erstellt ...' : 'Anschreiben erstellen'}
            </button>
          </article>

          <aside id="stammdaten" className="panel master-data-panel">
            <div className="panel-header compact-header">
              <h2>Stammdaten</h2>
              <span>zentral gespeichert</span>
            </div>
            <div className="form-grid compact-form">
              <TextField label="Name" value={personalData.name} onChange={(value) => updatePersonalData('name', value)} />
              <TextField label="Qualifikation" value={personalData.qualification} onChange={(value) => updatePersonalData('qualification', value)} />
              <TextField label="E-Mail" value={personalData.email} onChange={(value) => updatePersonalData('email', value)} />
              <TextField label="Telefon" value={personalData.phone} onChange={(value) => updatePersonalData('phone', value)} />
              <TextField label="Straße" value={personalData.street} onChange={(value) => updatePersonalData('street', value)} />
              <TextField label="PLZ Ort" value={personalData.city} onChange={(value) => updatePersonalData('city', value)} />
              <TextField label="Website" value={personalData.website} onChange={(value) => updatePersonalData('website', value)} />
              <TextField label="Absendeort" value={personalData.location} onChange={(value) => updatePersonalData('location', value)} />
            </div>
          </aside>
        </section>

        <section className="section slim-grid">
          <article className={isUploading ? 'panel upload-panel is-uploading' : 'panel upload-panel'}>
            <div className="panel-header">
              <div>
                <h2>Unterlagen</h2>
                <p className="document-status">{documentStatus}</p>
              </div>
              <button type="button" className="upload-button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <span className="upload-icon-wrap"><FileUp size={16} /></span>
                {isUploading ? 'Upload läuft ...' : 'Dateien auswählen'}
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md,.rtf" multiple onChange={uploadDocument} className="visually-hidden" />
            </div>
            {isUploading && (
              <div className="upload-progress" aria-label="Upload läuft">
                <span />
              </div>
            )}
            <ul className="document-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <span>
                    <strong>{document.type}</strong>
                    {document.name}
                    {typeof document.size === 'number' && <small>{formatFileSize(document.size)}</small>}
                  </span>
                  <button type="button" onClick={() => removeDocument(document.id)} aria-label={`${document.name} löschen`}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <h2>KI</h2>
            <div className="settings-grid">
              <label>
                Anbieter
                <select value={provider} onChange={(event) => updateProvider(event.target.value)}>
                  {providerOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Stil
                <select value={voice} onChange={(event) => updateVoice(event.target.value)}>
                  {voiceOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <label className="api-field">
              <KeyRound size={18} /> API-Key
              <input type="password" placeholder={`${provider} API-Key`} value={apiKey} onChange={(event) => updateApiKey(event.target.value)} autoComplete="off" />
            </label>
            <p className="field-note">Wird nur lokal in diesem Browser gespeichert.</p>
          </article>
        </section>

        <section id="editor" className="section editor-section">
          <div className="editor-layout">
            <div className="editor-toolbar">
              <span>{draft ? `${wordCount} Wörter${activeLetterId ? ' · gespeicherte Version geöffnet' : ''}` : 'Noch kein Anschreiben erstellt'}</span>
              <div className="toolbar-actions">
                <button type="button" onClick={varyDraft} disabled={!draft}><RefreshCw size={16} /> Variieren</button>
                <button type="button" onClick={shortenDraft} disabled={!draft}><Scissors size={16} /> Kürzen</button>
                <button type="button" onClick={saveFinalLetter} disabled={!draft}><Save size={16} /> Fertig speichern</button>
              </div>
            </div>
            <textarea
              className="draft-editor"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Hier erscheint dein Anschreiben. Du kannst es direkt bearbeiten."
            />
            <div className="editor-meta">
              <button type="button" className="button primary" onClick={downloadDocx} disabled={!draft}><Download size={18} /> DOCX herunterladen</button>
              <button type="button" className="button secondary" onClick={copyForGoogleDocs} disabled={!draft}><Link2 size={18} /> Text kopieren</button>
            </div>
            <section className="saved-letters" aria-label="Gespeicherte Anschreiben">
              <div>
                <h3>Gespeicherte Versionen</h3>
                {letterStatus && <p>{letterStatus}</p>}
              </div>
              {letters.length === 0 ? (
                <p>Noch keine fertige Version gespeichert.</p>
              ) : (
                <ul>
                  {letters.map((letter) => (
                    <li key={letter.id}>
                      <span>{letter.title}</span>
                      <small>{new Date(letter.updatedAt).toLocaleString('de-DE')} · {formatFileSize(letter.size)}</small>
                      <div className="saved-letter-actions">
                        <button type="button" onClick={() => openLetter(letter.id)}>Öffnen</button>
                        <button type="button" className="danger-button" onClick={() => deleteLetter(letter.id)}>Löschen</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function extractJobDetails(input: string): JobDetails {
  const text = input.trim();
  const url = extractUrl(text);
  const companyFromUrl = url ? companyFromUrlString(url) : '';
  const companyFromText = extractCompany(text);
  const title = extractTitle(text, url);
  const contact = extractContact(text);
  const recipient = [companyFromText || companyFromUrl, contact].filter(Boolean).join('\n') || 'Empfänger bitte prüfen';

  return {
    recipient,
    contact,
    address: extractAddress(text),
    subject: title ? `Bewerbung als ${title}` : 'Bewerbung',
    salutation: contact ? `Sehr geehrte${contact.toLowerCase().includes('herr') ? 'r' : ''} ${contact.replace(/^(frau|herr)\s+/i, '')},` : 'Sehr geehrte Damen und Herren,',
    company: companyFromText || companyFromUrl,
    title,
    requestedInfo: extractRequestedInfo(text),
  };
}

function createDraft({ personalData, jobDetails, profile, voice }: { personalData: PersonalData; jobDetails: JobDetails; profile: ProfileData; voice: string }) {
  const date = new Intl.DateTimeFormat('de-DE').format(new Date());
  const keywords = profile.keywords.slice(0, 6).join(', ');
  const cvSummary = profile.documents.find((document) => document.type === 'Lebenslauf')?.summary ?? profile.documents[0]?.summary ?? '';
  const companyReference = jobDetails.company ? ` bei ${jobDetails.company}` : '';
  const titleReference = jobDetails.title ? ` für die Position ${jobDetails.title}` : '';
  const requestedParagraphs = createRequestedInfoParagraphs(jobDetails.requestedInfo);

  return [
    personalData.name,
    personalData.qualification,
    [personalData.email, personalData.phone].filter(Boolean).join(' · '),
    [personalData.street, personalData.city].filter(Boolean).join(' · '),
    personalData.website,
    '',
    jobDetails.recipient,
    jobDetails.address,
    '',
    `${personalData.location}, ${date}`,
    '',
    jobDetails.subject,
    '',
    jobDetails.salutation,
    '',
    `mit großem Interesse bewerbe ich mich${titleReference}${companyReference}.`,
    keywords ? `Aus meinem Lebenslauf bringe ich besonders folgende Erfahrungen mit: ${keywords}.` : 'Meine bisherigen Unterlagen zeigen eine strukturierte und zuverlässige Arbeitsweise.',
    cvSummary ? `Relevant aus meiner Datenbasis: ${cvSummary}` : '',
    ...requestedParagraphs,
    `Der gewünschte Stil ist: ${voice}. Bitte diesen Entwurf vor dem Versand prüfen und persönliche Beispiele ergänzen.`,
    '',
    'Mit freundlichen Grüßen',
    '',
    personalData.closingName || personalData.name,
  ].filter((line) => line !== undefined).join('\n');
}

function extractRequestedInfo(text: string): RequestedInfo[] {
  const normalized = text.toLowerCase();
  const checks: Array<[RequestedInfo, RegExp]> = [
    ['salary', /(gehaltsvorstellung|wunschgehalt|gehaltswunsch|jahresgehalt|gehaltsangabe|gehaltsrahmen|salary expectation)/i],
    ['startDate', /(eintrittstermin|starttermin|frühestmöglichen eintritt|frühestmöglicher eintritt|verfügbarkeit ab|startdatum)/i],
    ['availability', /(kündigungsfrist|verfügbarkeit|verfügbar|availability)/i],
    ['reference', /(referenznummer|kennziffer|job[- ]?id|stellen[- ]?id|ausschreibungsnummer|reference number)/i],
    ['documents', /(vollständige unterlagen|zeugnisse|zertifikate|arbeitsproben|anlagen|portfolio)/i],
    ['motivation', /(motivationsschreiben|motivation|warum sie|warum du|begründung)/i],
  ];

  return checks
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([info]) => info);
}

function createRequestedInfoParagraphs(requestedInfo: RequestedInfo[]) {
  const paragraphs: Record<RequestedInfo, string> = {
    salary: 'Meine Gehaltsvorstellung liegt bei XXX EUR brutto jährlich.',
    startDate: 'Mein frühestmöglicher Eintrittstermin ist der XXX.',
    availability: 'Meine aktuelle Kündigungsfrist beträgt XXX; ich bin voraussichtlich ab XXX verfügbar.',
    reference: 'Die in der Ausschreibung genannte Referenznummer/Kennziffer lautet: XXX.',
    documents: 'Die gewünschten Anlagen und Nachweise reiche ich vollständig ein: XXX.',
    motivation: 'Meine besondere Motivation für diese Position ist XXX.',
  };

  return requestedInfo.map((info) => paragraphs[info]);
}

function extractUrl(text: string) {
  return text.match(/https?:\/\/\S+/i)?.[0] ?? '';
}

function companyFromUrlString(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const name = hostname.split('.')[0].replaceAll('-', ' ');
    return titleCase(name);
  } catch {
    return '';
  }
}

function extractCompany(text: string) {
  return text.match(/([A-ZÄÖÜ][\wÄÖÜäöüß&. -]+\s(?:GmbH|AG|SE|KG|OHG|e\.V\.|Group|Holding))/)?.[1]?.trim() ?? '';
}

function extractContact(text: string) {
  return text.match(/\b(Frau|Herr)\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)?/)?.[0] ?? '';
}

function extractAddress(text: string) {
  const address = text.match(/([A-ZÄÖÜ][\wÄÖÜäöüß. -]+\s+\d+[a-zA-Z]?,?\s*\n?\s*\d{5}\s+[A-ZÄÖÜ][\wÄÖÜäöüß -]+)/)?.[0];
  return address?.replace(/\s+/g, ' ').trim() ?? '';
}

function extractTitle(text: string, url: string) {
  const titleFromText = text.match(/(?:Position|Stelle|Job|als)\s+([^\n.]{4,80})/i)?.[1]?.trim();
  if (titleFromText) return cleanTitle(titleFromText);

  if (url) {
    try {
      const path = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
      return cleanTitle(titleCase(path.replace(/[-_]/g, ' ')));
    } catch {
      return '';
    }
  }

  return cleanTitle(text.split('\n').find((line) => line.trim().length > 6)?.trim() ?? '');
}

function cleanTitle(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 90);
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '') || 'anschreiben';
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getApiKeyStorageKey(provider: string) {
  return `bewerbungsassistent.apiKey.${provider}`;
}

export default App;
