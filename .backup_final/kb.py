from fastapi import APIRouter

router = APIRouter(prefix="/api/kb", tags=["kb"])

@router.get("/ping")
def ping():
    return {"ok": True, "kb": "local"}


