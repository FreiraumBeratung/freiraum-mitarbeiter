from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Boolean, Text, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .db import Base

class Company(Base):
    __tablename__ = "company"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), nullable=True)
    phone: Mapped[str] = mapped_column(String(100), nullable=True)
    city: Mapped[str] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Contact(Base):
    __tablename__ = "contact"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("company.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(100), nullable=True)
    company = relationship("Company")

class Lead(Base):
    __tablename__ = "lead"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company: Mapped[str] = mapped_column(String(200))
    contact_name: Mapped[str] = mapped_column(String(200), nullable=True)
    contact_email: Mapped[str] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="new")  # new, contacted, interested, won, lost
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Offer(Base):
    __tablename__ = "offer"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer: Mapped[str] = mapped_column(String(200))
    total_net: Mapped[float] = mapped_column(Float, default=0.0)
    total_gross: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(30), default="draft")  # draft, sent, won, lost
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class OfferItem(Base):
    __tablename__ = "offer_item"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_id: Mapped[int] = mapped_column(Integer, ForeignKey("offer.id"))
    name: Mapped[str] = mapped_column(String(300))
    qty: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)

class FollowUp(Base):
    __tablename__ = "followup"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(50))   # lead|offer
    entity_id: Mapped[int] = mapped_column(Integer)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str] = mapped_column(Text, default="")

class Sequence(Base):
    __tablename__ = "sequence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class SequenceStep(Base):
    __tablename__ = "sequence_step"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sequence_id: Mapped[int] = mapped_column(Integer, ForeignKey("sequence.id"))
    order_no: Mapped[int] = mapped_column(Integer)  # 1..n
    action: Mapped[str] = mapped_column(String(50)) # "email" | "task"
    wait_days: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[str] = mapped_column(Text, default="")  # JSON string (subject/body etc.)

class SequenceRun(Base):
    __tablename__ = "sequence_run"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sequence_id: Mapped[int] = mapped_column(Integer, ForeignKey("sequence.id"))
    lead_id: Mapped[int] = mapped_column(Integer, ForeignKey("lead.id"))
    current_step: Mapped[int] = mapped_column(Integer, default=0)  # last completed
    status: Mapped[str] = mapped_column(String(30), default="running")  # running|stopped|done
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# --- Memory & Insights ---
class Profile(Base):
    __tablename__ = "profile"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner: Mapped[str] = mapped_column(String(100), default="denis")
    key: Mapped[str] = mapped_column(String(200), index=True)
    value: Mapped[dict] = mapped_column(JSON, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Interaction(Base):
    __tablename__ = "interaction"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contact_email: Mapped[str] = mapped_column(String(200), index=True)
    contact_name: Mapped[str] = mapped_column(String(200), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), default="note")  # email|call|offer|note
    direction: Mapped[str] = mapped_column(String(10), default="out")  # in|out
    sentiment: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    meta: Mapped[dict] = mapped_column(JSON, default={})
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

class Suggestion(Base):
    __tablename__ = "suggestion"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(30))  # discount|followup|lead|tip
    title: Mapped[str] = mapped_column(String(300))
    detail: Mapped[str] = mapped_column(Text, default="")
    score: Mapped[float] = mapped_column(Float, default=0.0)
    data: Mapped[dict] = mapped_column(JSON, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)

