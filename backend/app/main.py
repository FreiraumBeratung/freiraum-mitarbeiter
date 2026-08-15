from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

try:
    from dotenv import load_dotenv

    # Lade backend/.env deterministisch, unabhängig vom Startverzeichnis.
    backend_env = Path(__file__).resolve().parents[1] / ".env"
    if backend_env.exists():
        load_dotenv(dotenv_path=backend_env, override=True)
    else:
        load_dotenv(override=True)
except Exception:
    pass

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .core.config import get_settings
from .core.logging import configure_logging
from .router_loader import load_and_include_routers
from .routers.metrics import router as metrics_router
from .services.account_session import (
    reset_current_account_id,
    session_token_from_request,
    set_current_account_id,
    verify_account_session,
)
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
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def account_session_middleware(request: Request, call_next):
    account_id = verify_account_session(session_token_from_request(request))
    token = set_current_account_id(account_id)
    try:
        return await call_next(request)
    finally:
        reset_current_account_id(token)

LOCALHOST_ONLY = os.getenv("FM_LOCALHOST_ONLY", "1").strip().lower() in {"1", "true", "yes", "on"}
_LOCALHOST_HOSTS = {"127.0.0.1", "::1", "localhost"}


@app.middleware("http")
async def localhost_only_guard(request: Request, call_next):
    if not LOCALHOST_ONLY:
        return await call_next(request)
    client_host = (request.client.host if request.client else "") or ""
    normalized = client_host.lower()
    if normalized in _LOCALHOST_HOSTS or normalized.startswith("::ffff:127.0.0.1"):
        return await call_next(request)
    return JSONResponse(
        status_code=403,
        content={"ok": False, "detail": "Backend ist auf localhost-Zugriffe beschränkt."},
    )

app.include_router(metrics_router)
try:
    from .routers.ai import router as ai_router

    app.include_router(ai_router, prefix="/api/ai", tags=["ai"])
    # Verifikation: Prüfe OPENAI_API_KEY beim Startup
    print("[fm-ai] Backend gestartet – prüfe OPENAI_API_KEY...")
    if not os.getenv("OPENAI_API_KEY"):
        print("[fm-ai] FEHLER: OPENAI_API_KEY NICHT GEFUNDEN")
    else:
        print("[fm-ai] OK: OPENAI_API_KEY ist gesetzt.")
except Exception:
    pass
# Mail-Router deaktiviert - wir nutzen den Debug-Endpoint direkt in main.py
# try:
#     from .routers.mail import router as mail_router
#     app.include_router(mail_router)
#     print("[fm-mail] Mail-Router registriert: POST /api/mail/send")
# except Exception as e:
#     print(f"[fm-mail] FEHLER beim Laden des Mail-Routers: {e}")
#     pass
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
try:
    from .routers.contacts import router as contacts_router

    app.include_router(contacts_router)
    # Initialisiere Contact Resolver beim Startup (für Logging)
    from .services.contact_resolver import get_contact_resolver
    resolver = get_contact_resolver()
    print(f"[fm-contacts] Contact Resolver initialisiert: {len(resolver.contacts)} Kontakte geladen")
except Exception as e:
    print(f"[fm-contacts] FEHLER beim Laden des Contacts-Routers: {e}")
    pass
try:
    from .routers.auth_microsoft import router as auth_microsoft_router

    app.include_router(auth_microsoft_router)
    print("[fm-auth] Microsoft OAuth Router registriert")
except Exception as e:
    print(f"[fm-auth] FEHLER beim Laden des Microsoft OAuth Routers: {e}")
    pass
try:
    from .routers.admin_accounts import router as admin_accounts_router

    app.include_router(admin_accounts_router)
    print("[fm-admin] Admin-Accounts Router registriert")
except Exception as e:
    print(f"[fm-admin] FEHLER beim Laden des Admin-Routers: {e}")
    pass
# lead_hunter_osm will be loaded by router_loader
load_and_include_routers(
    app,
    exclude_modules={
        "app.routers.ai",
        "app.routers.auth_microsoft",
        "app.routers.contacts",
        "app.routers.exports",
        "app.routers.lead_radar",
        "app.routers.system_features",
        "app.routers.stt_local",
        "app.routers.tts_local",
        "app.routers.ui_smoke",
        "app.routers.metrics",
        "app.routers.admin_accounts",
    },
)


# /api/mail/send wird ausschließlich durch app/routers/mail.py bereitgestellt.



