# Lead Real Mode

- `REAL_MODE=on` in `backend/.env`
- `LEAD_PROVIDER=csv` oder `web_permitted`
- Bei `web_permitted` werden ausschließlich Domains aus `ALLOWLIST_DOMAINS` gecrawlt (robots/AGB beachten).
- Exporte landen unter `backend/data/exports` als CSV, XLSX, JSON und Markdown.
- Nur öffentliche Firmenkontakte verarbeiten, DSGVO und Opt-out respektieren.
- Rate-Limits (`RL_*`) sowie Backoff in `.env` feinjustieren.




