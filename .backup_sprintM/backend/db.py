import os, pathlib
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

BASE_DIR = pathlib.Path(__file__).resolve().parent
DB_PATH = (BASE_DIR.parent / "data" / "freiraum.db")
DB_URL = f"sqlite:///{DB_PATH}"

class Base(DeclarativeBase): pass

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def init_db():
    from . import models  # ensure models imported
    # Import decision models to register them with Base
    try:
        from .decision import models as decision_models  # noqa: F401
    except ImportError:
        pass  # Decision module may not exist yet
    # Import automation models to register them with Base
    try:
        from .automation import models as automation_models  # noqa: F401
    except ImportError:
        pass  # Automation module may not exist yet
    # Import KB module models to register them with Base
    try:
        from .kb_module import models as kb_module_models  # noqa: F401
    except ImportError:
        pass  # KB module may not exist yet
    Base.metadata.create_all(bind=engine)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

