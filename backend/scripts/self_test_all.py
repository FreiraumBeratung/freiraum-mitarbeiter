import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "exports"
EXPORTS.mkdir(parents=True, exist_ok=True)


def run_py(relpath: str):
    cmd = [str(ROOT / ".venv" / "Scripts" / "python.exe"), str(ROOT / "scripts" / relpath)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def read_json(name: str):
    path = EXPORTS / name
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def main():
    summary = {"steps": [], "reports": [], "ok": False}

    rc_v2, out_v2, err_v2 = run_py("deep_audit_v2.py")
    summary["steps"].append({"deep_audit_v2.py": rc_v2, "stderr": err_v2[:500]})

    rc_r2, out_r2, err_r2 = run_py("round2_audit.py")
    summary["steps"].append({"round2_audit.py": rc_r2, "stderr": err_r2[:500]})

    v2 = read_json("deep_audit_v2_report.json")
    r2 = read_json("round2_audit_report.json")

    summary["reports"].append({"deep_v2": bool(v2)})
    summary["reports"].append({"round2": bool(r2)})

    ok_total = 0
    total_total = 0
    if v2 and v2.get("scores", {}).get("summary"):
        ok_total += v2["scores"]["summary"]["ok"]
        total_total += v2["scores"]["summary"]["total"]
    if r2 and r2.get("score"):
        ok_total += r2["score"]["ok"]
        total_total += r2["score"]["total"]

    summary["ok"] = total_total > 0 and ok_total == total_total
    summary["score"] = {"ok": ok_total, "total": total_total}

    path = EXPORTS / "self_test_summary.json"
    path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()








