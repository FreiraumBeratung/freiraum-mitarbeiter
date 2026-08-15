from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from ..services.account_paths import account_dir
from ..services.account_registry import get_account_registry

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(x_fm_admin_key: str | None) -> None:
    expected = (os.getenv("FM_ADMIN_KEY") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Admin-Zugang ist nicht konfiguriert (FM_ADMIN_KEY).")
    if not x_fm_admin_key or x_fm_admin_key.strip() != expected:
        raise HTTPException(status_code=401, detail="Ungültiger Admin-Schlüssel.")


def _mailbox_connected(account_id: str) -> bool:
    folder = account_dir(account_id)
    if (folder / "ms_oauth_session.json").exists():
        return True
    setup_path = folder / "mail_setup_state.json"
    if not setup_path.exists():
        return False
    try:
        raw = json.loads(setup_path.read_text(encoding="utf-8"))
        imap = raw.get("imap") if isinstance(raw, dict) else {}
        if not isinstance(imap, dict):
            return False
        return bool(imap.get("host") and imap.get("user"))
    except Exception:
        return False


@router.get("/accounts")
def list_accounts(x_fm_admin_key: str | None = Header(default=None, alias="X-FM-Admin-Key")):
    """Nur wer sich eingeloggt hat. Keine Tokens, keine Mails, keine Kontakte."""
    _require_admin(x_fm_admin_key)
    items = []
    for account in get_account_registry().list_public():
        last_login = float(account.get("last_login_at") or 0)
        provider = str(account.get("provider") or "")
        items.append(
            {
                "id": account["id"],
                "email": account["email"],
                "displayName": account.get("display_name") or "",
                "provider": provider,
                "licenseActive": bool(account.get("license_active")),
                "lastLoginAt": datetime.fromtimestamp(last_login, tz=timezone.utc).isoformat() if last_login else None,
                "mailboxConnected": _mailbox_connected(account["id"]),
            }
        )
    return {"ok": True, "items": items}
