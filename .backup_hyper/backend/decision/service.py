from __future__ import annotations

from typing import List, Tuple

from datetime import datetime

import os, json, time

import requests



from sqlalchemy.orm import Session

from sqlalchemy import desc



# Import from character module - using existing DB session
from ..character.models import ConversationEvent, UserState

from .models import DecisionRun

from .schemas import Action



LOCAL_BASE = os.getenv("FM_BASE_URL", "http://localhost:30521/api")



# --- Utility: Safe HTTP (same-process call through network to reuse existing endpoints) ---

def _post(path: str, json_body: dict | None = None) -> dict:

    r = requests.post(f"{LOCAL_BASE}{path}", json=json_body or {}, timeout=10)

    r.raise_for_status()

    return r.json()



def _get(path: str) -> dict:

    r = requests.get(f"{LOCAL_BASE}{path}", timeout=10)

    r.raise_for_status()

    return r.json()



# --- Think: build a plan from current state, topics, and KPIs ---

def think_plan(db: Session, user_id: str, max_actions: int = 5) -> Tuple[dict, list[Action]]:

    # State

    st: UserState = db.query(UserState).filter_by(user_id=user_id).first()

    if not st:

        # initialize neutral

        st = UserState(user_id=user_id, mood="neutral", intensity=0.0, confidence=0.5, recent_topics=[], last_summary=None)

        db.add(st); db.flush()



    # Recent events

    recent: list[ConversationEvent] = (

        db.query(ConversationEvent)

          .filter_by(user_id=user_id)

          .order_by(desc(ConversationEvent.id))

          .limit(20)

          .all()

    )



    # KPIs

    try:

        kpis = _get("/reports/kpis")

    except Exception:

        kpis = {"leads": 0, "offers": 0, "won_offers": 0}



    # Heuristics for NBAs

    actions: list[Action] = []



    # 1) Follow-ups due are high priority

    try:

        due = _get("/followups/due")

        if isinstance(due, list) and len(due) > 0:

            n = len(due)

            actions.append(Action(

                key="followups.review",

                title=f"{n} Follow-ups fällig prüfen",

                reason="Fällige Follow-ups haben höchste Umsatznähe.",

                score=0.95,

                payload={"count": n}

            ))

    except Exception:

        pass



    # 2) If recent topics include offers or email, suggest creating/finishing offers

    topics = st.recent_topics or []

    if "offers" in topics:

        actions.append(Action(

            key="offers.create_draft",

            title="Demo-Angebot erstellen",

            reason="Zuletzt Angebote im Fokus – Draft zeigt schnelle Wertschöpfung.",

            score=0.78,

            payload={"items":[{"name":"Beratungspaket Freiraum","qty":1,"unit_price":1990.0}]}

        ))



    # 3) If no offers won -> push KPIs to review

    if kpis.get("won_offers", 0) == 0:

        actions.append(Action(

            key="reports.show_kpis",

            title="KPIs anzeigen",

            reason="Kein gewonnenes Angebot – KPIs zur Lageeinschätzung öffnen.",

            score=0.62,

            payload={}

        ))



    # 4) Positive mood → outreach (seed suggestions)

    if st.mood == "positive":

        actions.append(Action(

            key="insights.seed",

            title="3 neue Vorschläge generieren",

            reason="Positive Stimmung → Momentum nutzen für proaktive Vorschläge.",

            score=0.66,

            payload={}

        ))



    # 5) Email system sanity check occasionally

    actions.append(Action(

        key="mail.send_test",

        title="Testmail versenden",

        reason="Regelmäßiger Mail-Sanity-Check.",

        score=0.40,

        payload={"to":"test@example.com"}

    ))



    # Sort and cap

    actions.sort(key=lambda a: a.score, reverse=True)

    actions = actions[:max_actions]



    meta = dict(mood=st.mood, intensity=st.intensity, confidence=st.confidence,

                kpis=kpis, recent_topics=topics, last_summary=st.last_summary)

    return meta, actions



# --- Execute: run actions safely with idempotence where sensible ---

def execute_actions(db: Session, user_id: str, actions: List[Action], dry_run: bool = False) -> list:

    results = []

    for a in actions:

        if dry_run:

            results.append({"key": a.key, "dry_run": True})

            continue

        try:

            if a.key == "followups.review":

                res = _get("/followups/due")

            elif a.key == "offers.create_draft":
                items = a.payload.get("items") or [{"name":"Service","qty":1,"unit_price":100.0}]
                # Ensure correct format for offers API
                body = {"customer": "Auto-Generated Demo", "items": [{"name": i.get("name", "Item"), "qty": i.get("qty", 1), "unit_price": i.get("unit_price", i.get("price", 100.0))} for i in items]}
                res = _post("/offers/draft", body)

            elif a.key == "reports.show_kpis":

                res = _get("/reports/kpis")

            elif a.key == "insights.seed":
                try:
                    res = _post("/insights/seed", {})
                except Exception:
                    # If seed fails, return a warning instead of error
                    res = {"warn": "insights.seed endpoint may not be available"}

            elif a.key == "mail.send_test":

                res = _post("/mail/send_test", {"to": a.payload.get("to","test@example.com")})

            elif a.key == "lead.hunt":
                body = {
                    "category": a.payload.get("category") or "handwerk",
                    "location": a.payload.get("location") or "sauerland",
                    "count": int(a.payload.get("count", 20)),
                    "save_to_db": True,
                    "export_excel": True
                }
                res = _post("/lead_hunter/hunt", body)

            elif a.key == "lead.outreach":
                leads = a.payload.get("leads") or []
                res = _post("/lead_hunter/outreach", {
                    "leads": leads,
                    "template": a.payload.get("template"),
                    "attach_flyer": bool(a.payload.get("attach_flyer", True))
                })

            elif a.key == "sequence.run":
                res = _post("/sequences/run", {
                    "sequence_id": int(a.payload.get("sequence_id", 0)),
                    "lead_ids": a.payload.get("lead_ids") or [],
                    "attach_flyer": bool(a.payload.get("attach_flyer", True))
                })

            elif a.key == "calendar.create":
                res = _post("/calendar/create", {
                    "title": a.payload.get("title") or "Besprechung",
                    "start": a.payload.get("start"),
                    "end": a.payload.get("end"),
                    "location": a.payload.get("location") or "",
                    "attendees": a.payload.get("attendees") or [],
                    "notes": a.payload.get("notes") or ""
                })

            else:

                res = {"warn": f"unknown action {a.key}"}

            results.append({"key": a.key, "ok": True, "data": res})

        except Exception as e:

            results.append({"key": a.key, "ok": False, "error": str(e)})

    return results



# --- Orchestrate a full run (persisting DecisionRun) ---

def run_decision(db: Session, user_id: str, max_actions: int = 5, auto_execute: bool = False, dry_run: bool = False) -> DecisionRun:

    meta, actions = think_plan(db, user_id, max_actions=max_actions)

    run = DecisionRun(

        user_id=user_id,

        mood=meta["mood"], intensity=meta["intensity"], confidence=meta["confidence"],

        plan=[a.model_dump() for a in actions],

        executed=False, result=None

    )

    db.add(run); db.flush()



    if auto_execute:

        res = execute_actions(db, user_id, actions, dry_run=dry_run)

        run.executed = True and (not dry_run)

        run.result = res

        run.finished_at = datetime.utcnow()

        db.flush()

    return run

