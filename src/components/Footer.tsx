import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const githubUrl = 'https://github.com/Schello805/bewerbungsassistent';

export function Footer() {
  const [status, setStatus] = useState('Update prüfen');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    checkUpdate(false);
  }, []);

  async function checkUpdate(showStatus = true) {
    if (showStatus) setStatus('Prüfe Update ...');
    try {
      const response = await fetch('/api/update-status');
      const data = await response.json() as { updateAvailable?: boolean; behind?: number; error?: string };
      setUpdateAvailable(Boolean(data.updateAvailable));
      setStatus(data.updateAvailable ? `Update verfügbar (${data.behind})` : 'Aktuell');
    } catch {
      if (showStatus) setStatus('Updateprüfung nicht möglich');
    }
  }

  async function runUpdate() {
    setIsUpdating(true);
    setStatus('Update läuft ...');
    try {
      const response = await fetch('/api/update', { method: 'POST' });
      const data = await response.json() as { message?: string; error?: string; updated?: boolean };
      if (!response.ok) throw new Error(data.error || 'Update fehlgeschlagen.');
      setStatus(data.message || 'Update abgeschlossen.');
      if (data.updated) {
        window.setTimeout(() => window.location.reload(), 4000);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Update fehlgeschlagen.');
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <footer className="app-footer">
      <div>
        <strong>Bewerbungsassistent</strong>
        <p>
          Open Source von Michael Schellenberger · Rev. {__APP_REVISION__} · v{__APP_VERSION__}
        </p>
      </div>
      <nav aria-label="Rechtliche Links">
        <button type="button" className={updateAvailable ? 'footer-update has-update' : 'footer-update'} onClick={updateAvailable ? runUpdate : () => checkUpdate(true)} disabled={isUpdating}>
          <RefreshCw size={15} /> {isUpdating ? 'Update läuft ...' : status}
        </button>
        <a href="/datenschutz">Datenschutz</a>
        <a href={githubUrl} target="_blank" rel="noreferrer" className="github-link">
          <GithubIcon /> GitHub
        </a>
      </nav>
    </footer>
  );
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" role="img">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.38-3.37-1.38-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.33 9.33 0 0 1 12 6.98c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.07.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.1 10.1 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
}
