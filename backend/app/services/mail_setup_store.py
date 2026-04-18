from __future__ import annotations

import json
import os
import threading
import time
import base64
import ctypes
from ctypes import wintypes
from pathlib import Path
from typing import Any


DEFAULT_STATE: dict[str, Any] = {
    "provider": None,  # "graph" | "imap_smtp" | None
    "onboarding_complete": False,
    "imap": {},
    "smtp": {},
    "updated_at": None,
}


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _protect_secret(value: str) -> str:
    if not value:
        return value
    if os.name != "nt":
        return value
    try:
        raw = value.encode("utf-8")
        in_buffer = (ctypes.c_byte * len(raw)).from_buffer_copy(raw)
        data_in = _DataBlob(len(raw), in_buffer)
        data_out = _DataBlob()
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32
        ok = crypt32.CryptProtectData(
            ctypes.byref(data_in),
            "freiraum-mail-secret",
            None,
            None,
            None,
            0,
            ctypes.byref(data_out),
        )
        if not ok:
            return value
        try:
            out_bytes = ctypes.string_at(data_out.pbData, data_out.cbData)
            encoded = base64.b64encode(out_bytes).decode("ascii")
            return f"dpapi:{encoded}"
        finally:
            if data_out.pbData:
                kernel32.LocalFree(data_out.pbData)
    except Exception:
        return value


def _unprotect_secret(value: str) -> str:
    if not value:
        return value
    if not value.startswith("dpapi:") or os.name != "nt":
        return value
    payload = value.split(":", 1)[1]
    try:
        raw = base64.b64decode(payload.encode("ascii"))
        in_buffer = (ctypes.c_byte * len(raw)).from_buffer_copy(raw)
        data_in = _DataBlob(len(raw), in_buffer)
        data_out = _DataBlob()
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32
        ok = crypt32.CryptUnprotectData(
            ctypes.byref(data_in),
            None,
            None,
            None,
            None,
            0,
            ctypes.byref(data_out),
        )
        if not ok:
            return ""
        try:
            out_bytes = ctypes.string_at(data_out.pbData, data_out.cbData)
            return out_bytes.decode("utf-8", errors="replace")
        finally:
            if data_out.pbData:
                kernel32.LocalFree(data_out.pbData)
    except Exception:
        return ""


def _state_file_path() -> Path:
    configured = (os.getenv("FM_MAIL_SETUP_FILE") or "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "data" / "cache" / "mail_setup_state.json"


class MailSetupStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._path = _state_file_path()
        self._state = self._load()

    def _snapshot_state_no_lock(self) -> dict[str, Any]:
        state = dict(self._state)
        state["imap"] = dict(self._state.get("imap") or {})
        state["smtp"] = dict(self._state.get("smtp") or {})
        return state

    def _load(self) -> dict[str, Any]:
        if not self._path.exists():
            return dict(DEFAULT_STATE)
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                return dict(DEFAULT_STATE)
            state = dict(DEFAULT_STATE)
            state.update(raw)
            if not isinstance(state.get("imap"), dict):
                state["imap"] = {}
            if not isinstance(state.get("smtp"), dict):
                state["smtp"] = {}
            if state["imap"].get("password"):
                state["imap"]["password"] = _unprotect_secret(str(state["imap"]["password"]))
            if state["smtp"].get("password"):
                state["smtp"]["password"] = _unprotect_secret(str(state["smtp"]["password"]))
            return state
        except Exception:
            return dict(DEFAULT_STATE)

    def get_state(self) -> dict[str, Any]:
        with self._lock:
            return self._snapshot_state_no_lock()

    def set_provider(self, provider: str) -> dict[str, Any]:
        if provider not in {"graph", "imap_smtp"}:
            raise ValueError("provider must be 'graph' or 'imap_smtp'")
        with self._lock:
            self._state["provider"] = provider
            self._state["updated_at"] = int(time.time())
            self._save()
            return self._snapshot_state_no_lock()

    def set_imap_smtp_credentials(
        self,
        *,
        imap_host: str,
        imap_port: int,
        imap_user: str,
        imap_password: str,
        smtp_host: str,
        smtp_port: int,
        smtp_user: str,
        smtp_password: str,
        smtp_use_tls: bool,
        smtp_use_ssl: bool,
    ) -> dict[str, Any]:
        with self._lock:
            self._state["imap"] = {
                "host": imap_host.strip(),
                "port": int(imap_port),
                "user": imap_user.strip(),
                "password": imap_password,
            }
            self._state["smtp"] = {
                "host": smtp_host.strip(),
                "port": int(smtp_port),
                "user": smtp_user.strip(),
                "password": smtp_password,
                "use_tls": bool(smtp_use_tls),
                "use_ssl": bool(smtp_use_ssl),
            }
            self._state["provider"] = "imap_smtp"
            self._state["onboarding_complete"] = True
            self._state["updated_at"] = int(time.time())
            self._save()
            return self._snapshot_state_no_lock()

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = dict(self._state)
        payload["imap"] = dict(self._state.get("imap") or {})
        payload["smtp"] = dict(self._state.get("smtp") or {})
        if payload["imap"].get("password"):
            payload["imap"]["password"] = _protect_secret(str(payload["imap"]["password"]))
        if payload["smtp"].get("password"):
            payload["smtp"]["password"] = _protect_secret(str(payload["smtp"]["password"]))
        self._path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")

    def set_onboarding_complete(self, complete: bool) -> dict[str, Any]:
        with self._lock:
            self._state["onboarding_complete"] = bool(complete)
            self._state["updated_at"] = int(time.time())
            self._save()
            return self._snapshot_state_no_lock()

    def clear(self) -> dict[str, Any]:
        with self._lock:
            self._state = dict(DEFAULT_STATE)
            self._save()
            return self._snapshot_state_no_lock()


_STORE: MailSetupStore | None = None


def get_mail_setup_store() -> MailSetupStore:
    global _STORE
    if _STORE is None:
        _STORE = MailSetupStore()
    return _STORE

