from __future__ import annotations
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, validator, root_validator

# ---------- OFFERS.DRAFT ----------
class OfferItemCompat(BaseModel):
    # akzeptiere name/title, qty/quantity, price/unit_price
    name: Optional[str] = None
    title: Optional[str] = None
    qty: Optional[float] = None
    quantity: Optional[float] = None
    price: Optional[float] = None
    unit_price: Optional[float] = None

    def canonical(self) -> Dict[str, Any]:
        return {
            "name": self.name or self.title or "Position",
            "qty": float(self.qty if self.qty is not None else (self.quantity if self.quantity is not None else 1)),
            "price": float(self.price if self.price is not None else (self.unit_price if self.unit_price is not None else 0.0)),
        }

class OfferDraftCompat(BaseModel):
    customer: Optional[str] = None
    customer_id: Optional[int] = Field(default=None)
    items: List[OfferItemCompat] = Field(default_factory=list)

    @root_validator(pre=True)
    def _coerce_items(cls, values):
        items = values.get("items")
        if not items:
            # tolerate single item under 'item'
            single = values.get("item")
            if single:
                values["items"] = [single]
        return values

    @validator("items")
    def _ensure_items(cls, v):
        if not v or len(v) == 0:
            raise ValueError("at least one item required")
        return v

    def canonical(self) -> Dict[str, Any]:
        return {
            "customer": self.customer,
            "customer_id": self.customer_id,
            "items": [it.canonical() for it in self.items],
        }

# ---------- CHARACTER.EVENT ----------
class CharacterEventCompat(BaseModel):
    user_id: Optional[str] = None
    user: Optional[str] = None
    text: str
    sentiment: Optional[str] = None
    mood: Optional[str] = None
    topics: Optional[List[str]] = None
    meta: Optional[Dict[str, Any]] = None

    @validator("text")
    def _text_not_empty(cls, v):
        if not v or not str(v).strip():
            raise ValueError("text required")
        return v

    def canonical(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id or self.user or "denis",
            "text": self.text,
            "sentiment": self.sentiment or self.mood or "neutral",
            "topics": self.topics or [],
            "meta": self.meta or {},
        }

# ---------- KB.CREATE ----------
class KBCreateCompat(BaseModel):
    title: Optional[str] = None
    name: Optional[str] = None
    content: Optional[str] = None
    body: Optional[str] = None
    tags: Optional[List[str]] = None

    def canonical(self) -> Dict[str, Any]:
        return {
            "title": (self.title or self.name or "Notiz"),
            "content": (self.content or self.body or ""),
            "tags": self.tags or [],
        }

# Small helper to safely call existing service functions even if signature differs.
def call_compat(func, **payload):
    try:
        return func(**payload)
    except TypeError:
        # Try positional fallbacks (common patterns)
        try:
            return func(payload)  # single dict
        except TypeError:
            return func(**{k: v for k, v in payload.items() if v is not None})


