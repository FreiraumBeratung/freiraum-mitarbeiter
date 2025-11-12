============================================================
SPRINT 8 - AGENTIC AUTOMATION
============================================================

ZIEL:
  Erweiterung der Decision Engine aus Sprint 7 mit:
  - Action Queue (DB-basierte Task-Queue)
  - Approve/Reject System (Human-in-the-Loop)
  - Safety Guards (Score-Thresholds, Zeitlimits)
  - Automation Loop (autonome Ausführung mit Approval)
  - UI-Seite "AutomationCenter" für Approvals + Queue-Monitoring

============================================================
BACKEND STARTEN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprint8_run_backend.ps1

  Oder manuell:
    cd backend
    python run.py

  Backend läuft auf: http://localhost:30521

============================================================
AUTOMATION TESTS AUSFÜHREN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprint8_tests.ps1

  Test-Ablauf:
    1. Auto-enqueue (generiert Aktionen aus Decision Engine)
    2. Queue anzeigen
    3. Queued Items approven
    4. Approved Items ausführen
    5. Finale Queue-Status anzeigen

============================================================
FRONTEND STARTEN
============================================================

  cd frontend\fm-app
  npm install
  npm run dev

  Öffne: http://localhost:5173
  Navigiere zu Tab "Automation"

============================================================
API ENDPOINTS
============================================================

  GET  /api/automation/queue?user_id={id}&status={status}
       → Queue-Items anzeigen (optional gefiltert nach Status)

  POST /api/automation/approve
       Body: { "ids": [1,2,3], "approve": true }
       → Items approven oder rejecten

  POST /api/automation/run?user_id={id}
       → Alle approved Items ausführen

  POST /api/automation/auto?user_id={id}
       → Auto-enqueue: generiert Aktionen aus Decision Engine
         (nur wenn Score >= FM_AUTO_SCORE_MIN)

============================================================
STATUS WORKFLOW
============================================================

  queued → approved → running → done
                  ↓
               rejected
                  ↓
                failed

============================================================
SAFETY GUARDS
============================================================

  - Score Threshold: FM_AUTO_SCORE_MIN (Default: 0.6)
    Nur Aktionen mit Score >= 0.6 werden auto-enqueued

  - Human-in-the-Loop: Alle Aktionen müssen manuell approved werden
    (außer bei direkter /automation/auto Nutzung)

  - Vollständig lokal: Keine externen Netzwerk-Calls für kritische Aktionen

============================================================
WAS IST NEU?
============================================================

  ✅ Action Queue Datenbank-Tabelle
  ✅ Approve/Reject System
  ✅ Automation Service mit Auto-Enqueue
  ✅ Automation Router (4 Endpoints)
  ✅ AutomationCenter UI-Seite
  ✅ Integration in App.jsx und Topbar
  ✅ API Client Erweiterung
  ✅ PowerShell Test-Suite

============================================================
ERFOLGSKRITERIEN
============================================================

  ✅ Backend 30/30 Endpoints (26/26 + 4 Automation)
  ✅ Queue und Approval Workflows in UI sichtbar
  ✅ Auto-enqueue fügt eligible Actions hinzu (Score >= 0.6)
  ✅ Approved Actions werden ausgeführt und als "done" markiert
  ✅ Dry-Run zeigt sichere Ausführungspfade

============================================================
NÄCHSTE SCHRITTE
============================================================

  - Scheduler Integration (automatisches Auto-Enqueue)
  - Erweiterte Safety Guards (Tag-/Nacht-Limits)
  - Batch-Approval UI
  - Queue History & Analytics

============================================================

















