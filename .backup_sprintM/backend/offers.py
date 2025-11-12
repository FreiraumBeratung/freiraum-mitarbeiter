import os
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Any, Dict
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor
from reportlab.lib.utils import ImageReader
from .db import SessionLocal
from .models import Offer, OfferItem, FollowUp

router = APIRouter(prefix="/api/offers", tags=["offers"])

ORANGE = HexColor("#ff7a00")
BLACK = black

class OfferItemIn(BaseModel):
    name: str
    qty: float
    unit_price: float

class OfferIn(BaseModel):
    customer: str
    items: list[OfferItemIn]

# Compat wrapper (tolerant schema) - accepts both old and new formats
@router.post("/draft")
def draft_offer(payload: Dict[str, Any] = Body(...)):
    """
    Compat wrapper: accepts name/title, qty/quantity, price/unit_price, optional customer(_id).
    Normalizes and forwards to underlying draft creator.
    """
    # Lazy import to avoid circular dependency
    from backend.compat.schemas import OfferDraftCompat
    try:
        data = OfferDraftCompat(**payload).canonical()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"invalid offer payload: {e}")
    
    # Convert to OfferIn format for existing handler logic
    items = []
    for it in data["items"]:
        items.append({
            "name": it["name"],
            "qty": it["qty"],
            "unit_price": it["price"]
        })
    
    # Call existing handler logic
    db = SessionLocal()
    try:
        total_net = sum(i["qty"] * i["unit_price"] for i in items)
        total_gross = round(total_net * 1.19, 2)
        customer = data.get("customer") or "Unbekannt"
        offer = Offer(customer=customer, total_net=total_net, total_gross=total_gross, status="draft")
        db.add(offer); db.flush()
        for it in items:
            db.add(OfferItem(offer_id=offer.id, name=it["name"], qty=it["qty"], unit_price=it["unit_price"]))
        # Auto-Follow-up in 3 Tagen
        due = datetime.utcnow() + timedelta(days=3)
        db.add(FollowUp(entity_type="offer", entity_id=offer.id, due_at=due, note="Nachfassen: Angebot gesendet"))
        db.commit()
        return {"ok": True, "id": offer.id, "total_net": total_net, "total_gross": total_gross, "followup_due": due.isoformat()}
    finally:
        db.close()

def _draw_header(c: canvas.Canvas, w, h):
    c.setFillColor(BLACK); c.setFont("Helvetica-Bold", 18)
    c.drawString(50, h-60, "Angebot")
    # Logo falls vorhanden
    try:
        here = os.path.dirname(__file__)
        logo = os.path.abspath(os.path.join(here, "..", "assets", "logo.png"))
        if os.path.exists(logo):
            img = ImageReader(logo)
            c.drawImage(img, w-210, h-100, width=160, height=48, mask='auto')
    except Exception:
        pass
    c.setStrokeColor(ORANGE)
    c.setLineWidth(2)
    c.line(50, h-105, w-50, h-105)

@router.get("/{offer_id}/pdf")
def offer_pdf(offer_id: int):
    db = SessionLocal()
    try:
        offer = db.get(Offer, offer_id)
        if not offer:
            raise HTTPException(404, "Offer not found")
        items = db.query(OfferItem).filter(OfferItem.offer_id==offer_id).all()
        exports = os.path.join(os.path.dirname(__file__), "..", "exports")
        os.makedirs(exports, exist_ok=True)
        out_path = os.path.abspath(os.path.join(exports, f"angebot_{offer_id}.pdf"))

        c = canvas.Canvas(out_path, pagesize=A4)
        w, h = A4
        _draw_header(c, w, h)
        y = h-140
        c.setFont("Helvetica", 11)
        c.setFillColor(ORANGE)
        c.drawString(50, y, f"Kunde: {offer.customer}")
        c.setFillColor(BLACK); y -= 20
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "Pos"); c.drawString(85, y, "Artikel"); c.drawString(415, y, "Menge"); c.drawString(485, y, "Einzelpreis")
        y -= 14; c.setFont("Helvetica", 11)
        pos = 1
        for it in items:
            c.drawString(50, y, str(pos)); c.drawString(85, y, it.name[:56])
            c.drawRightString(455, y, f"{it.qty:g}")
            c.drawRightString(560, y, f"{it.unit_price:,.2f} €")
            y -= 16; pos += 1
            if y < 120:
                c.showPage(); _draw_header(c, w, h); y = h-140; c.setFont("Helvetica", 11)
        y -= 10
        c.setFont("Helvetica-Bold", 12); c.setFillColor(ORANGE)
        c.drawRightString(560, y, f"Netto: {offer.total_net:,.2f} €"); y -= 16
        c.drawRightString(560, y, f"Brutto (19%): {offer.total_gross:,.2f} €")
        c.save()
        return {"ok": True, "pdf": out_path}
    finally:
        db.close()
