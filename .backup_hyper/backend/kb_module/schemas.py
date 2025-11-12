from typing import List, Optional
from pydantic import BaseModel, Field


class KBCreate(BaseModel):
    topic: str = Field(..., min_length=1, max_length=128)
    tags: Optional[list[str]] = []
    content: str


class KBOut(BaseModel):
    id: int
    topic: str
    tags: list[str] = []
    content: str
    created_at: str


class KBSearchOut(BaseModel):
    results: list[dict]






