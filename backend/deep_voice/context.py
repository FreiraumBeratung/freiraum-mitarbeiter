from __future__ import annotations
import os, json, datetime as dt
from typing import List, Dict, Optional
from collections import Counter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
CTX_FILE = os.path.join(DATA_DIR, "context_memory.json")

def _load_ctx() -> List[Dict]:
    """Lädt Context-Memory aus JSON-Datei."""
    if os.path.exists(CTX_FILE):
        try:
            return json.load(open(CTX_FILE, "r", encoding="utf8"))
        except Exception:
            return []
    return []

def _save_ctx(data: List[Dict]):
    """Speichert Context-Memory (max. 50 Einträge)."""
    os.makedirs(os.path.dirname(CTX_FILE), exist_ok=True)
    # Behalte nur die letzten 50 Einträge
    json.dump(data[-50:], open(CTX_FILE, "w", encoding="utf8"), ensure_ascii=False, indent=2)

def add_intent(user_id: str, text: str, intent_type: str = "user_message") -> Dict:
    """Fügt einen neuen Intent zum Context-Memory hinzu."""
    ctx = _load_ctx()
    entry = {
        "ts": dt.datetime.now().isoformat(),
        "user_id": user_id,
        "text": text,
        "intent_type": intent_type
    }
    ctx.append(entry)
    _save_ctx(ctx)
    return entry

def get_last_intents(user_id: str, limit: int = 5) -> List[Dict]:
    """Gibt die letzten N Intents eines Users zurück."""
    ctx = _load_ctx()
    user_intents = [e for e in ctx if e.get("user_id") == user_id]
    return user_intents[-limit:]

def infer_patterns(user_id: str) -> Dict[str, any]:
    """Analysiert Patterns im User-Verhalten."""
    intents = get_last_intents(user_id, limit=10)
    
    if len(intents) < 2:
        return {
            "repetition": False,
            "pause_detected": False,
            "suggest_automation": False,
            "suggest_continue": False
        }
    
    # Prüfe auf Wiederholungen
    texts = [i.get("text", "").lower().strip() for i in intents]
    text_counts = Counter(texts)
    repeated = any(count >= 2 for count in text_counts.values())
    
    # Prüfe auf Pause (letzter Intent > 5 Minuten alt)
    if intents:
        last_intent = intents[-1]
        try:
            last_ts = dt.datetime.fromisoformat(last_intent.get("ts", ""))
            pause_seconds = (dt.datetime.now() - last_ts).total_seconds()
            pause_detected = pause_seconds > 300  # 5 Minuten
        except:
            pause_detected = False
    else:
        pause_detected = False
    
    return {
        "repetition": repeated,
        "pause_detected": pause_detected,
        "suggest_automation": repeated,
        "suggest_continue": pause_detected,
        "intent_count": len(intents)
    }

def get_warm_response(user_id: str, context: str = "") -> str:
    """Generiert eine warme, ruhige Antwort basierend auf Kontext."""
    patterns = infer_patterns(user_id)
    
    if patterns.get("suggest_automation"):
        return "Ich habe bemerkt, dass du das öfter wiederholst. Soll ich das automatisieren?"
    
    if patterns.get("suggest_continue"):
        return "Sag mir einfach, womit wir weitermachen."
    
    if context:
        return f"Verstanden. Ich kümmere mich darum."
    
    return "Wie kann ich helfen?"











