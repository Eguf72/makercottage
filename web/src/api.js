// Kleiner API-Client für das Backend.

async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.detail || `Fehler ${res.status}`);
  }
  return res.json();
}

export const api = {
  getConfig: () => request('/api/config'),
  saveConfig: (data) => request('/api/config', { method: 'POST', body: JSON.stringify(data) }),
  getTypes: () => request('/api/types'),
  discover: (timeout = 3000, probe = true, probePort = 445) =>
    request(`/api/nas/discover?timeout=${timeout}&probe=${probe}&probePort=${probePort}`),
  listShares: (data = {}) =>
    request('/api/nas/shares', { method: 'POST', body: JSON.stringify(data) }),
  browse: (data = {}) =>
    request('/api/browse', { method: 'POST', body: JSON.stringify(data) }),
  getFiles: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/files?${q}`);
  },
  getDbFiles: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/db/files?${q}`);
  },
  getDbFile: (name) => {
    const q = new URLSearchParams({ name }).toString();
    return request(`/api/db/file?${q}`);
  },
  getOverview: () => request('/api/db/overview'),
  updateFilePrint: (name, fields) =>
    request('/api/db/file/print', {
      method: 'POST',
      body: JSON.stringify({ name, ...fields }),
    }),
  // Datei im nativen Dateimanager öffnen (Finder/Explorer/Filen).
  revealFile: (name, path) =>
    request('/api/db/file/reveal', {
      method: 'POST',
      body: JSON.stringify({ name, path }),
    }),
  // Server-Version (für den Footer-Skew-Vergleich).
  getVersion: () => request('/api/version'),
  // Remote-Update-Check (GitHub-Releases, serverseitig). Scheitert nie hart:
  // liefert { available, latest, releaseTitle, downloadUrl, error, ... }.
  getUpdateCheck: () => request('/api/update/check'),
  // Datei im Slicer öffnen (App-name oder konfigurierter Slicer).
  openInSlicer: (name, path) =>
    request('/api/db/file/openInSlicer', {
      method: 'POST',
      body: JSON.stringify({ name, path }),
    }),
};
