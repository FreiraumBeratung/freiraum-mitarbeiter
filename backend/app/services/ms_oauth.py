from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import requests


GRAPH_AUTH_BASE = "https://login.microsoftonline.com"
DEFAULT_SCOPES = "openid profile offline_access User.Read Contacts.Read Mail.ReadWrite Mail.Send"


def _tenant_id() -> str:
    return (os.getenv("MSGRAPH_TENANT_ID") or "").strip()


def _client_id() -> str:
    return (os.getenv("MSGRAPH_CLIENT_ID") or "").strip()


def _redirect_uri() -> str:
    value = (os.getenv("MS_OAUTH_REDIRECT_URI") or "http://localhost:30521/api/auth/microsoft/callback").strip()
    # Azure erlaubt lokal meist "http://localhost" einfacher als 127.0.0.1.
    if value.startswith("http://127.0.0.1:"):
        value = value.replace("http://127.0.0.1", "http://localhost", 1)
    return value


def _frontend_redirect_uri() -> str:
    return (os.getenv("MS_OAUTH_FRONTEND_REDIRECT") or "http://localhost:5173/mail/compose").strip()


def _scopes() -> str:
    return (os.getenv("MS_OAUTH_SCOPES") or DEFAULT_SCOPES).strip()


def oauth_config_valid() -> bool:
    return bool(_tenant_id() and _client_id() and _redirect_uri())


@dataclass
class OAuthState:
    created_at: float
    code_verifier: str


@dataclass
class TokenBundle:
    access_token: str
    refresh_token: str | None
    expires_at: float
    scope: str
    token_type: str
    id_token: str | None
    user_hint: str | None


_state_store: Dict[str, OAuthState] = {}
_token_bundle: TokenBundle | None = None


def _now() -> float:
    return time.time()


def _cleanup_state_store(ttl_seconds: int = 600) -> None:
    threshold = _now() - ttl_seconds
    stale = [key for key, value in _state_store.items() if value.created_at < threshold]
    for key in stale:
        _state_store.pop(key, None)


def _build_pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode("utf-8").rstrip("=")
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return verifier, challenge


def create_authorization_url() -> tuple[str, str]:
    if not oauth_config_valid():
        raise RuntimeError("OAuth Konfiguration unvollständig (MSGRAPH_TENANT_ID / MSGRAPH_CLIENT_ID / MS_OAUTH_REDIRECT_URI).")
    _cleanup_state_store()
    state = secrets.token_urlsafe(24)
    code_verifier, code_challenge = _build_pkce_pair()
    _state_store[state] = OAuthState(created_at=_now(), code_verifier=code_verifier)
    query = urlencode(
        {
            "client_id": _client_id(),
            "response_type": "code",
            "redirect_uri": _redirect_uri(),
            "response_mode": "query",
            "scope": _scopes(),
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    auth_url = f"{GRAPH_AUTH_BASE}/{_tenant_id()}/oauth2/v2.0/authorize?{query}"
    return state, auth_url


def _token_endpoint() -> str:
    return f"{GRAPH_AUTH_BASE}/{_tenant_id()}/oauth2/v2.0/token"


def _store_token_payload(payload: Dict[str, Any]) -> TokenBundle:
    global _token_bundle
    expires_in = int(payload.get("expires_in") or 0)
    expires_at = _now() + max(60, expires_in)
    bundle = TokenBundle(
        access_token=str(payload.get("access_token") or ""),
        refresh_token=(str(payload.get("refresh_token")) if payload.get("refresh_token") else None),
        expires_at=expires_at,
        scope=str(payload.get("scope") or ""),
        token_type=str(payload.get("token_type") or "Bearer"),
        id_token=(str(payload.get("id_token")) if payload.get("id_token") else None),
        user_hint=None,
    )
    _token_bundle = bundle
    return bundle


def exchange_code_for_token(code: str, state: str) -> TokenBundle:
    if not oauth_config_valid():
        raise RuntimeError("OAuth Konfiguration unvollständig.")
    if not code or not state:
        raise RuntimeError("Fehlender OAuth code/state.")
    _cleanup_state_store()
    state_entry = _state_store.pop(state, None)
    if state_entry is None:
        raise RuntimeError("Ungültiger oder abgelaufener OAuth state.")

    response = requests.post(
        _token_endpoint(),
        data={
            "client_id": _client_id(),
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _redirect_uri(),
            "code_verifier": state_entry.code_verifier,
        },
        timeout=15,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OAuth Token-Austausch fehlgeschlagen ({response.status_code}): {response.text[:220]}")
    payload = response.json() if response.content else {}
    bundle = _store_token_payload(payload)
    if not bundle.access_token:
        raise RuntimeError("OAuth Token-Antwort enthält kein access_token.")
    return bundle


def refresh_access_token() -> TokenBundle:
    global _token_bundle
    if not oauth_config_valid():
        raise RuntimeError("OAuth Konfiguration unvollständig.")
    if _token_bundle is None or not _token_bundle.refresh_token:
        raise RuntimeError("Kein refresh_token vorhanden.")
    response = requests.post(
        _token_endpoint(),
        data={
            "client_id": _client_id(),
            "grant_type": "refresh_token",
            "refresh_token": _token_bundle.refresh_token,
            "redirect_uri": _redirect_uri(),
            "scope": _scopes(),
        },
        timeout=15,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OAuth Token-Refresh fehlgeschlagen ({response.status_code}): {response.text[:220]}")
    payload = response.json() if response.content else {}
    bundle = _store_token_payload(payload)
    if not bundle.access_token:
        raise RuntimeError("OAuth Refresh-Antwort enthält kein access_token.")
    return bundle


def get_valid_access_token(refresh_if_needed: bool = True) -> str | None:
    global _token_bundle
    if _token_bundle is None or not _token_bundle.access_token:
        return None
    # 60s Puffer
    if _token_bundle.expires_at > (_now() + 60):
        return _token_bundle.access_token
    if not refresh_if_needed:
        return None
    try:
        refreshed = refresh_access_token()
        return refreshed.access_token
    except Exception:
        return None


def get_auth_status() -> Dict[str, Any]:
    if _token_bundle is None:
        return {
            "connected": False,
            "provider": "microsoft",
            "frontendRedirect": _frontend_redirect_uri(),
            "oauthConfigured": oauth_config_valid(),
        }
    remaining = int(max(0, _token_bundle.expires_at - _now()))
    return {
        "connected": bool(_token_bundle.access_token),
        "provider": "microsoft",
        "oauthConfigured": oauth_config_valid(),
        "scopes": _token_bundle.scope,
        "tokenType": _token_bundle.token_type,
        "expiresInSec": remaining,
        "frontendRedirect": _frontend_redirect_uri(),
    }


def clear_auth_session() -> None:
    global _token_bundle
    _token_bundle = None
    _state_store.clear()
