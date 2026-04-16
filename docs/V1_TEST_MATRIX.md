# Freiraum Mitarbeiter V1 Test Matrix

## Ziel
Prüfbare Abnahme für V1 in beiden Mail-Welten:
- Microsoft 365 (Graph)
- IMAP/SMTP (Fallback/Legacy)

## A. Mail-Transport

- [ ] `GET /api/mail/mode` liefert sinnvollen aktiven Modus.
- [ ] Inbox lädt im Graph-Modus.
- [ ] Inbox lädt im IMAP/SMTP-Fallback.
- [ ] Mailversand klappt im Graph-Modus.
- [ ] Mailversand klappt im IMAP/SMTP-Fallback.

## B. OAuth & Session

- [ ] OAuth Connect erzeugt `connected=true`.
- [ ] Nach Backend-Neustart bleibt Session nutzbar (persistente Token-Session).
- [ ] Token-Refresh läuft vor Ablauf ohne manuellen Eingriff.
- [ ] Bei nicht mailbox-fähigem Graph-Konto erscheint klare Diagnose.

## C. Contact Resolver

- [ ] Kontaktauflösung aus lokalen Seed-Kontakten.
- [ ] Kontaktauflösung aus mailbox-abgeleiteten Kontakten.
- [ ] Kontaktauflösung aus gelerntem Kontakt-Store (`learnedStore > 0`).
- [ ] Mehrdeutigkeit liefert Rückfrageoptionen.
- [ ] Erinnerte Auflösung (`resolver_memory`) greift bei Wiederholung.

## D. Voice Flow Safety

- [ ] Ohne validen Empfänger kein AutoSend.
- [ ] Mit aufgelöstem Empfänger AutoSend möglich.
- [ ] Fallback/Fehlerzustände brechen Wizard-/UI-Flow nicht.

## E. Betriebsstabilität

- [ ] Wiederholte Inbox-Reloads bleiben stabil.
- [ ] Graph 429/503/504 werden per Retry abgefedert.
- [ ] Keine regressiven 401/403 ohne klare Fehlermeldung.
- [ ] API-Responses bleiben kompatibel zum Frontend.

