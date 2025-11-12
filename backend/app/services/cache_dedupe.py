import os
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime, timedelta

CACHE_DIR = Path(os.getenv("CACHE_DIR", "backend/data/cache/osm"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_TTL_SECONDS = int(os.getenv("OSM_CACHE_TTL_SECONDS", "86400"))


def make_key(category: str, city: str) -> str:
    """Erstellt einen Cache-Key aus Kategorie und Stadt"""
    key_str = f"{category.lower()}|{city.lower()}"
    return hashlib.sha1(key_str.encode()).hexdigest()


def load_cache(key: str) -> Optional[Dict]:
    """Lädt Cache-Daten für einen Key"""
    cache_file = CACHE_DIR / f"{key}.json"
    if not cache_file.exists():
        return None
    
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Prüfe TTL
        cached_at = datetime.fromisoformat(data.get("cached_at", ""))
        age = (datetime.now() - cached_at).total_seconds()
        
        if age > CACHE_TTL_SECONDS:
            # Cache abgelaufen
            cache_file.unlink()
            return None
        
        return data.get("leads", [])
    except Exception:
        return None


def save_cache(key: str, leads: List[Dict]) -> None:
    """Speichert Leads im Cache"""
    cache_file = CACHE_DIR / f"{key}.json"
    try:
        data = {
            "cached_at": datetime.now().isoformat(),
            "leads": leads
        }
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def normalize_name(name: str) -> str:
    """Normalisiert einen Firmennamen für Deduplizierung"""
    if not name:
        return ""
    return name.strip().casefold()


def dedupe(leads: List[Dict]) -> List[Dict]:
    """Dedupliziert Leads nach normalisiertem Namen + Stadt, bevorzugt enriched Leads"""
    if not leads:
        return leads
    
    # Gruppiere nach (normalized_name, normalized_city)
    grouped = {}
    for lead in leads:
        name = normalize_name(lead.get("company", ""))
        city = normalize_name(lead.get("city", ""))
        key = (name, city)
        
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(lead)
    
    # Für jede Gruppe: bevorzuge enriched Lead (hat mehr Kontaktdaten)
    deduped = []
    for key, group_leads in grouped.items():
        if len(group_leads) == 1:
            deduped.append(group_leads[0])
        else:
            # Sortiere: enriched zuerst, dann nach Score
            sorted_leads = sorted(
                group_leads,
                key=lambda x: (
                    "enriched" in str(x.get("source", "")).lower(),
                    x.get("score", 0)
                ),
                reverse=True
            )
            deduped.append(sorted_leads[0])
    
    return deduped


