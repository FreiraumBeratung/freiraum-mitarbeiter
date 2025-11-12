from typing import Optional
import os

from pydantic import BaseModel


class AppSettings(BaseModel):
    env: str = os.getenv("APP_ENV", "dev")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    enable_metrics: bool = os.getenv("ENABLE_METRICS", "1") == "1"
    api_key: Optional[str] = os.getenv("API_KEY")
    sqlite_wal: bool = True
    sqlite_busy_timeout_ms: int = 4000


settings = AppSettings()





