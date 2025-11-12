from __future__ import annotations

import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

_logger = logging.getLogger(__name__)
_scheduler: Optional[BackgroundScheduler] = None


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone="Europe/Berlin")
    return _scheduler


def _heartbeat():
    _logger.debug("scheduler heartbeat ok")


def start_scheduler() -> BackgroundScheduler:
    scheduler = get_scheduler()
    if not scheduler.running:
        if not scheduler.get_job("app-heartbeat"):
            scheduler.add_job(
                _heartbeat,
                IntervalTrigger(minutes=1),
                id="app-heartbeat",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
            )
        scheduler.start()
        _logger.info("Scheduler started")
    return scheduler


def shutdown_scheduler() -> None:
    scheduler = _scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        _logger.info("Scheduler stopped")









