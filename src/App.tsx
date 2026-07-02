import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FileUp, KeyRound, Link2, RefreshCw, Save, Scissors, Trash2, WandSparkles } from 'lucide-react';
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
  insights?: {
    skills: string[];
    roles: string[];
    education: string[];
    strengths: string[];
  };
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
type RewriteMode = 'modern' | 'detailed' | 'confident' | 'formal' | 'alternative' | 'shorten';
type AiCandidate = {
  provider: string;
  text: string;
  ok: boolean;
  error?: string;
};

const rewriteLabels: Record<RewriteMode, string> = {
  modern: 'Moderner',
  detailed: 'Detaillierter',
  confident: 'Selbstbewusster',
  formal: 'Formeller',
  alternative: 'Alternative',
  shorten: 'Kürzen',
};

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
  const [isRewriting, setIsRewriting] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [activeLetterId, setActiveLetterId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AiCandidate[]>([]);
  const [view, setView] = useState<'apply' | 'settings'>('apply');
  const [voice, setVoice] = useState(voiceOptions[0]);
  const [provider, setProvider] = useState(providerOptions[0]);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyProviders, setApiKeyProviders] = useState<string[]>([]);
  const [apiKeyStatus, setApiKeyStatus] = useState('');
  const [isApiKeyEditing, setIsApiKeyEditing] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientIdStatus, setGoogleClientIdStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const wordCount = useMemo(() => draft.trim().split(/\s+/).filter(Boolean).length, [draft]);
  const jobDetails = useMemo(() => extractJobDetails(jobInput), [jobInput]);
  const canCreateLetter = jobInput.trim().length > 8 && personalData.name.trim().length > 0;
  const providerNeedsApiKey = provider !== 'Llama lokal';
  const hasApiKey = !providerNeedsApiKey || apiKey.trim().length > 0 || apiKeyProviders.includes(provider);
  const currentProviderHasStoredKey = apiKeyProviders.includes(provider);
  const apiKeyDisplayValue = apiKey || (!isApiKeyEditing && currentProviderHasStoredKey ? '••••••••••••' : '');

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
        apiKeyProviders?: string[];
        googleClientId?: string | null;
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
      if (data.googleClientId) {
        setGoogleClientId(data.googleClientId);
      }
      setApiKeyProviders(Array.isArray(data.apiKeyProviders) ? data.apiKeyProviders : []);
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
    const legacyApiKey = localStorage.getItem(getApiKeyStorageKey(provider));
    if (!legacyApiKey || apiKeyProviders.includes(provider)) return;
    const legacyApiKeyValue = legacyApiKey;

    async function migrateLegacyApiKey() {
      try {
        await saveSettings({ provider, apiKey: legacyApiKeyValue });
        localStorage.removeItem(getApiKeyStorageKey(provider));
        setApiKeyProviders((current) => current.includes(provider) ? current : [...current, provider]);
        setApiKeyStatus('Vorhandener API-Key wurde übernommen.');
      } catch {
        setApiKeyStatus('API-Key konnte nicht automatisch übernommen werden.');
      }
    }

    void migrateLegacyApiKey();
  }, [apiKeyProviders, provider]);

  async function saveSettings(nextSettings: { personalData?: PersonalData; provider?: string; voice?: string; apiKey?: string; googleClientId?: string }) {
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
    setApiKey('');
    setApiKeyStatus('');
    setIsApiKeyEditing(false);
    void saveSettings({ provider: value });
  }

  function updateVoice(value: string) {
    setVoice(value);
    void saveSettings({ voice: value });
  }

  function updateGoogleClientId(value: string) {
    setGoogleClientId(value);
    setGoogleClientIdStatus(value.trim().length > 0 ? 'Noch nicht gespeichert.' : '');
  }

  async function saveGoogleClientId() {
    const normalizedClientId = normalizeGoogleClientId(googleClientId);

    if (normalizedClientId && !isValidGoogleClientId(normalizedClientId)) {
      setGoogleClientIdStatus('Bitte die vollständige Client-ID eintragen: ...apps.googleusercontent.com');
      return;
    }

    try {
      setGoogleClientId(normalizedClientId);
      await saveSettings({ googleClientId: normalizedClientId });
      setGoogleClientIdStatus(normalizedClientId ? 'Google Client-ID gespeichert.' : 'Google Client-ID entfernt.');
    } catch {
      setGoogleClientIdStatus('Google Client-ID konnte nicht gespeichert werden.');
    }
  }

  function updateApiKey(value: string) {
    setApiKey(value);
    setIsApiKeyEditing(true);
    setApiKeyStatus(value.trim().length > 0 ? 'Noch nicht gespeichert.' : '');
  }

  async function saveApiKey() {
    if (!apiKey.trim()) return;

    try {
      await saveSettings({ provider, apiKey });
      setApiKeyProviders((current) => current.includes(provider) ? current : [...current, provider]);
      setApiKey('');
      setIsApiKeyEditing(false);
      setApiKeyStatus('API-Key gespeichert.');
    } catch {
      setApiKeyStatus('API-Key konnte nicht gespeichert werden.');
    }
  }

  async function removeApiKey() {
    try {
      await saveSettings({ provider, apiKey: '' });
      setApiKey('');
      setIsApiKeyEditing(false);
      setApiKeyProviders((current) => current.filter((item) => item !== provider));
      setApiKeyStatus('API-Key entfernt.');
    } catch {
      setApiKeyStatus('API-Key konnte nicht entfernt werden.');
    }
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
    setCandidates([]);
    try {
      const resolvedJobInput = await resolveJobInput(jobInput);
      if (resolvedJobInput !== jobInput) {
        setJobInput(resolvedJobInput);
      }
      const resolvedJobDetails = extractJobDetails(resolvedJobInput);

      if (!hasApiKey) {
        setDraft(createDraft({ personalData, jobDetails: resolvedJobDetails, profile, voice }));
        setLetterStatus('Kein API-Key eingetragen. Lokale Vorlage erstellt.');
        return;
      }

      const response = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim() || undefined,
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
      setDraft(cleanGeneratedLetter(data.text || createDraft({ personalData, jobDetails: resolvedJobDetails, profile, voice })));
      setActiveLetterId(null);
    } catch (error) {
      setDraft(createDraft({ personalData, jobDetails, profile, voice }));
      setLetterStatus(error instanceof Error ? `KI nicht verfügbar: ${error.message}` : 'KI nicht verfügbar. Lokale Vorlage erstellt.');
    } finally {
      setIsGenerating(false);
      window.setTimeout(() => document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  async function compareProviders() {
    setIsComparing(true);
    setLetterStatus('KI-Vergleich läuft ...');
    setCandidates([]);
    try {
      const resolvedJobInput = await resolveJobInput(jobInput);
      if (resolvedJobInput !== jobInput) {
        setJobInput(resolvedJobInput);
      }
      const resolvedJobDetails = extractJobDetails(resolvedJobInput);
      const response = await fetch('/api/compare-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim() || undefined,
          voice,
          personalData,
          jobInput: resolvedJobInput,
          jobDetails: resolvedJobDetails,
        }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'KI-Vergleich fehlgeschlagen.');
      }
      const data = await response.json() as { candidates: AiCandidate[] };
      const cleanedCandidates = (data.candidates ?? []).map((candidate) => ({
        ...candidate,
        text: cleanGeneratedLetter(candidate.text),
      }));
      setCandidates(cleanedCandidates);
      const firstGood = cleanedCandidates.find((candidate) => candidate.ok && candidate.text);
      if (firstGood) {
        setDraft(firstGood.text);
        setActiveLetterId(null);
      }
      setLetterStatus(firstGood ? 'KI-Vergleich fertig. Du kannst eine Version übernehmen.' : 'Keine KI-Version konnte erstellt werden.');
      window.setTimeout(() => document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'KI-Vergleich fehlgeschlagen.');
    } finally {
      setIsComparing(false);
    }
  }

  async function rewriteDraft(mode: RewriteMode) {
    if (!draft.trim()) return;

    if (!hasApiKey) {
      setLetterStatus('Für echte KI-Nachbearbeitung bitte einen API-Key speichern.');
      return;
    }

    setIsRewriting(true);
    setLetterStatus(`${rewriteLabels[mode]} läuft ...`);
    try {
      const response = await fetch('/api/rewrite-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim() || undefined,
          mode,
          voice,
          personalData,
          jobDetails,
          text: draft,
        }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'KI-Überarbeitung fehlgeschlagen.');
      }
      const data = await response.json() as { text: string };
      setDraft(cleanGeneratedLetter(data.text || draft));
      setActiveLetterId(null);
      setLetterStatus(`${rewriteLabels[mode]} fertig.`);
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'KI-Überarbeitung fehlgeschlagen.');
    } finally {
      setIsRewriting(false);
    }
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
    const { AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun } = await import('docx');
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
          border: line.includes('────') ? {
            bottom: { style: BorderStyle.SINGLE, size: 8, color: '1F4E79' },
          } : undefined,
          alignment: index === dateIndex ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({
            text: line.includes('────') ? ' ' : line || ' ',
            bold: index === 0 || index === subjectIndex,
            italics: index === 1,
            color: index === 2 ? '44546A' : '000000',
            size: index === 0 ? 24 : index === subjectIndex ? 22 : 22,
          })],
          spacing: {
            before: index === subjectIndex ? 120 : 0,
            after: line.includes('────') ? 180 : line.trim() === '' ? 120 : index === subjectIndex ? 160 : 0,
            line: 240,
            lineRule: 'auto',
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
    setLetterStatus('Text kopiert.');
  }

  async function openGoogleDocs() {
    if (!draft.trim()) return;
    setIsGoogleLoading(true);
    let documentWindow: Window | null = null;
    try {
      if (!googleClientId.trim()) {
        await navigator.clipboard.writeText(draft);
        setLetterStatus('Google OAuth Client-ID fehlt. Text wurde kopiert, aber ein gefülltes Google Doc braucht die gespeicherte Client-ID.');
        return;
      }

      const normalizedClientId = normalizeGoogleClientId(googleClientId);
      if (!isValidGoogleClientId(normalizedClientId)) {
        setLetterStatus('Google Client-ID ist ungültig. Bitte vollständig speichern: ...apps.googleusercontent.com');
        return;
      }

      documentWindow = window.open('about:blank', '_blank');
      if (documentWindow) {
        documentWindow.opener = null;
        documentWindow.document.write('<!doctype html><title>Google Docs</title><body style="font-family:system-ui;margin:32px">Google Doc wird erstellt ...</body>');
      }

      const accessToken = await requestGoogleAccessToken(normalizedClientId);
      const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ title: jobDetails.subject || 'Bewerbungsanschreiben' }),
      });
      if (!createResponse.ok) throw new Error(await readGoogleError(createResponse, 'Google-Dokument konnte nicht erstellt werden.'));
      const document = await createResponse.json() as { documentId: string };
      const insertResponse = await fetch(`https://docs.googleapis.com/v1/documents/${document.documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            insertText: {
              location: { index: 1 },
              text: draft,
            },
          }],
        }),
      });
      if (!insertResponse.ok) throw new Error(await readGoogleError(insertResponse, 'Text konnte nicht in Google Docs eingefügt werden.'));
      const documentUrl = `https://docs.google.com/document/d/${document.documentId}/edit`;
      if (documentWindow) {
        documentWindow.location.href = documentUrl;
      } else {
        window.open(documentUrl, '_blank', 'noopener,noreferrer');
      }
      setLetterStatus('Google Docs Dokument erstellt.');
    } catch (error) {
      if (documentWindow && !documentWindow.closed) {
        documentWindow.close();
      }
      setLetterStatus(error instanceof Error ? error.message : 'Google Docs konnte nicht geöffnet werden.');
    } finally {
      setIsGoogleLoading(false);
    }
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

  async function downloadBackup() {
    setBackupStatus('Backup wird erstellt ...');
    try {
      const response = await fetch('/api/backup');
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Backup konnte nicht erstellt werden.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bewerbungsassistent-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setBackupStatus('Backup heruntergeladen.');
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Backup konnte nicht erstellt werden.');
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBackupStatus('Backup wird eingespielt ...');
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Backup konnte nicht eingespielt werden.');
      }
      await Promise.all([loadSettings(), loadDocuments(), loadLetters()]);
      setBackupStatus('Backup wiederhergestellt.');
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Backup konnte nicht eingespielt werden.');
    } finally {
      event.target.value = '';
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
          <div className="view-switch" aria-label="Ansicht wechseln">
            <button type="button" className={view === 'apply' ? 'active' : ''} onClick={() => setView('apply')}>Bewerbung</button>
            <button type="button" className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>Einstellungen</button>
          </div>
        </nav>
      </header>

      <main className="app-main">
        {view === 'apply' ? (
        <>
        <section id="create" className="create-grid apply-grid">
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
            <div className="create-actions">
              <button type="button" className="button primary big-action" onClick={createLetter} disabled={!canCreateLetter || isGenerating}>
                <WandSparkles size={18} />
                {isGenerating ? 'Anschreiben wird erstellt ...' : 'Anschreiben erstellen'}
              </button>
              <button type="button" className="button secondary compare-action" onClick={compareProviders} disabled={!canCreateLetter || isComparing}>
                <RefreshCw size={18} />
                {isComparing ? 'KI-Vergleich läuft ...' : 'KIs vergleichen'}
              </button>
            </div>
            <p className="compare-cost-note">Hinweis: Beim Vergleich wird jede verfügbare KI separat abgefragt. Dadurch können je Anbieter zusätzliche Kosten entstehen.</p>
          </article>

          <aside className="panel analysis-panel">
            <p className="eyebrow">Analyse</p>
            <h2>{jobInput.trim() ? jobDetails.subject : 'Bereit für die Stellenanzeige'}</h2>
            <p>{jobInput.trim() ? 'Empfänger, Betreff und gewünschte Zusatzangaben werden aus Link oder Text abgeleitet.' : 'Link oder Text einfügen, danach wird das Anschreiben erstellt.'}</p>
            <div className="analysis-summary">
              <span>{documents.length} Unterlagen</span>
              <span>{hasApiKey ? provider : 'Lokale Vorlage'}</span>
              <span>{voice}</span>
              {profile.insights?.skills?.[0] && <span>{profile.insights.skills.slice(0, 3).join(' · ')}</span>}
            </div>
          </aside>
        </section>

        <section id="editor" className="section editor-section">
          <div className="editor-layout">
            <div className="editor-toolbar">
              <span>{draft ? `${wordCount} Wörter${activeLetterId ? ' · gespeicherte Version geöffnet' : ''}` : 'Noch kein Anschreiben erstellt'}</span>
              <div className="toolbar-actions">
                <button type="button" className="ai-chip" onClick={() => rewriteDraft('modern')} disabled={!draft || isRewriting}><RefreshCw size={14} /> Moderner</button>
                <button type="button" className="ai-chip" onClick={() => rewriteDraft('detailed')} disabled={!draft || isRewriting}><RefreshCw size={14} /> Detaillierter</button>
                <button type="button" className="ai-chip" onClick={() => rewriteDraft('confident')} disabled={!draft || isRewriting}><RefreshCw size={14} /> Fordernder</button>
                <button type="button" className="ai-chip" onClick={() => rewriteDraft('formal')} disabled={!draft || isRewriting}><RefreshCw size={14} /> Formeller</button>
                <button type="button" className="ai-chip" onClick={() => rewriteDraft('alternative')} disabled={!draft || isRewriting}><RefreshCw size={14} /> Alternative</button>
                <button type="button" className="ai-chip" onClick={() => rewriteDraft('shorten')} disabled={!draft || isRewriting}><Scissors size={14} /> Kürzen</button>
              </div>
            </div>
            <div className="editor-preview-grid">
              <textarea
                className="draft-editor"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Hier erscheint dein Anschreiben. Du kannst es direkt bearbeiten."
              />
              <LetterPreview text={draft} />
            </div>
            <div className="editor-meta">
              <button type="button" className="button success" onClick={saveFinalLetter} disabled={!draft}><Save size={18} /> Fertig speichern</button>
              <button type="button" className="button primary" onClick={downloadDocx} disabled={!draft}><Download size={18} /> DOCX herunterladen</button>
              <button type="button" className="button google" onClick={openGoogleDocs} disabled={!draft || isGoogleLoading}><Link2 size={18} /> {isGoogleLoading ? 'Google Docs öffnet ...' : 'Google Docs öffnen'}</button>
              <button type="button" className="button secondary" onClick={copyForGoogleDocs} disabled={!draft}><Link2 size={18} /> Text kopieren</button>
            </div>
            <section className="saved-letters" aria-label="Gespeicherte Anschreiben">
              {candidates.length > 0 && (
                <div className="candidate-list">
                  <h3>KI-Vergleich</h3>
                  <div className="candidate-grid">
                    {candidates.map((candidate) => (
                      <article key={candidate.provider} className={candidate.ok ? 'candidate-card' : 'candidate-card has-error'}>
                        <div>
                          <strong>{candidate.provider}</strong>
                          <small>{candidate.ok ? `${candidate.text.split(/\s+/).filter(Boolean).length} Wörter` : candidate.error}</small>
                        </div>
                        {candidate.ok && <p>{candidate.text.slice(0, 260)}...</p>}
                        {candidate.ok && (
                          <button type="button" className="text-button" onClick={() => {
                            setDraft(candidate.text);
                            setActiveLetterId(null);
                            setLetterStatus(`${candidate.provider} übernommen.`);
                          }}>Übernehmen</button>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
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
        </>
        ) : (
        <section className="settings-page">
          <article id="stammdaten" className="panel master-data-panel">
            <div className="panel-header compact-header">
              <h2>Stammdaten</h2>
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
          </article>

          <article className="panel ai-panel">
            <h2>KI</h2>
            <div className="provider-picker" aria-label="KI-Anbieter auswählen">
              {providerOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={[
                    'provider-button',
                    providerHasUsableKey(option, apiKeyProviders) ? 'stored' : '',
                    provider === option ? 'active' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => updateProvider(option)}
                >
                  <span>{providerHasUsableKey(option, apiKeyProviders) ? '●' : '○'} {option}</span>
                </button>
              ))}
            </div>
            <div className="settings-grid">
              <label>
                Stil
                <select value={voice} onChange={(event) => updateVoice(event.target.value)}>
                  {voiceOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            {providerNeedsApiKey ? (
              <>
                <label className="api-field">
                  <span><KeyRound size={18} /> API-Key</span>
                  <input
                    type="password"
                    placeholder={`${provider} API-Key`}
                    value={apiKeyDisplayValue}
                    onFocus={() => setIsApiKeyEditing(true)}
                    onBlur={() => {
                      if (!apiKey.trim()) setIsApiKeyEditing(false);
                    }}
                    onChange={(event) => updateApiKey(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <div className="api-note-row">
                  <p className="field-note">
                    {apiKeyStatus || (currentProviderHasStoredKey ? `${provider} API-Key gespeichert.` : `${provider} API-Key eintragen.`)}
                  </p>
                  {apiKey.trim().length > 0 && (
                    <button type="button" className="text-button" onClick={saveApiKey}>Speichern</button>
                  )}
                  {currentProviderHasStoredKey && (
                    <button type="button" className="text-button" onClick={removeApiKey}>Entfernen</button>
                  )}
                </div>
              </>
            ) : (
              <p className="field-note local-ai-note">Llama lokal nutzt Ollama auf dem Server unter <code>http://localhost:11434</code>. Kein API-Key nötig.</p>
            )}
          </article>

          <article className="panel integrations-panel">
            <div className="panel-header">
              <div>
                <h2>Google Docs</h2>
                <p className="document-status">Optionaler Export direkt in Google Docs.</p>
              </div>
            </div>
            <div className="google-client-box">
              <TextField label="Google OAuth Client-ID" value={googleClientId} onChange={updateGoogleClientId} />
              <div className="google-client-actions">
                <p className="field-note">
                  {googleClientIdStatus || 'Vollständige Client-ID eintragen, nicht den Clientschlüssel. Ohne Client-ID öffnet die App docs.new und kopiert den Text.'}
                </p>
                <button type="button" className="button primary" onClick={saveGoogleClientId}>Speichern</button>
              </div>
              <details className="oauth-help">
                <summary>Google OAuth Client-ID erstellen</summary>
                <ol>
                  <li>Öffne die Google Cloud Console und erstelle oder wähle ein Projekt.</li>
                  <li>Öffne <strong>APIs & Dienste → OAuth-Zustimmungsbildschirm</strong> und trage App-Name sowie Support-E-Mail ein.</li>
                  <li>Öffne <strong>APIs & Dienste → Anmeldedaten</strong> und wähle <strong>Client-ID erstellen</strong>.</li>
                  <li>Als Anwendungstyp <strong>Webanwendung</strong> auswählen.</li>
                  <li>Bei <strong>Autorisierte JavaScript-Quellen</strong> diese Adresse eintragen: <code>{window.location.origin}</code></li>
                  <li>Wenn du die App über Tablet/Handy im Netzwerk nutzt, zusätzlich auch diese Netzwerk-Adresse als JavaScript-Quelle eintragen.</li>
                  <li>Die vollständige <strong>Client-ID</strong> kopieren, nicht den Clientschlüssel. Sie endet auf <code>.apps.googleusercontent.com</code>.</li>
                </ol>
                <a href="https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid" target="_blank" rel="noreferrer">
                  Offizielle Google-Anleitung öffnen <ExternalLink size={14} />
                </a>
              </details>
            </div>
          </article>

          <article className="panel backup-panel">
            <div className="panel-header">
              <div>
                <h2>Backup</h2>
                <p className="document-status">{backupStatus || 'Stammdaten, Unterlagen, API-Keys und Anschreiben sichern.'}</p>
              </div>
            </div>
            <div className="backup-actions">
              <button type="button" className="button primary" onClick={downloadBackup}><Download size={18} /> Backup herunterladen</button>
              <button type="button" className="button secondary" onClick={() => backupInputRef.current?.click()}><FileUp size={18} /> Backup einspielen</button>
              <input ref={backupInputRef} type="file" accept="application/json,.json" onChange={restoreBackup} className="visually-hidden" />
            </div>
          </article>

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
        </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

function LetterPreview({ text }: { text: string }) {
  const lines = text.split('\n');
  const subjectIndex = lines.findIndex((line) => line.trim().toLowerCase().startsWith('bewerbung'));
  const dateIndex = lines.findIndex((line) => /\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(line));

  return (
    <aside className="letter-preview" aria-label="Anschreiben Vorschau">
      <div className="preview-page">
        {text.trim() ? lines.map((line, index) => {
          const trimmed = line.trim();
          if (line.includes('────')) return <div key={`${index}-${line}`} className="preview-rule" />;
          if (!trimmed) return <div key={`${index}-blank`} className="preview-blank" />;
          const classNames = [
            index === 0 ? 'preview-name' : '',
            index === 1 ? 'preview-qualification' : '',
            index === 2 ? 'preview-contact' : '',
            index === subjectIndex ? 'preview-subject' : '',
            index === dateIndex ? 'preview-date' : '',
          ].filter(Boolean).join(' ');
          return <p key={`${index}-${line}`} className={classNames}>{line}</p>;
        }) : (
          <div className="preview-empty">
            <strong>Vorschau</strong>
            <span>Hier erscheint dein Anschreiben im DIN-A4-Stil.</span>
          </div>
        )}
      </div>
    </aside>
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
  const companyReference = jobDetails.company ? ` bei ${jobDetails.company}` : '';
  const titleReference = jobDetails.title ? ` für die Position ${jobDetails.title}` : '';
  const requestedParagraphs = createRequestedInfoParagraphs(jobDetails.requestedInfo);
  const profileStrengths = formatProfileStrengths(profile);
  const contactLine = [
    personalData.email,
    personalData.phone,
    [personalData.street, personalData.city].filter(Boolean).join(', '),
    personalData.website,
  ].filter(Boolean).join(' · ');

  return [
    personalData.name,
    personalData.qualification,
    contactLine,
    '────────────────────────────────────────',
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
    `mit großem Interesse habe ich Ihre Ausschreibung${titleReference}${companyReference} gelesen. Die Verbindung aus Verantwortung, Qualität und praxisnaher Verbesserung spricht mich sehr an.`,
    profileStrengths
      ? `Besonders einbringen kann ich meine Erfahrung in ${profileStrengths}. Dabei arbeite ich strukturiert, zuverlässig und mit einem klaren Blick für umsetzbare Ergebnisse.`
      : 'Meine bisherigen Unterlagen zeigen eine strukturierte, zuverlässige Arbeitsweise und die Fähigkeit, mich schnell in neue Aufgaben einzuarbeiten.',
    'Gerne erläutere ich Ihnen in einem persönlichen Gespräch, wie ich Ihr Team konkret unterstützen kann.',
    ...requestedParagraphs,
    '',
    'Mit freundlichen Grüßen',
    '',
    personalData.closingName || personalData.name,
  ].filter((line) => line !== undefined).join('\n');
}

function formatProfileStrengths(profile: ProfileData) {
  const rawValues = [
    ...(profile.insights?.skills ?? []),
    ...(profile.insights?.roles ?? []),
    ...(profile.insights?.strengths ?? []),
  ];
  const blocked = new Set(['michael', 'schellenberger', 'herr', 'frau', 'köln', 'bechhofen', 'befriedigend', 'fachschule']);
  const values = rawValues
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && !blocked.has(value.toLowerCase()))
    .slice(0, 3);

  return values.join(', ');
}

function cleanGeneratedLetter(text: string) {
  const forbiddenLinePatterns = [
    /^relevant aus meiner datenbasis\s*:/i,
    /^der gewünschte stil ist\s*:/i,
    /^bitte diesen entwurf/i,
    /^stil\s*:/i,
    /^prompt\s*:/i,
    /^hinweis\s*:/i,
    /^anweisung\s*:/i,
    /^datenbasis\s*:/i,
    /^ausgelesene unterlagen\s*:/i,
    /^strukturierte profilanalyse\s*:/i,
  ];

  return text
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .split('\n')
    .map((line) => line.replace(/\*\*/g, '').trimEnd())
    .filter((line) => !forbiddenLinePatterns.some((pattern) => pattern.test(line.trim())))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    const jobBoards = ['xing.com', 'linkedin.com', 'stepstone.de', 'indeed.com', 'indeed.de', 'monster.de', 'arbeitsagentur.de', 'stellenanzeigen.de', 'heyjobs.co', 'join.com'];
    if (jobBoards.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return '';
    }
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
  const roleWords = /(leitung|leiter|head|manager|quality|qualität|qualitaet|sicherung|auditor|projekt|controller|controlling|prozess|operations|operative|sachbearbeiter|ingenieur|specialist|lead)/i;
  let cleaned = value
    .replace(/\b\d{5,}\b/g, ' ')
    .replace(/\b(?:xing|linkedin|stepstone|indeed)\b/gi, ' ')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\bBuechenbach\b/gi, ' ')
    .replace(/Qualitaet/gi, 'Qualität')
    .replace(/\s+/g, ' ')
    .trim();
  const roleMatch = cleaned.match(roleWords);
  if (roleMatch && roleMatch.index && roleMatch.index > 0 && roleMatch.index < 35) {
    cleaned = cleaned.slice(roleMatch.index).trim();
  }
  return cleaned.slice(0, 90);
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

function providerHasUsableKey(provider: string, apiKeyProviders: string[]) {
  return provider === 'Llama lokal' || apiKeyProviders.includes(provider);
}

function normalizeGoogleClientId(value: string) {
  return value.replace(/\s+/g, '').trim();
}

function isValidGoogleClientId(value: string) {
  return /^[0-9a-zA-Z_-]+\.apps\.googleusercontent\.com$/.test(value);
}

async function readGoogleError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { error?: { message?: string; status?: string } } | null;
  const message = data?.error?.message || data?.error?.status;
  return message ? `${fallback}: ${message}` : fallback;
}

async function requestGoogleAccessToken(clientId: string): Promise<string> {
  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    const google = (window as unknown as { google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    } }).google;
    const tokenClient = google?.accounts?.oauth2?.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'Google-Anmeldung fehlgeschlagen.'));
          return;
        }
        resolve(response.access_token);
      },
    });

    if (!tokenClient) {
      reject(new Error('Google-Anmeldung konnte nicht geladen werden.'));
      return;
    }

    tokenClient.requestAccessToken();
  });
}

function loadGoogleIdentityScript() {
  if ((window as unknown as { google?: unknown }).google) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google-Anmeldung konnte nicht geladen werden.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google-Anmeldung konnte nicht geladen werden.'));
    document.head.appendChild(script);
  });
}

function getApiKeyStorageKey(provider: string) {
  return `bewerbungsassistent.apiKey.${provider}`;
}

export default App;
