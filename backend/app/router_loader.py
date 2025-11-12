from __future__ import annotations

import importlib
import logging
import pkgutil
from pathlib import Path
from typing import Iterable

from fastapi import APIRouter, FastAPI

BASE_PACKAGE = __name__.rsplit(".", 1)[0]
ROUTERS_PACKAGE = f"{BASE_PACKAGE}.routers"
ROUTERS_PATH = Path(__file__).resolve().parent / "routers"
_logger = logging.getLogger(__name__)


def iter_router_modules() -> Iterable[str]:
    for module in pkgutil.iter_modules([str(ROUTERS_PATH)]):
        yield f"{ROUTERS_PACKAGE}.{module.name}"


def load_router(module_name: str) -> APIRouter | None:
    module = importlib.import_module(module_name)
    router = getattr(module, "router", None)
    if isinstance(router, APIRouter):
        return router
    return None


def load_and_include_routers(app: FastAPI) -> None:
    for module_name in iter_router_modules():
        if module_name.endswith(".metrics") or module_name.endswith(".tts") or module_name.endswith(".tts_local") or module_name.endswith(".stt_local"):
            continue
        try:
            router = load_router(module_name)
        except Exception as exc:  # pragma: no cover
            _logger.error("Failed to load router %s: %s", module_name, exc)
            continue
        if router:
            app.include_router(router)

