import math
import re
from typing import List
from sqlalchemy.orm import Session
from .models import KBItem


WORD_RE = re.compile(r"[a-zA-ZäöüÄÖÜß]+", re.UNICODE)


def _tokenize(text: str) -> List[str]:
    return [t.lower() for t in WORD_RE.findall(text)]


def _vectorize(texts: List[str]):
    # simple bag-of-words with idf
    vocab = {}
    docs = []
    for t in texts:
        toks = _tokenize(t)
        docs.append(toks)
        for tok in set(toks):
            vocab.setdefault(tok, 0)
            vocab[tok] += 1
    
    N = len(texts) or 1
    idf = {w: math.log((N + 1) / (df + 1)) + 1.0 for w, df in vocab.items()}
    
    vectors = []
    for toks in docs:
        tf = {}
        for w in toks:
            tf[w] = tf.get(w, 0) + 1
        vec = {w: (tf[w] / len(toks)) * idf.get(w, 0.0) for w in tf}
        vectors.append(vec)
    
    return idf, vectors


def _cosine(a: dict, b: dict) -> float:
    common = set(a.keys()) & set(b.keys())
    num = sum(a[w] * b[w] for w in common)
    da = math.sqrt(sum(v * v for v in a.values()))
    db = math.sqrt(sum(v * v for v in b.values()))
    if da == 0 or db == 0:
        return 0.0
    return num / (da * db)


def kb_search(db: Session, q: str, limit: int = 5):
    items = db.query(KBItem).order_by(KBItem.id.desc()).all()
    corpus = []
    for it in items:
        composite = f"{it.topic} {' '.join(it.tags or [])} {it.content}"
        corpus.append(composite)
    
    if not corpus:
        return []
    
    idf, vecs = _vectorize(corpus)
    # query vector
    _, [qv] = _vectorize([q])
    
    scores = []
    for i, vec in enumerate(vecs):
        s = _cosine(vec, qv)
        scores.append((s, items[i]))
    
    scores.sort(key=lambda x: x[0], reverse=True)
    out = []
    for s, it in scores[:limit]:
        out.append({
            "id": it.id,
            "topic": it.topic,
            "tags": it.tags or [],
            "score": round(float(s), 4),
            "snippet": (it.content[:220] + ("..." if len(it.content) > 220 else "")),
        })
    return out

















