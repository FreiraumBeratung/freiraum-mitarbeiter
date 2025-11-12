from __future__ import annotations

import os, sqlite3, json
from typing import Optional

from .audit_logger import get_logger

DATA_DIR = os.environ.get("FREIRAUM_DATA_DIR", os.path.join(os.path.expanduser("~"), "Desktop", "freiraum-mitarbeiter", "data"))
DB_PATH = os.path.join(DATA_DIR, "freiraum.db")  # bestehende Haupt-SQLite

def _conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def delete_user_data(user_id: str) -> dict:
    """
    Beispielhafte DSGVO-Löschung – passt Tabellen an euer Schema an.
    Löscht/finalisiert personenbezogene Daten, ohne Business-Integrität zu beschädigen.
    """
    log = get_logger()
    counts = {}

    with _conn() as c:
        # Beispiel-Tabellen – falls nicht vorhanden, werden sie einfach übersprungen:
        for tbl, col in [("leads", "owner_id"), ("followups", "user_id"), ("offers", "user_id"), ("profile", "user_id")]:
            try:
                cur = c.execute(f"UPDATE {tbl} SET {col}=NULL WHERE {col}=?", (user_id,))
                counts[tbl] = cur.rowcount
                c.commit()
            except Exception:
                counts[tbl] = 0

    log.log(action="privacy.delete_user_data", user_id=user_id, payload={"result": counts})
    return {"ok": True, "result": counts}

def anonymize_email(email: str) -> str:
    try:
        name, domain = email.split("@", 1)
        return f"{name[:1]}***@{domain}"
    except Exception:
        return "***"





