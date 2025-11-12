from fastapi import APIRouter, Body, Query, Depends
from typing import Optional, Dict, Any, List
import sys
import os

# Import proactive module
# Find project root (backend/app/routers -> backend -> root)
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
_project_root = os.path.abspath(os.path.join(_backend_dir, '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

try:
    # Try direct import from backend root
    import proactive
    create_reminder = proactive.create_reminder
    list_reminders = proactive.list_reminders
    tick_once = proactive.tick_once
    DEFAULT_REMINDER_SECONDS = proactive.DEFAULT_REMINDER_SECONDS
    seconds_from_human = proactive.seconds_from_human
except ImportError:
    try:
        # Fallback: import as module
        from backend import proactive as proactive_module
        create_reminder = proactive_module.create_reminder
        list_reminders = proactive_module.list_reminders
        tick_once = proactive_module.tick_once
        DEFAULT_REMINDER_SECONDS = proactive_module.DEFAULT_REMINDER_SECONDS
        seconds_from_human = proactive_module.seconds_from_human
    except ImportError as e:
        # Last resort: try relative import
        import importlib.util
        proactive_path = os.path.join(_backend_dir, 'proactive.py')
        if os.path.exists(proactive_path):
            spec = importlib.util.spec_from_file_location("proactive", proactive_path)
            proactive = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(proactive)
            create_reminder = proactive.create_reminder
            list_reminders = proactive.list_reminders
            tick_once = proactive.tick_once
            DEFAULT_REMINDER_SECONDS = proactive.DEFAULT_REMINDER_SECONDS
            seconds_from_human = proactive.seconds_from_human
        else:
            raise ImportError(f"Could not import proactive module: {e}")

from sqlalchemy.orm import Session
from backend.db import SessionLocal
from backend.models import Suggestion
from datetime import datetime

router = APIRouter(prefix="/api", tags=["proactive"])

def _push_suggestion(s: Dict[str, Any]):
    """Create a Suggestion from reminder data."""
    db = SessionLocal()
    try:
        sug = Suggestion(
            kind=s.get("kind", "generic"),
            title=s.get("title", "Erinnerung"),
            detail=s.get("text", "Ich habe eine Erinnerung für dich vorbereitet."),
            score=0.7,
            data=s.get("meta", {}),
            created_at=datetime.utcnow()
        )
        db.add(sug)
        db.commit()
        return sug
    finally:
        db.close()

@router.get("/proactive/config")
def get_config():
    return {
        "ok": True,
        "default_seconds": DEFAULT_REMINDER_SECONDS
    }

@router.post("/proactive/remember")
def remember(
    user_id: str = Body(default="denis"),
    kind: str = Body(default="generic"),
    note: str = Body(default=""),
    in_spec: Optional[str] = Body(default=None, alias="in"),  # "1d" | "2h" | "5m" | "5s"
    due_ts: Optional[float] = Body(default=None),
    payload: Optional[Dict[str, Any]] = Body(default=None),
):
    seconds = seconds_from_human(in_spec) if due_ts is None and in_spec else None
    if due_ts is not None:
        out = create_reminder(user_id=user_id, kind=kind, note=note, due_ts=due_ts, payload=payload)
    else:
        out = create_reminder(user_id=user_id, kind=kind, note=note, due_in_seconds=seconds, payload=payload)
    return {"ok": True, "reminder": out}

@router.get("/proactive/reminders")
def reminders(status: Optional[str] = Query(default=None)):
    return {"ok": True, "items": list_reminders(status=status)}

@router.post("/proactive/trigger")
def trigger_tick():
    tick_once(_push_suggestion)
    return {"ok": True, "tick": "done"}


@router.get("/proactive/ping")
def proactive_ping():
    return {"ok": True, "ts": datetime.utcnow().isoformat() + "Z"}


@router.get("/proactive/next")
def proactive_next():
    try:
        items = list_reminders(status="queued")
    except Exception as exc:
        return {"ok": False, "error": str(exc), "items": []}
    top = items[0] if items else None
    return {"ok": True, "next": top}

