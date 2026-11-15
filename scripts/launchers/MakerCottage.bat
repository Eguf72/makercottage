@echo off
REM MakerCottage - Start-Datei (Windows). Doppelklick starten.
REM Ruft den geteilten Launcher-Kern mit der mitgelieferten node.exe auf.
REM Das UI-Fenster (Browser) oeffnet der Launcher automatisch; dieses
REM Konsolenfenster haelt das Backend am Leben (Schliessen beendet es).
REM
REM Guard: Diese Datei ist die LAUFZEIT-Datei des GEBAUTEN Bundles. Wird sie
REM versehentlich aus dem Quell-Ordner (scripts\launchers\) gestartet, fehlt dort
REM bin\node.exe -> klare Meldung + warten statt "blitzschnell zu".
set "DIR=%~dp0"
set "NODE_BIN=%DIR%bin\node.exe"

if not exist "%NODE_BIN%" (
  echo.
  echo   MakerCottage konnte nicht starten.
  echo.
  echo   Die mitgelieferte Node-Binar fehlt hier:
  echo     %NODE_BIN%
  echo.
  echo   Du hast hoechstwahrscheinlich die FALSCHE Datei gestartet:
  echo   einen Quell-Ordner statt des gebauten Bundles.
  echo.
  echo   Richtig ist der GEBRAUTE Ordner (mit eigener bin\node.exe).
  echo   Bei neuem Code erst bauen:  npm run build   (Projekt-Ordner)
  echo.
  echo   [Enter zum Schliessen] ...
  pause >nul
  exit /b 1
)

"%NODE_BIN%" "%DIR%launcher\launcher.mjs" %*
