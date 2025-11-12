import os
import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

def _headers():
    token = os.getenv("MSGRAPH_TOKEN")  # simple bearer (manual paste) – optional
    if not token:
        return None
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def send_mail_msgraph(to: str, subject: str, body: str, attachments: list[str] | None = None) -> bool:
    h = _headers()
    if not h:
        return False
    msg = {
        "message": {
            "subject": subject,
            "body": {"contentType": "Text", "content": body},
            "toRecipients": [{"emailAddress": {"address": to}}],
        },
        "saveToSentItems": "true"
    }
    # (Attachments skipped in this minimal variant for simplicity)
    try:
        r = requests.post(f"{GRAPH_BASE}/me/sendMail", headers=h, json=msg, timeout=30)
        return r.status_code in (202, 200)
    except Exception:
        return False

def create_event_msgraph(title: str, start_iso: str, end_iso: str, attendees: list[str], location: str) -> bool:
    h = _headers()
    if not h:
        return False
    body = {
        "subject": title,
        "start": {"dateTime": start_iso, "timeZone": "Europe/Berlin"},
        "end": {"dateTime": end_iso, "timeZone": "Europe/Berlin"},
        "location": {"displayName": location or ""},
        "attendees": [{"emailAddress": {"address": a}, "type": "required"} for a in attendees]
    }
    try:
        r = requests.post(f"{GRAPH_BASE}/me/events", headers=h, json=body, timeout=30)
        return r.status_code in (201, 200)
    except Exception:
        return False

