from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from ..db import Base


class KBItem(Base):
    __tablename__ = "kb_items"
    
    id = Column(Integer, primary_key=True)
    topic = Column(String(128), index=True, nullable=False)
    tags = Column(JSON, nullable=True)  # list[str]
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)






