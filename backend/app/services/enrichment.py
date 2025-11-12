import re
import httpx
from typing import List, Dict, Optional
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup


def fetch_impressum_links(website_url: str) -> Optional[str]:
    """Finde Impressum-URL auf einer Website"""
    if not website_url or not website_url.startswith(("http://", "https://")):
        return None
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        with httpx.Client(timeout=10.0, headers=headers, follow_redirects=True) as client:
            # Versuche Hauptseite
            response = client.get(website_url)
            if response.status_code != 200:
                return None
            
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Suche nach Impressum-Links
            impressum_keywords = ["impressum", "imprint", "legal", "rechtliches", "kontakt", "contact"]
            
            # Suche in Links
            for link in soup.find_all("a", href=True):
                href = link.get("href", "").lower()
                text = link.get_text().lower()
                if any(keyword in href or keyword in text for keyword in impressum_keywords):
                    impressum_url = urljoin(website_url, link["href"])
                    return impressum_url
            
            # Versuche direkte Impressum-URLs
            base_url = f"{urlparse(website_url).scheme}://{urlparse(website_url).netloc}"
            common_paths = ["/impressum", "/imprint", "/legal", "/rechtliches", "/kontakt", "/contact"]
            for path in common_paths:
                try:
                    test_url = urljoin(base_url, path)
                    test_response = client.get(test_url, timeout=5.0)
                    if test_response.status_code == 200:
                        return test_url
                except Exception:
                    continue
    except Exception:
        pass
    
    return None


def extract_contacts_from_page(url: str) -> Dict[str, Optional[str]]:
    """Extrahiere Kontaktdaten von einer Seite"""
    result = {"phone": None, "email": None}
    
    if not url:
        return result
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        with httpx.Client(timeout=10.0, headers=headers, follow_redirects=True) as client:
            response = client.get(url)
            if response.status_code != 200:
                return result
            
            text = response.text
            soup = BeautifulSoup(text, "html.parser")
            page_text = soup.get_text()
            
            # Telefonnummer Regex
            phone_pattern = r'\+?\d[\d\s\/\-\(\)]{6,}'
            phone_matches = re.findall(phone_pattern, page_text)
            if phone_matches:
                # Nimm die erste gefundene Nummer
                phone = phone_matches[0].strip()
                # Bereinige
                phone = re.sub(r'[\s\(\)]', '', phone)
                result["phone"] = phone
            
            # Email Regex
            email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
            email_matches = re.findall(email_pattern, page_text)
            if email_matches:
                # Filtere typische Nicht-Email-Adressen
                valid_emails = [e for e in email_matches if not any(
                    skip in e.lower() for skip in ["example.com", "test.com", "domain.com", "image", "logo"]
                )]
                if valid_emails:
                    result["email"] = valid_emails[0]
            
            # Suche auch in mailto-Links
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                if href.startswith("mailto:"):
                    email = href.replace("mailto:", "").split("?")[0]
                    if email:
                        result["email"] = email
                        break
    except Exception:
        pass
    
    return result


def normalize_phone_e164(phone: str) -> str:
    """Normalisiere Telefonnummer nach E.164, wenn möglich"""
    if not phone:
        return phone
    
    # Entferne alle Nicht-Ziffern außer +
    cleaned = re.sub(r'[^\d+]', '', phone)
    
    # Wenn mit + beginnt, behalte es
    if cleaned.startswith("+"):
        # Prüfe auf gültige Ländervorwahl (1-3 Ziffern)
        if len(cleaned) >= 8 and len(cleaned) <= 15:
            return cleaned
    else:
        # Versuche deutsche Nummer zu erkennen
        if cleaned.startswith("0"):
            # Ersetze 0 durch +49
            cleaned = "+49" + cleaned[1:]
            if len(cleaned) >= 10 and len(cleaned) <= 15:
                return cleaned
        elif len(cleaned) >= 10:
            # Vermutlich deutsche Nummer ohne Vorwahl
            cleaned = "+49" + cleaned
            if len(cleaned) <= 15:
                return cleaned
    
    # Fallback: Original zurückgeben
    return phone


def enrich_leads(leads: List[Dict]) -> List[Dict]:
    """Bereichere Leads mit Kontaktdaten aus Impressum"""
    import logging
    logger = logging.getLogger(__name__)
    
    enriched = []
    
    for lead in leads:
        enriched_lead = lead.copy()
        # Behalte bestehenden source oder setze auf enriched
        existing_source = enriched_lead.get("source", "osm")
        enriched_lead["source"] = f"{existing_source}/enriched" if existing_source != "enriched" else "enriched"
        
        # Initialisiere Proof-Links
        enriched_lead["proof_contact_url"] = None
        enriched_lead["proof_impressum_url"] = None
        
        website = lead.get("website", "")
        if website and not website.startswith(("http://", "https://")):
            website = f"https://{website}"
        
        # Versuche Impressum zu finden
        impressum_url = None
        if website:
            try:
                impressum_url = fetch_impressum_links(website)
                enriched_lead["proof_impressum_url"] = impressum_url
            except Exception as e:
                logger.warning(f"Impressum nicht gefunden für {website}: {e}")
                enriched_lead["proof_impressum_url"] = None
        
        # Wenn noch keine Kontaktdaten vorhanden
        if not enriched_lead.get("phone") or not enriched_lead.get("email"):
            # Extrahiere Kontaktdaten
            contacts = {"phone": None, "email": None}
            contact_url = None
            
            if impressum_url:
                try:
                    contacts = extract_contacts_from_page(impressum_url)
                    contact_url = impressum_url
                except Exception:
                    pass
            
            if (not contacts.get("phone") and not contacts.get("email")) and website:
                try:
                    contacts = extract_contacts_from_page(website)
                    contact_url = website
                except Exception:
                    pass
            
            # Setze Proof-Contact-URL
            if contact_url:
                enriched_lead["proof_contact_url"] = contact_url
            
            # Überschreibe nur wenn noch nicht vorhanden
            if not enriched_lead.get("phone") and contacts.get("phone"):
                enriched_lead["phone"] = normalize_phone_e164(contacts["phone"])
            
            if not enriched_lead.get("email") and contacts.get("email"):
                enriched_lead["email"] = contacts["email"]
        
        # Normalisiere vorhandene Telefonnummer
        if enriched_lead.get("phone"):
            enriched_lead["phone"] = normalize_phone_e164(enriched_lead["phone"])
        
        # Stelle sicher, dass alle erforderlichen Felder vorhanden sind
        required_fields = ["company", "category", "city", "street", "postcode", "phone", "email", "website", "score", "source", "lat", "lon"]
        for field in required_fields:
            if field not in enriched_lead:
                if field == "score":
                    enriched_lead[field] = 0
                elif field in ["lat", "lon"]:
                    enriched_lead[field] = None
                else:
                    enriched_lead[field] = ""
        
        enriched.append(enriched_lead)
    
    return enriched

