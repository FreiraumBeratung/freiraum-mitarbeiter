import json
import os


DEFAULTS = {
    "provider": "duckduckgo",
    "duckduckgo_html": "https://duckduckgo.com/html/",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Freiraum-Mitarbeiter Bot/1.0",
    "timeout_sec": 10,
    "request_delay_ms": 350,
    "max_per_site_emails": 3,
    "max_pages": 1
}


def load_config():
    path = os.path.join(os.getcwd(), "config", "lead_hunter.json")
    if not os.path.exists(path):
        return DEFAULTS
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            return {**DEFAULTS, **cfg}
    except Exception:
        return DEFAULTS

















