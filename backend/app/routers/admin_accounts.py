from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from ..services.account_paths import account_dir
from ..services.account_registry import get_account_registry
from ..services.account_session import get_current_account_id
from ..services.admin_access import admin_email, admin_key, current_account_is_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class LicenseBody(BaseModel):
    accountId: str = Field(min_length=4)
    active: bool


class DeleteBody(BaseModel):
    accountId: str = Field(min_length=4)


def _require_admin(request: Request, x_fm_admin_key: str | None) -> None:
    if current_account_is_admin():
        return
    expected_key = admin_key()
    if expected_key:
        if x_fm_admin_key and x_fm_admin_key.strip() == expected_key:
            return
        raise HTTPException(status_code=401, detail="Ungültiger Admin-Schlüssel.")
    if not admin_email():
        raise HTTPException(
            status_code=503,
            detail="Admin-Zugang ist nicht konfiguriert (FREIRAUM_ADMIN_EMAIL).",
        )
    if not get_current_account_id():
        raise HTTPException(status_code=401, detail="Bitte mit der Admin-E-Mail anmelden.")
    raise HTTPException(status_code=403, detail="Dieses Konto ist kein Admin.")


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


def _public_item(account: dict) -> dict:
    last_login = float(account.get("last_login_at") or 0)
    provider = str(account.get("provider") or "")
    return {
        "id": account["id"],
        "email": account["email"],
        "displayName": account.get("display_name") or "",
        "provider": provider,
        "licenseActive": bool(account.get("license_active")),
        "lastLoginAt": datetime.fromtimestamp(last_login, tz=timezone.utc).isoformat() if last_login else None,
        "mailboxConnected": _mailbox_connected(account["id"]),
        "isAdmin": (account.get("email") or "").strip().lower() == admin_email(),
    }


@router.get("/me")
def admin_me():
    return {
        "ok": True,
        "isAdmin": current_account_is_admin(),
        "adminEmailConfigured": bool(admin_email()),
    }


@router.get("/accounts")
def list_accounts(
    request: Request,
    x_fm_admin_key: str | None = Header(default=None, alias="X-FM-Admin-Key"),
):
    """Nur wer sich eingeloggt hat. Keine Tokens, keine Mails, keine Kontakte."""
    _require_admin(request, x_fm_admin_key)
    items = [_public_item(account) for account in get_account_registry().list_public()]
    return {"ok": True, "items": items}


@router.post("/accounts/license")
def set_license(
    body: LicenseBody,
    request: Request,
    x_fm_admin_key: str | None = Header(default=None, alias="X-FM-Admin-Key"),
):
    _require_admin(request, x_fm_admin_key)
    account = get_account_registry().set_license_active(body.accountId, body.active)
    if not account:
        raise HTTPException(status_code=404, detail="Konto nicht gefunden.")
    return {"ok": True, "item": _public_item(account)}


@router.post("/accounts/delete")
def delete_account(
    body: DeleteBody,
    request: Request,
    x_fm_admin_key: str | None = Header(default=None, alias="X-FM-Admin-Key"),
):
    _require_admin(request, x_fm_admin_key)
    current = get_current_account_id()
    if current and current == body.accountId:
        raise HTTPException(status_code=400, detail="Das eigene Admin-Konto kann nicht gelöscht werden.")
    account = get_account_registry().get(body.accountId)
    if account and (account.get("email") or "").strip().lower() == admin_email():
        raise HTTPException(status_code=400, detail="Das Admin-Konto kann nicht gelöscht werden.")
    deleted = get_account_registry().delete_account(body.accountId)
    if not deleted:
        raise HTTPException(status_code=404, detail="Konto nicht gefunden.")
    try:
        shutil.rmtree(account_dir(body.accountId), ignore_errors=True)
    except Exception:
        pass
    return {"ok": True, "deleted": body.accountId}
