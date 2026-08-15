from __future__ import annotations

import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from .account_paths import account_dir, cache_root
from .account_session import get_current_account_id


def _cache_dir() -> Path:
    data_dir = (os.getenv("FREIRAUM_DATA_DIR") or "").strip()
    if data_dir:
        return Path(data_dir) / "cache"
    return Path(__file__).resolve().parents[2] / "data" / "cache"


def _db_path() -> Path:
    account_id = get_current_account_id()
    if account_id:
        return account_dir(account_id) / "mail_signatures.sqlite3"
    return cache_root() / "mail_signatures.sqlite3"


class MailSignatureStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._path = _db_path()
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS signatures (
                        account_key TEXT PRIMARY KEY,
                        sender_email TEXT NOT NULL,
                        html_signature TEXT,
                        text_signature TEXT,
                        source TEXT,
                        updated_at INTEGER NOT NULL
                    )
                    """
                )
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _normalize_key(account_key: str) -> str:
        return (account_key or "").strip().lower()

    def get_signature(self, account_key: str) -> dict[str, Any] | None:
        key = self._normalize_key(account_key)
        if not key:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT account_key, sender_email, html_signature, text_signature, source, updated_at
                    FROM signatures
                    WHERE account_key = ?
                    """,
                    (key,),
                ).fetchone()
                if row is None:
                    return None
                return {
                    "account_key": row["account_key"],
                    "sender_email": row["sender_email"],
                    "html_signature": row["html_signature"] or "",
                    "text_signature": row["text_signature"] or "",
                    "source": row["source"] or "",
                    "updated_at": int(row["updated_at"] or 0),
                }
            finally:
                conn.close()

    def set_signature(
        self,
        *,
        account_key: str,
        sender_email: str,
        html_signature: str | None,
        text_signature: str | None,
        source: str,
    ) -> dict[str, Any]:
        key = self._normalize_key(account_key)
        sender = (sender_email or "").strip().lower() or key
        html_value = (html_signature or "").strip()
        text_value = (text_signature or "").strip()
        if not key:
            raise ValueError("account_key is required")
        if not html_value and not text_value:
            raise ValueError("at least one signature variant is required")
        updated_at = int(time.time())
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO signatures (account_key, sender_email, html_signature, text_signature, source, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(account_key) DO UPDATE SET
                        sender_email = excluded.sender_email,
                        html_signature = excluded.html_signature,
                        text_signature = excluded.text_signature,
                        source = excluded.source,
                        updated_at = excluded.updated_at
                    """,
                    (key, sender, html_value, text_value, (source or "").strip(), updated_at),
                )
                conn.commit()
            finally:
                conn.close()
        return {
            "account_key": key,
            "sender_email": sender,
            "html_signature": html_value,
            "text_signature": text_value,
            "source": (source or "").strip(),
            "updated_at": updated_at,
        }


_STORES: dict[str, MailSignatureStore] = {}


def get_mail_signature_store() -> MailSignatureStore:
    account_id = get_current_account_id() or "_none"
    existing = _STORES.get(account_id)
    if existing is not None:
        return existing
    store = MailSignatureStore()
    _STORES[account_id] = store
    return store

