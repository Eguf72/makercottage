import { useState, useEffect } from 'react';
import { api } from './api.js';

// Datum aus Unix-Stamp (DB) formatieren. Die DB speichert Sekunden; die
// Heuristik (>1e12 => ms) fängt beides ab, ohne falsche Epochen zu zeigen.
// Gleiche Logik wie in FileDetail.jsx (klein, lokal dupliziert).
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

// Farbpalette für das Donut – passt zum Olive/Stil des restlichen UIs.
// Zuerst der Akzent (Orange), dann gedeckte Töne.
const PALETTE = [
  '#e8833a', // accent
  '#43d17a', // ok / grün
  '#6fa8dc', // blau
  '#d4a017', // gold
  '#c77dff', // lila
  '#5fd0c5', // türkis
  '#f2708f', // rosa
  '#b7b7b7', // grau
];

// Donut-Geometrie: Radius und Ringbreite im 120×120-ViewBox.
const R = 42;
const CIRC = 2 * Math.PI * R;

/**
 * Übersicht für die rechte Spalte (Standard-Ansicht, wenn keine Datei gewählt
 * ist): Donut-Diagramm der Verteilung nach Endung + Liste der zuletzt
 * hinzugefügten Dateien. Die Daten kommen aus /api/db/overview.
 */
export default function Overview() {
  const [data, setData] = useState({ total: 0, byType: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getOverview()
      .then((res) => {
        if (!alive) return;
        setData({
          total: res.total || 0,
          byType: res.byType || [],
          recent: res.recent || [],
        });
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Donut-Segmente: kumulative offset-Rechnung über den Kreisumfang.
  let offset = 0;
  const segments = data.byType.map((row, i) => {
    const frac = data.total > 0 ? row.count / data.total : 0;
    const seg = frac * CIRC;
    const s = {
      key: row.extension,
      color: PALETTE[i % PALETTE.length],
      dash: `${seg} ${CIRC}`,
      off: -offset,
      pct: Math.round(frac * 100),
    };
    offset += seg;
    return s;
  });

  return (
    <div className="overview" role="region" aria-label="Übersicht">
      <h3 className="overview-title">Übersicht</h3>

      {loading ? (
        <p className="loading">Lädt …</p>
      ) : error ? (
        <p className="error">⚠ {error}</p>
      ) : data.total === 0 ? (
        <p className="detail-placeholder">Noch keine Dateien indexiert.</p>
      ) : (
        <>
          {/* Donut: Verteilung nach Endung */}
          <div className="donut-wrap">
            <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={`Verteilung nach Endung, ${data.total} Dateien`}>
              {/* Hintergrundring */}
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--border)" strokeWidth="16" />
              {segments.map((s) => (
                <circle
                  key={s.key}
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="16"
                  strokeDasharray={s.dash}
                  strokeDashoffset={s.off}
                  transform="rotate(-90 60 60)"
                />
              ))}
              <text x="60" y="56" textAnchor="middle" className="donut-total">
                {data.total}
              </text>
              <text x="60" y="74" textAnchor="middle" className="donut-caption">
                Dateien
              </text>
            </svg>
          </div>

          {/* Legende: Farbe + Endung + Anzahl + Anteil */}
          <ul className="overview-legend">
            {data.byType.map((row, i) => (
              <li key={row.extension}>
                <span
                  className="legend-dot"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="legend-name">{row.extension.toUpperCase()}</span>
                <span className="legend-count">{row.count}</span>
                <span className="legend-pct">
                  {data.total > 0 ? Math.round((row.count / data.total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>

          {/* Jüngst hinzugefügte Dateien */}
          <h4 className="overview-sub">Zuletzt hinzugefügt</h4>
          <ul className="overview-recent">
            {data.recent.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <span className="recent-name" title={f.name}>
                  {f.name}
                </span>
                <span className="recent-meta">{formatDate(f.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
