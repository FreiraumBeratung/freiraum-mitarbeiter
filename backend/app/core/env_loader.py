import os
from typing import Dict, Any


def snapshot_env() -> Dict[str, Any]:
    """Erstellt einen Snapshot der relevanten Umgebungsvariablen (maskiert sensible Werte)."""
    relevant_keys = [
        "APP_ENV",
        "APP_NAME",
        "BACKEND_HOST",
        "BACKEND_PORT",
        "LEAD_PROVIDER",
        "REAL_MODE",
        "EXPORT_DIR",
        "FM_CORS_ALLOW_ORIGINS",
    ]
    
    snapshot: Dict[str, Any] = {}
    
    for key in relevant_keys:
        value = os.getenv(key)
        if value is not None:
            # Maskiere sensible Werte (Passwörter, API Keys)
            if any(sensitive in key.upper() for sensitive in ["PASS", "KEY", "SECRET", "TOKEN"]):
                snapshot[key] = "***" if value else None
            else:
                snapshot[key] = value
        else:
            snapshot[key] = None
    
    # Zusätzliche Konfiguration aus Settings
    try:
        from app.core.config import get_settings
        settings = get_settings()
        snapshot["real_mode"] = os.getenv("REAL_MODE", "false").lower() == "true"
        snapshot["app_name"] = settings.app_name
        snapshot["env"] = settings.env
        snapshot["port"] = settings.port
    except Exception:
        snapshot["real_mode"] = False
        snapshot["app_name"] = "Freiraum Mitarbeiter API"
        snapshot["env"] = "dev"
        snapshot["port"] = 30521
    
    return snapshot


