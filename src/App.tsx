import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, KeyRound, Link2, RefreshCw, Save, Scissors, ShieldCheck, Trash2 } from 'lucide-react';
import { Footer } from './components/Footer';
import { LegalPage } from './components/LegalPage';
import { providerOptions, voiceOptions, workflowSteps } from './data/workflow';
import { legalPages } from './pages/legalContent';
import './styles/App.css';

type UploadedDocument = {
  id: string;
  name: string;
  type: string;
  size?: number;
  updatedAt?: string;
};

type SavedLetter = {
  id: string;
  title: string;
  size: number;
  updatedAt: string;
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
  const [documentStatus, setDocumentStatus] = useState('Dokumente werden geladen ...');
  const [letterStatus, setLetterStatus] = useState('');
  const [voice, setVoice] = useState(voiceOptions[0]);
  const [provider, setProvider] = useState(providerOptions[0]);
  const [jobText, setJobText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState('Sehr geehrte Damen und Herren,\n\nmit großem Interesse habe ich Ihre Ausschreibung gelesen. Besonders die Kombination aus Verantwortung, Gestaltungsspielraum und moderner Zusammenarbeit passt sehr gut zu meinem Profil.\n\nIn meinen bisherigen Stationen konnte ich vergleichbare Aufgaben strukturiert, zuverlässig und mit einem klaren Blick für Ergebnisse umsetzen. Meine Unterlagen zeigen dabei sowohl fachliche Erfahrung als auch die Fähigkeit, mich schnell in neue Themen einzuarbeiten.\n\nGerne möchte ich in einem persönlichen Gespräch zeigen, wie ich Ihr Team konkret unterstützen kann.\n\nMit freundlichen Grüßen\nMichael Schellenberger');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analysisReady = jobText.trim().length > 40;
  const wordCount = useMemo(() => draft.trim().split(/\s+/).filter(Boolean).length, [draft]);
  const analysis = useMemo(() => buildAnalysis(jobText, profile), [jobText, profile]);

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
      if (!response.ok) {
        throw new Error('Dokumente konnten nicht geladen werden.');
      }
      const data = await response.json() as { documents: UploadedDocument[] };
      setDocuments(data.documents);
      setDocumentStatus(data.documents.length === 0 ? 'Noch keine Dateien im Ordner datenbasis/.' : `${data.documents.length} Datei(en) im Ordner datenbasis/.`);
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

  useEffect(() => {
    void loadDocuments();
    void loadLetters();
  }, [loadDocuments, loadLetters]);

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setDocumentStatus(`${file.name} wird gespeichert ...`);

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Datei konnte nicht gespeichert werden.');
      }
      await loadDocuments();
    } catch (error) {
      setDocumentStatus(error instanceof Error ? error.message : 'Datei konnte nicht gespeichert werden.');
    } finally {
      event.target.value = '';
    }
  }

  async function removeDocument(id: string) {
    setDocumentStatus(`${id} wird gelöscht ...`);
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Datei konnte nicht gelöscht werden.');
      }
      await loadDocuments();
    } catch (error) {
      setDocumentStatus(error instanceof Error ? error.message : 'Datei konnte nicht gelöscht werden.');
    }
  }

  async function saveFinalLetter() {
    setLetterStatus('Fertige Version wird gespeichert ...');
    try {
      const response = await fetch('/api/letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'anschreiben',
          text: draft,
        }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Anschreiben konnte nicht gespeichert werden.');
      }
      await loadLetters();
      setLetterStatus('Fertige Version gespeichert.');
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'Anschreiben konnte nicht gespeichert werden.');
    }
  }

  function confirmAnalysisAndCreateDraft() {
    setConfirmed(true);
    setDraft(createDraftFromProfile({
      jobText,
      profile,
      voice,
    }));
  }

  function shortenDraft() {
    setDraft((current) => current.split('\n').filter((line) => line.trim().length > 0).slice(0, 5).join('\n\n'));
  }

  function varyDraft() {
    setDraft((current) => `${current}\n\nAlternative Formulierungsidee: Ich verbinde strukturierte Arbeitsweise mit echter Motivation, mich schnell in Ihr Umfeld einzubringen und messbare Ergebnisse zu liefern.`);
  }

  async function downloadDocx() {
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const doc = new Document({
      sections: [{
        properties: {},
        children: draft.split('\n').map((line) => new Paragraph({
          children: [new TextRun(line || ' ')],
          spacing: { after: 180 },
        })),
      }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'anschreiben-entwurf.docx';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyForGoogleDocs() {
    await navigator.clipboard.writeText(draft);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <nav className="topbar" aria-label="Hauptnavigation">
            <a href="/" className="brand">
              <img src="/logo-bewerbungsassistent.png" alt="" />
              Bewerbungsassistent
            </a>
          <div>
            <a href="#workflow">Workflow</a>
            <a href="#editor">Editor</a>
            <a href="#export">Export</a>
          </div>
        </nav>
        <section className="hero-grid">
          <div>
            <p className="eyebrow">Lokale App</p>
            <h1>Bewerbung vorbereiten</h1>
            <p className="lead">Unterlagen ablegen, Stellenanzeige einfügen, Textentwurf bearbeiten.</p>
            <div className="hero-actions">
              <a href="#matching" className="button primary">Stellenanzeige einfügen</a>
              <a href="#datenbasis" className="button secondary">Datenbasis einrichten</a>
            </div>
          </div>
          <aside className="status-card">
            <ShieldCheck size={34} />
            <h2>Lokal gedacht</h2>
            <p>Basisdokumente liegen im Ordner <code>datenbasis/</code>. API-Keys werden vom Nutzer eingetragen.</p>
          </aside>
        </section>
      </header>

      <main>
        <section id="workflow" className="section">
          <div className="section-heading">
            <p className="eyebrow">Workflow</p>
            <h2>Die wichtigsten Schritte</h2>
          </div>
          <div className="workflow-grid">
            {workflowSteps.map((step) => (
              <article className="workflow-card" key={step.title}>
                <step.icon size={24} />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="datenbasis" className="section split-section">
          <div>
            <p className="eyebrow">Phase A</p>
            <h2>Datenbasis & Stimme</h2>
            <p>Lege Lebenslauf, Zeugnisse, Zertifikate und dein Master-Profil ab. Die Dateien werden lokal im Ordner <code>datenbasis/</code> gespeichert.</p>
            <div className="settings-grid">
              <label>
                KI-Anbieter
                <select value={provider} onChange={(event) => setProvider(event.target.value)}>
                  {providerOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Gewünschte Stimme
                <select value={voice} onChange={(event) => setVoice(event.target.value)}>
                  {voiceOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <label className="api-field">
              <KeyRound size={18} /> API-Key lokal eintragen
              <input type="password" placeholder={`${provider} API-Key`} aria-label="API-Key" />
            </label>
          </div>
            <div className="panel">
            <div className="panel-header">
              <h3>Dokumente</h3>
              <button type="button" onClick={() => fileInputRef.current?.click()}><FileUp size={16} /> Datei auswählen</button>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md,.rtf" onChange={uploadDocument} className="visually-hidden" />
            </div>
            <p className="document-status">{documentStatus}</p>
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
          </div>
        </section>

        <section id="matching" className="section split-section reversed">
          <div className="panel job-panel">
            <label>
              Jobanzeige oder Link einfügen
              <textarea value={jobText} onChange={(event) => setJobText(event.target.value)} placeholder="Kopiere hier die Stellenanzeige hinein oder füge später einen Link ein ..." />
            </label>
            <button type="button" className="button primary" disabled={!analysisReady}>Analysieren</button>
          </div>
          <div>
            <p className="eyebrow">Phase B</p>
            <h2>Matching vor Generierung</h2>
            <p>Die App zeigt zuerst eine kurze Übersicht. Erst nach Bestätigung wird ein Textentwurf erstellt.</p>
            <div className="analysis-grid">
              <AnalysisList title="Das fordert die Stelle" items={analysis.requirements} />
              <AnalysisList title="Aus deinen Unterlagen" items={analysis.matches} />
              <AnalysisList title="Hinweise" items={analysis.gaps} warning />
            </div>
            <button type="button" className="button secondary" onClick={confirmAnalysisAndCreateDraft} disabled={!analysisReady}>
              <CheckCircle2 size={18} /> Analyse bestätigen und Entwurf erstellen
            </button>
          </div>
        </section>

        <section id="editor" className="section editor-section">
          <div className="section-heading">
            <p className="eyebrow">Phase C</p>
            <h2>Text bearbeiten</h2>
            <p>Der erstellte Text ist ein Entwurf. Du kannst ihn direkt in der App prüfen und ändern.</p>
          </div>
          <div className="editor-layout">
            <div className="editor-toolbar">
              <span>{confirmed ? 'Entwurf bereit' : 'Bitte zuerst Analyse bestätigen'}</span>
              <button type="button" onClick={saveFinalLetter}><Save size={16} /> Fertige Version speichern</button>
              <button type="button" onClick={varyDraft}><RefreshCw size={16} /> Formulierungen variieren</button>
              <button type="button" onClick={shortenDraft}><Scissors size={16} /> Kürzen</button>
            </div>
            <textarea className="draft-editor" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <div className="editor-meta">
              <span>{wordCount} Wörter</span>
              <span>Stimme: {voice}</span>
            </div>
            <section className="saved-letters" aria-label="Gespeicherte Anschreiben">
              <div>
                <h3>Gespeicherte fertige Versionen</h3>
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
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </section>

        <section id="export" className="section export-card">
          <div>
            <p className="eyebrow">Finalisierung</p>
            <h2>Export für Word oder Google Docs</h2>
            <p>Den Text kannst du als Word-Datei herunterladen oder für Google Docs kopieren. Das Layout machst du anschließend im Textprogramm.</p>
          </div>
          <div className="export-actions">
            <button type="button" className="button primary" onClick={downloadDocx}><Download size={18} /> Als .docx herunterladen</button>
            <button type="button" className="button secondary" onClick={copyForGoogleDocs}><Link2 size={18} /> Für Google Docs kopieren</button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function buildAnalysis(jobText: string, profile: ProfileData) {
  const requirements = extractImportantPhrases(jobText, 5);
  const matches = [
    ...profile.documents.slice(0, 3).map((document) => `${document.type}: ${document.fileName}`),
    ...profile.keywords.slice(0, 4).map((keyword) => `Stichwort aus Unterlagen: ${keyword}`),
  ];
  const gaps = [
    profile.documents.length === 0 ? 'Noch keine Unterlagen hochgeladen.' : '',
    profile.text.length === 0 && profile.documents.length > 0 ? 'Mindestens eine Datei konnte nicht als Text ausgelesen werden.' : '',
    jobText.trim().length < 40 ? 'Bitte zuerst eine Stellenanzeige einfügen.' : 'Bitte konkrete Beispiele und Zahlen im Entwurf prüfen.',
  ].filter(Boolean);

  return {
    requirements: requirements.length > 0 ? requirements : ['Noch keine Stellenanzeige analysiert.'],
    matches: matches.length > 0 ? matches : ['Noch keine auslesbaren Profilinformationen vorhanden.'],
    gaps,
  };
}

function createDraftFromProfile({ jobText, profile, voice }: { jobText: string; profile: ProfileData; voice: string }) {
  const profileSource = profile.documents.length > 0
    ? `Ich beziehe mich dabei insbesondere auf meine Unterlagen (${profile.documents.map((document) => document.fileName).join(', ')}).`
    : 'Meine Unterlagen ergänze ich gerne im weiteren Verlauf.';
  const keywords = profile.keywords.slice(0, 6).join(', ');
  const requirements = extractImportantPhrases(jobText, 3).join(', ');
  const profileSummary = profile.documents.find((document) => document.type === 'Lebenslauf')?.summary
    ?? profile.documents[0]?.summary
    ?? '';

  return [
    'Sehr geehrte Damen und Herren,',
    '',
    'vielen Dank für die Möglichkeit, mich auf die ausgeschriebene Stelle zu bewerben. Die Aufgaben aus der Stellenanzeige passen gut zu meinem bisherigen Profil.',
    '',
    requirements
      ? `Besonders relevant erscheinen mir die Punkte ${requirements}.`
      : 'Besonders relevant sind für mich die beschriebenen Aufgaben und Anforderungen.',
    keywords
      ? `Aus meinem Lebenslauf und meinen Unterlagen bringe ich unter anderem Erfahrung in folgenden Bereichen mit: ${keywords}.`
      : profileSource,
    profileSummary
      ? `Ein Auszug aus meiner Datenbasis, den ich für die Bewerbung berücksichtigen möchte: ${profileSummary}`
      : profileSource,
    '',
    `Der gewünschte Stil für dieses Anschreiben ist: ${voice}. Bitte prüfe diesen Entwurf inhaltlich und passe Beispiele, Zahlen und Formulierungen vor dem Versand an.`,
    '',
    'Mit freundlichen Grüßen',
    'Michael Schellenberger',
  ].join('\n');
}

function extractImportantPhrases(text: string, limit: number) {
  const stopWords = new Set(['eine', 'einen', 'einem', 'einer', 'oder', 'und', 'mit', 'für', 'der', 'die', 'das', 'den', 'dem', 'des', 'sind', 'ist', 'wir', 'sie', 'ihre', 'deine', 'du']);
  const words = text
    .toLowerCase()
    .match(/[a-zäöüßA-ZÄÖÜ]{5,}/g) ?? [];
  const counts = new Map<string, number>();

  for (const word of words) {
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function AnalysisList({ title, items, warning = false }: { title: string; items: string[]; warning?: boolean }) {
  return (
    <article className={warning ? 'analysis-card warning' : 'analysis-card'}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

export default App;
