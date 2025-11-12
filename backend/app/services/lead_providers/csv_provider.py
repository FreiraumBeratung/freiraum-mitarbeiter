import csv
import os
import time
from typing import Dict, Iterable, List


def load_csv(path: str) -> Iterable[Dict[str, str]]:
  if not os.path.exists(path):
    return []
  with open(path, newline="", encoding="utf-8") as handle:
    reader = csv.DictReader(handle)
    for row in reader:
      yield {
        "company": row.get("company", "").strip(),
        "city": row.get("city", "").strip(),
        "category": row.get("category", "").strip(),
        "website": row.get("website", "").strip(),
        "email": row.get("email", "").strip(),
        "phone": row.get("phone", "").strip(),
        "source": "csv:" + os.path.basename(path),
        "ts": int(time.time()),
      }


def load_csv_list(path: str) -> List[Dict[str, str]]:
  """Helper that materializes the generator."""
  return list(load_csv(path))




