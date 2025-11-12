import os, sys, pathlib
# Projekt-Root auf sys.path, damit "backend" als Paket importierbar ist
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi.testclient import TestClient
from backend.app.main import app  # <- import aus Haupt-App

client = TestClient(app)

def test_status():
    r = client.get("/api/system/status")
    assert r.status_code == 200
    j = r.json()
    assert j["ok"] is True

def test_metrics_ping_local():
    r = client.get("/metrics/ping")
    assert r.status_code == 200
    assert r.json().get("ok") is True
