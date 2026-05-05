from __future__ import annotations

import os
from pathlib import Path

import uvicorn


def _backend_root() -> Path:
    return Path(__file__).resolve().parent


def main() -> None:
    backend_root = _backend_root()
    os.chdir(backend_root)

    host = os.getenv("BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("BACKEND_PORT", "30521"))

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=False,
        log_level=os.getenv("UVICORN_LOG_LEVEL", "info"),
    )


if __name__ == "__main__":
    main()

