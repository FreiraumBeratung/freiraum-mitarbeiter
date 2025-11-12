import logging, logging.handlers, os, pathlib

BASE = pathlib.Path(__file__).resolve().parent
LOGS = (BASE.parent / "logs"); LOGS.mkdir(parents=True, exist_ok=True)
LOGFILE = LOGS / "app.log"

def setup_logging():
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    # Remove existing handlers (for reload-safe)
    for h in list(logger.handlers):
        logger.removeHandler(h)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s :: %(message)s")
    fh = logging.handlers.RotatingFileHandler(LOGFILE, maxBytes=1_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(fh); logger.addHandler(ch)
    logging.getLogger("uvicorn").propagate = True
    logging.getLogger("uvicorn.error").propagate = True
    return LOGFILE

