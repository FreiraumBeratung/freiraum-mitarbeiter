"""
Contact Resolver v1 für Freiraum-Mitarbeiter

Löst Namen ohne E-Mail-Adresse lokal aus /config/contacts.local.json auf.
Deterministischer Matching-Algorithmus mit Scoring.
"""

import json
import logging
import re
import os
import imaplib
import email
import time
import requests
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from email.header import decode_header

logger = logging.getLogger(__name__)
from .contact_store import get_contact_store

# Stopwords, die entfernt werden sollen
STOPWORDS = {
    "dem", "den", "der", "die", "das",
    "einem", "einen", "einer", "eine",
    "bitte", "mal", "kurz", "eben", "noch",
    "an", "für", "von", "zu", "mit", "in", "auf",
    "folgende", "folgendes", "nachricht", "nachrichten", "mail", "email"
}

# Threshold und Unterschieds-Minimum für eindeutiges Matching
MIN_SCORE_THRESHOLD = 0.72
MIN_SCORE_DIFF = 0.08
SINGLE_TOKEN_SOFT_THRESHOLD = 0.60
SINGLE_TOKEN_SOFT_DIFF = 0.12


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
    ambiguous_contacts: List[Contact]


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
        self._mailbox_contacts: List[Contact] = []
        self._graph_contacts: List[Contact] = []
        self._learned_contacts: List[Contact] = []
        self._last_mtime: float = 0.0
        self._mailbox_contacts_loaded_at: float = 0.0
        self._graph_contacts_loaded_at: float = 0.0
        self._learned_contacts_loaded_at: float = 0.0
        self._contact_store = get_contact_store()
        
        # Initiales Laden
        self._load_contacts()
        self._load_mailbox_contacts()
        self._load_graph_contacts()
        self._load_learned_contacts()
        
        logger.info(
            f"contacts.local.json loaded: {len(self.contacts)} contacts (path={self.contacts_file})"
        )

    @staticmethod
    def _decode_mime_header(value: str | None) -> str:
        if not value:
            return ""
        decoded_parts: list[str] = []
        for text, charset in decode_header(value):
            if isinstance(text, bytes):
                try:
                    decoded_parts.append(text.decode(charset or "utf-8", errors="replace"))
                except Exception:
                    decoded_parts.append(text.decode("utf-8", errors="replace"))
            else:
                decoded_parts.append(text)
        return "".join(decoded_parts).strip()

    @staticmethod
    def _imap_host() -> str:
        return os.getenv("IMAP_HOST", "")

    @staticmethod
    def _imap_port() -> int:
        return int(os.getenv("IMAP_PORT", "993"))

    @staticmethod
    def _imap_user() -> str:
        return os.getenv("IMAP_USER") or os.getenv("IMAP_USERNAME") or ""

    @staticmethod
    def _imap_pass() -> str:
        return os.getenv("IMAP_PASS") or os.getenv("IMAP_PASSWORD") or ""

    @classmethod
    def _imap_config_available(cls) -> bool:
        return bool(cls._imap_host() and cls._imap_user() and cls._imap_pass())

    @staticmethod
    def _graph_headers() -> Optional[Dict[str, str]]:
        token = os.getenv("MSGRAPH_TOKEN", "").strip()
        if not token:
            try:
                from .ms_oauth import get_valid_access_token

                token = (get_valid_access_token(refresh_if_needed=True) or "").strip()
            except Exception:
                token = ""
        if not token:
            return None
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def _load_learned_contacts(self) -> None:
        rows = self._contact_store.get_contacts()
        contacts: List[Contact] = []
        for row in rows:
            email_value = (row.get("email") or "").strip().lower()
            if not email_value:
                continue
            display_name = (row.get("display_name") or "").strip() or email_value.split("@", 1)[0]
            aliases = row.get("aliases") if isinstance(row.get("aliases"), list) else []
            contacts.append(
                Contact(
                    id=f"learned:{email_value}",
                    display_name=display_name,
                    aliases=[str(a) for a in aliases if isinstance(a, str)],
                    emails=[email_value],
                )
            )
        self._learned_contacts = contacts
        self._learned_contacts_loaded_at = time.time()

    def get_status_snapshot(self) -> Dict:
        return {
            "localJson": len(self.contacts),
            "mailboxDerived": len(self._mailbox_contacts),
            "graphContacts": len(self._graph_contacts),
            "learnedStore": len(self._learned_contacts),
            "contactsFile": str(self.contacts_file),
            "lastLoadedAt": {
                "mailbox": self._mailbox_contacts_loaded_at,
                "graph": self._graph_contacts_loaded_at,
                "learned": self._learned_contacts_loaded_at,
            },
        }

    def _remember_contact_batch(self, contacts: List[Contact], source: str) -> None:
        for contact in contacts:
            if not contact.emails:
                continue
            email_value = (contact.emails[0] or "").strip().lower()
            if not email_value:
                continue
            self._contact_store.upsert_contact(
                email=email_value,
                display_name=contact.display_name,
                aliases=contact.aliases,
                source=source,
            )

    @staticmethod
    def _quote_imap_mailbox(name: str) -> str:
        safe = (name or "").replace('"', '\\"')
        return f'"{safe}"'

    def _load_graph_contacts(self) -> None:
        """
        Lädt echte Outlook/Graph Kontakte, sofern ein Bearer-Token vorhanden ist.
        """
        enabled = os.getenv("CONTACT_RESOLVER_USE_GRAPH_CONTACTS", "true").lower() in ("1", "true", "yes")
        if not enabled:
            self._graph_contacts = []
            self._graph_contacts_loaded_at = time.time()
            return

        headers = self._graph_headers()
        if not headers:
            self._graph_contacts = []
            self._graph_contacts_loaded_at = time.time()
            return

        url = "https://graph.microsoft.com/v1.0/me/contacts?$top=200&$select=id,displayName,emailAddresses"
        try:
            response = requests.get(url, headers=headers, timeout=12)
            if response.status_code == 401:
                # Token könnte abgelaufen sein -> ein expliziter Refresh-Versuch.
                try:
                    from .ms_oauth import refresh_access_token

                    refreshed = refresh_access_token()
                    headers = {
                        "Authorization": f"Bearer {refreshed.access_token}",
                        "Content-Type": "application/json",
                    }
                    response = requests.get(url, headers=headers, timeout=12)
                except Exception as refresh_exc:
                    logger.warning("Graph token refresh in resolver failed: %s", refresh_exc)

            if response.status_code >= 400:
                logger.warning(
                    "Graph contacts load failed: status=%s body=%s",
                    response.status_code,
                    response.text[:180],
                )
                self._graph_contacts = []
                self._graph_contacts_loaded_at = time.time()
                return

            payload = response.json() if response.content else {}
            values = payload.get("value", []) if isinstance(payload, dict) else []
            if not isinstance(values, list):
                values = []

            contacts: List[Contact] = []
            for row in values:
                if not isinstance(row, dict):
                    continue
                display_name = (row.get("displayName") or "").strip()
                contact_id = (row.get("id") or "").strip()
                mail_entries = row.get("emailAddresses") or []
                emails: List[str] = []
                aliases: List[str] = []

                if isinstance(mail_entries, list):
                    for entry in mail_entries:
                        if not isinstance(entry, dict):
                            continue
                        address = (entry.get("address") or "").strip().lower()
                        name = (entry.get("name") or "").strip()
                        if address and "@" in address and address not in emails:
                            emails.append(address)
                        if name and name.lower() not in [a.lower() for a in aliases]:
                            aliases.append(name)

                if display_name and display_name.lower() not in [a.lower() for a in aliases]:
                    aliases.insert(0, display_name)

                if not emails:
                    continue

                fallback_name = display_name or emails[0].split("@", 1)[0]
                contacts.append(
                    Contact(
                        id=f"graph:{contact_id or emails[0]}",
                        display_name=fallback_name,
                        aliases=aliases,
                        emails=emails,
                    )
                )

            self._graph_contacts = contacts
            self._remember_contact_batch(self._graph_contacts, source="graph")
            self._graph_contacts_loaded_at = time.time()
            logger.info("Loaded Graph contacts for resolver: %s", len(self._graph_contacts))
        except Exception as exc:
            logger.warning("Graph contacts loading failed: %s", exc)
            self._graph_contacts = []
            self._graph_contacts_loaded_at = time.time()

    def _load_mailbox_contacts(self) -> None:
        """
        Lädt aus der Inbox eine kleine Liste realer Absender als Resolver-Kandidaten.
        Dies ist ein pragmatischer Exchange-Näherungswert, bis native Contacts-APIs genutzt werden.
        """
        graph_mode = os.getenv("GRAPH_MAIL_MODE", "true").lower() in ("1", "true", "yes", "on")
        graph_fallback = os.getenv("GRAPH_MAIL_AUTO_FALLBACK", "true").lower() in ("1", "true", "yes", "on")
        default_enabled = "true" if (not graph_mode or (graph_fallback and self._imap_config_available())) else "false"
        enabled = os.getenv("CONTACT_RESOLVER_USE_INBOX_SENDERS", default_enabled).lower() in ("1", "true", "yes")
        if not enabled:
            self._mailbox_contacts = []
            self._mailbox_contacts_loaded_at = time.time()
            return

        host = self._imap_host()
        user = self._imap_user()
        password = self._imap_pass()
        if not host or not user or not password:
            logger.warning("Mailbox-Contacts skipped: IMAP Konfiguration unvollständig.")
            self._mailbox_contacts = []
            self._mailbox_contacts_loaded_at = time.time()
            return

        max_scan = max(10, min(int(os.getenv("CONTACT_RESOLVER_INBOX_SCAN", "80")), 200))
        found: dict[str, Contact] = {}
        client: imaplib.IMAP4_SSL | None = None
        try:
            client = imaplib.IMAP4_SSL(host, self._imap_port())
            client.login(user, password)
            folders = [
                ("INBOX", "FROM"),
                ("Sent", "TO_CC"),
                ("Sent Items", "TO_CC"),
                ("Gesendet", "TO_CC"),
                ("INBOX.Sent", "TO_CC"),
                ("INBOX.Gesendet", "TO_CC"),
            ]
            for folder_name, source_mode in folders:
                try:
                    status, _ = client.select(folder_name, readonly=True)
                    if status != "OK":
                        # Fallback: quoted mailbox-Name für Server mit strikter Argumentprüfung.
                        status, _ = client.select(self._quote_imap_mailbox(folder_name), readonly=True)
                except Exception:
                    continue
                if status != "OK":
                    continue

                try:
                    status, data = client.uid("SEARCH", None, "ALL")
                except Exception:
                    continue
                if status != "OK" or not data or not data[0]:
                    continue

                all_uids = list(reversed(data[0].split()))
                for uid_bytes in all_uids[:max_scan]:
                    uid = uid_bytes.decode("utf-8", errors="replace")
                    if source_mode == "FROM":
                        fetch_expr = "(BODY.PEEK[HEADER.FIELDS (FROM)])"
                    else:
                        fetch_expr = "(BODY.PEEK[HEADER.FIELDS (TO CC)])"

                    try:
                        fetch_status, fetch_data = client.uid("FETCH", uid, fetch_expr)
                    except Exception:
                        continue
                    if fetch_status != "OK" or not fetch_data:
                        continue

                    raw_header = None
                    for part in fetch_data:
                        if isinstance(part, tuple) and len(part) > 1:
                            raw_header = part[1]
                            break
                    if not raw_header:
                        continue

                    msg = email.message_from_bytes(raw_header)
                    address_candidates: List[Tuple[str, str]] = []
                    if source_mode == "FROM":
                        parsed_name, parsed_email = email.utils.parseaddr(msg.get("From") or "")
                        address_candidates.append((parsed_name, parsed_email))
                    else:
                        for key in ("To", "Cc"):
                            for entry in msg.get_all(key, []):
                                parsed_name, parsed_email = email.utils.parseaddr(entry or "")
                                address_candidates.append((parsed_name, parsed_email))

                    for parsed_name, parsed_email in address_candidates:
                        email_value = (parsed_email or "").strip().lower()
                        if not email_value or "@" not in email_value:
                            continue
                        if email_value in found:
                            continue

                        display_name = self._decode_mime_header(parsed_name) if parsed_name else ""
                        if not display_name:
                            display_name = email_value.split("@", 1)[0].replace(".", " ").replace("_", " ").strip() or email_value

                        local_part = email_value.split("@", 1)[0]
                        alias_candidates = [display_name, local_part, email_value]
                        aliases = []
                        for alias in alias_candidates:
                            norm = alias.strip()
                            if norm and norm.lower() not in [a.lower() for a in aliases]:
                                aliases.append(norm)

                        found[email_value] = Contact(
                            id=f"mailbox:{email_value}",
                            display_name=display_name,
                            aliases=aliases,
                            emails=[email_value],
                        )

            self._mailbox_contacts = list(found.values())
            self._remember_contact_batch(self._mailbox_contacts, source="mailbox")
            self._mailbox_contacts_loaded_at = time.time()
            logger.info("Loaded mailbox sender contacts for resolver: %s", len(self._mailbox_contacts))
        except Exception as exc:
            logger.warning("Mailbox-Contacts loading failed: %s", exc)
            self._mailbox_contacts = []
            self._mailbox_contacts_loaded_at = time.time()
        finally:
            if client is not None:
                try:
                    client.logout()
                except Exception:
                    pass
    
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
            pass
        
        try:
            if self.contacts_file.exists():
                current_mtime = self.contacts_file.stat().st_mtime
                if current_mtime > self._last_mtime:
                    logger.info(f"contacts.local.json wurde geändert, lade neu...")
                    self._load_contacts()
        except Exception as e:
            logger.warning(f"Fehler beim Prüfen der mtime: {e}")

        # Mailbox-Sender periodisch nachziehen
        ttl_sec = max(30, min(int(os.getenv("CONTACT_RESOLVER_INBOX_CACHE_SEC", "300")), 3600))
        if (time.time() - self._mailbox_contacts_loaded_at) > ttl_sec:
            self._load_mailbox_contacts()

        graph_ttl_sec = max(30, min(int(os.getenv("CONTACT_RESOLVER_GRAPH_CACHE_SEC", "300")), 3600))
        if (time.time() - self._graph_contacts_loaded_at) > graph_ttl_sec:
            self._load_graph_contacts()

        learned_ttl_sec = max(20, min(int(os.getenv("CONTACT_RESOLVER_LEARNED_CACHE_SEC", "120")), 1800))
        if (time.time() - self._learned_contacts_loaded_at) > learned_ttl_sec:
            self._load_learned_contacts()
    
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

            # Ein-Wort-Name-Boost:
            # "jens" soll gegen "jens meier" oder Alias "jens" verlässlich matchen.
            first_token_boost = 0.0
            input_token_count = len(input_tokens)
            if input_token_count == 1 and input_normalized:
                field_parts = field_normalized.split()
                if field_parts:
                    first_token = field_parts[0]
                    if input_normalized == first_token:
                        first_token_boost = 0.22
                    elif input_normalized in field_tokens:
                        first_token_boost = 0.12
            
            # Gesamt-Score
            score = jaccard + prefix_boost + first_token_boost
            
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
        # Graph-Kontakte bei Bedarf on-demand nachladen (z. B. direkt nach frischem OAuth-Connect).
        graph_enabled = os.getenv("CONTACT_RESOLVER_USE_GRAPH_CONTACTS", "true").lower() in ("1", "true", "yes")
        if graph_enabled and len(self._graph_contacts) == 0:
            self._load_graph_contacts()
        
        debug_info = {
            "inputName": to_name,
            "normalizedInput": None,
            "candidatesScored": [],
            "topScore": None,
            "secondScore": None,
            "threshold": MIN_SCORE_THRESHOLD,
            "minDiff": MIN_SCORE_DIFF,
            "singleTokenSoftThreshold": SINGLE_TOKEN_SOFT_THRESHOLD,
            "singleTokenSoftDiff": SINGLE_TOKEN_SOFT_DIFF,
            "result": None
        }
        
        if not to_name or not to_name.strip():
            debug_info["result"] = "empty_input"
            return ResolveResult(email=None, matched_contact=None, debug=debug_info, ambiguous_contacts=[])
        
        # Normalisieren
        normalized_input = self._normalize(to_name)
        debug_info["normalizedInput"] = normalized_input
        
        if not normalized_input:
            debug_info["result"] = "normalized_empty"
            return ResolveResult(email=None, matched_contact=None, debug=debug_info, ambiguous_contacts=[])

        remembered = self._contact_store.get_remembered_resolution(normalized_input)
        if remembered and remembered.get("email"):
            remembered_email = str(remembered["email"]).strip().lower()
            remembered_name = str(remembered.get("display_name") or remembered_email.split("@", 1)[0])
            remembered_contact = Contact(
                id=f"memory:{remembered_email}",
                display_name=remembered_name,
                aliases=[remembered_name, normalized_input, remembered_email],
                emails=[remembered_email],
            )
            debug_info["result"] = "matched_from_memory"
            debug_info["memoryHit"] = True
            return ResolveResult(
                email=remembered_email,
                matched_contact=remembered_contact,
                debug=debug_info,
                ambiguous_contacts=[],
            )
        
        # Alle Kandidaten scoren
        scored_candidates = []
        
        combined_contacts: List[Contact] = []
        combined_contacts.extend(self.contacts)
        combined_contacts.extend(self._mailbox_contacts)
        combined_contacts.extend(self._graph_contacts)
        combined_contacts.extend(self._learned_contacts)
        debug_info["sourceCounts"] = {
            "localJson": len(self.contacts),
            "mailboxDerived": len(self._mailbox_contacts),
            "graphContacts": len(self._graph_contacts),
            "learnedStore": len(self._learned_contacts),
        }

        deduped_by_email: Dict[str, Contact] = {}
        for contact in combined_contacts:
            first_email = (contact.emails[0].strip().lower() if contact.emails else "")
            dedupe_key = first_email or contact.id.strip().lower()
            if not dedupe_key:
                continue
            if dedupe_key not in deduped_by_email:
                deduped_by_email[dedupe_key] = contact

        for contact in deduped_by_email.values():
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
                "score": c["score"],
                "email": (c["contact"].emails[0] if c["contact"].emails else None),
            }
            for c in scored_candidates[:5]  # Top 5 für Debug
        ]
        
        if not scored_candidates:
            debug_info["result"] = "no_candidates"
            return ResolveResult(email=None, matched_contact=None, debug=debug_info, ambiguous_contacts=[])
        
        top_score = scored_candidates[0]["score"]
        second_score = scored_candidates[1]["score"] if len(scored_candidates) > 1 else None
        
        debug_info["topScore"] = top_score
        debug_info["secondScore"] = second_score
        
        # Prüfe Threshold
        if top_score < MIN_SCORE_THRESHOLD:
            input_token_count = len(set(normalized_input.split()))
            if (
                input_token_count == 1
                and (
                    second_score is None
                    or (top_score - second_score) >= SINGLE_TOKEN_SOFT_DIFF
                )
                and top_score >= SINGLE_TOKEN_SOFT_THRESHOLD
            ):
                matched_contact = scored_candidates[0]["contact"]
                email = matched_contact.emails[0]
                debug_info["result"] = "matched_single_token_soft_threshold"
                self._contact_store.remember_resolution(
                    query_norm=normalized_input,
                    email=email,
                    display_name=matched_contact.display_name,
                )
                self._contact_store.upsert_contact(
                    email=email,
                    display_name=matched_contact.display_name,
                    aliases=matched_contact.aliases,
                    source="resolved",
                )
                return ResolveResult(
                    email=email,
                    matched_contact=matched_contact,
                    debug=debug_info,
                    ambiguous_contacts=[],
                )
            debug_info["result"] = "below_threshold"
            return ResolveResult(email=None, matched_contact=None, debug=debug_info, ambiguous_contacts=[])
        
        # Prüfe Eindeutigkeit
        if second_score is not None:
            score_diff = top_score - second_score
            if score_diff < MIN_SCORE_DIFF:
                debug_info["result"] = "ambiguous"
                top_ambiguous = [c["contact"] for c in scored_candidates[:3]]
                return ResolveResult(
                    email=None,
                    matched_contact=None,
                    debug=debug_info,
                    ambiguous_contacts=top_ambiguous,
                )
        
        # Match gefunden!
        matched_contact = scored_candidates[0]["contact"]
        email = matched_contact.emails[0]  # Erste E-Mail verwenden
        
        debug_info["result"] = "matched"
        
        logger.info(
            f"Contact resolved: '{to_name}' -> '{email}' "
            f"(matched: {matched_contact.id}, score: {top_score:.2f})"
        )
        self._contact_store.remember_resolution(
            query_norm=normalized_input,
            email=email,
            display_name=matched_contact.display_name,
        )
        self._contact_store.upsert_contact(
            email=email,
            display_name=matched_contact.display_name,
            aliases=matched_contact.aliases,
            source="resolved",
        )
        
        return ResolveResult(
            email=email,
            matched_contact=matched_contact,
            debug=debug_info,
            ambiguous_contacts=[],
        )


# Singleton-Instanz
_resolver_instance: Optional[ContactResolver] = None


def get_contact_resolver() -> ContactResolver:
    """Gibt die Singleton-Instanz des Contact Resolvers zurück"""
    global _resolver_instance
    if _resolver_instance is None:
        _resolver_instance = ContactResolver()
    return _resolver_instance

