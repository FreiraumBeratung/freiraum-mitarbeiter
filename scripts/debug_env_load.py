#!/usr/bin/env python3
"""Debug-Skript: Prüft .env-Ladung"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Simuliere den Pfad wie in app.py
BASE_DIR = Path(__file__).resolve().parent.parent / "backend"
ENV_PATH = BASE_DIR / "config" / ".env"

print(f"[DEBUG] BASE_DIR: {BASE_DIR}")
print(f"[DEBUG] ENV_PATH: {ENV_PATH}")
print(f"[DEBUG] .env existiert: {ENV_PATH.exists()}")

if ENV_PATH.exists():
    print(f"\n[DEBUG] .env Inhalt:")
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()
        for i, line in enumerate(lines, 1):
            if "PASS" in line or "KEY" in line:
                print(f"  {i}: {line.split('=')[0]}=***")
            else:
                print(f"  {i}: {line.strip()}")
    
    print(f"\n[DEBUG] Lade .env...")
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    
    print(f"\n[DEBUG] Umgebungsvariablen nach load_dotenv():")
    vars_to_check = ["IMAP_HOST", "IMAP_USER", "IMAP_PASS", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"]
    for var in vars_to_check:
        value = os.getenv(var, "")
        if value:
            display = value if "PASS" not in var and "KEY" not in var else "***"
            print(f"  {var} = {display} (Länge: {len(value)})")
        else:
            print(f"  {var} = <LEER>")
else:
    print(f"[ERROR] .env nicht gefunden!")






















