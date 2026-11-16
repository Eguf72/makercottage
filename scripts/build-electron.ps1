# MakerCottage – Electron-Build (Option C, T45) – WINDOWS
# Erzeugt den NSIS-Installer via electron-builder. PowerShell-Version von
# build-electron.sh (Windows-Runner hat keine .sh, aber pwsh).
#
# Architektur (siehe build-electron.sh): der Server lauft als Kindprozess auf
# der mitgelieferten bin/node.exe. better-sqlite3 ist N-API (ABI-stabil) und
# liefert den win32-x64-Prebuild im npm-Paket mit -> kein Rebuild noetig.
# Die EINZIGE plattformspezifische Sache ist die Node-Binair in bin/.
#
# Ausgabe: dist/electron/MakerCottage-Setup-<ver>-x64.exe
#
# Konfiguration (Umgebungsvariablen):
#   NODE_VERSION=v26.13.0   – Node-Tarball-Version (muss zu den Prebuilds passen)
#   UNSIGNED=1              – ohne Code-Signing (kein Windows-Certificate)
#   ARCH=x64                – Architektur (Default x64)

$ErrorActionPreference = 'Stop'

$ROOT = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path
$ELECTRON_DIR = Join-Path $ROOT 'electron'
$OUT = Join-Path $ROOT 'dist' 'electron'
$NODE_VERSION = if ($env:NODE_VERSION) { $env:NODE_VERSION } else { 'v26.13.0' }
$ARCH = if ($env:ARCH) { $env:ARCH } else { 'x64' }

Write-Host "==> MakerCottage Electron-Build (Option C, Windows $ARCH)"

# 1) Frontend bauen (web/dist)
Write-Host "==> (1/5) Frontend bauen (web/dist)"
Push-Location (Join-Path $ROOT 'web')
try {
  npm ci --no-audit --no-fund | Out-Null
  npm run build
} finally { Pop-Location }

# 2) Node-Binair (win-x64) aus nodejs.org
Write-Host "==> (2/5) Node-Binair (win-$ARCH; version $NODE_VERSION)"
New-Item -ItemType Directory -Force -Path (Join-Path $ROOT 'bin') | Out-Null
$NodeZip = Join-Path $env:TEMP ('node-$NODE_VERSION-win-$ARCH.zip')
$NodeUrl = "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-win-$ARCH.zip"
Write-Host "    Herunterladen: $NodeUrl"
Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip
$NodeExtract = Join-Path $env:TEMP ('node-$NODE_VERSION-win-$ARCH')
if (Test-Path $NodeExtract) { Remove-Item -Recurse -Force $NodeExtract }
Expand-Archive -Path $NodeZip -DestinationPath $NodeExtract
$NodeSrc = Join-Path $NodeExtract "node-$NODE_VERSION-win-$ARCH" 'node.exe'
if (-not (Test-Path $NodeSrc)) { throw "Erwartete Binair nicht gefunden: $NodeSrc" }
Copy-Item $NodeSrc (Join-Path $ROOT 'bin' 'node.exe')
Remove-Item $NodeZip -Force
$NodeDst = Join-Path $ROOT 'bin' 'node.exe'
& $NodeDst -p 'process.version'

# 3) server-Dependencies (besser-sqlite3 + win32-x64-Prebuild via npm ci)
Write-Host "==> (3/5) server-Dependencies (npm ci)"
Push-Location (Join-Path $ROOT 'server')
try {
  npm ci --no-audit --no-fund | Out-Null
} finally { Pop-Location }

# 3b) electron-Build-Abhaengigkeiten
Write-Host "==> (3b/5) electron-Build-Abhaengigkeiten (npm ci)"
Push-Location $ELECTRON_DIR
try {
  npm ci --no-audit --no-fund | Out-Null
} finally { Pop-Location }

# 4) electron-builder --win
Write-Host "==> (4/5) electron-builder --win"
if ($env:UNSIGNED -eq '1') {
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  $env:WIN_CSC_NAME = ''
  $env:WIN_CSC_LINK = ''
  Write-Host "    (UNSIGNED=1 -> ohne Signing)"
}
Push-Location $ELECTRON_DIR
try {
  npm run build:win
} finally { Pop-Location }

# 5) Ausgabe
Write-Host "==> (5/5) Fertig"
Write-Host "    Ausgabe-Verzeichnis: $OUT"
Get-ChildItem $OUT -ErrorAction SilentlyContinue | Format-Table -AutoSize
