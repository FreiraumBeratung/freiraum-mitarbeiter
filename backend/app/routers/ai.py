# backend/app/routers/ai.py

import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str


OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4o-mini"  # gpt-4.1-mini existiert nicht, verwende gpt-4o-mini


def _build_system_prompt() -> str:
    # Systemprompt für den Freiraum-Mitarbeiter
    return (
        "Du bist der 'Freiraum Mitarbeiter', ein deutscher KI-Assistent für Denis Bytyqi "
        "und seine Freiraum-Unternehmensberatung im Sauerland. "
        "Du hilfst bei E-Mails, Kundenkommunikation, Leads, Angeboten und allgemeiner Beratung. "
        "Sprich stets höflich, professionell, aber locker-menschlich. "
        "Antworte immer auf Deutsch. "
        "Wenn du etwas nicht genau weißt, erkläre deine Unsicherheit kurz, "
        "aber gib trotzdem einen sinnvollen, pragmatischen Vorschlag."
    )


async def _call_openai_chat(message: str, context: Optional[str]) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY nicht gesetzt")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    user_content = message
    if context:
        user_content = f"Kontext: {context}\n\nNutzer: {message}"

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": _build_system_prompt()},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.4,
        "max_tokens": 512,
    }

    async with httpx.AsyncClient(timeout=40.0) as client:
        resp = await client.post(OPENAI_API_URL, headers=headers, json=payload)

    if resp.status_code != 200:
        try:
            err = resp.json()
        except Exception:
            err = {"error": resp.text}
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI-Fehler: {err}",
        )

    data = resp.json()
    try:
        reply = data["choices"][0]["message"]["content"]
    except Exception:
        raise HTTPException(status_code=500, detail="Unerwartete Antwortstruktur von OpenAI")

    return reply.strip()


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest) -> ChatResponse:
    """
    KI-Chat für den Freiraum Mitarbeiter.
    message: vom Benutzer gesprochener Text (nach STT).
    context: optional – z.B. letzte Aktion, Modul, etc.
    """
    print("[fm-ai] /api/ai/chat aufgerufen mit message:", payload.message)
    reply = await _call_openai_chat(payload.message, payload.context)
    return ChatResponse(reply=reply)

