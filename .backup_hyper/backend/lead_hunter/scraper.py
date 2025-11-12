import time
import requests
from typing import List, Dict
from bs4 import BeautifulSoup
from .config import load_config
from .utils import EMAIL_RE, PHONE_RE, unique


def search_duckduckgo(category: str, location: str, count: int) -> List[str]:
    cfg = load_config()
    q = f"{category} {location} kontakt e-mail firma"
    params = {"q": q}
    headers = {"User-Agent": cfg["user_agent"]}
    url = cfg["duckduckgo_html"]
    
    try:
        r = requests.post(url, data=params, headers=headers, timeout=cfg["timeout_sec"])
        r.raise_for_status()
        try:
            soup = BeautifulSoup(r.text, "lxml")
        except Exception:
            soup = BeautifulSoup(r.text, "html.parser")
        links = []
        for a in soup.select("a.result__a"):
            href = a.get("href")
            if href and href.startswith("http"):
                links.append(href)
            if len(links) >= count * 3:  # oversample; we'll filter later
                break
        return unique(links)
    except Exception as e:
        # Fallback: return empty list on error
        return []


def fetch_company_page(url: str) -> dict:
    cfg = load_config()
    headers = {"User-Agent": cfg["user_agent"]}
    try:
        r = requests.get(url, headers=headers, timeout=cfg["timeout_sec"])
        r.raise_for_status()
        html = r.text
    except Exception as e:
        return {"ok": False, "url": url, "error": str(e)}
    
    try:
        try:
            soup = BeautifulSoup(html, "lxml")
        except Exception:
            soup = BeautifulSoup(html, "html.parser")
        title = (soup.title.text.strip() if soup.title else "")[:120]
        text = soup.get_text(separator=" ")[:100000]
        emails = unique(EMAIL_RE.findall(html))[:cfg["max_per_site_emails"]]
        phones = unique(PHONE_RE.findall(text))[:3]
        
        # naive city extraction
        city = ""
        for m in soup.select("meta[name=geo.region], meta[name=ICBM], meta[property='business:contact_data:locality']"):
            c = (m.get("content") or "").strip()
            if c:
                city = c
                break
        
        return {"ok": True, "url": url, "title": title, "emails": emails, "phones": phones, "city": city}
    except Exception as e:
        return {"ok": False, "url": url, "error": str(e)}


def search_bing(category: str, location: str, count: int) -> List[str]:
    """Bing HTML Fallback für Lead-Suche"""
    cfg = load_config()
    q = f"{category} {location} kontakt e-mail firma"
    headers = {"User-Agent": cfg["user_agent"]}
    url = f"https://www.bing.com/search?q={q}"
    
    try:
        r = requests.get(url, headers=headers, timeout=cfg["timeout_sec"])
        r.raise_for_status()
        try:
            soup = BeautifulSoup(r.text, "lxml")
        except Exception:
            soup = BeautifulSoup(r.text, "html.parser")
        links = []
        for a in soup.select("h2 a, .b_algo a"):
            href = a.get("href")
            if href and href.startswith("http") and "bing.com" not in href:
                links.append(href)
            if len(links) >= count * 3:
                break
        return unique(links)
    except Exception as e:
        return []


def hunt(category: str, location: str, count: int = 20) -> List[Dict]:
    """Dual-Search Strategy: DuckDuckGo + Bing Fallback"""
    cfg = load_config()
    
    # 1) DuckDuckGo HTML
    links = search_duckduckgo(category, location, count)
    
    # 2) Wenn < 3 Ergebnisse → Bing HTML Fallback
    if len(links) < 3:
        bing_links = search_bing(category, location, count)
        links.extend(bing_links)
        links = unique(links)
    
    # Wenn beide fehlschlagen, leere Liste zurückgeben
    if len(links) == 0:
        return []
    
    results = []
    
    for i, link in enumerate(links):
        if len(results) >= count:
            break
        
        info = fetch_company_page(link)
        if info.get("ok") and (info.get("emails") or info.get("phones")):
            # build lead
            name = info.get("title") or link.split("/")[2] if "/" in link else link
            results.append({
                "company": name,
                "category": category,
                "location": location,
                "emails": info.get("emails", []),
                "phones": info.get("phones", []),
                "website": link,
                "city": info.get("city", ""),
                "source_url": link
            })
        
        time.sleep(cfg["request_delay_ms"] / 1000.0)
    
    return results

