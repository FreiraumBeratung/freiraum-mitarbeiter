from typing import List, Optional, Any
from pydantic import BaseModel


class QueueItem(BaseModel):
    id: int
    key: str
    title: str
    reason: str
    score: float
    status: str
    created_at: str
    finished_at: Optional[str]
    result: Optional[Any]


class QueueList(BaseModel):
    items: List[QueueItem]


class ApproveIn(BaseModel):
    ids: List[int]
    approve: bool

















