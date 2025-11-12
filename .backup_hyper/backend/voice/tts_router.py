from fastapi import APIRouter
from fastapi.responses import FileResponse
from .tts_engine import speak_text

router = APIRouter(prefix="/voice/tts", tags=["voice-tts"])

@router.post("")
async def tts(req: dict):
    text = req.get("text", "")
    path = speak_text(text)
    return FileResponse(path, media_type="audio/wav")

