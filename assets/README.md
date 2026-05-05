# Build Assets

Für den Windows-Installer werden folgende Dateien erwartet:

- `logo.ico` (Installer- und Desktop-Icon, bevorzugt 256x256)
- `logo.png` (optional, z. B. für Doku/Splash-Varianten)

Der Build-Prozess versucht `logo.ico` automatisch zu erzeugen aus:

- `assets/logo.png`
- `frontend/fm-app/public/branding/freiraum-logo.png`

Wenn keine Quelle vorhanden ist, bricht der Packaging-Schritt mit Fehlermeldung ab.

