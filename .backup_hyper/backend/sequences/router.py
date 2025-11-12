from fastapi import APIRouter, Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
import os
from .models import Base, Sequence, SequenceRun
from .schemas import SequenceCreate, SequenceOut, RunCreate, RunOut
from .service import execute_sequence_run

DATA_DIR = os.getenv("FREIRAUM_DATA_DIR", os.path.abspath(os.path.join(os.getcwd(), "data")))
DB_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(DATA_DIR, 'freiraum.db')}")
engine = create_engine(DB_URL, connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

router = APIRouter(prefix="/api/sequences", tags=["sequences"])

def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=SequenceOut)
def create_sequence(payload: SequenceCreate, db: Session = Depends(get_db)):
    s = Sequence(
        name=payload.name,
        description=payload.description,
        steps=[st.dict() for st in payload.steps]
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return SequenceOut(id=s.id, name=s.name, description=s.description, steps=s.steps)

@router.get("/", response_model=list[SequenceOut])
def list_sequences(db: Session = Depends(get_db)):
    out = []
    for s in db.query(Sequence).order_by(Sequence.id.desc()).limit(100):
        out.append(SequenceOut(id=s.id, name=s.name, description=s.description, steps=s.steps))
    return out

@router.post("/run", response_model=RunOut)
def run_sequence(payload: RunCreate, db: Session = Depends(get_db)):
    s = db.query(Sequence).filter(Sequence.id == payload.sequence_id).first()
    if not s:
        return {"id": 0, "sequence_id": 0, "status": "error", "logs": "sequence not found"}
    
    r = SequenceRun(
        sequence_id=s.id,
        target={"lead_ids": payload.lead_ids, "attach_flyer": payload.attach_flyer}
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    
    ok, logs = execute_sequence_run(db, r, s)
    r.status = "done" if ok else "error"
    r.logs = logs
    db.commit()
    db.refresh(r)
    
    return RunOut(id=r.id, sequence_id=r.sequence_id, status=r.status, logs=r.logs)





