SPRINT 7 - DECISION ENGINE & AUTONOMY
=======================================

START BACKEND:

  PowerShell:
    powershell -ExecutionPolicy Bypass -File .\docs\sprint7_run_backend.ps1

RUN TESTS (new window, backend running):

  powershell -ExecutionPolicy Bypass -File .\docs\sprint7_tests.ps1

ENABLE SCHEDULER (optional; then restart backend):

  powershell -ExecutionPolicy Bypass -File .\docs\sprint7_enable_scheduler.ps1

FRONTEND:

  cd .\frontend\fm-app
  npm install
  npm run dev
  Open http://localhost:5173 and navigate to "Decision" tab

WHAT YOU GET:

  - POST /api/decision/think      -> ranked Next Best Actions
  - POST /api/decision/execute     -> run chosen actions (dry_run supported)
  - POST /api/decision/run         -> orchestrated run + persistence
  - GET  /api/decision/history     -> last runs with results
  - Optional background scheduler  -> periodic think/execute

SECURITY & SAFETY:

  - Local-only HTTP calls to your own backend
  - Idempotent non-destructive defaults
  - offers.create_draft creates single demo draft per call
  - mail.send_test uses test@example.com (expected reject ok)
  - Dry-run mode for safe testing

DECISION LOGIC:

  The engine analyzes:
  - Character State (mood, intensity, confidence)
  - Recent Conversation Events (topics, sentiment)
  - KPIs (leads, offers, won_offers)

  Produces ranked actions:
  - Follow-ups review (high priority if due)
  - Offer creation (if topics include "offers")
  - KPIs review (if no won offers)
  - Insights seed (if positive mood)
  - Mail test (sanity check)



















