"""
API-Router für Contact Resolution
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import logging

from ..services.contact_resolver import get_contact_resolver

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/contacts", tags=["contacts"])


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
        "debug": result.debug
    }
    
    if result.matched_contact:
        response["matchedContact"] = {
            "id": result.matched_contact.id,
            "displayName": result.matched_contact.display_name,
            "aliases": result.matched_contact.aliases,
            "emails": result.matched_contact.emails
        }
    
    return response










