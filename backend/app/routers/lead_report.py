from fastapi import APIRouter
from fastapi.responses import FileResponse
from typing import Dict, Any
import os
from pathlib import Path
from app.services.pdf_report import build_pdf

router = APIRouter(tags=["lead_report"])


@router.post("/lead_hunter/osm/export_pdf")
def export_pdf(payload: Dict[str, Any]):
    """Exportiert OSM-Leads als PDF-Report"""
    leads = payload.get("leads", [])
    category = payload.get("category", "")
    city = payload.get("city", "")
    
    try:
        filename = build_pdf(leads, category, city)
        
        # Resolve file path
        export_dir = Path(os.getenv("EXPORT_DIR", "backend/data/exports"))
        if not export_dir.is_absolute():
            backend_root = Path(__file__).resolve().parents[2]
            export_dir = (backend_root / export_dir).resolve()
        
        filepath = export_dir / filename
        
        if filepath.exists():
            return FileResponse(
                path=str(filepath),
                media_type="application/pdf",
                filename=filename,
            )
        else:
            return {
                "ok": False,
                "error": "PDF file not found after generation"
            }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e)
        }


