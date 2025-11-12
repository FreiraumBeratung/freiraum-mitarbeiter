from fastapi import APIRouter
router = APIRouter(tags=["ui"])

@router.get("/ui/smoke")
def ui_smoke():
    return {"ok": True, "message": "UI smoke online"}

