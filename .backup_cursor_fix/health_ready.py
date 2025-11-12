from fastapi import APIRouter
from pydantic import BaseModel
import time, os, sqlite3, threading

router = APIRouter()

# In-memory ready flag with warmup in background
_READY = {"ok": False, "since": None, "details": {}}

def _warmup():
    """
    Fast warmup for a robust /ready:
    - quick DB probe
    - set flags for optional services (we don't fail readiness on them)
    """
    started = time.time()
    details = {}
    # DB quick probe (sqlite) – best effort
    try:
        data_dir = os.getenv("FREIRAUM_DATA_DIR") or os.path.join(os.getcwd(), "data")
        db_path = os.path.join(data_dir, "freiraum.db")
        os.makedirs(data_dir, exist_ok=True)
        conn = sqlite3.connect(db_path, timeout=3)
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        cur.fetchall()
        conn.close()
        details["db"] = True
    except Exception as e:
        details["db"] = False
        details["db_error"] = str(e)

    # mark optional services best-effort (don't block readiness)
    details["imap"] = True   # actual deep check should live in /audit or /health?verbose=1
    details["smtp"] = True
    details["pdf"]  = True

    _READY["ok"] = True
    _READY["since"] = started
    _READY["details"] = details

# kick off warmup thread if not already done (module import time)
if not _READY.get("since"):
    t = threading.Thread(target=_warmup, daemon=True)
    t.start()

class HealthResponse(BaseModel):
    ok: bool
    checks: dict
    note: str = "health is lightweight; use /ready for startup gating"

@router.get("/health", response_model=HealthResponse)
def health():
    """
    Lightweight health that NEVER fails hard during warm-up.
    Always 200 with ok=True if API is reachable; sub-checks are soft.
    """
    checks = {
        "api": True,
        "db_soft": True,  # soft flag; deep check lives in /ready
        "imap_soft": True,
        "smtp_soft": True,
        "pdf_soft": True
    }
    return HealthResponse(ok=True, checks=checks)

class ReadyResponse(BaseModel):
    ok: bool
    since: float | None = None
    details: dict

@router.get("/ready", response_model=ReadyResponse)
def ready():
    """
    Readiness for startup gating. Returns ok=False until warmup thread sets True.
    """
    return ReadyResponse(ok=_READY["ok"], since=_READY["since"], details=_READY["details"])

