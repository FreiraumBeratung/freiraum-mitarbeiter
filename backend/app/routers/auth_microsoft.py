from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from ..services.ms_oauth import (
    clear_auth_session,
    create_authorization_url,
    exchange_code_for_token,
    get_auth_status,
    oauth_config_valid,
    refresh_access_token,
)


router = APIRouter(prefix="/api/auth/microsoft", tags=["auth"])


@router.get("/status")
def microsoft_auth_status():
    return {"ok": True, **get_auth_status()}


@router.get("/start")
def microsoft_auth_start():
    if not oauth_config_valid():
        raise HTTPException(
            status_code=503,
            detail="Microsoft OAuth ist nicht konfiguriert. Bitte MSGRAPH_TENANT_ID, MSGRAPH_CLIENT_ID und MS_OAUTH_REDIRECT_URI setzen.",
        )
    try:
        _, auth_url = create_authorization_url()
        # Safety-net: Azure akzeptiert lokal robust "http://localhost" als Redirect.
        parsed = urlparse(auth_url)
        query_items = dict(parse_qsl(parsed.query, keep_blank_values=True))
        redirect_uri = (query_items.get("redirect_uri") or "").strip()
        if redirect_uri.startswith("http://127.0.0.1:"):
            query_items["redirect_uri"] = redirect_uri.replace("http://127.0.0.1", "http://localhost", 1)
            auth_url = urlunparse(parsed._replace(query=urlencode(query_items)))
        return {"ok": True, "authUrl": auth_url}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OAuth Start fehlgeschlagen: {exc}") from exc


@router.get("/callback")
def microsoft_auth_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
):
    status = get_auth_status()
    frontend_redirect = status.get("frontendRedirect") or "http://localhost:5173/mail/compose"

    if error:
        query = urlencode({"ms_oauth": "error", "reason": error, "detail": (error_description or "")[:200]})
        return RedirectResponse(url=f"{frontend_redirect}?{query}")

    if not code or not state:
        query = urlencode({"ms_oauth": "error", "reason": "missing_code_or_state"})
        return RedirectResponse(url=f"{frontend_redirect}?{query}")

    try:
        exchange_code_for_token(code=code, state=state)
        query = urlencode({"ms_oauth": "connected"})
        return RedirectResponse(url=f"{frontend_redirect}?{query}")
    except Exception as exc:
        query = urlencode({"ms_oauth": "error", "reason": "token_exchange_failed", "detail": str(exc)[:200]})
        return RedirectResponse(url=f"{frontend_redirect}?{query}")


@router.post("/refresh")
def microsoft_auth_refresh():
    try:
        bundle = refresh_access_token()
        import time

        return {
            "ok": True,
            "connected": True,
            "expiresInSec": int(max(0, bundle.expires_at - time.time())),
            "scopes": bundle.scope,
        }
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"OAuth Refresh fehlgeschlagen: {exc}") from exc


@router.post("/logout")
def microsoft_auth_logout():
    clear_auth_session()
    return {"ok": True, "connected": False}
