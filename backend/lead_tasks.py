from __future__ import annotations

import os, time, uuid, json, threading

from typing import Optional, Dict, Any, List

from dataclasses import dataclass, field



from sqlalchemy import create_engine, Column, String, Integer, Text, Float, Boolean

from sqlalchemy.orm import declarative_base, sessionmaker



DATA_DIR = os.environ.get("FREIRAUM_DATA_DIR") or os.path.join(os.getcwd(), "data")

os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "lead_tasks.db")

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine)

Base = declarative_base()



class LeadTask(Base):

    __tablename__ = "lead_tasks"

    id = Column(String, primary_key=True)

    status = Column(String, default="queued")   # queued|running|done|error|canceled

    progress = Column(Float, default=0.0)       # 0..100

    created_at = Column(Float, default=time.time)

    updated_at = Column(Float, default=time.time)

    params = Column(Text)                       # JSON payload

    result = Column(Text)                       # JSON results

    error = Column(Text)                        # error string



Base.metadata.create_all(engine)



def save_task(sess, t: LeadTask):

    t.updated_at = time.time()

    sess.add(t); sess.commit(); sess.refresh(t)

    return t



def get_task(task_id: str) -> Optional[LeadTask]:

    sess = SessionLocal()

    try:

        return sess.get(LeadTask, task_id)

    finally:

        sess.close()



def update_task(task_id: str, **kwargs):

    sess = SessionLocal()

    try:

        t = sess.get(LeadTask, task_id)

        if not t: return

        for k,v in kwargs.items():

            setattr(t, k, v)

        t.updated_at = time.time()

        sess.commit()

    finally:

        sess.close()











