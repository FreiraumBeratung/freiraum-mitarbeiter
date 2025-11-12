import os
from functools import lru_cache
from typing import List

from pydantic import BaseModel, Field


class Settings(BaseModel):
    app_name: str = Field(default="Freiraum Mitarbeiter API")
    env: str = Field(default="dev")
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=30521)
    cors_allow_origins: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "Freiraum Mitarbeiter API"),
        env=os.getenv("APP_ENV", "dev"),
        host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        port=int(os.getenv("BACKEND_PORT", "30521")),
        cors_allow_origins=_read_origins(),
    )


def _read_origins() -> List[str]:
    raw = os.getenv("FM_CORS_ALLOW_ORIGINS")
    defaults = ["http://localhost:5173", "http://127.0.0.1:5173"]
    if not raw:
        return defaults
    entries = [item.strip() for item in raw.split(",") if item.strip()]
    combined = defaults + [origin for origin in entries if origin not in defaults]
    return combined

