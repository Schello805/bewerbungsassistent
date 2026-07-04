import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const githubUrl = 'https://github.com/Schello805/bewerbungsassistent';

export function Footer() {
  const [status, setStatus] = useState('Update prüfen');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [maintenanceVisible, setMaintenanceVisible] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('Update wird installiert ...');
  const reconnectStarted = useRef(false);

  const waitForRestart = useCallback(() => {
    if (reconnectStarted.current) return;
    reconnectStarted.current = true;

    window.setTimeout(() => {
      const poll = async () => {
        try {
          const response = await fetch('/api/health', { cache: 'no-store' });
          if (response.ok) {
            setMaintenanceMessage('Dienst ist wieder erreichbar. Seite wird neu geladen ...');
            window.setTimeout(() => window.location.reload(), 700);
            return;
          }
        } catch {
          setMaintenanceMessage('Update läuft noch. Ich verbinde automatisch neu ...');
        }
        window.setTimeout(poll, 1600);
      };

      poll();
    }, 2800);
  }, []);

  const checkUpdate = useCallback(async (showStatus = true) => {
    if (showStatus) setStatus('Prüfe Update ...');
    try {
      const response = await fetch('/api/update-status');
      const data = await response.json() as { updateAvailable?: boolean; behind?: number; updating?: boolean; error?: string };
      if (data.updating) {
        setStatus('Update läuft ...');
        setMaintenanceVisible(true);
        setMaintenanceMessage('Update läuft bereits. Ich warte, bis der Dienst wieder erreichbar ist ...');
        waitForRestart();
        return;
      }
      setUpdateAvailable(Boolean(data.updateAvailable));
      setStatus(data.updateAvailable ? `Update verfügbar (${data.behind})` : 'Aktuell');
    } catch {
      if (showStatus) setStatus('Updateprüfung nicht möglich');
    }
  }, [waitForRestart]);

  useEffect(() => {
    checkUpdate(false);
  }, [checkUpdate]);

  async function runUpdate() {
    setIsUpdating(true);
    setStatus('Update läuft ...');
    setMaintenanceVisible(true);
    setMaintenanceMessage('Update wird vorbereitet. Bitte diese Seite offen lassen ...');
    try {
      const response = await fetch('/api/update', { method: 'POST' });
      const data = await response.json() as { message?: string; error?: string; updated?: boolean };
      if (!response.ok) throw new Error(data.error || 'Update fehlgeschlagen.');
      setStatus(data.message || 'Update abgeschlossen.');
      if (data.updated) {
        setMaintenanceMessage('Update wird installiert. Der Dienst startet gleich neu ...');
        waitForRestart();
      } else {
        setMaintenanceVisible(false);
        reconnectStarted.current = false;
      }
    } catch (error) {
      if (error instanceof TypeError) {
        setMaintenanceMessage('Verbindung wurde während des Updates unterbrochen. Ich verbinde automatisch neu ...');
        waitForRestart();
      } else {
        setMaintenanceVisible(false);
        reconnectStarted.current = false;
        setStatus(error instanceof Error ? error.message : 'Update fehlgeschlagen.');
      }
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <>
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

      {maintenanceVisible ? (
        <div className="update-maintenance-backdrop" role="status" aria-live="polite">
          <div className="update-maintenance-card">
            <div className="update-maintenance-spinner" aria-hidden="true" />
            <p className="eyebrow">Update läuft</p>
            <h2>Die App wird gerade aktualisiert</h2>
            <p>{maintenanceMessage}</p>
            <small>Bitte diese Seite offen lassen. Sie lädt automatisch neu, sobald alles fertig ist.</small>
          </div>
        </div>
      ) : null}
    </>
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
