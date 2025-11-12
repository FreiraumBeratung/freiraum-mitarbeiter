from __future__ import annotations

import os, re, time, json, random

from typing import List, Dict, Any

import requests

from bs4 import BeautifulSoup



CACHE_FILE = os.path.join(os.environ.get("FREIRAUM_DATA_DIR", "data"), "lead_cache.json")

if not os.path.exists(os.path.dirname(CACHE_FILE)):

    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)

if not os.path.exists(CACHE_FILE):

    with open(CACHE_FILE, "w", encoding="utf-8") as f: json.dump({}, f)



def _load_cache():

    try:

        with open(CACHE_FILE, "r", encoding="utf-8") as f: return json.load(f)

    except: return {}

def _save_cache(c):

    with open(CACHE_FILE, "w", encoding="utf-8") as f: json.dump(c, f, ensure_ascii=False, indent=2)



EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)

PHONE_RE = re.compile(r"(?:\+\d{1,3}\s?)?(?:\(?\d{2,4}\)?\s?)?\d[\d\s\/-]{5,}\d")

DOMAIN_RE = re.compile(r"https?://([^/]+)/?", re.I)



def dedupe(leads: List[Dict[str,Any]]) -> List[Dict[str,Any]]:

    seen = set(); out=[]

    for l in leads:

        key = (l.get("domain") or l.get("email") or l.get("phone") or l.get("name") or "").lower().strip()

        if not key: key = json.dumps(l, sort_keys=True)

        if key in seen: continue

        seen.add(key); out.append(l)

    return out



def extract_contacts(html: str, url: str) -> Dict[str,Any]:

    soup = BeautifulSoup(html, "lxml")

    text = soup.get_text(" ", strip=True)

    emails = list(set(EMAIL_RE.findall(text)))

    phones = list(set(PHONE_RE.findall(text)))

    m = DOMAIN_RE.match(url or "")

    domain = m.group(1).lower() if m else None

    title = (soup.title.string.strip() if soup.title and soup.title.string else domain)

    name = title or domain

    return {"name": name, "domain": domain, "email": emails[0] if emails else None, "phone": phones[0] if phones else None, "source": url}



def _http_get(url, timeout):

    headers = {"user-agent":"Mozilla/5.0 FreiraumLeadHunter"}

    return requests.get(url, headers=headers, timeout=timeout)



def provider_duckduckgo(query: str, timeout=15, limit=10) -> List[str]:

    r = _http_get(f"https://duckduckgo.com/html/?q={query}", timeout)

    r.raise_for_status()

    soup = BeautifulSoup(r.text, "lxml")

    links = []

    for a in soup.select("a.result__a"):

        href = a.get("href")

        if href and href.startswith("http"):

            links.append(href)

        if len(links) >= limit: break

    return links



def provider_bing(query: str, timeout=15, limit=10) -> List[str]:

    key = os.environ.get("BING_API_KEY")

    if not key: return []

    # simple web endpoint

    resp = _http_get(f"https://www.bing.com/search?q={query}", timeout)

    soup = BeautifulSoup(resp.text, "lxml")

    out=[]

    for a in soup.select("li.b_algo h2 a"):

        href=a.get("href")

        if href and href.startswith("http"):

            out.append(href)

        if len(out)>=limit: break

    return out



def provider_google_cse(query: str, timeout=15, limit=10) -> List[str]:

    key = os.environ.get("GOOGLE_API_KEY")

    cx  = os.environ.get("GOOGLE_CSE_ID")

    if not key or not cx: return []

    url = f"https://www.google.com/search?q={query}"

    r = _http_get(url, timeout)

    soup = BeautifulSoup(r.text, "lxml")

    out=[]

    for a in soup.select("a"):

        href=a.get("href")

        if href and href.startswith("http") and "google." not in href and "webcache" not in href:

            out.append(href)

        if len(out)>=limit: break

    return out



def search_with_fallbacks(query: str, limit=15, per_provider=10, timeout=15, backoff=True) -> List[str]:

    c = _load_cache()

    if query in c:

        return c[query]

    providers = [provider_duckduckgo, provider_bing, provider_google_cse]

    links=[]

    for p in providers:

        for attempt in range(3):

            try:

                res = p(query, timeout=timeout, limit=per_provider)

                links.extend(res or [])

                break

            except Exception:

                if backoff: time.sleep(min(1.0*(attempt+1)**2, 5))

                continue

    # dedupe by domain

    seen = set(); out=[]

    for u in links:

        m = DOMAIN_RE.match(u)

        d = m.group(1).lower() if m else u

        if d in seen: continue

        seen.add(d); out.append(u)

        if len(out) >= limit: break

    c[query]=out; _save_cache(c)

    return out



def fetch_leads(links: List[str], timeout=12, limit=50) -> List[Dict[str,Any]]:

    out=[]

    for idx,u in enumerate(links[:limit]):

        try:

            r = _http_get(u, timeout)

            r.raise_for_status()

            info = extract_contacts(r.text, u)

            out.append(info)

        except Exception:

            continue

        time.sleep(0.15) # be polite

    return dedupe(out)











