# QA quick start

1. Backend starten: `pwsh -File .\scripts\_run_backend.ps1`
2. Frontend starten: `cd .\frontend\fm-app; npm run dev -- --port 5173 --host 127.0.0.1`
3. Tests ausführen: `pwsh -File .\scripts\_qa_tests.ps1`
   - Erwartung: alle Checks grün.
   - Self-Test optional: `pwsh -File .\scripts\_self_test.ps1`





