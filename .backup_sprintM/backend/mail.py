import os, imaplib, smtplib
from email.mime.text import MIMEText
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/mail", tags=["mail"])

# Lazy-Loading der Umgebungsvariablen: Werte werden bei jedem Zugriff neu geladen
def get_imap_host(): return os.getenv("IMAP_HOST", "")
def get_imap_user(): return os.getenv("IMAP_USER", "")
def get_imap_pass(): return os.getenv("IMAP_PASS", "")
def get_smtp_host(): return os.getenv("SMTP_HOST", "")
def get_smtp_user(): return os.getenv("SMTP_USER", "")
def get_smtp_pass(): return os.getenv("SMTP_PASS", "")

def send_email_plain(to: str, subject: str, body: str):
    smtp_host = get_smtp_host()
    smtp_user = get_smtp_user()
    smtp_pass = get_smtp_pass()
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to
    s = smtplib.SMTP_SSL(smtp_host, 465, timeout=10)
    s.login(smtp_user, smtp_pass)
    s.sendmail(smtp_user, [to], msg.as_string())
    s.quit()

def _imap_ok() -> tuple[bool,str]:
    imap_host = get_imap_host()
    imap_user = get_imap_user()
    imap_pass = get_imap_pass()
    if not (imap_host and imap_user and imap_pass):
        return False, "IMAP creds missing"
    try:
        m = imaplib.IMAP4_SSL(imap_host)
        m.login(imap_user, imap_pass)
        m.logout()
        return True, "ok"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"

def _smtp_ok() -> tuple[bool,str]:
    smtp_host = get_smtp_host()
    smtp_user = get_smtp_user()
    smtp_pass = get_smtp_pass()
    if not (smtp_host and smtp_user and smtp_pass):
        return False, "SMTP creds missing"
    try:
        s = smtplib.SMTP_SSL(smtp_host, 465, timeout=10)
        s.login(smtp_user, smtp_pass)
        s.quit()
        return True, "ok"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"

@router.get("/check")
def check():
    imap_ok, imap_reason = _imap_ok()
    smtp_ok, smtp_reason = _smtp_ok()
    return {"ok": imap_ok and smtp_ok, "imap":{"ok":imap_ok,"reason":imap_reason}, "smtp":{"ok":smtp_ok,"reason":smtp_reason}}

class SendTestIn(BaseModel):
    to: str | None = None
    subject: str | None = "Freiraum Mitarbeiter – Test"
    body: str | None = "Hallo, dies ist eine Testmail."

@router.post("/send_test")
def send_test(inp: SendTestIn):
    # niemals 400 werfen – stattdessen ok:false zurück
    smtp_ok, smtp_reason = _smtp_ok()
    if not smtp_ok:
        return {"ok": False, "reason": f"SMTP not ready: {smtp_reason}"}
    smtp_user = get_smtp_user()
    to = (inp.to or smtp_user or "").strip()
    if not to:
        return {"ok": False, "reason": "No recipient (to). Set IMAP/SMTP or provide 'to'."}
    try:
        smtp_host = get_smtp_host()
        smtp_pass = get_smtp_pass()
        msg = MIMEText((inp.body or ""), "plain", "utf-8")
        msg["Subject"] = inp.subject or "Test"
        msg["From"] = smtp_user
        msg["To"] = to
        s = smtplib.SMTP_SSL(smtp_host, 465, timeout=10)
        s.login(smtp_user, smtp_pass)
        s.sendmail(smtp_user, [to], msg.as_string())
        s.quit()
        return {"ok": True, "to": to}
    except Exception as e:
        return {"ok": False, "reason": f"{type(e).__name__}: {e}"}
