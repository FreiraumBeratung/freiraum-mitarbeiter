============================================================
SPRINT D – OUTREACH-SEQUENZEN & KALENDER 1.0
============================================================

ZIEL:
  E-Mail-Sequenzen mit Steps/Delays + Kalender-Events
  Voice-First Termin-Erkennung + optional MS Graph

============================================================
BACKEND STARTEN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprintD_run_backend.ps1

  Oder manuell:
    cd backend
    python run.py

  Backend läuft auf: http://localhost:30521

============================================================
SMOKE TESTS AUSFÜHREN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprintD_tests.ps1

  Test-Ablauf:
    1. Sequence erstellen (3-Step)
    2. Sequence ausführen (auf Leads)
    3. Calendar via Decision Execute testen
    4. Calendar List
    5. Intent Parse für Calendar-Commands

============================================================
FRONTEND STARTEN
============================================================

  cd frontend\fm-app
  npm install
  npm run dev

  Öffne: http://localhost:5173
  Navigiere zu Tabs "Sequences" oder "Calendar"

============================================================
API ENDPOINTS
============================================================

  POST /api/sequences
       Body: { "name": "...", "description": "...", "steps": [...] }
       → Sequence erstellen

  GET /api/sequences
       → Alle Sequences auflisten

  POST /api/sequences/run
       Body: { "sequence_id": 1, "lead_ids": [...], "attach_flyer": true }
       → Sequence ausführen (Step0 sofort, Step3/7 als Follow-ups)

  POST /api/calendar/create
       Body: { "title": "...", "start": "...", "end": "...", "location": "...", "attendees": [...] }
       → Event erstellen (lokal + optional MS Graph)

  GET /api/calendar/list
       → Alle Events auflisten

============================================================
AUTOMATION INTEGRATION
============================================================

  Neue Action-Keys:
    - sequence.run: Sequence ausführen
    - calendar.create: Termin anlegen

  Voice Command Beispiel:
    "Trag mir Freitag 10 Uhr einen Termin ein"
    → Intent Parse → calendar.create Action → Queue → Automation Run

============================================================
MS GRAPH (OPTIONAL)
============================================================

  Setze ENV:
    $env:MSGRAPH_TOKEN = "Bearer <token>"

  Wenn gesetzt:
    - Calendar Events werden zusätzlich in MS Graph erstellt
    - E-Mails können via Graph versendet werden (optional)

  Wenn nicht gesetzt:
    - Fallback auf lokale DB + bestehende Mail-Funktionen

============================================================
FEATURES
============================================================

  ✅ E-Mail-Sequenzen (Steps mit day_offset)
  ✅ Step0 → sofort versenden
  ✅ Step>0 → als Follow-up planen
  ✅ Kalender-Events (lokal + optional MS Graph)
  ✅ Voice-Termin-Erkennung (Wochentag + Uhrzeit)
  ✅ Intent Dictionary erweitert (schedule verbs, timewords)
  ✅ Decision Runner: sequence.run & calendar.create
  ✅ Frontend UI für Sequences & Calendar

============================================================
HINWEISE
============================================================

  - Sequences: Steps mit day_offset>0 werden als Follow-ups geplant
  - Placeholder: {{company}}, {{city}}, {{category}} in E-Mail-Body
  - Calendar: Time-Extraktion unterstützt Wochentage + relative (morgen)
  - MS Graph: Optional, Fallback auf lokale DB
  - Attachments: Flyer-Support in Sequences (über Follow-ups)

============================================================
ERFOLGSKRITERIEN
============================================================

  ✅ Sequences: 3-Step anlegen, auf 2–3 Leads starten → Step0 Mail versendet, Step3/7 Follow-ups angelegt
  ✅ Calendar: Voice „Termin Freitag 10 Uhr" → calendar.create enqueued & erstellt
  ✅ Decision runner führt "sequence.run" & "calendar.create" aus
  ✅ Alles weiterhin Zero-Typing-kompatibel (Mic → Voice Router → Queue → Ausführung)

============================================================
















