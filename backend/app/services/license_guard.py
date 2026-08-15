from __future__ import annotations

from .account_registry import get_account_registry
from .account_session import get_current_account_id

LICENSE_PAUSED_DETAIL = (
    "Ihre Lizenz wurde pausiert. Bitte setzen Sie sich mit Freiraum Beratung in Kontakt."
)

_ALLOW_PREFIXES = ("/metrics", "/docs", "/openapi", "/redoc")
_ALLOW_EXACT = {
    "/api/setup/mail/status",
    "/api/auth/microsoft/status",
    "/api/auth/microsoft/logout",
    "/api/setup/mail/reset",
    "/api/setup/mail/imap/setup",
    "/api/admin/me",
}


def current_account_license_paused() -> bool:
    account_id = get_current_account_id()
    if not account_id:
        return False
    try:
        account = get_account_registry().get(account_id)
    except Exception:
        return False
    if not account:
        return False
    return not bool(account.get("license_active"))


def license_pause_blocks_path(path: str, method: str = "GET") -> bool:
    method_u = (method or "GET").upper()
    if method_u == "OPTIONS":
        return False
    normalized = (path or "").split("?", 1)[0].rstrip("/") or "/"
    if any(normalized.startswith(prefix) for prefix in _ALLOW_PREFIXES):
        return False
    if normalized in _ALLOW_EXACT:
        return False
    if normalized.startswith("/api/admin"):
        return False
    return True
