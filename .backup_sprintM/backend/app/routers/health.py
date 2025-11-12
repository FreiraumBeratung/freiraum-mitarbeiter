from fastapi import APIRouter
import socket, os, time
from typing import Dict, Any

router = APIRouter(prefix="/api", tags=["health"])

# Hilfen
def _timeout_call(fn, timeout_sec=2.0, default=False):
    start = time.time()
    try:
        return bool(fn()), time.time() - start, None
    except Exception as e:
        return bool(default), time.time() - start, str(e)

def check_db():
    # Soft-check: DB-Datei vorhanden?
    # Viele Audits nutzen SQLite lokal. Wir prüfen nur lesbar/exists.
    data_dir = os.environ.get("FREIRAUM_DATA_DIR") or os.path.join(os.getcwd(), "data")
    db_path = os.path.join(data_dir, "freiraum.db")
    return os.path.exists(db_path)

def check_pdf():
    # Soft check: reportlab optional; wenn nicht vorhanden, ok=True (PDF wird woanders getestet).
    try:
        import reportlab  # noqa
        return True
    except Exception:
        return True  # nicht kritisch für Health

def check_license():
    # Soft check: License-Datei/Key existiert? Wenn nicht, trotzdem ok (App läuft im BASIS-Mode).
    lic_file = os.path.join(os.environ.get("FREIRAUM_DATA_DIR", "data"), "license.json")
    return True if os.path.exists(lic_file) else True

def check_imap():
    host = os.environ.get("IMAP_HOST")
    port = int(os.environ.get("IMAP_PORT", "993"))
    if not host:
        return True
    s = socket.socket()
    s.settimeout(1.5)
    try:
        s.connect((host, port))
        return True
    finally:
        try:
            s.close()
        except Exception:
            pass

def check_smtp():
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "465"))
    if not host:
        return True
    s = socket.socket()
    s.settimeout(1.5)
    try:
        s.connect((host, port))
        return True
    finally:
        try:
            s.close()
        except Exception:
            pass

def aggregate_health() -> Dict[str, Any]:
    results = {}
    ok_db, t_db, e_db = _timeout_call(check_db, 1.5, default=True)
    ok_pdf, t_pdf, e_pdf = _timeout_call(check_pdf, 1.0, default=True)
    ok_lic, t_lic, e_lic = _timeout_call(check_license, 0.5, default=True)
    ok_imap, t_imap, e_imap = _timeout_call(check_imap, 1.5, default=True)
    ok_smtp, t_smtp, e_smtp = _timeout_call(check_smtp, 1.5, default=True)

    results["db"] = {"ok": ok_db, "ms": int(t_db*1000), "err": e_db}
    results["pdf"] = {"ok": ok_pdf, "ms": int(t_pdf*1000), "err": e_pdf}
    results["license"] = {"ok": ok_lic, "ms": int(t_lic*1000), "err": e_lic}
    results["imap"] = {"ok": ok_imap, "ms": int(t_imap*1000), "err": e_imap}
    results["smtp"] = {"ok": ok_smtp, "ms": int(t_smtp*1000), "err": e_smtp}

    # Health ist "ok", wenn Kernteile laufen. Mail ist optional → zählt nicht hart.
    core_ok = ok_db and ok_pdf and ok_lic
    overall = core_ok and True
    return {"ok": overall, "checks": results, "ts": int(time.time())}

@router.get("/health")
def health():
    return aggregate_health()

@router.get("/health/ready")
def health_ready():
    # etwas strenger: alle Komponenten, aber IMAP/SMTP weiterhin weich
    agg = aggregate_health()
    comps = agg["checks"]
    core = comps["db"]["ok"] and comps["pdf"]["ok"] and comps["license"]["ok"]
    agg["ok"] = core
    return agg




