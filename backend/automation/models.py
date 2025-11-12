from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, Float, Boolean
from ..db import Base


class ActionQueue(Base):
    __tablename__ = "action_queue"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String(128), index=True)
    key = Column(String(64))
    title = Column(String(256))
    reason = Column(String(512))
    score = Column(Float)
    payload = Column(JSON)
    status = Column(String(32), default="queued")   # queued|approved|rejected|running|done|failed
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    result = Column(JSON, nullable=True)

















