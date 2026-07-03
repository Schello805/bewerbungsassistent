import { Bot, ClipboardCheck, FileText, FolderUp, PencilLine, WandSparkles } from 'lucide-react';

export const voiceOptions = [
  'Locker und modern',
  'Formell und traditionell',
  'Direkt und selbstbewusst',
  'Warm und persönlich',
  'Konservativ',
  'Modern',
  'Führungsstark',
  'Kurz',
  'Ausführlich',
  'Initiativbewerbung',
];

export const providerOptions = ['OpenAI', 'Google Gemini', 'Anthropic', 'Mistral AI', 'OpenRouter', 'Llama lokal'];

export const documentTypes = [
  'Lebenslauf',
  'Zeugnisse',
  'Zertifikate',
  'Arbeitsproben',
  'Master-Profil / Notizbuch',
];

export const workflowSteps = [
  {
    icon: FolderUp,
    title: 'Phase A: Datenbasis',
    text: 'Profil, Lebenslauf, Zeugnisse und Zertifikate lokal im Ordner datenbasis/ verwalten.',
  },
  {
    icon: ClipboardCheck,
    title: 'Phase B: Matching',
    text: 'Ausschreibung einfügen, Anforderungen analysieren und persönliche Stärken abgleichen.',
  },
  {
    icon: Bot,
    title: 'KI-Generierung',
    text: 'Erst nach deiner Bestätigung entstehen Anschreiben, Motivationstext oder Lebenslauf-Optimierung.',
  },
  {
    icon: PencilLine,
    title: 'Phase C: Nachbearbeitung',
    text: 'Der Text bleibt editierbar, damit du ihn prüfst, verbesserst und bewusst finalisierst.',
  },
  {
    icon: WandSparkles,
    title: 'Feinschliff',
    text: 'Aktionen wie Kürzen, Variieren oder aktiver formulieren unterstützen dich beim letzten Schliff.',
  },
  {
    icon: FileText,
    title: 'Export',
    text: 'Danach als DOCX weiterbearbeiten und das Layout sauber in Word oder Google Docs finalisieren.',
  },
];

export const sampleAnalysis = {
  requirements: ['Projektmanagement', 'Kommunikationsstärke', 'Sicherer Umgang mit digitalen Tools', 'Eigenständiges Arbeiten'],
  matches: ['Mehrjährige Berufserfahrung', 'Nachweisbare Zertifikate', 'Strukturierte Arbeitsweise', 'Kundenorientierung'],
  gaps: ['Branchenspezifische Keywords ergänzen', 'Konkrete Kennzahlen aus deinem Lebenslauf einbauen'],
};
