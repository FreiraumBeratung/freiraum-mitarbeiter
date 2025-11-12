from fastapi import HTTPException
import subprocess
import os
import pathlib
import uuid

VOICE = "de-DE-KillianNeural"

def speak_text(text: str) -> str:
    if not text or text.strip() == "":
        raise HTTPException(status_code=400, detail="Leertext kann nicht gesprochen werden.")
    # Absoluter Pfad für bessere Zuverlässigkeit
    BASE_DIR = pathlib.Path(__file__).resolve().parent.parent.parent
    voice_dir = BASE_DIR / "data" / "voice"
    voice_dir.mkdir(parents=True, exist_ok=True)
    filename = f"tts_{uuid.uuid4().hex}.wav"
    output_path = voice_dir / filename

    cmd = [
        "edge-tts",
        "--text", text,
        "--voice", VOICE,
        "--rate", "+0%",
        "--pitch", "+0%",
        "--write-media", str(output_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"TTS Fehler: {result.stderr}")
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="TTS-Datei wurde nicht erstellt")
    return str(output_path)

