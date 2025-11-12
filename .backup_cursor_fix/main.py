import os, pathlib, socket, logging
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from .db import init_db
from .logging_conf import setup_logging
from .scheduler import process_due_followups, build_suggestions
from .license import ensure_default_license

BASE_DIR = pathlib.Path(__file__).resolve().parent
# Expliziter Pfad zur backend/config/.env
ENV_PATH = BASE_DIR / "config" / ".env"

# Stelle sicher, dass config-Verzeichnis existiert
config_dir = BASE_DIR / "config"
config_dir.mkdir(parents=True, exist_ok=True)

# Erstelle Beispiel-.env falls nicht vorhanden
if not ENV_PATH.exists():
    example_env = """APP_ENV=production
BRAND_NAME=Freiraum Mitarbeiter
BACKEND_HOST=127.0.0.1
BACKEND_PORT=30521
EMAIL_FROM=dein.name@deinedomain.de
IMAP_HOST=imap.ionos.de
IMAP_USER=dein.name@deinedomain.de
IMAP_PASS=DEIN_PASSWORT
SMTP_HOST=smtp.ionos.de
SMTP_USER=dein.name@deinedomain.de
SMTP_PASS=DEIN_PASSWORT
OPENAI_API_KEY=DEIN_OPENAI_KEY
PDF_LOCALE=de_DE
"""
    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.write(example_env)
    print(f"[ENV] Beispiel .env angelegt: {ENV_PATH}")

# Lade .env EXPLIZIT mit override=True
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    print(f"[ENV] Loaded successfully from: {ENV_PATH}", flush=True)
    # Debug: PrÃ¼fe, ob Werte geladen wurden
    if os.getenv("IMAP_HOST"):
        print(f"[ENV] IMAP_HOST geladen: {os.getenv('IMAP_HOST')}", flush=True)
    else:
        print(f"[ENV] WARNING: IMAP_HOST nicht geladen!", flush=True)
else:
    print(f"[ENV] WARNING: .env not found at {ENV_PATH}", flush=True)

APP_ENV = os.getenv("APP_ENV", "dev")
PORT = int(os.getenv("BACKEND_PORT", "30521"))
CORS_ALLOW_ALL = os.getenv("CORS_ALLOW_ALL", "true").lower() == "true"

# Logging
LOGFILE = setup_logging()
log = logging.getLogger(__name__)
log.info("Freiraum Mitarbeiter startingâ€¦")

app = FastAPI(title="Freiraum Mitarbeiter API", version="0.5.0")

# CORS-Matrix: Dev (localhost) + optional Allow-All (z.B. Electron)
origins = ["http://127.0.0.1:5173","http://localhost:5173","http://127.0.0.1:5174","http://localhost:5174","http://127.0.0.1:5175","http://localhost:5175","http://127.0.0.1:5176","http://localhost:5176","http://127.0.0.1:5177","http://localhost:5177"]
if CORS_ALLOW_ALL:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# Health & Readiness Router früh einbinden (vor anderen Routers)
try:
    from .routers import health_ready as _health_ready
    app.include_router(_health_ready.router, prefix="/api")
except Exception as e:
    log.warning(f"Health & Readiness router konnte nicht geladen werden: {e}")

# AUDIT MIDDLEWARE (after CORS, before routes)
from .audit_middleware import AuditAutoMiddleware
app.add_middleware(AuditAutoMiddleware)

# Self-Healer
for rel in ["../data","../exports","../logs","../assets","../docs","../installers","../config"]:
    (BASE_DIR / rel).resolve().mkdir(parents=True, exist_ok=True)

# Lizenz Default sicherstellen
ensure_default_license()

init_db()

class StatusOut(BaseModel):
    ok: bool; env: str; port: int; host: str; data_path: str; exports_path: str; log_file: str

@app.get("/api/system/status", response_model=StatusOut)
def status():
    return StatusOut(
        ok=True, env=APP_ENV, port=PORT, host=socket.gethostname(),
        data_path=str((BASE_DIR.parent/"data").resolve()),
        exports_path=str((BASE_DIR.parent/"exports").resolve()),
        log_file=str((BASE_DIR.parent/"logs"/"app.log").resolve())
    )

# Scheduler (Background)
scheduler = BackgroundScheduler(daemon=True)
scheduler.add_job(process_due_followups, 'interval', minutes=1, id='seq_runner', coalesce=True, max_instances=1)
scheduler.add_job(build_suggestions, 'interval', hours=1, id='insights_builder', coalesce=True, max_instances=1)
try:
    from .tasks.cleanup_voice import cleanup_old_audio
    scheduler.add_job(cleanup_old_audio, 'interval', hours=12, id='voice_cleanup', coalesce=True, max_instances=1)
    log.info("Scheduler: voice cleanup every 12h")
except Exception as e:
    log.warning(f"Voice cleanup job konnte nicht geladen werden: {e}")
scheduler.start()
log.info("Scheduler started: seq_runner every 1m")

# Routers
from .mail import router as mail_router
from .offers import router as offers_router
from .leads import router as leads_router
from .followups import router as fu_router
from .reports import router as reports_router
from .kb import router as kb_router
from .license import router as lic_router
from .health import router as health_router
# Legacy sequences router - use new sequences module if available
try:
    from .sequences.router import router as seq_router
except ImportError:
    try:
        from .sequences import router as seq_router
    except ImportError:
        seq_router = None
from .profile import router as profile_router
from .insights import router as insights_router
from .character.router import router as character_router
from .character.voice_router import router_voice as voice_router
from .decision.router import router as decision_router
from .decision.scheduler import start_scheduler
from .automation.router import router as automation_router
from .audit_router import router as audit_router
from .deep_voice import router as deep_voice_router
try:
    from .kb_module.router import router as kb_module_router
except Exception:
    kb_module_router = None
try:
    from .intent_module.router import router as intent_module_router
except Exception:
    intent_module_router = None
try:
    from .voice_module.router import router as voice_module_router
except Exception:
    voice_module_router = None
try:
    from .lead_hunter.router import router as lead_hunter_router
except Exception:
    lead_hunter_router = None
try:
    from .sequences.router import router as sequences_router
except Exception:
    sequences_router = None
try:
    from .calendar_module.router import router as calendar_router
except Exception:
    calendar_router = None
try:
    from .voice.stt_router import router as stt_router
except Exception:
    stt_router = None
try:
    from .voice.tts_router import router as tts_router
except Exception:
    tts_router = None

app.include_router(mail_router)
app.include_router(offers_router)
app.include_router(leads_router)
app.include_router(fu_router)
app.include_router(reports_router)
app.include_router(kb_router)
app.include_router(lic_router)
app.include_router(health_router)
if seq_router:
    app.include_router(seq_router)
app.include_router(profile_router)
app.include_router(insights_router)
app.include_router(character_router)
app.include_router(voice_router)
app.include_router(decision_router)
app.include_router(automation_router)
if kb_module_router:
    app.include_router(kb_module_router)
if intent_module_router:
    app.include_router(intent_module_router)
if voice_module_router:
    app.include_router(voice_module_router)
if lead_hunter_router:
    app.include_router(lead_hunter_router)
if sequences_router:
    app.include_router(sequences_router)
if calendar_router:
    app.include_router(calendar_router)
if stt_router:
    app.include_router(stt_router)
if tts_router:
    app.include_router(tts_router)

# AUDIT ROUTER
app.include_router(audit_router)

# DEEP VOICE ROUTER
app.include_router(deep_voice_router)

# EventBus importieren, damit Subscriptions aktiv sind
from . import insights  # noqa: F401  (side-effect: subscribes handlers)

# Decision Scheduler starten (optional, via env var)
start_scheduler()

# AUTO-ROUTERS (geladen, wenn vorhanden)
def _autoload_routers():
    import importlib, pkgutil, os, sys
    from pathlib import Path
    base = Path(__file__).resolve().parent
    root_pkg = "backend"
    loaded = []
    backend_dir = base
    for finder, name, ispkg in pkgutil.walk_packages([str(backend_dir)], prefix=root_pkg+"."):
        if name.endswith(".router") or ".router." in name:
            try:
                mod = importlib.import_module(name)
                router = getattr(mod, "router", None)
                if router:
                    app.include_router(router)
                    loaded.append(name)
            except Exception as e:
                print(f"Router load fail: {name} - {e}")
    return loaded

try:
    _autoload_routers()
except Exception as e:
    print(f"Autoload routers error: {e}")
# END AUTO-ROUTERS
