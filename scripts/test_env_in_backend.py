#!/usr/bin/env python3
"""Test: Simuliere Backend-Start und prüfe .env-Ladung"""
import sys
from pathlib import Path

# Füge backend zum Path hinzu
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir.parent))

# Jetzt können wir backend.module importieren
from backend import app
import os

print("\n=== Test: Umgebungsvariablen nach app-Import ===")
vars_to_check = ["IMAP_HOST", "IMAP_USER", "IMAP_PASS", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"]
for var in vars_to_check:
    value = os.getenv(var, "")
    if value:
        display = value if "PASS" not in var and "KEY" not in var else f"*** ({len(value)} Zeichen)"
        print(f"  {var} = {display}")
    else:
        print(f"  {var} = <LEER>")

print("\n=== Test: Direkte Prüfung der .env ===")
from dotenv import load_dotenv
env_path = backend_dir / "config" / ".env"
print(f"ENV_PATH: {env_path}")
print(f"Existiert: {env_path.exists()}")

if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
    print("Nach load_dotenv(override=True):")
    for var in vars_to_check:
        value = os.getenv(var, "")
        if value:
            display = value if "PASS" not in var and "KEY" not in var else f"*** ({len(value)} Zeichen)"
            print(f"  {var} = {display}")
        else:
            print(f"  {var} = <LEER>")






















