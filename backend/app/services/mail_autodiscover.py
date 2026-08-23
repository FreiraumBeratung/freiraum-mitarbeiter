from __future__ import annotations

import smtplib
import socket
import ssl
import struct
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
    "outlook.de": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "hotmail.com": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "hotmail.de": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "live.com": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "office365.com": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587, True, False)},
    "web.de": {"imap": ("imap.web.de", 993), "smtp": ("smtp.web.de", 587, True, False)},
    "gmx.de": {"imap": ("imap.gmx.net", 993), "smtp": ("mail.gmx.net", 587, True, False)},
    "gmx.net": {"imap": ("imap.gmx.net", 993), "smtp": ("mail.gmx.net", 587, True, False)},
    "t-online.de": {"imap": ("secureimap.t-online.de", 993), "smtp": ("securesmtp.t-online.de", 587, True, False)},
    "icloud.com": {"imap": ("imap.mail.me.com", 993), "smtp": ("smtp.mail.me.com", 587, True, False)},
    "me.com": {"imap": ("imap.mail.me.com", 993), "smtp": ("smtp.mail.me.com", 587, True, False)},
    "mac.com": {"imap": ("imap.mail.me.com", 993), "smtp": ("smtp.mail.me.com", 587, True, False)},
    "strato.de": {"imap": ("imap.strato.de", 993), "smtp": ("smtp.strato.de", 587, True, False)},
    "1und1.de": {"imap": ("imap.1und1.de", 993), "smtp": ("smtp.1und1.de", 587, True, False)},
    "1and1.de": {"imap": ("imap.1und1.de", 993), "smtp": ("smtp.1und1.de", 587, True, False)},
    "online.de": {"imap": ("imap.1und1.de", 993), "smtp": ("smtp.1und1.de", 587, True, False)},
    "yahoo.de": {"imap": ("imap.mail.yahoo.com", 993), "smtp": ("smtp.mail.yahoo.com", 587, True, False)},
    "yahoo.com": {"imap": ("imap.mail.yahoo.com", 993), "smtp": ("smtp.mail.yahoo.com", 587, True, False)},
}

_MX_PRESET_HINTS = (
    (("protection.outlook.com", "outlook.com", "office365.com", "microsoft.com"), "outlook.com"),
    (("google.com", "googlemail.com", "gmail.com"), "gmail.com"),
    (("ionos.", "1and1.", "1und1."), "ionos.de"),
    (("strato.",), "strato.de"),
    (("web.de",), "web.de"),
    (("gmx.",), "gmx.de"),
    (("icloud.com", "mail.me.com", "apple.com"), "icloud.com"),
    (("t-online.de",), "t-online.de"),
    (("yahoo.", "yahoodns."), "yahoo.de"),
)


def _domain_from_email(email_address: str) -> str:
    if "@" not in email_address:
        return ""
    return email_address.split("@", 1)[1].strip().lower()


def _decode_dns_name(payload: bytes, offset: int) -> tuple[str, int]:
    labels: list[str] = []
    jumped = False
    cursor = offset
    end = offset
    hops = 0
    while cursor < len(payload) and hops < 16:
        length = payload[cursor]
        if length == 0:
            if not jumped:
                end = cursor + 1
            break
        if length & 0xC0 == 0xC0:
            if cursor + 1 >= len(payload):
                break
            pointer = ((length & 0x3F) << 8) | payload[cursor + 1]
            if not jumped:
                end = cursor + 2
            cursor = pointer
            jumped = True
            hops += 1
            continue
        cursor += 1
        if cursor + length > len(payload):
            break
        labels.append(payload[cursor : cursor + length].decode("ascii", "ignore"))
        cursor += length
        if not jumped:
            end = cursor
    return ".".join(labels).lower(), end


def lookup_mx_hosts(domain: str, timeout_sec: float = 2.0) -> list[str]:
    host = (domain or "").strip().lower().strip(".")
    if not host or "." not in host or len(host) > 253:
        return []
    labels = host.split(".")
    if any((not label) or len(label) > 63 for label in labels):
        return []
    try:
        qname = b"".join(bytes([len(label)]) + label.encode("ascii") for label in labels) + b"\x00"
    except Exception:
        return []
    packet = struct.pack("!HHHHHH", 0x464D, 0x0100, 1, 0, 0, 0) + qname + struct.pack("!HH", 15, 1)
    found: list[tuple[int, str]] = []
    for server in ("1.1.1.1", "8.8.8.8"):
        sock: socket.socket | None = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(max(0.6, min(3.0, float(timeout_sec))))
            sock.sendto(packet, (server, 53))
            data, _ = sock.recvfrom(2048)
        except Exception:
            continue
        finally:
            if sock is not None:
                try:
                    sock.close()
                except Exception:
                    pass
        if len(data) < 12:
            continue
        _id, flags, qdcount, ancount, _nscount, _arcount = struct.unpack("!HHHHHH", data[:12])
        if _id != 0x464D or (flags & 0x000F) != 0 or ancount <= 0:
            continue
        offset = 12
        try:
            for _ in range(qdcount):
                _name, offset = _decode_dns_name(data, offset)
                offset += 4
            for _ in range(ancount):
                _name, offset = _decode_dns_name(data, offset)
                if offset + 10 > len(data):
                    break
                rtype, _rclass, _ttl, rdlen = struct.unpack("!HHIH", data[offset : offset + 10])
                offset += 10
                rdata = data[offset : offset + rdlen]
                offset += rdlen
                if rtype != 15 or len(rdata) < 3:
                    continue
                pref = struct.unpack("!H", rdata[:2])[0]
                exchange, _ = _decode_dns_name(data, offset - rdlen + 2)
                if exchange:
                    found.append((pref, exchange.rstrip(".")))
        except Exception:
            continue
        if found:
            break
    found.sort(key=lambda item: item[0])
    unique: list[str] = []
    seen: set[str] = set()
    for _pref, name in found:
        if name in seen:
            continue
        seen.add(name)
        unique.append(name)
    return unique


def preset_from_mx_host(mx_host: str) -> dict | None:
    needle = (mx_host or "").strip().lower()
    if not needle:
        return None
    for needles, preset_key in _MX_PRESET_HINTS:
        if any(token in needle for token in needles):
            return KNOWN_DOMAIN_PRESETS.get(preset_key)
    return None


def login_setup_hint(email_address: str, errors: list[str] | None = None) -> str | None:
    email = (email_address or "").strip().lower()
    blob = " ".join(errors or []).lower()
    if email.endswith("@gmail.com") or email.endswith("@googlemail.com") or "gmail" in blob:
        return "Gmail: IMAP muss an sein. Bei Zwei-Faktor bitte ein App-Passwort verwenden."
    if any(email.endswith(suffix) for suffix in ("@outlook.com", "@outlook.de", "@hotmail.com", "@hotmail.de", "@live.com", "@office365.com")) or "office365" in blob or "outlook.com" in blob:
        return "Microsoft-Konto: Wenn IMAP blockiert ist, unter Erweiterte Einstellungen „Microsoft 365“ nutzen."
    if email.endswith("@icloud.com") or email.endswith("@me.com") or email.endswith("@mac.com"):
        return "iCloud: Bitte ein app-spezifisches Passwort verwenden."
    return None


def discover_mail_servers(email_address: str) -> list[dict]:
    domain = _domain_from_email(email_address)
    candidates: list[dict] = []
    preset = KNOWN_DOMAIN_PRESETS.get(domain)
    if not preset and domain:
        for mx_host in lookup_mx_hosts(domain):
            preset = preset_from_mx_host(mx_host)
            if preset:
                break
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

