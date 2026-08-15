from __future__ import annotations

import os

from .account_registry import get_account_registry
from .account_session import get_current_account_id


def admin_email() -> str:
    return (os.getenv("FREIRAUM_ADMIN_EMAIL") or "").strip().lower()


def admin_key() -> str:
    return (os.getenv("FM_ADMIN_KEY") or "").strip()


def current_account_is_admin() -> bool:
    expected = admin_email()
    if not expected or "@" not in expected:
        return False
    account_id = get_current_account_id()
    if not account_id:
        return False
    try:
        account = get_account_registry().get(account_id)
    except Exception:
        return False
    if not account:
        return False
    return (account.get("email") or "").strip().lower() == expected
