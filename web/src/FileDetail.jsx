import { useState, useEffect } from 'react';
import { api } from './api.js';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// Datum aus ISO-String (Live-Scan) oder Unix-Stamp (DB) formatieren.
// Die DB kann – je nach Schreibweg – Sekunden ODER Millisekunden enthalten;
// die Heuristik (>1e12 => ms) fängt beides ab, ohne falsche Epochen zu zeigen.
function formatDate(value) {
  if (value === 0 || value === null || value === undefined) return '–';
  let ms;
  if (typeof value === 'number') {
    ms = value > 1e12 ? value : value * 1000;
  } else {
    ms = new Date(value).getTime();
  }
  if (Number.isNaN(ms)) return '–';
  return new Date(ms).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// Minuten → „3 h 12 Min" (zur Anzeige der Druckzeit).
function formatDuration(min) {
  const m = Number(min);
  if (!m) return '–';
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  if (h <= 0) return `${rest} Min`;
  return rest ? `${h} h ${rest} Min` : `${h} h`;
}

// Häufige Filamente als Vorschlag (Freitext bleibt möglich).
const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'PC', 'Nylon', 'PET'];

// Filamente aus dem DB-Feld (JSON-String/Array) in eine Editierliste umwandeln.
// Immer mind. eine (leere) Zeile zum Eingeben; leere Zeilen werden verworfen.
function parseFilaments(raw) {
  let arr = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) arr = [];
  const clean = arr
    .map((x) => ({
      material: String(x?.material ?? ''),
      grams: x?.grams != null && x?.grams !== '' ? String(x.grams) : '',
    }))
    .filter((x) => x.material !== '' || x.grams !== '');
  return clean.length ? clean : [{ material: '', grams: '' }];
}

/**
 * Detail-Ansicht einer Datei in zwei Tabs:
 *  - „Druck"     : Druckzeit, Kosten, Filamente, Nozzle, Platten, Notizen
 *                  (editierbar, pro Datei gespeichert)
 *  - „Metadaten" : Endung, Größe, Datum, Pfad, DB-ID (nur Anzeigen)
 * Die Daten kommen aus der DB (falls vorhanden), sonst aus dem Live-Scan.
 * `onSaved` lädt die Liste neu; `onClose` schließt (nur im Modal-Modus).
 *
 * `inline`: Wenn wahr, wird das Panel ohne Overlay/Dialog-Wrapper gerendert
 * (z. B. seits zu Seite neben der Dateiliste). Im inline-Modus fehlen die
 * Buttons „Abbrechen"/„Schließen" – man wählt einfach eine andere Datei.
 */
export default function FileDetail({ file, onClose, onSaved, inline = false }) {
  const [rec, setRecord] = useState(null); // DB-Eintrag (falls vorhanden)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('print'); // 'print' | 'meta'

  // Druck-Felder (editierbar, pro Datei gespeichert).
  const [print, setPrint] = useState({
    name: '', // Druckname – kann vom Dateinamen abweichen
    time: '',
    cost: '',
    filaments: [{ material: '', grams: '' }], // mehrere Filamente, je Material + Menge
    nozzle: '',
    plates: '',
    notes: '',
  });
  const [savingPrint, setSavingPrint] = useState(false);
  const [printSaved, setPrintSaved] = useState(false);
  const [pricePerKg, setPricePerKg] = useState(0);

  // Datei im nativen Dateimanager (Finder/Explorer/Filen) öffnen. Der
  // Hinweis wird kurz eingeblendet und dann automatisch entfernt.
  const [revealing, setRevealing] = useState(false);
  const [revealMsg, setRevealMsg] = useState('');
  // Slicer-Öffnen (App-name oder konfigurierter Slicer). Der Hinweis wird
  // kurz eingeblendet und dann automatisch entfernt.
  const [slicing, setSlicing] = useState(false);
  const [slicerMsg, setSlicerMsg] = useState('');
  const openInSlicer = async (v) => {
    setSlicing(true);
    setSlicerMsg('Öffne Slicer …');
    try {
      const res = await api.openInSlicer(file.name, v.path || file.path);
      setSlicerMsg(
        res.ok
          ? `Slicer geöffnet: ${res.message || ''}`.trim() || 'Slicer gestartet'
          : res.local === false
            ? res.message || 'Im Slicer öffnen nicht möglich (NAS)'
            : 'Fehler: ' + (res.detail || res.error || 'Unbekannter Fehler'),
      );
    } catch (e) {
      setSlicerMsg('Fehler: ' + e.message);
    }
    setTimeout(() => setSlicerMsg(''), 4000);
    setSlicing(false);
  };

  // Datei im nativen Dateimanager (Finder/Explorer/Filen) öffnen.
  const reveal = async (v) => {
    setRevealing(true);
    setRevealMsg('Öffne …');
    try {
      const res = await api.revealFile(file.name, v.path || file.path);
      setRevealMsg(
        res.local && res.revealed
          ? `Geöffnet in: ${res.path}`
          : res.message || 'Im Ordner öffnen nicht verfügbar',
      );
    } catch (e) {
      setRevealMsg('Fehler: ' + e.message);
    }
    setRevealing(false);
    setTimeout(() => setRevealMsg(''), 4000);
  };

  const setP = (k, v) => setPrint((p) => ({ ...p, [k]: v }));

  // Einzelnes Filament-Feld ändern (Material oder Menge je Zeile).
  const setF = (i, key, v) =>
    setPrint((p) => ({
      ...p,
      filaments: p.filaments.map((f, idx) => (idx === i ? { ...f, [key]: v } : f)),
    }));
  // Neue leere Filament-Zeile anhängen.
  const addFilament = () =>
    setPrint((p) => ({ ...p, filaments: [...p.filaments, { material: '', grams: '' }] }));
  // Filament-Zeile entfernen (mindestens eine Zeile bleibt).
  const removeFilament = (i) =>
    setPrint((p) => ({
      ...p,
      filaments:
        p.filaments.length <= 1
          ? [{ material: '', grams: '' }]
          : p.filaments.filter((_, idx) => idx !== i),
    }));

  // Beim Öffnen den vollen DB-Eintrag (Druckdaten) nachladen.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPrintSaved(false);
    setTab('print');
    api
      .getDbFile(file.name)
      .then((res) => {
        if (!alive) return;
        const f = res.file || null;
        setRecord(f);
        setPricePerKg(Number(res.pricePerKg) || 0);
        setPrint({
          name: f?.print_name || file.name,
          time: f?.print_time_min != null ? String(f.print_time_min) : '',
          cost: f?.print_cost != null ? String(f.print_cost) : '',
          filaments: parseFilaments(f?.filaments),
          nozzle: f?.nozzle_size || '',
          plates: f?.print_plates != null ? String(f.print_plates) : '',
          notes: f?.print_notes || '',
        });
      })
      .catch(() => {
        if (!alive) return;
        setRecord(null); // Datei noch nicht in der DB – beim Speichern wird sie angelegt
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [file.name]);

  // ESC schließt das Fenster – aber nicht, gerade während etwas gespeichert wird.
  // (Nur im Modal-Modus; im inline-Modus gibt es nichts zu schließen.)
  useEffect(() => {
    if (inline) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !savingPrint) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inline, savingPrint, onClose]);

  const handleSavePrint = async () => {
    setSavingPrint(true);
    setError('');
    setPrintSaved(false);
    try {
      await api.updateFilePrint(file.name, {
        print_name: print.name.trim(),
        print_time_min: print.time === '' ? null : Number(String(print.time).replace(',', '.')),
        print_cost: print.cost === '' ? null : Number(String(print.cost).replace(',', '.')),
        filaments: print.filaments,
        nozzle_size: print.nozzle.trim(),
        print_plates: print.plates === '' ? null : Number(String(print.plates).replace(',', '.')),
        print_notes: print.notes.trim(),
      });
      const res = await api.getDbFile(file.name).catch(() => null);
      if (res && res.file) setRecord(res.file);
      setPrintSaved(true);
      setTimeout(() => {
        if (onSaved) onSaved();
        if (!inline && onClose) onClose();
      }, 600);
    } catch (e) {
      setError('Fehler beim Speichern: ' + e.message);
      setSavingPrint(false);
    }
  };

  // Anzeigedaten: DB-Eintrag ist die Wahrheit, sonst der Live-Scan als Basis.
  const view = rec || file;
  const dateVal = view.last_modified || file.modified || 0;
  const ext =
    view.extension || String(file.name).split('.').pop().toLowerCase() || 'no-ext';

  // Automatische Kostenschätzung aus der Gesamt-Filamentmenge × Referenzpreis.
  const totalGrams = print.filaments.reduce((sum, f) => {
    const g = Number((f.grams || '').replace(',', '.'));
    return sum + (g > 0 ? g : 0);
  }, 0);
  const estCost = totalGrams > 0 && pricePerKg > 0 ? (totalGrams / 1000) * pricePerKg : 0;

  // Gemeinsamer Inhalt: Tab-Umschalter + Body + Footer.
  // Als JSX-Variable (nicht als verschachtelte Komponente) gehalten, damit
  // bei jedem Render kein neuer Typ entsteht – sonst würde das Subtree neu
  // mounten und der Tippfokus in den Eingabefeldern verloren gehen.
  const body = (
    <>
      {/* Tab-Umschalter: Druck · Metadaten */}
      <div className="detail-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'print'}
          className={tab === 'print' ? 'active' : ''}
          onClick={() => setTab('print')}
        >
          Druck
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'meta'}
          className={tab === 'meta' ? 'active' : ''}
          onClick={() => setTab('meta')}
        >
          Metadaten
        </button>
      </div>

      <div className="dialog-body">
        {loading ? (
          <p className="loading">Lade Metadaten …</p>
        ) : tab === 'print' ? (
          /* ---------------- Tab 1: Druck-Informationen ---------------- */
          <>
            <div className="print-grid">
              <label>
                Druckname
                <input
                  value={print.name}
                  onChange={(e) => setP('name', e.target.value)}
                  placeholder="Leer lassen = Dateiname"
                />
              </label>

              <label>
                Druckzeit (Min)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={print.time}
                  onChange={(e) => setP('time', e.target.value)}
                  placeholder="z. B. 185"
                />
                {print.time && (
                  <span className="muted">{formatDuration(print.time)}</span>
                )}
              </label>

              <label>
                Druckkosten (€)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={print.cost}
                  onChange={(e) => setP('cost', e.target.value)}
                  placeholder="z. B. 0.49"
                />
                {estCost > 0 && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setP('cost', estCost.toFixed(3))}
                    title="Schätzwert übernehmen"
                  >
                    ≈ {estCost.toFixed(3)} € übernehmen
                  </button>
                )}
              </label>

              <label>
                Benötigte Filamente
                {print.filaments.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      list="mc-materials"
                      value={f.material}
                      onChange={(e) => setF(i, 'material', e.target.value)}
                      placeholder="PLA/PETG/ABS..."
                      style={{ flex: 1 }}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={f.grams || ''}
                      onChange={(e) => setF(i, 'grams', e.target.value)}
                      placeholder="g"
                      style={{ width: 40 }}
                    />
                    {print.filaments.length > 1 && (
                      <button
                        type="button"
                        className="link"
                        style={{ marginLeft: '0.5rem' }}
                        onClick={() => removeFilament(i)}
                      >
                        entfernen
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="link"
                  style={{ marginTop: '0.5rem' }}
                  onClick={addFilament}
                >
                  Filament hinzufügen
                </button>
              </label>

              <label>
                Nozzle-Größe
                <input
                  value={print.nozzle}
                  onChange={(e) => setP('nozzle', e.target.value)}
                  placeholder="z. B. 0,4"
                />
              </label>

              <label>
                Anzahl der gebrauchten Druckplatten
                <input
                  type="number"
                  min="0"
                  value={print.plates}
                  onChange={(e) => setP('plates', e.target.value)}
                  placeholder="z. B. 1"
                />
              </label>

              <label>
                Bemerkung
                <textarea
                  rows={3}
                  value={print.notes}
                  onChange={(e) => setP('notes', e.target.value)}
                  placeholder="Probleme, Einstellungen, Nachbearbeitung …"
                />
              </label>

              {/* Vorschläge für Material-Auswahl */}
              <datalist id="mc-materials">
                {MATERIALS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </>
        ) : (
          /* ---------------- Tab 2: Metadaten (nur Anzeigen) ---------------- */
          <>
            <div className="detail-row">
              <strong>Endung</strong>
              <span>{ext}</span>
            </div>
            <div className="detail-row">
              <strong>Größe</strong>
              <span>
                {formatSize(view.size ?? file.size)}{' '}
                <span className="muted">({Number(view.size ?? file.size) || 0} B)</span>
              </span>
            </div>
            <div className="detail-row">
              <strong>Letzte Änderung</strong>
              <span>{formatDate(dateVal)}</span>
            </div>
            {view.created_at != null && (
              <div className="detail-row">
                <strong>Erstellt</strong>
                <span>{formatDate(view.created_at)}</span>
              </div>
            )}
            <div className="detail-row">
              <strong>Pfad</strong>
              <span className="path">{view.path || file.path || '/'}</span>
            </div>
            <div className="detail-row">
              <strong>Im Ordner</strong>
              <button
                type="button"
                className="reveal-btn reveal-btn-lg"
                title="Datei im Dateimanager (Finder/Explorer/Filen) hervorheben"
                onClick={() => reveal(view)}
                disabled={revealing}
              >
                {revealing ? 'Öffne …' : '📂 Im Ordner öffnen'}
              </button>
            </div>
            {view.id != null && (
              <div className="detail-row muted">
                <strong>DB-ID</strong>
                <span>{view.id}</span>
              </div>
            )}
          </>
        )}

        {error && <p className="error">⚠ {error}</p>}
        {printSaved && <p className="ok">✓ Druckdaten gespeichert</p>}
        {revealMsg && <p className="status reveal-msg">ℹ {revealMsg}</p>}
        {slicerMsg && <p className="status slicer-msg">ℹ {slicerMsg}</p>}
      </div>

      <div className="dialog-footer">
        {tab === 'print' ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={handleSavePrint}
              disabled={savingPrint || loading}
            >
              {savingPrint ? 'Speichern …' : 'Druckdaten speichern'}
            </button>
            <button
              type="button"
              className="link"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => openInSlicer(view)}
              disabled={slicing || savingPrint || loading}
              title="Datei im Slicer öffnen"
            >
              🧩 Slicer öffnen
            </button>
            {!inline && (
              <button
                type="button"
                className="secondary"
                onClick={onClose}
                disabled={savingPrint}
              >
                Abbrechen
              </button>
            )}
          </>
        ) : (
          !inline && (
            <button type="button" className="secondary" onClick={onClose}>
              Schließen
            </button>
          )
        )}
      </div>
    </>
  );

  // Modal-Modus: volles Overlay-Dialog-Fenster.
  if (!inline) {
    return (
      <div
        className="dialog-overlay"
        onClick={(e) => {
          // Nur beim Klick auf den Hintergrund (nicht auf die Karte) schließen.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="dialog-card" role="dialog" aria-modal="true">
          <div className="dialog-header">
            <span className="dialog-title">Datei</span>
            <button
              type="button"
              className="dialog-close"
              aria-label="Schließen"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
          {body}
        </div>
      </div>
    );
  }

  // Inline-Modus: nur die Karte (ohne Overlay/Header).
  return (
    <div className="file-detail-inline" role="region" aria-label="Datei-Details">
      {body}
    </div>
  );
}
