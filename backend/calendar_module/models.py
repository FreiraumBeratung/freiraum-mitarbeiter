from datetime import datetime
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON

Base = declarative_base()

class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    id = Column(Integer, primary_key=True)
    title = Column(String(200))
    start = Column(DateTime)
    end = Column(DateTime)
    location = Column(String(200), default="")
    attendees = Column(JSON, default=list)  # list of emails
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

