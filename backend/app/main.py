from __future__ import annotations

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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
    from .routers.ai import router as ai_router

    app.include_router(ai_router, prefix="/api/ai", tags=["ai"])
    # Verifikation: Prüfe OPENAI_API_KEY beim Startup
    import os
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
# lead_hunter_osm will be loaded by router_loader
load_and_include_routers(app)


# DEBUG-ENDPOINT für E-Mail-Versand (ohne SMTP)
class MailSendRequest(BaseModel):
    to: str
    subject: str | None = None
    body: str


@app.post("/api/mail/send")
async def debug_send_mail(req: MailSendRequest):
    """
    DEBUG-ENDPOINT für den Freiraum-Mitarbeiter:
    - Nimmt {to, subject, body} entgegen.
    - Schreibt Logs in die Konsole.
    - Gibt die Daten 1:1 wieder zurück.
    - KEIN SMTP-Versand.
    """
    print("[fm-backend] /api/mail/send aufgerufen", req.dict())
    return {
        "status": "ok",
        "echo": req.dict(),
    }



