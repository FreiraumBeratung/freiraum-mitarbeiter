from __future__ import annotations

import time
import logging

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from ..services.account_migrate import migrate_legacy_files_into_account
from ..services.account_registry import get_account_registry
from ..services.account_session import (
    attach_session_cookie,
    get_current_account_id,
    set_current_account_id,
    sign_account_session,
)
from ..services.mail_autodiscover import discover_mail_servers, verify_imap, verify_smtp
from ..services.mail_setup_store import get_mail_setup_store
from ..services.ms_oauth import get_auth_status

router = APIRouter(prefix="/api/setup/mail", tags=["mail-setup"])
logger = logging.getLogger(__name__)


class ProviderRequest(BaseModel):
    provider: str = Field(description="graph | imap_smtp")


class ImapSetupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    useAdvanced: bool = False
    imapHost: str | None = None
    imapPort: int | None = None
    smtpHost: str | None = None
    smtpPort: int | None = None
    smtpUseTls: bool | None = None
    smtpUseSsl: bool | None = None


def _require_account() -> str:
    account_id = get_current_account_id()
    if not account_id:
        raise HTTPException(status_code=401, detail="Nicht angemeldet.")
    return account_id


def _empty_setup_status(oauth: dict) -> dict:
    return {
        "ok": True,
        "provider": None,
        "onboardingComplete": False,
        "graph": {
            "connected": False,
            "configured": bool(oauth.get("oauthConfigured")),
        },
        "imap": {"configured": False, "host": None, "port": None, "user": None},
        "smtp": {
            "configured": False,
            "host": None,
            "port": None,
            "user": None,
            "useTls": False,
            "useSsl": False,
        },
        "updatedAt": None,
    }


@router.get("/status")
def get_setup_status(request: Request, response: Response):
    oauth = get_auth_status() or {}
    account_id = get_current_account_id()
    if not account_id:
        return _empty_setup_status(oauth)
    attach_session_cookie(request, response, account_id)
    store = get_mail_setup_store()
    state = store.get_state()
    imap = state.get("imap") or {}
    smtp = state.get("smtp") or {}
    provider = state.get("provider")
    imap_configured = bool(imap.get("host") and imap.get("user") and imap.get("password"))
    smtp_configured = bool(smtp.get("host") and smtp.get("user") and smtp.get("password"))
    onboarding_complete = bool(state.get("onboarding_complete"))

    graph_ready = bool(oauth.get("connected"))
    if provider == "graph":
        onboarding_complete = onboarding_complete and graph_ready
    elif provider == "imap_smtp":
        onboarding_complete = onboarding_complete and imap_configured and smtp_configured

    return {
        "ok": True,
        "provider": provider,
        "onboardingComplete": onboarding_complete,
        "graph": {
            "connected": graph_ready,
            "configured": bool(oauth.get("oauthConfigured")),
        },
        "imap": {
            "configured": imap_configured,
            "host": imap.get("host"),
            "port": imap.get("port"),
            "user": imap.get("user"),
        },
        "smtp": {
            "configured": smtp_configured,
            "host": smtp.get("host"),
            "port": smtp.get("port"),
            "user": smtp.get("user"),
            "useTls": bool(smtp.get("use_tls")),
            "useSsl": bool(smtp.get("use_ssl")),
        },
        "updatedAt": state.get("updated_at"),
    }


@router.post("/provider")
def set_provider(req: ProviderRequest):
    try:
        logger.info("mail_setup.provider.set.start provider=%s", req.provider)
        if not get_current_account_id():
            # Vor dem Login noch keine Konto-Datei. Auswahl bleibt im Frontend.
            return {"ok": True, "provider": req.provider}
        state = get_mail_setup_store().set_provider(req.provider)
        logger.info("mail_setup.provider.set.ok provider=%s", state.get("provider"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "provider": state.get("provider")}


@router.post("/graph/complete")
def mark_graph_complete():
    _require_account()
    oauth = get_auth_status() or {}
    if not oauth.get("connected"):
        raise HTTPException(status_code=400, detail="Microsoft OAuth ist nicht verbunden.")
    store = get_mail_setup_store()
    store.set_provider("graph")
    state = store.set_onboarding_complete(True)
    return {"ok": True, "provider": state.get("provider"), "onboardingComplete": bool(state.get("onboarding_complete"))}


@router.post("/imap/setup")
def setup_imap(req: ImapSetupRequest, request: Request, response: Response):
    email = str(req.email).strip().lower()
    password = req.password
    logger.info("mail_setup.imap.setup.start email=%s advanced=%s", email, bool(req.useAdvanced))
    if req.useAdvanced:
        if not (req.imapHost and req.imapPort and req.smtpHost and req.smtpPort):
            raise HTTPException(status_code=400, detail="Erweiterte Einstellungen unvollständig.")
        candidates = [
            {
                "imap_host": req.imapHost.strip(),
                "imap_port": int(req.imapPort),
                "smtp_host": req.smtpHost.strip(),
                "smtp_port": int(req.smtpPort),
                "smtp_use_tls": bool(req.smtpUseTls) if req.smtpUseTls is not None else (int(req.smtpPort) == 587),
                "smtp_use_ssl": bool(req.smtpUseSsl) if req.smtpUseSsl is not None else (int(req.smtpPort) == 465),
                "source": "manual",
            }
        ]
    else:
        candidates = discover_mail_servers(email)
        if not candidates:
            raise HTTPException(
                status_code=400,
                detail="Keine Auto-Discovery Treffer. Bitte über Erweiterte Einstellungen Host/Port manuell setzen.",
            )
        # Keep auto-discovery snappy: first best candidates only.
        candidates = candidates[:2]

    last_errors: list[str] = []
    started_at = time.monotonic()
    total_timeout_sec = 22.0
    for candidate in candidates:
        logger.info(
            "mail_setup.imap.candidate imap=%s:%s smtp=%s:%s source=%s",
            candidate["imap_host"],
            int(candidate["imap_port"]),
            candidate["smtp_host"],
            int(candidate["smtp_port"]),
            candidate.get("source"),
        )
        elapsed = time.monotonic() - started_at
        remaining = total_timeout_sec - elapsed
        if remaining <= 1.5:
            last_errors.append("Verbindungsprüfung hat das Zeitlimit erreicht.")
            break
        per_check_timeout = max(3.5, min(8.0, remaining / 2))
        imap_ok, imap_err = verify_imap(
            host=candidate["imap_host"],
            port=int(candidate["imap_port"]),
            username=email,
            password=password,
            timeout_sec=per_check_timeout,
        )
        if not imap_ok:
            last_errors.append(f"IMAP {candidate['imap_host']}:{candidate['imap_port']} -> {imap_err}")
            logger.warning("mail_setup.imap.imap_fail %s", last_errors[-1])
            continue
        smtp_ok, smtp_err = verify_smtp(
            host=candidate["smtp_host"],
            port=int(candidate["smtp_port"]),
            username=email,
            password=password,
            use_tls=bool(candidate["smtp_use_tls"]),
            use_ssl=bool(candidate["smtp_use_ssl"]),
            timeout_sec=per_check_timeout,
        )
        if not smtp_ok:
            last_errors.append(f"SMTP {candidate['smtp_host']}:{candidate['smtp_port']} -> {smtp_err}")
            logger.warning("mail_setup.imap.smtp_fail %s", last_errors[-1])
            continue

        existing = get_account_registry().get_by_email(email)
        if existing and not existing.get("license_active"):
            raise HTTPException(status_code=403, detail="Dieses Konto ist pausiert. Bitte den Admin kontaktieren.")
        account = get_account_registry().upsert_from_mailbox(email=email, provider="imap_smtp")
        set_current_account_id(account["id"])
        migrate_legacy_files_into_account(account["id"])
        attach_session_cookie(request, response, account["id"])
        store = get_mail_setup_store()
        state = store.set_imap_smtp_credentials(
            imap_host=candidate["imap_host"],
            imap_port=int(candidate["imap_port"]),
            imap_user=email,
            imap_password=password,
            smtp_host=candidate["smtp_host"],
            smtp_port=int(candidate["smtp_port"]),
            smtp_user=email,
            smtp_password=password,
            smtp_use_tls=bool(candidate["smtp_use_tls"]),
            smtp_use_ssl=bool(candidate["smtp_use_ssl"]),
        )
        logger.info("mail_setup.imap.setup.ok provider=%s", state.get("provider"))
        return {
            "ok": True,
            "provider": state.get("provider"),
            "onboardingComplete": bool(state.get("onboarding_complete")),
            "sessionToken": sign_account_session(account["id"]),
            "config": {
                "imapHost": candidate["imap_host"],
                "imapPort": int(candidate["imap_port"]),
                "smtpHost": candidate["smtp_host"],
                "smtpPort": int(candidate["smtp_port"]),
                "smtpUseTls": bool(candidate["smtp_use_tls"]),
                "smtpUseSsl": bool(candidate["smtp_use_ssl"]),
                "source": candidate.get("source"),
            },
        }

    raise HTTPException(
        status_code=400,
        detail={
            "message": "Auto-Setup fehlgeschlagen. Bitte Erweiterte Einstellungen verwenden.",
            "requiresAdvanced": True,
            "errors": last_errors[-4:],
        },
    )


@router.post("/reset")
def reset_setup():
    _require_account()
    state = get_mail_setup_store().clear()
    return {"ok": True, "provider": state.get("provider"), "onboardingComplete": bool(state.get("onboarding_complete"))}

