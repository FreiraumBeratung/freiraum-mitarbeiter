from fastapi import APIRouter, Depends, Body, HTTPException
from typing import Any, Dict
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
import os
from .models import Base
from .schemas import EventIn, EventOut, StateOut, ProfileOut, ProfileIn, ResetIn
from .service import register_event, get_state, get_profile, update_profile, reset_user



DATA_DIR = os.getenv("FREIRAUM_DATA_DIR", os.path.abspath(os.path.join(os.getcwd(), "data")))

os.makedirs(DATA_DIR, exist_ok=True)

DB_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(DATA_DIR, 'freiraum.db')}")



engine = create_engine(DB_URL, connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)



Base.metadata.create_all(bind=engine)



def get_db():

    db: Session = SessionLocal()

    try:

        yield db

    finally:

        db.close()



router = APIRouter(prefix="/api/character", tags=["character"])



# Compat wrapper (tolerant schema) - accepts user_id/user, sentiment/mood, topics
@router.post("/event", response_model=EventOut)
def post_event(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """
    Compat wrapper: accepts user_id/user, sentiment/mood, topics, meta.
    """
    # Lazy import to avoid circular dependency
    from backend.compat.schemas import CharacterEventCompat
    try:
        data = CharacterEventCompat(**payload).canonical()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"invalid character event: {e}")
    
    # Map to EventIn format (role defaults to "user" if not provided)
    role = "user"  # Default role for compat mode
    ev = register_event(db, data["user_id"], role, data["text"])
    
    # Note: register_event already calculates sentiment/mood/topics from text
    # If additional topics provided, merge them
    if data.get("topics") and isinstance(data["topics"], list):
        existing_topics = ev.topics or []
        ev.topics = list(set(existing_topics + data["topics"]))
        db.flush()
    
    db.commit()
    db.refresh(ev)
    
    return EventOut(
        id=ev.id, user_id=ev.user_id, role=ev.role, text=ev.text,
        sentiment=ev.sentiment, mood=ev.mood, intensity=ev.intensity,
        topics=ev.topics or []
    )



@router.get("/state", response_model=StateOut)

def read_state(user_id: str, db: Session = Depends(get_db)):

    st = get_state(db, user_id)

    return StateOut(

        user_id=user_id,

        mood=st.mood,

        intensity=st.intensity,

        confidence=st.confidence,

        last_summary=st.last_summary,

        recent_topics=st.recent_topics or []

    )



@router.get("/profile", response_model=ProfileOut)

def read_profile(user_id: str, db: Session = Depends(get_db)):

    p = get_profile(db, user_id)

    return ProfileOut(

        user_id=p.user_id, tone=p.tone, humor=p.humor,

        formality=p.formality, focus=p.focus or [], style_notes=p.style_notes

    )



@router.put("/profile", response_model=ProfileOut)

def write_profile(payload: ProfileIn, db: Session = Depends(get_db)):

    p = update_profile(

        db, payload.user_id,

        tone=payload.tone, humor=payload.humor, formality=payload.formality,

        focus=payload.focus, style_notes=payload.style_notes

    )

    db.commit()

    return ProfileOut(

        user_id=p.user_id, tone=p.tone, humor=p.humor,

        formality=p.formality, focus=p.focus or [], style_notes=p.style_notes

    )



@router.post("/reset")

def reset(payload: ResetIn, db: Session = Depends(get_db)):

    reset_user(db, payload.user_id, purge_events=payload.purge_events)

    db.commit()

    return {"ok": True}





