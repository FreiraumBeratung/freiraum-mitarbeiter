from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine

from .settings import settings

DB_URL = "sqlite:///./data/app.db"

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    try:
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute(f"PRAGMA busy_timeout={settings.sqlite_busy_timeout_ms};")
        cur.close()
    except Exception:
        pass


def get_engine():
    return engine





