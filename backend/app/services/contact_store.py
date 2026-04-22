from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any


class ContactStore:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS learned_contacts (
                    email TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    aliases_json TEXT NOT NULL,
                    source TEXT NOT NULL,
                    first_seen REAL NOT NULL,
                    last_seen REAL NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS resolver_memory (
                    query_norm TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            conn.commit()

    def upsert_contact(self, *, email: str, display_name: str, aliases: list[str], source: str) -> None:
        normalized_email = (email or "").strip().lower()
        if not normalized_email or "@" not in normalized_email:
            return
        normalized_name = (display_name or "").strip() or normalized_email.split("@", 1)[0]
        aliases_norm = []
        seen = set()
        for alias in [normalized_name, *aliases, normalized_email]:
            value = (alias or "").strip()
            if not value:
                continue
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            aliases_norm.append(value)

        now_ts = time.time()
        aliases_json = json.dumps(aliases_norm, ensure_ascii=False)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT aliases_json, first_seen FROM learned_contacts WHERE email = ?",
                (normalized_email,),
            ).fetchone()
            if row is None:
                conn.execute(
                    """
                    INSERT INTO learned_contacts (email, display_name, aliases_json, source, first_seen, last_seen)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (normalized_email, normalized_name, aliases_json, source, now_ts, now_ts),
                )
            else:
                old_aliases = []
                try:
                    raw = json.loads(row["aliases_json"] or "[]")
                    if isinstance(raw, list):
                        old_aliases = [str(v) for v in raw if isinstance(v, str)]
                except Exception:
                    old_aliases = []
                merged = []
                seen2 = set()
                for alias in [normalized_name, *aliases_norm, *old_aliases]:
                    value = (alias or "").strip()
                    if not value:
                        continue
                    key = value.lower()
                    if key in seen2:
                        continue
                    seen2.add(key)
                    merged.append(value)
                conn.execute(
                    """
                    UPDATE learned_contacts
                    SET display_name = ?, aliases_json = ?, source = ?, last_seen = ?
                    WHERE email = ?
                    """,
                    (normalized_name, json.dumps(merged, ensure_ascii=False), source, now_ts, normalized_email),
                )
            conn.commit()

    def get_contacts(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT email, display_name, aliases_json, source
                FROM learned_contacts
                ORDER BY last_seen DESC
                """
            ).fetchall()
        result: list[dict[str, Any]] = []
        for row in rows:
            aliases: list[str] = []
            try:
                raw = json.loads(row["aliases_json"] or "[]")
                if isinstance(raw, list):
                    aliases = [str(v) for v in raw if isinstance(v, str)]
            except Exception:
                aliases = []
            result.append(
                {
                    "email": str(row["email"]),
                    "display_name": str(row["display_name"]),
                    "aliases": aliases,
                    "source": str(row["source"]),
                }
            )
        return result

    def delete_contact(self, email: str) -> bool:
        normalized_email = (email or "").strip().lower()
        if not normalized_email:
            return False
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM learned_contacts WHERE email = ?", (normalized_email,))
            conn.commit()
            return (cur.rowcount or 0) > 0

    def remember_resolution(self, *, query_norm: str, email: str, display_name: str) -> None:
        q = (query_norm or "").strip().lower()
        e = (email or "").strip().lower()
        n = (display_name or "").strip()
        if not q or not e:
            return
        now_ts = time.time()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO resolver_memory (query_norm, email, display_name, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(query_norm) DO UPDATE SET
                    email = excluded.email,
                    display_name = excluded.display_name,
                    updated_at = excluded.updated_at
                """,
                (q, e, n or e.split("@", 1)[0], now_ts),
            )
            conn.commit()

    def get_remembered_resolution(self, query_norm: str) -> dict[str, str] | None:
        q = (query_norm or "").strip().lower()
        if not q:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT email, display_name FROM resolver_memory WHERE query_norm = ?",
                (q,),
            ).fetchone()
        if row is None:
            return None
        return {"email": str(row["email"]), "display_name": str(row["display_name"])}


_store_instance: ContactStore | None = None


def get_contact_store() -> ContactStore:
    global _store_instance
    if _store_instance is None:
        db_path = Path(__file__).resolve().parents[2] / "data" / "cache" / "contact_store.sqlite3"
        _store_instance = ContactStore(db_path=db_path)
    return _store_instance

