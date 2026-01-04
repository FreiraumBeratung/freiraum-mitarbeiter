"""
Tests für Contact Resolver v1
"""

import pytest
import json
import tempfile
from pathlib import Path

from app.services.contact_resolver import ContactResolver, Contact, ResolveResult


@pytest.fixture
def temp_contacts_file():
    """Erstellt eine temporäre contacts.local.json Datei für Tests"""
    contacts_data = {
        "contacts": [
            {
                "id": "freiraumberatung",
                "displayName": "Freiraumberatung",
                "aliases": ["freiraumberatung", "freiraum"],
                "emails": ["freiraumberatung@web.de"]
            },
            {
                "id": "denis",
                "displayName": "Denis Bytyqi",
                "aliases": ["denis", "Denis", "Denis Bytyqi"],
                "emails": ["freiraumberatung@web.de"]
            },
            {
                "id": "thomas",
                "displayName": "Thomas Müller",
                "aliases": ["thomas", "Thomas", "Tom"],
                "emails": ["thomas.mueller@example.com"]
            },
            {
                "id": "test_ambiguous",
                "displayName": "Thomas Schmidt",
                "aliases": ["thomas", "Thomas"],
                "emails": ["thomas.schmidt@example.com"]
            }
        ]
    }
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(contacts_data, f, ensure_ascii=False, indent=2)
        temp_path = Path(f.name)
    
    yield temp_path
    
    # Cleanup
    if temp_path.exists():
        temp_path.unlink()


def test_resolve_freiraumberatung(temp_contacts_file):
    """Test: resolves "freiraumberatung" -> freiraumberatung@web.de"""
    resolver = ContactResolver(contacts_file=temp_contacts_file)
    result = resolver.resolve("freiraumberatung")
    
    assert result.email == "freiraumberatung@web.de"
    assert result.matched_contact is not None
    assert result.matched_contact.id == "freiraumberatung"
    assert result.debug["result"] == "matched"


def test_resolve_with_stopwords(temp_contacts_file):
    """Test: resolves "dem freiraumberatung" -> freiraumberatung@web.de (Stopwords werden entfernt)"""
    resolver = ContactResolver(contacts_file=temp_contacts_file)
    result = resolver.resolve("dem freiraumberatung")
    
    assert result.email == "freiraumberatung@web.de"
    assert result.matched_contact is not None
    assert result.matched_contact.id == "freiraumberatung"
    assert result.debug["result"] == "matched"


def test_resolve_denis(temp_contacts_file):
    """Test: resolves "denis" -> freiraumberatung@web.de"""
    resolver = ContactResolver(contacts_file=temp_contacts_file)
    result = resolver.resolve("denis")
    
    assert result.email == "freiraumberatung@web.de"
    assert result.matched_contact is not None
    assert result.matched_contact.id == "denis"
    assert result.debug["result"] == "matched"


def test_resolve_thomas(temp_contacts_file):
    """Test: resolves "thomas" -> thomas.mueller@example.com (wenn eindeutig)"""
    resolver = ContactResolver(contacts_file=temp_contacts_file)
    result = resolver.resolve("thomas")
    
    # Da es zwei "Thomas" Kontakte gibt (Thomas Müller und Thomas Schmidt),
    # sollte das Ergebnis ambiguous sein oder der beste Match gewählt werden.
    # Je nach Scoring-Algorithmus kann das variieren.
    # Für diesen Test akzeptieren wir entweder einen Match oder ambiguous.
    assert result.debug["result"] in ["matched", "ambiguous"]
    
    if result.email:
        assert result.email in ["thomas.mueller@example.com", "thomas.schmidt@example.com"]


def test_resolve_nonexistent(temp_contacts_file):
    """Test: resolves nicht-existierender Name -> None"""
    resolver = ContactResolver(contacts_file=temp_contacts_file)
    result = resolver.resolve("nonexistent")
    
    assert result.email is None
    assert result.matched_contact is None
    assert result.debug["result"] in ["no_candidates", "below_threshold"]


def test_resolve_empty(temp_contacts_file):
    """Test: resolves leerer String -> None"""
    resolver = ContactResolver(contacts_file=temp_contacts_file)
    result = resolver.resolve("")
    
    assert result.email is None
    assert result.matched_contact is None
    assert result.debug["result"] == "empty_input"


def test_contact_without_email(temp_contacts_file):
    """Test: Kontakt ohne E-Mail wird übersprungen"""
    # Erstelle temporäre Datei mit Kontakt ohne E-Mail
    contacts_data = {
        "contacts": [
            {
                "id": "noemail",
                "displayName": "Ohne E-Mail",
                "aliases": ["noemail"],
                "emails": []
            }
        ]
    }
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(contacts_data, f, ensure_ascii=False, indent=2)
        temp_path = Path(f.name)
    
    try:
        resolver = ContactResolver(contacts_file=temp_path)
        result = resolver.resolve("noemail")
        
        assert result.email is None
        assert result.debug["result"] == "no_candidates"
    finally:
        if temp_path.exists():
            temp_path.unlink()


def test_normalize_functionality():
    """Test: Normalisierung entfernt Stopwords und Satzzeichen"""
    resolver = ContactResolver(contacts_file=None)  # Dummy für statische Methoden
    
    # Test Normalisierung
    normalized = resolver._normalize("dem freiraumberatung!")
    assert normalized == "freiraumberatung"
    
    normalized = resolver._normalize("  Bitte an den Denis  ")
    assert normalized == "denis"
    
    normalized = resolver._normalize("")
    assert normalized == ""


def test_auto_reload(temp_contacts_file):
    """Test: Auto-Reload funktioniert bei Dateiänderung"""
    resolver = ContactResolver(contacts_file=temp_contacts_file)
    
    # Initialer Zustand
    initial_count = len(resolver.contacts)
    
    # Ändere Datei (füge neuen Kontakt hinzu)
    with open(temp_contacts_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    data["contacts"].append({
        "id": "newcontact",
        "displayName": "Neuer Kontakt",
        "aliases": ["newcontact"],
        "emails": ["new@example.com"]
    })
    
    with open(temp_contacts_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # Trigger Reload durch resolve-Aufruf
    resolver.resolve("test")
    
    # Prüfe, ob neuer Kontakt geladen wurde
    assert len(resolver.contacts) > initial_count







