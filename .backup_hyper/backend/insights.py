from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .db import get_session
from .models import Suggestion, Interaction
from datetime import datetime, timedelta
from .tools.eventbus import bus

router = APIRouter(prefix="/api/insights", tags=["insights"])

@router.get("/suggestions")
def get_suggestions(session: Session = Depends(get_session)):
    rows = session.query(Suggestion).filter(Suggestion.consumed==False).order_by(Suggestion.score.desc()).all()
    return [dict(id=r.id, kind=r.kind, title=r.title, detail=r.detail, score=r.score, data=r.data, created_at=r.created_at) for r in rows]

@router.post("/suggestions/{sid}/consume")
def consume_suggestion(sid: int, session: Session = Depends(get_session)):
    sug = session.get(Suggestion, sid)
    if not sug: return {"ok": False, "reason":"not_found"}
    sug.consumed = True
    session.commit()
    return {"ok": True}

@router.post("/log")
def log_interaction(item: dict, session: Session = Depends(get_session)):
    inter = Interaction(
        contact_email=item.get("contact_email"),
        contact_name=item.get("contact_name"),
        channel=item.get("channel","note"),
        direction=item.get("direction","out"),
        sentiment=int(item.get("sentiment",0)),
        notes=item.get("notes",""),
        meta=item.get("meta",{}),
        at=datetime.utcnow()
    )
    session.add(inter)
    session.commit()
    # EventBus: Interaktion wurde geloggt
    bus.publish("interaction.logged", {"email": item.get("contact_email"), "direction": item.get("direction","out")})
    return {"ok": True, "id": inter.id}


# EventBus Subscriber: Proaktive Suggestions bei wiederholten Kontakten
def _on_interaction_logged(evt):
    # Mini-Heuristik: bei wiederholten Kontakten Suggestion anlegen
    from sqlalchemy.orm import Session
    from .db import SessionLocal
    from .models import Suggestion, Interaction
    from datetime import datetime, timedelta
    
    db = SessionLocal()
    try:
        email = (evt or {}).get("email")
        if not email: 
            return
        
        recent = db.query(Interaction).filter(Interaction.contact_email==email).count()
        
        if recent >= 3:
            # Prüfe, ob bereits eine ähnliche Suggestion existiert
            existing = db.query(Suggestion).filter(
                Suggestion.kind == "followup",
                Suggestion.consumed == False,
                Suggestion.data.contains({"email": email})
            ).first()
            
            if not existing:
                sug = Suggestion(
                    kind="followup",
                    title=f"Warmer Kontakt: {email}",
                    detail="In den letzten Sessions mehrfach aktiv.",
                    score=0.75,
                    data={"email": email},
                    created_at=datetime.utcnow()
                )
                db.add(sug)
                db.commit()
    except Exception:
        pass  # Bewusst leise
    finally:
        db.close()

bus.subscribe("interaction.logged", _on_interaction_logged)


# BONUS-Testendpoint (nur Dev)
@router.post("/seed")
def seed_suggestions(session: Session = Depends(get_session)):
    from .models import Suggestion
    s1 = Suggestion(
        kind="tip",
        title="Tagesüberblick",
        detail="Heute 3 Angebote offen, 2 Follow-ups fällig.",
        score=0.6,
        data={},
        created_at=datetime.utcnow()
    )
    s2 = Suggestion(
        kind="discount",
        title="Rabatt erwägen: Demo GmbH",
        detail="3 Kontakte in 30 Tagen + 1 Angebot",
        score=0.7,
        data={"suggested_discount": 5},
        created_at=datetime.utcnow()
    )
    session.add_all([s1, s2])
    session.commit()
    return {"ok": True, "count": 2}
