import json, os
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/license", tags=["license"])
LIC_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "config", "license.json"))

def _read():
    if os.path.exists(LIC_PATH):
        with open(LIC_PATH, "r", encoding="utf-8") as f: 
            return json.load(f)
    return {"tier":"BASIS","valid":True}

def _write(data: dict):
    os.makedirs(os.path.dirname(LIC_PATH), exist_ok=True)
    with open(LIC_PATH, "w", encoding="utf-8") as f: json.dump(data, f, ensure_ascii=False, indent=2)

@router.get("/")
def get_license():
    return {"ok": True, "license": _read()}

@router.post("/set")
def set_license(tier: str):
    tier = tier.upper().strip()
    if tier not in ("BASIS","PRO","ELITE"):
        raise HTTPException(400, "tier must be BASIS|PRO|ELITE")
    data = _read(); data["tier"]=tier; data["valid"]=True
    _write(data)
    return {"ok": True, "license": data}

# Feature-Gate Helper
def has_feature(name: str) -> bool:
    tier = _read().get("tier","BASIS").upper()
    matrix = {
        "csv_import": "BASIS",
        "xlsx_import": "PRO",
        "sequences": "PRO",
        "rpa": "ELITE",
    }
    need = matrix.get(name, "BASIS")
    order = {"BASIS":1,"PRO":2,"ELITE":3}
    return order.get(tier,1) >= order.get(need,1)

def ensure_default_license():
    """Erzeugt eine Basis-Lizenz, falls keine vorhanden ist."""
    data = _read()
    if not os.path.exists(LIC_PATH) or not data:
        _write({"tier":"BASIS","valid":True})

