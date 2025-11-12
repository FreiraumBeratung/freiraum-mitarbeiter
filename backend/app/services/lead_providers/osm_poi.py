import time

import httpx

OVERPASS = "https://overpass-api.de/api/interpreter"

CATEGORY_MAP = {
    # Handwerk
    "shk": [("craft", "plumber"), ("craft", "hvac")],
    "elektro": [("craft", "electrician")],
    "galabau": [("craft", "gardener")],
    "bau": [("craft", "builder")],
    # Handel & Gewerbe
    "baustoffhandel": [("shop", "building_materials")],
    "einzelhandel": [("shop", "*")],
    "grosshandel": [("shop", "trade")],
    # Ärzte / Gesundheit
    "arzt": [("amenity", "doctor")],
    "zahnarzt": [("amenity", "dentist")],
    "apotheke": [("amenity", "pharmacy")],
    "klinik": [("amenity", "clinic")],
    # Dienstleistung
    "steuerberater": [("office", "tax_advisor")],
    "rechtsanwalt": [("office", "lawyer")],
    "versicherung": [("office", "insurance")],
    "makler": [("office", "estate_agent")],
    # Fitness / Beauty
    "fitness": [("leisure", "fitness_centre")],
    "friseur": [("shop", "hairdresser")],
    "beauty": [("shop", "beauty")],
}


async def search(category: str, location: str):
  tags = CATEGORY_MAP.get(category.lower(), [("shop", "*")])
  query_parts = []
  for key, value in tags:
    if value == "*":
      query_parts.append(f'node["{key}"](area.a);')
    else:
      query_parts.append(f'node["{key}"="{value}"](area.a);')

  query = f"""
  [out:json][timeout:30];
  area["name"="{location}"]->.a;
  (
    {' '.join(query_parts)}
  );
  out center;
  """

  async with httpx.AsyncClient() as client:
    response = await client.post(OVERPASS, data={"data": query})
    if response.status_code != 200:
      return []

    elements = response.json().get("elements", [])
    results = []
    for elem in elements:
      tags = elem.get("tags", {})
      results.append(
        {
          "company": tags.get("name", ""),
          "city": location,
          "category": category,
          "source": "osm_poi",
          "phone": tags.get("phone", ""),
          "email": tags.get("email", ""),
          "website": tags.get("website", ""),
          "lat": elem.get("lat"),
          "lon": elem.get("lon"),
          "ts": int(time.time()),
        }
      )
    return results




