from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db import Base, engine, get_session
from .models import ActionQueue
from .schemas import QueueList, QueueItem, ApproveIn
from .service import enqueue_actions, list_queue, approve_or_reject, run_approved, auto_enqueue
from ..decision.service import think_plan


# Ensure table exists
Base.metadata.create_all(bind=engine)


router = APIRouter(prefix="/api/automation", tags=["automation"])


@router.get("/queue", response_model=QueueList)
def queue(user_id: str, status: str | None = None, db: Session = Depends(get_session)):
    """Get queue items for user, optionally filtered by status"""
    items = list_queue(db, user_id, status)
    data = [{
        "id": i.id,
        "key": i.key,
        "title": i.title,
        "reason": i.reason,
        "score": i.score,
        "status": i.status,
        "created_at": i.created_at.isoformat(),
        "finished_at": i.finished_at.isoformat() if i.finished_at else None,
        "result": i.result
    } for i in items]
    return {"items": data}


@router.post("/approve")
def approve(payload: ApproveIn, db: Session = Depends(get_session)):
    """Approve or reject queued items"""
    n = approve_or_reject(db, payload.ids, payload.approve)
    db.commit()
    return {"ok": True, "count": n}


@router.post("/run")
def run(user_id: str, db: Session = Depends(get_session)):
    """Execute all approved actions for user"""
    res = run_approved(db, user_id)
    db.commit()
    return {"ok": True, "results": res}


@router.post("/auto")
def auto(user_id: str, db: Session = Depends(get_session)):
    """Auto-enqueue eligible actions from Decision Engine"""
    n = auto_enqueue(db, user_id, think_plan)
    return {"ok": True, "queued": n}

