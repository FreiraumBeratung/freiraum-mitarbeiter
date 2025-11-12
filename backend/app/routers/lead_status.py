from fastapi import APIRouter

router = APIRouter(prefix="/api/lead_status", tags=["lead"])

_last = {"task_id": None}


@router.get("/last")
def last():
    return {"ok": True, "last": _last}


@router.post("/last/{task_id}")
def set_last(task_id: str):
    _last["task_id"] = task_id
    return {"ok": True}





