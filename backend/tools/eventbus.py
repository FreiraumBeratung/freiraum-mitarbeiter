# === FILE: backend/tools/eventbus.py ===
from typing import Callable, Dict, List

class _EventBus:
    def __init__(self):
        self._subs: Dict[str, List[Callable]] = {}

    def subscribe(self, event: str, handler: Callable):
        self._subs.setdefault(event, []).append(handler)

    def publish(self, event: str, payload: dict):
        for h in self._subs.get(event, []):
            try:
                h(payload)
            except Exception:
                # bewusst leise im Dev
                pass

bus = _EventBus()
# === END FILE ===




















