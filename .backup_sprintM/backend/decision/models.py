from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, JSON, Boolean, Float

from ..db import Base



class DecisionRun(Base):

    __tablename__ = "decision_runs"

    id = Column(Integer, primary_key=True)

    user_id = Column(String(128), index=True, nullable=False)

    started_at = Column(DateTime, default=datetime.utcnow, index=True)

    finished_at = Column(DateTime, nullable=True)

    mood = Column(String(32), default="neutral")

    intensity = Column(Float, default=0.0)

    confidence = Column(Float, default=0.5)

    plan = Column(JSON)          # list of actions with scores

    executed = Column(Boolean, default=False)

    result = Column(JSON)        # results of execution (per action)

