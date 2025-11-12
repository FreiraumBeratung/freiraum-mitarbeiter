from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime
import os

from .models import Base, CalendarEvent
from .msgraph import create_event_msgraph

DATA_DIR = os.getenv("FREIRAUM_DATA_DIR", os.path.abspath(os.path.join(os.getcwd(), "data")))
DB_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(DATA_DIR, 'freiraum.db')}")
engine = create_engine(DB_URL, connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class EventIn(BaseModel):
    title: str
    start: str  # ISO
    end: str    # ISO
    location: str = ""
    attendees: list[str] = []
    notes: str = ""

@router.post("/create")
def create_event(payload: EventIn, db: Session = Depends(get_db)):
    # Parse ISO strings
    start_dt = datetime.fromisoformat(payload.start.replace("Z", "+00:00") if "Z" in payload.start else payload.start.replace("Z", ""))
    end_dt = datetime.fromisoformat(payload.end.replace("Z", "+00:00") if "Z" in payload.end else payload.end.replace("Z", ""))
    
    ev = CalendarEvent(
        title=payload.title,
        start=start_dt,
        end=end_dt,
        location=payload.location,
        attendees=payload.attendees,
        notes=payload.notes
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    
    # Try MS Graph (optional)
    try:
        create_event_msgraph(ev.title, ev.start.isoformat(), ev.end.isoformat(), payload.attendees, ev.location)
    except Exception:
        pass
    
    return {"id": ev.id, "title": ev.title}

@router.get("/list")
def list_events(db: Session = Depends(get_db)):
    out = []
    for e in db.query(CalendarEvent).order_by(CalendarEvent.start.desc()).limit(100):
        out.append({
            "id": e.id,
            "title": e.title,
            "start": e.start.isoformat(),
            "end": e.end.isoformat(),
            "location": e.location,
            "attendees": e.attendees,
            "notes": e.notes
        })
    return out

