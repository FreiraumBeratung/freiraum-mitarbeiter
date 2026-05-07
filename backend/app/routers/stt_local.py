from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
import wave
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..core.stt_settings import stt_settings

router = APIRouter(prefix="/api/stt", tags=["stt"])


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_whisper_exe(root: Path) -> Path:
    configured = root / stt_settings.local.whisper_exe
    candidates = [
        root / "bin/whisper/Release/whisper-cli.exe",
        root / "bin/whisper/whisper-cli.exe",
        configured,
        root / "bin/whisper/Release/main.exe",
        root / "bin/whisper/main.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return configured


def _extract_text(parsed: dict) -> str:
    segments = parsed.get("segments")
    if isinstance(segments, list) and segments:
        text = " ".join(str(seg.get("text", "")) for seg in segments if isinstance(seg, dict)).strip()
        if text:
            return text

    transcription = parsed.get("transcription")
    if isinstance(transcription, list) and transcription:
        text = " ".join(str(seg.get("text", "")) for seg in transcription if isinstance(seg, dict)).strip()
        if text:
            return text

    result = parsed.get("result")
    if isinstance(result, dict):
        text = str(result.get("text", "")).strip()
        if text:
            return text
    return ""


def _write_silence_wav(path: Path, duration_sec: float = 0.25, sample_rate: int = 16000) -> None:
    frame_count = max(1, int(sample_rate * duration_sec))
    silence = b"\x00\x00" * frame_count
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(silence)


@router.get("/health")
def health():
    root = _backend_root()
    exe = _resolve_whisper_exe(root)
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
async def transcribe(file: UploadFile = File(...), mode: str = Form("dictation")):
    if stt_settings.provider != "local":
        raise HTTPException(status_code=501, detail="local stt not active")

    root = _backend_root()
    exe = _resolve_whisper_exe(root)
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

    mode_normalized = (mode or "dictation").strip().lower()
    use_fast_command_mode = mode_normalized == "command"
    base_cmd = [
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
    cmd = list(base_cmd)
    if use_fast_command_mode:
        # Fast-Path für kurze Kommandos: geringere Suchkomplexität.
        # Falls eine Flag in einer Whisper-Version nicht unterstützt wird,
        # fällt der Code unten automatisch auf den stabilen Basis-Call zurück.
        cmd.extend(["-bs", "1", "-bo", "1"])

    try:
        started = time.perf_counter()
        try:
            subprocess.check_call(cmd, cwd=root)
        except Exception:
            if use_fast_command_mode:
                # Sicherheitsnetz: niemals Transkription komplett verlieren.
                subprocess.check_call(base_cmd, cwd=root)
            else:
                raise
        if not out_json.exists():
            raise RuntimeError("whisper output missing")
        parsed = json.loads(out_json.read_text(encoding="utf-8"))
        text = _extract_text(parsed)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return {"ok": True, "text": text, "mode": mode_normalized, "elapsed_ms": elapsed_ms}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"whisper error: {exc}") from exc
    finally:
        for path in [in_path, out_json, out_prefix.with_suffix(".wav"), out_prefix.with_suffix(".txt")]:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass


@router.post("/prewarm")
def prewarm():
    if stt_settings.provider != "local":
        return {"ok": False, "provider": stt_settings.provider, "skipped": True}

    root = _backend_root()
    exe = _resolve_whisper_exe(root)
    model = root / stt_settings.local.whisper_model
    if not exe.exists() or not model.exists():
        raise HTTPException(status_code=500, detail="whisper not installed")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_in:
        in_path = Path(tmp_in.name)
    out_prefix = in_path.with_suffix("")
    out_json = out_prefix.with_suffix(".json")
    started = time.perf_counter()
    try:
        _write_silence_wav(in_path)
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
        subprocess.check_call(cmd, cwd=root)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return {"ok": True, "elapsed_ms": elapsed_ms}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"whisper prewarm error: {exc}") from exc
    finally:
        for path in [in_path, out_json, out_prefix.with_suffix(".wav"), out_prefix.with_suffix(".txt")]:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass




