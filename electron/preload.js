// MakerCottage – Electron-Preload (Option C, T45)
//
// Minimaler Preload: keine Node.js-APIs an den Renderer exponieren.
// Die gesamte Kommunikation zwischen UI und Backend läuft über HTTP/JSON
// (der Fastify-Server auf localhost:PORT), nicht über Electron's IPC.
//
// contextIsolation: true + nodeIntegration: false (in main.js gesetzt)
// → der Renderer ist vollständig isoliert; dieser Preload bleibt leer,
//   weil keine IPC-Kanäle nötig sind.

// Absichtlich leer – keine IPC-Brücke, kein contextBridge-Exposé.
// Wenn in Zukunft IPC-Kanäle nötig sind (z. B. Native-Dialoge),
// wird hier ein contextBridge.exposeInMainWorld() ergänzt.
