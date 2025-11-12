============================================================
SPRINT A – KNOWLEDGE & MEMORY 2.0 + INTENT DICTIONARY
============================================================

ZIEL:
  Knowledge Base 2.0 mit schneller lokaler Suche (bag-of-words cosine)
  + Intent Parser für Voice-First Commands
  + Bridge zu Automation Queue
  + Floating Voice Button (Web Speech API)

============================================================
BACKEND STARTEN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprintA_run_backend.ps1

  Oder manuell:
    cd backend
    python run.py

  Backend läuft auf: http://localhost:30521

============================================================
SMOKE TESTS AUSFÜHREN
============================================================

  powershell -ExecutionPolicy Bypass -File .\docs\sprintA_tests.ps1

  Test-Ablauf:
    1. KB Item erstellen (Lead-Kriterien SHK)
    2. KB Suche testen
    3. Intent Parse (Voice-Simulation)
    4. Intent Act → Automation Queue
    5. Queue anzeigen

============================================================
FRONTEND STARTEN
============================================================

  cd frontend\fm-app
  npm install
  npm run dev

  Öffne: http://localhost:5173
  Voice-Button erscheint unten rechts auf dem Dashboard.

  Test-Command:
    "Such mir 20 SHK Betriebe in Arnsberg und direkt anschreiben."

  → Intent wird erkannt, Nachfrage, dann in Automation-Queue.

============================================================
API ENDPOINTS
============================================================

  KB Module:
    POST   /api/kb/items
           Body: { "topic": "...", "tags": [...], "content": "..." }
           → Wissensartikel erstellen

    GET    /api/kb/items
           → Liste aller KB-Items (limit 100)

    GET    /api/kb/search?q={query}
           → Schnelle lokale Suche (cosine similarity)

  Intent Module:
    POST   /api/intent/parse
           Body: { "user_id": "...", "text": "..." }
           → Natural Language → Intent + Slots

    POST   /api/intent/act
           Body: { "user_id": "...", "text": "..." }
           → Parse + Actions in Automation-Queue legen

============================================================
INTENT DICTIONARY
============================================================

  Datei: config/intent_dictionary.json

  Erweiterbar:
    - categories: Branchen-Kategorien + Synonyme
    - regions: Regionen/Orte
    - verbs: Aktions-Verben (hunt/outreach/add_only)
    - modifiers: Zusatz-Parameter (count, mode)

  Beispiel:
    "Such 20 SHK Betriebe in Arnsberg und direkt anschreiben."
    → Intent: lead.outreach
    → Slots: { category: "shk", location: "arnsberg", count: 20, mode: "outreach" }

============================================================
VOICE BUTTON
============================================================

  - Floating Button unten rechts (🎤)
  - Web Speech API (Chrome/Edge empfohlen)
  - 1 Klick → Start
  - Auto-Stop nach Erkennung
  - Intent-Preview → Confirm → Queue

  Browser-Kompatibilität:
    ✓ Chrome/Edge (Web Speech API)
    ✗ Firefox (nicht unterstützt)

============================================================
WAS IST NEU?
============================================================

  ✅ KB Module (CRUD + Search)
  ✅ Intent Parser (Natural Language → Intent + Slots)
  ✅ Intent Dictionary (config/intent_dictionary.json)
  ✅ Bridge zu Automation Queue
  ✅ VoiceFloatButton Komponente
  ✅ KnowledgeBase UI-Seite (optional)
  ✅ Character Memory Integration (gesprochene Commands werden gespeichert)

============================================================
ARCHITEKTUR
============================================================

  KB Module:
    - Models: KBItem (topic, tags, content)
    - Service: Bag-of-words + TF-IDF + Cosine Similarity
    - Router: CRUD + Search Endpoints

  Intent Module:
    - Service: Dictionary-basierter Parser
    - Router: /parse + /act
    - Integration: Character Events + Automation Queue

  Voice:
    - Web Speech API (Browser-native)
    - Keine Server-Dependencies
    - Deutsch-Spracherkennung

============================================================
NÄCHSTE SCHRITTE
============================================================

  - Lead-Hunt Scraper (Sprint C)
  - Erweiterte Intent-Slots (Datum, Priorität)
  - KB-Import/Export
  - Voice-Training/Feedback

============================================================
HINWEISE
============================================================

  - Der eigentliche Lead-Hunt Scraper kommt in Sprint C.
  - Bis dahin erzeugt /intent/act die passenden Actions (hunt/outreach)
    für die Automation-Queue.
  - Dictionary erweiterbar unter config/intent_dictionary.json
  - KB-Suche: < 150ms für typische Queries
  - Gesprochene Commands werden im Character-Memory registriert

============================================================

















