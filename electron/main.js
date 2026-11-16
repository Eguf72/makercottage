// MakerCottage – Electron-Hauptprozess (Option C, T45)
//
// Ersetzt den OS-Browser-Start (Option A) durch eine BrowserWindow.
// Der Server läuft weiterhin als Kindprozess (launcher.mjs), damit
// die better-sqlite3-ABI stimmt. Die einzige Änderung ist die openUI-
// Strategie: statt open/xdg-open/start lädt die BrowserWindow die URL.
//
// Pfad-Auflösung:
//   Entwicklung:  ../launcher/launcher.mjs  (relativ zu __dirname)
//   Gepackt:      process.resourcesPath/launcher/launcher.mjs
//   (electron-builder legt extraResources in process.resourcesPath ab)

const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('node:path');

let mainWindow = null;
let serverChild = null;
let serverShutdown = null;

// --- Pfade -------------------------------------------------------------------
function getLauncherPath() {
  if (app.isPackaged) {
    // Im gepackten App: extraResources → process.resourcesPath
    return path.join(process.resourcesPath, 'launcher', 'launcher.mjs');
  }
  // Entwicklung: __dirname = <root>/electron → ../launcher/launcher.mjs
  return path.join(__dirname, '..', 'launcher', 'launcher.mjs');
}

// --- Fenster -----------------------------------------------------------------
async function createWindow() {
  // Launcher importieren (ES-Modul → dynamischer Import aus CommonJS)
  let launch;
  try {
    ({ launch } = await import(getLauncherPath()));
  } catch (err) {
    dialog.showErrorBox(
      'MakerCottage konnte nicht starten',
      `Der Launcher ließ sich nicht laden:\n\n${err.message}\n\n` +
      `Bitte überprüfe, ob die mitgelieferte Node-Binär vorhanden ist\n` +
      `(bin/node im Bundle-Ordner).`
    );
    app.quit();
    return;
  }

  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'MakerCottage',
    show: false, // erst laden, dann zeigen (kein weißer Blitz)
    backgroundColor: '#384b41', // Oliven-Grund (Farbschema v0.5.0)
    icon: isMac
      ? path.join(__dirname, 'resources', 'icon.png')
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // macOS: native verdeckte Titel-Leiste (Traffic-Lights sichtbar)
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
      : {}),
  });

  // Externe Links im System-Browser öffnen, nicht im Electron-Fenster
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Unter Electron: Daten-Ordner an den platform-nativen Speicherort binden
  // (macOS: ~/Library/Application Support/makercottage,
  //  Win: %APPDATA%/makercottage, Linux: ~/.config/makercottage)
  // Der Launcher erbt process.env und übergibt ihn an den Kindprozess.
  if (process.env.MC_HOME === undefined) {
    process.env.MC_HOME = app.getPath('userData');
  }

  // Server starten + UI in der BrowserWindow laden
  try {
    ({ child: serverChild, shutdown: serverShutdown } = await launch({
      openUI: async (url) => {
        await mainWindow.loadURL(url);
        // Erst nach 'ready-to-show' sichtbar machen (kein weißer Blitz)
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.once('ready-to-show', () => {
            mainWindow.show();
            mainWindow.focus();
          });
        }
        return true;
      },
    }));
  } catch (err) {
    dialog.showErrorBox(
      'Backend-Server ließ sich nicht starten',
      `${err.message}\n\n` +
      `Port ${process.env.PORT || 4000} ist ggf. bereits belegt. ` +
      `Starte MakerCottage neu oder setze PORT als Umgebungsvariable.`
    );
    app.quit();
    return;
  }

  // Fenster schließen → Server sauber stoppen (SIGTERM + SIGKILL-Fallback)
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverShutdown) {
      serverShutdown('SIGTERM');
    }
    // macOS: App bleibt im Dock, auch ohne Fenster
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// --- Menü --------------------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Datei',
      submenu: [
        // Windows / Linux: Schließen beendet die App
        ...(isMac
          ? []
          : [{ role: 'quit', accelerator: 'CmdOrCtrl+Q' }]),
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [{ role: 'pasteAndMatchStyle' }] : []),
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- App-Start ---------------------------------------------------------------
app.whenReady().then(async () => {
  buildMenu();
  await createWindow();
});

// macOS: App bleibt im Dock, auch ohne Fenster
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

// Alle Fenster geschlossen → App beenden (außer macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
