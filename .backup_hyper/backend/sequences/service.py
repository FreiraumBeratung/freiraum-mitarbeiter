import os
import requests
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.orm import Session
from .models import Sequence, SequenceRun

BASE = os.getenv("FM_BASE_URL", "http://localhost:30521/api")

def _get(path: str):
    r = requests.get(f"{BASE}{path}", timeout=20)
    r.raise_for_status()
    return r.json()

def _post(path: str, body: dict):
    r = requests.post(f"{BASE}{path}", json=body, timeout=30)
    r.raise_for_status()
    return r.json()

def execute_sequence_run(db: Session, run: SequenceRun, seq: Sequence) -> tuple[bool, str]:
    """Executes all steps immediately if day_offset==0, otherwise schedules via followups (simple)."""
    logs = []
    
    # load leads
    leads = _get("/leads")
    lead_map = {l.get("id"): l for l in (leads or [])}
    selected = [lead_map.get(i) for i in run.target.get("lead_ids", []) if lead_map.get(i)]
    
    flyer_path = os.path.join(os.getcwd(), "assets", "flyer.pdf") if run.target.get("attach_flyer", True) else None
    
    for step in seq.steps:
        day = int(step.get("day_offset", 0))
        for lead in selected:
            to = (lead.get("email") or lead.get("contact_email") or "").strip()
            if not to:
                continue
                
            subj = step.get("subject", "")
            body = step.get("body", "")
            
            # Replace placeholders
            body = body.replace("{{company}}", lead.get("company", ""))
            body = body.replace("{{city}}", lead.get("city", "") or lead.get("location", ""))
            
            if day == 0:
                payload = {"to": to, "subject": subj, "body": body}
                # Note: attachments not yet supported in /mail/send_test
                try:
                    _post("/mail/send_test", payload)
                    logs.append(f"[send] {to} :: {subj}")
                except Exception as e:
                    logs.append(f"[error-send] {to} :: {e}")
            else:
                # schedule as followup
                due_at = (datetime.utcnow() + timedelta(days=day)).isoformat()
                note = f"SEQ:{seq.name} -> {subj}"
                try:
                    _post("/followups", {
                        "entity_type": "lead",
                        "entity_id": lead.get("id") or 0,
                        "due_at": due_at,
                        "note": note
                    })
                    logs.append(f"[followup+{day}d] {lead.get('company', '')} :: {subj}")
                except Exception as e:
                    logs.append(f"[error-followup] {lead.get('id')} :: {e}")
    
    return True, "\n".join(logs)





