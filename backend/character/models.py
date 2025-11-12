from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, Float, Text, JSON, UniqueConstraint

from sqlalchemy.orm import declarative_base



Base = declarative_base()



class ConversationEvent(Base):

    __tablename__ = "conversation_events"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(String(128), index=True, nullable=False)

    role = Column(String(32), nullable=False)  # "user" | "assistant" | "system"

    text = Column(Text, nullable=False)

    sentiment = Column(Float, nullable=False, default=0.0)  # -1..+1

    mood = Column(String(32), nullable=False, default="neutral")

    intensity = Column(Float, nullable=False, default=0.0)  # 0..1

    topics = Column(JSON, nullable=True)  # list[str]

    created_at = Column(DateTime, default=datetime.utcnow, index=True)



class UserState(Base):

    __tablename__ = "user_state"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(String(128), unique=True, nullable=False)

    mood = Column(String(32), nullable=False, default="neutral")

    intensity = Column(Float, nullable=False, default=0.0)

    confidence = Column(Float, nullable=False, default=0.5)  # 0..1

    last_summary = Column(Text, nullable=True)

    recent_topics = Column(JSON, nullable=True)  # list[str]

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class PersonalityProfile(Base):

    __tablename__ = "personality_profile"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(String(128), nullable=False)

    tone = Column(String(64), nullable=False, default="partnerschaftlich, direkt, motivierend")

    humor = Column(String(64), nullable=False, default="dezent")

    formality = Column(String(32), nullable=False, default="mittel")

    focus = Column(JSON, nullable=True)  # list[str], z.B. ["SHK", "ERP", "E-Mail", "Leads"]

    style_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



    __table_args__ = (

        UniqueConstraint('user_id', name='uq_personality_user'),

    )



















