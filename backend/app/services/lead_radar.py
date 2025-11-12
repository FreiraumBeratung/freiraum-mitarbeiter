from typing import Dict, List


# Simple transparent score: presence weights + recency
WEIGHTS = {
    "email": 25,
    "phone": 20,
    "website": 15,
    "city": 10,
    "category": 10,
    "source": 5,
}


def score_one(r: Dict) -> Dict:
    """Berechnet einen Score für einen einzelnen Lead."""
    s = 0
    for k, w in WEIGHTS.items():
        v = r.get(k, "")
        if isinstance(v, str) and v.strip():
            s += w
        elif v:
            s += w
    
    # Bonus wenn explizit SHK/Elektro etc.
    cat = (r.get("category", "") or "").lower()
    if any(x in cat for x in ["shk", "elektro", "heizung", "sanit", "install"]):
        s += 10
    
    return {**r, "score": min(100, s)}


def score_list(rows: List[Dict]) -> List[Dict]:
    """Berechnet Scores für eine Liste von Leads."""
    return [score_one(r) for r in rows]


