============================================================
SPRINT C – LEAD-HUNTER 1.0
============================================================

ZIEL:
  Websuche → Leads → Excel/DB → Outreach + Follow-ups
  Vollständige Lead-Generierung und Outreach-Pipeline

============================================================
BACKEND STARTEN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprintC_run_backend.ps1

  Oder manuell:
    cd backend
    python run.py

  Backend läuft auf: http://localhost:30521

============================================================
SMOKE TESTS AUSFÜHREN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprintC_tests.ps1

  Test-Ablauf:
    1. Lead-Hunt durchführen (Websuche)
    2. Decision Execute Integration (lead.hunt Action)
    3. Outreach testen
    4. Excel-Export testen

============================================================
FRONTEND STARTEN
============================================================

  cd frontend\fm-app
  npm install
  npm run dev

  Öffne: http://localhost:5173
  Navigiere zu Tab "LeadsHunter"

============================================================
API ENDPOINTS
============================================================

  POST /api/lead_hunter/hunt
       Body: { "category": "...", "location": "...", "count": 20, "save_to_db": true, "export_excel": true }
       → Websuche → Leads → optional DB + Excel

  POST /api/lead_hunter/outreach
       Body: { "leads": [...], "template": "...", "attach_flyer": true }
       → Bulk-E-Mail + Follow-ups

  POST /api/lead_hunter/export_excel
       Body: { "leads": [...] }
       → Leads → Excel-Datei

============================================================
AUTOMATION INTEGRATION
============================================================

  Neue Action-Keys:
    - lead.hunt: Websuche → Leads → DB + Excel
    - lead.outreach: Bulk-E-Mail + Follow-ups

  Voice Command Beispiel:
    "Such mir 20 SHK Betriebe in Arnsberg"
    → Intent Parse → lead.hunt Action → Queue → Automation Run

============================================================
CONFIG-DATEIEN
============================================================

  config/lead_hunter.json:
    - Provider-Einstellungen (DuckDuckGo)
    - User-Agent, Timeouts, Delays
    - Max E-Mails pro Seite

  config/outreach_template.txt:
    - E-Mail-Template mit Platzhaltern
    - {{company}}, {{city}}, {{category}}

  assets/flyer.pdf:
    - Optional: Flyer für E-Mail-Anhänge
    - Wenn fehlt, wird ohne Anhang gesendet

============================================================
FEATURES
============================================================

  ✅ Websuche via DuckDuckGo HTML
  ✅ E-Mail/Telefon-Extraktion
  ✅ Lead-Speicherung in DB
  ✅ Excel-Export
  ✅ Bulk-Outreach mit Template
  ✅ Automatische Follow-up-Erstellung
  ✅ Integration in Automation Queue
  ✅ Frontend UI für Hunt & Outreach

============================================================
HINWEISE
============================================================

  - HTML-Scraper nutzt DuckDuckGo HTML-Ergebnisse
  - Ergebnisse variieren je nach Umgebung
  - E-Mail-Versand nutzt /mail/send_test
  - Stelle reale Empfänger für echten Versand ein
  - Flyer: assets/flyer.pdf (optional)
  - Respect the web: moderate Requests, kurze Delays, Timeouts

============================================================
ERFOLGSKRITERIEN
============================================================

  ✅ Voice-Befehl "Such 20 SHK in Arnsberg" → Queue → Automation run → /lead_hunter/hunt ausgeführt
  ✅ Excel erzeugt unter data/exports/
  ✅ Outreach sendet Mails & legt Follow-ups an
  ✅ Frontend-Seite zeigt gefundene Leads und kann Outreach anstoßen

============================================================

















