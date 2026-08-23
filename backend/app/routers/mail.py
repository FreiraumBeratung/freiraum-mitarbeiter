# backend/app/routers/mail.py

import logging
import os
import base64
import smtplib
import ssl
import imaplib
import email
import html as html_lib
import re
import time
import unicodedata
import requests
from email.header import decode_header
from email.message import EmailMessage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr

from ..services.account_session import get_current_account_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mail", tags=["mail"])


def _require_account() -> str:
    account_id = get_current_account_id()
    if not account_id:
        raise HTTPException(status_code=401, detail="Nicht angemeldet.")
    return account_id

# Pfade für E-Mail-Assets
# mail.py liegt in backend/app/routers → parents[2] = backend, parents[3] = Repo-Root
BASE_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EMAIL_LOGO_PATH = BASE_DIR / "data" / "assets" / "freiraum-email-logo.png.png"
EMAIL_LOGO_PATH = Path(os.getenv("EMAIL_LOGO_PATH", str(DEFAULT_EMAIL_LOGO_PATH)))
_DATA_IMG_SRC_RE = re.compile(
    r"""(<img\b[^>]*?\bsrc\s*=\s*["'])(data:(image/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+))(["'])""",
    re.IGNORECASE,
)


def _resolve_email_logo_path() -> Path | None:
    candidates = [
        EMAIL_LOGO_PATH,
        BASE_DIR / "data" / "assets" / "freiraum-email-logo.png",
        BASE_DIR / "data" / "assets" / "freiraum-email-logo.png.png",
        REPO_ROOT / "frontend" / "fm-app" / "public" / "branding" / "freiraum-logo.png",
    ]
    seen: set[str] = set()
    for candidate in candidates:
        try:
            resolved = Path(candidate).expanduser().resolve()
        except Exception:
            continue
        key = str(resolved).lower()
        if key in seen:
            continue
        seen.add(key)
        if resolved.is_file() and resolved.stat().st_size > 32:
            return resolved
    return None


def _prepare_signature_inline_images(html_body: str) -> tuple[str, list[tuple[str, bytes, str]]]:
    """data:image in der Signatur → cid, damit Apple Mail / Outlook das Logo anzeigen."""
    parts: list[tuple[str, bytes, str]] = []
    html = html_body or ""
    counter = 0

    def _replace(match: re.Match) -> str:
        nonlocal counter
        mime = (match.group(3) or "image/png").split(";", 1)[0].strip().lower()
        raw_b64 = re.sub(r"\s+", "", match.group(4) or "")
        try:
            payload = base64.b64decode(raw_b64)
        except Exception:
            return match.group(0)
        if not payload or len(payload) > 1_500_000:
            return match.group(0)
        if not mime.startswith("image/"):
            mime = "image/png"
        counter += 1
        cid = f"sigimg{counter}"
        parts.append((cid, payload, mime))
        return f"{match.group(1)}cid:{cid}{match.group(5)}"

    html = _DATA_IMG_SRC_RE.sub(_replace, html)
    return html, parts


class MailAttachmentIn(BaseModel):
    filename: str
    contentType: str
    contentBase64: str


class MailSendRequest(BaseModel):
    to: EmailStr
    subject: str | None = None
    body: str
    attachments: list[MailAttachmentIn] | None = None


_MAX_ATTACHMENTS = 3
_MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
_MAX_ATTACHMENT_TOTAL = 10 * 1024 * 1024
_ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def _safe_attachment_filename(name: str) -> str:
    base = Path(str(name or "anhang")).name.replace("\\", "_").replace("/", "_")
    cleaned = re.sub(r"[^A-Za-z0-9._\- äöüÄÖÜß()]+", "_", base).strip(" ._")
    if not cleaned or cleaned in {".", ".."}:
        cleaned = "anhang"
    return cleaned[:120]


def _attachment_magic_ok(content_type: str, payload: bytes) -> bool:
    if not payload:
        return False
    if content_type == "image/jpeg":
        return payload.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return payload.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/gif":
        return payload.startswith(b"GIF87a") or payload.startswith(b"GIF89a")
    if content_type == "image/webp":
        return payload[:4] == b"RIFF" and payload[8:12] == b"WEBP"
    if content_type == "application/pdf":
        return payload.startswith(b"%PDF")
    if content_type == "text/plain":
        return b"\x00" not in payload[:4096]
    if "openxmlformats" in content_type:
        return payload.startswith(b"PK")
    return True


def _normalize_outgoing_attachments(items: list[MailAttachmentIn] | None) -> list[tuple[str, str, bytes]]:
    if not items:
        return []
    if len(items) > _MAX_ATTACHMENTS:
        raise HTTPException(status_code=400, detail="Höchstens drei Anhänge.")
    out: list[tuple[str, str, bytes]] = []
    total = 0
    for item in items:
        filename = _safe_attachment_filename(item.filename)
        content_type = str(item.contentType or "").strip().lower().split(";", 1)[0]
        if content_type not in _ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(status_code=400, detail="Dieser Dateityp ist als Anhang nicht erlaubt.")
        raw_b64 = re.sub(r"\s+", "", str(item.contentBase64 or ""))
        if not raw_b64 or len(raw_b64) > 8_000_000:
            raise HTTPException(status_code=400, detail="Anhang ist leer oder zu groß.")
        try:
            payload = base64.b64decode(raw_b64, validate=True)
        except Exception:
            raise HTTPException(status_code=400, detail="Anhang konnte nicht gelesen werden.")
        if len(payload) > _MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=400, detail="Ein Anhang ist größer als 4 MB.")
        total += len(payload)
        if total > _MAX_ATTACHMENT_TOTAL:
            raise HTTPException(status_code=400, detail="Anhänge zusammen größer als 10 MB.")
        if not _attachment_magic_ok(content_type, payload):
            raise HTTPException(status_code=400, detail="Anhang passt nicht zum Dateityp.")
        out.append((filename, content_type, payload))
    return out


def _attach_files_to_mime(msg: MIMEMultipart, attachments: list[tuple[str, str, bytes]]) -> None:
    for filename, content_type, payload in attachments:
        if content_type.startswith("image/"):
            subtype = content_type.split("/", 1)[-1]
            part = MIMEImage(payload, _subtype=subtype)
        elif content_type == "text/plain":
            part = MIMEText(payload.decode("utf-8", "replace"), "plain", "utf-8")
        else:
            subtype = content_type.split("/", 1)[-1] if "/" in content_type else "octet-stream"
            part = MIMEApplication(payload, _subtype=subtype)
        part.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(part)


class MailSendResponse(BaseModel):
    status: str
    result: str | None = None


class MailModeStatusResponse(BaseModel):
    ok: bool
    preferredMode: str
    activeMode: str
    graphEnabled: bool
    graphFallbackEnabled: bool
    oauthConnected: bool
    graphMailboxAvailable: bool
    imapAvailable: bool
    smtpAvailable: bool
    reason: str | None = None


class InboxMessageItem(BaseModel):
    uid: str
    messageId: str | None = None
    subject: str
    fromName: str | None = None
    fromEmail: str | None = None
    receivedAt: str | None = None
    preview: str | None = None
    isRead: bool = False


class InboxListResponse(BaseModel):
    ok: bool
    total: int
    items: list[InboxMessageItem]


class InboxMessageDetailResponse(BaseModel):
    ok: bool
    uid: str
    messageId: str | None = None
    subject: str
    fromName: str | None = None
    fromEmail: str | None = None
    to: list[str]
    receivedAt: str | None = None
    bodyText: str
    bodyHtml: str | None = None


class SignatureImportResponse(BaseModel):
    ok: bool
    accountKey: str
    imported: bool
    source: str
    reason: str | None = None


def _imap_host() -> str:
    setup = _mail_setup_state()
    imap = setup.get("imap") if isinstance(setup, dict) else {}
    value = (imap.get("host") if isinstance(imap, dict) else "") or os.getenv("IMAP_HOST", "")
    return str(value).strip()


def _imap_port() -> int:
    setup = _mail_setup_state()
    imap = setup.get("imap") if isinstance(setup, dict) else {}
    value = (imap.get("port") if isinstance(imap, dict) else None) or os.getenv("IMAP_PORT", "993")
    try:
        return int(value)
    except Exception:
        return 993


def _imap_user() -> str:
    setup = _mail_setup_state()
    imap = setup.get("imap") if isinstance(setup, dict) else {}
    value = (imap.get("user") if isinstance(imap, dict) else None) or os.getenv("IMAP_USER") or os.getenv("IMAP_USERNAME") or ""
    return str(value).strip()


def _imap_pass() -> str:
    setup = _mail_setup_state()
    imap = setup.get("imap") if isinstance(setup, dict) else {}
    value = (imap.get("password") if isinstance(imap, dict) else None) or os.getenv("IMAP_PASS") or os.getenv("IMAP_PASSWORD") or ""
    return str(value)


def _smtp_host() -> str:
    setup = _mail_setup_state()
    smtp = setup.get("smtp") if isinstance(setup, dict) else {}
    value = (smtp.get("host") if isinstance(smtp, dict) else None) or os.getenv("SMTP_HOST") or ""
    return str(value).strip()


def _smtp_port() -> int:
    setup = _mail_setup_state()
    smtp = setup.get("smtp") if isinstance(setup, dict) else {}
    value = (smtp.get("port") if isinstance(smtp, dict) else None) or os.getenv("SMTP_PORT", "465")
    try:
        return int(value)
    except Exception:
        return 465


def _smtp_user() -> str:
    setup = _mail_setup_state()
    smtp = setup.get("smtp") if isinstance(setup, dict) else {}
    value = (smtp.get("user") if isinstance(smtp, dict) else None) or os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER") or ""
    return str(value).strip()


def _smtp_pass() -> str:
    setup = _mail_setup_state()
    smtp = setup.get("smtp") if isinstance(setup, dict) else {}
    value = (smtp.get("password") if isinstance(smtp, dict) else None) or os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS") or ""
    return str(value)


def _smtp_use_tls() -> bool:
    setup = _mail_setup_state()
    smtp = setup.get("smtp") if isinstance(setup, dict) else {}
    if isinstance(smtp, dict) and "use_tls" in smtp:
        return bool(smtp.get("use_tls"))
    return (os.getenv("SMTP_USE_TLS", "false").lower() in ("1", "true", "yes"))


def _smtp_use_ssl() -> bool:
    setup = _mail_setup_state()
    smtp = setup.get("smtp") if isinstance(setup, dict) else {}
    if isinstance(smtp, dict) and "use_ssl" in smtp:
        return bool(smtp.get("use_ssl"))
    return (os.getenv("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes"))


def _mail_setup_state() -> dict:
    try:
        from ..services.mail_setup_store import get_mail_setup_store

        return get_mail_setup_store().get_state() or {}
    except Exception:
        return {}


DEFAULT_SIGNATURE_HTML = """
<br><br>
<strong style="font-family: Arial, sans-serif; font-size: 16px;">Mit freundlichen Grüßen</strong>
<br><br>
<strong style="font-family: Arial, sans-serif; font-size: 16px;">Denis Bytyqi</strong><br>
<span style="font-family: Arial, sans-serif; font-size: 14px; font-style: italic;">Geschäftsführer</span>
<br><br>
<span style="font-family: Arial, sans-serif; font-size: 14px;">
Digitale Ordnung & Optimierung<br>
Digitale Architektur für Sauerland-Unternehmen<br>
Effiziente Prozesse · Automatisierung · Überblick
</span>
<br><br>
<span style="font-family: Arial, sans-serif; font-size: 14px;">
<strong>E-Mail:</strong> <a href="mailto:info@freiraum-unternehmensberatung.de">info@freiraum-unternehmensberatung.de</a><br>
<strong>Mobil:</strong> <a href="tel:015156538030">0151 56538030</a>
</span>
<br><br>
<img src="cid:freiraum_logo" width="230" style="display:block; margin-top:10px;" alt="Freiraum Logo">
""".strip()

DEFAULT_SIGNATURE_TEXT = (
    "\n\n"
    "Mit freundlichen Grüßen\n\n"
    "Denis Bytyqi\n"
    "Geschäftsführer\n\n"
    "Digitale Ordnung & Optimierung\n"
    "Digitale Architektur für Sauerland-Unternehmen\n"
    "Effiziente Prozesse · Automatisierung · Überblick\n\n"
    "E-Mail: info@freiraum-unternehmensberatung.de\n"
    "Mobil: 0151 56538030\n"
)

SIGNATURE_MARKERS = [
    "mit freundlichen grüßen",
    "mit freundlichen grussen",
    "freundliche grüße",
    "freundliche grusse",
    "liebe grüße",
    "liebe grusse",
    "viele grüße",
    "viele grusse",
    "beste grüße",
    "beste grusse",
    "best regards",
    "kind regards",
]

_GRAPH_ACCOUNT_EMAIL_CACHE: dict[str, str | float] = {"value": "", "expires_at": 0.0}
_IMAP_SENT_FOLDER_CACHE: dict[str, str] = {}


def _mail_signature_store():
    from ..services.mail_signature_store import get_mail_signature_store

    return get_mail_signature_store()


def _imap_sent_folder_candidates() -> list[str]:
    return [
        "INBOX.Gesendet",
        "INBOX.Sent",
        "Gesendet",
        "Sent",
        "Sent Items",
        "INBOX.Sent Items",
    ]


def _safe_imap_folder_name(value: str | None) -> str:
    cleaned = (value or "").strip()
    if not cleaned or len(cleaned) > 200 or any(ch in cleaned for ch in ("\n", "\r", "\x00")):
        return ""
    return cleaned


def _stored_imap_sent_folder() -> str:
    setup = _mail_setup_state()
    imap = setup.get("imap") if isinstance(setup, dict) else {}
    if not isinstance(imap, dict):
        return ""
    return _safe_imap_folder_name(str(imap.get("sent_folder") or ""))


def _remember_imap_sent_folder(folder_name: str) -> None:
    cleaned = _safe_imap_folder_name(folder_name)
    if not cleaned:
        return
    account_id = get_current_account_id() or ""
    if account_id:
        _IMAP_SENT_FOLDER_CACHE[account_id] = cleaned
    try:
        from ..services.mail_setup_store import get_mail_setup_store

        get_mail_setup_store().set_imap_sent_folder(cleaned)
    except Exception:
        return


def _parse_imap_list_mailbox_name(line: str) -> str:
    text = (line or "").strip()
    if not text:
        return ""
    match = re.search(r'\s"([^"]+)"\s*$', text)
    if match:
        return _safe_imap_folder_name(match.group(1))
    parts = text.split()
    if not parts:
        return ""
    return _safe_imap_folder_name(parts[-1].strip('"'))


def _imap_list_sent_folder(client: imaplib.IMAP4_SSL) -> str | None:
    rows: list = []
    for args in ((), ("", "*")):
        try:
            status, data = client.list(*args) if args else client.list()
        except Exception:
            continue
        if status != "OK" or not data:
            continue
        rows.extend(data)
    for raw in rows:
        if not raw:
            continue
        line = raw.decode("utf-8", "replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
        lowered = line.lower()
        if "\\sent" not in lowered:
            continue
        name = _parse_imap_list_mailbox_name(line)
        if name:
            return name
    return None


def _try_select_imap_folder(client: imaplib.IMAP4_SSL, folder_name: str) -> bool:
    cleaned = _safe_imap_folder_name(folder_name)
    if not cleaned:
        return False
    for name in (cleaned, f'"{cleaned}"'):
        try:
            status, _ = client.select(name, readonly=True)
            if status == "OK":
                return True
        except Exception:
            continue
    return False


def _parse_imap_fetch_payload(fetch_data) -> tuple[bytes | None, bool]:
    is_read = False
    raw_email = None
    for part in fetch_data or []:
        if not (isinstance(part, tuple) and len(part) > 1):
            continue
        meta = part[0]
        payload = part[1]
        if isinstance(meta, (bytes, bytearray)) and b"FLAGS" in meta and b"\\Seen" in meta:
            is_read = True
        if isinstance(payload, str):
            payload = payload.encode("utf-8", "replace")
        if isinstance(payload, (bytes, bytearray)) and payload:
            raw_email = bytes(payload)
            break
    return raw_email, is_read


def _fetch_imap_list_headers(client: imaplib.IMAP4_SSL, uid: str) -> tuple[bytes | None, bool]:
    safe_uid = "".join(ch for ch in (uid or "") if ch.isdigit())
    if not safe_uid:
        return None, False
    for spec in ("(FLAGS BODY.PEEK[HEADER])", "(FLAGS RFC822.HEADER)", "(FLAGS RFC822)"):
        try:
            fetch_status, fetch_data = client.uid("FETCH", safe_uid, spec)
        except Exception:
            continue
        if fetch_status != "OK" or not fetch_data:
            continue
        raw_email, is_read = _parse_imap_fetch_payload(fetch_data)
        if raw_email:
            return raw_email, is_read
    return None, False


def _normalize_account_key(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    return normalized if "@" in normalized else ""


def _graph_account_email() -> str:
    now = time.time()
    cached = str(_GRAPH_ACCOUNT_EMAIL_CACHE.get("value") or "").strip().lower()
    expires_at = float(_GRAPH_ACCOUNT_EMAIL_CACHE.get("expires_at") or 0.0)
    if cached and expires_at > now:
        return cached
    try:
        response = _graph_request("GET", "/me", params={"$select": "mail,userPrincipalName"}, timeout_sec=8)
        if response.status_code >= 400:
            return ""
        payload = response.json() if response.content else {}
        if not isinstance(payload, dict):
            return ""
        address = str(payload.get("mail") or payload.get("userPrincipalName") or "").strip().lower()
        if "@" not in address:
            return ""
        _GRAPH_ACCOUNT_EMAIL_CACHE["value"] = address
        _GRAPH_ACCOUNT_EMAIL_CACHE["expires_at"] = now + 300
        return address
    except Exception:
        return ""


def _active_signature_account_key() -> str:
    if _graph_mail_mode_enabled():
        graph_email = _graph_account_email()
        if graph_email:
            return graph_email
    return _normalize_account_key(_smtp_user()) or _normalize_account_key(_imap_user())


def _graph_mail_mode_enabled() -> bool:
    setup = _mail_setup_state()
    provider = str(setup.get("provider") or "").strip().lower()
    if provider == "imap_smtp":
        return False
    if provider == "graph":
        return True
    # Produktmodus: Mail transportiert über Graph statt IMAP/SMTP.
    value = (os.getenv("GRAPH_MAIL_MODE", "true") or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _graph_auto_fallback_enabled() -> bool:
    # Wenn Graph-Mailbox nicht verfügbar ist, automatisch IMAP/SMTP nutzen.
    value = (os.getenv("GRAPH_MAIL_AUTO_FALLBACK", "true") or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _imap_config_available() -> bool:
    return bool(_imap_host() and _imap_user() and _imap_pass())


def _smtp_config_available() -> bool:
    host = _smtp_host()
    username = _smtp_user()
    password = _smtp_pass()
    return bool(host and username and password)


def _graph_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def _graph_access_token() -> str:
    try:
        from ..services.ms_oauth import get_valid_access_token
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Microsoft OAuth Service nicht verfügbar.") from exc

    token = (get_valid_access_token(refresh_if_needed=True) or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Microsoft OAuth Token im Backend nicht verfügbar.")
    return token


def _graph_request(
    method: str,
    path: str,
    *,
    params: dict | None = None,
    json_payload: dict | None = None,
    timeout_sec: float = 15,
) -> requests.Response:
    base = "https://graph.microsoft.com/v1.0"
    url = path if path.startswith("http://") or path.startswith("https://") else f"{base}{path}"
    access_token = _graph_access_token()
    headers = _graph_headers(access_token)
    if params and "$count" in params:
        headers["ConsistencyLevel"] = "eventual"

    response = requests.request(method, url, headers=headers, params=params, json=json_payload, timeout=timeout_sec)
    if response.status_code in (429, 503, 504):
        # Kurzer Retry bei transienten Graph-Fehlern.
        time.sleep(0.8)
        response = requests.request(method, url, headers=headers, params=params, json=json_payload, timeout=timeout_sec)
    if response.status_code == 401:
        # Einmaliger Refresh-Versuch bei abgelaufenem Token.
        try:
            from ..services.ms_oauth import refresh_access_token

            refreshed = refresh_access_token()
            headers = _graph_headers(refreshed.access_token)
            if params and "$count" in params:
                headers["ConsistencyLevel"] = "eventual"
            response = requests.request(method, url, headers=headers, params=params, json=json_payload, timeout=timeout_sec)
            if response.status_code in (429, 503, 504):
                time.sleep(0.8)
                response = requests.request(method, url, headers=headers, params=params, json=json_payload, timeout=timeout_sec)
        except Exception:
            pass
    return response


def _graph_raise_for_status(response: requests.Response, default_detail: str) -> None:
    if response.status_code < 400:
        return
    try:
        detail = response.json()
    except Exception:
        detail = response.text[:300]
    if response.status_code in (401, 403):
        if not (response.text or "").strip():
            mailbox_detail = _graph_mailbox_unavailable_detail()
            if mailbox_detail:
                raise HTTPException(status_code=403, detail=mailbox_detail)
        raise HTTPException(status_code=response.status_code, detail=f"Microsoft Graph Auth-Fehler ({response.status_code}): {detail}")
    raise HTTPException(status_code=502, detail=f"{default_detail} (Graph {response.status_code}): {detail}")


def _graph_to_inbox_item(row: dict) -> InboxMessageItem:
    sender = row.get("from") or {}
    sender_addr = sender.get("emailAddress") or {}
    received_at = row.get("receivedDateTime")
    preview = _normalize_preview((row.get("bodyPreview") or "").strip()) if row.get("bodyPreview") else None
    return InboxMessageItem(
        uid=(row.get("id") or "").strip(),
        messageId=(row.get("internetMessageId") or None),
        subject=(row.get("subject") or "(ohne Betreff)").strip() or "(ohne Betreff)",
        fromName=(sender_addr.get("name") or None),
        fromEmail=(sender_addr.get("address") or None),
        receivedAt=(received_at or None),
        preview=preview,
        isRead=bool(row.get("isRead", False)),
    )


def _graph_to_sent_item(row: dict) -> InboxMessageItem:
    recipients = row.get("toRecipients") or []
    primary = recipients[0] if isinstance(recipients, list) and recipients else {}
    addr = (primary.get("emailAddress") or {}) if isinstance(primary, dict) else {}
    received_at = row.get("receivedDateTime")
    preview = _normalize_preview((row.get("bodyPreview") or "").strip()) if row.get("bodyPreview") else None
    return InboxMessageItem(
        uid=(row.get("id") or "").strip(),
        messageId=(row.get("internetMessageId") or None),
        subject=(row.get("subject") or "(ohne Betreff)").strip() or "(ohne Betreff)",
        fromName=(addr.get("name") or None),
        fromEmail=(addr.get("address") or None),
        receivedAt=(received_at or None),
        preview=preview,
        isRead=True,
    )


def _graph_mailbox_unavailable_detail() -> str | None:
    """
    Liefert eine klare Diagnose, wenn der angemeldete Graph-User kein Exchange-Postfach hat
    (typisch bei externen Gastkonten mit #EXT#).
    """
    try:
        response = _graph_request(
            "GET",
            "/me",
            params={
                "$select": "id,mail,userPrincipalName,displayName",
            },
        )
        if response.status_code >= 400:
            return None
        payload = response.json() if response.content else {}
        if not isinstance(payload, dict):
            return None
        upn = str(payload.get("userPrincipalName") or "").strip()
        mail = str(payload.get("mail") or "").strip()
        if not mail or "#EXT#" in upn.upper():
            return (
                "Der angemeldete Microsoft-Account hat in diesem Tenant kein Exchange-Postfach "
                "(Gastkonto/externes Konto erkannt). Bitte mit einem mailbox-fähigen Outlook/Exchange-Konto anmelden."
            )
        return None
    except Exception:
        return None


def _is_graph_mailbox_unavailable_error(exc: HTTPException) -> bool:
    detail = str(exc.detail or "")
    return "kein Exchange-Postfach" in detail or "Gastkonto/externes Konto" in detail


def _probe_graph_mailbox_capability() -> tuple[bool, str | None]:
    try:
        response = _graph_request(
            "GET",
            "/me/messages",
            params={"$top": 1, "$select": "id"},
            timeout_sec=8,
        )
        if response.status_code < 400:
            return True, None
        if response.status_code in (401, 403):
            mailbox_detail = _graph_mailbox_unavailable_detail()
            if mailbox_detail:
                return False, mailbox_detail
            return False, f"Graph Auth-Fehler ({response.status_code})"
        return False, f"Graph-Fehler ({response.status_code})"
    except HTTPException as exc:
        if _is_graph_mailbox_unavailable_error(exc):
            return False, str(exc.detail)
        return False, str(exc.detail)
    except Exception:
        return False, "Graph Mailbox-Check fehlgeschlagen."


def _html_to_text(value: str) -> str:
    compact = value or ""
    compact = re.sub(r"<style[\s\S]*?</style>", " ", compact, flags=re.IGNORECASE)
    compact = re.sub(r"<script[\s\S]*?</script>", " ", compact, flags=re.IGNORECASE)
    # Block-level HTML tags into line breaks for readability.
    compact = re.sub(r"(?i)</?(br|p|div|li|tr|h[1-6]|section|article|table|ul|ol)>", "\n", compact)
    compact = re.sub(r"<[^>]+>", " ", compact)
    compact = html_lib.unescape(compact)
    # Remove very long tracking URLs that destroy readability.
    compact = re.sub(r"https?://\S{70,}", " ", compact, flags=re.IGNORECASE)
    compact = re.sub(r"[ \t]+", " ", compact)
    compact = re.sub(r"\n{3,}", "\n\n", compact)
    compact = "\n".join(line.strip() for line in compact.splitlines() if line.strip())
    # Drop lines that are mostly URL/query noise.
    cleaned_lines: list[str] = []
    for line in compact.splitlines():
        if len(line) > 140 and ("utm_" in line.lower() or "trk=" in line.lower() or "?" in line and "&" in line):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


def _sanitize_html_for_render(value: str) -> str:
    safe = value or ""
    safe = re.sub(r"<script[\s\S]*?</script>", "", safe, flags=re.IGNORECASE)
    safe = re.sub(r"<style[\s\S]*?</style>", "", safe, flags=re.IGNORECASE)
    safe = re.sub(r"<(iframe|object|embed|meta|base|link|form|input|button|textarea|select)[\s\S]*?>[\s\S]*?</\1>", "", safe, flags=re.IGNORECASE)
    safe = re.sub(r"<(iframe|object|embed|meta|base|link|form|input|button|textarea|select)\b[^>]*?/?>", "", safe, flags=re.IGNORECASE)
    safe = re.sub(r"\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", safe, flags=re.IGNORECASE)
    safe = re.sub(
        r"\s(href|src)\s*=\s*([\"'])\s*(javascript:|vbscript:|data:text/html)[^\"']*\2",
        r' \1="#"',
        safe,
        flags=re.IGNORECASE,
    )
    return safe.strip()


def _collect_inline_image_data_uris(msg: email.message.Message) -> dict[str, str]:
    inline_map: dict[str, str] = {}
    if not msg.is_multipart():
        return inline_map
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        content_type = (part.get_content_type() or "").lower()
        if not content_type.startswith("image/"):
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        # Sicherheits-/Performance-Grenze für data-uri Rendering.
        if len(payload) > 1_500_000:
            continue
        encoded = base64.b64encode(payload).decode("ascii")
        data_uri = f"data:{content_type};base64,{encoded}"
        content_id = (part.get("Content-ID") or "").strip().strip("<>").lower()
        content_location = (part.get("Content-Location") or "").strip().strip("<>").lower()
        if content_id:
            inline_map[content_id] = data_uri
        if content_location:
            inline_map[content_location] = data_uri
    return inline_map


def _replace_cid_sources_with_data_uris(html_value: str, inline_map: dict[str, str]) -> str:
    output = html_value or ""
    if not output or not inline_map:
        return output
    for cid_key, data_uri in inline_map.items():
        if not cid_key:
            continue
        pattern = rf"cid:\s*<?{re.escape(cid_key)}>?"
        output = re.sub(pattern, data_uri, output, flags=re.IGNORECASE)
    return output


def _extract_signature_from_text(text: str) -> str:
    raw = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        return ""
    lines = [line.rstrip() for line in raw.split("\n")]
    if not lines:
        return ""
    start_at = -1
    threshold = max(0, len(lines) // 4)
    for idx, line in enumerate(lines):
        lower = line.strip().lower()
        lower_ascii = unicodedata.normalize("NFKD", lower).encode("ascii", "ignore").decode("ascii")
        if not lower:
            continue
        fuzzy_greeting = (
            ("liebe" in lower or "freund" in lower or "viele" in lower or "beste" in lower)
            and "gr" in lower
        )
        if idx >= threshold and (any(marker in lower for marker in SIGNATURE_MARKERS) or any(marker in lower_ascii for marker in SIGNATURE_MARKERS) or fuzzy_greeting):
            start_at = idx
            break
    if start_at < 0:
        for idx, line in enumerate(lines):
            lower = line.strip().lower()
            if idx >= threshold and ("mailto:" in lower or "@" in lower or "tel:" in lower):
                start_at = max(0, idx - 2)
                break
    if start_at < 0:
        return ""
    signature = "\n".join(lines[start_at:]).strip()
    return signature if len(signature) >= 20 else ""


def _extract_signature_from_html(html_value: str) -> str:
    html_raw = (html_value or "").strip()
    if not html_raw:
        return ""
    lowered = html_raw.lower()
    start_at = -1
    for marker in SIGNATURE_MARKERS:
        idx = lowered.find(marker)
        if idx >= 0 and idx > len(html_raw) * 0.2:
            start_at = idx
            break
    if start_at < 0:
        img_idx = lowered.rfind("<img")
        if img_idx >= 0 and img_idx > len(html_raw) * 0.35:
            start_at = img_idx
    if start_at < 0:
        return ""
    block_start = max(
        html_raw.rfind("<table", 0, start_at),
        html_raw.rfind("<div", 0, start_at),
        html_raw.rfind("<p", 0, start_at),
        html_raw.rfind("<br", 0, start_at),
    )
    if block_start < 0:
        block_start = html_raw.rfind("<", 0, start_at)
    if block_start < 0:
        block_start = start_at
    signature = html_raw[block_start:].strip()
    if len(signature) < 30:
        return ""
    return signature


def _learn_contacts_from_inbox_items(items: list[InboxMessageItem]) -> None:
    try:
        from ..services.contact_store import get_contact_store

        store = get_contact_store()
        for item in items:
            email_value = (item.fromEmail or "").strip().lower()
            if not email_value or "@" not in email_value:
                continue
            display = (item.fromName or "").strip() or email_value.split("@", 1)[0]
            aliases = [display, email_value]
            store.upsert_contact(
                email=email_value,
                display_name=display,
                aliases=aliases,
                source="inbox",
            )
    except Exception:
        pass


def _decode_mime_header(value: str | None) -> str:
    if not value:
        return ""
    decoded_parts: list[str] = []
    for text, charset in decode_header(value):
        if isinstance(text, bytes):
            try:
                decoded_parts.append(text.decode(charset or "utf-8", errors="replace"))
            except Exception:
                decoded_parts.append(text.decode("utf-8", errors="replace"))
        else:
            decoded_parts.append(text)
    return "".join(decoded_parts).strip()


def _extract_email_parts(header_value: str | None) -> tuple[str | None, str | None]:
    if not header_value:
        return None, None
    parsed_name, parsed_email = email.utils.parseaddr(header_value)
    name = _decode_mime_header(parsed_name) if parsed_name else None
    addr = parsed_email.strip() if parsed_email else None
    return name or None, addr or None


def _normalize_preview(text: str, max_len: int = 180) -> str:
    compact = re.sub(r"\s+", " ", (text or "")).strip()
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 1].rstrip() + "…"


def _decode_part_payload(part: email.message.Message) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        return ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except Exception:
        return payload.decode("utf-8", errors="replace")


def _looks_machine_like_plain(text: str) -> bool:
    sample = (text or "").strip()
    if not sample:
        return True
    # Viele Tracking-/URL-Fragmente -> unleserliche Plain-Alternative.
    url_hits = len(re.findall(r"https?://", sample, flags=re.IGNORECASE))
    angle_hits = len(re.findall(r"<[^>]{2,}>", sample))
    if (url_hits >= 3 and len(sample) > 180) or (angle_hits >= 3):
        return True
    return False


def _extract_text_from_message(msg: email.message.Message) -> str:
    text_chunks: list[str] = []
    html_chunks: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            content_disposition = (part.get("Content-Disposition") or "").lower()
            if "attachment" in content_disposition:
                continue
            content_type = part.get_content_type()
            decoded = _decode_part_payload(part)
            if not decoded.strip():
                continue
            if content_type == "text/plain":
                text_chunks.append(decoded)
            elif content_type == "text/html":
                html_chunks.append(decoded)
    else:
        content_type = msg.get_content_type()
        decoded = _decode_part_payload(msg)
        if decoded.strip():
            if content_type == "text/html":
                html_chunks.append(decoded)
            else:
                text_chunks.append(decoded)

    plain_text = "\n".join(chunk.strip() for chunk in text_chunks if chunk and chunk.strip()).strip()
    html_text_raw = "\n".join(chunk.strip() for chunk in html_chunks if chunk and chunk.strip()).strip()
    html_text = _html_to_text(html_text_raw) if html_text_raw else ""

    if plain_text and not _looks_machine_like_plain(plain_text):
        return plain_text
    if html_text:
        return html_text
    return plain_text


def _extract_message_content(msg: email.message.Message) -> tuple[str, str]:
    text_chunks: list[str] = []
    html_chunks: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            content_disposition = (part.get("Content-Disposition") or "").lower()
            if "attachment" in content_disposition:
                continue
            content_type = part.get_content_type()
            decoded = _decode_part_payload(part)
            if not decoded.strip():
                continue
            if content_type == "text/plain":
                text_chunks.append(decoded)
            elif content_type == "text/html":
                html_chunks.append(decoded)
    else:
        content_type = msg.get_content_type()
        decoded = _decode_part_payload(msg)
        if decoded.strip():
            if content_type == "text/html":
                html_chunks.append(decoded)
            else:
                text_chunks.append(decoded)

    plain_text = "\n".join(chunk.strip() for chunk in text_chunks if chunk and chunk.strip()).strip()
    html_raw = "\n".join(chunk.strip() for chunk in html_chunks if chunk and chunk.strip()).strip()
    if html_raw:
        inline_map = _collect_inline_image_data_uris(msg)
        if inline_map:
            html_raw = _replace_cid_sources_with_data_uris(html_raw, inline_map)
    html_text = _html_to_text(html_raw) if html_raw else ""
    safe_html = _sanitize_html_for_render(html_raw) if html_raw else ""

    if plain_text and not _looks_machine_like_plain(plain_text):
        return plain_text, safe_html
    if html_text:
        return html_text, safe_html
    return plain_text, safe_html


def _latest_sent_message_content_from_imap() -> tuple[str, str]:
    client = _open_imap_client_with_retry()
    try:
        try:
            _resolve_imap_mailbox(client, "sent")
        except Exception:
            return "", ""
        try:
            search_status, data = client.uid("SEARCH", None, "ALL")
        except Exception:
            return "", ""
        if search_status != "OK" or not data or not data[0]:
            return "", ""
        latest_uid = data[0].split()[-1].decode("utf-8", errors="replace")
        fetch_status, fetch_data = client.uid("FETCH", latest_uid, "(RFC822)")
        if fetch_status != "OK" or not fetch_data:
            return "", ""
        raw_email, _is_read = _parse_imap_fetch_payload(fetch_data)
        if not raw_email:
            return "", ""
        msg = email.message_from_bytes(raw_email)
        return _extract_message_content(msg)
    finally:
        try:
            client.logout()
        except Exception:
            pass
    return "", ""


def _latest_sent_message_content_from_graph() -> tuple[str, str]:
    try:
        response = _graph_request(
            "GET",
            "/me/mailFolders/sentitems/messages",
            params={
                "$top": 5,
                "$orderby": "sentDateTime desc",
                "$select": "id,body",
            },
            timeout_sec=12,
        )
        _graph_raise_for_status(response, "Graph Sent Items konnten nicht geladen werden")
        payload = response.json() if response.content else {}
        values = payload.get("value", []) if isinstance(payload, dict) else []
        if not isinstance(values, list):
            return "", ""
        for entry in values:
            if not isinstance(entry, dict):
                continue
            body_obj = entry.get("body") if isinstance(entry.get("body"), dict) else {}
            content = str(body_obj.get("content") or "").strip()
            content_type = str(body_obj.get("contentType") or "").strip().lower()
            if not content:
                continue
            if content_type == "html":
                safe_html = _sanitize_html_for_render(content)
                text = _html_to_text(content)
                return text, safe_html
            return content, ""
    except Exception:
        return "", ""
    return "", ""


def _import_signature_for_active_account(force: bool = False) -> dict:
    account_key = _active_signature_account_key()
    if not account_key:
        return {"ok": False, "account_key": "", "imported": False, "source": "none", "reason": "Kein aktives Konto erkannt."}
    store = _mail_signature_store()
    existing = store.get_signature(account_key)
    if existing and not force:
        return {"ok": True, "account_key": account_key, "imported": False, "source": "stored", "reason": "Bereits vorhanden."}

    if _graph_mail_mode_enabled():
        body_text, body_html = _latest_sent_message_content_from_graph()
        source = "graph_sent"
    else:
        body_text, body_html = _latest_sent_message_content_from_imap()
        source = "imap_sent"

    if not body_text and not body_html:
        return {"ok": False, "account_key": account_key, "imported": False, "source": source, "reason": "Keine gesendete Nachricht gefunden."}

    text_signature = _extract_signature_from_text(body_text)
    html_signature = _extract_signature_from_html(body_html) if body_html else ""

    if not text_signature and not html_signature:
        return {"ok": False, "account_key": account_key, "imported": False, "source": source, "reason": "Signatur in letzter Nachricht nicht erkannt."}

    if not text_signature and html_signature:
        text_signature = _html_to_text(html_signature)
    if not html_signature and text_signature:
        html_signature = "<br>".join(text_signature.split("\n"))

    store.set_signature(
        account_key=account_key,
        sender_email=account_key,
        html_signature=html_signature,
        text_signature=text_signature,
        source=source,
    )
    return {"ok": True, "account_key": account_key, "imported": True, "source": source, "reason": None}


def _load_signature_bundle_for_account(account_key: str) -> dict:
    store = _mail_signature_store()
    stored = store.get_signature(account_key) if account_key else None
    if stored:
        return {
            "account_key": account_key,
            "html_signature": (stored.get("html_signature") or "").strip(),
            "text_signature": (stored.get("text_signature") or "").strip(),
            "source": str(stored.get("source") or "stored"),
            "is_fallback": False,
        }

    imported = _import_signature_for_active_account(force=False)
    if imported.get("ok") and imported.get("imported"):
        stored2 = store.get_signature(account_key)
        if stored2:
            return {
                "account_key": account_key,
                "html_signature": (stored2.get("html_signature") or "").strip(),
                "text_signature": (stored2.get("text_signature") or "").strip(),
                "source": str(stored2.get("source") or "imported"),
                "is_fallback": False,
            }

    return {
        "account_key": account_key,
        "html_signature": DEFAULT_SIGNATURE_HTML,
        "text_signature": DEFAULT_SIGNATURE_TEXT,
        "source": "backend_fallback",
        "is_fallback": True,
    }


def _open_imap_client() -> imaplib.IMAP4_SSL:
    host = _imap_host()
    user = _imap_user()
    password = _imap_pass()
    if not host or not user or not password:
        raise HTTPException(status_code=503, detail="IMAP Konfiguration unvollständig.")
    try:
        client = imaplib.IMAP4_SSL(host, _imap_port())
        client.login(user, password)
        return client
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("IMAP Verbindung fehlgeschlagen")
        raise HTTPException(status_code=503, detail="IMAP Verbindung fehlgeschlagen.") from exc


def _open_imap_client_with_retry(max_attempts: int = 2, delay_seconds: float = 0.7) -> imaplib.IMAP4_SSL:
    """
    Öffnet IMAP mit kurzem Retry-Backoff.
    Hilft bei temporären Start-/Reconnect-Rennen ohne die API unnötig fehlschlagen zu lassen.
    """
    last_exc: HTTPException | None = None
    attempts = max(1, max_attempts)
    for attempt in range(attempts):
        try:
            return _open_imap_client()
        except HTTPException as exc:
            last_exc = exc
            if exc.status_code != 503 or attempt >= attempts - 1:
                raise
            time.sleep(delay_seconds)
    if last_exc is not None:
        raise last_exc
    raise HTTPException(status_code=503, detail="IMAP Verbindung fehlgeschlagen.")


def _resolve_imap_mailbox(client: imaplib.IMAP4_SSL, mailbox: str) -> str:
    wanted = (mailbox or "inbox").strip().lower()
    if wanted != "sent":
        if _try_select_imap_folder(client, "INBOX"):
            return "INBOX"
        raise HTTPException(status_code=503, detail="INBOX konnte nicht geöffnet werden.")

    account_id = get_current_account_id() or ""
    remembered = _safe_imap_folder_name(_IMAP_SENT_FOLDER_CACHE.get(account_id) or "") or _stored_imap_sent_folder()
    listed = _imap_list_sent_folder(client)
    candidates: list[str] = []
    for name in (remembered, listed, *_imap_sent_folder_candidates()):
        cleaned = _safe_imap_folder_name(name)
        if cleaned and cleaned not in candidates:
            candidates.append(cleaned)
    for folder_name in candidates:
        if _try_select_imap_folder(client, folder_name):
            _remember_imap_sent_folder(folder_name)
            return folder_name
    raise HTTPException(status_code=503, detail="Gesendet-Ordner konnte nicht geöffnet werden.")


def _build_smtp_client() -> smtplib.SMTP:
    """
    Baut und konfiguriert einen SMTP-Client.

    - Nutzt SMTP_USE_SSL / SMTP_USE_TLS aus den Settings, aber:
      * Für Port 587 wird STARTTLS erzwungen (sofern kein reines SSL benutzt wird),
        weil viele Provider AUTH erst nach STARTTLS anbieten.
    """
    host = _smtp_host()
    username = _smtp_user()
    password = _smtp_pass()
    port = _smtp_port()
    use_tls = _smtp_use_tls()
    use_ssl = _smtp_use_ssl()

    # Heuristik: Port 587 -> typischer Submission-Port mit STARTTLS
    # Wenn kein reines SSL aktiv ist, erzwingen wir hier TLS.
    if int(port) == 587 and not use_ssl:
        use_tls = True

    logger.info(
        "Building SMTP client",
        extra={
            "host": host,
            "port": port,
            "use_tls": use_tls,
            "use_ssl": use_ssl,
            "username_set": bool(username),
        },
    )

    smtp_client: smtplib.SMTP | None = None
    context = ssl.create_default_context()

    try:
        if use_ssl:
            # Direkt verschlüsselte Verbindung (z.B. Port 465)
            smtp_client = smtplib.SMTP_SSL(host, int(port), timeout=10, context=context)
            smtp_client.ehlo()
        else:
            # Plain-Verbindung, optional mit STARTTLS
            smtp_client = smtplib.SMTP(host, int(port), timeout=10)
            smtp_client.ehlo()
            if use_tls:
                logger.info("Starting TLS for SMTP connection")
                smtp_client.starttls(context=context)
                smtp_client.ehlo()

        # Nur einloggen, wenn Credentials vorhanden sind
        if username and password:
            logger.info(
                "Attempting SMTP login",
                extra={
                    "host": host,
                    "port": port,
                    "use_tls": use_tls,
                    "use_ssl": use_ssl,
                },
            )
            smtp_client.login(username, password)
            logger.info("SMTP login successful")

        return smtp_client

    except Exception as exc:
        logger.error(
            "SMTP client build/login failed",
            exc_info=True,
            extra={
                "host": host,
                "port": port,
                "use_tls": use_tls,
                "use_ssl": use_ssl,
            },
        )
        # Verbindung sauber schließen, falls angelegt
        try:
            if smtp_client is not None:
                smtp_client.quit()
        except Exception:
            pass

        # Einheitliche Fehlermeldung nach außen
        raise HTTPException(
            status_code=500,
            detail="SMTP Login fehlgeschlagen. Bitte SMTP-Einstellungen prüfen.",
        ) from exc


def _build_email_html_with_signature(body: str, signature_html: str) -> str:
    """
    Baut den HTML-Body inklusive Freiraum-Signatur.
    body: vom Frontend/Assistenten erzeugter reiner Text (mit \n).
    """
    # Benutzer-Text in HTML umbauen (Zeilenumbrüche -> <br>)
    safe_body = (body or "").replace("\r\n", "\n").replace("\r", "\n")
    safe_body = "<br>".join(line for line in safe_body.split("\n"))

    html = f"""
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000000;">
  <p>{safe_body}</p>
</div>
{signature_html}
""".strip()

    return html


def _build_email_text_with_signature(body: str, signature_text: str) -> str:
    """
    Baut die Plain-Text-Variante inkl. Signatur (ohne Logo).
    """
    base = body or ""
    suffix = (signature_text or "").strip()
    if not suffix:
        return base.rstrip()
    return base.rstrip() + "\n\n" + suffix


def _send_email_via_smtp(
    to: str,
    subject: str,
    body: str,
    attachments: list[tuple[str, str, bytes]] | None = None,
) -> str:
    """
    Versendet eine E-Mail über SMTP.
    Returns: "ok" bei Erfolg
    Raises: RuntimeError bei SMTP-Fehlern
    """
    client = _build_smtp_client()
    # Sender aus Umgebungsvariablen holen
    sender = _smtp_user() or os.getenv("SMTP_FROM", "noreply@freiraum.de")
    account_key = _normalize_account_key(sender) or _active_signature_account_key()
    signature_bundle = _load_signature_bundle_for_account(account_key)

    # --- NEUER MIME-AUFBAU MIT SIGNATUR UND INLINE-LOGO ---
    text_body = _build_email_text_with_signature(body, signature_bundle.get("text_signature") or "")
    html_body = _build_email_html_with_signature(body, signature_bundle.get("html_signature") or "")
    html_body, inline_parts = _prepare_signature_inline_images(html_body)

    # multipart/related -> damit Inline-Bilder (cid) funktionieren
    msg = MIMEMultipart("related")
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject

    alternative_part = MIMEMultipart("alternative")
    alternative_part.attach(MIMEText(text_body, "plain", "utf-8"))
    alternative_part.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alternative_part)

    attached_cids: set[str] = set()
    for cid, payload, mime in inline_parts:
        subtype = mime.split("/", 1)[-1] if "/" in mime else "png"
        try:
            image = MIMEImage(payload, _subtype=subtype)
            image.add_header("Content-ID", f"<{cid}>")
            image.add_header("Content-Disposition", "inline", filename=f"{cid}.{subtype}")
            msg.attach(image)
            attached_cids.add(cid.lower())
        except Exception as exc:
            logger.warning("Inline-Signaturbild konnte nicht angehängt werden", extra={"error": str(exc), "cid": cid})

    if "cid:freiraum_logo" in (html_body or "").lower() and "freiraum_logo" not in attached_cids:
        logo_path = _resolve_email_logo_path()
        if logo_path is not None:
            try:
                logo_data = logo_path.read_bytes()
                subtype = "png"
                suffix = logo_path.suffix.lower().lstrip(".")
                if suffix in {"jpg", "jpeg"}:
                    subtype = "jpeg"
                elif suffix == "gif":
                    subtype = "gif"
                elif suffix == "webp":
                    subtype = "webp"
                logo_image = MIMEImage(logo_data, _subtype=subtype)
                logo_image.add_header("Content-ID", "<freiraum_logo>")
                logo_image.add_header("Content-Disposition", "inline", filename="freiraum-email-logo.png")
                msg.attach(logo_image)
            except Exception as exc:
                logger.warning(
                    "Fehler beim Anhängen des E-Mail-Logos",
                    extra={"error": str(exc), "logo_path": str(logo_path)},
                )
        else:
            logger.warning(
                "E-Mail-Logo nicht gefunden",
                extra={"logo_path": str(EMAIL_LOGO_PATH)},
            )

    _attach_files_to_mime(msg, attachments or [])

    logger.info(
        "Sende E-Mail",
        extra={"to": to, "subject": subject, "signature_source": signature_bundle.get("source"), "signature_account": account_key, "attachments": len(attachments or [])},
    )

    try:
        # sendmail verwendet as_string() für MIMEMultipart
        client.sendmail(sender, [to], msg.as_string())
    finally:
        client.quit()

    return "ok"


def _send_email_via_graph(
    to: str,
    subject: str,
    body: str,
    attachments: list[tuple[str, str, bytes]] | None = None,
) -> str:
    account_key = _active_signature_account_key()
    signature_bundle = _load_signature_bundle_for_account(account_key)
    html_body = _build_email_html_with_signature(body, signature_bundle.get("html_signature") or "")
    graph_attachments = [
        {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": filename,
            "contentType": content_type,
            "contentBytes": base64.b64encode(payload).decode("ascii"),
        }
        for filename, content_type, payload in (attachments or [])
    ]
    message: dict = {
        "subject": subject,
        "body": {
            "contentType": "HTML",
            "content": html_body,
        },
        "toRecipients": [
            {
                "emailAddress": {
                    "address": to,
                }
            }
        ],
    }
    if graph_attachments:
        message["attachments"] = graph_attachments
    response = _graph_request(
        "POST",
        "/me/sendMail",
        json_payload={
            "message": message,
            "saveToSentItems": True,
        },
        timeout_sec=40 if graph_attachments else 20,
    )
    _graph_raise_for_status(response, "Mailversand über Graph fehlgeschlagen")
    return "ok"


@router.get("/mode", response_model=MailModeStatusResponse)
async def get_mail_mode_status():
    graph_enabled = _graph_mail_mode_enabled()
    fallback_enabled = _graph_auto_fallback_enabled()
    imap_available = _imap_config_available()
    smtp_available = _smtp_config_available()

    oauth_connected = False
    try:
        from ..services.ms_oauth import get_auth_status

        oauth_connected = bool((get_auth_status() or {}).get("connected"))
    except Exception:
        oauth_connected = False

    graph_mailbox_available = False
    reason: str | None = None
    if graph_enabled and oauth_connected:
        graph_mailbox_available, reason = _probe_graph_mailbox_capability()
    elif graph_enabled and not oauth_connected:
        reason = "OAuth nicht verbunden"

    if graph_enabled and graph_mailbox_available:
        active_mode = "graph"
    elif graph_enabled and fallback_enabled and imap_available:
        active_mode = "imap_smtp_fallback"
        if reason is None:
            reason = "Graph nicht nutzbar, IMAP/SMTP-Fallback aktiv"
    elif graph_enabled:
        active_mode = "graph_unavailable"
    else:
        active_mode = "imap_smtp"

    preferred_mode = "graph" if graph_enabled else "imap_smtp"

    return MailModeStatusResponse(
        ok=True,
        preferredMode=preferred_mode,
        activeMode=active_mode,
        graphEnabled=graph_enabled,
        graphFallbackEnabled=fallback_enabled,
        oauthConnected=oauth_connected,
        graphMailboxAvailable=graph_mailbox_available,
        imapAvailable=imap_available,
        smtpAvailable=smtp_available,
        reason=reason,
    )


@router.post("/send", response_model=MailSendResponse)
async def send_mail(req: MailSendRequest):
    """
    Versendet eine E-Mail über SMTP.
    Erwartet ein JSON-Objekt mit {to, subject, body}.
    """
    _require_account()
    attachments = _normalize_outgoing_attachments(req.attachments)
    if not req.body.strip() and not attachments:
        raise HTTPException(status_code=400, detail="E-Mail-Body darf nicht leer sein.")

    subject = req.subject or "Nachricht vom Freiraum-Mitarbeiter"
    body_text = req.body if req.body.strip() else " "

    try:
        if _graph_mail_mode_enabled():
            try:
                result = _send_email_via_graph(req.to, subject, body_text, attachments)
            except HTTPException as exc:
                # Auto-Fallback für Kunden ohne Graph-Mailbox (z. B. IONOS/externes Konto).
                if (
                    _graph_auto_fallback_enabled()
                    and _is_graph_mailbox_unavailable_error(exc)
                    and _smtp_config_available()
                ):
                    logger.warning("Graph send unavailable, falling back to SMTP transport.")
                    result = _send_email_via_smtp(req.to, subject, body_text, attachments)
                else:
                    raise
        else:
            result = _send_email_via_smtp(req.to, subject, body_text, attachments)
        try:
            from ..services.contact_store import get_contact_store

            store = get_contact_store()
            email_value = str(req.to).strip().lower()
            display_name = email_value.split("@", 1)[0].replace(".", " ").replace("_", " ").strip() or email_value
            store.upsert_contact(
                email=email_value,
                display_name=display_name,
                aliases=[display_name, email_value],
                source="send",
            )
        except Exception:
            pass
        return MailSendResponse(status="ok", result=result)
    except HTTPException:
        # HTTPException von _build_smtp_client direkt weiterwerfen
        raise
    except RuntimeError as e:
        logger.exception("Mailversand fehlgeschlagen (Konfiguration/SMTP)")
        raise HTTPException(status_code=500, detail=f"Mailversand fehlgeschlagen: {e}")
    except Exception as e:
        logger.exception("Mailversand fehlgeschlagen (allgemeiner Fehler)")
        raise HTTPException(status_code=500, detail="Mailversand fehlgeschlagen.")


@router.post("/signature/import-last-sent", response_model=SignatureImportResponse)
async def import_signature_from_last_sent(force: bool = False):
    _require_account()
    result = _import_signature_for_active_account(force=force)
    return SignatureImportResponse(
        ok=bool(result.get("ok")),
        accountKey=str(result.get("account_key") or ""),
        imported=bool(result.get("imported")),
        source=str(result.get("source") or "none"),
        reason=(str(result.get("reason")) if result.get("reason") else None),
    )


@router.get("/inbox", response_model=InboxListResponse)
async def get_inbox(limit: int = 25, offset: int = 0, mailbox: str = Query("inbox", pattern="^(inbox|sent)$")):
    _require_account()
    safe_limit = max(1, min(limit, 120))
    safe_offset = max(0, offset)
    mailbox_kind = (mailbox or "inbox").strip().lower()

    if _graph_mail_mode_enabled():
        try:
            graph_path = "/me/messages" if mailbox_kind != "sent" else "/me/mailFolders/sentitems/messages"
            response = _graph_request(
                "GET",
                graph_path,
                params={
                    "$top": safe_limit,
                    "$skip": safe_offset,
                    "$orderby": "receivedDateTime desc",
                    "$select": "id,internetMessageId,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead",
                    "$count": "true",
                },
            )
            _graph_raise_for_status(response, "Mail-Liste konnte nicht über Graph geladen werden")
            payload = response.json() if response.content else {}
            values = payload.get("value", []) if isinstance(payload, dict) else []
            if not isinstance(values, list):
                values = []
            if mailbox_kind == "sent":
                items = [_graph_to_sent_item(row) for row in values if isinstance(row, dict) and row.get("id")]
            else:
                items = [_graph_to_inbox_item(row) for row in values if isinstance(row, dict) and row.get("id")]
            _learn_contacts_from_inbox_items(items)
            total = payload.get("@odata.count") if isinstance(payload, dict) else None
            try:
                total_count = int(total) if total is not None else (safe_offset + len(items))
            except Exception:
                total_count = safe_offset + len(items)
            return InboxListResponse(ok=True, total=total_count, items=items)
        except HTTPException as exc:
            # Auto-Fallback für Kunden ohne Graph-Mailbox.
            if (
                _graph_auto_fallback_enabled()
                and _is_graph_mailbox_unavailable_error(exc)
                and _imap_config_available()
            ):
                logger.warning("Graph inbox unavailable, falling back to IMAP inbox.")
            else:
                raise

    client = _open_imap_client_with_retry()
    try:
        selected_mailbox = _resolve_imap_mailbox(client, mailbox_kind)

        status, data = client.uid("SEARCH", None, "ALL")
        if status != "OK":
            raise HTTPException(status_code=500, detail="Inbox-Liste konnte nicht geladen werden.")

        all_uids = data[0].split() if data and data[0] else []
        all_uids = list(reversed(all_uids))
        total = len(all_uids)
        selected_uids = all_uids[safe_offset : safe_offset + safe_limit]

        items: list[InboxMessageItem] = []
        for uid_bytes in selected_uids:
            uid = uid_bytes.decode("utf-8", errors="replace")
            raw_email, is_read = _fetch_imap_list_headers(client, uid)
            if not raw_email:
                continue

            msg = email.message_from_bytes(raw_email)
            subject = _decode_mime_header(msg.get("Subject")) or "(ohne Betreff)"
            if mailbox_kind == "sent":
                recipient_name, recipient_email = _extract_email_parts(msg.get("To"))
                from_name, from_email = recipient_name, recipient_email
            else:
                from_name, from_email = _extract_email_parts(msg.get("From"))
            message_id = (msg.get("Message-ID") or "").strip() or None
            received_at = (msg.get("Date") or "").strip() or None

            items.append(
                InboxMessageItem(
                    uid=uid,
                    messageId=message_id,
                    subject=subject,
                    fromName=from_name,
                    fromEmail=from_email,
                    receivedAt=received_at,
                    preview=None,
                    isRead=is_read,
                )
            )

        _learn_contacts_from_inbox_items(items)
        return InboxListResponse(ok=True, total=total, items=items)
    finally:
        try:
            client.logout()
        except Exception:
            pass


@router.get("/inbox/{uid}", response_model=InboxMessageDetailResponse)
async def get_inbox_message(uid: str, mailbox: str = Query("inbox", pattern="^(inbox|sent)$")):
    _require_account()
    safe_uid = (uid or "").strip()
    if not safe_uid:
        raise HTTPException(status_code=400, detail="uid ist erforderlich.")
    mailbox_kind = (mailbox or "inbox").strip().lower()

    if _graph_mail_mode_enabled():
        try:
            response = _graph_request(
                "GET",
                f"/me/messages/{safe_uid}",
                params={
                    "$select": "id,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview",
                },
            )
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Nachricht nicht gefunden.")
            _graph_raise_for_status(response, "Nachricht konnte nicht über Graph geladen werden")
            payload = response.json() if response.content else {}
            if not isinstance(payload, dict) or not payload.get("id"):
                raise HTTPException(status_code=404, detail="Nachricht nicht gefunden.")

            sender = payload.get("from") or {}
            sender_addr = sender.get("emailAddress") or {}
            to_recipients = payload.get("toRecipients") or []
            cc_recipients = payload.get("ccRecipients") or []
            all_recipients = []
            if isinstance(to_recipients, list):
                all_recipients.extend(to_recipients)
            if isinstance(cc_recipients, list):
                all_recipients.extend(cc_recipients)
            to_addresses: list[str] = []
            for recipient in all_recipients:
                if not isinstance(recipient, dict):
                    continue
                email_address = recipient.get("emailAddress") or {}
                address = (email_address.get("address") or "").strip()
                if address:
                    to_addresses.append(address)

            body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
            body_content = (body.get("content") or "") if isinstance(body, dict) else ""
            body_type = ((body.get("contentType") or "") if isinstance(body, dict) else "").strip().lower()
            body_html: str | None = None
            if body_type == "html":
                body_text = _html_to_text(body_content)
                body_html = _sanitize_html_for_render(body_content) or None
            else:
                body_text = re.sub(r"\s+", " ", (body_content or "").strip())
            if not body_text:
                body_text = _normalize_preview(payload.get("bodyPreview") or "") or "(kein Textinhalt)"

            return InboxMessageDetailResponse(
                ok=True,
                uid=safe_uid,
                messageId=(payload.get("internetMessageId") or None),
                subject=(payload.get("subject") or "(ohne Betreff)").strip() or "(ohne Betreff)",
                fromName=(sender_addr.get("name") or None),
                fromEmail=(sender_addr.get("address") or None),
                to=to_addresses,
                receivedAt=(payload.get("receivedDateTime") or None),
                bodyText=body_text,
                bodyHtml=body_html,
            )
        except HTTPException as exc:
            if (
                _graph_auto_fallback_enabled()
                and _is_graph_mailbox_unavailable_error(exc)
                and _imap_config_available()
            ):
                logger.warning("Graph message detail unavailable, falling back to IMAP detail.")
            else:
                raise

    client = _open_imap_client_with_retry()
    try:
        _resolve_imap_mailbox(client, mailbox_kind)

        fetch_status, fetch_data = client.uid("FETCH", safe_uid, "(RFC822)")
        if fetch_status != "OK" or not fetch_data:
            raise HTTPException(status_code=404, detail="Nachricht nicht gefunden.")

        raw_email = None
        for part in fetch_data:
            if isinstance(part, tuple) and len(part) > 1:
                raw_email = part[1]
                break
        if not raw_email:
            raise HTTPException(status_code=404, detail="Nachricht nicht gefunden.")

        msg = email.message_from_bytes(raw_email)
        subject = _decode_mime_header(msg.get("Subject")) or "(ohne Betreff)"
        from_name, from_email = _extract_email_parts(msg.get("From"))
        to_headers = msg.get_all("To", [])
        to_addresses = [addr for _, addr in [email.utils.parseaddr(v) for v in to_headers] if addr]
        message_id = (msg.get("Message-ID") or "").strip() or None
        received_at = (msg.get("Date") or "").strip() or None
        body_text, body_html = _extract_message_content(msg)
        if not body_text:
            body_text = "(kein Textinhalt)"

        return InboxMessageDetailResponse(
            ok=True,
            uid=safe_uid,
            messageId=message_id,
            subject=subject,
            fromName=from_name,
            fromEmail=from_email,
            to=to_addresses,
            receivedAt=received_at,
            bodyText=body_text,
            bodyHtml=(body_html or None),
        )
    finally:
        try:
            client.logout()
        except Exception:
            pass

