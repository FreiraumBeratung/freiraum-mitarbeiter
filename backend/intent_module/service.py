import json
import os
import re
from typing import Dict, Any
from sqlalchemy.orm import Session


WORD = re.compile(r"[a-zA-ZäöüÄÖÜß]+", re.UNICODE)


def load_dictionary() -> Dict[str, Any]:
    path = os.path.join(os.getcwd(), "config", "intent_dictionary.json")
    if not os.path.exists(path):
        return {
            "categories": {},
            "regions": [],
            "verbs": {"hunt": [], "outreach": [], "add_only": []},
            "modifiers": {"count": []}
        }
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_intent(text: str, user_id: str = "denis") -> Dict[str, Any]:
    import datetime as dt_module
    
    d = load_dictionary()
    t = text.lower()
    
    intent = None
    mode = "ask"  # ask | add | outreach
    
    # schedule?
    if any(v in t for v in d["verbs"].get("schedule", [])):
        intent = "calendar.create"
    
    # verbs
    if any(v in t for v in d["verbs"].get("outreach", [])):
        intent = intent or "lead.outreach"
        mode = "outreach"
    if any(v in t for v in d["verbs"].get("hunt", [])):
        intent = intent or "lead.hunt"
    if any(v in t for v in d["verbs"].get("add_only", [])):
        mode = "add"
    
    # category
    category = None
    for cat, syns in d["categories"].items():
        for s in syns:
            if re.search(rf"\b{s}\b", t):
                category = cat
                break
        if category:
            break
    
    # region / location (simple: one of known tokens)
    location = None
    for r in d.get("regions", []):
        if re.search(rf"\b{re.escape(r.lower())}\b", t):
            location = r.lower()
            break
    
    # count modifier
    count = 20
    for c in d["modifiers"].get("count", []):
        if re.search(rf"\b{re.escape(c)}\b", t):
            try:
                count = int(c)
                break
            except:
                pass
    
    # very simple time extraction (HH[:MM] + weekday/today/tomorrow)
    now = dt_module.datetime.now()
    start = None
    end = None
    duration_min = 30
    
    # hour
    m = re.search(r"\b(\d{1,2})(?:[:\.](\d{2}))?\s*uhr?\b", t)
    if m:
        hh = int(m.group(1))
        mm = int(m.group(2) or "0")
        start = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if start < now:
            start = start + dt_module.timedelta(days=1)
        end = start + dt_module.timedelta(minutes=duration_min)
    
    # weekday / relative
    weekdays = ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"]
    for i, w in enumerate(weekdays):
        if w in t:
            delta = (i - now.weekday()) % 7
            if delta == 0 and now.hour >= 10:
                delta = 7  # if today but past 10am, schedule next week
            if start:
                start = start + dt_module.timedelta(days=delta)
            else:
                start = now.replace(hour=10, minute=0, second=0, microsecond=0) + dt_module.timedelta(days=delta)
            end = start + dt_module.timedelta(minutes=duration_min)
            break
    
    if "morgen" in t and not any(w in t for w in weekdays):
        if not start:
            start = (now + dt_module.timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
            end = start + dt_module.timedelta(minutes=duration_min)
    
    # fallback: if no explicit intent, guess from words
    if not intent:
        if "lead" in t or "leads" in t:
            intent = "lead.hunt"
        else:
            intent = "generic.command"
    
    confidence = 0.6
    if intent.startswith("lead"):
        confidence += 0.2
    if intent == "calendar.create":
        confidence += 0.2
    if category:
        confidence += 0.05
    if location:
        confidence += 0.05
    if start:
        confidence += 0.1
    confidence = min(1.0, confidence)
    
    slots = {
        "category": category,
        "location": location,
        "count": count,
        "mode": mode,
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None
    }
    return {
        "intent": intent,
        "slots": slots,
        "confidence": round(confidence, 2),
        "text": text,
        "user_id": user_id
    }


def to_actions(parsed: Dict[str, Any]) -> list[dict]:
    """Map parsed intent to Automation actions (queued)."""
    intent = parsed["intent"]
    s = parsed["slots"]
    actions = []
    
    if intent in ("lead.hunt", "lead.outreach"):
        actions.append({
            "key": "lead.hunt",
            "title": f"Leads suchen: {s.get('category') or 'branchenoffen'} in {s.get('location') or 'Region offen'}",
            "reason": "Voice-Command",
            "score": 0.85 if s.get("category") else 0.7,
            "payload": {
                "category": s.get("category"),
                "location": s.get("location"),
                "count": s.get("count", 20)
            }
        })
        if s.get("mode") == "outreach" or intent == "lead.outreach":
            actions.append({
                "key": "lead.outreach",
                "title": "Leads anschreiben",
                "reason": "Voice-Command (direkt anschreiben)",
                "score": 0.8,
                "payload": {
                    "template": "default",
                    "attach_flyer": True
                }
            })
        elif s.get("mode") == "add":
            # explicit instruction to add-only -> no outreach action yet
            pass
    elif intent == "calendar.create":
        actions.append({
            "key": "calendar.create",
            "title": "Termin anlegen",
            "reason": "Voice-Command",
            "score": 0.75,
            "payload": {
                "title": "Besprechung Freiraum",
                "start": s.get("start"),
                "end": s.get("end"),
                "attendees": [],
                "location": ""
            }
        })
    else:
        actions.append({
            "key": "reports.show_kpis",
            "title": "KPIs anzeigen",
            "reason": "Generic voice command",
            "score": 0.5,
            "payload": {}
        })
    
    return actions


