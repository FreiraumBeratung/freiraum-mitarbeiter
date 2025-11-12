from fastapi import APIRouter, UploadFile, File, Form, Body, Query
from typing import Optional, List, Dict
from pydantic import BaseModel
import os, json, datetime as dt
from .audit_logger import get_logger

router = APIRouter(prefix="/api/voice", tags=["voice"])

# Import context memory functions
try:
    from .deep_voice.context import add_intent, get_last_intents, infer_patterns, get_warm_response
except ImportError:
    # Fallback wenn Modul nicht gefunden
    def add_intent(*args, **kwargs): return {}
    def get_last_intents(*args, **kwargs): return []
    def infer_patterns(*args, **kwargs): return {}
    def get_warm_response(*args, **kwargs): return "Wie kann ich helfen?"

# Datenverzeichnis (Legacy-Kompatibilität)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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

@router.post("/deepstt")
async def deepstt(file: UploadFile = File(...), user_id: str = Form("denis")):
    """
    Empfängt Audiodatei, ruft Whisper (lokal oder API) – hier Dummy.
    In Produktion: OpenAI Whisper API oder lokales Whisper-Modell.
    Konvertiert informelle Sprache in strukturierten Intent mit warmer, ruhiger Antwort.
    """
    # TODO: Hier würde echte Whisper-Integration kommen
    # Für jetzt: Dummy-Response
    text = "(Simulation) Sprache erkannt: 'Hallo Freiraum, zeige Angebote'"
    
    # Intent zum Context-Memory hinzufügen
    add_intent(user_id, text, "voice_command")
    
    # Warme, ruhige Antwort generieren
    response = get_warm_response(user_id, context=text)
    
    get_logger().log(
        action="voice.deepstt",
        payload={"filename": file.filename, "text": text, "size": file.size if hasattr(file, 'size') else 0, "response": response}
    )
    
    return {"ok": True, "text": text, "response": response, "tone": "warm, ruhig, geschäftlich"}

@router.post("/context/update")
def context_update(
    user: str = Form("denis"),
    message: str = Form(...),
    mood: str = Form("neutral")
):
    """
    Aktualisiert Context-Memory mit neuer Nachricht.
    Unterstützt sowohl Form-Data als auch JSON.
    Generiert warme, ruhige Antwort basierend auf Kontext.
    """
    # Intent hinzufügen
    add_intent(user, message, "user_message")
    
    # Patterns analysieren
    patterns = infer_patterns(user)
    
    # Warme Antwort generieren
    response = get_warm_response(user, context=message)
    
    get_logger().log(action="context.update", payload={"user": user, "message": message, "mood": mood, "response": response, "patterns": patterns})
    
    return {
        "ok": True,
        "memory_len": len(get_last_intents(user, limit=50)),
        "response": response,
        "patterns": patterns
    }


class ContextUpdateModel(BaseModel):
    user: str = "denis"
    message: str
    mood: str = "neutral"

@router.post("/context/update_json")
def context_update_json(payload: ContextUpdateModel = Body(...)):
    """
    Alternative JSON-Variante für Context-Update.
    """
    ctx = _load_ctx()
    entry = {
        "ts": dt.datetime.now().isoformat(),
        "user": payload.user,
        "msg": payload.message,
        "mood": payload.mood
    }
    ctx.append(entry)
    _save_ctx(ctx)
    
    get_logger().log(action="context.update", payload=entry)
    
    return {"ok": True, "memory_len": len(ctx)}


@router.post("/context/update_json_alt")
def context_update_json_alt(data: dict):
    """
    Alternative JSON-Variante für Context-Update (kompatibel mit verschiedenen Request-Formaten).
    """
    from pydantic import BaseModel
    
    class ContextUpdateModel(BaseModel):
        user: str = "denis"
        message: str
        mood: str = "neutral"
    
    try:
        if isinstance(data, dict):
            model = ContextUpdateModel(**data)
        else:
            model = data
        
        ctx = _load_ctx()
        entry = {
            "ts": dt.datetime.now().isoformat(),
            "user": model.user,
            "msg": model.message,
            "mood": model.mood
        }
        ctx.append(entry)
        _save_ctx(ctx)
        
        get_logger().log(action="context.update", payload=entry)
        
        return {"ok": True, "memory_len": len(ctx)}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")

@router.get("/context")
def context_list(user_id: str = Query("denis")):
    """
    Gibt die letzten 20 Context-Einträge zurück.
    """
    intents = get_last_intents(user_id, limit=20)
    patterns = infer_patterns(user_id)
    return {
        "ok": True,
        "entries": intents,
        "patterns": patterns,
        "suggested_response": get_warm_response(user_id)
    }

