from __future__ import annotations

import smtplib
import ssl
import imaplib


KNOWN_DOMAIN_PRESETS = {
    "freiraum-unternehmensberatung.de": {
        "imap": ("exchange.ionos.eu", 993),
        "smtp": ("smtp.exchange.ionos.eu", 587, True, False),
    },
    "ionos.de": {"imap": ("imap.ionos.de", 993), "smtp": ("smtp.ionos.de", 587, True, False)},
    "gmail.com": {"imap": ("imap.gmail.com", 993), "smtp": ("smtp.gmail.com", 587, True, False)},
    "googlemail.com": {"imap": ("imap.gmail.com", 993), "smtp": ("smtp.gmail.com", 587, True, False)},
    "outlook.com": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "hotmail.com": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "live.com": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "office365.com": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "web.de": {"imap": ("imap.web.de", 993), "smtp": ("smtp.web.de", 587, True, False)},
    "gmx.de": {"imap": ("imap.gmx.net", 993), "smtp": ("mail.gmx.net", 587, True, False)},
    "t-online.de": {"imap": ("secureimap.t-online.de", 993), "smtp": ("securesmtp.t-online.de", 587, True, False)},
}


def _domain_from_email(email_address: str) -> str:
    if "@" not in email_address:
        return ""
    return email_address.split("@", 1)[1].strip().lower()


def discover_mail_servers(email_address: str) -> list[dict]:
    domain = _domain_from_email(email_address)
    candidates: list[dict] = []
    preset = KNOWN_DOMAIN_PRESETS.get(domain)
    if preset:
        candidates.append(
            {
                "imap_host": preset["imap"][0],
                "imap_port": preset["imap"][1],
                "smtp_host": preset["smtp"][0],
                "smtp_port": preset["smtp"][1],
                "smtp_use_tls": bool(preset["smtp"][2]),
                "smtp_use_ssl": bool(preset["smtp"][3]),
                "source": "known_preset",
            }
        )

    if domain:
        generated = [
            ("imap." + domain, 993, "smtp." + domain, 587, True, False),
            ("mail." + domain, 993, "mail." + domain, 587, True, False),
            ("imap." + domain, 993, "mail." + domain, 465, False, True),
        ]
        for imap_host, imap_port, smtp_host, smtp_port, smtp_use_tls, smtp_use_ssl in generated:
            candidates.append(
                {
                    "imap_host": imap_host,
                    "imap_port": imap_port,
                    "smtp_host": smtp_host,
                    "smtp_port": smtp_port,
                    "smtp_use_tls": smtp_use_tls,
                    "smtp_use_ssl": smtp_use_ssl,
                    "source": "domain_guess",
                }
            )

    unique: list[dict] = []
    seen = set()
    for candidate in candidates:
        key = (
            candidate["imap_host"],
            int(candidate["imap_port"]),
            candidate["smtp_host"],
            int(candidate["smtp_port"]),
            bool(candidate["smtp_use_tls"]),
            bool(candidate["smtp_use_ssl"]),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(candidate)
    return unique


def verify_imap(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    timeout_sec: float = 8.0,
) -> tuple[bool, str | None]:
    try:
        client = imaplib.IMAP4_SSL(host, int(port), timeout=max(2.0, float(timeout_sec)))
        try:
            client.login(username, password)
        finally:
            try:
                client.logout()
            except Exception:
                pass
        return True, None
    except Exception as exc:
        return False, str(exc)


def verify_smtp(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    use_tls: bool,
    use_ssl: bool,
    timeout_sec: float = 8.0,
) -> tuple[bool, str | None]:
    client: smtplib.SMTP | None = None
    try:
        context = ssl.create_default_context()
        timeout_value = max(2.0, float(timeout_sec))
        if use_ssl:
            client = smtplib.SMTP_SSL(host, int(port), timeout=timeout_value, context=context)
            client.ehlo()
        else:
            client = smtplib.SMTP(host, int(port), timeout=timeout_value)
            client.ehlo()
            if use_tls:
                client.starttls(context=context)
                client.ehlo()
        client.login(username, password)
        return True, None
    except Exception as exc:
        return False, str(exc)
    finally:
        try:
            if client is not None:
                client.quit()
        except Exception:
            pass

