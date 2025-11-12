import asyncio
import json
import platform
from datetime import datetime
from pathlib import Path

import httpx

BACKEND = "http://localhost:30521"
OUTDIR = (Path(__file__).resolve().parents[1] / "exports")
OUTDIR.mkdir(parents=True, exist_ok=True)


async def check(client: httpx.AsyncClient, method: str, path: str, **kwargs):
    url = f"{BACKEND}{path}"
    try:
        response = await client.request(method, url, **kwargs)
        body = None
        try:
            body = response.json()
        except Exception:
            body = response.text
        return {
            "endpoint": f"{method} {path}",
            "ok": response.status_code == 200,
            "status": response.status_code,
            "body": body,
        }
    except Exception as exc:  # pragma: no cover
        return {"endpoint": f"{method} {path}", "ok": False, "error": str(exc)}


async def main():
    results = {
        "started": datetime.now().isoformat(),
        "host": platform.node(),
        "checks": [],
    }
    async with httpx.AsyncClient(timeout=10) as client:
        results["checks"].append(await check(client, "GET", "/api/system/status"))
        results["checks"].append(await check(client, "GET", "/api/proactive/ping"))
        results["checks"].append(await check(client, "GET", "/api/proactive/next"))
        results["checks"].append(await check(client, "GET", "/ui/smoke"))
        results["checks"].append(await check(client, "GET", "/api/health"))
        results["checks"].append(await check(client, "GET", "/api/proactive/reminders"))
        results["checks"].append(await check(client, "GET", "/lead_hunter/task/healthcheck"))
        results["checks"].append(
            await check(
                client,
                "POST",
                "/lead_hunter/hunt_async",
                json={
                    "category": "healthcheck",
                    "location": "sauerland",
                    "count": 1,
                    "save_to_db": False,
                    "export_excel": False,
                    "outreach": False,
                },
            )
        )
    results["finished"] = datetime.now().isoformat()

    ok_count = sum(1 for c in results["checks"] if c.get("ok"))
    total = len(results["checks"])

    json_path = OUTDIR / "hyper_audit_report.json"
    json_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    md_lines = [
        "# Hyper-Audit Report",
        f"- Start: {results['started']}",
        f"- Ende:  {results['finished']}",
        f"- Ergebnis: {ok_count}/{total} OK",
        "",
        "## Checks",
    ]
    for check_result in results["checks"]:
        md_lines.append(f"### {check_result['endpoint']}")
        md_lines.append(f"- ok: {check_result.get('ok')}")
        if "status" in check_result:
            md_lines.append(f"- status: {check_result['status']}")
        if "error" in check_result:
            md_lines.append(f"- error: {check_result['error']}")
        if "body" in check_result:
            md_lines.append("```json")
            md_lines.append(json.dumps(check_result["body"], indent=2, ensure_ascii=False))
            md_lines.append("```")
        md_lines.append("")

    md_path = OUTDIR / "hyper_audit_report.md"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")

    print(str(json_path))
    print(str(md_path))


if __name__ == "__main__":
    asyncio.run(main())


