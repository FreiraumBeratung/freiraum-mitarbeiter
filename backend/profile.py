from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .db import get_session
from .models import Profile
from datetime import datetime

router = APIRouter(prefix="/api/profile", tags=["profile"])

@router.get("/")
def list_profile(session: Session = Depends(get_session)):
    rows = session.query(Profile).all()
    return [dict(id=r.id, key=r.key, value=r.value, updated_at=r.updated_at) for r in rows]

@router.post("/set")
def set_profile(item: dict, session: Session = Depends(get_session)):
    key = item.get("key"); val = item.get("value")
    row = session.query(Profile).filter(Profile.key==key).one_or_none()
    if row:
        row.value = val; row.updated_at = datetime.utcnow()
    else:
        row = Profile(owner="denis", key=key, value=val, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        session.add(row)
    session.commit()
    return {"ok": True}






















