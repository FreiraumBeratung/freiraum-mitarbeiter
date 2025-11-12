import os
import pathlib
import subprocess
from fastapi import HTTPException

# Absoluter Pfad für bessere Zuverlässigkeit
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
WHISPER_BIN = BASE_DIR.parent / "backend" / "voice" / "whisper" / "whisper.exe"
MODEL_PATH = BASE_DIR.parent / "backend" / "voice" / "models" / "ggml-base-de.bin"
# Fallback auf main.exe falls whisper.exe nicht existiert
if not WHISPER_BIN.exists():
    MAIN_BIN = BASE_DIR / "backend" / "voice" / "whisper" / "main.exe"
    if MAIN_BIN.exists():
        WHISPER_BIN = MAIN_BIN

def ensure_model():
    if not MODEL_PATH.exists():
        raise HTTPException(status_code=500, detail=f"Whisper Model nicht gefunden: {MODEL_PATH}. Bitte setup_voice.ps1 ausführen.")

def transcribe_wav(file_path: str):
    ensure_model()
    if not WHISPER_BIN.exists():
        raise HTTPException(status_code=500, detail=f"Whisper Binary nicht gefunden: {WHISPER_BIN}. Bitte setup_voice.ps1 ausführen.")
    cmd = [
        str(WHISPER_BIN),
        file_path,
        "--language", "de",
        "--model", str(MODEL_PATH),
        "--no-timestamps"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Whisper Fehler: {result.stderr}")
    return result.stdout.strip()

