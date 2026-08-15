from __future__ import annotations

import contextvars
import hmac
import hashlib
import os
import secrets
import threading
import time
from typing import Any

from .account_paths import cache_root


COOKIE_NAME = "fm_sid"
CLAIM_TTL_SEC = 180

_current_account_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "fm_current_account_id", default=None
)
_claim_lock = threading.Lock()
_claim_store: dict[str, dict[str, Any]] = {}


def get_current_account_id() -> str | None:
    value = _current_account_id.get()
    if value and value != "_none":
        return value
    return None


def set_current_account_id(account_id: str | None):
    return _current_account_id.set(account_id)


def reset_current_account_id(token) -> None:
    _current_account_id.reset(token)


def _session_secret() -> bytes:
    env = (os.getenv("FM_SESSION_SECRET") or "").strip()
    if env:
        return env.encode("utf-8")
    path = cache_root() / "session_secret"
    if path.exists():
        try:
            return path.read_bytes()
        except Exception:
            pass
    secret = secrets.token_bytes(32)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(secret)
        try:
            os.chmod(path, 0o600)
        except Exception:
            pass
    except Exception:
        pass
    return secret


def sign_account_session(account_id: str) -> str:
    digest = hmac.new(_session_secret(), account_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{account_id}.{digest[:32]}"


def verify_account_session(value: str | None) -> str | None:
    raw = (value or "").strip()
    if "." not in raw:
        return None
    account_id, signature = raw.split(".", 1)
    if not account_id or not signature:
        return None
    expected = hmac.new(_session_secret(), account_id.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(signature, expected):
        return None
    return account_id


def create_claim_token(account_id: str) -> str:
    token = secrets.token_urlsafe(24)
    with _claim_lock:
        now = time.time()
        stale = [key for key, item in _claim_store.items() if float(item.get("exp") or 0) < now]
        for key in stale:
            _claim_store.pop(key, None)
        _claim_store[token] = {"account_id": account_id, "exp": now + CLAIM_TTL_SEC}
    return token


def consume_claim_token(token: str) -> str | None:
    raw = (token or "").strip()
    if not raw:
        return None
    with _claim_lock:
        item = _claim_store.pop(raw, None)
    if not item:
        return None
    if float(item.get("exp") or 0) < time.time():
        return None
    account_id = str(item.get("account_id") or "").strip()
    return account_id or None


def cookie_kwargs(secure: bool) -> dict[str, Any]:
    return {
        "key": COOKIE_NAME,
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "max_age": 60 * 60 * 24 * 30,
        "path": "/",
    }


def request_is_secure(request) -> bool:
    scheme = str(getattr(getattr(request, "url", None), "scheme", "") or "").lower()
    if scheme == "https":
        return True
    forwarded = ""
    try:
        forwarded = (request.headers.get("x-forwarded-proto") or "").split(",", 1)[0].strip().lower()
    except Exception:
        forwarded = ""
    return forwarded == "https"


def attach_session_cookie(request, response, account_id: str) -> None:
    response.set_cookie(value=sign_account_session(account_id), **cookie_kwargs(request_is_secure(request)))


def clear_session_cookie(request, response) -> None:
    secure = request_is_secure(request)
    response.delete_cookie(COOKIE_NAME, path="/", samesite="lax", secure=secure)
