from __future__ import annotations

from fastapi import APIRouter, Query, Response
from typing import Optional
from .audit_logger import get_logger, export_csv, export_pdf

router = APIRouter(prefix="/api/audit", tags=["audit"])

@router.get("/list")
def audit_list(
    since: Optional[str] = Query(None, description="ISO-8601 ab (UTC)"),
    until: Optional[str] = Query(None, description="ISO-8601 bis (UTC)"),
    user_id: Optional[str] = Query(None),
    action_like: Optional[str] = Query(None),
    limit: int = Query(500),
    offset: int = Query(0)
):
    return get_logger().list(since=since, until=until, user_id=user_id, action_like=action_like, limit=limit, offset=offset)

@router.get("/export.csv")
def audit_export_csv(
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action_like: Optional[str] = Query(None),
    limit: int = Query(2000),
    offset: int = Query(0)
):
    rows = get_logger().list(since=since, until=until, user_id=user_id, action_like=action_like, limit=limit, offset=offset)
    csv_txt = export_csv(rows)
    return Response(content=csv_txt, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=audit_export.csv"})

@router.get("/export.pdf")
def audit_export_pdf(
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action_like: Optional[str] = Query(None),
    limit: int = Query(1000),
    offset: int = Query(0)
):
    rows = get_logger().list(since=since, until=until, user_id=user_id, action_like=action_like, limit=limit, offset=offset)
    pdf = export_pdf(rows)
    if pdf is None:
        # Fallback: CSV ausliefern, wenn kein reportlab da
        csv_txt = export_csv(rows)
        return Response(content=csv_txt, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=audit_export.csv"})
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=audit_report.pdf"})

@router.post("/purge")
def audit_purge(days: int = 90):
    count = get_logger().purge_older_than_days(days)
    return {"ok": True, "deleted": count, "older_than_days": days}

@router.post("/delete_user")
def audit_delete_user(user_id: str):
    count = get_logger().delete_user(user_id)
    return {"ok": True, "deleted": count, "user_id": user_id}
















