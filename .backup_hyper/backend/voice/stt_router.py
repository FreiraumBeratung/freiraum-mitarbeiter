from fastapi import APIRouter, UploadFile, File
import tempfile
from .stt_engine import transcribe_wav

router = APIRouter(prefix="/voice/stt", tags=["voice-stt"])

@router.post("")
async def stt(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(await file.read())
        tmp.flush()
        text = transcribe_wav(tmp.name)
    return {"text": text}

