# backend/app/routers/mail.py

import logging
import os
import smtplib
import ssl
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

