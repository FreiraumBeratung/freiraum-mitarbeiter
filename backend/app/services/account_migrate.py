from __future__ import annotations

import shutil
from pathlib import Path

from .account_paths import account_dir, cache_root


def _move_if_exists(src: Path, dest: Path) -> None:
    if not src.exists() or dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.move(str(src), str(dest))
    except Exception:
        try:
            shutil.copy2(str(src), str(dest))
        except Exception:
            pass


def migrate_legacy_files_into_account(account_id: str) -> None:
    """Verschiebt alte Einzelplatz-Dateien in den Account-Ordner. Kein Token-Inhalt wird kopiert ins Registry."""
    if not account_id:
        return
    target = account_dir(account_id)
    cache = cache_root()
    _move_if_exists(cache / "ms_oauth_session.json", target / "ms_oauth_session.json")
    _move_if_exists(cache / "contact_store.sqlite3", target / "contact_store.sqlite3")
    _move_if_exists(cache / "mail_setup_state.json", target / "mail_setup_state.json")
    _move_if_exists(cache / "mail_signatures.sqlite3", target / "mail_signatures.sqlite3")
