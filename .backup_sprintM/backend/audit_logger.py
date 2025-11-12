from __future__ import annotations

import json, os, sqlite3, threading, datetime as dt
from typing import Any, Dict, List, Optional, Tuple

AUDIT_DIR_ENV = "FREIRAUM_DATA_DIR"
DEFAULT_DATA_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "freiraum-mitarbeiter", "data")
AUDIT_DIR = os.environ.get(AUDIT_DIR_ENV, DEFAULT_DATA_DIR)
AUDIT_PATH = os.path.join(AUDIT_DIR, "audit")
AUDIT_DB = os.path.join(AUDIT_PATH, "audit_log.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  level TEXT DEFAULT 'info',
  ip TEXT,
  user_agent TEXT,
  path TEXT,
  method TEXT,
  status INTEGER,
  payload_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
"""

class _ConnPool:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.lock = threading.Lock()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

class AuditLogger:
    _instance: "AuditLogger" = None

    def __init__(self, db_path: str = AUDIT_DB):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.pool = _ConnPool(db_path)
        with self.pool.connect() as c:
            c.executescript(_SCHEMA)
            c.commit()

    @classmethod
    def instance(cls) -> "AuditLogger":
        if not cls._instance:
            cls._instance = AuditLogger()
        return cls._instance

    def log(self, *, action: str, user_id: Optional[str] = None,
            entity_type: Optional[str] = None, entity_id: Optional[str] = None,
            level: str = "info", ip: Optional[str] = None, user_agent: Optional[str] = None,
            path: Optional[str] = None, method: Optional[str] = None, status: Optional[int] = None,
            payload: Optional[Dict[str, Any]] = None) -> int:
        ts = dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        doc = json.dumps(payload or {}, ensure_ascii=False)
        with self.pool.connect() as c:
            cur = c.execute("""INSERT INTO audit_log(ts,user_id,action,entity_type,entity_id,level,ip,user_agent,path,method,status,payload_json)
                               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                            (ts, user_id, action, entity_type, str(entity_id) if entity_id else None,
                             level, ip, user_agent, path, method, status, doc))
            c.commit()
            return int(cur.lastrowid)

    def list(self, *, since: Optional[str] = None, until: Optional[str] = None,
             user_id: Optional[str] = None, action_like: Optional[str] = None,
             limit: int = 500, offset: int = 0) -> List[Dict[str, Any]]:
        q = "SELECT * FROM audit_log WHERE 1=1"
        args: List[Any] = []

        if since:
            q += " AND ts >= ?"
            args.append(since)
        if until:
            q += " AND ts <= ?"
            args.append(until)
        if user_id:
            q += " AND user_id = ?"
            args.append(user_id)
        if action_like:
            q += " AND action LIKE ?"
            args.append(f"%{action_like}%")

        q += " ORDER BY ts DESC LIMIT ? OFFSET ?"
        args.extend([limit, offset])

        with self.pool.connect() as c:
            rows = c.execute(q, args).fetchall()
            return [dict(r) for r in rows]

    def purge_older_than_days(self, days: int) -> int:
        cutoff = (dt.datetime.utcnow() - dt.timedelta(days=days)).replace(microsecond=0).isoformat() + "Z"
        with self.pool.connect() as c:
            cur = c.execute("DELETE FROM audit_log WHERE ts < ?", (cutoff,))
            c.commit()
            return cur.rowcount

    def delete_user(self, user_id: str) -> int:
        with self.pool.connect() as c:
            cur = c.execute("DELETE FROM audit_log WHERE user_id = ?", (user_id,))
            c.commit()
            return cur.rowcount

def get_logger() -> AuditLogger:
    return AuditLogger.instance()

# Lightweight CSV export
def export_csv(rows: List[Dict[str, Any]]) -> str:
    import csv, io
    buf = io.StringIO()
    if not rows:
        rows = []
    fields = ["id", "ts", "user_id", "action", "entity_type", "entity_id", "level", "ip", "user_agent", "path", "method", "status", "payload_json"]
    w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k) for k in fields})
    return buf.getvalue()

# PDF export via reportlab if available, else return None (caller falls back to CSV)
def export_pdf(rows: List[Dict[str, Any]]) -> Optional[bytes]:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
        import io, textwrap, json as _json

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        w, h = A4
        y = h - 20 * mm

        c.setFont("Helvetica-Bold", 12)
        c.drawString(20 * mm, y, "Freiraum Mitarbeiter – Audit Report")
        y -= 8 * mm

        c.setFont("Helvetica", 9)
        now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
        c.drawString(20 * mm, y, f"Erstellt: {now} | Einträge: {len(rows)}")
        y -= 6 * mm

        c.line(20 * mm, y, w - 20 * mm, y)
        y -= 6 * mm

        for r in rows:
            block = f"[{r.get('ts')}] {r.get('user_id') or '-'} | {r.get('action')} | {r.get('path') or ''} {r.get('method') or ''} ({r.get('status') or ''})"
            c.drawString(20 * mm, y, block[:120])
            y -= 5 * mm

            payload = r.get("payload_json") or ""
            if payload:
                ptxt = payload
                wrap = textwrap.wrap(ptxt, width=110)
                for line in wrap[:3]:
                    c.drawString(25 * mm, y, line)
                    y -= 4.5 * mm

            y -= 2 * mm
            if y < 25 * mm:
                c.showPage()
                y = h - 20 * mm
                c.setFont("Helvetica", 9)

        c.showPage()
        c.save()
        return buf.getvalue()
    except Exception:
        return None





