import time

from fastapi import APIRouter

from ..core.settings import settings

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/ping")
def ping():
    return {"ok": True, "ts": time.time(), "env": settings.env}





