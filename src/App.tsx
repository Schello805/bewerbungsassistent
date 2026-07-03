import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, FileUp, KeyRound, Link2, RefreshCw, Save, Scissors, Trash2, WandSparkles, XCircle } from 'lucide-react';
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

type ApplicationRecord = {
  id: string;
  title: string;
  company: string;
  jobInput: string;
  jobUrl?: string;
  letterId?: string | null;
  notes?: string;
  followUpAt?: string;
  status: ApplicationStatus;
  statusUpdatedAt: string;
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
  evidence?: string[];
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
  source: string;
  requestedInfo: RequestedInfo[];
};

type RequestedInfo = 'salary' | 'startDate' | 'availability' | 'reference' | 'documents' | 'motivation';
type ApplicationStatus = 'Entwurf' | 'Versendet' | 'Zwischenbescheid' | 'Absage' | 'Vorstellungsgespräch';
type RewriteMode = 'modern' | 'detailed' | 'confident' | 'formal' | 'alternative' | 'shorten';
type AiCandidate = {
  provider: string;
  text: string;
  ok: boolean;
  error?: string;
  score?: number;
  scoreReasons?: string[];
  costLabel?: string;
};

const rewriteLabels: Record<RewriteMode, string> = {
  modern: 'Moderner',
  detailed: 'Detaillierter',
  confident: 'Selbstbewusster',
  formal: 'Formeller',
  alternative: 'Alternative',
  shorten: 'Kürzen',
};

const applicationStatuses: ApplicationStatus[] = ['Entwurf', 'Versendet', 'Zwischenbescheid', 'Absage', 'Vorstellungsgespräch'];

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
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [profile, setProfile] = useState<ProfileData>({ documents: [], text: '', keywords: [] });
  const [personalData, setPersonalData] = useState<PersonalData>(defaultPersonalData);
  const [personalDataForm, setPersonalDataForm] = useState<PersonalData>(defaultPersonalData);
  const [personalDataStatus, setPersonalDataStatus] = useState('');
  const [isPersonalDataDirty, setIsPersonalDataDirty] = useState(false);
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
  const [backupStatusType, setBackupStatusType] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [isBackupWorking, setIsBackupWorking] = useState(false);
  const [activeLetterId, setActiveLetterId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AiCandidate[]>([]);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const [view, setView] = useState<'apply' | 'settings'>('apply');
  const [voice, setVoice] = useState(voiceOptions[0]);
  const [provider, setProvider] = useState(providerOptions[0]);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyProviders, setApiKeyProviders] = useState<string[]>([]);
  const [apiKeyStatus, setApiKeyStatus] = useState('');
  const [isApiKeyEditing, setIsApiKeyEditing] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientIdInput, setGoogleClientIdInput] = useState('');
  const [googleClientIdStatus, setGoogleClientIdStatus] = useState('');
  const [isGoogleClientIdEditing, setIsGoogleClientIdEditing] = useState(false);
  const [profileEvidenceText, setProfileEvidenceText] = useState('');
  const [profileEvidenceStatus, setProfileEvidenceStatus] = useState('');
  const [profileAutoFillStatus, setProfileAutoFillStatus] = useState('');
  const [costEstimate, setCostEstimate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const wordCount = useMemo(() => draft.trim().split(/\s+/).filter(Boolean).length, [draft]);
  const jobDetails = useMemo(() => extractJobDetails(jobInput), [jobInput]);
  const canCreateLetter = jobInput.trim().length > 8 && personalData.name.trim().length > 0;
  const providerNeedsApiKey = provider !== 'Llama lokal';
  const hasApiKey = !providerNeedsApiKey || apiKey.trim().length > 0 || apiKeyProviders.includes(provider);
  const currentProviderHasStoredKey = apiKeyProviders.includes(provider);
  const apiKeyDisplayValue = apiKey || (!isApiKeyEditing && currentProviderHasStoredKey ? '••••••••••••' : '');
  const googleClientIdDisplayValue = googleClientIdInput || (!isGoogleClientIdEditing && googleClientId ? '••••••••••••' : '');
  const activeCandidate = candidates[Math.min(activeCandidateIndex, Math.max(candidates.length - 1, 0))];
  const bestCandidateIndex = getBestCandidateIndex(candidates);
  const profileEvidence = getProfileEvidence(profile);
  const matchItems = useMemo(() => createMatchItems(jobInput, profileEvidence), [jobInput, profileEvidence]);
  const cvSuggestions = useMemo(() => createCvSuggestions(jobInput, matchItems, profileEvidence), [jobInput, matchItems, profileEvidence]);
  const qualityChecks = useMemo(() => createQualityChecks(draft, jobDetails, profileEvidence), [draft, jobDetails, profileEvidence]);
  const passedQualityChecks = qualityChecks.filter((check) => check.ok).length;

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

  const loadApplications = useCallback(async () => {
    try {
      const response = await fetch('/api/applications');
      if (!response.ok) throw new Error('Bewerbungs-Historie konnte nicht geladen werden.');
      const data = await response.json() as { applications: ApplicationRecord[] };
      setApplications(data.applications);
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'Bewerbungs-Historie konnte nicht geladen werden.');
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
        profileEvidence?: string[];
      };
      if (data.personalData) {
        const nextPersonalData = { ...defaultPersonalData, ...data.personalData };
        setPersonalData(nextPersonalData);
        setPersonalDataForm(nextPersonalData);
        setIsPersonalDataDirty(false);
      }
      if (data.provider && providerOptions.includes(data.provider)) {
        setProvider(data.provider);
      }
      if (data.voice && voiceOptions.includes(data.voice)) {
        setVoice(data.voice);
      }
      if (data.googleClientId) {
        setGoogleClientId(data.googleClientId);
        setGoogleClientIdInput('');
        setIsGoogleClientIdEditing(false);
      }
      if (Array.isArray(data.profileEvidence)) {
        setProfileEvidenceText(data.profileEvidence.join('\n'));
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
    void loadApplications();
  }, [loadApplications, loadDocuments, loadLetters, loadSettings]);

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

  useEffect(() => {
    const recognizedEvidence = getProfileEvidence(profile);
    if (profileEvidenceText.trim() || recognizedEvidence.length === 0) return;

    const initialEvidence = recognizedEvidence.slice(0, 14);
    setProfileEvidenceText(initialEvidence.join('\n'));
    setProfileEvidenceStatus(`${initialEvidence.length} erkannte Profil-Ergänzungen automatisch übernommen.`);
    setProfileAutoFillStatus(`${initialEvidence.length} erkannte Profilpunkte wurden in den Profil-Editor übernommen.`);
    void fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileEvidence: initialEvidence }),
    });
  }, [profile, profileEvidenceText]);

  async function saveSettings(nextSettings: { personalData?: PersonalData; provider?: string; voice?: string; apiKey?: string; googleClientId?: string; profileEvidence?: string[] }) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings),
    });
  }

  function updatePersonalData(field: keyof PersonalData, value: string) {
    setPersonalDataForm((current) => ({ ...current, [field]: value }));
    setIsPersonalDataDirty(true);
    setPersonalDataStatus('Noch nicht gespeichert.');
  }

  async function savePersonalData() {
    try {
      await saveSettings({ personalData: personalDataForm });
      setPersonalData(personalDataForm);
      setIsPersonalDataDirty(false);
      setPersonalDataStatus('Stammdaten gespeichert.');
    } catch {
      setPersonalDataStatus('Stammdaten konnten nicht gespeichert werden.');
    }
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
    setGoogleClientIdInput(value);
    setIsGoogleClientIdEditing(true);
    setGoogleClientIdStatus(value.trim().length > 0 ? 'Noch nicht gespeichert.' : '');
  }

  function startGoogleClientIdEditing() {
    if (isGoogleClientIdEditing || !googleClientId) return;
    setGoogleClientIdInput('');
    setIsGoogleClientIdEditing(true);
    setGoogleClientIdStatus('Neue Client-ID eintragen oder leer speichern zum Entfernen.');
  }

  async function saveGoogleClientId() {
    const normalizedClientId = normalizeGoogleClientId(isGoogleClientIdEditing ? googleClientIdInput : googleClientId);

    if (normalizedClientId && !isValidGoogleClientId(normalizedClientId)) {
      setGoogleClientIdStatus('Bitte die vollständige Client-ID eintragen: ...apps.googleusercontent.com');
      return;
    }

    try {
      setGoogleClientId(normalizedClientId);
      setGoogleClientIdInput('');
      setIsGoogleClientIdEditing(false);
      await saveSettings({ googleClientId: normalizedClientId });
      setGoogleClientIdStatus(normalizedClientId ? 'Google Client-ID gespeichert.' : 'Google Client-ID entfernt.');
    } catch {
      setGoogleClientIdStatus('Google Client-ID konnte nicht gespeichert werden.');
    }
  }

  async function saveProfileEvidence() {
    const values = profileEvidenceText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      await saveSettings({ profileEvidence: values });
      await loadProfile();
      setProfileEvidenceStatus('Profil-Ergänzungen gespeichert.');
      setProfileAutoFillStatus('');
    } catch {
      setProfileEvidenceStatus('Profil-Ergänzungen konnten nicht gespeichert werden.');
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
        setDraft(createDraft({ personalData, jobDetails: resolvedJobDetails, profile }));
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
      const nextDraft = cleanGeneratedLetter(data.text || createDraft({ personalData, jobDetails: resolvedJobDetails, profile }));
      setDraft(nextDraft);
      setCostEstimate(estimateAiCost(provider, `${resolvedJobInput}\n${profileEvidence.join('\n')}`, nextDraft));
      setActiveLetterId(null);
    } catch (error) {
      setDraft(createDraft({ personalData, jobDetails, profile }));
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
    setActiveCandidateIndex(0);
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
        const data = await readApiError(response);
        throw new Error(data.error ?? 'KI-Vergleich fehlgeschlagen.');
      }
      const data = await response.json() as { candidates: AiCandidate[] };
      const cleanedCandidates = (data.candidates ?? []).map((candidate) => ({
        ...candidate,
        text: cleanGeneratedLetter(candidate.text),
      })).map((candidate) => {
        if (!candidate.ok || !candidate.text) return candidate;
        const evaluation = evaluateCandidate(candidate.text, resolvedJobDetails, profileEvidence);
        return {
          ...candidate,
          score: evaluation.score,
          scoreReasons: evaluation.reasons,
          costLabel: estimateAiCost(candidate.provider, `${resolvedJobInput}\n${profileEvidence.join('\n')}`, candidate.text),
        };
      });
      setCandidates(cleanedCandidates);
      const bestIndex = getBestCandidateIndex(cleanedCandidates);
      setActiveCandidateIndex(bestIndex >= 0 ? bestIndex : 0);
      const bestGood = bestIndex >= 0 ? cleanedCandidates[bestIndex] : cleanedCandidates.find((candidate) => candidate.ok && candidate.text);
      if (bestGood) {
        setDraft(bestGood.text);
        setActiveLetterId(null);
        setCostEstimate(estimateAiCost(bestGood.provider, `${resolvedJobInput}\n${profileEvidence.join('\n')}`, bestGood.text, cleanedCandidates.length));
      }
      setLetterStatus(bestGood ? 'KI-Vergleich fertig. Beste Version wurde markiert und übernommen.' : 'Keine KI-Version konnte erstellt werden.');
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
      const nextDraft = cleanGeneratedLetter(data.text || draft);
      setDraft(nextDraft);
      setActiveLetterId(null);
      setCostEstimate(estimateAiCost(provider, draft, nextDraft));
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
      if (data.letter?.id) {
        await saveApplicationRecord(data.letter.id);
      }
      setLetterStatus(activeLetterId ? 'Änderungen gespeichert.' : 'Fertige Version gespeichert.');
    } catch (error) {
      setLetterStatus(error instanceof Error ? error.message : 'Anschreiben konnte nicht gespeichert werden.');
    }
  }

  async function saveApplicationRecord(letterId: string) {
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: jobDetails.subject || 'Bewerbung',
        company: jobDetails.company,
        jobInput,
        jobUrl: extractUrl(jobInput),
        letterId,
        status: 'Entwurf',
      }),
    });
    if (response.ok) {
      await loadApplications();
    }
  }

  async function updateApplicationStatus(id: string, status: ApplicationStatus) {
    const response = await fetch(`/api/applications/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const data = await readApiError(response);
      setLetterStatus(data.error || 'Status konnte nicht gespeichert werden.');
      return;
    }
    await loadApplications();
  }

  async function updateApplicationMeta(application: ApplicationRecord, changes: Partial<Pick<ApplicationRecord, 'notes' | 'followUpAt' | 'jobUrl'>>) {
    const next = { ...application, ...changes };
    const response = await fetch(`/api/applications/${encodeURIComponent(application.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: next.notes || '',
        followUpAt: next.followUpAt || '',
        jobUrl: next.jobUrl || '',
      }),
    });
    if (!response.ok) {
      const data = await readApiError(response);
      setLetterStatus(data.error || 'Bewerbung konnte nicht gespeichert werden.');
      return;
    }
    await loadApplications();
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
        writeGoogleDocsStatus(documentWindow, 'Google Doc wird vorbereitet ...', 'Bitte Google-Anmeldung bestätigen. Dieses Fenster öffnet anschließend automatisch das Dokument.');
      }

      setLetterStatus('Google-Anmeldung wird geöffnet ...');
      const accessToken = await requestGoogleAccessToken(normalizedClientId);
      setLetterStatus('Google Doc wird erstellt ...');
      if (documentWindow && !documentWindow.closed) {
        writeGoogleDocsStatus(documentWindow, 'Google Doc wird erstellt ...', 'Das Dokument wird bei Google angelegt und danach befüllt.');
      }
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
      if (documentWindow && !documentWindow.closed) {
        writeGoogleDocsStatus(documentWindow, 'Text wird eingefügt ...', 'Das Anschreiben wird jetzt in das Google Doc übertragen.');
      }
      const insertResponse = await fetch(`https://docs.googleapis.com/v1/documents/${document.documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ requests: buildGoogleDocsRequests(draft) }),
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
      const message = error instanceof Error ? error.message : 'Google Docs konnte nicht geöffnet werden.';
      if (documentWindow && !documentWindow.closed) {
        writeGoogleDocsStatus(documentWindow, 'Google Docs konnte nicht erstellt werden.', message);
      }
      setLetterStatus(message);
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
    setIsBackupWorking(true);
    setBackupStatusType('loading');
    setBackupStatus('Backup wird erstellt ... Datenbank, Unterlagen, Einstellungen und API-Keys werden gesammelt.');
    try {
      const response = await fetch('/api/backup');
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Backup konnte nicht erstellt werden.');
      }
      const blob = await response.blob();
      const size = formatFileSize(blob.size);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bewerbungsassistent-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setBackupStatusType('success');
      setBackupStatus(`Backup erstellt und heruntergeladen (${size}).`);
    } catch (error) {
      setBackupStatusType('error');
      setBackupStatus(error instanceof Error ? error.message : 'Backup konnte nicht erstellt werden.');
    } finally {
      setIsBackupWorking(false);
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsBackupWorking(true);
    setBackupStatusType('loading');
    setBackupStatus(`Backup „${file.name}“ wird geprüft und eingespielt ...`);
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
      await Promise.all([loadSettings(), loadDocuments(), loadLetters(), loadApplications()]);
      setBackupStatusType('success');
      setBackupStatus(`Backup „${file.name}“ wurde erfolgreich wiederhergestellt.`);
    } catch (error) {
      setBackupStatusType('error');
      setBackupStatus(error instanceof Error ? error.message : 'Backup konnte nicht eingespielt werden.');
    } finally {
      setIsBackupWorking(false);
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
            <div className="profile-start-card">
              <div>
                <strong>Profilbasis</strong>
                <p>
                  {profileEvidence.length > 0
                    ? `${profileEvidence.length} erkannte Profilpunkte stehen für dein Anschreiben bereit.`
                    : 'Noch keine Profilpunkte erkannt. Lade Unterlagen hoch oder ergänze dein Profil.'}
                </p>
                {profileAutoFillStatus && <small>{profileAutoFillStatus}</small>}
              </div>
              <button type="button" className="text-button" onClick={() => setView('settings')}>Profil öffnen</button>
            </div>
            <div className="analysis-block">
              <h3>Erkannte Qualifikationen</h3>
              {profileEvidence.length > 0 ? (
                <div className="evidence-tags">
                  {profileEvidence.slice(0, 10).map((item) => <span key={item}>{item}</span>)}
                </div>
              ) : (
                <p>Noch keine verwertbaren Qualifikationen erkannt. Bitte Unterlagen hochladen oder prüfen.</p>
              )}
            </div>
            <div className="analysis-block">
              <h3>Stellen-Matching</h3>
              <ul className="match-list">
                {matchItems.map((item) => (
                  <li key={item.requirement} className={item.matches.length > 0 ? 'match-ok' : 'match-missing'}>
                    <strong>{item.requirement}</strong>
                    <span>{item.matches.length > 0 ? item.matches.join(' · ') : 'Noch kein passender Profilbeleg erkannt'}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="analysis-block">
              <h3>Lebenslauf optimieren</h3>
              <ul className="match-list">
                {cvSuggestions.map((suggestion) => (
                  <li key={suggestion} className="match-ok">
                    <strong>{suggestion}</strong>
                  </li>
                ))}
              </ul>
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
            <section className="quality-panel" aria-label="Anschreiben Qualitätscheck">
              <div>
                <h3>Qualitätscheck</h3>
                <p>{draft ? `${passedQualityChecks} von ${qualityChecks.length} Punkten erfüllt` : 'Sobald ein Anschreiben erstellt ist, wird es hier geprüft.'}</p>
              </div>
              <ul>
                {qualityChecks.map((check) => (
                  <li key={check.label} className={check.ok ? 'check-ok' : 'check-missing'}>
                    {check.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    <span>
                      <strong>{check.label}</strong>
                      {!check.ok && <small>{check.hint}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {costEstimate && (
              <section className="quality-panel cost-panel" aria-label="KI Kostenschätzung">
                <div>
                  <h3>KI-Kosten</h3>
                  <p>{costEstimate}</p>
                </div>
              </section>
            )}
            <section className="saved-letters" aria-label="Gespeicherte Anschreiben">
              {candidates.length > 0 && (
                <div className="candidate-list">
                  <div className="candidate-head">
                    <div>
                      <h3>KI-Vergleich</h3>
                      <p>{candidates.length} Ergebnis{candidates.length === 1 ? '' : 'se'} verfügbar</p>
                    </div>
                    <div className="candidate-nav" aria-label="KI-Ergebnisse wechseln">
                      <button type="button" onClick={() => setActiveCandidateIndex((index) => (index - 1 + candidates.length) % candidates.length)} disabled={candidates.length < 2} aria-label="Vorheriges KI-Ergebnis">‹</button>
                      <span>{Math.min(activeCandidateIndex + 1, candidates.length)} / {candidates.length}</span>
                      <button type="button" onClick={() => setActiveCandidateIndex((index) => (index + 1) % candidates.length)} disabled={candidates.length < 2} aria-label="Nächstes KI-Ergebnis">›</button>
                    </div>
                  </div>
                  {activeCandidate && (
                    <article className={activeCandidate.ok ? 'candidate-card candidate-carousel-card' : 'candidate-card candidate-carousel-card has-error'}>
                      <div className="candidate-card-header">
                        <div>
                          <strong>
                            {activeCandidate.provider}
                            {activeCandidateIndex === bestCandidateIndex && activeCandidate.ok ? <span className="best-badge">Beste Version</span> : null}
                          </strong>
                          <small>
                            {activeCandidate.ok
                              ? `${activeCandidate.text.split(/\s+/).filter(Boolean).length} Wörter · Score ${activeCandidate.score ?? 0}/100`
                              : activeCandidate.error}
                          </small>
                        </div>
                        {activeCandidate.ok && (
                          <button type="button" className="text-button" onClick={() => {
                            setDraft(activeCandidate.text);
                            setActiveLetterId(null);
                            setCostEstimate(estimateAiCost(activeCandidate.provider, jobInput, activeCandidate.text, candidates.length));
                            setLetterStatus(`${activeCandidate.provider} übernommen.`);
                          }}>Diese Version übernehmen</button>
                        )}
                      </div>
                      {activeCandidate.ok ? (
                        <>
                          <div className="candidate-insights">
                            {activeCandidate.scoreReasons?.map((reason) => <span key={reason}>{reason}</span>)}
                            {activeCandidate.costLabel && <span>{activeCandidate.costLabel}</span>}
                          </div>
                          <pre className="candidate-text">{activeCandidate.text}</pre>
                        </>
                      ) : (
                        <p>{activeCandidate.error || 'Diese KI konnte kein Ergebnis liefern.'}</p>
                      )}
                    </article>
                  )}
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
            <section className="saved-letters application-history" aria-label="Bewerbungs-Historie">
              <div>
                <h3>Bewerbungs-Historie</h3>
                <p>Status manuell aktualisieren. Jeder Statuswechsel erhält automatisch einen Zeitstempel.</p>
              </div>
              {applications.length === 0 ? (
                <p>Noch keine Bewerbung gespeichert.</p>
              ) : (
                <ul>
                  {applications.map((application) => (
                    <li key={application.id}>
                      <span>
                        {application.title}
                        {application.jobUrl && (
                          <a className="job-link" href={application.jobUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} /> Stellenanzeige
                          </a>
                        )}
                      </span>
                      <small>
                        {application.company ? `${application.company} · ` : ''}
                        {application.status} seit {new Date(application.statusUpdatedAt).toLocaleString('de-DE')}
                        {application.followUpAt ? ` · Wiedervorlage: ${new Date(application.followUpAt).toLocaleDateString('de-DE')}` : ''}
                      </small>
                      <div className="saved-letter-actions">
                        <select value={application.status} onChange={(event) => updateApplicationStatus(application.id, event.target.value as ApplicationStatus)}>
                          {applicationStatuses.map((status) => <option key={status}>{status}</option>)}
                        </select>
                        {application.letterId && <button type="button" onClick={() => openLetter(application.letterId || '')}>Anschreiben öffnen</button>}
                      </div>
                      <div className="application-meta-grid">
                        <label>
                          Link
                          <input
                            value={application.jobUrl || ''}
                            onChange={(event) => setApplications((current) => current.map((item) => item.id === application.id ? { ...item, jobUrl: event.target.value } : item))}
                            onBlur={(event) => updateApplicationMeta(application, { jobUrl: event.target.value })}
                            placeholder="https://..."
                          />
                        </label>
                        <label>
                          Wiedervorlage
                          <input
                            type="date"
                            value={(application.followUpAt || '').slice(0, 10)}
                            onChange={(event) => {
                              const value = event.target.value;
                              setApplications((current) => current.map((item) => item.id === application.id ? { ...item, followUpAt: value } : item));
                              updateApplicationMeta(application, { followUpAt: value });
                            }}
                          />
                        </label>
                      </div>
                      <label className="application-notes">
                        Notizen
                        <textarea
                          value={application.notes || ''}
                          onChange={(event) => setApplications((current) => current.map((item) => item.id === application.id ? { ...item, notes: event.target.value } : item))}
                          onBlur={(event) => updateApplicationMeta(application, { notes: event.target.value })}
                          placeholder="z. B. Ansprechpartner, Rückmeldung, nächste Schritte ..."
                        />
                      </label>
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
              <div>
                <h2>Stammdaten</h2>
                <p className={`document-status personal-data-feedback ${isPersonalDataDirty ? 'is-dirty' : personalDataStatus ? 'is-saved' : ''}`}>
                  {personalDataStatus || 'Änderungen werden erst nach dem Speichern übernommen.'}
                </p>
              </div>
              <button type="button" className="button primary save-master-data" onClick={savePersonalData} disabled={!isPersonalDataDirty}>
                <Save size={16} /> Speichern
              </button>
            </div>
            <div className="form-grid compact-form">
              <TextField label="Name" value={personalDataForm.name} onChange={(value) => updatePersonalData('name', value)} />
              <TextField label="Qualifikation" value={personalDataForm.qualification} onChange={(value) => updatePersonalData('qualification', value)} />
              <TextField label="E-Mail" value={personalDataForm.email} onChange={(value) => updatePersonalData('email', value)} />
              <TextField label="Telefon" value={personalDataForm.phone} onChange={(value) => updatePersonalData('phone', value)} />
              <TextField label="Straße" value={personalDataForm.street} onChange={(value) => updatePersonalData('street', value)} />
              <TextField label="PLZ Ort" value={personalDataForm.city} onChange={(value) => updatePersonalData('city', value)} />
              <TextField label="Website" value={personalDataForm.website} onChange={(value) => updatePersonalData('website', value)} />
              <TextField label="Absendeort" value={personalDataForm.location} onChange={(value) => updatePersonalData('location', value)} />
            </div>
          </article>

          <article className="panel profile-editor-panel">
            <div className="panel-header">
              <div>
                <h2>Profil-Editor</h2>
                <p className="document-status">{profileEvidenceStatus || 'Qualifikationen ergänzen oder korrigieren. Eine Zeile pro Eintrag.'}</p>
              </div>
            </div>
            <textarea
              className="profile-evidence-editor"
              value={profileEvidenceText}
              onChange={(event) => {
                setProfileEvidenceText(event.target.value);
                setProfileEvidenceStatus('Noch nicht gespeichert.');
              }}
              placeholder="z. B. VDA 6.3 Auditor&#10;QMB&#10;Lean Management&#10;SAP"
            />
            <button type="button" className="button primary" onClick={saveProfileEvidence}>Profil-Ergänzungen speichern</button>
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
              <TextField label="Google OAuth Client-ID" value={googleClientIdDisplayValue} onChange={updateGoogleClientId} onFocus={startGoogleClientIdEditing} />
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
                  <li>Öffne <strong>APIs & Dienste → Bibliothek</strong> und aktiviere die <strong>Google Docs API</strong>.</li>
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
                <a href="https://console.cloud.google.com/apis/library/docs.googleapis.com" target="_blank" rel="noreferrer">
                  Google Docs API aktivieren <ExternalLink size={14} />
                </a>
              </details>
            </div>
          </article>

          <article className="panel backup-panel">
            <div className="panel-header">
              <div>
                <h2>Backup</h2>
                <p className={`document-status backup-feedback backup-${backupStatusType}`}>
                  {isBackupWorking && <RefreshCw size={14} />}
                  {backupStatus || 'Stammdaten, Unterlagen, API-Keys und Anschreiben sichern.'}
                </p>
              </div>
            </div>
            <div className="backup-actions">
              <button type="button" className="button primary" onClick={downloadBackup} disabled={isBackupWorking}>
                {isBackupWorking ? <RefreshCw size={18} /> : <Download size={18} />}
                {isBackupWorking ? 'Bitte warten ...' : 'Backup herunterladen'}
              </button>
              <button type="button" className="button secondary" onClick={() => backupInputRef.current?.click()} disabled={isBackupWorking}>
                <FileUp size={18} /> Backup einspielen
              </button>
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

function TextField({ label, value, onChange, onFocus }: { label: string; value: string; onChange: (value: string) => void; onFocus?: () => void }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} onFocus={onFocus} />
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
  const recipient = [companyFromText || companyFromUrl, contact].filter(Boolean).join('\n') || 'XXX Unternehmen\nXXX Ansprechpartner';
  const source = extractJobSource(text, url);

  return {
    recipient,
    contact,
    address: extractAddress(text),
    subject: title ? `Bewerbung als ${title}` : 'Bewerbung',
    salutation: contact ? `Sehr geehrte${contact.toLowerCase().includes('herr') ? 'r' : ''} ${contact.replace(/^(frau|herr)\s+/i, '')},` : 'Sehr geehrte Damen und Herren,',
    company: companyFromText || companyFromUrl,
    title,
    source,
    requestedInfo: extractRequestedInfo(text),
  };
}

function createDraft({ personalData, jobDetails, profile }: { personalData: PersonalData; jobDetails: JobDetails; profile: ProfileData }) {
  const date = new Intl.DateTimeFormat('de-DE').format(new Date());
  const companyReference = jobDetails.company ? ` bei ${jobDetails.company}` : '';
  const titleReference = jobDetails.title ? ` für die Position ${jobDetails.title}` : '';
  const sourceReference = jobDetails.source ? ` auf ${jobDetails.source}` : '';
  const requestedParagraphs = createRequestedInfoParagraphs(jobDetails.requestedInfo);
  const profileParagraph = createProfileParagraph(profile, personalData);
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
    `Ihre Ausschreibung${sourceReference}${titleReference}${companyReference} hat mein Interesse geweckt, weil sie operative Verantwortung mit klarer Prozess- und Qualitätsorientierung verbindet. Genau an dieser Schnittstelle arbeite ich besonders gern: Strukturen schaffen, Abläufe verständlich machen und Verbesserungen so umsetzen, dass sie im Tagesgeschäft tragen.`,
    '',
    profileParagraph,
    '',
    'In meinen bisherigen Aufgaben war mir wichtig, Prozesse nicht nur zu verwalten, sondern wirksam weiterzuentwickeln. Dazu gehören klare Kommunikation, nachvollziehbare Dokumentation, ein gutes Verständnis für Schnittstellen und die Fähigkeit, Anforderungen in konkrete nächste Schritte zu übersetzen.',
    '',
    `Für Ihr Unternehmen sehe ich meinen Mehrwert darin, Verantwortung zu übernehmen, Themen konsequent nachzuhalten und Teams im Alltag spürbar zu entlasten. Gerne bringe ich meine Erfahrung ein, um bestehende Abläufe zu stabilisieren, Verbesserungspotenziale sichtbar zu machen und neue Anforderungen strukturiert voranzubringen.`,
    '',
    ...requestedParagraphs,
    requestedParagraphs.length > 0 ? '' : undefined,
    'Ich freue mich darauf, Ihnen in einem persönlichen Gespräch zu zeigen, wie ich Ihr Team konkret unterstützen kann.',
    '',
    'Mit freundlichen Grüßen',
    '',
    personalData.closingName || personalData.name,
  ].filter((line) => line !== undefined).join('\n');
}

function createProfileParagraph(profile: ProfileData, personalData: PersonalData) {
  const values = getCleanProfileEvidence(profile);
  const qualityTerms = values.filter((value) => /qualität|qmb|vda|iso|audit/i.test(value)).slice(0, 5);
  const processTerms = values.filter((value) => /prozess|lean|kaizen|kvp|fmea|8d|sap|excel|power bi/i.test(value)).slice(0, 2);
  const qualification = personalData.qualification || values.find((value) => /betriebswirt|bachelor|master|techniker/i.test(value)) || 'erfahrener Bewerber';

  if (qualityTerms.length > 0 || processTerms.length > 0) {
    const qualityText = createQualityExperienceSentence(qualityTerms);
    const processText = processTerms.length > 0
      ? ` Ergänzend bringe ich Praxis in ${joinNaturalList(processTerms)} ein, um Verbesserungen greifbar und umsetzbar zu machen.`
      : ' Verbesserungen verstehe ich dabei immer als praktische Arbeit an klaren Abläufen, verlässlicher Kommunikation und nachvollziehbaren Entscheidungen.';
    return `Als ${qualification} verbinde ich betriebswirtschaftliches Denken mit einem sehr praktischen Blick auf Abläufe, Standards und Zusammenarbeit. ${qualityText}${processText}`;
  }

  return `Als ${qualification} verbinde ich analytisches Denken mit einer praxisnahen Arbeitsweise. Wichtig ist mir, Anforderungen verständlich zu machen, Prioritäten klar zu setzen und Verbesserungen so umzusetzen, dass sie im Alltag tatsächlich funktionieren.`;
}

function createQualityExperienceSentence(terms: string[]) {
  const normalizedTerms = uniqueValues(terms);
  const hasQualityManagement = normalizedTerms.some((value) => /qualitätsmanagement/i.test(value));
  const hasQmb = normalizedTerms.some((value) => /qmb|qualitätsmanagementbeauftrag/i.test(value));
  const auditTerms = normalizedTerms.filter((value) => /vda|iso|audit/i.test(value)).slice(0, 2);

  if (hasQualityManagement || hasQmb || auditTerms.length > 0) {
    const parts = [
      hasQualityManagement ? 'im Qualitätsmanagement' : '',
      hasQmb ? 'in der Rolle als Qualitätsmanagementbeauftragter' : '',
      auditTerms.length > 0 ? `im Umgang mit ${joinNaturalList(auditTerms)}` : '',
    ].filter(Boolean);
    return `${capitalizeFirst(joinNaturalList(parts))} habe ich gelernt, Anforderungen in klare Standards, belastbare Dokumentation und praktikable Routinen zu übersetzen. So wird Qualität nicht nur beschrieben, sondern im Tagesgeschäft wirksam verankert.`;
  }

  return terms.length > 0
    ? `Meine Erfahrung mit ${joinNaturalList(terms.slice(0, 3))} hilft mir, Anforderungen sauber zu strukturieren und Qualität im Tagesgeschäft wirksam zu verankern.`
      : 'Mein Blick für Qualität, Standards und nachvollziehbare Abläufe hilft mir, Anforderungen sauber zu strukturieren.';
}

function getCleanProfileEvidence(profile: ProfileData) {
  const rawValues = getProfileEvidence(profile);
  const blocked = new Set(['michael', 'schellenberger', 'herr', 'frau', 'köln', 'bechhofen', 'befriedigend', 'fachschule', 'dokument', 'pdf']);
  return rawValues
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && !blocked.has(value.toLowerCase()))
    .slice(0, 8);
}

function joinNaturalList(values: string[]) {
  if (values.length <= 1) return values[0] || '';
  if (values.length === 2) return `${values[0]} und ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} und ${values[values.length - 1]}`;
}

function capitalizeFirst(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';
}

function getProfileEvidence(profile: ProfileData) {
  return uniqueValues([
    ...(profile.evidence ?? []),
    ...(profile.insights?.skills ?? []),
    ...(profile.insights?.roles ?? []),
    ...(profile.insights?.education ?? []),
    ...(profile.insights?.strengths ?? []),
  ]).filter((value) => value.length >= 3).slice(0, 18);
}

function createMatchItems(jobInput: string, profileEvidence: string[]) {
  const normalizedJob = jobInput.toLowerCase();
  const requirementGroups = [
    { label: 'Qualität / QS', terms: ['qualität', 'quality', 'qs', 'qmb', 'audit', 'iso', 'vda'] },
    { label: 'Führung / Verantwortung', terms: ['leitung', 'führung', 'team', 'verantwortung', 'lead', 'head'] },
    { label: 'Prozesse / Verbesserung', terms: ['prozess', 'lean', 'kaizen', 'kvp', 'optimierung', 'continuous improvement'] },
    { label: 'Zahlen / Steuerung', terms: ['controlling', 'kennzahlen', 'kpi', 'reporting', 'analyse'] },
    { label: 'IT / Tools', terms: ['sap', 'excel', 'power bi', 'digital', 'system'] },
  ];

  return requirementGroups
    .filter((group) => group.terms.some((term) => normalizedJob.includes(term)))
    .slice(0, 5)
    .map((group) => ({
      requirement: group.label,
      matches: profileEvidence.filter((item) => group.terms.some((term) => item.toLowerCase().includes(term))).slice(0, 3),
    }))
    .concat(jobInput.trim() ? [] : [{ requirement: 'Stellenanzeige', matches: [] }]);
}

function createCvSuggestions(jobInput: string, matchItems: Array<{ requirement: string; matches: string[] }>, profileEvidence: string[]) {
  if (!jobInput.trim()) return ['Stellenanzeige einfügen, dann erscheinen konkrete CV-Vorschläge.'];
  const suggestions = [
    ...matchItems
      .filter((item) => item.matches.length > 0)
      .map((item) => `${item.requirement}: ${item.matches.slice(0, 2).join(' und ')} im Lebenslauf sichtbarer platzieren.`),
    ...matchItems
      .filter((item) => item.matches.length === 0)
      .map((item) => `${item.requirement}: prüfen, ob passende Erfahrung im Profil ergänzt werden sollte.`),
  ];

  if (profileEvidence.length > 0) {
    suggestions.push(`Top-Qualifikationen wie ${profileEvidence.slice(0, 3).join(', ')} im Kurzprofil und bei passenden Stationen nennen.`);
  }

  return suggestions.slice(0, 5);
}

function createQualityChecks(draft: string, jobDetails: JobDetails, profileEvidence: string[]) {
  const normalizedDraft = draft.toLowerCase();
  const words = draft.trim().split(/\s+/).filter(Boolean);
  const evidenceHits = profileEvidence.filter((item) => normalizedDraft.includes(item.toLowerCase())).length;
  const placeholderMatches = draft.match(/\bXXX\b|\[[^\]]+\]/g) ?? [];
  const hasPlaceholders = placeholderMatches.length > 0;
  const hasRecipientPlaceholder = /XXX Unternehmen|XXX Ansprechpartner|Empfänger bitte prüfen/i.test(draft);
  const subjectLine = draft.split('\n').find((line) => /^bewerbung\s+als\s+\S+/i.test(line.trim())) ?? '';
  const titleFromSubject = subjectLine.replace(/^bewerbung\s+als\s+/i, '').trim();
  const titleForCheck = jobDetails.title || titleFromSubject;
  const hasSubject = /^bewerbung\s+als\s+.{3,}/i.test(subjectLine.trim());
  const hasJobReference = Boolean(titleForCheck && normalizedDraft.includes(titleForCheck.toLowerCase().slice(0, 12)));
  const placeholderHint = hasRecipientPlaceholder
    ? 'Empfängerblock enthält noch XXX. Bitte Unternehmen, Ansprechpartner und Adresse ergänzen.'
    : `Noch ${placeholderMatches.length} Platzhalter offen. Bitte XXX oder eckige Platzhalter ersetzen.`;

  return [
    { label: 'Länge ausreichend', ok: words.length >= 220, hint: `Aktuell ${words.length} Wörter. Ziel: ca. 220–360 Wörter.` },
    { label: 'Betreff vorhanden', ok: hasSubject, hint: 'Betreff sollte als eigene Zeile mit „Bewerbung als …“ beginnen.' },
    { label: 'Anrede vorhanden', ok: /sehr geehrte|guten tag/i.test(draft), hint: 'Eine passende Anrede fehlt oder wurde nicht erkannt.' },
    { label: 'Mindestens 3 Profilbelege', ok: evidenceHits >= 3, hint: `Aktuell erkannt: ${evidenceHits}. Mehr konkrete Qualifikationen aus dem Profil einbauen.` },
    { label: 'Stellenbezug vorhanden', ok: hasJobReference, hint: 'Die konkrete Position sollte im Einstieg oder Matching-Absatz vorkommen.' },
    { label: 'Empfänger und Platzhalter vollständig', ok: !hasPlaceholders, hint: placeholderHint },
    { label: 'Schlussformel vorhanden', ok: normalizedDraft.includes('mit freundlichen grüßen'), hint: 'Die Schlussformel „Mit freundlichen Grüßen“ fehlt.' },
  ];
}

function evaluateCandidate(text: string, jobDetails: JobDetails, profileEvidence: string[]) {
  const checks = createQualityChecks(text, jobDetails, profileEvidence);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const passed = checks.filter((check) => check.ok).length;
  const lengthBonus = words >= 220 && words <= 380 ? 10 : words > 160 ? 5 : 0;
  const evidenceHits = profileEvidence.filter((item) => text.toLowerCase().includes(item.toLowerCase())).length;
  const score = Math.min(100, Math.round((passed / checks.length) * 82 + lengthBonus + Math.min(evidenceHits, 5) * 2));
  const reasons = [
    `${passed}/${checks.length} Qualitätschecks erfüllt`,
    `${words} Wörter`,
    `${evidenceHits} Profilbelege erkannt`,
  ];
  const missing = checks.filter((check) => !check.ok).slice(0, 2).map((check) => `Fehlt: ${check.label}`);
  return { score, reasons: [...reasons, ...missing] };
}

function getBestCandidateIndex(candidates: AiCandidate[]) {
  let bestIndex = -1;
  let bestScore = -1;
  candidates.forEach((candidate, index) => {
    if (!candidate.ok || !candidate.text) return;
    const score = candidate.score ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function estimateAiCost(provider: string, inputText: string, outputText: string, requests = 1) {
  if (provider === 'Llama lokal') return 'Lokale KI: keine API-Kosten.';
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  const prices: Record<string, { input: number; output: number }> = {
    OpenAI: { input: 0.40, output: 1.60 },
    'Google Gemini': { input: 0.075, output: 0.30 },
    Anthropic: { input: 0.80, output: 4.00 },
    'Mistral AI': { input: 0.20, output: 0.60 },
    OpenRouter: { input: 0.40, output: 1.60 },
  };
  const price = prices[provider] ?? prices.OpenAI;
  const estimatedUsd = ((inputTokens * price.input) + (outputTokens * price.output)) / 1_000_000 * requests;
  const estimatedEur = estimatedUsd * 0.93;
  const requestText = requests > 1 ? ` · ${requests} Abfragen` : '';
  return `Ca. ${estimatedEur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4 })}${requestText} · grob geschätzt (${inputTokens + outputTokens} Tokens je Basislauf).`;
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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

  const cleaned = text
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .split('\n')
    .map((line) => line.replace(/\*\*/g, '').trimEnd())
    .filter((line) => !forbiddenLinePatterns.some((pattern) => pattern.test(line.trim())))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalizeLetterParagraphs(cleaned);
}

function normalizeLetterParagraphs(text: string) {
  const lines = text.split('\n').map((line) => line.trimEnd());
  const salutationIndex = lines.findIndex((line) => /^(sehr geehrte|guten tag)/i.test(line.trim()));
  const closingIndex = lines.findIndex((line, index) => index > salutationIndex && /^mit freundlichen grüßen$/i.test(line.trim()));
  if (salutationIndex === -1 || closingIndex === -1 || closingIndex <= salutationIndex) {
    return text;
  }

  const head = lines.slice(0, salutationIndex + 1);
  const body = lines.slice(salutationIndex + 1, closingIndex).map((line) => line.trim()).filter(Boolean);
  const tail = lines.slice(closingIndex);
  if (body.length <= 1) {
    return text;
  }

  return [
    ...head,
    '',
    body.join('\n\n'),
    '',
    ...tail,
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function readApiError(response: Response): Promise<{ error?: string }> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => '');
  return {
    error: text.trim()
      ? `Serverfehler ${response.status}: ${text.trim().slice(0, 180)}`
      : `Serverfehler ${response.status}`,
  };
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

function extractJobSource(text: string, url: string) {
  const haystack = `${url} ${text}`.toLowerCase();
  const sources: Array<[string, RegExp]> = [
    ['Xing', /\bxing\b|xing\.com/],
    ['LinkedIn', /\blinkedin\b|linkedin\.com/],
    ['StepStone', /\bstepstone\b|stepstone\./],
    ['Indeed', /\bindeed\b|indeed\./],
    ['Bundesagentur für Arbeit', /arbeitsagentur\.de|jobboerse\.arbeitsagentur/],
    ['Join', /\bjoin\b|join\.com/],
    ['HeyJobs', /\bheyjobs\b|heyjobs\./],
  ];
  return sources.find(([, pattern]) => pattern.test(haystack))?.[0] ?? '';
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
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`.slice(0, 90) : '';
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
  if (/docs api has not been used|docs.googleapis.com|it is disabled/i.test(message || '')) {
    const projectMatch = message?.match(/project\s+(\d+)/i);
    const projectId = projectMatch?.[1];
    const url = projectId
      ? `https://console.cloud.google.com/apis/library/docs.googleapis.com?project=${projectId}`
      : 'https://console.cloud.google.com/apis/library/docs.googleapis.com';
    return `${fallback}: Die Google Docs API ist in deinem Google-Cloud-Projekt noch nicht aktiviert. Aktiviere sie hier: ${url} — danach ein paar Minuten warten und erneut versuchen.`;
  }
  return message ? `${fallback}: ${message}` : fallback;
}

function buildGoogleDocsRequests(text: string) {
  const lines = text.split('\n');
  const subjectLineIndex = lines.findIndex((line) => line.trim().toLowerCase().startsWith('bewerbung'));
  const dateLineIndex = lines.findIndex((line) => /\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(line));
  const lineStartIndexes = lines.reduce<number[]>((indexes, line, index) => {
    const previousStart = indexes[index - 1] ?? 1;
    indexes.push(index === 0 ? 1 : previousStart + lines[index - 1].length + 1);
    return indexes;
  }, []);
  const requests: Array<Record<string, unknown>> = [{
    insertText: {
      location: { index: 1 },
      text,
    },
  }, {
    updateTextStyle: {
      range: { startIndex: 1, endIndex: Math.max(2, text.length + 1) },
      textStyle: {
        weightedFontFamily: { fontFamily: 'Arial' },
        fontSize: { magnitude: 11, unit: 'PT' },
      },
      fields: 'weightedFontFamily,fontSize',
    },
  }];

  const styleRange = (lineIndex: number, fields: string, textStyle: Record<string, unknown>) => {
    const line = lines[lineIndex] ?? '';
    if (!line.trim()) return;
    requests.push({
      updateTextStyle: {
        range: { startIndex: lineStartIndexes[lineIndex], endIndex: lineStartIndexes[lineIndex] + line.length },
        textStyle,
        fields,
      },
    });
  };

  styleRange(0, 'bold,fontSize', { bold: true, fontSize: { magnitude: 12, unit: 'PT' } });
  styleRange(1, 'italic', { italic: true });
  if (subjectLineIndex >= 0) {
    styleRange(subjectLineIndex, 'bold', { bold: true });
  }
  if (dateLineIndex >= 0) {
    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: lineStartIndexes[dateLineIndex],
          endIndex: lineStartIndexes[dateLineIndex] + (lines[dateLineIndex]?.length ?? 0),
        },
        paragraphStyle: { alignment: 'END' },
        fields: 'alignment',
      },
    });
  }
  return requests;
}

async function requestGoogleAccessToken(clientId: string): Promise<string> {
  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Google-Anmeldung wurde nicht abgeschlossen. Bitte Pop-up/Anmeldefenster prüfen und erneut versuchen.'));
    }, 90000);
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
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'Google-Anmeldung fehlgeschlagen.'));
          return;
        }
        resolve(response.access_token);
      },
    });

    if (!tokenClient) {
      settled = true;
      window.clearTimeout(timeout);
      reject(new Error('Google-Anmeldung konnte nicht geladen werden.'));
      return;
    }

    tokenClient.requestAccessToken();
  });
}

function writeGoogleDocsStatus(targetWindow: Window, title: string, message: string) {
  const isError = /konnte nicht|fehlgeschlagen|fehler/i.test(title);
  targetWindow.document.open();
  targetWindow.document.write(`<!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7fb; color: #111827; }
          main { max-width: 520px; margin: 32px; padding: 28px; border: 1px solid #e5e7eb; border-radius: 18px; background: #fff; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08); }
          h1 { margin: 0 0 10px; font-size: 22px; }
          p { margin: 0; color: #64748b; line-height: 1.5; }
          .spinner { width: 28px; height: 28px; margin-bottom: 18px; border: 3px solid #dbeafe; border-top-color: #2563eb; border-radius: 999px; animation: spin 0.9s linear infinite; }
          .error { width: 28px; height: 28px; margin-bottom: 18px; border-radius: 999px; display: grid; place-items: center; background: #fee2e2; color: #b91c1c; font-weight: 900; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <main>
          ${isError ? '<div class="error">!</div>' : '<div class="spinner"></div>'}
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
        </main>
      </body>
    </html>`);
  targetWindow.document.close();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
