import { useEffect, useState } from 'react';
import { api } from './api.js';
import { VERSION } from './version.js';
import FileList from './FileList.jsx';
import ConfigForm from './ConfigForm.jsx';

export default function App() {
  const [config, setConfig] = useState(null);
  const [types, setTypes] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState('files');
  const [serverVersion, setServerVersion] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
    api.getTypes().then((r) => setTypes(r.types || [])).catch(() => {});
    // Server-Version nachladen für den Footer-Skew-Vergleich (stiller Fallback,
    // falls das Backend nicht antwortet).
    api
      .getVersion()
      .then((r) => r && setServerVersion(r.version))
      .catch(() => {});
    // Remote-Update-Check (P2b): serverseitiger GitHub-Releases-Vergleich.
    // Stiller Fallback – zeigt nur bei verfügbarer neuer Version etwas;
    // bei nicht-konfiguriertem/fehlgeschlagenem Check bleibt der Footer leise.
    api
      .getUpdateCheck()
      .then((r) => r && setUpdateInfo(r))
      .catch(() => {});
  }, []);

  // Skew: Server-Version liegt vor und weicht von der eingebauten UI-Version ab
  // -> Code- und Daten-Ordner sind nicht synchron (z. B. nur UI neu entpackt).
  const versionSkew = Boolean(serverVersion) && serverVersion !== VERSION;

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="/" aria-label="MakerCottage">
          <img
            className="brand-logo"
            src="/MakerCottage_logo.svg"
            alt="MakerCottage"
            width="220"
            height="123"
          />
        </a>
      </header>

      <nav className="tabs" aria-label="Hauptnavigation">
        <button
          type="button"
          className={tab === 'files' ? 'active' : ''}
          onClick={() => setTab('files')}
          aria-current={tab === 'files' ? 'page' : undefined}
        >
          Dateien
        </button>
        <button
          type="button"
          className={tab === 'settings' ? 'active' : ''}
          onClick={() => setTab('settings')}
          aria-current={tab === 'settings' ? 'page' : undefined}
        >
          Einstellungen
        </button>
      </nav>

      <main>
        {tab === 'files' ? (
          <section className="card">
            <FileList types={types} refreshKey={refreshKey} />
          </section>
        ) : (
          <ConfigForm
            config={config}
            onSave={async (payload) => {
              const updated = await api.saveConfig(payload);
              setConfig(updated);
              setRefreshKey((k) => k + 1);
            }}
            onDiscover={async () => api.discover(3000)}
            onListShares={async (data) => api.listShares(data)}
            onBrowse={async (data) => api.browse(data)}
          />
        )}
      </main>

      <footer className="footer">
        <div>
          MakerCottage · UI v{VERSION}
          {serverVersion && <span className="muted"> · Server v{serverVersion}</span>}
        </div>
        {versionSkew && (
          <div
            className="footer-skew"
            title="Server- und UI-Version weichen ab – bitte den Code-Ordner neu entpacken. Die Daten bleiben in ~/.makercottage/ (außerhalb des Code-Ordners)."
          >
            ⚠ Server v{serverVersion} ≠ UI v{VERSION} – bitte neu entpacken
          </div>
        )}
        {updateInfo?.available && (
          <a
            className="footer-update"
            href={updateInfo.downloadUrl || updateInfo.releaseUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            title={
              updateInfo.notes ||
              `Update v${updateInfo.latest}${updateInfo.releaseTitle ? ' (' + updateInfo.releaseTitle + ')' : ''}`
            }
          >
            ⚠ Update verfügbar v{updateInfo.latest} · Herunterladen
          </a>
        )}
        <div className="footer-credit">created by Eguf72</div>
      </footer>
    </div>
  );
}
