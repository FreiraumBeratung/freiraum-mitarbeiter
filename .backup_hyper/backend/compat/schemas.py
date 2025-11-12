from __future__ import annotations

from typing import List, Optional, Any, Dict, Union

from pydantic import BaseModel, Field, validator, root_validator



def _to_float(x, default=0.0):

    if x is None: return float(default)

    try:

        return float(x)

    except Exception:

        try:

            return float(str(x).replace(",", "."))

        except Exception:

            return float(default)



def _to_int(x, default=None):

    if x is None: return default

    try:

        return int(x)

    except Exception:

        try:

            return int(float(x))

        except Exception:

            return default



def _to_list_str(x):

    if x is None:

        return []

    if isinstance(x, list):

        return [str(i).strip() for i in x if str(i).strip()]

    s = str(x)

    if "," in s:

        return [i.strip() for i in s.split(",") if i.strip()]

    return [s.strip()] if s.strip() else []



# ---------- OFFERS.DRAFT ----------

class OfferItemCompat(BaseModel):

    name: Optional[str] = None

    title: Optional[str] = None

    qty: Optional[Union[float, str, int]] = None

    quantity: Optional[Union[float, str, int]] = None

    price: Optional[Union[float, str, int]] = None

    unit_price: Optional[Union[float, str, int]] = None



    def canonical(self) -> Dict[str, Any]:

        nm = (self.name or self.title or "Position")

        q = self.qty if self.qty is not None else self.quantity

        p = self.price if self.price is not None else self.unit_price

        return {

            "name": nm,

            "qty": _to_float(q, 1),

            "price": _to_float(p, 0.0),

        }



class OfferDraftCompat(BaseModel):

    customer: Optional[str] = None

    customer_id: Optional[Union[int, str]] = Field(default=None)

    # items darf Liste ODER einzelnes Objekt sein

    items: Optional[Union[List[OfferItemCompat], OfferItemCompat, Dict[str, Any]]] = None

    item: Optional[Union[OfferItemCompat, Dict[str, Any]]] = None



    @root_validator(pre=True)

    def _ensure_items(cls, values):

        items = values.get("items")

        if items is None:

            single = values.get("item")

            if single is not None:

                values["items"] = [single]

        # Falls items ein Dict ist → Liste draus machen

        if isinstance(values.get("items"), dict):

            values["items"] = [values["items"]]

        return values



    def canonical(self) -> Dict[str, Any]:

        raw = self.items or []

        if isinstance(raw, (OfferItemCompat, dict)):

            raw = [raw]

        norm = []

        for r in raw:

            if isinstance(r, dict):

                norm.append(OfferItemCompat(**r).canonical())

            elif isinstance(r, OfferItemCompat):

                norm.append(r.canonical())

        if not norm:

            # minimaler Default, damit kein 422 bei Audit

            norm = [{"name": "Service", "qty": 1.0, "price": 0.0}]

        return {

            "customer": self.customer,

            "customer_id": _to_int(self.customer_id),

            "items": norm,

        }



# ---------- CHARACTER.EVENT ----------

class CharacterEventCompat(BaseModel):

    user_id: Optional[str] = None

    user: Optional[str] = None

    text: Optional[str] = None

    message: Optional[str] = None

    sentiment: Optional[str] = None

    mood: Optional[str] = None

    topics: Optional[Union[List[str], str]] = None

    meta: Optional[Dict[str, Any]] = None



    def canonical(self) -> Dict[str, Any]:

        txt = (self.text or self.message or "").strip()

        if not txt:

            txt = "empty"  # Audit-sicher

        return {

            "user_id": (self.user_id or self.user or "denis"),

            "text": txt,

            "sentiment": (self.sentiment or self.mood or "neutral"),

            "topics": _to_list_str(self.topics),

            "meta": self.meta or {},

        }



# ---------- KB.CREATE ----------

class KBCreateCompat(BaseModel):

    title: Optional[str] = None

    name: Optional[str] = None

    topic: Optional[str] = None

    content: Optional[str] = None

    body: Optional[str] = None

    tags: Optional[Union[List[str], str]] = None



    def canonical(self) -> Dict[str, Any]:

        ttl = (self.title or self.name or self.topic or "Notiz")

        cnt = (self.content or self.body or "")

        return {

            "title": ttl,

            "content": cnt,

            "tags": _to_list_str(self.tags),

        }
