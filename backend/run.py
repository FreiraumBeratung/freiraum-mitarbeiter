import os, sys, pathlib
import uvicorn

# Port aus ENV (Fallback 30521)
PORT = int(os.getenv("BACKEND_PORT", "30521"))

# Projekt-Root auf sys.path legen (damit 'backend.app' importierbar ist)
BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Uvicorn starten und explizit das Paketmodul adressieren
uvicorn.run("backend.app.main:app", host="0.0.0.0", port=PORT, reload=False)


