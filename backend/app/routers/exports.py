from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
import json

router = APIRouter(prefix="/api/exports", tags=["exports"])


def _resolve_export_dir() -> Path:
    configured = os.getenv("EXPORT_DIR", "backend/data/exports")
    path = Path(configured)
    if not path.is_absolute():
        backend_root = Path(__file__).resolve().parents[2]
        path = (backend_root / configured).resolve()
    return path


@router.get("/list")
def list_exports():
    directory = _resolve_export_dir()
    if not directory.exists():
        return {"ok": True, "files": []}

    files: List[Path] = [
        entry
        for entry in directory.iterdir()
        if entry.is_file() and entry.suffix.lower() in {".csv", ".xlsx", ".json", ".md"}
    ]
    files.sort(key=lambda item: item.stat().st_mtime, reverse=True)
    files = files[:10]

    payload = []
    for entry in files:
        stats = entry.stat()
        payload.append(
            {
                "name": entry.name,
                "path": str(entry),
                "size": stats.st_size,
                "modified": datetime.fromtimestamp(stats.st_mtime).isoformat(),
            }
        )

    return {"ok": True, "count": len(payload), "files": payload}


@router.get("/{fname}")
def get_export(fname: str):
    """Liefert eine einzelne Export-Datei zurück."""
    directory = _resolve_export_dir()
    if not directory.exists():
        raise HTTPException(status_code=404, detail="Export directory not found")
    
    file_path = directory / fname
    
    # Sicherheitsprüfung: Verhindere Path Traversal
    try:
        file_path.resolve().relative_to(directory.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid file path")
    
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Für JSON-Dateien: Direkt als JSON zurückgeben
    if file_path.suffix.lower() == ".json":
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return JSONResponse(content=data)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Invalid JSON file")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")
    
    # Für andere Dateitypen: Als FileResponse zurückgeben
    media_type_map = {
        ".csv": "text/csv",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".md": "text/markdown",
    }
    media_type = media_type_map.get(file_path.suffix.lower(), "application/octet-stream")
    
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=fname,
    )



