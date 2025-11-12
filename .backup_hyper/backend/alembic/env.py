from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os, sys, pathlib

# Projektpfad hinzufügen, damit "db" importierbar ist
BASE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Importiere SQLAlchemy Base aus unserem Projekt
from db import Base  # type: ignore

# Alembic Config
config = context.config

# Logging (optional)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Ziel-Metadaten (wichtig für --autogenerate)
target_metadata = Base.metadata

# Datenbank-URL setzen (falls nicht aus ini)
if not config.get_main_option("sqlalchemy.url"):
    db_url = "sqlite:///../data/freiraum.db"
    config.set_main_option("sqlalchemy.url", db_url)

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
