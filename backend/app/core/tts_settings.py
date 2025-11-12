import os

from pydantic import BaseModel


class LocalTTS(BaseModel):
    engine: str = os.getenv("LOCAL_TTS_ENGINE", "piper")
    piper_exe: str = os.getenv("PIPER_EXE", "bin/piper/piper.exe")
    piper_voice: str = os.getenv("PIPER_VOICE", "models/piper/de_DE-thorsten-high.onnx")
    piper_cfg: str = os.getenv(
        "PIPER_VOICE_CONFIG", "models/piper/de_DE-thorsten-high.onnx.json"
    )
    rate: float = float(os.getenv("PIPER_RATE", "0.92"))
    pitch: float = float(os.getenv("PIPER_PITCH", "0.95"))


class TTSSettings(BaseModel):
    provider: str = os.getenv("TTS_PROVIDER", "local")
    local: LocalTTS = LocalTTS()


tts_settings = TTSSettings()
