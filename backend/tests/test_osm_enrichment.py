import pytest
from app.services.enrichment import (
    normalize_phone_e164,
    extract_contacts_from_page,
    fetch_impressum_links,
    enrich_leads,
)


def test_normalize_phone_e164():
    """Test E.164 phone normalization"""
    assert normalize_phone_e164("0123456789") == "+49123456789"
    assert normalize_phone_e164("+49 123 456789") == "+49123456789"
    assert normalize_phone_e164("+49123456789") == "+49123456789"
    assert normalize_phone_e164("") == ""


def test_enrich_leads_empty():
    """Test enrichment with empty leads"""
    result = enrich_leads([])
    assert result == []


def test_enrich_leads_basic():
    """Test enrichment with basic lead data"""
    leads = [
        {
            "company": "Test GmbH",
            "city": "Arnsberg",
            "website": "https://example.com",
        }
    ]
    result = enrich_leads(leads)
    assert len(result) == 1
    assert result[0]["company"] == "Test GmbH"
    assert result[0]["source"] == "enriched"


def test_enrich_leads_with_phone():
    """Test enrichment preserves existing phone"""
    leads = [
        {
            "company": "Test GmbH",
            "phone": "+49123456789",
            "city": "Arnsberg",
        }
    ]
    result = enrich_leads(leads)
    assert result[0]["phone"] == "+49123456789"


@pytest.mark.skip(reason="Requires network access")
def test_fetch_impressum_links():
    """Test Impressum link fetching (requires network)"""
    # This would require a real website
    pass


@pytest.mark.skip(reason="Requires network access")
def test_extract_contacts_from_page():
    """Test contact extraction from page (requires network)"""
    # This would require a real website
    pass


