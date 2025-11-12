from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # Safe default: backend STT not implemented (lets frontend fallback to Web Speech)
    # You can later enable faster-whisper here and return: {"text": "..."} with 200.
    return JSONResponse({"ok": False, "reason": "stt_backend_not_enabled"}, status_code=501)






