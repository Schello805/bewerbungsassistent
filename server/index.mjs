import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { createServer as createViteServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'datenbasis');
const lettersDir = path.join(rootDir, 'anschreiben');
const port = Number(process.env.PORT || 5173);
const isProduction = process.env.NODE_ENV === 'production';

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(lettersDir, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));

const storage = multer.diskStorage({
  destination: async (_request, _file, callback) => {
    await fs.mkdir(dataDir, { recursive: true });
    callback(null, dataDir);
  },
  filename: (_request, file, callback) => {
    callback(null, sanitizeFileName(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const allowed = ['.pdf', '.docx', '.txt', '.md', '.rtf'];
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(extension)) {
      callback(new Error('Dieser Dateityp wird noch nicht unterstützt. Erlaubt sind PDF, DOCX, TXT, MD und RTF.'));
      return;
    }
    callback(null, true);
  },
});

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/documents', async (_request, response, next) => {
  try {
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    const documents = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
      .map(async (entry) => {
        const filePath = path.join(dataDir, entry.name);
        const stats = await fs.stat(filePath);
        return {
          id: entry.name,
          name: entry.name,
          type: inferDocumentType(entry.name),
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
        };
      }));
    response.json({ documents: documents.sort((a, b) => a.name.localeCompare(b.name, 'de')) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/profile', async (_request, response, next) => {
  try {
    const profile = await readProfileFromDataDir();
    response.json(profile);
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents', upload.single('file'), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: 'Keine Datei empfangen.' });
    return;
  }

  response.status(201).json({
    document: {
      id: request.file.filename,
      name: request.file.filename,
      type: inferDocumentType(request.file.filename),
      size: request.file.size,
    },
  });
});

app.delete('/api/documents/:fileName', async (request, response, next) => {
  try {
    const fileName = sanitizeFileName(request.params.fileName);
    const filePath = path.join(dataDir, fileName);
    if (!filePath.startsWith(dataDir)) {
      response.status(400).json({ error: 'Ungültiger Dateiname.' });
      return;
    }
    await fs.unlink(filePath);
    response.status(204).send();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      response.status(404).json({ error: 'Datei nicht gefunden.' });
      return;
    }
    next(error);
  }
});

app.get('/api/letters', async (_request, response, next) => {
  try {
    const entries = await fs.readdir(lettersDir, { withFileTypes: true });
    const letters = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
      .map(async (entry) => {
        const filePath = path.join(lettersDir, entry.name);
        const stats = await fs.stat(filePath);
        return {
          id: entry.name,
          title: entry.name.replace(/\\.txt$/, ''),
          updatedAt: stats.mtime.toISOString(),
          size: stats.size,
        };
      }));
    response.json({ letters: letters.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/letters', async (request, response, next) => {
  try {
    const text = typeof request.body.text === 'string' ? request.body.text.trim() : '';
    const rawTitle = typeof request.body.title === 'string' ? request.body.title : 'anschreiben';

    if (text.length < 20) {
      response.status(400).json({ error: 'Der Text ist zu kurz zum Speichern.' });
      return;
    }

    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const fileName = `${timestamp}-${sanitizeFileName(rawTitle || 'anschreiben')}.txt`;
    const filePath = path.join(lettersDir, fileName);
    await fs.writeFile(filePath, `${text}\n`, 'utf8');

    const stats = await fs.stat(filePath);
    response.status(201).json({
      letter: {
        id: fileName,
        title: fileName.replace(/\\.txt$/, ''),
        updatedAt: stats.mtime.toISOString(),
        size: stats.size,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  response.status(400).json({ error: error instanceof Error ? error.message : 'Unbekannter Fehler.' });
});

if (isProduction) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(rootDir, 'dist', 'index.html'));
  });
} else {
  const vite = await createViteServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`Bewerbungsassistent läuft lokal: http://localhost:${port}/`);
  console.log(`Datenbasis: ${dataDir}`);
  console.log(`Gespeicherte Anschreiben: ${lettersDir}`);
});

function sanitizeFileName(fileName) {
  return path.basename(fileName).replaceAll(/[^a-zA-Z0-9äöüÄÖÜß._ -]/g, '_');
}

function inferDocumentType(fileName) {
  const normalized = fileName.toLowerCase();
  if (normalized.includes('lebenslauf') || normalized.includes('cv')) return 'Lebenslauf';
  if (normalized.includes('zeugnis')) return 'Zeugnisse';
  if (normalized.includes('zertifikat') || normalized.includes('certificate')) return 'Zertifikate';
  if (normalized.includes('profil') || normalized.includes('notiz')) return 'Master-Profil';
  return 'Dokument';
}

async function readProfileFromDataDir() {
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
    .map((entry) => entry.name);

  const documents = await Promise.all(files.map(async (fileName) => {
    const filePath = path.join(dataDir, fileName);
    const text = await extractText(filePath);
    return {
      fileName,
      type: inferDocumentType(fileName),
      text,
      summary: summarizeText(text),
    };
  }));

  const combinedText = documents.map((document) => document.text).join('\n\n');
  return {
    documents: documents.map(({ text, ...document }) => ({
      ...document,
      characterCount: text.length,
    })),
    text: combinedText.slice(0, 18000),
    keywords: extractKeywords(combinedText),
  };
}

async function extractText(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const buffer = await fs.readFile(filePath);

  if (extension === '.pdf') {
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    await parser.destroy();
    return normalizeText(data.text);
  }

  if (extension === '.docx') {
    const data = await mammoth.extractRawText({ buffer });
    return normalizeText(data.value);
  }

  if (['.txt', '.md', '.rtf'].includes(extension)) {
    return normalizeText(buffer.toString('utf8'));
  }

  return '';
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function summarizeText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return 'Kein Text auslesbar.';
  return normalized.slice(0, 260);
}

function extractKeywords(text) {
  const stopWords = new Set([
    'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'einer', 'einem', 'mit', 'für', 'von',
    'den', 'dem', 'des', 'ich', 'sie', 'als', 'auf', 'im', 'in', 'zu', 'am', 'an', 'bei',
    'ist', 'sind', 'war', 'wurde', 'werden', 'the', 'and', 'for', 'with',
  ]);
  const words = normalizeText(text)
    .toLowerCase()
    .match(/[a-zäöüßA-ZÄÖÜ]{4,}/g) ?? [];
  const counts = new Map();

  for (const word of words) {
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([word]) => word);
}
