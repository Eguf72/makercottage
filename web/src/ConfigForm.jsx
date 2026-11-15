import { useState, useEffect } from 'react';

/**
 * Zugang konfigurieren: Quelle wählen (NAS über SMB oder lokales Verzeichnis),
 * den Dateipfad per Picker durchstöbern statt tippen, plus „NAS finden"
 * (Netzwerk-Suche) und „Shares laden" (echte Shares statt raten).
 * onSave(payload) / onDiscover() / onListShares(data) / onBrowse(data)
 * werden von App bereitgestellt.
 */
// Slicer-Presets (Dropdown) -> App-Name, der an den Startbefehl übergeben wird.
// Der Schlüssel wird in config.slicer gespeichert; der Server löst ihn
// (case-insensitiv) auf die plattformabhängige App-Bezeichnung auf.
const SLICER_PRESETS = [
  ['cura', 'Cura'],
  ['prusaslicer', 'PrusaSlicer'],
  ['bambustudio', 'BambuStudio'],
  ['orcaslicer', 'OrcaSlicer'],
  ['superslicer', 'SuperSlicer'],
];

export default function ConfigForm({ config, onSave, onDiscover, onListShares, onBrowse }) {
  const [form, setForm] = useState({
    source: 'nas',
    host: '',
    share: '',
    user: '',
    pass: '',
    path: '',
    port: 445,
    maxDepth: 0,
  });
  // Standard-Slicer für „🧩 Slicer öffnen": Dropdown (Preset) oder „Eigener …"
  // (Freitext). Der Wert wird in config.slicer gespeichert.
  const [slicer, setSlicer] = useState('');
  const [slicerCustom, setSlicerCustom] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState({ hosts: [], services: [] });
  const [searching, setSearching] = useState(false);
  const [shares, setShares] = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareLoaded, setShareLoaded] = useState(false);

  // Pfad-Picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [pickerData, setPickerData] = useState({ current: '', breadcrumb: [], entries: [] });
  const [showHidden, setShowHidden] = useState(false);

  // Formular mit der aktuellen (öffentlichen) Konfiguration befüllen
  useEffect(() => {
    if (config) {
      setForm((f) => ({
        ...f,
        source: config.source || f.source || 'nas',
        host: config.host || f.host,
        share: config.share || f.share,
        user: config.user || f.user,
        path: config.path ?? f.path,
        port: config.port || f.port,
        maxDepth: config.maxDepth ?? f.maxDepth,
      }));
    }
  }, [config]);

  // Slicer aus config.slicer in Dropdown + Freitext zerlegen.
  // Bekannter Preset (case-insensitiv) -> Dropdown-Wert; sonst „Eigener …"
  // mit dem ursprünglichen (nicht verkleinerten) Wert.
  useEffect(() => {
    if (!config) return;
    const raw = String(config.slicer ?? '').trim().toLowerCase();
    const presetKeys = SLICER_PRESETS.map((p) => p[0]);
    if (raw === '') {
      setSlicer('');
      setSlicerCustom('');
    } else if (presetKeys.includes(raw)) {
      setSlicer(raw);
      setSlicerCustom('');
    } else {
      setSlicer('custom');
      setSlicerCustom(config.slicer ?? '');
    }
  }, [config]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Quelle wechseln: Picker schliessen, damit kein veralteter Inhalt der
  // anderen Quelle angezeigt wird (nächster „🔎" lädt für die neue Quelle neu).
  const setSource = (source) => {
    setForm((f) => ({ ...f, source }));
    setPickerOpen(false);
    setPickerError('');
  };

  const handleSave = async () => {
    setError('');
    setStatus('Speichert …');
    try {
      await onSave({
        source: form.source,
        host: form.host,
        share: form.share,
        user: form.user,
        path: form.path,
        port: Number(form.port) || 445,
        maxDepth: Number(form.maxDepth) || 0,
        slicer: slicer === 'custom' ? slicerCustom.trim() : slicer,
        pass: form.pass || undefined,
      });
      setStatus('Gespeichert ✓');
      setForm((f) => ({ ...f, pass: '' }));
    } catch (e) {
      setError(e.message);
      setStatus('');
    }
  };

  const handleDiscover = async () => {
    setError('');
    setSearching(true);
    setResult({ hosts: [], services: [] });
    setStatus('Suche im Netzwerk … (kann ein paar Sekunden dauern)');
    try {
      const res = await onDiscover();
      const hosts = res.hosts || [];
      const services = res.services || [];
      setResult({ hosts, services });
      const smb = hosts.filter((h) => h.smb === true).length;
      const probed = res.probed ?? 0;
      if (smb > 0) {
        setStatus(
          `${smb} Host(s) mit offenem Port 445 (SMB) gefunden – mögliche NAS. ` +
            `Geprüft: ${probed} Hosts. Klicken, um Host/Port zu übernehmen.`,
        );
      } else if (hosts.length > 0) {
        setStatus(
          `${hosts.length} mDNS-Dienst(e) gefunden (kein offener 445 dabei). ` +
            'Klicken, um Host/Port zu übernehmen.',
        );
      } else {
        setStatus(
          `Kein Gerät mit offenem Port 445 (geprüft: ${probed} Hosts). ` +
            'NAS bitte manuell eintragen (Host/IP + Share + Benutzer/Passwort).',
        );
      }
    } catch (e) {
      setError(e.message);
      setStatus('');
    } finally {
      setSearching(false);
    }
  };

  // Echte Shares des NAS auflisten (Share-Name wählen statt raten).
  const handleListShares = async () => {
    setShareError('');
    setLoadingShares(true);
    setShares([]);
    setShareLoaded(false);
    try {
      const res = await onListShares({
        host: form.host,
        user: form.user,
        pass: form.pass || undefined,
        port: Number(form.port) || 445,
      });
      const list = res.shares || [];
      setShares(list);
      setShareLoaded(true);
      if (list.length > 0) {
        setShareError('');
      } else {
        setShareError(
          `Keine Shares für ${form.host || 'dieses Host'} gefunden. ` +
            'Zugangsdaten/Host prüfen. (Manueller Share-Eintrag bleibt möglich.)',
        );
      }
    } catch (e) {
      setShareError(e.message || 'Shares konnten nicht geladen werden.');
      setShares([]);
      setShareLoaded(true);
    } finally {
      setLoadingShares(false);
    }
  };

  // --- Pfad-Picker -------------------------------------------------------
  const loadPicker = async (path, showHiddenFlag) => {
    // Optionaler Override: beim Umschalten wird der aktuelle Zustand
    // (noch nicht im State) direkt mitgeschickt, sonst der aktuelle State.
    const useHidden = showHiddenFlag === undefined ? showHidden : showHiddenFlag;
    setPickerLoading(true);
    setPickerError('');
    try {
      const res = await onBrowse({
        source: form.source,
        path: path || '',
        showHidden: useHidden,
        host: form.host,
        user: form.user,
        pass: form.pass || undefined,
        share: form.share,
        port: Number(form.port) || 445,
      });
      setPickerData({
        current: res.current || '',
        breadcrumb: res.breadcrumb || [],
        entries: res.entries || [],
      });
    } catch (e) {
      setPickerError(e.message || 'Pfad konnte nicht geladen werden.');
      setPickerData((d) => ({ ...d, current: path || '', entries: [] }));
    } finally {
      setPickerLoading(false);
    }
  };

  const openPicker = () => {
    setPickerOpen(true);
    loadPicker(form.path || '');
  };

  // „Versteckte anzeigen" umschalten und den aktuellen Ort sofort neu laden.
  const toggleHidden = () => {
    const next = !showHidden;
    setShowHidden(next);
    loadPicker(pickerData.current, next);
  };

  const selectPath = () => {
    setForm((f) => ({ ...f, path: pickerData.current }));
    setPickerOpen(false);
    setPickerError('');
  };

  return (
    <div className="card config">
      <h2>Dateizugang</h2>

      {/* Quelle: NAS (SMB) oder lokales Verzeichnis */}
      <div className="row source-row">
        <label className="radio">
          <input
            type="radio"
            name="source"
            checked={form.source === 'nas'}
            onChange={() => setSource('nas')}
          />
          NAS (SMB)
        </label>
        <label className="radio">
          <input
            type="radio"
            name="source"
            checked={form.source === 'local'}
            onChange={() => setSource('local')}
          />
          Lokales Verzeichnis
        </label>
      </div>

      {form.source === 'nas' ? (
        <div className="grid">
          <label>Host / IP
            <input value={form.host} onChange={set('host')} placeholder="192.168.1.10" />
          </label>
          <label>Share
            <input value={form.share} onChange={set('share')} placeholder="3D-Print" />
          </label>
          <label>Benutzer
            <input value={form.user} onChange={set('user')} placeholder="admin" />
          </label>
          <label>Passwort
            <input
              type="password"
              value={form.pass}
              onChange={set('pass')}
              placeholder={config?.hasPassword ? '•••• (bereits gespeichert)' : 'leer'}
            />
          </label>
          <label>Port
            <input type="number" value={form.port} onChange={set('port')} />
          </label>
          <label>Such-Tiefe (0 = flach)
            <input type="number" value={form.maxDepth} onChange={set('maxDepth')} />
          </label>
        </div>
      ) : (
        <p className="status">
          Lokale Dateien auf dem Server-Rechner – kein NAS nötig. Der Pfad ist absolut
          (z. B. <code>/Users/du/Dokumente/3D-Projekte</code>).
        </p>
      )}

      {/* Pfad: tippen oder per Picker wählen */}
      <div className="field-block">
        <label>
          {form.source === 'local' ? 'Pfad (lokal, absolut)' : 'Pfad im Share'}
          <div className="input-row">
            <input
              value={form.path}
              onChange={set('path')}
              placeholder={form.source === 'local' ? '/Users/du/Dokumente/3D-Projekte' : '/ (Share-Root)'}
            />
            <button type="button" className="browse" onClick={openPicker} title="Pfad durchsuchen">
              🔎
            </button>
          </div>
        </label>

        {pickerOpen && (
          <div className="picker">
            <div className="picker-head">
              <div className="breadcrumb">
                {pickerData.breadcrumb.length === 0 && <span className="muted">…</span>}
                {pickerData.breadcrumb.map((b, i) => (
                  <span key={b.value + i} className="crumb">
                    <button
                      type="button"
                      className="crumb-link"
                      onClick={() => loadPicker(b.value)}
                      disabled={pickerLoading}
                      title={b.value}
                    >
                      {b.label}
                    </button>
                    {i < pickerData.breadcrumb.length - 1 && <span className="crumb-sep">/</span>}
                  </span>
                ))}
              </div>
              <button type="button" className="primary" onClick={selectPath} disabled={pickerLoading}>
                ✓ Diesen Pfad wählen
              </button>
            </div>

            <div className="picker-toggle">
              <label className="check">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={toggleHidden}
                  disabled={pickerLoading}
                />
                Versteckte anzeigen
              </label>
            </div>

            <p className="status">
              Aktueller Ort: <code>{pickerData.current || (form.source === 'local' ? 'Home-Verzeichnis' : 'Share-Root')}</code>
            </p>

            {pickerLoading && <p className="status">Lädt …</p>}
            {pickerError && <p className="error">⚠ {pickerError}</p>}

            {!pickerLoading && !pickerError &&
              (pickerData.entries.length === 0 ? (
                <p className="status">Keine Unterverzeichnisse.</p>
              ) : (
                <ul className="found">
                  {pickerData.entries.map((e) => (
                    <li
                      key={e.path}
                      onClick={() => loadPicker(e.path)}
                      title={e.path}
                    >
                      📁 <strong>{e.name}</strong>
                      <span className="muted"> · {e.path}</span>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}
      </div>

      {/* Standard-Slicer: beim „🧩 Slicer öffnen" im Detail verwendet */}
      <div className="field-block">
        <label>
          🧩 Standard-Slicer
          <select value={slicer} onChange={(e) => setSlicer(e.target.value)}>
            <option value="">— nicht gesetzt —</option>
            {SLICER_PRESETS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="custom">Eigener …</option>
          </select>
        </label>

        {slicer === 'custom' && (
          <label>
            Slicer-Name / Pfad
            <input
              value={slicerCustom}
              onChange={(e) => setSlicerCustom(e.target.value)}
              placeholder="z. B. Cura, PrusaSlicer, OrcaSlicer …"
            />
          </label>
        )}

        <p className="status">
          Wird beim Button „🧩 Slicer öffnen" im Detail verwendet (nur bei lokaler
          Quelle). Leer = kein Slicer, dann zeigt der Button einen Hinweis.
        </p>
      </div>

      <div className="row">
        <button className="primary" onClick={handleSave}>
          Speichern
        </button>
        {form.source === 'nas' && (
          <>
            <button onClick={handleDiscover} disabled={searching}>
              {searching ? 'Sucht …' : '🔎 NAS finden'}
            </button>
            <button
              onClick={handleListShares}
              disabled={loadingShares || !form.host}
              title="Echte Shares des NAS auflisten (Share-Namen wählen statt raten)"
            >
              {loadingShares ? 'Lädt Shares …' : '🔄 Shares laden'}
            </button>
          </>
        )}
      </div>

      {searching && <p className="status">🔎 Suche läuft … (Subnetz-Scan + mDNS)</p>}
      {!searching && status && <p className="status">{status}</p>}
      {error && <p className="error">⚠ {error}</p>}

      {form.source === 'nas' && result.hosts.length > 0 && (
        <ul className="found">
          {result.hosts.map((h, i) => (
            <li
              key={h.ip + '-' + i}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  host: h.ip,
                  port: h.smb === true ? 445 : Number(h.port) || 445,
                }))
              }
              title="Klicken, um Host/Port in das Formular zu übernehmen"
              className={h.smb === true ? 'smb' : ''}
            >
              <strong>{h.hostname || h.ip}</strong>
              <span className="muted"> {h.ip}</span>
              {h.smb === true && <span className="badge smb">SMB 445</span>}
              {h.smb === false && <span className="muted">kein 445</span>}
              {h.smb === null && <span className="muted">mDNS</span>}
              {h.type && <span className="type"> {h.type}</span>}
              {h.mac && <span className="muted"> {h.mac}</span>}
            </li>
          ))}
        </ul>
      )}

      {form.source === 'nas' && shares.length > 0 && (
        <>
          <p className="status">
            {shares.length} Share(s) von {form.host || 'NAS'} – klicken, um den
            Share-Namen zu übernehmen.
          </p>
          <ul className="found">
            {shares.map((s) => (
              <li
                key={s.name}
                onClick={() => setForm((f) => ({ ...f, share: s.name }))}
                title="Klicken, um den Share-Namen ins Formular zu übernehmen"
                className={form.share === s.name ? 'smb' : ''}
              >
                <strong>{s.name}</strong>
                {s.comment && <span className="muted"> · {s.comment}</span>}
                {form.share === s.name && <span className="badge smb">✓ aktiv</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {loadingShares && <p className="status">🔄 Lade Shares … (Host {form.host})</p>}
      {shareLoaded && !loadingShares && shareError && (
        <p className="error">⚠ {shareError}</p>
      )}
    </div>
  );
}
