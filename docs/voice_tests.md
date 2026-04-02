# Voice Tests (Body Replace All)

## Smoke checklist

- Composer offen (Draft vorhanden):  
  `Ersetze die Email durch folgende Nachricht. Hallo Thomas, ich melde mich später.`  
  Erwartung: Body exakt ersetzt, `To`/`Subject` unverändert, kein AutoSend.

- STT-Variante:  
  `Er setzte den kompletten Text durch. Ich rufe dich morgen an.`  
  Erwartung: Intent `email-body-replace-all`, Body wird auf den Satz gesetzt.

- Alternative Triggerphrase:  
  `Neue Nachricht stattdessen Hallo Thomas, bitte schick mir die Unterlagen.`  
  Erwartung: Intent `email-body-replace-all`, kein Fallback auf `email-compose`.

- Zusatzphrase (Delete + Replace):  
  `Lösch die aktuelle Mail und schreibe stattdessen. Hi Thomas, melde mich später.`  
  Erwartung: Intent `email-body-replace-all`, Body = `Hi Thomas, melde mich später.`

- Kurzform:  
  `Schreib stattdessen: Danke dir.`  
  Erwartung: Intent `email-body-replace-all`, Body = `Danke dir.`

- Kein Draft/Composer offen:  
  `Ersetze die e-mail durch Hallo Thomas.`  
  Erwartung: Replace-All wird per Guard NICHT gematcht (kein `email-body-replace-all`).

- Kurzer/leer extrahierter Text:  
  `Ersetze die e-mail`  
  Erwartung: Kein kaputter Replace, UI-Hint `missing_body`.

## Sequence Test (compose + replace + append + send)

1. Draft öffnen (mit Empfänger und Betreff).
2. Replace-All auslösen (`Ersetze ... durch ...`).
3. Danach `Ergänze ...` auslösen.
4. Vorschau prüfen.
5. Senden auslösen.
6. Prüfen: kein unerwarteter Reset von `To`/`Subject`, kein AutoSend bei Replace.

## Erwartete Logs

- Bei Match:
  - `[intent-router][email-body-replace-all] matched` mit
    - `originalText`
    - `extractedReplacement`
    - `guardReason` (`composerOpen` oder `hasDraftContext`)
  - `[body-replace] requested="..."`
  - `[body-replace] before="..."`
  - `[body-replace] composerFnsAvailable=..., waitedMs=..., hadSetterBefore=...`
  - `[body-replace] after="..."`
  - `[body-replace] applied ok`

- Bei Guard-Block:
  - `[intent-router][email-body-replace-all] skipped by guard`

## Sentence Insert (Index)

- `Füge nach Satz 2 ein Danke dir.`  
  Erwartung: Einfügen nach Satz 2.

- `Füge vor Satz 3 ein Kurze Info.`  
  Erwartung: Einfügen vor Satz 3.

- `Füge nach dem dritten Satz ein Danke dir.`  
  Erwartung: Wortzahl-Mapping (dritten -> 3) funktioniert.

- `Füge vor dem ersten Satz ein Hi Thomas.`  
  Erwartung: Einfügen am Anfang (vor Satz 1).


