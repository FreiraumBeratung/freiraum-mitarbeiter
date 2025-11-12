from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse
from .db import SessionLocal
from .models import Lead, Offer, Interaction
import io, csv
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from datetime import datetime, timedelta
from sqlalchemy import func

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/kpis")
def kpis():
    db = SessionLocal()
    try:
        leads = db.query(Lead).count()
        offers = db.query(Offer).count()
        won = db.query(Offer).filter(Offer.status=="won").count()
        return {"leads": leads, "offers": offers, "won_offers": won}
    finally:
        db.close()

# ----- Insights Helpers -----
def recent_contacts(session, days: int = 30):
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        session.query(Interaction.contact_email, Interaction.contact_name)
        .filter(Interaction.at >= since)
        .all()
    )
    agg = {}
    for email, name in rows:
        if not email: continue
        a = agg.setdefault(email, {"email":email, "name":name or "", "count_out":0, "count_in":0})
    # counts
    counts = session.query(Interaction.contact_email, Interaction.direction, func.count(Interaction.id)).filter(Interaction.at>=since).group_by(Interaction.contact_email, Interaction.direction).all()
    for email, direction, c in counts:
        if not email: continue
        a = agg.setdefault(email, {"email":email, "name":"", "count_out":0, "count_in":0})
        if direction=='out': a["count_out"] = c
        else: a["count_in"] = c
    return list(agg.values())

def warm_contacts(session):
    since = datetime.utcnow() - timedelta(days=60)
    q = session.query(Interaction).filter(Interaction.at>=since)
    by = {}
    for r in q:
        if not r.contact_email: continue
        e = by.setdefault(r.contact_email, {"email":r.contact_email, "name":r.contact_name or "", "out":0, "in":0, "score":0})
        if r.direction=='out': e['out']+=1
        else: e['in']+=1
    out = []
    for v in by.values():
        if v['out']>=2 and v['in']>=1:
            v['score'] = min(1.0, 0.5 + 0.1*v['out'] + 0.2*v['in'])
            out.append(v)
    return sorted(out, key=lambda x: x['score'], reverse=True)

def discount_candidates(session):
    since = datetime.utcnow() - timedelta(days=60)
    by = {}
    for r in session.query(Interaction).filter(Interaction.at>=since):
        e = r.contact_email
        if not e: continue
        d = by.setdefault(e, {"email":e, "name":r.contact_name or "", "n":0})
        d['n'] += 1
    out = []
    for e, v in by.items():
        if v['n']>=3:
            out.append({"email":e, "name":v['name'], "score":0.65, "suggested_discount":5})
    return out

@router.get("/export.csv")
def export_csv():
    db = SessionLocal()
    out = io.StringIO()
    w = csv.writer(out, delimiter=';')
    w.writerow(["timestamp","metric","value"])
    try:
        leads = db.query(Lead).count()
        offers = db.query(Offer).count()
        won = db.query(Offer).filter(Offer.status=="won").count()
    finally:
        db.close()
    ts = datetime.now().isoformat(timespec="seconds")
    for k,v in [("leads",leads),("offers",offers),("won_offers",won)]:
        w.writerow([ts,k,v])
    out.seek(0)
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv", headers={
        "Content-Disposition": "attachment; filename=freiraum_reports.csv"
    })

@router.get("/export.pdf")
def export_pdf():
    db = SessionLocal()
    try:
        leads = db.query(Lead).count()
        offers = db.query(Offer).count()
        won = db.query(Offer).filter(Offer.status=="won").count()
    finally:
        db.close()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    c.setFillColorRGB(0,0,0)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(2*cm, h-2*cm, "Freiraum Mitarbeiter – KPI Report")
    c.setFont("Helvetica", 11)
    c.drawString(2*cm, h-3*cm, f"Erstellt: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}")
    # Linie
    c.setStrokeColorRGB(1, .45, 0)  # Orange
    c.setLineWidth(2)
    c.line(2*cm, h-3.2*cm, w-2*cm, h-3.2*cm)
    # KPIs
    y = h-5*cm
    def row(label, value):
        nonlocal y
        c.setFont("Helvetica-Bold", 13); c.drawString(2*cm, y, label)
        c.setFont("Helvetica", 13); c.drawRightString(w-2*cm, y, str(value))
        y -= 1.0*cm
    row("Leads", leads)
    row("Angebote", offers)
    row("Gewonnen", won)
    c.showPage(); c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={
        "Content-Disposition": "attachment; filename=freiraum_reports.pdf"
    })
