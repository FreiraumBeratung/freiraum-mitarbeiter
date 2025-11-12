from fastapi import APIRouter, Body
from pydantic import BaseModel, Field
from typing import List
import os
import requests


router = APIRouter(prefix="/api/lead_hunter", tags=["lead_hunter"])

BASE = os.getenv("FM_BASE_URL", "http://localhost:30521/api")
DATA_DIR = os.getenv("FREIRAUM_DATA_DIR", os.path.abspath(os.path.join(os.getcwd(), "data")))
EXPORTS_DIR = os.path.join(DATA_DIR, "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)

from .providers import ddg_links, bing_links, scrape_contact
from .excel import export_leads_xlsx
from .outreach import send_bulk


class HuntIn(BaseModel):
    category: str = Field(..., description="z.B. shk, elektro, makler, sanitär, heizung")
    location: str = Field(..., description="z.B. arnsberg, neheim, meschede")
    count: int = Field(default=20, ge=1, le=200)
    save_to_db: bool = True
    export_excel: bool = True


def synonyms(cat: str) -> List[str]:
    c = cat.strip().lower()
    if c in ["shk","sanitär","sanitaer","heizung","klima","hlk","hkls"]:
        return ["SHK", "Sanitär", "Heizung", "Klima", "Haustechnik", "Installateur", "Heizungsbauer"]
    if c in ["elektro","elektriker","e-handwerk","elektroinstallateur"]:
        return ["Elektro", "Elektriker", "Elektroinstallateur", "E-Check", "Elektrotechnik"]
    if c in ["makler","immobilien","immobilienmakler"]:
        return ["Immobilienmakler", "Makler", "Immobilienbüro", "Immobilienservice"]
    if c in ["ga-la","galabau","garten","landschaftsbau"]:
        return ["Garten- und Landschaftsbau", "Galabau", "Gartenbau", "Landschaftsbau"]
    # Default: nutze original + allgemeine Begriffe
    return [cat]


class OutreachIn(BaseModel):
    leads: list[dict] = Field(default=[])
    template: str | None = None
    attach_flyer: bool = True


def _post(path: str, body: dict):
    r = requests.post(f"{BASE}{path}", json=body, timeout=30)
    r.raise_for_status()
    return r.json()


@router.post("/hunt")
def api_hunt(payload: HuntIn):
    from ..audit_logger import get_logger
    from fastapi import HTTPException
    log = get_logger()
    
    try:
        kws = synonyms(payload.category)
        city = payload.location.strip()
        queries = []
        for k in kws:
            queries.append(f"{k} {city} Impressum")
            queries.append(f"{k} {city} Kontakt")
            queries.append(f"{k} {city} Firma")
        # dedupe
        qset = []
        for q in queries:
            if q not in qset: qset.append(q)

        links = []
        for q in qset:
            try:
                links.extend(ddg_links(q))
            except Exception:
                pass
            if len(links) < 6:  # Fallback nur wenn mager
                try:
                    links.extend(bing_links(q))
                except Exception:
                    pass

        # Deduplizieren & beschneiden
        clean = []
        seen = set()
        for u in links:
            if any(host in u for host in ["facebook.com","instagram.com","x.com","twitter.com","youtube.com"]):
                continue
            if u in seen: continue
            seen.add(u)
            clean.append(u)
        clean = clean[: max(payload.count*5, 40)]  # genug Material

        results = []
        for u in clean:
            data = scrape_contact(u)
            if not data: continue
            entry = {
                "company": data.get("company"),
                "email": data.get("email"),
                "phone": data.get("phone"),
                "city": city,
                "url": u
            }
            # Nur speichern, wenn mindestens Email oder Telefon
            if entry["email"] or entry["phone"]:
                results.append(entry)
            if len(results) >= payload.count: break
        
        # Wenn keine Leads gefunden, hilfreiche Fehlermeldung
        if len(results) == 0:
            return {
                "ok": True,
                "requested": payload.count,
                "found": 0,
                "items": [],
                "message": f"Keine Leads gefunden für '{payload.category}' in '{payload.location}'. Versuche andere Kategorie (z.B. 'elektro', 'makler', 'sanitär') oder andere Region (z.B. 'neheim', 'meschede', 'arnsberg')."
            }
        
        saved = 0
        saved_leads = []
        
        if payload.save_to_db:
            for l in results:
                try:
                    res = _post("/leads", {
                        "company": l.get("company", ""),
                        "contact_name": "",
                        "contact_email": l.get("email", ""),
                        "status": "new",
                        "notes": f"Lead-Hunter: {payload.category} in {payload.location}"
                    })
                    l["id"] = res.get("id")
                    saved += 1
                    saved_leads.append(l)
                except Exception as e:
                    # If lead already exists or other error, still add to saved_leads without id
                    saved_leads.append(l)
        
        excel_path = None
        if payload.export_excel:
            excel_path = export_leads_xlsx(results, EXPORTS_DIR)
        
        # Audit-Logging
        log.log(action="lead.hunt", payload={"category": payload.category, "location": payload.location, "count": payload.count, "found": len(results), "saved": saved})
        
        return {"ok": True, "requested": payload.count, "found": len(results), "saved": saved, "excel_path": excel_path, "items": saved_leads, "leads": saved_leads}
    except Exception as e:
        log.log(action="lead.hunt.error", payload={"category": payload.category, "location": payload.location, "error": str(e)})
        raise HTTPException(status_code=500, detail=f"Lead-Hunt Fehler: {str(e)}. Bitte andere Parameter versuchen.")


@router.post("/export_excel")
def api_export_excel(body: dict = Body(...)):
    leads = body.get("leads") or []
    excel_path = export_leads_xlsx(leads, EXPORTS_DIR)
    return {"excel_path": excel_path}


@router.post("/outreach")
def api_outreach(payload: OutreachIn):
    # Resolve template
    tpl = payload.template
    if not tpl:
        tpl_path = os.path.join(os.getcwd(), "config", "outreach_template.txt")
        if os.path.exists(tpl_path):
            with open(tpl_path, "r", encoding="utf-8") as f:
                tpl = f.read()
        else:
            tpl = "Hallo {{company}},\n\nkurz und knapp: Wir helfen Betrieben wie Ihrem in {{city}}/{{category}}, Prozesse zu verschlanken und neue Aufträge zu gewinnen. Wenn Sie offen sind: 15 Minuten Kennenlernen? \n\nHerzliche Grüße\nFreiraum Beratung"
    
    flyer_path = os.path.join(os.getcwd(), "assets", "flyer.pdf") if payload.attach_flyer else None
    
    res = send_bulk(payload.leads, tpl, flyer_path)
    return res

