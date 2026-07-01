import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import Database from 'better-sqlite3';
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { createServer as createViteServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'datenbasis');
const lettersDir = path.join(rootDir, 'anschreiben');
const storageDir = path.join(rootDir, 'data');
const databasePath = path.join(storageDir, 'app.db');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(lettersDir, { recursive: true });
await fs.mkdir(storageDir, { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS letters (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

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

app.get('/api/settings', (_request, response, next) => {
  try {
    const apiKeys = getSetting('apiKeys', {});
    response.json({
      personalData: getSetting('personalData', null),
      provider: getSetting('provider', null),
      voice: getSetting('voice', null),
      apiKeyProviders: Object.entries(apiKeys)
        .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
        .map(([key]) => key),
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/settings', (request, response, next) => {
  try {
    if ('personalData' in request.body) {
      setSetting('personalData', request.body.personalData);
    }
    if ('provider' in request.body) {
      setSetting('provider', request.body.provider);
    }
    if ('voice' in request.body) {
      setSetting('voice', request.body.voice);
    }
    if ('apiKey' in request.body) {
      const apiKeys = getSetting('apiKeys', {});
      const provider = typeof request.body.provider === 'string' && request.body.provider.trim()
        ? request.body.provider.trim()
        : getSetting('provider', 'OpenAI');
      const apiKey = typeof request.body.apiKey === 'string' ? request.body.apiKey.trim() : '';

      if (apiKey.length > 0) {
        apiKeys[provider] = apiKey;
      } else {
        delete apiKeys[provider];
      }

      setSetting('apiKeys', apiKeys);
    }
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents', upload.array('files', 30), (request, response) => {
  const files = Array.isArray(request.files) ? request.files : [];

  if (files.length === 0) {
    response.status(400).json({ error: 'Keine Dateien empfangen.' });
    return;
  }

  response.status(201).json({
    documents: files.map((file) => ({
      id: file.filename,
      name: file.filename,
      type: inferDocumentType(file.filename),
      size: file.size,
    })),
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

app.get('/api/letters', (_request, response, next) => {
  try {
    const letters = db.prepare(`
      SELECT id, title, size, updated_at AS updatedAt
      FROM letters
      ORDER BY updated_at DESC
    `).all();
    response.json({ letters });
  } catch (error) {
    next(error);
  }
});

app.get('/api/letters/:id', (request, response, next) => {
  try {
    const letter = db.prepare(`
      SELECT id, title, text, size, updated_at AS updatedAt
      FROM letters
      WHERE id = ?
    `).get(request.params.id);

    if (!letter) {
      response.status(404).json({ error: 'Anschreiben nicht gefunden.' });
      return;
    }

    response.json({ letter });
  } catch (error) {
    next(error);
  }
});

app.post('/api/letters', (request, response, next) => {
  try {
    const text = typeof request.body.text === 'string' ? request.body.text.trim() : '';
    const rawTitle = typeof request.body.title === 'string' ? request.body.title : 'anschreiben';

    if (text.length < 20) {
      response.status(400).json({ error: 'Der Text ist zu kurz zum Speichern.' });
      return;
    }

    const now = new Date().toISOString();
    const id = `${now.replaceAll(/[:.]/g, '-')}-${sanitizeFileName(rawTitle || 'anschreiben')}`;
    const title = rawTitle.trim() || 'anschreiben';
    const size = Buffer.byteLength(text, 'utf8');

    db.prepare(`
      INSERT INTO letters (id, title, text, size, created_at, updated_at)
      VALUES (@id, @title, @text, @size, @now, @now)
    `).run({ id, title, text, size, now });

    response.status(201).json({
      letter: {
        id,
        title,
        updatedAt: now,
        size,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/letters/:id', (request, response, next) => {
  try {
    const text = typeof request.body.text === 'string' ? request.body.text.trim() : '';
    const title = typeof request.body.title === 'string' && request.body.title.trim()
      ? request.body.title.trim()
      : 'anschreiben';

    if (text.length < 20) {
      response.status(400).json({ error: 'Der Text ist zu kurz zum Speichern.' });
      return;
    }

    const now = new Date().toISOString();
    const size = Buffer.byteLength(text, 'utf8');
    const result = db.prepare(`
      UPDATE letters
      SET title = @title, text = @text, size = @size, updated_at = @now
      WHERE id = @id
    `).run({ id: request.params.id, title, text, size, now });

    if (result.changes === 0) {
      response.status(404).json({ error: 'Anschreiben nicht gefunden.' });
      return;
    }

    response.json({ letter: { id: request.params.id, title, text, size, updatedAt: now } });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/letters/:id', (request, response, next) => {
  try {
    const result = db.prepare('DELETE FROM letters WHERE id = ?').run(request.params.id);
    if (result.changes === 0) {
      response.status(404).json({ error: 'Anschreiben nicht gefunden.' });
      return;
    }
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post('/api/fetch-job', async (request, response, next) => {
  try {
    const url = typeof request.body.url === 'string' ? request.body.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) {
      response.status(400).json({ error: 'Bitte einen gültigen HTTP- oder HTTPS-Link angeben.' });
      return;
    }

    const job = await fetchJobPosting(url);
    response.json({ job });
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate-letter', async (request, response, next) => {
  try {
    const provider = typeof request.body.provider === 'string' ? request.body.provider : 'OpenAI';
    const requestApiKey = typeof request.body.apiKey === 'string' ? request.body.apiKey.trim() : '';
    const apiKey = requestApiKey || getProviderApiKey(provider);
    const prompt = buildAiPrompt({
      personalData: request.body.personalData,
      jobInput: request.body.jobInput,
      jobDetails: request.body.jobDetails,
      voice: request.body.voice,
      profile: await readProfileFromDataDir(),
    });

    if (!apiKey) {
      response.status(400).json({ error: 'Kein API-Key eingetragen.' });
      return;
    }

    const text = await generateWithProvider({ provider, apiKey, prompt });
    response.json({ text });
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

app.listen(port, host, () => {
  console.log(`Bewerbungsassistent läuft lokal: http://localhost:${port}/`);
  console.log(`Bewerbungsassistent läuft im Netzwerk auf Port ${port}`);
  console.log(`Datenbasis: ${dataDir}`);
  console.log(`Datenbank: ${databasePath}`);
  console.log(`Gespeicherte Anschreiben: SQLite Tabelle letters`);
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

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run({ key, value: JSON.stringify(value) });
}

function getProviderApiKey(provider) {
  const apiKeys = getSetting('apiKeys', {});
  const apiKey = apiKeys?.[provider];
  return typeof apiKey === 'string' ? apiKey.trim() : '';
}

async function fetchJobPosting(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 Bewerbungsassistent/0.1',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Stellenanzeige konnte nicht geladen werden (${response.status}).`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, nav, footer, header').remove();
  const title = $('meta[property="og:title"]').attr('content') || $('title').first().text();
  const description = $('meta[name="description"]').attr('content') || '';
  const bodyText = $('main').text() || $('body').text();
  const text = normalizeText([title, description, bodyText].filter(Boolean).join('\n\n')).slice(0, 14000);

  return {
    url,
    title: normalizeText(title).slice(0, 180),
    text,
  };
}

function buildAiPrompt({ personalData, jobInput, jobDetails, voice, profile }) {
  return `
Du bist ein deutscher Bewerbungsassistent. Erstelle ein Anschreiben als editierbaren Entwurf.

Regeln:
- Schreibe auf Deutsch.
- Verwende die Absenderdaten, Empfängerblock, Datum, Betreff, Anrede und Schlussformel.
- Nutze konkrete Informationen aus Lebenslauf/Unterlagen, aber erfinde keine Arbeitgeber oder Zahlen.
- Wenn Angaben aus der Stellenanzeige verlangt werden (z. B. Wunschgehalt, Eintrittstermin, Referenznummer), füge sie als Platzhalter mit XXX ein.
- Schlussformel exakt:
Mit freundlichen Grüßen

${personalData?.closingName || personalData?.name || 'XXX'}
- Gib nur den fertigen Anschreiben-Text zurück, keine Erklärung.

Stil: ${voice || 'klar und professionell'}

Absenderdaten:
${JSON.stringify(personalData ?? {}, null, 2)}

Erkannte Jobdaten:
${JSON.stringify(jobDetails ?? {}, null, 2)}

Stellenanzeige:
${jobInput || ''}

Ausgelesene Unterlagen:
${profile.text || ''}
`.trim();
}

async function generateWithProvider({ provider, apiKey, prompt }) {
  if (provider === 'Anthropic') {
    return generateAnthropic({ apiKey, prompt });
  }
  if (provider === 'Google Gemini') {
    return generateGemini({ apiKey, prompt });
  }
  if (provider === 'Mistral AI') {
    return generateChatCompletion({
      url: 'https://api.mistral.ai/v1/chat/completions',
      apiKey,
      model: 'mistral-small-latest',
      prompt,
    });
  }
  if (provider === 'OpenRouter') {
    return generateChatCompletion({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey,
      model: 'openai/gpt-4o-mini',
      prompt,
    });
  }
  return generateOpenAI({ apiKey, prompt });
}

async function generateOpenAI({ apiKey, prompt }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: prompt,
      temperature: 0.4,
    }),
  });
  const data = await parseProviderResponse(response);
  return data.output_text || data.output?.flatMap((item) => item.content ?? []).map((part) => part.text).filter(Boolean).join('\n') || '';
}

async function generateAnthropic({ apiKey, prompt }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 2200,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await parseProviderResponse(response);
  return data.content?.map((part) => part.text).filter(Boolean).join('\n') || '';
}

async function generateGemini({ apiKey, prompt }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });
  const data = await parseProviderResponse(response);
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n') || '';
}

async function generateChatCompletion({ url, apiKey, model, prompt }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await parseProviderResponse(response);
  return data.choices?.[0]?.message?.content || '';
}

async function parseProviderResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || data.message || `KI-Anbieter meldet Fehler ${response.status}.`;
    throw new Error(message);
  }
  return data;
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
