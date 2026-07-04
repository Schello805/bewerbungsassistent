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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'datenbasis');
const lettersDir = path.join(rootDir, 'anschreiben');
const storageDir = path.join(rootDir, 'data');
const backupsDir = path.join(storageDir, 'backups');
const databasePath = path.join(storageDir, 'app.db');
const secretPath = path.join(storageDir, 'secret.key');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const execFileAsync = promisify(execFile);
let updateInProgress = false;
const updateLogs = [];

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(lettersDir, { recursive: true });
await fs.mkdir(storageDir, { recursive: true });
await fs.mkdir(backupsDir, { recursive: true });
const encryptionKey = await loadEncryptionKey();

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

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    job_input TEXT NOT NULL,
    job_url TEXT NOT NULL DEFAULT '',
    letter_id TEXT,
    notes TEXT NOT NULL DEFAULT '',
    follow_up_at TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Entwurf',
    status_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

ensureColumn('applications', 'job_url', "TEXT NOT NULL DEFAULT ''");
ensureColumn('applications', 'notes', "TEXT NOT NULL DEFAULT ''");
ensureColumn('applications', 'follow_up_at', "TEXT NOT NULL DEFAULT ''");

const app = express();
app.use(express.json({ limit: '120mb' }));

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
    const apiKeys = getApiKeyMap();
    response.json({
      personalData: getSetting('personalData', null),
      provider: getSetting('provider', null),
      voice: getSetting('voice', null),
      googleClientId: getSetting('googleClientId', null),
      profileEvidence: getSetting('profileEvidence', []),
      promptNotes: getSetting('promptNotes', ''),
      apiKeyStorageMode: getSetting('apiKeyStorageMode', 'server'),
      apiKeyProviders: Object.entries(apiKeys)
        .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
        .map(([key]) => key),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/update-status', async (_request, response) => {
  const status = await getUpdateStatus();
  response.json(status);
});

app.post('/api/update', async (_request, response) => {
  if (updateInProgress) {
    response.status(409).json({ error: 'Update läuft bereits.' });
    return;
  }

  updateInProgress = true;
  updateLogs.length = 0;
  addUpdateLog('Update gestartet.');
  try {
    const result = await runSelfUpdate();
    response.json({ ...result, logs: updateLogs.slice(-12) });
    setTimeout(() => process.exit(0), 1200);
  } catch (error) {
    const message = formatUpdateError(error);
    updateInProgress = false;
    addUpdateLog(`Fehler: ${message}`);
    response.status(400).json({ error: message });
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
    if ('googleClientId' in request.body) {
      setSetting('googleClientId', request.body.googleClientId);
    }
    if ('apiKeyStorageMode' in request.body) {
      setSetting('apiKeyStorageMode', request.body.apiKeyStorageMode === 'session' ? 'session' : 'server');
    }
    if ('promptNotes' in request.body) {
      setSetting('promptNotes', String(request.body.promptNotes || '').trim().slice(0, 3000));
    }
    if ('profileEvidence' in request.body) {
      const profileEvidence = Array.isArray(request.body.profileEvidence)
        ? request.body.profileEvidence.map((item) => String(item).trim()).filter(Boolean).slice(0, 80)
        : [];
      setSetting('profileEvidence', profileEvidence);
    }
    if ('apiKey' in request.body) {
      const apiKeys = getApiKeyMap();
      const provider = typeof request.body.provider === 'string' && request.body.provider.trim()
        ? request.body.provider.trim()
        : getSetting('provider', 'OpenAI');
      const apiKey = typeof request.body.apiKey === 'string' ? request.body.apiKey.trim() : '';

      if (apiKey.length > 0) {
        apiKeys[provider] = apiKey;
      } else {
        delete apiKeys[provider];
      }

      setApiKeyMap(apiKeys);
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

app.get('/api/applications', (_request, response, next) => {
  try {
    const applications = db.prepare(`
      SELECT id, title, company, job_input AS jobInput, job_url AS jobUrl, letter_id AS letterId,
             notes, follow_up_at AS followUpAt, status,
             status_updated_at AS statusUpdatedAt, created_at AS createdAt, updated_at AS updatedAt
      FROM applications
      ORDER BY updated_at DESC
    `).all();
    response.json({ applications });
  } catch (error) {
    next(error);
  }
});

app.post('/api/applications', (request, response, next) => {
  try {
    const now = new Date().toISOString();
    const title = String(request.body.title || 'Bewerbung').trim();
    const company = String(request.body.company || '').trim();
    const jobInput = String(request.body.jobInput || '').trim();
    const jobUrl = String(request.body.jobUrl || '').trim();
    const notes = String(request.body.notes || '').trim();
    const followUpAt = String(request.body.followUpAt || '').trim();
    const letterId = typeof request.body.letterId === 'string' ? request.body.letterId : null;
    const status = normalizeApplicationStatus(request.body.status || 'Entwurf');
    const id = String(request.body.id || `${now.replaceAll(/[:.]/g, '-')}-${sanitizeFileName(title)}`).trim();

    db.prepare(`
      INSERT INTO applications (id, title, company, job_input, job_url, letter_id, notes, follow_up_at, status, status_updated_at, created_at, updated_at)
      VALUES (@id, @title, @company, @jobInput, @jobUrl, @letterId, @notes, @followUpAt, @status, @now, @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        job_input = excluded.job_input,
        job_url = @jobUrl,
        notes = @notes,
        follow_up_at = @followUpAt,
        letter_id = excluded.letter_id,
        status = excluded.status,
        status_updated_at = excluded.status_updated_at,
        updated_at = excluded.updated_at
    `).run({ id, title, company, jobInput, jobUrl, notes, followUpAt, letterId, status, now });

    response.status(201).json({
      application: { id, title, company, jobInput, jobUrl, notes, followUpAt, letterId, status, statusUpdatedAt: now, createdAt: now, updatedAt: now },
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/applications/:id', (request, response, next) => {
  try {
    const notes = String(request.body.notes || '').trim();
    const followUpAt = String(request.body.followUpAt || '').trim();
    const jobUrl = String(request.body.jobUrl || '').trim();
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE applications
      SET notes = @notes, follow_up_at = @followUpAt, job_url = @jobUrl, updated_at = @now
      WHERE id = @id
    `).run({ id: request.params.id, notes, followUpAt, jobUrl, now });

    if (result.changes === 0) {
      response.status(404).json({ error: 'Bewerbung nicht gefunden.' });
      return;
    }

    response.json({ ok: true, notes, followUpAt, jobUrl, updatedAt: now });
  } catch (error) {
    next(error);
  }
});

app.put('/api/applications/:id/status', (request, response, next) => {
  try {
    const status = normalizeApplicationStatus(request.body.status);
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE applications
      SET status = @status, status_updated_at = @now, updated_at = @now
      WHERE id = @id
    `).run({ id: request.params.id, status, now });

    if (result.changes === 0) {
      response.status(404).json({ error: 'Bewerbung nicht gefunden.' });
      return;
    }

    response.json({ ok: true, status, statusUpdatedAt: now });
  } catch (error) {
    next(error);
  }
});

app.get('/api/backup', async (_request, response, next) => {
  try {
    const backup = await createBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    response
      .setHeader('content-disposition', `attachment; filename="bewerbungsassistent-backup-${stamp}.json"`)
      .json(backup);
  } catch (error) {
    next(error);
  }
});

app.post('/api/backup/restore', async (request, response, next) => {
  try {
    await restoreBackup(request.body);
    response.json({ ok: true });
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
      promptNotes: request.body.promptNotes,
      profile: await readProfileFromDataDir(),
    });

    if (providerRequiresApiKey(provider) && !apiKey) {
      response.status(400).json({ error: 'Kein API-Key eingetragen.' });
      return;
    }

    const text = cleanGeneratedLetter(await generateWithProvider({ provider, apiKey, prompt }));
    response.json({ text });
  } catch (error) {
    next(error);
  }
});

app.post('/api/rewrite-letter', async (request, response, next) => {
  try {
    const provider = typeof request.body.provider === 'string' ? request.body.provider : 'OpenAI';
    const requestApiKey = typeof request.body.apiKey === 'string' ? request.body.apiKey.trim() : '';
    const apiKey = requestApiKey || getProviderApiKey(provider);
    const text = typeof request.body.text === 'string' ? request.body.text.trim() : '';

    if (providerRequiresApiKey(provider) && !apiKey) {
      response.status(400).json({ error: 'Kein API-Key eingetragen.' });
      return;
    }

    if (text.length < 20) {
      response.status(400).json({ error: 'Der Text ist zu kurz zum Überarbeiten.' });
      return;
    }

    const prompt = buildRewritePrompt({
      text,
      mode: request.body.mode,
      voice: request.body.voice,
      personalData: request.body.personalData,
      jobDetails: request.body.jobDetails,
    });
    const rewrittenText = cleanGeneratedLetter(await generateWithProvider({ provider, apiKey, prompt }));
    response.json({ text: rewrittenText || text });
  } catch (error) {
    next(error);
  }
});

app.post(['/api/compare-letter', '/compare-letter'], async (request, response, next) => {
  try {
    const requestApiKey = typeof request.body.apiKey === 'string' ? request.body.apiKey.trim() : '';
    const apiKeys = getApiKeyMap();
    const providers = getComparableProviders(apiKeys, request.body.provider, requestApiKey);
    const profile = await readProfileFromDataDir();
    const prompt = buildAiPrompt({
      personalData: request.body.personalData,
      jobInput: request.body.jobInput,
      jobDetails: request.body.jobDetails,
      voice: request.body.voice,
      promptNotes: request.body.promptNotes,
      profile,
    });

    if (providers.length === 0) {
      response.status(400).json({ error: 'Keine KI mit gespeichertem Key verfügbar.' });
      return;
    }

    const candidates = [];
    for (const candidateProvider of providers) {
      try {
        const apiKey = candidateProvider === request.body.provider && requestApiKey
          ? requestApiKey
          : getProviderApiKey(candidateProvider);
        const text = cleanGeneratedLetter(await generateWithProvider({ provider: candidateProvider, apiKey, prompt }));
        candidates.push({ provider: candidateProvider, text, ok: true });
      } catch (error) {
        candidates.push({ provider: candidateProvider, text: '', ok: false, error: error instanceof Error ? error.message : 'Fehler' });
      }
    }

    response.json({ candidates });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  response.status(400).json({ error: error instanceof Error ? error.message : 'Unbekannter Fehler.' });
});

if (isProduction) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(rootDir, 'dist', 'index.html'));
  });
} else {
  const hmrPort = await findAvailablePort(Number(process.env.HMR_PORT || 5174));
  const vite = await createViteServer({
    root: rootDir,
    server: { middlewareMode: true, hmr: { port: hmrPort } },
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

await runAutomaticBackup().catch((error) => {
  console.warn(`Automatisches Backup übersprungen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`);
});
setInterval(() => {
  void runAutomaticBackup().catch((error) => {
    console.warn(`Automatisches Backup fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`);
  });
}, 60 * 60 * 1000);

function sanitizeFileName(fileName) {
  return path.basename(fileName).replaceAll(/[^a-zA-Z0-9äöüÄÖÜß._ -]/g, '_');
}

async function findAvailablePort(startPort) {
  for (let candidate = startPort; candidate < startPort + 50; candidate += 1) {
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  return 0;
}

function isPortAvailable(candidate) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(candidate, () => {
      server.close(() => resolve(true));
    });
  });
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
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

async function loadEncryptionKey() {
  try {
    const existing = (await fs.readFile(secretPath, 'utf8')).trim();
    if (/^[a-f0-9]{64}$/i.test(existing)) return Buffer.from(existing, 'hex');
  } catch {
    // Create a server-local secret on first start.
  }
  const key = crypto.randomBytes(32);
  await fs.writeFile(secretPath, key.toString('hex'), { mode: 0o600 });
  return key;
}

function encryptString(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptString(value) {
  if (typeof value !== 'string' || !value.startsWith('v1:')) return typeof value === 'string' ? value : '';
  const [, ivBase64, tagBase64, encryptedBase64] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function getApiKeyMap() {
  const encryptedMap = getSetting('apiKeysEncrypted', null);
  if (encryptedMap && typeof encryptedMap === 'object') {
    return Object.fromEntries(Object.entries(encryptedMap).map(([provider, encryptedValue]) => {
      try {
        return [provider, decryptString(encryptedValue)];
      } catch {
        return [provider, ''];
      }
    }).filter(([, value]) => value));
  }

  const legacyMap = getSetting('apiKeys', {});
  if (legacyMap && typeof legacyMap === 'object' && Object.keys(legacyMap).length > 0) {
    setApiKeyMap(legacyMap);
    setSetting('apiKeys', {});
    return legacyMap;
  }

  return {};
}

function setApiKeyMap(apiKeys) {
  const encryptedMap = Object.fromEntries(Object.entries(apiKeys || {})
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([provider, value]) => [provider, encryptString(value.trim())]));
  setSetting('apiKeysEncrypted', encryptedMap);
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
  const apiKeys = getApiKeyMap();
  const apiKey = apiKeys?.[provider];
  return typeof apiKey === 'string' ? apiKey.trim() : '';
}

function providerRequiresApiKey(provider) {
  return provider !== 'Llama lokal';
}

function normalizeApplicationStatus(status) {
  const allowed = ['Entwurf', 'Versendet', 'Zwischenbescheid', 'Absage', 'Vorstellungsgespräch'];
  const value = String(status || 'Entwurf').trim();
  return allowed.includes(value) ? value : 'Entwurf';
}

function getComparableProviders(apiKeys, selectedProvider, requestApiKey = '') {
  const savedProviders = Object.entries(apiKeys)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([provider]) => provider);
  const providers = [...new Set([selectedProvider, ...savedProviders, 'Llama lokal'].filter(Boolean))];
  return providers.filter((provider) => provider === 'Llama lokal' || savedProviders.includes(provider) || (provider === selectedProvider && requestApiKey));
}

async function createBackup() {
  const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((row) => {
    try {
      return [row.key, JSON.parse(row.value)];
    } catch {
      return [row.key, row.value];
    }
  }));
  const letters = db.prepare('SELECT id, title, text, size, created_at AS createdAt, updated_at AS updatedAt FROM letters ORDER BY updated_at DESC').all();
  const applications = db.prepare(`
    SELECT id, title, company, job_input AS jobInput, job_url AS jobUrl, letter_id AS letterId,
           notes, follow_up_at AS followUpAt, status,
           status_updated_at AS statusUpdatedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM applications
    ORDER BY updated_at DESC
  `).all();
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const documents = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
    .map(async (entry) => {
      const filePath = path.join(dataDir, entry.name);
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath);
      return {
        name: entry.name,
        type: inferDocumentType(entry.name),
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        contentBase64: content.toString('base64'),
      };
    }));

  return {
    app: 'bewerbungsassistent',
    version: 1,
    createdAt: new Date().toISOString(),
    settings,
    letters,
    applications,
    documents,
  };
}

async function runAutomaticBackup() {
  if (process.env.AUTO_BACKUP === '0' || process.env.AUTO_BACKUP === 'false') return;
  await fs.mkdir(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const filePath = path.join(backupsDir, `bewerbungsassistent-auto-${stamp}.json`);
  try {
    await fs.access(filePath);
    return;
  } catch {
    // No backup for today yet.
  }
  const backup = await createBackup();
  await fs.writeFile(filePath, JSON.stringify(backup, null, 2), { mode: 0o600 });
  await pruneAutomaticBackups();
}

async function pruneAutomaticBackups() {
  const keep = Number(process.env.AUTO_BACKUP_KEEP || 14);
  const entries = await fs.readdir(backupsDir, { withFileTypes: true });
  const backupFiles = entries
    .filter((entry) => entry.isFile() && /^bewerbungsassistent-auto-\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(backupFiles.slice(keep).map((fileName) => fs.unlink(path.join(backupsDir, fileName)).catch(() => {})));
}

async function restoreBackup(backup) {
  if (!backup || backup.app !== 'bewerbungsassistent' || !Array.isArray(backup.documents) || !Array.isArray(backup.letters)) {
    throw new Error('Ungültige Backup-Datei.');
  }

  const settings = backup.settings && typeof backup.settings === 'object' ? backup.settings : {};
  const restoreSettings = db.transaction((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      setSetting(key, value);
    }
  });
  restoreSettings(settings);

  for (const document of backup.documents) {
    if (!document?.name || !document?.contentBase64) continue;
    const fileName = sanitizeFileName(document.name);
    const filePath = path.join(dataDir, fileName);
    if (!filePath.startsWith(dataDir)) continue;
    await fs.writeFile(filePath, Buffer.from(document.contentBase64, 'base64'));
  }

  const restoreLetters = db.transaction((letters) => {
    for (const letter of letters) {
      if (!letter?.id || !letter?.text) continue;
      const title = typeof letter.title === 'string' && letter.title.trim() ? letter.title.trim() : 'anschreiben';
      const text = String(letter.text);
      const size = Buffer.byteLength(text, 'utf8');
      const createdAt = letter.createdAt || letter.updatedAt || new Date().toISOString();
      const updatedAt = letter.updatedAt || createdAt;
      db.prepare(`
        INSERT INTO letters (id, title, text, size, created_at, updated_at)
        VALUES (@id, @title, @text, @size, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          text = excluded.text,
          size = excluded.size,
          updated_at = excluded.updated_at
      `).run({ id: sanitizeFileName(letter.id), title, text, size, createdAt, updatedAt });
    }
  });
  restoreLetters(backup.letters);

  const restoreApplications = db.transaction((applications) => {
    for (const application of applications || []) {
      if (!application?.id || !application?.title) continue;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO applications (id, title, company, job_input, job_url, letter_id, notes, follow_up_at, status, status_updated_at, created_at, updated_at)
        VALUES (@id, @title, @company, @jobInput, @jobUrl, @letterId, @notes, @followUpAt, @status, @statusUpdatedAt, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          company = excluded.company,
          job_input = excluded.job_input,
          job_url = excluded.job_url,
          letter_id = excluded.letter_id,
          notes = excluded.notes,
          follow_up_at = excluded.follow_up_at,
          status = excluded.status,
          status_updated_at = excluded.status_updated_at,
          updated_at = excluded.updated_at
      `).run({
        id: sanitizeFileName(application.id),
        title: String(application.title),
        company: String(application.company || ''),
        jobInput: String(application.jobInput || ''),
        jobUrl: String(application.jobUrl || ''),
        letterId: application.letterId || null,
        notes: String(application.notes || ''),
        followUpAt: String(application.followUpAt || ''),
        status: normalizeApplicationStatus(application.status),
        statusUpdatedAt: application.statusUpdatedAt || now,
        createdAt: application.createdAt || now,
        updatedAt: application.updatedAt || now,
      });
    }
  });
  restoreApplications(backup.applications);
}

async function getUpdateStatus() {
  try {
    addUpdateLog('GitHub wird auf Updates geprüft.');
    const current = await gitOutput(['rev-parse', '--short', 'HEAD']);
    await gitOutput(['fetch', 'origin', 'main']);
    const remote = await gitOutput(['rev-parse', '--short', 'origin/main']);
    const behindText = await gitOutput(['rev-list', '--count', 'HEAD..origin/main']);
    const behind = Number(behindText || 0);
    return {
      ok: true,
      current,
      remote,
      updateAvailable: behind > 0,
      behind,
      updating: updateInProgress,
      logs: updateLogs.slice(-12),
    };
  } catch (error) {
    return {
      ok: false,
      updateAvailable: false,
      updating: updateInProgress,
      logs: updateLogs.slice(-12),
      error: error instanceof Error ? error.message : 'Update-Status konnte nicht geprüft werden.',
    };
  }
}

async function runSelfUpdate() {
  addUpdateLog('Remote-Stand wird geladen.');
  await gitOutput(['fetch', 'origin', 'main']);
  const before = await gitOutput(['rev-parse', '--short', 'HEAD']);
  const behind = Number(await gitOutput(['rev-list', '--count', 'HEAD..origin/main']) || 0);

  if (behind === 0) {
    updateInProgress = false;
    addUpdateLog('Keine neue Version verfügbar.');
    return { ok: true, updated: false, message: 'Keine neue Version verfügbar.', current: before };
  }

  addUpdateLog(`${behind} Änderung(en) gefunden. Update-Script startet.`);
  await execInRoot('bash', ['scripts/update.sh', '--app-only'], 240000);
  const current = await gitOutput(['rev-parse', '--short', 'HEAD']);
  addUpdateLog(`Update installiert: ${before} → ${current}.`);
  return { ok: true, updated: true, message: 'Update installiert. Server startet neu.', before, current };
}

function addUpdateLog(message) {
  updateLogs.push({ at: new Date().toISOString(), message });
  if (updateLogs.length > 40) updateLogs.splice(0, updateLogs.length - 40);
}

function formatUpdateError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const cleanMessage = rawMessage
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/npm warn deprecated[^\n]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/timed out|timeout/i.test(cleanMessage)) {
    return 'Update hat zu lange gedauert. Bitte später erneut versuchen oder auf dem Server scripts/update.sh ausführen.';
  }
  if (/npm ci|npm|audited|packages/i.test(cleanMessage)) {
    return 'Update konnte beim Installieren oder Bauen der Abhängigkeiten nicht abgeschlossen werden. Bitte erneut versuchen oder Server-Logs prüfen.';
  }
  if (/git|fast-forward|fetch|pull/i.test(cleanMessage)) {
    return 'Update konnte den GitHub-Stand nicht sauber übernehmen. Bitte erneut versuchen oder scripts/update.sh auf dem Server ausführen.';
  }
  return cleanMessage.slice(0, 220) || 'Update fehlgeschlagen. Bitte Server-Logs prüfen.';
}

async function gitOutput(args) {
  const { stdout } = await execInRoot('git', args, 60000);
  return stdout.trim();
}

async function execInRoot(command, args, timeout) {
  try {
    return await execFileAsync(command, args, { cwd: rootDir, timeout, maxBuffer: 1024 * 1024 * 8 });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : '';
    const stdout = error?.stdout ? String(error.stdout).trim() : '';
    throw new Error([stderr, stdout, error instanceof Error ? error.message : 'Befehl fehlgeschlagen.'].filter(Boolean).join('\n').slice(0, 1200));
  }
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

function buildAiPrompt({ personalData, jobInput, jobDetails, voice, promptNotes, profile }) {
  const profileContext = buildProfileContext(profile);
  const templateInstruction = getTemplateInstruction(voice);
  const customPromptNotes = String(promptNotes || getSetting('promptNotes', '') || '').trim();
  const source = jobDetails?.source || detectJobSource(jobInput || '');
  const sourceInstruction = source
    ? `Der Einstieg muss natürlich erwähnen, dass die Ausschreibung auf ${source} gefunden wurde. Beispielhaft: "Ihre Ausschreibung auf ${source} ..." oder eleganter.`
    : 'Wenn keine Quelle erkennbar ist, erwähne keine Jobbörse.';
  return `
Du bist ein erfahrener deutscher Bewerbungscoach. Erstelle ein überzeugendes, konkretes Anschreiben als editierbaren Entwurf.

Regeln:
- Schreibe auf Deutsch.
- Verwende die Absenderdaten, Empfängerblock, Datum, Betreff, Anrede und Schlussformel.
- Nutze konkrete Informationen aus Lebenslauf/Unterlagen, aber erfinde keine Arbeitgeber oder Zahlen.
- Verwende Profilinformationen niemals als rohe Keyword-Liste.
- Schreibe niemals Sätze wie "Besonders relevant sind für mich A, B, C". Profilbelege müssen in natürliche, begründete Sätze eingebettet werden.
- Keine komma-getrennten Qualifikationslisten im Haupttext.
- Kopiere keine langen Rohtext-Passagen aus Lebenslauf, Zeugnissen oder Profil.
- Wenn Angaben aus der Stellenanzeige verlangt werden (z. B. Wunschgehalt, Eintrittstermin, Referenznummer), füge sie als Platzhalter mit XXX ein.
- Wenn Firma, Ansprechpartner oder Adresse unbekannt sind, nutze neutrale Platzhalter mit XXX statt Jobbörsen-Namen wie Xing, LinkedIn oder StepStone.
- Jobbörsen wie Xing, LinkedIn, StepStone oder Indeed dürfen als Quelle genannt werden, aber niemals als Arbeitgeber oder Empfänger.
- ${sourceInstruction}
- Der Betreff darf kein Markdown enthalten.
- Das Anschreiben soll substanziell sein: etwa 230 bis 360 Wörter im Haupttext, nicht nur drei generische Sätze.
- Schreibe keine Floskelliste. Jeder Absatz muss einen Zweck haben und zur Stelle passen.
- Nutze "ich" natürlich, aber nicht in jedem Satz am Anfang.
- Wenn Profilbelege vorhanden sind, müssen mindestens 3 konkrete Qualifikationen, Zertifikate, Rollen oder Methoden aus dem Profil sinnvoll im Text vorkommen.
- Nenne diese Belege natürlich im Fließtext, nicht als Aufzählung.
- Das Anschreiben muss echte Absätze haben: Zwischen jedem Haupttext-Absatz steht genau eine Leerzeile.
- Jeder Haupttext-Absatz soll 2 bis 4 zusammenhängende Sätze enthalten.
- Keine einzelnen Satzfragmente als eigener Absatz, außer Grußformel.
- Formuliere lebendig, konkret und menschlich. Vermeide austauschbare Sätze wie "Diese Kombination spricht mich sehr an" ohne konkrete Begründung.
- Schlussformel exakt:
Mit freundlichen Grüßen

${personalData?.closingName || personalData?.name || 'XXX'}
- Gib nur den fertigen Anschreiben-Text zurück, keine Erklärung.
- Schreibe niemals Meta-Sätze wie "Der gewünschte Stil ist", "Relevant aus meiner Datenbasis", "Bitte diesen Entwurf prüfen", "Ausgelesene Unterlagen", "Strukturierte Profilanalyse" oder Hinweise über diesen Prompt.

Aufbau des Haupttexts:
1. Einstieg: Quelle nennen, konkrete Stelle nennen, einen nachvollziehbaren Grund nennen, warum die Aufgabe fachlich passt.
2. Matching: 2 bis 3 zentrale Anforderungen der Stelle mit passenden Erfahrungen/Fähigkeiten des Bewerbers verbinden.
3. Belegabsatz: beruflichen Schwerpunkt aus Profil/Lebenslauf konkret einbetten, z. B. Qualitätsmanagement, Audit, Prozesse, Führung oder Betriebswirtschaft.
4. Mehrwert: erklären, welche Wirkung der Bewerber im Unternehmen erzeugen kann.
5. Abschluss: Gesprächswunsch, selbstbewusst und freundlich.

Stil/Vorlage: ${voice || 'klar und professionell'}
${templateInstruction}
${customPromptNotes ? `\nZusätzliche Nutzer-Anweisung, sofern sie nicht den Regeln widerspricht:\n${customPromptNotes}` : ''}

Absenderdaten:
${JSON.stringify(personalData ?? {}, null, 2)}

Erkannte Jobdaten:
${JSON.stringify(jobDetails ?? {}, null, 2)}

Stellenanzeige:
${jobInput || ''}

Profilinformationen zur inhaltlichen Nutzung, nicht wörtlich kopieren:
${profileContext}
`.trim();
}

function getTemplateInstruction(voice) {
  const instructions = {
    'Locker und modern': 'Ton: modern, natürlich, aktiv, ohne steife Floskeln.',
    'Formell und traditionell': 'Ton: klassisch, seriös, konservativ, sehr sauber formuliert.',
    'Direkt und selbstbewusst': 'Ton: klar, ergebnisorientiert, selbstbewusst, aber nicht überheblich.',
    'Warm und persönlich': 'Ton: freundlich, menschlich, verbindlich und nahbar.',
    Konservativ: 'Vorlage: konservatives Anschreiben mit sachlichem Einstieg, klaren Belegen und zurückhaltender Wirkung.',
    Modern: 'Vorlage: modernes Anschreiben mit starkem Einstieg, klaren kurzen Sätzen und natürlicher Sprache.',
    Führungsstark: 'Vorlage: betone Verantwortung, Priorisierung, Kommunikation, Steuerung und Wirkung auf Teams/Prozesse.',
    Kurz: 'Vorlage: kompaktes Anschreiben mit 170 bis 230 Wörtern im Haupttext, keine Redundanzen.',
    Ausführlich: 'Vorlage: ausführlicher, aber strukturiert; 320 bis 430 Wörter im Haupttext mit konkreterem Matching.',
    Initiativbewerbung: 'Vorlage: keine konkrete Ausschreibung voraussetzen; Motivation, Profil und möglicher Mehrwert für das Unternehmen erklären.',
  };
  return instructions[voice] || 'Ton: klar, professionell und konkret.';
}

function buildRewritePrompt({ text, mode, voice, personalData, jobDetails }) {
  const instructions = {
    modern: 'Formuliere moderner, klarer, aktiver und weniger steif. Der Text bleibt professionell.',
    detailed: 'Arbeite den Text detaillierter aus. Ergänze passendere Bezüge, konkretere Argumente und bessere Übergänge. Erfinde keine Fakten.',
    confident: 'Formuliere fordernder und selbstbewusster. Stärken sollen klarer sichtbar werden, aber nicht überheblich klingen.',
    formal: 'Formuliere klassischer, formeller und sehr seriös. Geeignet für konservative Arbeitgeber.',
    alternative: 'Erstelle eine alternative Fassung mit anderer Satzstruktur und frischerem Einstieg, ohne Inhalt oder Fakten zu verfälschen.',
    shorten: 'Kürze den Text deutlich um etwa 20 bis 30 Prozent. Erhalte alle wichtigen Fakten, Platzhalter und Kontaktdaten.',
  };

  const customPromptNotes = String(getSetting('promptNotes', '') || '').trim();
  return `
Du bist ein deutscher Bewerbungsassistent. Überarbeite das vorhandene Anschreiben.

Aufgabe:
${instructions[mode] || instructions.modern}

Regeln:
- Gib ausschließlich den vollständigen überarbeiteten Anschreiben-Text zurück.
- Erhalte Absenderblock, Empfängerblock, Datum, Betreff, Anrede und Schlussformel.
- Lasse Platzhalter wie XXX erhalten.
- Erfinde keine neuen Arbeitgeber, Zahlen, Abschlüsse oder Erfahrungen.
- Entferne Meta-Hinweise, Prompt-Kommentare und Sätze über Stil, Datenbasis oder KI.
- Kein Markdown im Betreff.
- Nutze Deutsch.
- Zielstil: ${voice || 'klar und professionell'}.
${customPromptNotes ? `- Zusätzliche Nutzer-Anweisung beachten, sofern sie den Regeln nicht widerspricht: ${customPromptNotes}` : ''}

Absenderdaten:
${JSON.stringify(personalData ?? {}, null, 2)}

Erkannte Jobdaten:
${JSON.stringify(jobDetails ?? {}, null, 2)}

Aktueller Text:
${text}
`.trim();
}

function buildProfileContext(profile) {
  const insights = profile?.insights ?? {};
  const structured = profile?.structured ?? {};
  const documents = Array.isArray(profile?.documents) ? profile.documents : [];
  const evidence = Array.isArray(profile?.evidence) ? profile.evidence : [];
  const documentNames = documents
    .slice(0, 12)
    .map((document) => `- ${document.type}: ${document.fileName}`)
    .join('\n');
  const documentSummaries = documents
    .filter((document) => document.summary && document.summary !== 'Kein Text auslesbar.')
    .slice(0, 8)
    .map((document) => `- ${document.fileName}: ${document.summary}`)
    .join('\n');

  return [
    `Verbindliche Profilbelege für das Anschreiben: ${evidence.slice(0, 18).join(', ') || 'keine eindeutig erkannt'}`,
    `Strukturierte Profilanalyse: Stationen=${(structured.stations ?? []).slice(0, 8).join(', ') || '-'}; Skills=${(structured.skills ?? []).slice(0, 10).join(', ') || '-'}; Zertifikate=${(structured.certificates ?? []).slice(0, 10).join(', ') || '-'}; Berufserfahrung=${(structured.experience ?? []).slice(0, 8).join(', ') || '-'}; Aufgaben=${(structured.responsibilities ?? []).slice(0, 10).join(', ') || '-'}; Branchen=${(structured.industries ?? []).slice(0, 8).join(', ') || '-'}; Führung=${(structured.leadership ?? []).slice(0, 8).join(', ') || '-'}; QM/Audit=${(structured.quality ?? []).slice(0, 10).join(', ') || '-'}; Tools=${(structured.tools ?? []).slice(0, 8).join(', ') || '-'}`,
    `Kompetenzen: ${(insights.skills ?? []).slice(0, 10).join(', ') || 'keine eindeutig erkannt'}`,
    `Rollen/Erfahrung: ${(insights.roles ?? []).slice(0, 6).join(', ') || 'keine eindeutig erkannt'}`,
    `Ausbildung/Zertifikate: ${(insights.education ?? []).slice(0, 6).join(', ') || 'keine eindeutig erkannt'}`,
    `Arbeitsweise: ${(insights.strengths ?? []).slice(0, 6).join(', ') || 'keine eindeutig erkannt'}`,
    documentNames ? `Hochgeladene Dokumente:\n${documentNames}` : '',
    documentSummaries ? `Dokumentauszüge:\n${documentSummaries}` : '',
  ].filter(Boolean).join('\n');
}

function detectJobSource(text) {
  const haystack = String(text || '').toLowerCase();
  const sources = [
    ['Xing', /\bxing\b|xing\.com/],
    ['LinkedIn', /\blinkedin\b|linkedin\.com/],
    ['StepStone', /\bstepstone\b|stepstone\./],
    ['Indeed', /\bindeed\b|indeed\./],
    ['Bundesagentur für Arbeit', /arbeitsagentur\.de|jobboerse\.arbeitsagentur/],
    ['Join', /\bjoin\b|join\.com/],
    ['HeyJobs', /\bheyjobs\b|heyjobs\./],
  ];
  return sources.find(([, pattern]) => pattern.test(haystack))?.[0] || '';
}

function cleanGeneratedLetter(text) {
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

  const cleaned = String(text || '')
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

function normalizeLetterParagraphs(text) {
  const lines = String(text || '').split('\n').map((line) => line.trimEnd());
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

async function generateWithProvider({ provider, apiKey, prompt }) {
  if (provider === 'Llama lokal') {
    return generateOllama({ prompt });
  }
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

async function generateOllama({ prompt }) {
  const response = await fetch(process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'llama3.1',
      prompt,
      stream: false,
      options: { temperature: 0.4 },
    }),
  });
  const data = await parseProviderResponse(response);
  return data.response || '';
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
  const customEvidence = getSetting('profileEvidence', []);
  return {
    documents: documents.map(({ text, ...document }) => ({
      ...document,
      characterCount: text.length,
    })),
    text: combinedText.slice(0, 18000),
    keywords: extractKeywords(combinedText),
    evidence: uniqueMatches([...customEvidence, ...extractProfileEvidence(combinedText, documents)]),
    insights: extractProfileInsights(combinedText),
    structured: extractStructuredProfile(combinedText, documents),
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
  return normalized.slice(0, 900);
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

function extractProfileInsights(text) {
  const normalized = normalizeText(text);
  const skillPatterns = [
    'Qualitätsmanagement', 'Qualitätssicherung', 'Qualitätsplanung', 'Reklamationsmanagement',
    'Lieferantenqualität', 'Projektmanagement', 'Prozessmanagement', 'Audit', 'VDA 6.3', 'VDA',
    'ISO 9001', 'ISO 14001', 'IATF 16949', 'ISO', 'KAIZEN', 'KVP', 'Lean', 'Lean Management',
    'Six Sigma', '5S', '8D', 'FMEA', 'APQP', 'PPAP', 'CAPA', 'Root Cause', 'Prüfplanung',
    'Messtechnik', 'SAP', 'Excel', 'Power BI', 'Führung', 'Teamführung', 'Controlling',
    'Vertrieb', 'Einkauf', 'Produktion', 'Logistik', 'IT', 'Digitalisierung', 'Betriebswirtschaft',
  ];
  const rolePattern = /\b(?:Qualitätsmanager|Qualitätsmanagementbeauftragter|QMB|Qualitätsmanagement-Beauftragter|Qualitätsmanagementbeauftragter|Qualitätsmanagementbeauftragte|Betriebswirt|Projektleiter|Teamleiter|Auditor|Controller|Manager|Sachbearbeiter|Leiter|Koordinator|Beauftragter)[\wäöüß /.-]*/gi;
  const educationPattern = /\b(?:staatl\.?\s*gepr\.?\s*Betriebswirt|staatlich geprüfter Betriebswirt|Bachelor|Master|Ausbildung|Studium|Zertifikat|Certificate|IHK|Techniker|Auditor|Coursera|Abschluss)[\wäöüß /.-]*/gi;
  const strengthPatterns = [
    'strukturiert', 'zuverlässig', 'analytisch', 'kommunikationsstark', 'eigenverantwortlich',
    'lösungsorientiert', 'teamfähig', 'kundenorientiert', 'praxisnah', 'verantwortungsvoll',
  ];

  return {
    skills: uniqueMatches(skillPatterns.filter((skill) => new RegExp(`\\b${escapeRegExp(skill)}\\b`, 'i').test(normalized))).slice(0, 14),
    roles: uniqueMatches(normalized.match(rolePattern) ?? []).slice(0, 8),
    education: uniqueMatches(normalized.match(educationPattern) ?? []).slice(0, 8),
    strengths: uniqueMatches(strengthPatterns.filter((strength) => new RegExp(`\\b${escapeRegExp(strength)}\\b`, 'i').test(normalized))).slice(0, 10),
  };
}

function extractStructuredProfile(text, documents = []) {
  const normalized = normalizeText(text);
  const insights = extractProfileInsights(normalized);
  const stations = uniqueMatches((normalized.match(/\b(?:bei|firma|gmbh|ag|kg|inc\.?|ltd\.?)\s+[A-ZÄÖÜ][\wäöüß& .-]{2,60}/g) ?? [])
    .map((value) => value.replace(/^bei\s+/i, '').trim()))
    .filter((value) => !/zeugnis|zertifikat|lebenslauf/i.test(value))
    .slice(0, 10);
  const industries = uniqueMatches([
    ...matchKnownTerms(normalized, ['Automotive', 'Industrie', 'Produktion', 'Dienstleistung', 'Qualitätsmanagement', 'IT', 'Handel', 'Logistik', 'Maschinenbau', 'Metall', 'Kunststoff']),
    ...documents.map((document) => document.fileName).filter((name) => /automotive|industrie|produktion|logistik|quality|qualität/i.test(name)),
  ]).slice(0, 10);
  const leadership = matchKnownTerms(normalized, ['Führung', 'Teamführung', 'Leitung', 'Projektleitung', 'Verantwortung', 'Koordination', 'Head', 'Manager']).slice(0, 10);
  const quality = matchKnownTerms(normalized, ['Qualitätsmanagement', 'Qualitätssicherung', 'QMB', 'VDA 6.3', 'ISO 9001', 'IATF 16949', 'Audit', 'Auditor', '8D', 'FMEA', 'APQP', 'PPAP']).slice(0, 14);
  const tools = matchKnownTerms(normalized, ['SAP', 'Excel', 'Power BI', 'MS Office', 'ERP', 'CAQ', 'Ollama', 'Google Docs']).slice(0, 10);
  const experience = uniqueMatches([
    ...(normalized.match(/\b\d{1,2}\s*(?:Jahre|Jahren)\s+(?:Berufserfahrung|Erfahrung|Praxis)\b/gi) ?? []),
    ...(normalized.match(/\b(?:seit|von)\s+\d{4}\b[^.]{0,80}/gi) ?? []),
    ...(normalized.match(/\b(?:mehrjährige|langjährige)\s+(?:Berufserfahrung|Erfahrung|Praxis)\b/gi) ?? []),
  ]).slice(0, 10);
  const responsibilities = uniqueMatches([
    ...matchKnownTerms(normalized, ['Prozessoptimierung', 'Dokumentation', 'Auditplanung', 'Reklamationsbearbeitung', 'Lieferantenmanagement', 'Kennzahlen', 'KPI', 'Reporting', 'Standardisierung', 'Schulung', 'Schnittstellenkommunikation']),
    ...(normalized.match(/\b(?:verantwortlich für|zuständig für|durchführung von|erstellung von|koordination von)\s+[^.]{8,90}/gi) ?? []),
  ]).slice(0, 12);

  return {
    stations,
    skills: insights.skills ?? [],
    certificates: uniqueMatches([...(insights.education ?? []), ...quality.filter((item) => /vda|iso|iatf|audit|qmb|zertifikat/i.test(item))]).slice(0, 12),
    experience,
    responsibilities,
    industries,
    leadership,
    quality,
    tools,
  };
}

function matchKnownTerms(text, terms) {
  return uniqueMatches(terms.filter((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(text)));
}

function extractProfileEvidence(text, documents = []) {
  const normalized = normalizeText(text);
  const documentEvidence = documents
    .map((document) => [document.fileName, document.type].filter(Boolean).join(' '))
    .flatMap((value) => value.split(/[_-]/))
    .map((value) => value.replace(/\.[a-z0-9]+$/i, '').trim());
  const phrasePatterns = [
    /\bstaatl\.?\s*gepr\.?\s*Betriebswirt\b/gi,
    /\bstaatlich geprüfter Betriebswirt\b/gi,
    /\bQualitätsmanagement(?:beauftragter|beauftragte)?\b/gi,
    /\bQualitätssicherung\b/gi,
    /\bQMB\b/gi,
    /\bVDA\s*6\.3\b/gi,
    /\bISO\s*9001\b/gi,
    /\bISO\s*14001\b/gi,
    /\bIATF\s*16949\b/gi,
    /\bAudit(?:or|s)?\b/gi,
    /\bLean(?: Management)?\b/gi,
    /\bKAIZEN\b/gi,
    /\bKVP\b/gi,
    /\b8D\b/gi,
    /\bFMEA\b/gi,
    /\bAPQP\b/gi,
    /\bPPAP\b/gi,
    /\bSAP\b/gi,
    /\bPower BI\b/gi,
    /\bExcel\b/gi,
    /\bProjektmanagement\b/gi,
    /\bProzessmanagement\b/gi,
    /\bControlling\b/gi,
    /\bFührung\b/gi,
  ];
  const textEvidence = phrasePatterns.flatMap((pattern) => normalized.match(pattern) ?? []);
  const blocked = new Set(['dokument', 'lebenslauf', 'zeugnisse', 'zertifikate', 'pdf', 'anlage']);

  return uniqueMatches([...textEvidence, ...documentEvidence])
    .filter((value) => value.length > 2 && !blocked.has(value.toLowerCase()))
    .slice(0, 24);
}

function uniqueMatches(values) {
  return [...new Set(values.map((value) => normalizeText(String(value)).replace(/[.,;:]$/, '')).filter(Boolean))];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
