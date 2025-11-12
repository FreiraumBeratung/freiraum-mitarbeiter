from fastapi import APIRouter, UploadFile, File, Form, Body
from typing import Optional, List, Dict
from pydantic import BaseModel
import os, json, datetime as dt
from .audit_logger import get_logger

router = APIRouter(prefix="/api/voice", tags=["voice"])

# Datenverzeichnis
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
async def deepstt(file: UploadFile = File(...)):
    """
    Empfängt Audiodatei, ruft Whisper (lokal oder API) – hier Dummy.
    In Produktion: OpenAI Whisper API oder lokales Whisper-Modell.
    """
    # TODO: Hier würde echte Whisper-Integration kommen
    # Für jetzt: Dummy-Response
    text = "(Simulation) Sprache erkannt: 'Hallo Freiraum, zeige Angebote'"
    
    get_logger().log(
        action="voice.deepstt",
        payload={"filename": file.filename, "text": text, "size": file.size if hasattr(file, 'size') else 0}
    )
    
    return {"ok": True, "text": text}

@router.post("/context/update")
def context_update(
    user: str = Form("denis"),
    message: str = Form(...),
    mood: str = Form("neutral")
):
    """
    Aktualisiert Context-Memory mit neuer Nachricht.
    Unterstützt sowohl Form-Data als auch JSON.
    """
    ctx = _load_ctx()
    entry = {
        "ts": dt.datetime.now().isoformat(),
        "user": user,
        "msg": message,
        "mood": mood
    }
    ctx.append(entry)
    _save_ctx(ctx)
    
    get_logger().log(action="context.update", payload=entry)
    
    return {"ok": True, "memory_len": len(ctx)}


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
def context_list():
    """
    Gibt die letzten 20 Context-Einträge zurück.
    """
    ctx = _load_ctx()
    return {"ok": True, "entries": ctx[-20:]}

