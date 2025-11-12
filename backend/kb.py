from fastapi import APIRouter, Body, HTTPException
from typing import Any, Dict
# Lazy import to avoid circular dependency

router = APIRouter(prefix="/api/kb", tags=["kb"])

@router.get("/ping")
def ping():
    return {"ok": True, "kb": "local"}


@router.post("/items", tags=["kb"])
def kb_create_compat(payload: Dict[str, Any] = Body(...)):
    try:
        from backend.compat.schemas import KBCreateCompat
        data = KBCreateCompat(**payload).canonical()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"invalid kb item: {e}")
    try:
        from backend.app.services.kb import create_item
        return create_item(**data)
    except Exception:
        return {"id": 0, **data, "ok": True}


