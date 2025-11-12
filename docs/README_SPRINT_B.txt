============================================================
SPRINT B – VOICE AI ROUTER 2.0 (Voice-First, Zero-Typing)
============================================================

ZIEL:
  Server-seitiger Voice Command Router mit:
  - Policy Guards (Zeitfenster, Score-Threshold)
  - Preference Lookup (Profile API)
  - Automatische Mode-Entscheidung (ask/add/outreach)
  - Zero-Typing Flow im Frontend

============================================================
BACKEND STARTEN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprintB_run_backend.ps1

  Oder manuell:
    cd backend
    python run.py

  Backend läuft auf: http://localhost:30521

============================================================
SMOKE TESTS AUSFÜHREN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprintB_tests.ps1

  Test-Ablauf:
    1. Voice Default Pref auf "ask" setzen
    2. Voice Command testen (ask path)
    3. Queue anzeigen
    4. Pref auf "outreach" setzen und erneut testen

============================================================
FRONTEND STARTEN
============================================================

  cd frontend\fm-app
  npm install
  npm run dev

  Öffne: http://localhost:5173
  Voice-Button unten rechts auf Dashboard.
  
  Test-Command:
    "Such mir 20 SHK Betriebe in Arnsberg"

  → Zero-Typing Flow: direkt /voice/command → Queue

============================================================
API ENDPOINTS
============================================================

  NEW: POST /api/voice/command
       Body: { "user_id": "...", "text": "..." }
       → Parse Intent + Prefs + Policies → Decision + Queue

  Response:
    {
      "ok": true,
      "decision": "ask" | "add" | "outreach",
      "reason": "...",
      "parsed": {...},
      "eligible": [...],
      "enqueued": 0
    }

============================================================
POLICY GUARDS
============================================================

  1. Zeit-Fenster:
     - Keine Mails nach 18:00 (außer FM_ALLOW_EVENING_MAILS=1)
     - Zeit-Fenster: 07:00 - 18:00
     - Bei Outreach außerhalb → automatisch "ask"

  2. Score-Threshold:
     - FM_AUTO_SCORE_MIN (Default: 0.6)
     - Nur Actions mit Score >= Threshold werden gemeldet

  3. Preference:
     - voice.leads.default_mode (ask | add | outreach)
     - Wird aus Profile API gelesen
     - Kann in Settings gesetzt werden

============================================================
VOICE PREFERENCES
============================================================

  Settings-Seite:
    - Komponente: SettingsVoicePrefs
    - Präferenz: voice.leads.default_mode
    - Optionen:
      * ask: Immer nachfragen
      * add: Nur anlegen (ohne Outreach)
      * outreach: Direkt anschreiben (wenn erlaubt)

============================================================
ZERO-TYPING FLOW
============================================================

  Alte Flow:
    1. Mic → STT
    2. /intent/parse
    3. Confirm-Dialog
    4. /intent/act

  Neue Flow (Zero-Typing):
    1. Mic → STT
    2. /voice/command (komplett)
    3. Wenn "ask": Confirm → /intent/act
    4. Wenn "add/outreach": Fertig (bereits enqueued)

============================================================
WAS IST NEU?
============================================================

  ✅ Voice Router Module (policies, service, router)
  ✅ POST /api/voice/command Endpoint
  ✅ Policy Guards (Zeit, Score)
  ✅ Preference Lookup
  ✅ Zero-Typing Flow im Frontend
  ✅ SettingsVoicePrefs Komponente
  ✅ Integration in Settings Page

============================================================
ARCHITEKTUR
============================================================

  Voice Router:
    - policies.py: Zeit-Fenster, Score-Threshold
    - service.py: route_voice_command() - Haupt-Logik
    - router.py: FastAPI Endpoint

  Flow:
    Text → Parse Intent → Get Prefs → Apply Policies → Decision → Queue

  Modes:
    - ask: Rückfrage (kein Auto-Enqueue)
    - add: Nur anlegen (kein Outreach)
    - outreach: Direkt anschreiben (wenn erlaubt)

============================================================
NÄCHSTE SCHRITTE
============================================================

  Sprint C: Lead-Hunter 1.0
    - Echte Websuche/Scraping
    - Excel-Export
    - DB-Save
    - Auto-Anschreiben

============================================================
HINWEISE
============================================================

  - Lead-Hunt Scraper kommt in Sprint C
  - Aktuell werden nur Actions in Queue gelegt
  - Execution bleibt in Automation Module
  - Human-in-the-Loop bleibt erhalten

============================================================

















