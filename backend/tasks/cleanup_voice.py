from pathlib import Path
import time
import os

def cleanup_old_audio():
    """Lösche TTS-Audio-Dateien älter als 24 Stunden"""
    voice_dir = Path("data/voice")
    if not voice_dir.exists():
        return
    
    now = time.time()
    deleted = 0
    for file in voice_dir.glob("*.wav"):
        try:
            if now - file.stat().st_mtime > 86400:  # older than 24h
                file.unlink()
                deleted += 1
        except Exception:
            pass
    
    if deleted > 0:
        print(f"[CLEANUP] {deleted} alte Voice-Dateien gelöscht")















