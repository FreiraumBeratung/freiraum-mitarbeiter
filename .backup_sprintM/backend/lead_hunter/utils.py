import re
from urllib.parse import urlparse


EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(\+?\d[\d \-/()]{6,}\d)")


def unique(seq):
    out = []
    seen = set()
    for x in seq:
        key = str(x)
        if key not in seen:
            seen.add(key)
            out.append(x)
    return out


def normalize_domain(url: str | None) -> str | None:
    if not url:
        return None
    try:
        p = urlparse(url)
        host = p.netloc or url
        return host.lower().strip()
    except Exception:
        return None






