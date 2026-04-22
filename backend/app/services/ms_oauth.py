from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import requests


GRAPH_AUTH_BASE = "https://login.microsoftonline.com"
DEFAULT_SCOPES = "openid profile offline_access User.Read Contacts.Read Mail.ReadWrite Mail.Send"


def _tenant_id() -> str:
    return (os.getenv("MSGRAPH_TENANT_ID") or "").strip()


def _client_id() -> str:
    return (os.getenv("MSGRAPH_CLIENT_ID") or "").strip()


def _client_secret() -> str:
    return (os.getenv("MSGRAPH_CLIENT_SECRET") or "").strip()


def _redirect_uri() -> str:
    value = (os.getenv("MS_OAUTH_REDIRECT_URI") or "http://localhost:30521/api/auth/microsoft/callback").strip()
    # Azure erlaubt lokal meist "http://localhost" einfacher als 127.0.0.1.
    if value.startswith("http://127.0.0.1:"):
        value = value.replace("http://127.0.0.1", "http://localhost", 1)
    return value


def _frontend_redirect_uri() -> str:
    return (os.getenv("MS_OAUTH_FRONTEND_REDIRECT") or "http://localhost:5173/mail/compose").strip()


def _public_client_mode() -> bool:
    # Option B (confidential backend flow) ist Default.
    value = (os.getenv("MS_OAUTH_PUBLIC_CLIENT") or "false").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _authorization_redirect_uri() -> str:
    # Public-Client: zuerst ins Frontend und von dort kontrolliert an /callback bridgen.
    if _public_client_mode():
        return _frontend_redirect_uri()
    return _redirect_uri()


def _scopes() -> str:
    return (os.getenv("MS_OAUTH_SCOPES") or DEFAULT_SCOPES).strip()


def oauth_config_valid() -> bool:
    if not (_tenant_id() and _client_id() and _authorization_redirect_uri()):
        return False
    if _public_client_mode():
        return True
    return bool(_client_secret())


@dataclass
class OAuthState:
    created_at: float
    code_verifier: str
    redirect_uri: str


@dataclass
class TokenBundle:
    access_token: str
    refresh_token: str | None
    expires_at: float
    scope: str
    token_type: str
    id_token: str | None
    user_hint: str | None
    redirect_uri: str


_state_store: Dict[str, OAuthState] = {}
_state_inflight: Dict[str, float] = {}
_state_completed: Dict[str, float] = {}
_token_bundle: TokenBundle | None = None
_token_loaded_from_disk = False
_token_lock = threading.RLock()


def _now() -> float:
    return time.time()


def _session_file_path() -> Path:
    configured = (os.getenv("MS_OAUTH_SESSION_FILE") or "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "data" / "cache" / "ms_oauth_session.json"


def _save_token_bundle_to_disk(bundle: TokenBundle) -> None:
    path = _session_file_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "access_token": bundle.access_token,
            "refresh_token": bundle.refresh_token,
            "expires_at": bundle.expires_at,
            "scope": bundle.scope,
            "token_type": bundle.token_type,
            "id_token": bundle.id_token,
            "user_hint": bundle.user_hint,
            "redirect_uri": bundle.redirect_uri,
        }
        encoded = json.dumps(payload)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(path.parent), delete=False) as tmp:
            tmp.write(encoded)
            tmp_path = Path(tmp.name)
        try:
            os.chmod(tmp_path, 0o600)
        except Exception:
            # Best effort: chmod ist plattform-/filesystem-abhängig.
            pass
        tmp_path.replace(path)
        try:
            os.chmod(path, 0o600)
        except Exception:
            pass
    except Exception:
        # Persistenz ist Best-Effort, Laufzeitbetrieb darf nicht scheitern.
        pass


def _clear_token_bundle_from_disk() -> None:
    path = _session_file_path()
    try:
        if path.exists():
            path.unlink()
    except Exception:
        pass


def _load_token_bundle_from_disk() -> TokenBundle | None:
    path = _session_file_path()
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        access_token = str(raw.get("access_token") or "")
        if not access_token:
            return None
        return TokenBundle(
            access_token=access_token,
            refresh_token=(str(raw.get("refresh_token")) if raw.get("refresh_token") else None),
            expires_at=float(raw.get("expires_at") or 0.0),
            scope=str(raw.get("scope") or ""),
            token_type=str(raw.get("token_type") or "Bearer"),
            id_token=(str(raw.get("id_token")) if raw.get("id_token") else None),
            user_hint=(str(raw.get("user_hint")) if raw.get("user_hint") else None),
            redirect_uri=str(raw.get("redirect_uri") or _authorization_redirect_uri()),
        )
    except Exception:
        return None


def _ensure_token_loaded() -> None:
    global _token_bundle, _token_loaded_from_disk
    with _token_lock:
        if _token_bundle is not None or _token_loaded_from_disk:
            return
        _token_loaded_from_disk = True
        persisted = _load_token_bundle_from_disk()
        if persisted is not None:
            _token_bundle = persisted


def _cleanup_state_store(ttl_seconds: int = 600) -> None:
    threshold = _now() - ttl_seconds
    stale = [key for key, value in _state_store.items() if value.created_at < threshold]
    for key in stale:
        _state_store.pop(key, None)
    stale_processing = [key for key, started_at in _state_inflight.items() if started_at < threshold]
    for key in stale_processing:
        _state_inflight.pop(key, None)
    stale_completed = [key for key, completed_at in _state_completed.items() if completed_at < threshold]
    for key in stale_completed:
        _state_completed.pop(key, None)


def _build_pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode("utf-8").rstrip("=")
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return verifier, challenge


def create_authorization_url() -> tuple[str, str]:
    if not oauth_config_valid():
        raise RuntimeError(
            "OAuth Konfiguration unvollständig "
            "(MSGRAPH_TENANT_ID / MSGRAPH_CLIENT_ID / MS_OAUTH_REDIRECT_URI"
            + (" / MSGRAPH_CLIENT_SECRET" if not _public_client_mode() else "")
            + ")."
        )
    _cleanup_state_store()
    state = secrets.token_urlsafe(24)
    code_verifier, code_challenge = _build_pkce_pair()
    redirect_uri = _authorization_redirect_uri()
    _state_store[state] = OAuthState(created_at=_now(), code_verifier=code_verifier, redirect_uri=redirect_uri)
    query = urlencode(
        {
            "client_id": _client_id(),
            "response_type": "code",
            "redirect_uri": redirect_uri,
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


def _store_token_payload(payload: Dict[str, Any], redirect_uri: str) -> TokenBundle:
    global _token_bundle
    with _token_lock:
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
            redirect_uri=redirect_uri,
        )
        _token_bundle = bundle
        _save_token_bundle_to_disk(bundle)
        return bundle


def exchange_code_for_token(code: str, state: str) -> TokenBundle:
    if not oauth_config_valid():
        raise RuntimeError("OAuth Konfiguration unvollständig.")
    if not code or not state:
        raise RuntimeError("Fehlender OAuth code/state.")
    with _token_lock:
        _cleanup_state_store()
        state_entry = _state_store.get(state)
        if state_entry is None:
            # Idempotenz: Doppelte Callback-Aufrufe nach erfolgreichem Abschluss tolerieren.
            if state in _state_completed and _token_bundle is not None and bool(_token_bundle.access_token):
                return _token_bundle
            raise RuntimeError("Ungültiger oder abgelaufener OAuth state.")
        if state in _state_inflight:
            if _token_bundle is not None and bool(_token_bundle.access_token):
                return _token_bundle
            raise RuntimeError("OAuth state wird bereits verarbeitet.")

        _state_inflight[state] = _now()

    try:
        response = requests.post(
            _token_endpoint(),
            data={
                "client_id": _client_id(),
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": state_entry.redirect_uri,
                "code_verifier": state_entry.code_verifier,
                **({"client_secret": _client_secret()} if (not _public_client_mode() and _client_secret()) else {}),
            },
            timeout=15,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"OAuth Token-Austausch fehlgeschlagen ({response.status_code}): {response.text[:220]}")
        payload = response.json() if response.content else {}
        bundle = _store_token_payload(payload, redirect_uri=state_entry.redirect_uri)
        if not bundle.access_token:
            raise RuntimeError("OAuth Token-Antwort enthält kein access_token.")
        with _token_lock:
            _state_store.pop(state, None)
            _state_completed[state] = _now()
        return bundle
    finally:
        with _token_lock:
            _state_inflight.pop(state, None)


def refresh_access_token() -> TokenBundle:
    global _token_bundle
    with _token_lock:
        if not oauth_config_valid():
            raise RuntimeError("OAuth Konfiguration unvollständig.")
        if _token_bundle is None or not _token_bundle.refresh_token:
            raise RuntimeError("Kein refresh_token vorhanden.")
        redirect_uri = _token_bundle.redirect_uri or _authorization_redirect_uri()
        refresh_token = _token_bundle.refresh_token
        response = requests.post(
            _token_endpoint(),
            data={
                "client_id": _client_id(),
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "redirect_uri": redirect_uri,
                "scope": _scopes(),
                **({"client_secret": _client_secret()} if (not _public_client_mode() and _client_secret()) else {}),
            },
            timeout=15,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"OAuth Token-Refresh fehlgeschlagen ({response.status_code}): {response.text[:220]}")
        payload = response.json() if response.content else {}
        bundle = _store_token_payload(payload, redirect_uri=redirect_uri)
        if not bundle.access_token:
            raise RuntimeError("OAuth Refresh-Antwort enthält kein access_token.")
        return bundle


def get_valid_access_token(refresh_if_needed: bool = True) -> str | None:
    global _token_bundle
    _ensure_token_loaded()
    with _token_lock:
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
    _ensure_token_loaded()
    if _token_bundle is None:
        return {
            "connected": False,
            "provider": "microsoft",
            "frontendRedirect": _frontend_redirect_uri(),
            "oauthConfigured": oauth_config_valid(),
        }
    # "connected" soll den tatsächlich nutzbaren Tokenzustand widerspiegeln.
    active_token = get_valid_access_token(refresh_if_needed=True)
    remaining = int(max(0, _token_bundle.expires_at - _now()))
    return {
        "connected": bool(active_token),
        "provider": "microsoft",
        "oauthConfigured": oauth_config_valid(),
        "scopes": _token_bundle.scope,
        "tokenType": _token_bundle.token_type,
        "expiresInSec": remaining,
        "frontendRedirect": _frontend_redirect_uri(),
    }


def clear_auth_session() -> None:
    global _token_bundle
    with _token_lock:
        _token_bundle = None
        _state_store.clear()
        _state_inflight.clear()
        _state_completed.clear()
        _clear_token_bundle_from_disk()
