from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..core.stt_settings import stt_settings

router = APIRouter(prefix="/api/stt", tags=["stt"])


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


@router.get("/health")
def health():
    root = _backend_root()
    exe = root / stt_settings.local.whisper_exe
    model = root / stt_settings.local.whisper_model
    ok = stt_settings.provider == "local" and exe.exists() and model.exists()
    return {
        "ok": ok,
        "provider": stt_settings.provider,
        "exe": str(exe),
        "model": str(model),
        "lang": stt_settings.local.lang,
    }


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if stt_settings.provider != "local":
        raise HTTPException(status_code=501, detail="local stt not active")

    root = _backend_root()
    exe = root / stt_settings.local.whisper_exe
    model = root / stt_settings.local.whisper_model

    if not exe.exists() or not model.exists():
        raise HTTPException(status_code=500, detail="whisper not installed")

    suffix = Path(file.filename or "audio").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_in:
        data = await file.read()
        tmp_in.write(data)
        tmp_in.flush()
        in_path = Path(tmp_in.name)

    out_prefix = in_path.with_suffix("")
    out_json = out_prefix.with_suffix(".json")

    cmd = [
        str(exe),
        "-m",
        str(model),
        "-f",
        str(in_path),
        "-l",
        stt_settings.local.lang,
        "-oj",
        "-of",
        str(out_prefix),
        "-t",
        str(stt_settings.local.threads),
    ]

    try:
        subprocess.check_call(cmd, cwd=root)
        if not out_json.exists():
            raise RuntimeError("whisper output missing")
        parsed = json.loads(out_json.read_text(encoding="utf-8"))
        text = " ".join(seg.get("text", "") for seg in parsed.get("segments", [])).strip()
        return {"ok": True, "text": text}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"whisper error: {exc}") from exc
    finally:
        for path in [in_path, out_json, out_prefix.with_suffix(".wav"), out_prefix.with_suffix(".txt")]:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass




