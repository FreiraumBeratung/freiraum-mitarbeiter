SPRINT H – Avatar-UI (lebendiger Assistent)
==========================================

Start Backend:
  powershell -ExecutionPolicy Bypass -File .\docs\sprintC_run_backend.ps1

Start Frontend:
  cd frontend\fm-app
  npm run dev

Smoke Tests:
  powershell -ExecutionPolicy Bypass -File .\docs\sprintH_tests.ps1

Was ist neu?
============

Frontend:
- NEW: AvatarAssistant.jsx → schwebender Assistent unten rechts
  - Idle → leichtes Atmen (animate-pulse)
  - Wave-On-Show → Hand winkt beim Einblenden
  - Speaking → Mund/Lippe animiert während TTS
  - Suggestion Bubble → „Hey, ich hab da 3 Ideen … jetzt anhören?“
  - Buttons: „Anhör'n", „Später", „Denk mal" (Decision Think)

- NEW: useSpeech.js → TTS (Web Speech API), sauber entkoppelt

- Settings: localStorage für avatar.auto und avatar.volume

- Polling: /api/insights/suggestions (alle 45s) + /api/decision/think (onClick)

Backend:
- Keine neuen Ports. Wir nutzen vorhandene Endpoints:
  - GET /api/insights/suggestions
  - POST /api/insights/seed (nur Dev)
  - POST /api/decision/think
  - POST /api/decision/execute

Features:
==========
- Voice-first kompatibel (nutzt Web Speech API)
- Auto-Sprechen Toggle (localStorage)
- Lautstärke-Slider (localStorage)
- Verstecken/Zeigen Button
- Animations: idle (pulse), wave (wiggle), speaking (talk)
- Bubble mit kontextbezogenen Aktionen

Technische Details:
===================
- Keine NPM-Dependencies nötig (Web Speech API)
- Standalone, keine Portänderung
- Additive Änderungen nur
- Z-Index 50 (oben auf allem)
- Branding: Orange-Gradient (from-orange-500 via-orange-400 to-amber-400)

Success Criteria:
================
1) Avatar erscheint unten rechts
2) Polling alle 45s für neue Vorschläge
3) "Denk mal" Button führt /decision/think aus
4) "Starte #1" Button führt /decision/execute aus
5) TTS funktioniert (Chrome/Edge empfohlen)
6) Animations funktionieren (idle, wave, speaking)
7) Settings werden in localStorage gespeichert
















