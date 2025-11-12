from fastapi import APIRouter
import time

router = APIRouter()

_started = time.time()


@router.get('/ui/smoke')
def ui_smoke():
    return {'ok': True, 'message': 'UI smoke online'}


@router.get('/ready')
def ready():
    return {'ok': True, 'alive_for_s': round(time.time() - _started, 2)}
from fastapi import APIRouter
router = APIRouter(tags=["ui"])

@router.get("/ui/smoke")
def ui_smoke():
    return {"ok": True, "message": "UI smoke online"}


