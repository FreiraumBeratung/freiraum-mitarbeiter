import asyncio
import os
import re
import time
from typing import Dict, Iterable, List, Tuple

import httpx


def domain_allowed(url: str, allowlist: List[str]) -> bool:
  u = (url or "").lower()
  for entry in allowlist:
    entry = entry.strip().lower()
    if entry and entry in u:
      return True
  return False


def extract_contacts(html: str, base: str) -> List[Dict[str, str]]:
  emails = set(re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", html or ""))
  phones = set(re.findall(r"(?:\+49|0)[0-9\/\-\s]{6,}", html or ""))
  output: List[Dict[str, str]] = []
  if emails or phones:
    output.append(
      {
        "company": "",
        "city": "",
        "category": "",
        "website": base,
        "email": ";".join(sorted(emails)),
        "phone": ";".join(sorted(phones)),
        "source": "web:" + base,
        "ts": int(time.time()),
      }
    )
  return output


async def fetch(client: httpx.AsyncClient, url: str, timeout: int = 10) -> Tuple[str, str]:
  try:
    resp = await client.get(
      url,
      timeout=timeout,
      follow_redirects=True,
      headers={"User-Agent": "Freiraum-LeadHunter/1.0"},
    )
    if resp.status_code == 200:
      return url, resp.text
    return url, ""
  except Exception:
    return url, ""


async def crawl(
  urls: Iterable[str],
  allowlist: List[str],
  rps: float,
  concurrency: int,
  retry: int,
  backoff_ms: int,
) -> List[Dict[str, str]]:
  filtered = [url for url in urls if domain_allowed(url, allowlist)]
  if not filtered:
    return []

  semaphore = asyncio.Semaphore(max(concurrency, 1))
  results: List[Dict[str, str]] = []
  delay = 1.0 / max(rps, 0.1)

  async with httpx.AsyncClient() as client:
    async def one(target: str):
      for attempt in range(retry + 1):
        async with semaphore:
          await asyncio.sleep(delay)
          _, html = await fetch(client, target)
          if html:
            results.extend(extract_contacts(html, target))
            return
        await asyncio.sleep(backoff_ms / 1000.0)

    await asyncio.gather(*[one(url) for url in filtered])
  return results




