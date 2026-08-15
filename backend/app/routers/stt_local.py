from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
import wave
from pathlib import Path

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..core.stt_settings import stt_settings

router = APIRouter(prefix="/api/stt", tags=["stt"])

if os.name == "nt":
    _WHISPER_CREATIONFLAGS = (
        getattr(subprocess, "CREATE_NO_WINDOW", 0)
        | getattr(subprocess, "HIGH_PRIORITY_CLASS", 0)
    )
else:
    _WHISPER_CREATIONFLAGS = 0


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


def _openai_ready() -> bool:
    return bool((os.getenv("OPENAI_API_KEY") or "").strip())


def _local_whisper_ready(root: Path) -> tuple[Path, Path, bool]:
    exe = _resolve_whisper_exe(root)
    model = root / stt_settings.local.whisper_model
    return exe, model, exe.exists() and model.exists()


async def _transcribe_openai(data: bytes, filename: str, lang: str) -> str:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=501, detail="openai stt not configured")
    files = {"file": (filename or "voice.wav", data, "application/octet-stream")}
    form = {
        "model": "whisper-1",
        "language": (lang or "de")[:2],
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files=files,
            data=form,
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"openai stt error: {resp.text[:240]}")
    payload = resp.json() if resp.content else {}
    return str(payload.get("text") or "").strip()


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
    exe, model, local_ready = _local_whisper_ready(root)
    openai_ready = _openai_ready()
    effective = "local" if local_ready else ("openai" if openai_ready else stt_settings.provider)
    ok = effective in {"local", "openai"} and (local_ready or openai_ready)
    return {
        "ok": ok,
        "provider": effective,
        "exe": str(exe),
        "model": str(model),
        "lang": stt_settings.local.lang,
        "openai": openai_ready,
    }


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), mode: str = Form("dictation")):
    root = _backend_root()
    exe, model, local_ready = _local_whisper_ready(root)
    openai_ready = _openai_ready()
    if not local_ready and openai_ready:
        data = await file.read()
        started = time.perf_counter()
        text = await _transcribe_openai(data, file.filename or "voice.wav", stt_settings.local.lang)
        return {
            "ok": True,
            "text": text,
            "mode": (mode or "dictation").strip().lower(),
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
            "fast_profile_used": False,
            "fallback_used": False,
            "command_exe_used": False,
            "provider": "openai",
        }

    if stt_settings.provider != "local":
        raise HTTPException(status_code=501, detail="local stt not active")

    if not local_ready:
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
    cpu_count = os.cpu_count() or stt_settings.local.threads
    command_threads = max(stt_settings.local.threads, min(16, cpu_count))
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
    out_txt = out_prefix.with_suffix(".txt")
    used_fast_profile = False
    fallback_used = False
    command_exe_used = False
    if use_fast_command_mode:
        # Fast-Path für kurze Kommandos:
        # - plain text output statt JSON
        # - keine Timestamps
        # - geringe Suchkomplexität
        # Falls eine Flag in einer Whisper-Version nicht unterstützt wird,
        # fällt der Code unten automatisch auf den stabilen Basis-Call zurück.
        cmd = [
            str(exe),
            "-m",
            str(model),
            "-f",
            str(in_path),
            "-l",
            stt_settings.local.lang,
            "-otxt",
            "-nt",
            "-of",
            str(out_prefix),
            "-t",
            str(command_threads),
            "-bs",
            "1",
            "-bo",
            "1",
        ]
        used_fast_profile = True

    try:
        started = time.perf_counter()
        try:
            subprocess.check_call(
                cmd,
                cwd=root,
                creationflags=_WHISPER_CREATIONFLAGS,
            )
        except Exception:
            if use_fast_command_mode:
                # Sicherheitsnetz: niemals Transkription komplett verlieren.
                fallback_used = True
                subprocess.check_call(
                    base_cmd,
                    cwd=root,
                    creationflags=_WHISPER_CREATIONFLAGS,
                )
            else:
                raise
        text = ""
        if use_fast_command_mode and used_fast_profile and not fallback_used and out_txt.exists():
            text = out_txt.read_text(encoding="utf-8").strip()
        if use_fast_command_mode and used_fast_profile and not fallback_used and not text:
            # Sicherheitsnetz: Fast-Path lieferte keinen Text/Output -> stabiler Base-Call.
            fallback_used = True
            subprocess.check_call(
                base_cmd,
                cwd=root,
                creationflags=_WHISPER_CREATIONFLAGS,
            )
        if not text:
            if not out_json.exists():
                raise RuntimeError("whisper output missing")
            parsed = json.loads(out_json.read_text(encoding="utf-8"))
            text = _extract_text(parsed)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return {
            "ok": True,
            "text": text,
            "mode": mode_normalized,
            "elapsed_ms": elapsed_ms,
            "fast_profile_used": used_fast_profile,
            "fallback_used": fallback_used,
            "command_exe_used": command_exe_used,
            "command_threads": command_threads if use_fast_command_mode else stt_settings.local.threads,
        }
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
    root = _backend_root()
    exe, model, local_ready = _local_whisper_ready(root)
    if not local_ready:
        return {"ok": True, "provider": "openai" if _openai_ready() else stt_settings.provider, "skipped": True}

    if stt_settings.provider != "local":
        return {"ok": False, "provider": stt_settings.provider, "skipped": True}

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




