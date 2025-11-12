from __future__ import annotations

from contextlib import asynccontextmanager

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import get_settings
from .core.logging import configure_logging
from .router_loader import load_and_include_routers
from .routers.metrics import router as metrics_router
from .services.scheduler import shutdown_scheduler, start_scheduler

configure_logging()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(metrics_router)
try:
    from .routers.ui_smoke import router as ui_smoke_router

    app.include_router(ui_smoke_router)
except Exception:
    pass
try:
    from .routers.tts_local import router as tts_local_router

    app.include_router(tts_local_router)
except Exception:
    pass
try:
    from .routers.stt_local import router as stt_local_router

    app.include_router(stt_local_router)
except Exception:
    pass
try:
    from .routers.exports import router as exports_router

    app.include_router(exports_router)
except Exception:
    pass
try:
    from .routers.system_features import router as system_features_router

    app.include_router(system_features_router)
except Exception:
    pass
try:
    from .routers.lead_radar import router as lead_radar_router

    app.include_router(lead_radar_router)
except Exception:
    pass
# lead_hunter_osm will be loaded by router_loader
load_and_include_routers(app)



