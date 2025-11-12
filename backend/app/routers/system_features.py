from fastapi import APIRouter
import pkgutil
import os
from app.core.env_loader import snapshot_env

router = APIRouter(prefix="/api/system", tags=["system"])

KNOWN_FEATURES = [
    "avatar", "voice_ptt", "tts", "stt", "proactive", "reminders", "lead_hunter",
    "lead_radar", "kb", "calendar", "metrics", "exports", "ui_smoke", "diagnostics"
]


def detect_modules() -> dict:
    """Erkennt vorhandene Module/Features im System."""
    found = set()
    try:
        import app.routers as R
        for _, name, _ in pkgutil.iter_modules(R.__path__):
            found.add(name)
    except Exception:
        pass
    
    # Naive Presence-Mapping
    feats = {f: False for f in KNOWN_FEATURES}
    mapping = {
        "tts": "tts",
        "tts_local": "tts",
        "stt": "stt",
        "stt_local": "stt",
        "proactive": "proactive",
        "lead_hunter": "lead_hunter",
        "lead_async": "lead_hunter",
        "metrics": "metrics",
        "lead_status": "lead_radar",
        "exports": "exports",
        "ui_smoke": "ui_smoke",
    }
    
    for m in mapping:
        if m in found:
            feats[mapping[m]] = True
    
    # UI-local features immer vorhanden, aber toggelbar
    feats["avatar"] = True
    feats["voice_ptt"] = True
    feats["ui_smoke"] = True
    feats["diagnostics"] = True
    
    # KB/Calendar Presence Heuristic
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    feats["kb"] = (
        os.path.exists(os.path.join(backend_root, "app/services/kb")) or
        os.path.exists(os.path.join(backend_root, "app/services/brain")) or
        os.path.exists(os.path.join(backend_root, "services/kb")) or
        os.path.exists(os.path.join(backend_root, "services/brain"))
    )
    feats["calendar"] = (
        os.path.exists(os.path.join(backend_root, "app/services/calendar")) or
        os.path.exists(os.path.join(backend_root, "services/calendar"))
    )
    
    # Reminders sind Teil von proactive
    feats["reminders"] = feats["proactive"]
    
    return feats


@router.get("/features")
def list_features():
    """Listet alle erkannten Features des Systems."""
    return {
        "ok": True,
        "env": snapshot_env(),
        "features": detect_modules()
    }


@router.get("/config")
def get_config():
    """Gibt die aktuelle Systemkonfiguration zurück."""
    env = snapshot_env()
    return {
        "ok": True,
        "real_mode": env.get("real_mode", False),
        "env": env,
        "lead_provider": env.get("LEAD_PROVIDER", "unknown")
    }


