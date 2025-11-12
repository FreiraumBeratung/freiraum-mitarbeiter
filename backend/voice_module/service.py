from __future__ import annotations
import os
import requests
from typing import Tuple
from datetime import datetime
from .policies import is_mail_time_allowed, min_score_threshold


BASE = os.getenv("FM_BASE_URL", "http://localhost:30521/api")


def _get(path: str):
    r = requests.get(f"{BASE}{path}", timeout=15)
    r.raise_for_status()
    return r.json()


def _post(path: str, json_body: dict):
    r = requests.post(f"{BASE}{path}", json=json_body, timeout=30)
    r.raise_for_status()
    return r.json()


def _get_profile_pref(key: str, default: str | None = None) -> str | None:
    try:
        prof = _get("/profile")
        # /profile returns list of entries (key/value) – pick match
        if isinstance(prof, list):
            for p in prof:
                if str(p.get("key", "")).lower() == key.lower():
                    return p.get("value", default)
        return default
    except Exception:
        return default


def route_voice_command(user_id: str, text: str) -> dict:
    """
    High-level voice flow:
    - parse intent
    - derive actions
    - apply prefs & policies to choose final mode
    - if "ask": return proposal only (no enqueue)
    - else: enqueue actions and return summary
    """
    # 1) parse
    parsed = _post("/intent/parse", {"user_id": user_id, "text": text})
    
    # 2) default mode preference for leads
    pref_mode = _get_profile_pref("voice.leads.default_mode", "ask")  # "ask" | "add" | "outreach"
    
    # 3) policy guards
    allow_mails_now = is_mail_time_allowed()
    threshold = min_score_threshold()
    
    # Determine effective mode
    mode = parsed.get("slots", {}).get("mode") or pref_mode
    forced_ask_reason = None
    
    # If outreach requested but time not allowed -> force ask
    if mode == "outreach" and not allow_mails_now:
        mode = "ask"
        forced_ask_reason = "Mail-Sperrzeit aktiv (nach 18:00)."
    
    # Get actions from intent parsing (without enqueuing if mode is "ask")
    # Use to_actions from intent module to get actions proposal
    try:
        from ..intent_module.service import to_actions
        actions = to_actions(parsed)
    except Exception:
        # Fallback: if mode is not "ask", call /intent/act to get actions
        if mode != "ask":
            actions_result = _post("/intent/act", {"user_id": user_id, "text": text})
            actions = actions_result.get("actions", [])
        else:
            actions = []
    
    # Filter by threshold
    eligible = [a for a in actions if a.get("score", 0) >= threshold]
    
    # If mode is "ask" OR nothing eligible -> return proposal (no queue changes)
    if mode == "ask" or not eligible:
        return {
            "ok": True,
            "decision": "ask",
            "reason": forced_ask_reason or ("Keine eligible Actions" if not eligible else "Präferenz: Rückfrage"),
            "parsed": parsed,
            "eligible": eligible,
            "enqueued": 0
        }
    
    # Else: enqueue actions via /intent/act
    actions_result = _post("/intent/act", {"user_id": user_id, "text": text})
    return {
        "ok": True,
        "decision": mode,
        "reason": forced_ask_reason or f"Mode '{mode}' aktiv, Schwelle {threshold}",
        "parsed": parsed,
        "eligible": eligible,
        "enqueued": actions_result.get("queued", len(eligible))
    }

