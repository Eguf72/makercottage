// Lokaler Subnetz-Scan, unabhängig von mDNS.
// - /24-Subnetz der lokalen Adresse (macOS via ipconfig, Linux via hostname -I).
// - TCP-Port-Check (Default 445 = SMB) parallel über alle Hosts.
// - Reverse-DNS (best-effort) nur für SMB-offene Hosts, für lesbare Namen.
//
// Hinweis: macOS' `arp -a` liefert per Node (ohne TTY) keine Ausgabe, daher wird
// auf die /24-Auflistung + Port-Scan gesetzt. Der Scan sendet je Host ein
// einziges TCP-Connect – auf einem Heimnetz unproblematisch und schnell.
import net from 'node:net';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { reverse } from 'node:dns/promises';

const execFileP = promisify(execFile);

/**
 * Lokale IPv4-Adresse (nicht-Loopback). In-Process zuerst (os.networkInterfaces,
 * plattformübergreifend robust), externe Kommandos nur als Fallback.
 */
export async function getLocalIP() {
  try {
    const ifs = os.networkInterfaces();
    for (const addrs of Object.values(ifs)) {
      for (const a of addrs) {
        if (a.family === 'IPv4' && !a.internal) return a.address;
      }
    }
  } catch {
    /* os.networkInterfaces nicht verfügbar */
  }
  try {
    const { stdout } = await execFileP('ipconfig', ['getifaddr', 'en0']);
    const ip = stdout.trim();
    if (ip && ip.includes('.')) return ip;
  } catch {
    /* kein macOS / en0 down */
  }
  try {
    const { stdout } = await execFileP('hostname', ['-I']);
    const first = stdout.trim().split(/\s+/)[0];
    if (first && first.includes('.')) return first;
  } catch {
    /* kein Linux / hostname -I */
  }
  return null;
}

function subnetOf(ip) {
  const o = ip.split('.');
  o[3] = '0';
  return o.join('.');
}

/** TCP-Port erreichbar? (true/false, mit Timeout). */
function checkPort(ip, port, timeoutMs = 400) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* */ }
      resolve(v);
    };
    const sock = net.connect({ port, host: ip }, () => finish(true));
    sock.setTimeout(timeoutMs, () => finish(false));
    sock.on('error', () => finish(false));
  });
}

/** Best-effort Reverse-DNS (kein Hard-Dependency, kurzer Timeout). */
async function nameOf(ip, timeoutMs = 800) {
  try {
    const r = await Promise.race([
      reverse(ip),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    if (Array.isArray(r) && r[0]) return r[0];
    if (typeof r === 'string' && r.trim()) return r.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * Scannt das lokale /24-Subnetz.
 * @param {{ probePort?: number, probeTimeout?: number, probe?: boolean }} [opts]
 * @returns {Promise<Array<{ip:string, hostname:string|null, smb:boolean}>>}
 *   Sortiert: SMB-offene Hosts zuerst, dann nach Name/IP.
 */
export async function scanNetwork({ probePort = 445, probeTimeout = 400, probe = true } = {}) {
  const localIp = await getLocalIP();
  if (!localIp) return [];

  const prefix = subnetOf(localIp).split('.').slice(0, 3).join('.');
  const ips = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${prefix}.${i}`;
    if (ip === localIp) continue;
    ips.push(ip);
  }

  if (!probe) {
    return ips.map((ip) => ({ ip, hostname: null, smb: false }));
  }

  const probed = await Promise.all(
    ips.map(async (ip) => ({ ip, open: await checkPort(ip, probePort, probeTimeout) })),
  );

  // Nur SMB-offene Hosts anreichern (Reverse-DNS), Rest ohne Namen.
  for (const p of probed) {
    if (p.open) p.hostname = await nameOf(p.ip);
  }

  return probed
    .map((p) => ({ ip: p.ip, hostname: p.open ? p.hostname : null, smb: p.open }))
    .sort((a, b) => {
      if (a.smb !== b.smb) return a.smb ? -1 : 1; // SMB zuerst
      return (a.hostname || a.ip).localeCompare(b.hostname || b.ip);
    });
}
