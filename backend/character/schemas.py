from typing import List, Optional

from pydantic import BaseModel, Field



class EventIn(BaseModel):

    user_id: str = Field(..., min_length=1, max_length=128)

    role: str = Field(..., pattern="^(user|assistant|system)$")

    text: str = Field(..., min_length=1)



class EventOut(BaseModel):

    id: int

    user_id: str

    role: str

    text: str

    sentiment: float

    mood: str

    intensity: float

    topics: Optional[list[str]]



class StateOut(BaseModel):

    user_id: str

    mood: str

    intensity: float

    confidence: float

    last_summary: Optional[str]

    recent_topics: list[str]



class ProfileIn(BaseModel):

    user_id: str

    tone: Optional[str] = None

    humor: Optional[str] = None

    formality: Optional[str] = None

    focus: Optional[List[str]] = None

    style_notes: Optional[str] = None



class ProfileOut(BaseModel):

    user_id: str

    tone: str

    humor: str

    formality: str

    focus: List[str] = []

    style_notes: Optional[str] = None



class ResetIn(BaseModel):

    user_id: str

    purge_events: bool = False



















