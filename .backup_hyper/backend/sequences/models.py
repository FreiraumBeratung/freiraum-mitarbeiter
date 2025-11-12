from datetime import datetime
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean

Base = declarative_base()

class Sequence(Base):
    __tablename__ = "sequences"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)
    description = Column(Text, default="")
    steps = Column(JSON, default=list)  # [{day_offset:int, subject:str, body:str, attach_flyer:bool}]
    created_at = Column(DateTime, default=datetime.utcnow)

class SequenceRun(Base):
    __tablename__ = "sequence_runs"
    id = Column(Integer, primary_key=True)
    sequence_id = Column(Integer, nullable=False)
    target = Column(JSON, default=dict)  # {type:"lead|list", lead_ids:[...], meta:{}}
    status = Column(String(24), default="queued")  # queued|running|done|error
    logs = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)





