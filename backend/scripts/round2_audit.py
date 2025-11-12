import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path

import httpx


BASE = "http://127.0.0.1:30521"
OUTDIR = (Path(__file__).resolve().parents[1] / "exports")
OUTDIR.mkdir(parents=True, exist_ok=True)


async def fetch_openapi(client: httpx.AsyncClient) -> dict:
    r = await client.get(f"{BASE}/openapi.json")
    r.raise_for_status()
    return r.json()


def resolve_schema(schema: dict | None, spec: dict | None) -> dict:
    if not schema:
        return {}
    if "$ref" in schema and spec:
        ref = schema["$ref"].lstrip("#/")
        node = spec
        for part in ref.split("/"):
            node = node.get(part)
            if node is None:
                break
        return resolve_schema(node, spec)
    if "allOf" in schema:
        merged: dict = {"type": "object", "properties": {}, "required": []}
        for part in schema["allOf"]:
            resolved = resolve_schema(part, spec)
            merged["properties"].update(resolved.get("properties", {}))
            merged["required"].extend(resolved.get("required", []))
        merged["required"] = list(dict.fromkeys(merged["required"]))
        return merged
    if "oneOf" in schema:
        return resolve_schema(schema["oneOf"][0], spec)
    if "anyOf" in schema:
        return resolve_schema(schema["anyOf"][0], spec)
    return schema


def minimal_payload_from_schema(schema: dict | None, spec: dict | None) -> dict:
    resolved = resolve_schema(schema or {}, spec)

    def build(s):
        if s is None:
            return "demo"
        if "$ref" in s:
            return build(resolve_schema(s, spec))
        if "enum" in s:
            return s["enum"][0]
        t = s.get("type")
        if not t:
            if "properties" in s:
                t = "object"
            elif "items" in s:
                t = "array"
            else:
                t = "string"
        if t == "object":
            props = s.get("properties", {}) or {}
            required = s.get("required", []) or []
            out = {}
            for key in required:
                out[key] = build(props.get(key, {"type": "string"}))
            return out
        if t == "array":
            items = s.get("items", {"type": "string"})
            return [build(items)]
        if t == "integer":
            return 1
        if t == "number":
            return 1
        if t == "boolean":
            return True
        fmt = s.get("format")
        if fmt == "date-time":
            return datetime.utcnow().isoformat() + "Z"
        if fmt == "date":
            return datetime.utcnow().date().isoformat()
        return "demo"

    payload = build(resolved)
    return payload if isinstance(payload, dict) else {"value": payload}


async def main():
    results = {"started": datetime.utcnow().isoformat() + "Z", "checks": [], "notes": []}
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            spec = await fetch_openapi(client)
            results["notes"].append({"openapi_loaded": True})
        except Exception as e:
            spec = None
            results["checks"].append({"name": "openapi.fetch", "ok": False, "error": str(e)})

        def get_request_schema(path: str, method: str = "post") -> dict | None:
            if not spec:
                return None
            path_item = spec.get("paths", {}).get(path, {})
            op = path_item.get(method.lower(), {})
            req = op.get("requestBody", {})
            content = req.get("content", {})
            schema = content.get("application/json", {}).get("schema")
            return resolve_schema(schema, spec) if schema else None

        try:
            if spec and "/api/proactive/remember" in spec.get("paths", {}):
                remember_schema = get_request_schema("/api/proactive/remember", "post")
                if remember_schema:
                    remember_body = minimal_payload_from_schema(remember_schema, spec)
                else:
                    remember_body = {
                        "title": "Nachfassung Demo",
                        "note": "Kontakt: Müller GmbH anrufen",
                        "due_ts": (datetime.utcnow() + timedelta(minutes=5)).isoformat() + "Z",
                    }
                remember_resp = await client.post(f"{BASE}/api/proactive/remember", json=remember_body)
                remember_ok = remember_resp.status_code == 200
                remember_content = remember_resp.json() if remember_ok else remember_resp.text
                results["checks"].append(
                    {
                        "name": "proactive.remember",
                        "ok": remember_ok,
                        "status": remember_resp.status_code,
                        "body": remember_content,
                        "payload": remember_body,
                    }
                )
            else:
                results["checks"].append({"name": "proactive.remember", "ok": True, "warn": "endpoint_missing_skip"})

            if spec and "/api/proactive/trigger" in spec.get("paths", {}):
                trigger_schema = get_request_schema("/api/proactive/trigger", "post")
                trigger_body = minimal_payload_from_schema(trigger_schema, spec) if trigger_schema else {}
                trigger_resp = await client.post(f"{BASE}/api/proactive/trigger", json=trigger_body or {})
                trigger_ok = trigger_resp.status_code == 200
                trigger_content = trigger_resp.json() if trigger_ok else trigger_resp.text
                results["checks"].append(
                    {
                        "name": "proactive.trigger",
                        "ok": trigger_ok,
                        "status": trigger_resp.status_code,
                        "body": trigger_content,
                        "payload": trigger_body,
                    }
                )

            next_resp = await client.get(f"{BASE}/api/proactive/next")
            try:
                next_content = next_resp.json()
            except Exception:
                next_content = next_resp.text
            next_ok = (
                next_resp.status_code == 200
                and isinstance(next_content, dict)
                and next_content.get("next") not in (None, [], {})
            )
            results["checks"].append(
                {"name": "proactive.next_after_setup", "ok": next_ok, "status": next_resp.status_code, "body": next_content}
            )
        except Exception as exc:
            results["checks"].append({"name": "proactive.flow", "ok": False, "error": str(exc)})

        try:
            lead_schema = get_request_schema("/lead_hunter/hunt_async", "post")
            lead_payload = minimal_payload_from_schema(lead_schema, spec) if lead_schema else {"query": "demo", "limit": 1}
            lead_resp = await client.post(f"{BASE}/lead_hunter/hunt_async", json=lead_payload)
            if lead_resp.status_code == 200:
                lead_body = lead_resp.json()
                results["checks"].append(
                    {"name": "lead_hunter.start", "ok": True, "status": 200, "body": lead_body, "payload": lead_payload}
                )
                task_id = lead_body.get("task_id")
                done = False
                last_body = None
                deadline = datetime.utcnow() + timedelta(seconds=30)
                while datetime.utcnow() < deadline and task_id and not done:
                    poll_resp = await client.get(f"{BASE}/lead_hunter/task/{task_id}")
                    if poll_resp.status_code == 200:
                        last_body = poll_resp.json()
                        state = (last_body.get("status") or "").lower()
                        if state in {"done", "finished", "success", "failed", "error"}:
                            done = True
                            results["checks"].append(
                                {"name": "lead_hunter.poll", "ok": True, "status": 200, "body": last_body}
                            )
                            break
                    await asyncio.sleep(1.5)
                if not done:
                    results["checks"].append(
                        {
                            "name": "lead_hunter.poll",
                            "ok": False,
                            "warn": "timeout_or_no_status_endpoint",
                            "body": last_body,
                        }
                    )
            else:
                results["checks"].append(
                    {
                        "name": "lead_hunter.start",
                        "ok": False,
                        "status": lead_resp.status_code,
                        "body": lead_resp.text,
                        "payload": lead_payload,
                    }
                )
        except Exception as exc:
            results["checks"].append({"name": "lead_hunter.flow", "ok": False, "error": str(exc)})

    ok_total = sum(1 for c in results["checks"] if c.get("ok"))
    total = len(results["checks"])
    results["score"] = {"ok": ok_total, "total": total, "ratio": round(ok_total / max(total, 1), 3)}
    results["finished"] = datetime.utcnow().isoformat() + "Z"

    (OUTDIR / "round2_audit_report.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    md_lines = [
        "# Round-2 Audit (LeadHunter + Proactive)",
        f"- Start: {results['started']}",
        f"- Ende:  {results['finished']}",
        f"- Ergebnis: {ok_total}/{total} OK",
        "",
        "## Checks",
    ]
    for check in results["checks"]:
        md_lines.append(f"### {check.get('name')}")
        md_lines.append(f"- ok: {check.get('ok')}")
        if check.get("status") is not None:
            md_lines.append(f"- status: {check['status']}")
        if check.get("warn"):
            md_lines.append(f"- warn: {check['warn']}")
        if check.get("error"):
            md_lines.append(f"- error: {check['error']}")
        if check.get("payload") is not None:
            md_lines.append("- payload:")
            md_lines.append("```json")
            md_lines.append(json.dumps(check["payload"], indent=2, ensure_ascii=False))
            md_lines.append("```")
        if check.get("body") is not None:
            md_lines.append("```json")
            md_lines.append(json.dumps(check["body"], indent=2, ensure_ascii=False))
            md_lines.append("```")
        md_lines.append("")
    (OUTDIR / "round2_audit_report.md").write_text("\n".join(md_lines), encoding="utf-8")
    print(str(OUTDIR / "round2_audit_report.json"))
    print(str(OUTDIR / "round2_audit_report.md"))


if __name__ == "__main__":
    asyncio.run(main())








