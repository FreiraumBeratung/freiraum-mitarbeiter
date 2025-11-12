# Sprint I – DSGVO & Full Audit-Trail (Variante A)

## Inhalte

- **SQLite Audit-DB:** `data/audit/audit_log.db`
- **Auto-Logging Middleware** für Kern-Aktionen (Voice/Lead/Offers/Mail/Decision/Followups/Calendar/Profile/Sequences)
- **REST-API:** `/api/audit/*` (list, export.csv, export.pdf, purge, delete_user)
- **Frontend:** **Audit** Tab (Filter, Liste, Export, Purge, User-Delete)
- **DSGVO-Tools:** `privacy.delete_user_data(user_id)`

## Backend-Endpoints

### GET /api/audit/list
- Query-Parameter: `since`, `until`, `user_id`, `action_like`, `limit`, `offset`
- Liefert Liste aller Audit-Einträge

### GET /api/audit/export.csv
- Exportiert Audit-Log als CSV
- Query-Parameter wie `/list`

### GET /api/audit/export.pdf
- Exportiert Audit-Log als PDF (falls reportlab installiert)
- Fallback: CSV wenn reportlab nicht verfügbar
- Query-Parameter wie `/list`

### POST /api/audit/purge
- Body: `{"days": 90}`
- Löscht Einträge älter als N Tage

### POST /api/audit/delete_user
- Body: `{"user_id": "denis"}`
- Löscht alle Audit-Einträge für einen User (DSGVO)

## Hinweise

- **PDF-Export:** Nutzt ReportLab, falls installiert. Sonst CSV-Fallback.
- **Purge:** Löscht Einträge älter als N Tage (Default 90).
- **X-User-Id Header:** Kann gesetzt werden, Default `denis`.
- **Auto-Logging:** Protokolliert automatisch alle definierten Endpoints.

## Tests

```powershell
# Backend & Frontend laufen lassen, dann:
powershell -ExecutionPolicy Bypass -File .\scripts\audit_smoke.ps1
```

## DSGVO-Konformität

- **Vollständiger Audit-Trail:** Alle wichtigen Aktionen werden protokolliert
- **User-Daten löschen:** Kann einzelne User-Daten aus Audit entfernen
- **Data Retention:** Automatisches Purge nach 90 Tagen (konfigurierbar)
- **Export:** PDF/CSV für Compliance-Reports

## Technische Details

- **Datenbank:** SQLite in `data/audit/audit_log.db`
- **Middleware:** Automatisches Logging für definierte Endpoints
- **Thread-Safe:** Connection Pool für sichere parallele Zugriffe
- **Performance:** Indizierte Spalten für schnelle Abfragen
















