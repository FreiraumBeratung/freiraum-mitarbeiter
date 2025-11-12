import httpx
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from ..core.tts_settings import tts_settings

router = APIRouter(prefix="/api/tts", tags=["tts"])


class SpeakIn(BaseModel):
    text: str


@router.get("/health")
def health():
    ok = True
    provider = tts_settings.provider
    detail = "browser-fallback"
    if provider == "azure":
        ok = bool(tts_settings.azure_key and tts_settings.azure_region)
        detail = "azure-ready" if ok else "azure-missing-keys"
    return {"ok": ok, "provider": provider, "voice": tts_settings.voice_name, "detail": detail}


@router.post("/speak", response_class=Response)
async def speak(inp: SpeakIn):
    if not inp.text.strip():
        raise HTTPException(status_code=400, detail="empty text")
    if (
        tts_settings.provider != "azure"
        or not tts_settings.azure_key
        or not tts_settings.azure_region
    ):
        raise HTTPException(status_code=501, detail="tts not configured (use browser fallback)")

    url = f"https://{tts_settings.azure_region}.tts.speech.microsoft.com/cognitiveservices/v1"
    ssml = f"""
<speak version="1.0" xml:lang="de-DE">
  <voice name="{tts_settings.voice_name}">
    <prosody rate="{tts_settings.rate}" pitch="{tts_settings.pitch}">{inp.text}</prosody>
  </voice>
</speak>
""".strip()
    headers = {
        "Ocp-Apim-Subscription-Key": tts_settings.azure_key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": tts_settings.fmt,
        "User-Agent": "freiraum-mitarbeiter-tts",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, headers=headers, content=ssml)
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"azure tts error: {resp.text[:200]}",
            )
        audio = resp.content
    return Response(content=audio, media_type="audio/mpeg")





