import os, threading, time

import requests



ENABLED = os.getenv("FM_DECISION_SCHED_ENABLED", "0") == "1"

INTERVAL_SEC = int(os.getenv("FM_DECISION_SCHED_INTERVAL", "900"))  # default 15 min

USER_ID = os.getenv("FM_DECISION_USER_ID", "denis")

BASE = os.getenv("FM_BASE_URL", "http://localhost:30521/api")



def _tick():

    while True:

        try:

            # Think + auto_execute (dry-run off)

            requests.post(f"{BASE}/decision/run", params={"user_id": USER_ID, "max_actions": 5, "auto_execute": True, "dry_run": False}, timeout=30)

        except Exception:

            pass

        time.sleep(INTERVAL_SEC)



def start_scheduler():

    if not ENABLED:

        return

    t = threading.Thread(target=_tick, daemon=True)

    t.start()

    print(f"[Decision Scheduler] Started (interval: {INTERVAL_SEC}s, user: {USER_ID})")



















