# Freiraum Mitarbeiter

Digitaler Mitarbeiter für Freiraum Beratung - Automatisierung, Dokumentenerstellung, Lead-Management.

## Tech Stack

- **Backend**: FastAPI (Python 3.12.6)
- **Frontend**: React + Vite + Tailwind CSS v4
- **Database**: SQLite
- **PDF**: ReportLab
- **Port**: 30521

## Schnellstart

### 1. Alles starten (Empfohlen)
```powershell
.\scripts\dev_all.ps1
```

### 2. Separater Start
```powershell
# Backend
.\scripts\start_backend.ps1

# Frontend (separates Terminal)
.\scripts\start_frontend.ps1
```

## Projektstruktur

```
freiraum-mitarbeiter/
├── backend/          # FastAPI Backend
│   ├── app.py       # Haupt-API mit CORS
│   ├── .venv/       # Python Environment
│   └── requirements.txt
├── frontend/         # React Frontend
│   └── fm-app/      # Vite-Projekt + Tailwind v4
├── config/          # Konfiguration
│   └── .env         # Umgebungsvariablen
├── data/            # SQLite-Datenbank
├── exports/         # Generierte Dokumente
├── logs/            # Log-Dateien
├── assets/          # Statische Assets
└── scripts/         # PowerShell-Scripts
```

## Konfiguration

Bearbeite `config/.env` und setze:
- `IMAP_PASS` - E-Mail-Passwort
- `SMTP_PASS` - SMTP-Passwort
- `OPENAI_API_KEY` - OpenAI API Key (optional)

## Entwicklung

### Backend-API testen
```powershell
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:30521/api/system/status"
```

### System-Report erstellen
```powershell
.\scripts\dev_health.ps1
```

## Features (TODO)

- Mail-Management (IMAP/SMTP)
- Angebotserstellung
- Lead-Management
- Followup-Tracking
- PDF-Reports
- Knowledge Base
- Lizenz-Verwaltung

## License

Proprietär - Freiraum Beratung