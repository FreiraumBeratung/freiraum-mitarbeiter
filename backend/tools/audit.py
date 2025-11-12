import os, re, json, hashlib, pathlib, datetime
from typing import Dict, Any

ROOT = pathlib.Path(os.environ.get("FM_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))).resolve()
BACK = ROOT / "backend"
FRONT = ROOT / "frontend" / "fm-app"
EXPORTS = ROOT / "exports"

def sha1(path: pathlib.Path) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def read_text_safe(p: pathlib.Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""

def exists(*parts) -> bool:
    return (ROOT.joinpath(*parts)).exists()

def list_tree(base: pathlib.Path, max_depth=4) -> Dict[str, Any]:
    out = []
    base = base.resolve()
    for root, dirs, files in os.walk(base):
        rel = pathlib.Path(root).relative_to(base)
        depth = len(rel.parts)
        if depth > max_depth:
            continue
        files = sorted(files)
        dirs[:] = sorted(d for d in dirs if not d.startswith(".venv"))  # .venv ausblenden
        out.append({"dir": str(rel) if str(rel)!="." else ".", "files": files})
    return {"base": str(base), "items": out}

def parse_requirements(txt: str) -> Dict[str,str]:
    out={}
    for line in txt.splitlines():
        line=line.strip()
        if not line or line.startswith("#"): continue
        if "==" in line:
            k,v=line.split("==",1); out[k.strip()]=v.strip()
        else:
            out[line]=None
    return out

def mask_env_values(s: str) -> str:
    # Werte hinter = maskieren, aber Keys sichtbar lassen
    masked=[]
    for line in s.splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k,v = line.split("=",1)
            mv = ("*"*8) if v.strip() else ""
            masked.append(f"{k}={mv}")
        else:
            masked.append(line)
    return "\n".join(masked)

def find_router_prefixes(py: str) -> list[str]:
    # sucht APIRouter(prefix="...") oder APIRouter(prefix='...')
    matches = re.findall(r'APIRouter\s*\(\s*prefix\s*=\s*[\'"]([^\'"]+)[\'"]', py)
    return matches

def find_include_router(py: str) -> list[str]:
    matches = re.findall(r'include_router\(([^)]+)\)', py)
    return matches

def extract_status_fields(py: str) -> list[str]:
    # grob die Felder aus StatusOut herausholen
    m = re.search(r'class\s+StatusOut\s*\([^)]*\):\s*([^\n]+)', py)
    return []

def detect_cors(py: str) -> Dict[str,Any]:
    origins = re.findall(r'allow_origins\s*=\s*\[([^\]]+)\]', py)
    if not origins:
        return {"configured": False}
    raw = origins[0]
    vals = [x.strip().strip("'\"") for x in raw.split(",")]
    return {"configured": True, "allow_origins": vals}

def grep_endpoints(py: str) -> list[Dict[str,str]]:
    out=[]
    for meth in ["get","post","put","patch","delete"]:
        for m in re.finditer(rf'@router\.{meth}\s*\(\s*[\'"]([^\'"]+)[\'"]', py):
            out.append({"method": meth.upper(), "path": m.group(1)})
    return out

def read_json(path: pathlib.Path) -> Dict[str,Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

def audit() -> Dict[str,Any]:
    now = datetime.datetime.utcnow().isoformat()+"Z"
    report: Dict[str,Any] = {"meta":{"when": now, "root": str(ROOT)}}

    # --- Struktur / Tree
    report["tree_backend"] = list_tree(BACK, max_depth=3)
    report["tree_frontend"] = list_tree(FRONT, max_depth=3)

    # --- Backend Kern-Dateien
    files_backend = ["app.py","db.py","models.py","mail.py","offers.py","leads.py","followups.py","reports.py","kb.py","license.py","sequences.py","scheduler.py","logging_conf.py","run.py","__init__.py"]
    present = {fn: (BACK/fn).exists() for fn in files_backend}
    report["backend_files_present"] = present

    # --- Requirements
    req_txt = read_text_safe(BACK/"requirements.txt")
    report["requirements"] = parse_requirements(req_txt)

    # --- App.py Analyse
    app_py = read_text_safe(BACK/"app.py")
    report["cors"] = detect_cors(app_py)
    report["routers_included"] = find_include_router(app_py)

    # --- Router-Endpoints
    endpoints={}
    for fn in files_backend:
        p = BACK/fn
        if p.exists() and p.suffix==".py":
            endpoints[fn] = {
                "prefixes": find_router_prefixes(read_text_safe(p)),
                "endpoints": grep_endpoints(read_text_safe(p))
            }
    report["endpoints"] = endpoints

    # --- Pfade / Verzeichnisse
    for rel in ["data","exports","logs","assets","docs","installers","config"]:
        p = ROOT/rel
        report[f"path_{rel}"] = {"exists": p.exists(), "path": str(p.resolve())}

    # --- SQLite DB
    db_path = ROOT/"data"/"freiraum.db"
    report["sqlite"] = {"exists": db_path.exists(), "size": db_path.stat().st_size if db_path.exists() else 0}

    # --- Lizenzdatei
    lic_path = ROOT/"config"/"license.json"
    lic = read_json(lic_path) if lic_path.exists() else {}
    report["license"] = {"file_exists": lic_path.exists(), "tier": lic.get("tier","BASIS"), "valid": lic.get("valid", True)}

    # --- ENV (maskiert)
    env_path = ROOT/"config"/".env"
    env_masked = mask_env_values(read_text_safe(env_path)) if env_path.exists() else ""
    report["env_masked"] = env_masked
    report["env_exists"] = env_path.exists()

    # --- Frontend package.json / Tailwind / PostCSS
    pkg = read_json(FRONT/"package.json")
    postcss_cjs = (FRONT/"postcss.config.cjs").exists()
    tailwind_js = (FRONT/"tailwind.config.js").exists()
    report["frontend"] = {
        "package_json_present": (FRONT/"package.json").exists(),
        "name": pkg.get("name"),
        "deps": pkg.get("dependencies",{}),
        "devDeps": pkg.get("devDependencies",{}),
        "postcss_config_cjs": postcss_cjs,
        "tailwind_config_js": tailwind_js,
        "index_css_has_tailwind_directives": all(x in read_text_safe(FRONT/"src"/"index.css") for x in ["@tailwind base","@tailwind components","@tailwind utilities"])
    }

    # --- Assets / Logo
    logo_path = ROOT/"assets"/"logo.png"
    report["logo"] = {"exists": logo_path.exists(), "sha1": sha1(logo_path) if logo_path.exists() else None}

    # --- Qualitäts-Checks (Score grob)
    score = 0; notes=[]
    # CORS vorhanden
    if report["cors"].get("configured"): score += 5
    else: notes.append("CORS fehlt/unklar")
    # Pflicht-Dateien Backend
    missing = [k for k,v in present.items() if not v and k not in ("scheduler.py")]  # scheduler optional
    if not missing: score += 10
    else: notes.append(f"Missing backend files: {', '.join(missing)}")
    # DB vorhanden
    if report["sqlite"]["exists"]: score += 5
    else: notes.append("SQLite DB fehlt (wird bei Start erzeugt)")
    # Tailwind/PostCSS
    if postcss_cjs and tailwind_js and report["frontend"]["index_css_has_tailwind_directives"]: score += 10
    else: notes.append("Tailwind/PostCSS-Konfiguration prüfen")
    # Lizenz
    if report["license"]["file_exists"]: score += 3
    # ENV
    if report["env_exists"]: score += 5
    else: notes.append(".env fehlt")

    report["score"] = min(score, 33)
    report["notes"] = notes

    return report

def write_reports(data: Dict[str,Any]):
    EXPORTS.mkdir(parents=True, exist_ok=True)
    # JSON
    (EXPORTS/"AUDIT_REPORT.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    # Markdown
    md = []
    md.append(f"# Freiraum Mitarbeiter – Audit Report")
    md.append(f"_Erstellt: {datetime.datetime.utcnow().isoformat()}Z_")
    md.append("")
    md.append(f"**Root:** `{data['meta']['root']}`")
    md.append(f"**Score:** `{data['score']}` / 33")
    if data.get("notes"):
        md.append("**Hinweise:**")
        for n in data["notes"]:
            md.append(f"- {n}")
    md.append("\n## Struktur – Backend (Top-Ebenen)")
    for item in data["tree_backend"]["items"]:
        md.append(f"- `{item['dir']}` → {len(item['files'])} Dateien")
    md.append("\n## Struktur – Frontend (Top-Ebenen)")
    for item in data["tree_frontend"]["items"]:
        md.append(f"- `{item['dir']}` → {len(item['files'])} Dateien")

    md.append("\n## Backend Dateien – Anwesenheit")
    for k,v in data["backend_files_present"].items():
        md.append(f"- {k}: {'✅' if v else '❌'}")

    md.append("\n## Dependencies – Python (requirements.txt)")
    for k,v in data["requirements"].items():
        md.append(f"- {k} {('=='+v) if v else ''}")

    md.append("\n## Frontend – package.json")
    md.append(f"- Name: `{data['frontend'].get('name')}`")
    md.append(f"- postcss.config.cjs: {'✅' if data['frontend']['postcss_config_cjs'] else '❌'}")
    md.append(f"- tailwind.config.js: {'✅' if data['frontend']['tailwind_config_js'] else '❌'}")
    md.append(f"- Tailwind Direktiven in index.css: {'✅' if data['frontend']['index_css_has_tailwind_directives'] else '❌'}")

    md.append("\n## CORS")
    cors = data["cors"]
    md.append(f"- konfiguriert: {'✅' if cors.get('configured') else '❌'}")
    if cors.get("configured"):
        md.append(f"- allow_origins: {', '.join(cors.get('allow_origins', []))}")

    md.append("\n## API – Router & Endpoints (aus Quelltext)")
    for fn, info in data["endpoints"].items():
        if not info["prefixes"] and not info["endpoints"]:
            continue
        md.append(f"\n### {fn}")
        if info["prefixes"]:
            md.append(f"- Prefixe: {', '.join(info['prefixes'])}")
        if info["endpoints"]:
            for ep in info["endpoints"]:
                md.append(f"  - {ep['method']} {ep['path']}")

    md.append("\n## Pfade & Artefakte")
    for rel in ["data","exports","logs","assets","docs","installers","config"]:
        p = data[f"path_{rel}"]
        md.append(f"- {rel}: {'✅' if p['exists'] else '❌'} → `{p['path']}`")
    md.append(f"- SQLite DB: {'✅' if data['sqlite']['exists'] else '❌'} (Size: {data['sqlite']['size']} Bytes)")
    md.append(f"- Lizenz: Tier `{data['license'].get('tier')}` / Valid `{data['license'].get('valid')}` / File: {'✅' if data['license']['file_exists'] else '❌'}")
    md.append(f"- Logo.png: {'✅' if data['logo']['exists'] else '❌'}{(' • sha1='+data['logo']['sha1']) if data['logo']['exists'] else ''}")

    md.append("\n## .env (maskiert)")
    if data["env_exists"]:
        md.append("```dotenv")
        md.append(data["env_masked"])
        md.append("```")
    else:
        md.append("- .env nicht gefunden")

    (EXPORTS/"AUDIT_REPORT.md").write_text("\n".join(md), encoding="utf-8")

if __name__ == "__main__":
    data = audit()
    write_reports(data)
    print(json.dumps({"ok": True, "out_md": str(EXPORTS/'AUDIT_REPORT.md'), "out_json": str(EXPORTS/'AUDIT_REPORT.json')}, ensure_ascii=False))

