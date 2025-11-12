from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from typing import List, Tuple
from .audit_logger import get_logger

# Welche Pfade werden automatisch protokolliert?
AUDIT_AUTO: List[Tuple[str, str, str]] = [
    ("/api/voice/command", "POST", "voice.command"),
    ("/api/intent/act", "POST", "intent.act"),
    ("/api/lead_hunter/hunt", "POST", "lead.hunt"),
    ("/api/lead_hunter/outreach", "POST", "lead.outreach"),
    ("/api/offers/draft", "POST", "offers.draft"),
    ("/api/mail/send_test", "POST", "mail.send"),
    ("/api/profile/set", "POST", "profile.set"),
    ("/api/decision/execute", "POST", "decision.execute"),
    ("/api/followups", "POST", "followups.create"),
    ("/api/calendar/create", "POST", "calendar.create"),
    ("/api/sequences/run", "POST", "sequences.run"),
]

class AuditAutoMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        try:
            for path, method, action in AUDIT_AUTO:
                if request.url.path.startswith(path) and request.method == method:
                    logger = get_logger()
                    ua = request.headers.get("user-agent", "")
                    ip = request.client.host if request.client else None

                    # Try to get user_id from headers or default
                    user_id = request.headers.get("X-User-Id", "denis")
                    
                    # Note: Body parsing would require reading the body, which consumes it
                    # For now, we rely on X-User-Id header or default
                    # Body content can be logged separately if needed

                    logger.log(
                        action=action,
                        user_id=user_id,
                        path=request.url.path,
                        method=request.method,
                        status=response.status_code,
                        ip=ip,
                        user_agent=ua,
                        payload={"query": dict(request.query_params)}
                    )
                    break
        except Exception:
            # Log-Schreiben darf niemals Requests brechen
            pass

        return response

