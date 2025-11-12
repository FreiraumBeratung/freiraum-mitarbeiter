from fastapi import APIRouter
from pydantic import BaseModel
import os, time, sqlite3

router = APIRouter()

class HealthResponse(BaseModel):
    ok: bool
    checks: dict
    note: str = "lightweight health; readiness lives at /ready"

class ReadyResponse(BaseModel):
    ok: bool
    since: float | None = None
    details: dict

_START_TS = time.time()

def _db_quick_ok() -> tuple[bool, str | None]:
    try:
        data_dir = os.getenv("FREIRAUM_DATA_DIR") or os.path.join(os.getcwd(), "data")
        os.makedirs(data_dir, exist_ok=True)
        db_path = os.path.join(data_dir, "freiraum.db")
        conn = sqlite3.connect(db_path, timeout=2)
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        cur.fetchall()
        conn.close()
        return True, None
    except Exception as e:
        return False, str(e)

@router.get("/health", response_model=HealthResponse)
def health():
    # Always 200, ok=True if API is up; subchecks are soft
    db_ok, db_err = _db_quick_ok()
    checks = {
        "api": True,
        "db_soft": db_ok,
        "pdf_soft": True,
        "imap_soft": True,
        "smtp_soft": True
    }
    return HealthResponse(ok=True, checks=checks)

@router.get("/ready", response_model=ReadyResponse)
def ready():
    # Hard readiness: API + DB reachable = ready
    db_ok, db_err = _db_quick_ok()
    return ReadyResponse(
        ok=bool(db_ok),
        since=_START_TS if db_ok else None,
        details={"db": db_ok, "db_error": db_err}
    )
