from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db import get_session
from .service import parse_intent, to_actions
from ..character.service import register_event
from ..automation.service import enqueue_actions
from ..decision.schemas import Action


router = APIRouter(prefix="/api/intent", tags=["intent"])


@router.post("/parse")
def parse(payload: dict, db: Session = Depends(get_session)):
    user_id = payload.get("user_id", "denis")
    text = payload.get("text", "")
    parsed = parse_intent(text, user_id=user_id)
    # log as conversation event for memory
    register_event(db, user_id=user_id, role="user", text=text)
    db.commit()
    return parsed


@router.post("/act")
def act(payload: dict, db: Session = Depends(get_session)):
    user_id = payload.get("user_id", "denis")
    text = payload.get("text", "")
    parsed = parse_intent(text, user_id=user_id)
    actions = to_actions(parsed)
    # enqueue in automation queue
    enqueue_actions(db, user_id, [Action(**a) for a in actions])
    db.commit()
    return {
        "ok": True,
        "parsed": parsed,
        "queued": len(actions),
        "actions": actions
    }






