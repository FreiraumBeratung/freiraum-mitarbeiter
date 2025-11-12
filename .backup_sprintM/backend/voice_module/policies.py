from __future__ import annotations
from datetime import datetime, time
import os


def is_mail_time_allowed(now: datetime | None = None) -> bool:
    """No emails after 18:00 unless FM_ALLOW_EVENING_MAILS=1."""
    if os.getenv("FM_ALLOW_EVENING_MAILS", "0") == "1":
        return True
    now = now or datetime.now()
    start = time(7, 0)
    end = time(18, 0)
    return start <= now.time() <= end


def min_score_threshold() -> float:
    """Default minimal score for auto actions."""
    try:
        return float(os.getenv("FM_AUTO_SCORE_MIN", "0.6"))
    except:
        return 0.6






