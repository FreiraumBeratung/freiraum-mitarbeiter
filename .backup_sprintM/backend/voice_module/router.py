from fastapi import APIRouter
from pydantic import BaseModel, Field
from .service import route_voice_command


router = APIRouter(prefix="/api/voice", tags=["voice"])


class VoiceIn(BaseModel):
    user_id: str = Field(default="denis")
    text: str


@router.post("/command")
def voice_command(payload: VoiceIn):
    result = route_voice_command(payload.user_id, payload.text)
    return result






