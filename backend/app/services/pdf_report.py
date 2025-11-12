import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from collections import defaultdict

# Export directory - resolve relative to backend root
_backend_root = Path(__file__).resolve().parents[2]
EXPORT_DIR = Path(os.getenv("EXPORT_DIR", "backend/data/exports"))
if not EXPORT_DIR.is_absolute():
    EXPORT_DIR = (_backend_root / EXPORT_DIR).resolve()
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


def build_pdf(leads: List[Dict], category: str = "", city: str = "") -> str:
    """Erstellt einen PDF-Report für OSM Leads"""
    if not leads:
        leads = []
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    category_clean = (category or "all").replace(" ", "_")
    city_clean = (city or "all").replace(" ", "_")
    filename = f"osm_report_{category_clean}_{city_clean}_{timestamp}.pdf"
    filepath = EXPORT_DIR / filename
    
    doc = SimpleDocTemplate(str(filepath), pagesize=A4)
    story = []
    
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=24,
        textColor=colors.HexColor("#FF7300"),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        "CustomHeading",
        parent=styles["Heading2"],
        fontSize=16,
        textColor=colors.HexColor("#FF7300"),
        spaceAfter=12,
        spaceBefore=20
    )
    
    # Header
    story.append(Paragraph("Freiraum Mitarbeiter", title_style))
    story.append(Paragraph("OSM Lead Report", styles["Heading2"]))
    story.append(Spacer(1, 0.5 * cm))
    
    # Meta Information
    meta_data = [
        ["Kategorie:", category or "Alle"],
        ["Stadt:", city or "Alle"],
        ["Erstellt:", datetime.now().strftime("%d.%m.%Y %H:%M:%S")],
        ["Anzahl Leads:", str(len(leads))]
    ]
    meta_table = Table(meta_data, colWidths=[4 * cm, 6 * cm])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#1a1a1a")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#333333"))
    ]))
    story.append(meta_table)
    story.append(PageBreak())
    
    # KPIs
    story.append(Paragraph("KPIs", heading_style))
    
    total_leads = len(leads)
    cities_count = len(set(lead.get("city", "") for lead in leads if lead.get("city")))
    
    # Top City
    city_counts = defaultdict(int)
    for lead in leads:
        city_name = lead.get("city", "")
        if city_name:
            city_counts[city_name] += 1
    top_city = max(city_counts.items(), key=lambda x: x[1])[0] if city_counts else "N/A"
    
    # Average Score
    scores = [lead.get("score", 0) for lead in leads if lead.get("score")]
    avg_score = sum(scores) / len(scores) if scores else 0
    
    kpi_data = [
        ["Metrik", "Wert"],
        ["Gesamt Leads", str(total_leads)],
        ["Anzahl Städte", str(cities_count)],
        ["Top Stadt", top_city],
        ["Ø Score", f"{avg_score:.1f}"]
    ]
    kpi_table = Table(kpi_data, colWidths=[6 * cm, 6 * cm])
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FF7300")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#333333")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#2a2a2a"), colors.HexColor("#1a1a1a")])
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 1 * cm))
    
    # Top-10 Tabelle
    story.append(Paragraph("Top-10 Leads", heading_style))
    
    sorted_leads = sorted(leads, key=lambda x: x.get("score", 0), reverse=True)[:10]
    
    top10_data = [["Firma", "Stadt", "Score", "E-Mail", "Telefon", "Website"]]
    for lead in sorted_leads:
        top10_data.append([
            lead.get("company", "")[:30],
            lead.get("city", "")[:20],
            str(lead.get("score", 0)),
            lead.get("email", "")[:30] or "-",
            lead.get("phone", "")[:20] or "-",
            lead.get("website", "")[:30] or "-"
        ])
    
    top10_table = Table(top10_data, colWidths=[3 * cm, 2.5 * cm, 1.5 * cm, 3 * cm, 2.5 * cm, 3 * cm])
    top10_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FF7300")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#333333")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#2a2a2a"), colors.HexColor("#1a1a1a")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE")
    ]))
    story.append(top10_table)
    story.append(PageBreak())
    
    # Städte-Pivot
    story.append(Paragraph("Städte-Statistik", heading_style))
    
    city_stats = defaultdict(lambda: {"count": 0, "scores": []})
    for lead in leads:
        city_name = lead.get("city", "")
        if city_name:
            city_stats[city_name]["count"] += 1
            score = lead.get("score", 0)
            if score:
                city_stats[city_name]["scores"].append(score)
    
    pivot_data = [["Stadt", "Anzahl", "Ø Score", "Max Score", "Min Score"]]
    for city_name in sorted(city_stats.keys()):
        stats = city_stats[city_name]
        count = stats["count"]
        scores = stats["scores"]
        avg = sum(scores) / len(scores) if scores else 0
        max_score = max(scores) if scores else 0
        min_score = min(scores) if scores else 0
        pivot_data.append([
            city_name[:25],
            str(count),
            f"{avg:.1f}",
            str(max_score),
            str(min_score)
        ])
    
    pivot_table = Table(pivot_data, colWidths=[4 * cm, 2 * cm, 2 * cm, 2 * cm, 2 * cm])
    pivot_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FF7300")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#333333")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#2a2a2a"), colors.HexColor("#1a1a1a")])
    ]))
    story.append(pivot_table)
    
    # Build PDF
    doc.build(story)
    
    return filename

