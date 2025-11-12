from fastapi import APIRouter, Depends, Query

from sqlalchemy.orm import Session

from sqlalchemy import desc

import os

from ..db import get_session

from .models import DecisionRun

from .schemas import ThinkIn, ThinkOut, ExecuteIn, ExecuteOut, HistoryOut, Action

from .service import think_plan, execute_actions, run_decision



router = APIRouter(prefix="/api/decision", tags=["decision"])



@router.post("/think", response_model=ThinkOut)

def think(payload: ThinkIn, db: Session = Depends(get_session)):

    meta, actions = think_plan(db, payload.user_id, max_actions=payload.max_actions)

    return ThinkOut(

        user_id=payload.user_id,

        mood=meta["mood"],

        intensity=meta["intensity"],

        confidence=meta["confidence"],

        actions=actions

    )



@router.post("/execute", response_model=ExecuteOut)

def execute(payload: ExecuteIn, db: Session = Depends(get_session)):

    # Convert dict actions to Action objects if needed

    action_objects = []

    for a in payload.actions:

        if isinstance(a, dict):

            action_objects.append(Action(**a))

        else:

            action_objects.append(a)

    results = execute_actions(db, payload.user_id, action_objects, dry_run=payload.dry_run)

    return ExecuteOut(ok=True, results=results, executed=not payload.dry_run)



@router.post("/run")

def run(user_id: str = Query(...), max_actions: int = Query(5), auto_execute: bool = Query(False), dry_run: bool = Query(False), db: Session = Depends(get_session)):

    run_obj = run_decision(db, user_id=user_id, max_actions=max_actions, auto_execute=auto_execute, dry_run=dry_run)

    db.commit()

    return {"ok": True, "run_id": run_obj.id, "executed": run_obj.executed}



@router.get("/history", response_model=HistoryOut)

def history(user_id: str = Query(...), limit: int = Query(10), db: Session = Depends(get_session)):

    items = db.query(DecisionRun).filter_by(user_id=user_id).order_by(desc(DecisionRun.id)).limit(limit).all()

    as_dict = []

    for r in items:

        as_dict.append({

            "id": r.id,

            "started_at": r.started_at.isoformat() if r.started_at else None,

            "finished_at": r.finished_at.isoformat() if r.finished_at else None,

            "mood": r.mood, "intensity": r.intensity, "confidence": r.confidence,

            "executed": r.executed, "plan": r.plan, "result": r.result

        })

    return HistoryOut(items=as_dict)



















