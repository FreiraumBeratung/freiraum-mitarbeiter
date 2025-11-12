import os
import json
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc
from .models import ActionQueue
from ..decision.schemas import Action
from ..decision.service import execute_actions


LOCAL_BASE = os.getenv("FM_BASE_URL", "http://localhost:30521/api")


def enqueue_actions(db: Session, user_id: str, actions: list[Action]):
    """Add actions to the queue"""
    for a in actions:
        q = ActionQueue(
            user_id=user_id,
            key=a.key,
            title=a.title,
            reason=a.reason,
            score=a.score,
            payload=a.payload,
            status="queued"
        )
        db.add(q)
    db.flush()


def list_queue(db: Session, user_id: str, status: str | None = None):
    """List queue items for user, optionally filtered by status"""
    q = db.query(ActionQueue).filter_by(user_id=user_id)
    if status:
        q = q.filter_by(status=status)
    return q.order_by(desc(ActionQueue.created_at)).limit(50).all()


def approve_or_reject(db: Session, ids: list[int], approve: bool):
    """Approve or reject queued items"""
    items = db.query(ActionQueue).filter(ActionQueue.id.in_(ids)).all()
    for i in items:
        i.status = "approved" if approve else "rejected"
    db.flush()
    return len(items)


def run_approved(db: Session, user_id: str):
    """Execute all approved actions for user"""
    items = db.query(ActionQueue).filter_by(user_id=user_id, status="approved").all()
    results = []
    
    from ..decision.schemas import Action
    
    for i in items:
        try:
            i.status = "running"
            i.started_at = datetime.utcnow()
            db.flush()
            
            act = Action(key=i.key, title=i.title, reason=i.reason, score=i.score, payload=i.payload)
            res = execute_actions(db, user_id, [act], dry_run=False)[0]
            
            i.status = "done"
            i.result = res
            i.finished_at = datetime.utcnow()
            results.append(res)
        except Exception as e:
            i.status = "failed"
            i.result = {"error": str(e)}
            db.flush()
    
    db.flush()
    return results


def auto_enqueue(db: Session, user_id: str, think_func):
    """Called by scheduler: generate plan, add to queue if score>=threshold"""
    meta, actions = think_func(db, user_id, max_actions=5)
    threshold = float(os.getenv("FM_AUTO_SCORE_MIN", "0.6"))
    eligible = [a for a in actions if a.score >= threshold]
    
    if eligible:
        enqueue_actions(db, user_id, eligible)
        db.commit()
        return len(eligible)
    return 0






