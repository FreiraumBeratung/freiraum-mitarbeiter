import json, re
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .db import SessionLocal
from .models import Sequence, SequenceStep, SequenceRun, Lead, FollowUp
from .license import has_feature
from .mail import send_email_plain

router = APIRouter(prefix="/api/sequences", tags=["sequences"])

# ---------- Helpers ----------
def render_template(text: str, lead: Lead) -> str:
    repl = {
        "name": (lead.contact_name or "").strip() or "Team",
        "company": (lead.company or "").strip() or "Ihr Unternehmen",
        "email": (lead.contact_email or "").strip(),
    }
    def sub(m): return str(repl.get(m.group(1), ""))
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", sub, text)

def parse_step_from_note(note: str) -> tuple[int,int,str]:
    # Format: "SEQ <Name> seq:<seq_id> – step <order_no> [<action>]"
    m_seq = re.search(r"seq:(\d+)", note or "", re.I)
    m_step = re.search(r"step\s+(\d+)\s+\[(\w+)\]", note or "", re.I)
    if not m_seq or not m_step: return (0, 0, "")
    return (int(m_seq.group(1)), int(m_step.group(1)), m_step.group(2).lower())

# ---------- API ----------
class SeqCreateIn(BaseModel):
    name: str

@router.post("/create_default")
def create_default(inp: SeqCreateIn):
    if not has_feature("sequences"):
        raise HTTPException(403, "Feature not allowed (need PRO)")
    db = SessionLocal()
    try:
        s = Sequence(name=inp.name, active=True); db.add(s); db.flush()
        steps = [
            {"order_no":1, "action":"email", "wait_days":0, "payload": json.dumps({"subject":"Kennen wir uns schon, {{company}}?","body":"Hallo {{name}},\nwir automatisieren Angebote & Follow-ups – ohne ERP-Wechsel.\nLG Denis von Freiraum"})},
            {"order_no":2, "action":"task", "wait_days":2, "payload": json.dumps({"note":"Telefonat kurz vorbereiten"})},
            {"order_no":3, "action":"email", "wait_days":5, "payload": json.dumps({"subject":"Nur kurz nachgehakt","body":"Moin {{name}}, nur kurz nachgehakt – passt unser Thema? 😊"})},
        ]
        for st in steps:
            db.add(SequenceStep(sequence_id=s.id, **st))
        db.commit()
        return {"ok": True, "id": s.id}
    finally:
        db.close()

class RunIn(BaseModel):
    sequence_id: int
    lead_id: int

@router.post("/run")
def run_sequence(inp: RunIn):
    if not has_feature("sequences"):
        raise HTTPException(403, "Feature not allowed (need PRO)")
    db = SessionLocal()
    try:
        s = db.get(Sequence, inp.sequence_id)
        lead = db.get(Lead, inp.lead_id)
        if not s or not lead: raise HTTPException(404, "sequence or lead not found")
        r = SequenceRun(sequence_id=s.id, lead_id=lead.id, current_step=0, status="running")
        db.add(r)
        steps = db.query(SequenceStep).filter(SequenceStep.sequence_id==s.id).order_by(SequenceStep.order_no.asc()).all()
        now = datetime.utcnow()
        for st in steps:
            due = now + timedelta(days=st.wait_days)
            note = f"SEQ {s.name} seq:{s.id} – step {st.order_no} [{st.action}]"
            db.add(FollowUp(entity_type="lead", entity_id=lead.id, due_at=due, note=note))
        db.commit()
        return {"ok": True, "run_id": r.id, "scheduled": len(steps)}
    finally:
        db.close()

class SendNowIn(BaseModel):
    sequence_id: int
    lead_id: int
    order_no: int

@router.post("/send_now")
def send_now(inp: SendNowIn):
    """Führe einen konkreten E-Mail-Step sofort aus (ohne Wartezeit)."""
    if not has_feature("sequences"):
        raise HTTPException(403, "Feature not allowed (need PRO)")
    db = SessionLocal()
    try:
        st = db.query(SequenceStep).filter(
            SequenceStep.sequence_id==inp.sequence_id,
            SequenceStep.order_no==inp.order_no
        ).first()
        lead = db.get(Lead, inp.lead_id)
        if not st or not lead: raise HTTPException(404, "step or lead not found")
        if st.action != "email": raise HTTPException(400, "step action is not email")
        if not lead.contact_email: raise HTTPException(400, "lead has no email")

        payload = json.loads(st.payload or "{}")
        subject = render_template(payload.get("subject",""), lead)
        body = render_template(payload.get("body",""), lead)
        send_email_plain(lead.contact_email, subject, body)
        return {"ok": True, "sent_to": lead.contact_email, "subject": subject}
    finally:
        db.close()
