# backend/app/routers/mail.py

import logging
import os
import smtplib
import ssl
import imaplib
import email
import re
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


class InboxMessageItem(BaseModel):
    uid: str
    messageId: str | None = None
    subject: str
    fromName: str | None = None
    fromEmail: str | None = None
    receivedAt: str | None = None
    preview: str | None = None


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
        result = _send_email_via_smtp(req.to, subject, req.body)
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

    client = _open_imap_client()
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
            fetch_status, fetch_data = client.uid("FETCH", uid, "(RFC822)")
            if fetch_status != "OK" or not fetch_data:
                continue

            raw_email = None
            for part in fetch_data:
                if isinstance(part, tuple) and len(part) > 1:
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
                )
            )

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

    client = _open_imap_client()
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

