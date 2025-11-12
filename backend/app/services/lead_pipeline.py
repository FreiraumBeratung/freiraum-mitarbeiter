import csv
import json
import os
from datetime import datetime
from typing import Dict, List

from openpyxl import Workbook

from app.services.lead_providers.csv_provider import load_csv_list
from app.services.lead_providers.web_permitted import crawl


def env(key: str, default: str = "") -> str:
  return os.getenv(key, default)


def ensure_dir(path: str) -> str:
  os.makedirs(path, exist_ok=True)
  return path


def export_rows(rows: List[Dict[str, str]], outdir: str, prefix: str) -> Dict[str, str]:
  ensure_dir(outdir)
  timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
  base = os.path.join(outdir, f"{prefix}_{timestamp}")

  fieldnames = (
    sorted({key for row in rows for key in row.keys()})
    if rows
    else ["company", "city", "category", "website", "email", "phone", "source", "ts"]
  )

  csv_path = base + ".csv"
  with open(csv_path, "w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
      writer.writerow(row)

  workbook = Workbook()
  sheet = workbook.active
  sheet.title = "leads"
  sheet.append(fieldnames)
  for row in rows:
    sheet.append([row.get(field, "") for field in fieldnames])
  xlsx_path = base + ".xlsx"
  workbook.save(xlsx_path)

  json_path = base + ".json"
  with open(json_path, "w", encoding="utf-8") as handle:
    json.dump(rows, handle, ensure_ascii=False, indent=2)

  md_path = base + ".md"
  with open(md_path, "w", encoding="utf-8") as handle:
    handle.write(
      "# LeadHunter Report\n\n"
      f"- Rows: {len(rows)}\n"
      f"- Export: {os.path.basename(csv_path)}, {os.path.basename(xlsx_path)}, {os.path.basename(json_path)}\n"
    )

  return {"csv": csv_path, "xlsx": xlsx_path, "json": json_path, "md": md_path}


async def run_real(category: str, location: str) -> Dict[str, str]:
  provider = env("LEAD_PROVIDER", "csv").lower()
  outdir = env("EXPORT_DIR", os.path.join("backend", "data", "exports"))

  if provider == "csv":
    seed = env("CSV_INPUT", os.path.join("backend", "data", "inputs", "leads_seed.csv"))
    rows = load_csv_list(seed)
    if category:
      rows = [
        row
        for row in rows
        if not row.get("category") or category.lower() in row.get("category", "").lower()
      ]
    if location:
      rows = [
        row
        for row in rows
        if not row.get("city") or location.lower() in row.get("city", "").lower()
      ]
    return export_rows(rows, outdir, "leads_real_csv")

  if provider == "web_permitted":
    allow = [item.strip() for item in env("ALLOWLIST_DOMAINS", "").split(";") if item.strip()]
    rps = float(env("RL_MAX_RPS", "0.8"))
    concurrency = int(env("RL_MAX_CONCURRENCY", "2"))
    retry = int(env("RL_RETRY_MAX", "2"))
    backoff = int(env("RL_RETRY_BACKOFF_MS", "800"))

    seeds: List[str] = []
    cat = (category or "").lower()
    loc = (location or "").lower()

    if "shk" in cat:
      seeds.append("https://example.com/allowed/shk")
    if "elektro" in cat:
      seeds.append("https://example.com/allowed/elektro")
    if loc:
      seeds.append(f"https://example.com/allowed/branchenbuch?city={loc}")

    seeds = sorted(set(seeds))
    rows = await crawl(seeds, allow, rps, concurrency, retry, backoff)
    return export_rows(rows, outdir, "leads_real_web")

  return export_rows([], outdir, "leads_real_unknown")


