import asyncio
import json
import platform
import time
from datetime import datetime, timedelta, UTC
from pathlib import Path

import httpx


BASE = "http://127.0.0.1:30521"
OUTDIR = (Path(__file__).resolve().parents[1] / "exports")
OUTDIR.mkdir(parents=True, exist_ok=True)


def add(res, *, name, ok, status=None, body=None, warn=None, error=None, ms=None, payload=None):
    res.setdefault("checks", []).append(
        {
            "name": name,
            "ok": ok,
            "status": status,
            "body": body,
            "warn": warn,
            "error": error,
            "ms": ms,
            "payload": payload,
        }
    )


def resolve_schema(schema: dict | None, spec: dict | None) -> dict:
    if not schema:
        return {}
    if "$ref" in schema and spec:
        ref = schema["$ref"].lstrip("#/")
        node = spec
        for part in ref.split("/"):
            node = node.get(part)
            if node is None:
                return {}
        return resolve_schema(node, spec)
    if "allOf" in schema:
        merged: dict = {"type": "object", "properties": {}, "required": []}
        for part in schema["allOf"]:
            resolved = resolve_schema(part, spec)
            if resolved.get("type") == "object":
                merged["properties"].update(resolved.get("properties", {}))
                merged["required"].extend(resolved.get("required", []))
            else:
                merged = resolved
        if isinstance(merged.get("required"), list):
            merged["required"] = list(dict.fromkeys(merged["required"]))
        return merged
    if "oneOf" in schema:
        return resolve_schema(schema["oneOf"][0], spec)
    if "anyOf" in schema:
        return resolve_schema(schema["anyOf"][0], spec)
    return schema


def minimal_payload_from_schema(schema: dict | None, spec: dict | None) -> dict:
    resolved = resolve_schema(schema, spec)

    def build(s):
        if not isinstance(s, dict):
            return "demo"
        if "$ref" in s:
            return build(resolve_schema(s, spec))
        type_name = s.get("type" or "object")
        if not type_name:
            type_name = "object"
        if type_name == "object":
            props = s.get("properties", {}) or {}
            required = s.get("required", []) or []
            out: dict = {}
            for key in required:
                out[key] = build(props.get(key, {"type": "string"}))
            return out
        if type_name == "array":
            items = s.get("items", {"type": "string"})
            return [build(items)]
        if type_name == "integer":
            return 1
        if type_name == "number":
            return 1
        if type_name == "boolean":
            return True
        if type_name == "string":
            fmt = s.get("format")
            if fmt == "date-time":
                return datetime.now(UTC).isoformat()
            return "demo"
        return "demo"

    payload = build(resolved or {})
    if isinstance(payload, dict):
        return payload
    return {"value": payload}


async def get_json(client: httpx.AsyncClient, path: str, method: str = "GET", data: dict | None = None):
    url = f"{BASE}{path}"
    if method == "GET":
        return await client.get(url)
    if method == "POST":
        return await client.post(url, json=data or {})
    return await client.request(method, url, json=data or {})


async def main():
    results: dict = {
        "started": datetime.now(UTC).isoformat(),
        "host": platform.node(),
        "checks": [],
        "notes": [],
    }
    start_ts = time.perf_counter()
    async with httpx.AsyncClient(timeout=12) as client:
        spec: dict | None = None
        try:
            resp_openapi = await client.get(f"{BASE}/openapi.json")
            if resp_openapi.status_code == 200:
                spec = resp_openapi.json()
                results["notes"].append({"openapi_loaded": True})
            else:
                add(results, name="openapi.fetch", ok=False, status=resp_openapi.status_code)
        except Exception as exc:
            add(results, name="openapi.fetch", ok=False, error=str(exc))

        def get_request_schema(path: str, method: str = "post") -> dict | None:
            if not spec:
                return None
            path_item = spec.get("paths", {}).get(path, {})
            operation = path_item.get(method.lower(), {})
            content = operation.get("requestBody", {}).get("content", {})
            schema = content.get("application/json", {}).get("schema")
            return resolve_schema(schema, spec) if schema else None

        try:
            resp_status = await get_json(client, "/api/system/status")
            add(
                results,
                name="system.status",
                ok=resp_status.status_code == 200,
                status=resp_status.status_code,
                body=(resp_status.json() if resp_status.status_code == 200 else None),
            )
        except Exception as exc:
            add(results, name="system.status", ok=False, error=str(exc))

        try:
            resp_health = await get_json(client, "/api/health")
            add(
                results,
                name="system.health",
                ok=resp_health.status_code == 200,
                status=resp_health.status_code,
                body=(resp_health.json() if resp_health.status_code == 200 else None),
            )
        except Exception as exc:
            add(results, name="system.health", ok=False, error=str(exc))

        try:
            if spec and "/api/proactive/remember" in spec.get("paths", {}):
                remember_schema = get_request_schema("/api/proactive/remember", "post")
                remember_payload = (
                    minimal_payload_from_schema(remember_schema, spec)
                    if remember_schema
                    else {
                        "title": "Nachfassung Demo",
                        "when": datetime.now(UTC).isoformat(),
                    }
                )
                remember_resp = await get_json(client, "/api/proactive/remember", "POST", remember_payload)
                add(
                    results,
                    name="proactive.remember",
                    ok=remember_resp.status_code == 200,
                    status=remember_resp.status_code,
                    body=(remember_resp.json() if remember_resp.status_code == 200 else None),
                    payload=remember_payload,
                )
            if spec and "/api/proactive/trigger" in spec.get("paths", {}):
                trigger_resp = await get_json(client, "/api/proactive/trigger", "POST", {})
                add(
                    results,
                    name="proactive.trigger",
                    ok=trigger_resp.status_code == 200,
                    status=trigger_resp.status_code,
                    body=(trigger_resp.json() if trigger_resp.status_code == 200 else None),
                )
            next_resp = await get_json(client, "/api/proactive/next")
            next_body = next_resp.json() if next_resp.status_code == 200 else None
            next_ok = next_resp.status_code == 200 and isinstance(next_body, dict) and next_body.get("next") is not None
            add(
                results,
                name="proactive.next",
                ok=next_ok,
                status=next_resp.status_code,
                body=next_body,
                warn=(None if next_ok else "no_next_suggestion"),
            )
        except Exception as exc:
            add(results, name="proactive.flow", ok=False, error=str(exc))

        try:
            lead_schema = get_request_schema("/lead_hunter/hunt_async", "post")
            lead_payload = (
                minimal_payload_from_schema(lead_schema, spec)
                if lead_schema
                else {
                    "category": "demo",
                    "location": "demo",
                }
            )
            lead_resp = await get_json(client, "/lead_hunter/hunt_async", "POST", lead_payload)
            if lead_resp.status_code == 200:
                lead_body = lead_resp.json()
                add(
                    results,
                    name="lead_hunter.start",
                    ok=True,
                    status=200,
                    body=lead_body,
                    payload=lead_payload,
                )
                task_id = (lead_body or {}).get("task_id")
                done = False
                last_body: dict | None = None
                deadline = datetime.now(UTC) + timedelta(seconds=30)
                while datetime.now(UTC) < deadline and task_id and not done:
                    poll_resp = await get_json(client, f"/lead_hunter/task/{task_id}")
                    if poll_resp.status_code == 200:
                        last_body = poll_resp.json()
                        state = ((last_body or {}).get("status") or "").lower()
                        if state in {"done", "finished", "success", "failed", "error"}:
                            done = True
                            add(results, name="lead_hunter.poll", ok=True, status=200, body=last_body)
                            break
                    await asyncio.sleep(1.5)
                if not done:
                    add(
                        results,
                        name="lead_hunter.poll",
                        ok=False,
                        warn="timeout_or_no_status_endpoint",
                        body=last_body,
                    )
            else:
                add(
                    results,
                    name="lead_hunter.start",
                    ok=False,
                    status=lead_resp.status_code,
                    body=(lead_resp.text if hasattr(lead_resp, "text") else None),
                    payload=lead_payload,
                )
        except Exception as exc:
            add(results, name="lead_hunter.flow", ok=False, error=str(exc))

    ok_total = sum(1 for c in results["checks"] if c.get("ok"))
    total_checks = len(results["checks"])
    results["scores"] = {
        "summary": {
            "ok": ok_total,
            "total": total_checks,
            "ratio": round(ok_total / max(total_checks, 1), 3),
        }
    }
    results["finished"] = datetime.now(UTC).isoformat()

    json_path = OUTDIR / "deep_audit_v2_report.json"
    md_path = OUTDIR / "deep_audit_v2_report.md"
    json_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    md_lines: list[str] = [
        "# Deep Cognitive & Behavioral Audit v2.1",
        f"- Start: {results['started']}",
        f"- Ende:  {results['finished']}",
        f"- Ergebnis: {ok_total}/{total_checks} OK",
        "",
        "## Checks",
    ]
    for check in results["checks"]:
        md_lines.append(f"### {check['name']}")
        md_lines.append(f"- ok: {check['ok']}")
        if check.get("status") is not None:
            md_lines.append(f"- status: {check['status']}")
        if check.get("warn"):
            md_lines.append(f"- warn: {check['warn']}")
        if check.get("error"):
            md_lines.append(f"- error: {check['error']}")
        if check.get("payload") is not None:
            md_lines.append("**payload used:**")
            md_lines.append("```json")
            md_lines.append(json.dumps(check["payload"], indent=2, ensure_ascii=False))
            md_lines.append("```")
        if check.get("body") is not None:
            md_lines.append("```json")
            md_lines.append(json.dumps(check["body"], indent=2, ensure_ascii=False))
            md_lines.append("```")
        md_lines.append("")
    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    print(str(json_path))
    print(str(md_path))


if __name__ == "__main__":
    asyncio.run(main())

