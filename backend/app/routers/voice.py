from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # Safe default: backend STT not implemented (lets frontend fallback to Web Speech)
    # You can later enable faster-whisper here and return: {"text": "..."} with 200.
    return JSONResponse({"ok": False, "reason": "stt_backend_not_enabled"}, status_code=501)


class TtsRequest(BaseModel):
    text: str


def get_piper_paths() -> tuple[Path, Path]:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        raise HTTPException(status_code=500, detail="LOCALAPPDATA not set")

    base_path = Path(local_app_data) / "piper"
    models_path = base_path / "models"

    piper_exe = base_path / "piper.exe"
    model_onnx = models_path / "de_DE-thorsten-medium.onnx"

    if not piper_exe.exists():
        raise HTTPException(status_code=500, detail="piper.exe not found")
    if not model_onnx.exists():
        raise HTTPException(status_code=500, detail="piper model not found")

    return piper_exe, model_onnx


@router.post("/tts", response_class=Response)
async def tts(request: TtsRequest):
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")

    try:
        piper_exe, model_onnx = get_piper_paths()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            wav_path = tmpdir_path / "output.wav"

            cmd = [
                str(piper_exe),
                "--model",
                str(model_onnx),
                "--output_file",
                str(wav_path),
            ]

            proc = subprocess.run(
                cmd,
                input=text.encode("utf-8"),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=tmpdir,
            )

            if proc.returncode != 0:
                err = proc.stderr.decode("utf-8", errors="ignore")
                print("[piper-tts] error:", err)
                raise HTTPException(status_code=500, detail="piper execution failed")

            if not wav_path.exists():
                raise HTTPException(status_code=500, detail="piper did not produce audio file")

            data = wav_path.read_bytes()

    except HTTPException:
        raise
    except Exception as exc:
        print("[piper-tts] unexpected error:", repr(exc))
        raise HTTPException(status_code=500, detail="piper not installed or misconfigured")

    return Response(content=data, media_type="audio/wav")






