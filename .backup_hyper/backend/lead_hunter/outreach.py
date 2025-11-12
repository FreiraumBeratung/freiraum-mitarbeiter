import os
import requests
from datetime import datetime, timedelta


BASE = os.getenv("FM_BASE_URL", "http://localhost:30521/api")


def _get(path: str):
    r = requests.get(f"{BASE}{path}", timeout=20)
    r.raise_for_status()
    return r.json()


def _post(path: str, body: dict):
    r = requests.post(f"{BASE}{path}", json=body, timeout=30)
    r.raise_for_status()
    return r.json()


def render_template(template_text: str, lead: dict) -> str:
    txt = template_text
    txt = txt.replace("{{company}}", lead.get("company", ""))
    txt = txt.replace("{{city}}", lead.get("city", "") or lead.get("location", ""))
    txt = txt.replace("{{category}}", lead.get("category", ""))
    return txt


def send_bulk(leads: list[dict], template_text: str, flyer_path: str | None = None) -> dict:
    sent = 0
    followups = 0
    
    for l in leads:
        if not l.get("emails"):
            continue
        
        to = l["emails"][0]
        subject = f"Freiraum Beratung – kurze Info für {l.get('company', 'Ihr Unternehmen')}"
        body = render_template(template_text, l)
        
        # Use /mail/send_test endpoint
        # Note: attachments not yet supported in /mail/send_test, so we send without for now
        payload = {"to": to, "subject": subject, "body": body}
        
        try:
            _post("/mail/send_test", payload)
            sent += 1
            
            # Create Follow-up in 3 days
            due_at = (datetime.utcnow() + timedelta(days=3)).isoformat()
            try:
                _post("/followups", {
                    "entity_type": "lead",
                    "entity_id": l.get("id") or 0,
                    "due_at": due_at,
                    "note": f"Follow-up: {l.get('company', '')}"
                })
                followups += 1
            except Exception:
                pass  # Follow-up creation is optional
        except Exception:
            pass  # Skip failed sends
    
    return {"sent": sent, "followups_created": followups}

