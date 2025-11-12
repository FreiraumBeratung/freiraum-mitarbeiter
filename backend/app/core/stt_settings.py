import os

from pydantic import BaseModel


class STTLocal(BaseModel):
    whisper_exe: str = os.getenv("WHISPER_EXE", "bin/whisper/main.exe")
    whisper_model: str = os.getenv("WHISPER_MODEL", "models/whisper/ggml-small.bin")
    lang: str = os.getenv("WHISPER_LANG", "de")
    threads: int = int(os.getenv("WHISPER_THREADS", "4"))


class STTSettings(BaseModel):
    provider: str = os.getenv("STT_PROVIDER", "local")
    local: STTLocal = STTLocal()


stt_settings = STTSettings()




