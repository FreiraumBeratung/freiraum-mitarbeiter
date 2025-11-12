from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .db import SessionLocal
from .models import FollowUp

router = APIRouter(prefix="/api/followups", tags=["followups"])

class FUCreate(BaseModel):
    entity_type: str  # lead|offer
    entity_id: int
    due_at: datetime
    note: str = ""

@router.post("/")
def create_fu(data: FUCreate):
    if data.entity_type not in ("lead","offer"):
        raise HTTPException(400, "entity_type must be lead|offer")
    db = SessionLocal()
    try:
        fu = FollowUp(entity_type=data.entity_type, entity_id=data.entity_id, due_at=data.due_at, note=data.note, done=False)
        db.add(fu); db.commit()
        return {"ok": True, "id": fu.id}
    finally:
        db.close()

@router.get("/")
def list_fu(limit: int = 100):
    db = SessionLocal()
    try:
        items = db.query(FollowUp).order_by(FollowUp.due_at.asc()).limit(limit).all()
        return [{"id":x.id,"type":x.entity_type,"entity_id":x.entity_id,"due_at":x.due_at.isoformat(),"done":x.done,"note":x.note} for x in items]
    finally:
        db.close()

@router.get("/due")
def get_due():
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        items = db.query(FollowUp).filter(FollowUp.done==False, FollowUp.due_at <= now).all()
        return [{"id":x.id,"type":x.entity_type,"entity_id":x.entity_id,"due_at":x.due_at.isoformat(),"note":x.note} for x in items]
    finally:
        db.close()

@router.post("/{fu_id}/toggle")
def toggle_done(fu_id: int):
    db = SessionLocal()
    try:
        x = db.get(FollowUp, fu_id)
        if not x: raise HTTPException(404, "not found")
        x.done = not x.done
        db.commit()
        return {"ok": True, "done": x.done}
    finally:
        db.close()
