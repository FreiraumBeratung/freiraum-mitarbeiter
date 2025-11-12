from typing import List, Optional, Any

from pydantic import BaseModel, Field



class Action(BaseModel):

    key: str                       # e.g., "followups.review"

    title: str                     # user-facing title

    reason: str                    # why suggested

    score: float = Field(ge=0, le=1)

    payload: dict = {}



class ThinkIn(BaseModel):

    user_id: str

    max_actions: int = 5



class ThinkOut(BaseModel):

    user_id: str

    mood: str

    intensity: float

    confidence: float

    actions: List[Action]



class ExecuteIn(BaseModel):

    user_id: str

    actions: List[Action]

    dry_run: bool = False



class ExecuteOut(BaseModel):

    ok: bool

    results: list[Any]

    executed: bool



class HistoryOut(BaseModel):

    items: list[dict]








