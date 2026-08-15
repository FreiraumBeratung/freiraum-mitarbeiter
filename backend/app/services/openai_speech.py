from __future__ import annotations

import os

import httpx


def openai_api_key() -> str:
    return (os.getenv("OPENAI_API_KEY") or "").strip()


async def tts_audio(text: str) -> tuple[bytes, str]:
    api_key = openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY fehlt")
    cleaned = (text or "").strip()
    if not cleaned:
        raise RuntimeError("empty text")
    voice = (os.getenv("OPENAI_TTS_VOICE") or "onyx").strip() or "onyx"
    model = (os.getenv("OPENAI_TTS_MODEL") or "tts-1-hd").strip() or "tts-1-hd"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "input": cleaned[:4096],
                "voice": voice,
                "response_format": "mp3",
            },
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"openai tts error: {resp.text[:240]}")
    return resp.content, "audio/mpeg"


async def tts_wav(text: str) -> bytes:
    data, _media_type = await tts_audio(text)
    return data
