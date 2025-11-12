from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from ..core.tts_settings import tts_settings

router = APIRouter(prefix="/api/tts", tags=["tts"])


class SpeakIn(BaseModel):
    text: str


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


@router.get("/health")
def health():
    root = _backend_root()
    exe = root / tts_settings.local.piper_exe
    voice = root / tts_settings.local.piper_voice
    ok = tts_settings.provider == "local" and exe.exists() and voice.exists()
    return {
        "ok": ok,
        "provider": tts_settings.provider,
        "engine": tts_settings.local.engine,
        "exe": str(exe),
        "voice": str(voice),
    }


@router.post("/speak", response_class=Response)
def speak(inp: SpeakIn):
    if not inp.text.strip():
        raise HTTPException(status_code=400, detail="empty text")
    if tts_settings.provider != "local":
        raise HTTPException(status_code=501, detail="local tts not active")

    root = _backend_root()
    exe = root / tts_settings.local.piper_exe
    voice = root / tts_settings.local.piper_voice
    cfg = root / tts_settings.local.piper_cfg

    if not exe.exists() or not voice.exists():
        raise HTTPException(status_code=500, detail="piper not installed")

    with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as txt_file:
        txt_file.write(inp.text)
        txt_file.flush()
        prompt_path = Path(txt_file.name)

    out_file = Path(tempfile.mkstemp(suffix=".wav")[1])

    cmd = [
        str(exe),
        "--model",
        str(voice),
        "--config",
        str(cfg),
        "--input_file",
        str(prompt_path),
        "--output_file",
        str(out_file),
    ]

    try:
        subprocess.check_call(cmd, cwd=root)
        audio = out_file.read_bytes()
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"piper error: {exc}") from exc
    finally:
        try:
            prompt_path.unlink(missing_ok=True)
            out_file.unlink(missing_ok=True)
        except Exception:
            pass

    return Response(content=audio, media_type="audio/wav")




