from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from ..services.account_migrate import migrate_legacy_files_into_account
from ..services.account_registry import get_account_registry
from ..services.account_session import (
    attach_session_cookie,
    clear_session_cookie,
    consume_claim_token,
    create_claim_token,
    sign_account_session,
)
from ..services.ms_oauth import (
    clear_auth_session,
    create_authorization_url,
    exchange_code_for_token,
    fetch_graph_profile,
    get_auth_status,
    oauth_config_valid,
    persist_bundle_for_account,
    refresh_access_token,
)


router = APIRouter(prefix="/api/auth/microsoft", tags=["auth"])


class ClaimRequest(BaseModel):
    claim: str


def _frontend_redirect(status: dict) -> str:
    return status.get("frontendRedirect") or "http://localhost:5173/mail/compose"


@router.get("/status")
def microsoft_auth_status():
    return {"ok": True, **get_auth_status()}


@router.get("/start")
def microsoft_auth_start():
    if not oauth_config_valid():
        raise HTTPException(
            status_code=503,
            detail="Microsoft OAuth ist nicht konfiguriert. Bitte MSGRAPH_TENANT_ID, MSGRAPH_CLIENT_ID, MS_OAUTH_REDIRECT_URI und (für Backend-Flow) MSGRAPH_CLIENT_SECRET setzen.",
        )
    try:
        _, auth_url = create_authorization_url()
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
    frontend_redirect = _frontend_redirect(status)

    if error:
        query = urlencode({"ms_oauth": "error", "reason": error, "detail": (error_description or "")[:200]})
        return RedirectResponse(url=f"{frontend_redirect}?{query}")

    if not code or not state:
        query = urlencode({"ms_oauth": "error", "reason": "missing_code_or_state"})
        return RedirectResponse(url=f"{frontend_redirect}?{query}")

    try:
        bundle = exchange_code_for_token(code=code, state=state)
        profile = fetch_graph_profile(bundle.access_token)
        account = get_account_registry().upsert_from_mailbox(
            email=profile["email"],
            display_name=profile.get("display_name") or "",
            provider="microsoft",
        )
        persist_bundle_for_account(account["id"], bundle)
        migrate_legacy_files_into_account(account["id"])
        claim = create_claim_token(account["id"])
        query = urlencode({"ms_oauth": "connected", "fm_claim": claim})
        return RedirectResponse(url=f"{frontend_redirect}?{query}")
    except Exception as exc:
        query = urlencode({"ms_oauth": "error", "reason": "token_exchange_failed", "detail": str(exc)[:200]})
        return RedirectResponse(url=f"{frontend_redirect}?{query}")


@router.post("/claim")
def microsoft_auth_claim(req: ClaimRequest, request: Request):
    account_id = consume_claim_token(req.claim)
    if not account_id:
        raise HTTPException(status_code=401, detail="Login-Claim ungültig oder abgelaufen.")
    account = get_account_registry().get(account_id)
    if account is None:
        raise HTTPException(status_code=401, detail="Konto nicht gefunden.")
    response = JSONResponse(
        {
            "ok": True,
            "connected": True,
            "accountId": account["id"],
            "accountEmail": account["email"],
            "accountDisplayName": account.get("display_name"),
            "sessionToken": sign_account_session(account_id),
        }
    )
    attach_session_cookie(request, response, account_id)
    return response


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
def microsoft_auth_logout(request: Request):
    clear_auth_session()
    response = JSONResponse({"ok": True, "connected": False})
    clear_session_cookie(request, response)
    return response
