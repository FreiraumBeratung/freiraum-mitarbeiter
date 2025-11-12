import os, pathlib, tempfile
from fastapi import APIRouter
from .db import SessionLocal
from .models import Offer
import imaplib, smtplib
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

router = APIRouter(prefix="/api/health", tags=["health"])

@router.get("/")
def health():
    checks = {}
    
    # DB
    try:
        db = SessionLocal(); db.query(Offer).count(); db.close()
        checks["db"] = True
    except Exception as e:
        checks["db"] = f"ERR {e}"
    
    # IMAP
    try:
        from .mail import get_imap_host, get_imap_user, get_imap_pass
        imap_host = get_imap_host()
        imap_user = get_imap_user()
        imap_pass = get_imap_pass()
        if not (imap_host and imap_user and imap_pass):
            checks["imap"] = "ERR creds missing"
        else:
            M = imaplib.IMAP4_SSL(imap_host); M.login(imap_user, imap_pass); M.logout()
            checks["imap"] = True
    except Exception as e:
        checks["imap"] = f"ERR {e}"
    
    # SMTP
    try:
        from .mail import get_smtp_host, get_smtp_user, get_smtp_pass
        smtp_host = get_smtp_host()
        smtp_user = get_smtp_user()
        smtp_pass = get_smtp_pass()
        if not (smtp_host and smtp_user and smtp_pass):
            checks["smtp"] = "ERR creds missing"
        else:
            s = smtplib.SMTP_SSL(smtp_host, 465); s.login(smtp_user, smtp_pass); s.quit()
            checks["smtp"] = True
    except Exception as e:
        checks["smtp"] = f"ERR {e}"
    
    # PDF write
    try:
        tmp = pathlib.Path(tempfile.gettempdir()) / "fm_pdf_test.pdf"
        c = canvas.Canvas(str(tmp), pagesize=A4); c.drawString(50,800,"PDF OK"); c.save()
        checks["pdf"] = True
    except Exception as e:
        checks["pdf"] = f"ERR {e}"
    
    # License
    try:
        from .license import get_license
        lic = get_license()
        checks["license"] = True if lic.get("ok") else "ERR"
    except Exception as e:
        checks["license"] = f"ERR {e}"
    
    ok = all(v is True for v in checks.values())
    return {"ok": ok, "checks": checks}


