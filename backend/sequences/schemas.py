from pydantic import BaseModel, Field
from typing import List, Optional

class SequenceStep(BaseModel):
    day_offset: int = Field(ge=0, le=365)
    subject: str
    body: str
    attach_flyer: bool = True

class SequenceCreate(BaseModel):
    name: str
    description: str = ""
    steps: List[SequenceStep]

class SequenceOut(BaseModel):
    id: int
    name: str
    description: str
    steps: list

class RunCreate(BaseModel):
    sequence_id: int
    lead_ids: List[int] = []
    attach_flyer: bool = True

class RunOut(BaseModel):
    id: int
    sequence_id: int
    status: str
    logs: str
















