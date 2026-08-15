from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from .account_paths import account_id_from_email, cache_root


class AccountRegistry:
    def __init__(self, db_path: Path | None = None) -> None:
        self._lock = threading.RLock()
        self._path = db_path or (cache_root() / "accounts.sqlite3")
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    display_name TEXT,
                    provider TEXT NOT NULL DEFAULT 'microsoft',
                    created_at REAL NOT NULL,
                    last_login_at REAL NOT NULL,
                    license_active INTEGER NOT NULL DEFAULT 1
                )
                """
            )
            conn.commit()

    def upsert_from_mailbox(self, *, email: str, display_name: str = "", provider: str = "imap_smtp") -> dict[str, Any]:
        normalized = (email or "").strip().lower()
        if not normalized or "@" not in normalized:
            raise ValueError("mailbox email required")
        account_id = account_id_from_email(normalized)
        name = (display_name or "").strip() or normalized.split("@", 1)[0]
        provider_value = (provider or "imap_smtp").strip().lower()
        if provider_value not in {"imap_smtp", "microsoft"}:
            provider_value = "imap_smtp"
        now_ts = time.time()
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT id, created_at FROM accounts WHERE id = ?", (account_id,)).fetchone()
            if row is None:
                conn.execute(
                    """
                    INSERT INTO accounts (id, email, display_name, provider, created_at, last_login_at, license_active)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                    """,
                    (account_id, normalized, name, provider_value, now_ts, now_ts),
                )
            else:
                conn.execute(
                    """
                    UPDATE accounts
                    SET email = ?, display_name = ?, provider = ?, last_login_at = ?
                    WHERE id = ?
                    """,
                    (normalized, name, provider_value, now_ts, account_id),
                )
            conn.commit()
        return self.get(account_id) or {
            "id": account_id,
            "email": normalized,
            "display_name": name,
            "provider": provider_value,
            "created_at": now_ts,
            "last_login_at": now_ts,
            "license_active": True,
        }

    def get(self, account_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, email, display_name, provider, created_at, last_login_at, license_active
                FROM accounts
                WHERE id = ?
                """,
                (account_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row(row)

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        normalized = (email or "").strip().lower()
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, email, display_name, provider, created_at, last_login_at, license_active
                FROM accounts
                WHERE email = ?
                """,
                (normalized,),
            ).fetchone()
        if row is None:
            return None
        return self._row(row)

    def list_public(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, email, display_name, provider, created_at, last_login_at, license_active
                FROM accounts
                ORDER BY last_login_at DESC
                """
            ).fetchall()
        return [self._row(row) for row in rows]

    @staticmethod
    def _row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "email": str(row["email"]),
            "display_name": str(row["display_name"] or ""),
            "provider": str(row["provider"] or "microsoft"),
            "created_at": float(row["created_at"] or 0),
            "last_login_at": float(row["last_login_at"] or 0),
            "license_active": bool(row["license_active"]),
        }


_registry: AccountRegistry | None = None


def get_account_registry() -> AccountRegistry:
    global _registry
    if _registry is None:
        _registry = AccountRegistry()
    return _registry
