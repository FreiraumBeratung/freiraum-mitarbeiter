from fastapi import APIRouter

router = APIRouter(tags=["ui"], prefix="/ui")


@router.get("/smoke")
def smoke():
    return {"ok": True, "message": "UI smoke online"}





