import json, logging, time, pathlib
from datetime import datetime, timedelta
from sqlalchemy import and_, func, case
from .db import SessionLocal
from .models import FollowUp, Lead, SequenceStep, Interaction, Suggestion
# Import from old sequences.py (legacy) - not from new sequences module
try:
    from backend.sequences import parse_step_from_note, render_template
except ImportError:
    # Fallback: simple implementations
    def parse_step_from_note(note: str) -> tuple[int, int, str]:
        # Simple parser for "SEQ:name -> subject"
        if note and note.startswith("SEQ:"):
            parts = note.split(" -> ", 1)
            return (1, 1, "email")  # Default
        return (0, 0, "")
    
    def render_template(text: str, lead) -> str:
        # Simple template renderer
        if hasattr(lead, 'company'):
            text = text.replace("{{company}}", lead.company or "")
        if hasattr(lead, 'city'):
            text = text.replace("{{city}}", lead.city or "")
        return text
from .mail import send_email_plain
import os

log = logging.getLogger("scheduler")

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
STATE_PATH = DATA_DIR / "scheduler_state.json"

MAX_PER_MIN = int(os.getenv("SCHED_MAX_EMAILS_PER_MIN", "20"))
BACKOFF_MIN = int(os.getenv("SCHED_BACKOFF_MINUTES", "10"))

def _load_state():
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def _save_state(st: dict):
    try:
        STATE_PATH.write_text(json.dumps(st, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

def _can_attempt(fu_id: int) -> bool:
    st = _load_state()
    last = st.get("attempts", {}).get(str(fu_id))
    if not last:
        return True
    last_dt = datetime.fromisoformat(last)
    return datetime.utcnow() >= last_dt + timedelta(minutes=BACKOFF_MIN)

def _mark_attempt(fu_id: int):
    st = _load_state()
    st.setdefault("attempts", {})[str(fu_id)] = datetime.utcnow().isoformat()
    _save_state(st)

def process_due_followups():
    """Fällige Follow-ups (Sequence-Schritte) verarbeiten – mit Rate Limit & Backoff."""
    db = SessionLocal()
    processed = []
    sent_count = 0
    try:
        now = datetime.utcnow()
        items = db.query(FollowUp).filter(and_(FollowUp.done==False, FollowUp.due_at <= now)).order_by(FollowUp.due_at.asc()).all()
        for fu in items:
            if sent_count >= MAX_PER_MIN:
                log.info("Rate limit reached, stopping for this cycle.")
                break
            seq_id, order_no, action = parse_step_from_note(fu.note or "")
            if seq_id <= 0 or order_no <= 0:
                continue
            if fu.entity_type != "lead":
                continue
            if not _can_attempt(fu.id):
                continue
            lead = db.get(Lead, fu.entity_id)
            if not lead:
                fu.done = True
                continue
            st = db.query(SequenceStep).filter(
                SequenceStep.sequence_id==seq_id,
                SequenceStep.order_no==order_no
            ).first()
            if not st:
                fu.done = True
                continue

            if action == "email":
                if not lead.contact_email:
                    log.warning(f"Lead {lead.id} has no email; marking done")
                    fu.done = True
                else:
                    try:
                        payload = json.loads(st.payload or "{}")
                        subject = render_template(payload.get("subject",""), lead)
                        body = render_template(payload.get("body",""), lead)
                        send_email_plain(lead.contact_email, subject, body)
                        sent_count += 1
                        fu.done = True
                        log.info(f"Sent seq email to {lead.contact_email} (FU {fu.id}, step {order_no})")
                    except Exception as e:
                        log.exception(f"Email send failed for FU {fu.id}: {e}")
                        _mark_attempt(fu.id)  # Backoff
                        # nicht done -> wird später erneut versucht
                        continue
            else:
                # tasks etc. – aktuell nur abhaken
                fu.done = True
            processed.append(fu.id)
        if processed:
            db.commit()
    finally:
        db.close()
    return {"processed": len(processed), "sent": sent_count, "ids": processed}


def build_suggestions():
    """Analysiert Interaktionen der letzten 60 Tage und schreibt Suggestion-Einträge."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        since = now - timedelta(days=60)
        # Warme Kontakte: out>=2 & in>=1
        rows = db.query(Interaction.contact_email, Interaction.contact_name,
                        func.sum(case((Interaction.direction=='out',1), else_=0)).label('out_cnt'),
                        func.sum(case((Interaction.direction=='in',1), else_=0)).label('in_cnt')
                        ).filter(Interaction.at>=since).group_by(Interaction.contact_email, Interaction.contact_name).all()
        for email, name, out_cnt, in_cnt in rows:
            if not email: continue
            if (out_cnt or 0) >= 2 and (in_cnt or 0) >= 1:
                s = Suggestion(kind='followup', title=f'Warmer Kontakt: {name or email}', detail='Mehrere Kontakte mit Antwort', score=0.8, data={'email':email,'name':name or ''}, created_at=now)
                db.add(s)
        # Rabatt-Kandidaten: >=3 Kontakte
        rows2 = db.query(Interaction.contact_email, Interaction.contact_name, func.count(Interaction.id)).filter(Interaction.at>=since).group_by(Interaction.contact_email, Interaction.contact_name).all()
        for email, name, cnt in rows2:
            if not email: continue
            if cnt>=3:
                s = Suggestion(kind='discount', title=f'Rabatt erwägen: {name or email}', detail='Mehrere Kontakte in kurzer Zeit', score=0.65, data={'email':email,'name':name or '', 'suggested_discount':5}, created_at=now)
                db.add(s)
        # Leerlauf-Hinweis
        if not rows and not rows2:
            db.add(Suggestion(kind='tip', title='Leerlauf: Leads recherchieren?', detail='Wenig Aktivität in den letzten Wochen', score=0.5, data={}, created_at=now))
        db.commit()
    finally:
        db.close()
    return {"ok": True}
