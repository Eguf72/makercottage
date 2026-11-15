// MakerCottage – Remote-Update-Check (P2b, v0.6.0)
//
// Prüft per GitHub-Releases-API, ob eine neuere Version als die lokal
// laufende (aus app/package.json) verfügbar ist. Rein modulär – keine
// Fastify-/React-Abhängigkeit -> wird GLEICHZETIG vom Server
// (GET /api/update/check) UND vom Launcher (CLI --check) importiert.
//
// Konfiguration über Umgebungsvariablen:
//   MC_UPDATE_REPO       owner/repo (Default: Eguf72/makercottage).
//                        Leerer String  =>  "nicht konfiguriert"  =>
//                        manueller Update-Pfad (kein Fehler, kein Crash).
//   MC_UPDATE_GH_TOKEN   Optionaler GitHub-Personal-Access-Token; als
//                        Bearer-Header gesetzt -> hebt den unauthentifizierten
//                        Rate-Limit (60/h) auf 5000/h an.
//   MC_UPDATE_GITHUB_API API-Base-URL (Default https://api.github.com);
//                        GitHub-Enterprise / Proxy übersteigbar.
//   MC_UPDATE_TIMEOUT_MS Timeout pro Anfrage in ms (Default 8000).
//   MC_UPDATE_CACHE_MS   In-Memory-TTL wiederholter Abfragen (Default 300000
//                        = 5 min); senkt die GitHub-Last bei jedem Footer-Load.
//
// Der Check scheitert NIEMALS hart: Netzwerk-/Zeitablauf-/Rate-Limit-/404-
// Fehler führen zu { available:false, error:<Text> } – der Aufrufer zeigt
// dann den manuellen Update-Pfad. checkForUpdate() wirft nie.
//
// Ergebnis-Objekt (JSON-serialisierbar, für /api/update/check + UI-Footer):
//   {
//     configured: boolean,        // war ein Repo gesetzt?
//     current:    string,         // lokal laufende Version
//     latest:     string|null,    // neueste Release-Version (ohne v-Prefix)
//     available:  boolean,        // latest > current?
//     releaseTitle: string|null,  // GitHub-Release-Titel (name)
//     notes:      string|null,    // Kurztext (erste Zeile des Release-Bodys)
//     downloadUrl: string|null,   // erstes Asset (browser_download_url), sonst
//                                  // die Release-Seite, falls kein Asset
//     releaseUrl: string|null,    // html_url (Release-Seite)
//     source:     string|null,    // "github:owner/repo"
//     checkedAt:  string,         // ISO-Zeitpunkt
//     error:      string|null,    // menschenlesbar, falls der Check nicht gelang
//   }

// --- Versionsvergleich (semver, Kern MAJOR.MINOR.PATCH) ------------------------
// Präfix "v" wird entfernt; der Prerelease-Teil ("0.6.0-rc1" -> "0.6.0") wird
// abgeschnitten und zählt damit GLEICH wie das finale Release (konservativ: ein
// Beta/RC wird nicht als Update für die finale Version angeboten). Fehnde
// Komponenten = 0.
export function compareVersions(a, b) {
  const norm = (v) =>
    String(v || '0')
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => {
        const m = Number(n);
        return Number.isFinite(m) ? m : 0;
      });
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// --- Konfiguration aus der Umgebung (pro Aufruf lesbar, testbar) ---------------
export function resolveConfig(env = process.env) {
  const repo = (env.MC_UPDATE_REPO ?? 'Eguf72/makercottage').trim();
  return {
    repo, // '' => nicht konfiguriert
    token: (env.MC_UPDATE_GH_TOKEN || '').trim(),
    apiBase: (env.MC_UPDATE_GITHUB_API || 'https://api.github.com').replace(/\/+$/, ''),
    timeoutMs: Number(env.MC_UPDATE_TIMEOUT_MS) || 8000,
    cacheMs: Number(env.MC_UPDATE_CACHE_MS) || 300000,
    configured: repo.length > 0,
  };
}

function buildReleaseUrl(cfg) {
  return `${cfg.apiBase}/repos/${cfg.repo}/releases/latest`;
}

// --- Fetch der neuesten Release (Timeout + sanfte Fehler) ----------------------
async function fetchLatestRelease(cfg, signal) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'makercottage-updater', // GitHub erfordert einen User-Agent
  };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  const res = await fetch(buildReleaseUrl(cfg), { headers, signal });

  if (res.status === 404) {
    return { release: null, error: `Keine Releases für „${cfg.repo}" gefunden (HTTP 404).` };
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    return {
      release: null,
      error:
        remaining === '0'
          ? 'GitHub-Rate-Limit erreicht – setze MC_UPDATE_GH_TOKEN für mehr Abfragen.'
          : `GitHub lehnte die Anfrage ab (HTTP ${res.status}).`,
    };
  }
  if (!res.ok) {
    return { release: null, error: `Unerwartete Antwort vom GitHub-API (HTTP ${res.status}).` };
  }
  return { release: await res.json(), error: null };
}

// --- Kurztext aus einer GitHub-Release (Titel + erste Body-Zeile + Download) ---
function summarizeRelease(release) {
  const title = release.name || `v${release.tag_name || '?'}`;
  let notes = null;
  if (release.body) {
    const firstLine = release.body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (firstLine) notes = firstLine.length > 160 ? `${firstLine.slice(0, 157)}…` : firstLine;
  }
  const asset = Array.isArray(release.assets) ? release.assets[0] : null;
  const downloadUrl = asset?.browser_download_url || release.html_url || null;
  return { title, notes, downloadUrl, releaseUrl: release.html_url || null };
}

// --- In-Memory-Cache (TTL) – senkt die GitHub-Last pro Footer-Load ------------
let cache = { at: 0, result: null, key: '' };

// --- Öffentliche API: Ergebnis bauen (niemals werfen) -------------------------
export async function checkForUpdate(opts = {}) {
  const env = opts.env || process.env;
  const cfg = resolveConfig(env);
  const current = opts.current || 'unbekannt';
  const checkedAt = new Date().toISOString();

  const key = [cfg.repo, cfg.token, cfg.apiBase, cfg.timeoutMs].join('|');
  if (cache.result && cache.key === key && Date.now() - cache.at < cfg.cacheMs) {
    return { ...cache.result, current, checkedAt };
  }

  const base = {
    configured: cfg.configured,
    current,
    latest: null,
    available: false,
    releaseTitle: null,
    notes: null,
    downloadUrl: null,
    releaseUrl: null,
    source: cfg.configured ? `github:${cfg.repo}` : null,
    checkedAt,
    error: null,
  };

  // Nicht konfiguriert -> manueller Pfad, kein Fehler, kein Netzwerk.
  if (!cfg.configured) {
    base.error = 'Remote-Update-Quelle nicht konfiguriert (setze MC_UPDATE_REPO=owner/repo).';
    cache = { at: Date.now(), result: base, key };
    return base;
  }

  let out;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    let fetched;
    try {
      fetched = await fetchLatestRelease(cfg, controller.signal);
    } finally {
      clearTimeout(timer);
    }

    if (fetched.error) {
      out = { ...base, error: fetched.error };
    } else {
      const rel = summarizeRelease(fetched.release);
      const latest = String(fetched.release?.tag_name || '').replace(/^v/i, '') || null;
      out = {
        ...base,
        latest,
        releaseTitle: rel.title,
        notes: rel.notes,
        downloadUrl: rel.downloadUrl,
        releaseUrl: rel.releaseUrl,
        available: latest ? compareVersions(latest, current) > 0 : false,
      };
    }
  } catch (err) {
    out = { ...base, error: humanizeNetworkError(err) };
  }

  cache = { at: Date.now(), result: out, key };
  return out;
}

// Netzfehler lesbar (kein roher Stack im UI-Log / CLI-Ausdruck).
function humanizeNetworkError(err) {
  if (err?.name === 'AbortError') return 'Zeitüberschreit beim Update-Check (MC_UPDATE_TIMEOUT_MS).';
  const msg = String(err?.message || err || '');
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(msg)) {
    return 'Netzwerk nicht erreichbar (offline? DNS?) – manueller Update-Pfad möglich.';
  }
  return `Update-Check fehlgeschlagen: ${msg}`;
}
