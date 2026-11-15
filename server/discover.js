import Bonjour from 'bonjour-service';
import { scanNetwork } from './network.js';

// Breiteres mDNS-Set: viele NAS annoncieren nur Web/SMB-Management, nicht _smb.
const DEFAULT_TYPES = [
  '_smb._tcp',
  '_afp._tcp',
  '_http._tcp',
  '_https._tcp',
  '_workstation._tcp',
  '_nfs._tcp',
];

/**
 * Sucht im lokalen Netzwerk nach SMB/NAS-Diensten (mDNS/Bonjour).
 * Gibt nach `timeout` ms die gefundenen Dienste zurück (nicht-blockierend).
 *
 * Hinweis: `bonjour-service` nutzt `find()` (nicht `browser()`) und das Event
 * `up` (nicht `service`); Beenden über `browser.stop()`.
 */
export function discoverSmb({ timeout = 2500, types = DEFAULT_TYPES } = {}) {
  return new Promise((resolve) => {
    let bns;
    try {
      bns = new Bonjour();
    } catch {
      return resolve([]);
    }

    const results = new Map();
    const browsers = [];
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      browsers.forEach((b) => { try { b.stop(); } catch { /* ignore */ } });
      try { bns.destroy(); } catch { /* ignore */ }
      resolve([...results.values()]);
    };

    for (const type of types) {
      const browser = bns.find({ type });
      browser.on('up', (service) => {
        const key = `${service.host}:${service.port || 445}`;
        if (!results.has(key)) {
          results.set(key, {
            name: service.name,
            host: service.host,
            port: service.port || 445,
            type: service.type || type,
          });
        }
      });
      browsers.push(browser);
    }

    setTimeout(finish, timeout);
  });
}

/**
 * Kombinierte Netzwerk-Suche: mDNS-Dienste + Subnetz-Scan (Port-445-Check),
 * parallel ausgeführt. Der Scan findet Geräte, die mDNS nicht annoncieren
 * (das häufigere Problem); mDNS liefert schöne Namen als Bonus.
 *
 * @returns {Promise<{ services: Array, hosts: Array, probed: number, note: string }>}
 *   `hosts` = SMB-offene Hosts zuerst (NAS-Kandidaten), sonst mDNS-Fallback.
 */
export async function discoverNetwork({
  timeout = 3000,
  types = DEFAULT_TYPES,
  probePort = 445,
  probeTimeout = 400,
  probe = true,
} = {}) {
  const [services, scanned] = await Promise.all([
    discoverSmb({ timeout, types }),
    scanNetwork({ probePort, probeTimeout, probe })
      .catch((err) => {
        console.error('[discover] Subnetz-Scan fehlgeschlagen:', err?.message || err);
        return [];
      }),
  ]);

  const open = scanned.filter((h) => h.smb === true);

  // mDNS-Dienste zu passenden Hosts anhängen; Unmatched als Fallback.
  const byKey = new Map(open.map((h) => [h.ip, h]));
  const mdnsOnly = [];
  for (const svc of services) {
    const key = svc.host; // bonjour liefert meist die IP als host
    const existing = byKey.get(key);
    if (existing) {
      existing.type = svc.type || existing.type;
      existing.hostname = svc.name || existing.hostname;
    } else {
      mdnsOnly.push({
        ip: key,
        hostname: svc.name || null,
        smb: null,
        type: svc.type,
      });
    }
  }

  // SMB-offene zuerst (NAS-Kandidaten); wenn keiner offen, mDNS als Fallback.
  const hosts = open.length > 0 ? open : mdnsOnly;

  return {
    services,
    hosts,
    probed: probe ? scanned.length : 0,
    note:
      'Subnetz-Scan (Port ' +
      probePort +
      ') + mDNS. Geprüft: ' +
      scanned.length +
      ' Hosts, ' +
      open.length +
      ' mit offenem Port. ' +
      'Bei 0 Treffern manuell Host/Share eingeben.',
  };
}
