from __future__ import annotations

import hashlib
import os
from pathlib import Path


def data_root() -> Path:
    configured = (os.getenv("FREIRAUM_DATA_DIR") or "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "data"


def cache_root() -> Path:
    return data_root() / "cache"


def accounts_root() -> Path:
    path = data_root() / "accounts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def account_id_from_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    digest = hashlib.sha256(f"ms-mailbox:{normalized}".encode("utf-8")).hexdigest()
    return digest[:16]


def account_dir(account_id: str) -> Path:
    safe = "".join(ch for ch in (account_id or "") if ch.isalnum() or ch in {"-", "_"})
    if not safe:
        safe = "_none"
    path = accounts_root() / safe
    path.mkdir(parents=True, exist_ok=True)
    return path
