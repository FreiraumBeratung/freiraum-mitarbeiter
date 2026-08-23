import pathlib
import sys

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.services.mail_autodiscover import (
    KNOWN_DOMAIN_PRESETS,
    discover_mail_servers,
    login_setup_hint,
    lookup_mx_hosts,
    preset_from_mx_host,
)


def test_known_presets_cover_common_german_providers():
    for domain in (
        "web.de",
        "gmx.net",
        "outlook.de",
        "icloud.com",
        "strato.de",
        "1und1.de",
        "yahoo.de",
    ):
        assert domain in KNOWN_DOMAIN_PRESETS
        first = discover_mail_servers(f"user@{domain}")[0]
        assert first["source"] == "known_preset"
        assert first["imap_port"] == 993


def test_mx_host_maps_to_known_preset():
    outlook = preset_from_mx_host("noeke-de.mail.protection.outlook.com")
    assert outlook is not None
    assert outlook["imap"][0] == "outlook.office365.com"
    gmail = preset_from_mx_host("gmail-smtp-in.l.google.com")
    assert gmail is not None
    assert gmail["imap"][0] == "imap.gmail.com"
    ionos = preset_from_mx_host("mx00.ionos.de")
    assert ionos is not None
    assert ionos["imap"][0] == "imap.ionos.de"


def test_login_hints_are_honest():
    assert "App-Passwort" in (login_setup_hint("anna@gmail.com") or "")
    assert "Microsoft 365" in (login_setup_hint("max@outlook.de") or "")
    assert "app-spezifisches" in (login_setup_hint("ich@icloud.com") or "")
    assert login_setup_hint("kunde@web.de") is None


def test_lookup_mx_rejects_unsafe_domains():
    assert lookup_mx_hosts("") == []
    assert lookup_mx_hosts("localhost") == []
    assert lookup_mx_hosts("a" * 300 + ".de") == []

