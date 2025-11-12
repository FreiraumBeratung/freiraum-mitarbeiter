from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
import json, time, uuid, os, sys

# Import lead_tasks and lead_providers from backend root
# Adjust path: from backend/app/routers/lead_async.py to backend/lead_tasks.py
_backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)
try:
    from lead_tasks import SessionLocal, LeadTask, save_task, update_task, get_task
    from lead_providers import search_with_fallbacks, fetch_leads
except ImportError:
    # Fallback: try importing from backend module
    sys.path.insert(0, os.path.abspath(os.path.join(_backend_root, '..')))
    from backend.lead_tasks import SessionLocal, LeadTask, save_task, update_task, get_task
    from backend.lead_providers import search_with_fallbacks, fetch_leads

from app.services.lead_pipeline import run_real



router = APIRouter(tags=["lead_hunter_async"])



class HuntParams(BaseModel):

    category: str

    location: str

    count: int = 20

    save_to_db: bool = True

    export_excel: bool = True

    outreach: bool = False



def _do_hunt(task_id: str, p: HuntParams):

    sess = SessionLocal()

    try:

        t = sess.get(LeadTask, task_id)

        if not t: return

        t.status = "running"; t.progress = 5.0; save_task(sess,t)

        query = f'{p.category} {p.location} kontakt email telefon'

        links = search_with_fallbacks(query, limit=max(p.count*3, 30), per_provider=20, timeout=20)

        update_task(task_id, progress=25.0)

        leads = fetch_leads(links, timeout=15, limit=max(p.count*2,50))

        # cut to requested count

        leads = leads[:p.count]

        update_task(task_id, progress=70.0)

        # optional: save to DB (reuse existing leads flow if present)

        result = {"found": len(leads), "leads": leads}

        # optional Excel export

        if p.export_excel:

            from openpyxl import Workbook

            from datetime import datetime

            data_dir = os.environ.get("FREIRAUM_DATA_DIR") or "data"

            exp_dir = os.path.join(data_dir, "exports"); os.makedirs(exp_dir, exist_ok=True)

            ts = datetime.now().strftime("%Y%m%d_%H%M%S")

            path = os.path.join(exp_dir, f"leads_async_{ts}.xlsx")

            wb = Workbook(); ws = wb.active; ws.title="leads"

            ws.append(["name","domain","email","phone","source"])

            for l in leads: ws.append([l.get("name"),l.get("domain"),l.get("email"),l.get("phone"),l.get("source")])

            wb.save(path)

            result["excel"] = path

        update_task(task_id, progress=95.0, result=json.dumps(result), status="done")

    except Exception as e:

        update_task(task_id, status="error", error=str(e))

    finally:

        sess.close()



@router.post("/lead_hunter/hunt_async")

def hunt_async(p: HuntParams, bg: BackgroundTasks):

    sess = SessionLocal()

    t = LeadTask(id=str(uuid.uuid4()), status="queued", progress=0.0, params=p.json())

    save_task(sess, t); sess.close()

    bg.add_task(_do_hunt, t.id, p)

    return {"ok": True, "task_id": t.id}


class RunRealIn(BaseModel):

    category: str = ""

    location: str = ""


@router.post("/lead_hunter/run_real")

async def run_real_now(inp: RunRealIn):

    real_mode = os.getenv("REAL_MODE", "off").lower()

    if real_mode not in {"on", "true", "1", "yes"}:

        raise HTTPException(

            status_code=400,

            detail="REAL_MODE disabled. Set REAL_MODE=on in backend/.env and restart backend.",

        )

    export_paths = await run_real(inp.category, inp.location)

    return {"ok": True, "export": export_paths}



@router.get("/lead_hunter/task/{task_id}")

def hunt_status(task_id: str):

    t = get_task(task_id)

    if not t: return {"ok": False, "status": "not_found"}

    return {

        "ok": True,

        "id": t.id,

        "status": t.status,

        "progress": t.progress,

        "result": json.loads(t.result) if t.result else None,

        "error": t.error

    }



@router.post("/lead_hunter/cancel/{task_id}")

def hunt_cancel(task_id: str):

    # cooperative cancel (marks as canceled; worker checks not implemented here)

    update_task(task_id, status="canceled")

    return {"ok": True}

