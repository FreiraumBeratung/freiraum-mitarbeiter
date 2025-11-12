import re
from typing import Dict, Optional, Tuple
from app.services.osm_filters import OSM_CATEGORY_TAGS


# Kategorien-Mapping für Voice-Intent
CATEGORY_KEYWORDS = {
    "shk": ["shk", "heizung", "sanitär", "klima", "installateur", "klempner", "heizungsbauer"],
    "elektro": ["elektro", "elektriker", "elektrik", "strom", "elektronik"],
    "aerzte": ["arzt", "ärzte", "doktor", "praxis", "klinik", "medizin"],
    "steuerberater": ["steuerberater", "steuer", "berater", "steuerbüro"],
    "makler": ["makler", "immobilien", "immobilienmakler", "immobilienbüro"],
    "handel": ["handel", "baustoff", "baumarkt", "hardware", "diy"],
    "galabau": ["galabau", "garten", "gärtner", "gartenbau", "landschaftsbau"]
}

# Stadt-Keywords (HSK Region)
CITY_KEYWORDS = [
    "arnsberg", "sundern", "neheim", "meschede", "bestwig", "eslohe",
    "olsberg", "brilon", "marsberg", "schmallenberg", "winterberg", "hallenberg"
]


def extract_category(text: str) -> Optional[str]:
    """Extrahiere Kategorie aus Text"""
    text_lower = text.lower()
    
    # Prüfe jede Kategorie
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text_lower:
                return category
    
    return None


def extract_city(text: str) -> Optional[str]:
    """Extrahiere Stadt aus Text"""
    text_lower = text.lower()
    
    # Prüfe jede Stadt
    for city in CITY_KEYWORDS:
        if city in text_lower:
            # Capitalize first letter
            return city.capitalize()
    
    return None


def parse_voice_intent(text: str) -> Dict[str, any]:
    """Parse Voice-Intent aus Text"""
    result = {
        "category": None,
        "city": None,
        "valid": False,
        "raw_text": text
    }
    
    if not text:
        return result
    
    # Extrahiere Kategorie
    category = extract_category(text)
    if category:
        result["category"] = category
    
    # Extrahiere Stadt
    city = extract_city(text)
    if city:
        result["city"] = city
    
    # Intent ist gültig wenn beide vorhanden
    result["valid"] = category is not None and city is not None
    
    return result


def get_available_categories() -> list[str]:
    """Gibt verfügbare Kategorien zurück"""
    return list(OSM_CATEGORY_TAGS.keys())


def get_available_cities() -> list[str]:
    """Gibt verfügbare Städte zurück"""
    return [city.capitalize() for city in CITY_KEYWORDS]


