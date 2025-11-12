#!/usr/bin/env python3
"""Prüfe, ob die .env beim Backend-Start geladen wird"""
import os
import sys
from pathlib import Path

# Simuliere den Backend-Start-Pfad
backend_dir = Path(__file__).resolve().parent.parent / "backend"
os.chdir(backend_dir)

print(f"[DEBUG] Arbeitsverzeichnis: {os.getcwd()}")
print(f"[DEBUG] __file__ Verzeichnis: {backend_dir}")

# Teste den ENV_PATH wie in app.py
ENV_PATH = backend_dir / "config" / ".env"
print(f"[DEBUG] ENV_PATH: {ENV_PATH}")
print(f"[DEBUG] ENV_PATH.exists(): {ENV_PATH.exists()}")

if ENV_PATH.exists():
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    print(f"[OK] .env geladen")
    
    # Prüfe Werte
    imap_host = os.getenv("IMAP_HOST", "")
    imap_user = os.getenv("IMAP_USER", "")
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_user = os.getenv("SMTP_USER", "")
    
    print(f"\n[Umgebungsvariablen]")
    print(f"  IMAP_HOST: {imap_host if imap_host else '<LEER>'}")
    print(f"  IMAP_USER: {imap_user if imap_user else '<LEER>'}")
    print(f"  SMTP_HOST: {smtp_host if smtp_host else '<LEER>'}")
    print(f"  SMTP_USER: {smtp_user if smtp_user else '<LEER>'}")
    
    if imap_host and imap_user and smtp_host and smtp_user:
        print(f"\n[SUCCESS] Alle Mail-Credentials geladen!")
    else:
        print(f"\n[ERROR] Einige Mail-Credentials fehlen!")
else:
    print(f"[ERROR] .env-Datei nicht gefunden!")











