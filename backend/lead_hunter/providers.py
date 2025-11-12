import re, time, random
from typing import List, Dict
import requests
from bs4 import BeautifulSoup

USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
]

def _req(url: str) -> str:
  headers = {"User-Agent": random.choice(USER_AGENTS), "Accept-Language": "de-DE,de;q=0.9"}
  r = requests.get(url, headers=headers, timeout=15)
  r.raise_for_status()
  return r.text

def ddg_links(query: str) -> List[str]:
  html = _req(f"https://duckduckgo.com/html/?q={requests.utils.quote(query)}")
  soup = BeautifulSoup(html, "lxml")
  links = []
  for a in soup.select("a.result__a"):
    href = a.get("href") or ""
    if href.startswith("http"):
      links.append(href)
  return links[:30]

def bing_links(query: str) -> List[str]:
  html = _req(f"https://www.bing.com/search?q={requests.utils.quote(query)}")
  soup = BeautifulSoup(html, "lxml")
  links = []
  for li in soup.select("li.b_algo h2 a"):
    href = li.get("href") or ""
    if href.startswith("http"):
      links.append(href)
  return links[:30]

def scrape_contact(url: str) -> Dict:
  # Simple page scrape to discover email/phone/company
  try:
    html = _req(url)
  except Exception:
    return {}
  soup = BeautifulSoup(html, "lxml")
  text = soup.get_text(" ", strip=True)
  email = None
  m = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.I)
  if m: email = m.group(0)

  phone = None
  m2 = re.search(r"(?:(?:\+|00)\d{1,3}\s?)?(?:\(?\d{2,5}\)?[\s\-]?)\d{3,}(\s?\-\s?\d+)?", text)
  if m2: phone = m2.group(0)

  title = soup.title.string.strip() if soup.title and soup.title.string else None
  if not title:
    og = soup.select_one("meta[property='og:site_name']")
    if og and og.get("content"):
      title = og.get("content")

  return {"email": email, "phone": phone, "company": title}















