from fastapi import APIRouter
from typing import List, Dict
from app.services.lead_radar import score_list

router = APIRouter(prefix="/api/lead_radar", tags=["lead_radar"])


@router.post("/score")
def lead_radar_score(items: List[Dict]):
    """Berechnet Lead-Radar-Scores für eine Liste von Leads."""
    scored = score_list(items or [])
    return {"ok": True, "items": scored}


