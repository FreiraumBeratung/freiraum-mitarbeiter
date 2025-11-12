from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from app.services.voice_intent import parse_voice_intent, get_available_categories, get_available_cities
from app.services.osm_overpass import fetch_pois
from app.services.lead_radar import score_list
from app.services.enrichment import enrich_leads

router = APIRouter(tags=["voice_intent"])


@router.post("/voice/intent")
def handle_voice_intent(payload: Dict[str, Any]):
    """Verarbeite Voice-Intent und starte OSM Lead Hunt"""
    text = payload.get("text", "")
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    # Parse Intent
    intent = parse_voice_intent(text)
    
    if not intent["valid"]:
        return {
            "ok": False,
            "error": "Invalid intent. Need category and city.",
            "intent": intent
        }
    
    category = intent["category"]
    city = intent["city"]
    
    # Starte OSM Hunt
    try:
        rows = fetch_pois(category, city)
        scored = score_list(rows)
        
        # Enrichment
        try:
            scored = enrich_leads(scored)
        except Exception:
            pass  # Continue without enrichment if it fails
        
        return {
            "ok": True,
            "intent": intent,
            "result": {
                "found": len(scored),
                "leads": scored,
                "category": category,
                "city": city
            }
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "intent": intent
        }


@router.get("/voice/intent/categories")
def get_categories():
    """Gibt verfügbare Kategorien zurück"""
    return {
        "ok": True,
        "categories": get_available_categories()
    }


@router.get("/voice/intent/cities")
def get_cities():
    """Gibt verfügbare Städte zurück"""
    return {
        "ok": True,
        "cities": get_available_cities()
    }


