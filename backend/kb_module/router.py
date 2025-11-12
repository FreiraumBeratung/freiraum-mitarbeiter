from fastapi import APIRouter, Depends, Body, HTTPException
from typing import Any, Dict
from sqlalchemy.orm import Session
from ..db import get_session, Base
from .models import KBItem
from .schemas import KBCreate, KBOut, KBSearchOut
from .service import kb_search


router = APIRouter(prefix="/api/kb", tags=["kb"])


# Compat wrapper (tolerant schema) - accepts title/name and content/body
@router.post("/items", response_model=KBOut)
def create_item(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_session)):
    """
    Compat wrapper: accepts title/name and content/body (+ tags).
    """
    # Lazy import to avoid circular dependency
    from backend.app.compat.schemas import KBCreateCompat
    try:
        data = KBCreateCompat(**payload).canonical()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"invalid kb item: {e}")
    
    # Map to KBCreate format (topic = title)
    it = KBItem(topic=data["title"], tags=data["tags"] or [], content=data["content"])
    db.add(it)
    db.commit()
    db.refresh(it)
    return KBOut(
        id=it.id,
        topic=it.topic,
        tags=it.tags or [],
        content=it.content,
        created_at=it.created_at.isoformat()
    )


@router.get("/items", response_model=list[KBOut])
def list_items(db: Session = Depends(get_session)):
    items = db.query(KBItem).order_by(KBItem.id.desc()).limit(100).all()
    return [
        KBOut(
            id=i.id,
            topic=i.topic,
            tags=i.tags or [],
            content=i.content,
            created_at=i.created_at.isoformat()
        ) for i in items
    ]


@router.get("/search", response_model=KBSearchOut)
def search(q: str, db: Session = Depends(get_session)):
    return {"results": kb_search(db, q, limit=8)}



