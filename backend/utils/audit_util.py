from __future__ import annotations

from typing import Any, Dict, Optional
from ..audit_logger import get_logger

def audit(action: str, *, user_id: str = "denis", entity_type: str = None, entity_id: str = None, level: str = "info", payload: Dict[str, Any] = None):
    """Convenience function for manual audit logging from any service."""
    get_logger().log(
        action=action,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        level=level,
        payload=payload or {}
    )
















