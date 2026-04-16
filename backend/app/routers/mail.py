# backend/app/routers/mail.py

import logging
import os
import smtplib
import ssl
import imaplib
import email
import html as html_lib
import re
import time
import requests
from email.header import decode_header
from email.message import EmailMessage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mail", tags=["mail"])

# Pfade für E-Mail-Assets
# Von mail.py (backend/app/routers/mail.py) zum backend-Root: parents[2]
# 0=mail.py, 1=routers, 2=app, 3=backend
BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_EMAIL_LOGO_PATH = BASE_DIR / "data" / "assets" / "freiraum-email-logo.png.png"
EMAIL_LOGO_PATH = Path(os.getenv("EMAIL_LOGO_PATH", str(DEFAULT_EMAIL_LOGO_PATH)))


class MailSendRequest(BaseModel):
    to: EmailStr
    subject: str | None = None
    body: str


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


def _imap_host() -> str:
    return os.getenv("IMAP_HOST", "")


def _imap_port() -> int:
    return int(os.getenv("IMAP_PORT", "993"))


def _imap_user() -> str:
    return os.getenv("IMAP_USER") or os.getenv("IMAP_USERNAME") or ""


def _imap_pass() -> str:
    return os.getenv("IMAP_PASS") or os.getenv("IMAP_PASSWORD") or ""


def _graph_mail_mode_enabled() -> bool:
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
    host = (os.getenv("SMTP_HOST") or "").strip()
    username = (os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS") or "").strip()
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
    compact = re.sub(r"<style[\s\S]*?</style>", " ", value or "", flags=re.IGNORECASE)
    compact = re.sub(r"<script[\s\S]*?</script>", " ", compact, flags=re.IGNORECASE)
    compact = re.sub(r"<[^>]+>", " ", compact)
    compact = html_lib.unescape(compact)
    compact = re.sub(r"\s+", " ", compact).strip()
    return compact


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


def _extract_text_from_message(msg: email.message.Message) -> str:
    text_chunks: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            content_type = part.get_content_type()
            if content_type != "text/plain":
                continue
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                text_chunks.append(payload.decode(charset, errors="replace"))
            except Exception:
                text_chunks.append(payload.decode("utf-8", errors="replace"))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            try:
                text_chunks.append(payload.decode(charset, errors="replace"))
            except Exception:
                text_chunks.append(payload.decode("utf-8", errors="replace"))
    return "\n".join(chunk.strip() for chunk in text_chunks if chunk and chunk.strip()).strip()


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


def _build_smtp_client() -> smtplib.SMTP:
    """
    Baut und konfiguriert einen SMTP-Client.

    - Nutzt SMTP_USE_SSL / SMTP_USE_TLS aus den Settings, aber:
      * Für Port 587 wird STARTTLS erzwungen (sofern kein reines SSL benutzt wird),
        weil viele Provider AUTH erst nach STARTTLS anbieten.
    """
    host = os.getenv("SMTP_HOST")
    # Fallback: Nutze SMTP_USERNAME/PASSWORD falls vorhanden, sonst SMTP_USER/SMTP_PASS
    username = os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS")
    # Port: Standard 465 für SSL, 587 für TLS, oder aus Env
    port = int(os.getenv("SMTP_PORT", "465"))
    # TLS: Standard False (da Port 465 SSL nutzt), oder aus Env
    use_tls = os.getenv("SMTP_USE_TLS", "false").lower() in ("1", "true", "yes")
    # SSL: Direkter SSL-Modus (z.B. für Port 465)
    use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes")

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


def _build_email_html_with_signature(body: str) -> str:
    """
    Baut den HTML-Body inklusive Freiraum-Signatur.
    body: vom Frontend/Assistenten erzeugter reiner Text (mit \n).
    """
    # Benutzer-Text in HTML umbauen (Zeilenumbrüche -> <br>)
    safe_body = (body or "").replace("\r\n", "\n").replace("\r", "\n")
    safe_body = "<br>".join(line for line in safe_body.split("\n"))

    signature_html = """
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

<!-- LOGO IN OPTIMALER OUTLOOK-GRÖSSE -->
<img src="cid:freiraum_logo" width="230" style="display:block; margin-top:10px;" alt="Freiraum Logo">
""".strip()

    html = f"""
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000000;">
  <p>{safe_body}</p>
</div>
{signature_html}
""".strip()

    return html


def _build_email_text_with_signature(body: str) -> str:
    """
    Baut die Plain-Text-Variante inkl. Signatur (ohne Logo).
    """
    base = body or ""
    signature_text = (
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
    return base.rstrip() + signature_text


def _send_email_via_smtp(to: str, subject: str, body: str) -> str:
    """
    Versendet eine E-Mail über SMTP.
    Returns: "ok" bei Erfolg
    Raises: RuntimeError bei SMTP-Fehlern
    """
    client = _build_smtp_client()
    # Sender aus Umgebungsvariablen holen
    sender = os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER") or os.getenv("SMTP_FROM", "noreply@freiraum.de")

    # --- NEUER MIME-AUFBAU MIT SIGNATUR UND INLINE-LOGO ---
    text_body = _build_email_text_with_signature(body)
    html_body = _build_email_html_with_signature(body)

    # multipart/related -> damit Inline-Bilder (cid) funktionieren
    msg = MIMEMultipart("related")
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject

    # multipart/alternative für text/plain + text/html
    alternative_part = MIMEMultipart("alternative")
    alternative_part.attach(MIMEText(text_body, "plain", "utf-8"))
    alternative_part.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alternative_part)

    # E-Mail-Logo als inline Bild anhängen (wenn vorhanden)
    try:
        if EMAIL_LOGO_PATH.is_file():
            with open(EMAIL_LOGO_PATH, "rb") as f:
                logo_data = f.read()

            logo_image = MIMEImage(logo_data)
            # Content-ID muss mit dem Wert in der HTML-Signatur übereinstimmen
            logo_image.add_header("Content-ID", "<freiraum_logo>")
            logo_image.add_header("Content-Disposition", "inline", filename="freiraum-email-logo.png")
            msg.attach(logo_image)
        else:
            logger.warning(
                "E-Mail-Logo nicht gefunden",
                extra={"logo_path": str(EMAIL_LOGO_PATH)},
            )
    except Exception as e:
        logger.warning(
            "Fehler beim Anhängen des E-Mail-Logos",
            extra={"error": str(e), "logo_path": str(EMAIL_LOGO_PATH)},
        )

    logger.info("Sende E-Mail", extra={"to": to, "subject": subject})

    try:
        # sendmail verwendet as_string() für MIMEMultipart
        client.sendmail(sender, [to], msg.as_string())
    finally:
        client.quit()

    return "ok"


def _send_email_via_graph(to: str, subject: str, body: str) -> str:
    html_body = _build_email_html_with_signature(body)
    response = _graph_request(
        "POST",
        "/me/sendMail",
        json_payload={
            "message": {
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
            },
            "saveToSentItems": True,
        },
        timeout_sec=20,
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
    if not req.body.strip():
        raise HTTPException(status_code=400, detail="E-Mail-Body darf nicht leer sein.")

    subject = req.subject or "Nachricht vom Freiraum-Mitarbeiter"

    try:
        if _graph_mail_mode_enabled():
            try:
                result = _send_email_via_graph(req.to, subject, req.body)
            except HTTPException as exc:
                # Auto-Fallback für Kunden ohne Graph-Mailbox (z. B. IONOS/externes Konto).
                if (
                    _graph_auto_fallback_enabled()
                    and _is_graph_mailbox_unavailable_error(exc)
                    and _smtp_config_available()
                ):
                    logger.warning("Graph send unavailable, falling back to SMTP transport.")
                    result = _send_email_via_smtp(req.to, subject, req.body)
                else:
                    raise
        else:
            result = _send_email_via_smtp(req.to, subject, req.body)
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


@router.get("/inbox", response_model=InboxListResponse)
async def get_inbox(limit: int = 25, offset: int = 0):
    safe_limit = max(1, min(limit, 60))
    safe_offset = max(0, offset)

    if _graph_mail_mode_enabled():
        try:
            response = _graph_request(
                "GET",
                "/me/messages",
                params={
                    "$top": safe_limit,
                    "$skip": safe_offset,
                    "$orderby": "receivedDateTime desc",
                    "$select": "id,internetMessageId,subject,from,receivedDateTime,bodyPreview,isRead",
                    "$count": "true",
                },
            )
            _graph_raise_for_status(response, "Inbox-Liste konnte nicht über Graph geladen werden")
            payload = response.json() if response.content else {}
            values = payload.get("value", []) if isinstance(payload, dict) else []
            if not isinstance(values, list):
                values = []
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
        status, _ = client.select("INBOX", readonly=True)
        if status != "OK":
            raise HTTPException(status_code=503, detail="INBOX konnte nicht geöffnet werden.")

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
            fetch_status, fetch_data = client.uid("FETCH", uid, "(FLAGS RFC822)")
            if fetch_status != "OK" or not fetch_data:
                continue

            raw_email = None
            is_read = False
            for part in fetch_data:
                if isinstance(part, tuple) and len(part) > 1:
                    if isinstance(part[0], bytes):
                        head_blob = part[0]
                        if b"FLAGS" in head_blob and b"\\Seen" in head_blob:
                            is_read = True
                    raw_email = part[1]
                    break
            if not raw_email:
                continue

            msg = email.message_from_bytes(raw_email)
            subject = _decode_mime_header(msg.get("Subject")) or "(ohne Betreff)"
            from_name, from_email = _extract_email_parts(msg.get("From"))
            message_id = (msg.get("Message-ID") or "").strip() or None
            received_at = (msg.get("Date") or "").strip() or None
            body_text = _extract_text_from_message(msg)
            preview = _normalize_preview(body_text) if body_text else None

            items.append(
                InboxMessageItem(
                    uid=uid,
                    messageId=message_id,
                    subject=subject,
                    fromName=from_name,
                    fromEmail=from_email,
                    receivedAt=received_at,
                    preview=preview,
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
async def get_inbox_message(uid: str):
    safe_uid = (uid or "").strip()
    if not safe_uid:
        raise HTTPException(status_code=400, detail="uid ist erforderlich.")

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
            if body_type == "html":
                body_text = _html_to_text(body_content)
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
        status, _ = client.select("INBOX", readonly=True)
        if status != "OK":
            raise HTTPException(status_code=503, detail="INBOX konnte nicht geöffnet werden.")

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
        body_text = _extract_text_from_message(msg) or "(kein Textinhalt)"

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
        )
    finally:
        try:
            client.logout()
        except Exception:
            pass

