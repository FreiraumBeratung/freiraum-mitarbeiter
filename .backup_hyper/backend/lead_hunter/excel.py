import os
from datetime import datetime
from openpyxl import Workbook


def export_leads_xlsx(leads: list[dict], exports_dir: str) -> str:
    os.makedirs(exports_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(exports_dir, f"leads_{ts}.xlsx")
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"
    
    headers = ["company", "category", "location", "city", "email(s)", "phone(s)", "website", "source"]
    ws.append(headers)
    
    for l in leads:
        ws.append([
            l.get("company", ""),
            l.get("category", ""),
            l.get("location", ""),
            l.get("city", ""),
            ", ".join(l.get("emails", [])),
            ", ".join(l.get("phones", [])),
            l.get("website", ""),
            l.get("source_url", ""),
        ])
    
    wb.save(path)
    return path






