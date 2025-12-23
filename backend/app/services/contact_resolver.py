"""
Contact Resolver v1 für Freiraum-Mitarbeiter

Löst Namen ohne E-Mail-Adresse lokal aus /config/contacts.local.json auf.
Deterministischer Matching-Algorithmus mit Scoring.
"""

import json
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Stopwords, die entfernt werden sollen
STOPWORDS = {
    "dem", "den", "der", "die", "das",
    "einem", "einen", "einer", "eine",
    "bitte", "mal", "kurz", "eben", "noch",
    "an", "für", "von", "zu", "mit", "in", "auf"
}

# Threshold und Unterschieds-Minimum für eindeutiges Matching
MIN_SCORE_THRESHOLD = 0.72
MIN_SCORE_DIFF = 0.08


@dataclass
class Contact:
    """Kontakt-Datensatz"""
    id: str
    display_name: str
    aliases: List[str]
    emails: List[str]


@dataclass
class ResolveResult:
    """Ergebnis einer Contact-Resolution"""
    email: Optional[str]
    matched_contact: Optional[Contact]
    debug: Dict


class ContactResolver:
    """Service zum Auflösen von Namen in E-Mail-Adressen"""
    
    def __init__(self, contacts_file: Optional[Path] = None):
        """
        Initialisiert den Contact Resolver.
        
        Args:
            contacts_file: Pfad zur contacts.local.json (default: /config/contacts.local.json relativ zum Projekt-Root)
        """
        # Projekt-Root finden (3 Ebenen hoch von backend/app/services/contact_resolver.py)
        if contacts_file is None:
            project_root = Path(__file__).resolve().parents[3]
            contacts_file = project_root / "config" / "contacts.local.json"
        
        self.contacts_file = Path(contacts_file)
        self.contacts: List[Contact] = []
        self._last_mtime: float = 0.0
        
        # Initiales Laden
        self._load_contacts()
        
        logger.info(
            f"contacts.local.json loaded: {len(self.contacts)} contacts (path={self.contacts_file})"
        )
    
    def _load_contacts(self) -> None:
        """Lädt Kontakte aus der JSON-Datei"""
        if not self.contacts_file.exists():
            logger.warning(f"contacts.local.json nicht gefunden: {self.contacts_file}")
            self.contacts = []
            self._last_mtime = 0.0
            return
        
        try:
            with open(self.contacts_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Unterstütze beide Formate: Root-Array oder Root-Objekt mit "contacts"
            if isinstance(data, list):
                contacts_raw = data
            elif isinstance(data, dict):
                contacts_raw = data.get("contacts", [])
            else:
                logger.warning(f"contacts.local.json hat unerwartetes Format (weder Array noch Objekt): {type(data)}")
                contacts_raw = []
            
            # Validierung: contacts_raw muss eine Liste sein
            if not isinstance(contacts_raw, list):
                logger.warning(f"contacts_raw ist keine Liste: {type(contacts_raw)}")
                contacts_raw = []
            
            self.contacts = []
            
            for c in contacts_raw:
                # Validierung
                if not isinstance(c, dict):
                    logger.warning(f"Ungültiger Kontakt-Eintrag (nicht dict): {c}")
                    continue
                
                contact_id = c.get("id", "")
                display_name = c.get("displayName", "")
                aliases = c.get("aliases", [])
                emails = c.get("emails", [])
                
                if not contact_id or not display_name:
                    logger.warning(f"Kontakt ohne id oder displayName übersprungen: {c}")
                    continue
                
                if not isinstance(aliases, list):
                    aliases = []
                if not isinstance(emails, list):
                    emails = []
                
                self.contacts.append(Contact(
                    id=contact_id,
                    display_name=display_name,
                    aliases=aliases if aliases else [],
                    emails=emails if emails else []
                ))
            
            # mtime speichern für Auto-Reload
            self._last_mtime = self.contacts_file.stat().st_mtime
            
            logger.info(f"Loaded {len(self.contacts)} contacts from {self.contacts_file}")
            
        except json.JSONDecodeError as e:
            logger.error(f"Fehler beim Parsen von contacts.local.json: {e}")
            self.contacts = []
        except Exception as e:
            logger.error(f"Fehler beim Laden von contacts.local.json: {e}", exc_info=True)
            self.contacts = []
    
    def _check_reload(self) -> None:
        """Prüft, ob die Datei geändert wurde und lädt sie neu"""
        if not self.contacts_file.exists():
            return
        
        try:
            current_mtime = self.contacts_file.stat().st_mtime
            if current_mtime > self._last_mtime:
                logger.info(f"contacts.local.json wurde geändert, lade neu...")
                self._load_contacts()
        except Exception as e:
            logger.warning(f"Fehler beim Prüfen der mtime: {e}")
    
    @staticmethod
    def _normalize(text: str) -> str:
        """
        Normalisiert einen Text für Matching:
        - lowercase
        - trim
        - Satzzeichen entfernen
        - Stopwords entfernen
        """
        if not text:
            return ""
        
        # lowercase und trim
        normalized = text.lower().strip()
        
        # Satzzeichen entfernen
        normalized = re.sub(r'[^\w\s]', '', normalized)
        
        # Stopwords entfernen
        words = normalized.split()
        words = [w for w in words if w not in STOPWORDS]
        
        return " ".join(words).strip()
    
    @staticmethod
    def _jaccard_similarity(tokens1: set, tokens2: set) -> float:
        """Berechnet Jaccard-Ähnlichkeit zwischen zwei Token-Sets"""
        if not tokens1 and not tokens2:
            return 1.0
        if not tokens1 or not tokens2:
            return 0.0
        
        intersection = len(tokens1 & tokens2)
        union = len(tokens1 | tokens2)
        
        return intersection / union if union > 0 else 0.0
    
    @staticmethod
    def _prefix_match(text1: str, text2: str) -> float:
        """
        Prüft Prefix-Match (ein Text ist Prefix des anderen oder umgekehrt).
        Gibt Boost-Score zurück (0.0 oder 0.15).
        """
        if not text1 or not text2:
            return 0.0
        
        norm1 = text1.strip().lower()
        norm2 = text2.strip().lower()
        
        if norm1.startswith(norm2) or norm2.startswith(norm1):
            return 0.15
        
        return 0.0
    
    def _score_match(self, input_normalized: str, candidate: Contact) -> float:
        """
        Berechnet einen Match-Score zwischen Input und Kandidat.
        
        Returns:
            Score zwischen 0.0 und 1.0 (1.0 = exakter Match)
        """
        # Token-Sets für Jaccard
        input_tokens = set(input_normalized.split())
        
        # Kandidaten-Felder sammeln
        candidate_fields = [candidate.display_name.lower()]
        candidate_fields.extend([alias.lower() for alias in candidate.aliases])
        
        best_score = 0.0
        
        for field in candidate_fields:
            field_normalized = self._normalize(field)
            field_tokens = set(field_normalized.split())
            
            # Exakter Match
            if input_normalized == field_normalized:
                return 1.0
            
            # Jaccard-Similarity
            jaccard = self._jaccard_similarity(input_tokens, field_tokens)
            
            # Prefix-Match Boost
            prefix_boost = self._prefix_match(input_normalized, field_normalized)
            
            # Gesamt-Score
            score = jaccard + prefix_boost
            
            # Clamp auf 1.0
            score = min(score, 1.0)
            
            if score > best_score:
                best_score = score
        
        return best_score
    
    def resolve(self, to_name: str) -> ResolveResult:
        """
        Löst einen Namen in eine E-Mail-Adresse auf.
        
        Args:
            to_name: Der Name, der aufgelöst werden soll (z.B. "Thomas", "dem freiraumberatung")
        
        Returns:
            ResolveResult mit email, matched_contact und debug-Info
        """
        # Auto-Reload prüfen
        self._check_reload()
        
        debug_info = {
            "inputName": to_name,
            "normalizedInput": None,
            "candidatesScored": [],
            "topScore": None,
            "secondScore": None,
            "threshold": MIN_SCORE_THRESHOLD,
            "minDiff": MIN_SCORE_DIFF,
            "result": None
        }
        
        if not to_name or not to_name.strip():
            debug_info["result"] = "empty_input"
            return ResolveResult(email=None, matched_contact=None, debug=debug_info)
        
        # Normalisieren
        normalized_input = self._normalize(to_name)
        debug_info["normalizedInput"] = normalized_input
        
        if not normalized_input:
            debug_info["result"] = "normalized_empty"
            return ResolveResult(email=None, matched_contact=None, debug=debug_info)
        
        # Alle Kandidaten scoren
        scored_candidates = []
        
        for contact in self.contacts:
            # Überspringe Kontakte ohne E-Mail
            if not contact.emails or len(contact.emails) == 0:
                continue
            
            score = self._score_match(normalized_input, contact)
            
            scored_candidates.append({
                "contact": contact,
                "score": score
            })
        
        # Sortiere nach Score (höchster zuerst)
        scored_candidates.sort(key=lambda x: x["score"], reverse=True)
        
        # Debug-Info sammeln
        debug_info["candidatesScored"] = [
            {
                "id": c["contact"].id,
                "displayName": c["contact"].display_name,
                "score": c["score"]
            }
            for c in scored_candidates[:5]  # Top 5 für Debug
        ]
        
        if not scored_candidates:
            debug_info["result"] = "no_candidates"
            return ResolveResult(email=None, matched_contact=None, debug=debug_info)
        
        top_score = scored_candidates[0]["score"]
        second_score = scored_candidates[1]["score"] if len(scored_candidates) > 1 else None
        
        debug_info["topScore"] = top_score
        debug_info["secondScore"] = second_score
        
        # Prüfe Threshold
        if top_score < MIN_SCORE_THRESHOLD:
            debug_info["result"] = "below_threshold"
            return ResolveResult(email=None, matched_contact=None, debug=debug_info)
        
        # Prüfe Eindeutigkeit
        if second_score is not None:
            score_diff = top_score - second_score
            if score_diff < MIN_SCORE_DIFF:
                debug_info["result"] = "ambiguous"
                return ResolveResult(email=None, matched_contact=None, debug=debug_info)
        
        # Match gefunden!
        matched_contact = scored_candidates[0]["contact"]
        email = matched_contact.emails[0]  # Erste E-Mail verwenden
        
        debug_info["result"] = "matched"
        
        logger.info(
            f"Contact resolved: '{to_name}' -> '{email}' "
            f"(matched: {matched_contact.id}, score: {top_score:.2f})"
        )
        
        return ResolveResult(
            email=email,
            matched_contact=matched_contact,
            debug=debug_info
        )


# Singleton-Instanz
_resolver_instance: Optional[ContactResolver] = None


def get_contact_resolver() -> ContactResolver:
    """Gibt die Singleton-Instanz des Contact Resolvers zurück"""
    global _resolver_instance
    if _resolver_instance is None:
        _resolver_instance = ContactResolver()
    return _resolver_instance

