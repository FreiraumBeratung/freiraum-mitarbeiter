from fastapi import APIRouter
from typing import Dict, Any
from app.services.osm_overpass import fetch_pois
from app.services.lead_radar import score_list
from app.services.enrichment import enrich_leads
from app.services.export_osm_excel import export_osm_excel

router = APIRouter(tags=["lead_hunter_osm"])


@router.post("/lead_hunter/osm/hunt_async")
def hunt_osm(payload: Dict[str, Any]):
    """OSM Overpass-based lead hunt - synchronous execution with scoring and enrichment"""
    category = (payload.get("category") or "shk").lower()
    location = payload.get("location") or "Arnsberg"
    enable_enrichment = payload.get("enrich", True)  # Default: enabled
    
    try:
        rows = fetch_pois(category, location)
        scored = score_list(rows)
        
        # Enrichment optional
        if enable_enrichment:
            try:
                scored = enrich_leads(scored)
            except Exception as enrich_error:
                # Log enrichment error but continue with unscored leads
                pass
        
    except Exception as e:
        # Return empty result on error (OSM API timeout, network issues, etc.)
        return {
            "ok": True,
            "status": "done",
            "result": {
                "found": 0,
                "leads": [],
                "error": str(e)
            }
        }
    
    return {
        "ok": True,
        "status": "done",
        "result": {
            "found": len(scored),
            "leads": scored
        }
    }


@router.post("/lead_hunter/osm/export")
def export_osm_leads(payload: Dict[str, Any]):
    """Exportiert OSM-Leads als Excel"""
    from fastapi.responses import FileResponse
    import os
    from pathlib import Path
    
    leads = payload.get("leads", [])
    category = payload.get("category", "")
    city = payload.get("city", "")
    
    try:
        filename = export_osm_excel(leads, category, city)
        
        # Resolve file path
        export_dir = Path(os.getenv("EXPORT_DIR", "backend/data/exports"))
        if not export_dir.is_absolute():
            backend_root = Path(__file__).resolve().parents[2]
            export_dir = (backend_root / export_dir).resolve()
        
        filepath = export_dir / filename
        
        if filepath.exists():
            return FileResponse(
                path=str(filepath),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename=filename,
            )
        else:
            return {
                "ok": False,
                "error": "File not found after export"
            }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e)
        }


@router.get("/lead_hunter/osm/categories")
def get_categories():
    """Gibt verfügbare Kategorien zurück"""
    from app.services.osm_filters import OSM_CATEGORY_TAGS
    return {
        "ok": True,
        "categories": list(OSM_CATEGORY_TAGS.keys())
    }

