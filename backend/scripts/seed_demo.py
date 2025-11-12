import json
from datetime import datetime, timedelta
from pathlib import Path

import httpx


BACKEND = "http://127.0.0.1:30521"
OUTDIR = (Path(__file__).resolve().parents[1] / "exports")
OUTDIR.mkdir(parents=True, exist_ok=True)


def main():
    res = {"steps": []}
    with httpx.Client(timeout=10) as client:
        r = client.get(f"{BACKEND}/api/system/status")
        res["steps"].append({"system.status": r.status_code})

        try:
            r_open = client.get(f"{BACKEND}/openapi.json")
            paths = r_open.json().get("paths", {})
            if "/api/proactive/remember" in paths:
                payload = {
                    "title": "Nachfassung Demo",
                    "when": (datetime.utcnow() + timedelta(minutes=2)).isoformat() + "Z",
                }
                resp = client.post(f"{BACKEND}/api/proactive/remember", json=payload)
                body = (
                    resp.json()
                    if resp.headers.get("content-type", "").startswith("application/json")
                    else None
                )
                res["steps"].append(
                    {
                        "proactive.remember": resp.status_code,
                        "payload": payload,
                        "body": body,
                    }
                )
                if "/api/proactive/trigger" in paths:
                    trig = client.post(f"{BACKEND}/api/proactive/trigger", json={})
                    res["steps"].append({"proactive.trigger": trig.status_code})
        except Exception as exc:
            res["steps"].append({"proactive.error": str(exc)})

        try:
            payload = {"category": "demo", "location": "demo"}
            resp = client.post(f"{BACKEND}/lead_hunter/hunt_async", json=payload)
            body = resp.json() if resp.status_code == 200 else None
            res["steps"].append(
                {"lead_hunter.start": resp.status_code, "payload": payload, "body": body}
            )
        except Exception as exc:
            res["steps"].append({"lead_hunter.error": str(exc)})

    path = OUTDIR / "seed_demo_result.json"
    path.write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
    print(str(path))


if __name__ == "__main__":
    main()








