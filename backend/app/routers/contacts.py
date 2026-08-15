"""
API-Router für Contact Resolution
"""

from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel, EmailStr
import logging

from ..services.contact_resolver import get_contact_resolver
from ..services.contact_store import get_contact_store
from ..services.account_session import get_current_account_id

logger = logging.getLogger(__name__)


def require_account() -> str:
    account_id = get_current_account_id()
    if not account_id:
        raise HTTPException(status_code=401, detail="Nicht angemeldet.")
    return account_id


router = APIRouter(prefix="/api/contacts", tags=["contacts"], dependencies=[Depends(require_account)])


class ManualContactCreateRequest(BaseModel):
    email: EmailStr
    displayName: str
    aliases: list[str] = []


def _looks_like_real_person_contact(contact: dict) -> bool:
    email_value = str(contact.get("email") or "").strip().lower()
    display_name = str(contact.get("display_name") or "").strip().lower()
    source = str(contact.get("source") or "").strip().lower()
    if "@" not in email_value:
        return False
    local = email_value.split("@", 1)[0]
    blocked_tokens = [
        "noreply",
        "no-reply",
        "donotreply",
        "do-not-reply",
        "newsletter",
        "notification",
        "notifications",
        "support",
        "service",
        "system",
        "mailer",
        "info",
    ]
    if any(tok in local for tok in blocked_tokens):
        return False
    if any(tok in display_name for tok in blocked_tokens):
        return False
    if source in {"send", "manual"}:
        return True
    person_hints = [" ", ",", "dr.", "herr", "frau"]
    if any(h in display_name for h in person_hints):
        return True
    return False


@router.get("/resolve")
def resolve_contact(name: str = Query(..., description="Name, der aufgelöst werden soll")):
    """
    Löst einen Namen in eine E-Mail-Adresse auf.
    
    Beispiel:
        GET /api/contacts/resolve?name=freiraumberatung
        GET /api/contacts/resolve?name=dem freiraumberatung
        GET /api/contacts/resolve?name=denis
    """
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Parameter 'name' darf nicht leer sein")
    
    resolver = get_contact_resolver()
    result = resolver.resolve(name)
    
    # Response bauen
    response = {
        "ok": result.email is not None,
        "inputName": name,
        "email": result.email,
        "matchedContact": None,
        "debug": result.debug,
        "ambiguity": None,
    }
    
    if result.matched_contact:
        response["matchedContact"] = {
            "id": result.matched_contact.id,
            "displayName": result.matched_contact.display_name,
            "aliases": result.matched_contact.aliases,
            "emails": result.matched_contact.emails
        }

    if result.ambiguous_contacts:
        response["ambiguity"] = {
            "message": "Mehrere Kontakte passen. Bitte Auswahl präzisieren.",
            "choices": [
                {
                    "id": c.id,
                    "displayName": c.display_name,
                    "email": c.emails[0] if c.emails else None,
                }
                for c in result.ambiguous_contacts
            ],
        }
    
    return response


@router.get("/status")
def contacts_status():
    """
    Diagnostik-Endpoint für Contact-Quellen und Lernspeicher.
    """
    resolver = get_contact_resolver()
    return {
        "ok": True,
        "sources": resolver.get_status_snapshot(),
    }


@router.get("/learned")
def learned_contacts(
    personOnly: bool = Query(True, description="Nur wahrscheinliche Personenkontakte liefern"),
    limit: int = Query(200, ge=1, le=1000),
):
    store = get_contact_store()
    rows = store.get_contacts()
    if personOnly:
        rows = [row for row in rows if _looks_like_real_person_contact(row)]
    return {"ok": True, "total": len(rows), "items": rows[:limit]}


@router.post("/manual")
def create_manual_contact(req: ManualContactCreateRequest):
    display = (req.displayName or "").strip()
    if not display:
        raise HTTPException(status_code=400, detail="displayName darf nicht leer sein.")
    store = get_contact_store()
    aliases = [a.strip() for a in (req.aliases or []) if isinstance(a, str) and a.strip()]
    store.upsert_contact(
        email=str(req.email).strip().lower(),
        display_name=display,
        aliases=aliases,
        source="manual",
    )
    return {"ok": True}


@router.delete("/learned")
def delete_learned_contact(email: EmailStr = Query(...)):
    store = get_contact_store()
    deleted = store.delete_contact(str(email))
    return {"ok": True, "deleted": bool(deleted)}












