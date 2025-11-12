import asyncio
import httpx

BASE = "http://127.0.0.1:30521"


def test_status_and_health():
    async def _run():
        async with httpx.AsyncClient(timeout=5) as client:
            r1 = await client.get(f"{BASE}/api/system/status")
            assert r1.status_code == 200
            r2 = await client.get(f"{BASE}/api/health")
            assert r2.status_code == 200

    asyncio.run(_run())


def test_metrics_ping():
    async def _run():
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{BASE}/metrics/ping")
            assert r.status_code == 200
            data = r.json()
            assert data.get("ok") is True

    asyncio.run(_run())


def test_lead_hunter_schema_start():
    async def _run():
        async with httpx.AsyncClient(timeout=8) as client:
            payload = {"category": "demo", "location": "demo"}
            r = await client.post(f"{BASE}/lead_hunter/hunt_async", json=payload)
            assert r.status_code == 200
            assert r.json().get("ok") is True

    asyncio.run(_run())





