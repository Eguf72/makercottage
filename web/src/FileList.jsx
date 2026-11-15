import { useState, useEffect } from 'react';
import { api } from './api.js';
import FileDetail from './FileDetail.jsx';
import Overview from './Overview.jsx';

/**
 * Tabelle mit Filter und Suche + Detail-Panel (seits zu Seite).
 * `onQuery(params)` löst ein Laden aus; `refreshKey` erzwingt ein Neuladen.
 * Das Detail-Panel (`FileDetail`) wird rechts inline eingeblendet,
 * sobald eine Datei per Klick ausgewählt wird.
 */
// Wie viele Zeichen der Name in der Liste zeigt; längerer Text wird
// mit „…" gekürzt, der volle Name bleibt im Tooltip (title) beim Hover.
const MAX_NAME_LEN = 30;

export default function FileList({ types = [], refreshKey = 0 }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [data, setData] = useState({ files: [], count: 0, total: 0 });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);

  const load = (params = {}) => {
    setLoading(true);
    setError('');
    api.getFiles(params)
      .then((res) => {
        setData(res);
        setStatus(`${res.count} von ${res.total} Dateien`);
      })
      .catch((e) => {
        setError(e.message);
        setData({ files: [], count: 0, total: 0 });
      })
      .finally(() => setLoading(false));
  };

  // Erstes Laden + Neuladen, wenn sich die Konfiguration ändert
  useEffect(() => {
    load({ q, type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const apply = () => load({ q, type });

  return (
    <div className="filelist">
      <div className="controls">
        <input
          type="search"
          placeholder="Suche nach Name …"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">Alle Typen</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button onClick={apply}>Anwenden</button>
      </div>

      <p className="status">{status}</p>
      {error && <p className="error">⚠ {error}</p>}

      {loading ? (
        <p className="loading">Lädt …</p>
      ) : data.files.length === 0 ? (
        <p className="empty">Keine Dateien gefunden.</p>
      ) : (
        <div className="filelist-body" onClick={(e) => {
          // Nur echten "Hintergrund"-Klick behandeln:
          // Klick auf einer Zeile (tr) oder innerhalb des Detail-Panels
          // darf die Auswahl nicht aufheben.
          const clickedTr = e.target.closest('tr');
          const clickedDetail = e.target.closest('.filelist-detail');
          if (!clickedTr && !clickedDetail) {
            setCurrentFile(null);
          }
        }}>
          {/* Links: Dateitabelle */}
          <div className="filelist-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                {data.files.map((f, i) => {
                  // Angezeigter Name: Druckname, falls gesetzt, sonst Dateiname.
                  const full = f.print_name || f.name;
                  // Auf maximal 30 Zeichen kürzen (29 + Ellipsis); voller Name
                  // bleibt im Tooltip erreichbar.
                  const shown =
                    full.length > MAX_NAME_LEN
                      ? `${full.slice(0, MAX_NAME_LEN - 1)}…`
                      : full;
                  return (
                    <tr key={`${f.path}-${i}`} onClick={() => setCurrentFile(f)}>
                      <td>
                        {f.isDirectory ? '📁 ' : ''}
                        <span title={full}>{shown}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rechts: Datei-Details (inline) – ohne Auswahl die Übersicht */}
          <div className="filelist-detail">
            {currentFile ? (
              <FileDetail
                file={currentFile}
                inline
                onSaved={() => load({ q, type })}
              />
            ) : (
              <Overview />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
