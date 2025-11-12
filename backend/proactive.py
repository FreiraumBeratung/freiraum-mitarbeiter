from __future__ import annotations

import os, json, time, uuid

from typing import Optional, List, Dict, Any

from dataclasses import dataclass, asdict



from sqlalchemy import Column, String, Float, Text, create_engine, select

from sqlalchemy.orm import declarative_base, sessionmaker



DATA_DIR = os.environ.get("FREIRAUM_DATA_DIR") or os.path.join(os.getcwd(), "data")

os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "proactive.db")



Base = declarative_base()

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine)



DEFAULT_REMINDER_SECONDS = 24 * 60 * 60  # 1 Tag

MIN_TICK_SECONDS = 30.0



class Reminder(Base):

    __tablename__ = "reminders"

    id = Column(String, primary_key=True)

    user_id = Column(String, default="denis")

    status = Column(String, default="queued")  # queued|due|done|canceled

    kind = Column(String, default="generic")   # followup|task|generic

    note = Column(String, default="")

    due_ts = Column(Float, default=0.0)

    created_ts = Column(Float, default=0.0)

    updated_ts = Column(Float, default=0.0)

    payload = Column(Text, default="{}")       # JSON String



Base.metadata.create_all(engine)



def now() -> float:

    return time.time()



def _save(session: Session, obj):

    session.add(obj); session.commit(); session.refresh(obj); return obj



def create_reminder(user_id: str = "denis",

                    kind: str = "generic",

                    note: str = "",

                    due_in_seconds: Optional[float] = None,

                    due_ts: Optional[float] = None,

                    payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:

    t_now = now()

    if due_ts is None:

        if due_in_seconds is None: due_in_seconds = DEFAULT_REMINDER_SECONDS

        due_ts = t_now + float(due_in_seconds)

    r = Reminder(

        id=str(uuid.uuid4()),

        user_id=user_id,

        status="queued",

        kind=kind,

        note=note or "",

        due_ts=due_ts,

        created_ts=t_now,

        updated_ts=t_now,

        payload=json.dumps(payload or {})

    )

    s = SessionLocal()

    try:

        _save(s, r)

        return reminder_to_dict(r)

    finally:

        s.close()



def list_reminders(status: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:

    s = SessionLocal()

    try:

        q = select(Reminder).order_by(Reminder.due_ts.asc())

        rows = s.execute(q).scalars().all()

        out = []

        for r in rows:

            if status and r.status != status: continue

            out.append(reminder_to_dict(r))

        return out[:limit]

    finally:

        s.close()



def load_reminder(rem_id: str) -> Optional[Reminder]:

    s = SessionLocal()

    try:

        obj = s.get(Reminder, rem_id)

        return obj

    finally:

        s.close()



def update_status(rem_id: str, new_status: str):

    s = SessionLocal()

    try:

        obj = s.get(Reminder, rem_id)

        if not obj: return False

        obj.status = new_status

        obj.updated_ts = now()

        s.commit()

        return True

    finally:

        s.close()



def reminder_to_dict(r: Reminder) -> Dict[str, Any]:

    return {

        "id": r.id,

        "user_id": r.user_id,

        "status": r.status,

        "kind": r.kind,

        "note": r.note,

        "due_ts": r.due_ts,

        "created_ts": r.created_ts,

        "updated_ts": r.updated_ts,

        "payload": json.loads(r.payload or "{}"),

    }



def seconds_from_human(spec: str) -> float:

    # accepts "5s", "15m", "2h", "1d"

    spec = (spec or "").strip().lower()

    if not spec: return DEFAULT_REMINDER_SECONDS

    if spec.endswith("s"): return float(spec[:-1] or 0)

    if spec.endswith("m"): return float(spec[:-1] or 0) * 60

    if spec.endswith("h"): return float(spec[:-1] or 0) * 3600

    if spec.endswith("d"): return float(spec[:-1] or 0) * 86400

    # fallback: numeric seconds

    try:

        return float(spec)

    except:

        return DEFAULT_REMINDER_SECONDS



def tick_once(push_suggestion_cb):

    """Process all due reminders; for each due -> push suggestion + mark done."""

    t_now = now()

    s = SessionLocal()

    try:

        rows = s.execute(select(Reminder).order_by(Reminder.due_ts.asc())).scalars().all()

        for r in rows:

            if r.status == "queued" and r.due_ts <= t_now:

                # Build warm, calm, business suggestion:

                sug = {

                    "title": "Erinnerung",

                    "text": r.note or "Ich habe eine Erinnerung für dich vorbereitet.",

                    "kind": r.kind,

                    "meta": {"reminder_id": r.id, "payload": json.loads(r.payload or "{}")},

                    "tone": "ruhig, warm, geschäftlich",

                    "cta": "Jetzt übernehmen"

                }

                try:

                    push_suggestion_cb(sug)

                    r.status = "done"

                    r.updated_ts = now()

                    s.commit()

                except Exception as e:

                    # do not crash; leave queued to retry next tick

                    pass

        return True

    finally:

        s.close()

