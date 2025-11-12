import time
import json
import httpx
from typing import Dict, List, Tuple, Optional
from .osm_filters import OSM_CATEGORY_TAGS, CONTACT_KEYS
from .cache_dedupe import make_key, load_cache, save_cache, dedupe
from .retry_policy import with_retry

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def resolve_area_id(location: str) -> Optional[int]:
    """Get OSM administrative area id for a town/city in DE"""
    def _resolve():
        params = {
            "q": f"{location}, Deutschland",
            "format": "json",
            "limit": 1,
            "addressdetails": 1
        }
        headers = {"User-Agent": "Freiraum-Mitarbeiter/1.0 (contact: local)"}
        with httpx.Client(timeout=20.0, headers=headers) as c:
            r = c.get(NOMINATIM_URL, params=params)
            r.raise_for_status()
            arr = r.json()
            if not arr:
                return None
            osm_id = arr[0].get("osm_id")
            osm_type = arr[0].get("osm_type")  # relation/way/node
            if osm_type == "relation":
                return 3600000000 + int(osm_id)  # area id for relation
            elif osm_type == "way":
                return 2400000000 + int(osm_id)
            elif osm_type == "node":
                return 3600000000 + int(osm_id)  # fallback
        return None
    
    return with_retry(_resolve)


def _tag_expr(tag: Dict[str, str]) -> str:
    """e.g. {"craft":"hvac"} -> ["craft"="hvac"]"""
    k, v = list(tag.items())[0]
    return f'["{k}"="{v}"]'


def build_query(category: str, area_id: int) -> str:
    """Build Overpass QL query for category in area"""
    tags = OSM_CATEGORY_TAGS.get(category.lower(), [])
    if not tags:
        # generic shop fallback
        tags = [{"shop": "*"}]
    lines = []
    for t in tags:
        lines.append(f'  node(area:{area_id}){_tag_expr(t)};')
        lines.append(f'  way(area:{area_id}){_tag_expr(t)};')
        lines.append(f'  relation(area:{area_id}){_tag_expr(t)};')
    body = "\n".join(lines)
    q = f"""
[out:json][timeout:60];
area({area_id})->.searchArea;
(
{body}
);
out tags center 200;
"""
    return q


def fetch_pois(category: str, location: str, use_cache: bool = True) -> List[Dict]:
    """Fetch POIs from OSM Overpass API for category and location"""
    # Prüfe Cache
    cache_key = make_key(category, location)
    if use_cache:
        cached_leads = load_cache(cache_key)
        if cached_leads is not None:
            return cached_leads
    
    area_id = resolve_area_id(location)
    if not area_id:
        return []
    
    q = build_query(category, area_id)
    headers = {"User-Agent": "Freiraum-Mitarbeiter/1.0 (contact: local)"}
    
    def _fetch_overpass():
        with httpx.Client(timeout=60.0, headers=headers) as c:
            r = c.post(OVERPASS_URL, data={"data": q})
            r.raise_for_status()
            return r.json()
    
    data = with_retry(_fetch_overpass)
    
    elements = data.get("elements", [])
    results = []
    for el in elements:
        tags = el.get("tags", {})
        row = {}
        
        # basic identity
        row["company"] = tags.get("name") or tags.get("operator") or ""
        row["category"] = category
        
        # address
        row["street"] = tags.get("addr:street", "")
        row["housenumber"] = tags.get("addr:housenumber", "")
        row["postcode"] = tags.get("addr:postcode", "")
        row["city"] = tags.get("addr:city", location)  # Fallback auf location
        
        # contacts
        row["phone"] = tags.get("phone") or tags.get("contact:phone") or ""
        row["email"] = tags.get("email") or tags.get("contact:email") or ""
        row["website"] = tags.get("website") or tags.get("contact:website") or tags.get("url") or ""
        
        # geo
        row["lat"] = el.get("lat") or (el.get("center") or {}).get("lat")
        row["lon"] = el.get("lon") or (el.get("center") or {}).get("lon")
        
        # source
        row["source"] = "osm"
        
        results.append(row)
    
    # Deduplizierung
    results = dedupe(results)
    
    # Speichere im Cache
    if use_cache:
        save_cache(cache_key, results)
    
    return results

