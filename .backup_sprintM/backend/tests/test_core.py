import os, sys, pathlib
# Projekt-Root auf sys.path, damit "backend" als Paket importierbar ist
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi.testclient import TestClient
from backend.app import app  # <- jetzt als Paket importieren

client = TestClient(app)

def test_status():
    r = client.get("/api/system/status")
    assert r.status_code == 200
    j = r.json()
    assert j["ok"] is True

def test_offers_pdf_flow():
    r = client.post("/api/offers/draft", json={"customer":"Test GmbH","items":[{"name":"X","qty":1,"unit_price":10}]})
    assert r.status_code == 200
    oid = r.json()["id"]
    r2 = client.get(f"/api/offers/{oid}/pdf")
    assert r2.status_code == 200
    assert r2.json()["ok"] is True
