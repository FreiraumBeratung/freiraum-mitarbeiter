#!/usr/bin/env python3
"""Direkter Test der Mail-Check-Funktion"""
import sys
from pathlib import Path

# Füge backend zum Path hinzu
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir.parent))

# Lade .env explizit
from dotenv import load_dotenv
import os

env_path = backend_dir / "config" / ".env"
print(f"Lade .env von: {env_path}")
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
    print("[OK] .env geladen")

# Prüfe Werte
print("\nUmgebungsvariablen:")
vars_to_check = ["IMAP_HOST", "IMAP_USER", "IMAP_PASS", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"]
for var in vars_to_check:
    value = os.getenv(var, "")
    if value:
        print(f"  {var} = {'***' if 'PASS' in var or 'KEY' in var else value} (Länge: {len(value)})")
    else:
        print(f"  {var} = <LEER>")

# Teste Mail-Check direkt
print("\n=== Teste Mail-Check-Funktionen ===")
from backend.mail import _imap_ok, _smtp_ok

imap_ok, imap_reason = _imap_ok()
smtp_ok, smtp_reason = _smtp_ok()

print(f"IMAP: ok={imap_ok}, reason={imap_reason}")
print(f"SMTP: ok={smtp_ok}, reason={smtp_reason}")

if imap_ok and smtp_ok:
    print("\n[SUCCESS] Mail-Check erfolgreich!")
else:
    print("\n[FAIL] Mail-Check fehlgeschlagen!")

