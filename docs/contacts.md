# Kontakte-Verwaltung für Freiraum-Mitarbeiter

## Übersicht

Der Contact Resolver v1 ermöglicht es, Namen ohne E-Mail-Adresse (z.B. "Thomas", "freiraumberatung") lokal aus `/config/contacts.local.json` in E-Mail-Adressen aufzulösen. Dies funktioniert automatisch im Wizard4-System, wenn AutoSend aktiviert ist.

## Kontaktdatei

Die Kontaktdatei befindet sich unter `/config/contacts.local.json` und folgt folgendem Schema:

```json
{
  "contacts": [
    {
      "id": "eindeutige-id",
      "displayName": "Anzeigename",
      "aliases": ["alias1", "alias2", "alias3"],
      "emails": ["email@example.com"]
    }
  ]
}
```

### Felder

- **id**: Eindeutige Kennung des Kontakts (wird nicht für Matching verwendet, nur intern)
- **displayName**: Anzeigename des Kontakts (wird für Matching verwendet)
- **aliases**: Liste von Alias-Namen (z.B. Spitznamen, alternative Schreibweisen)
- **emails**: Liste von E-Mail-Adressen (wird die erste E-Mail verwendet)

## Kontakte hinzufügen

### Beispiel: Neuen Kontakt hinzufügen

```json
{
  "id": "thomas",
  "displayName": "Thomas Müller",
  "aliases": ["thomas", "Thomas", "Tom"],
  "emails": ["thomas.mueller@example.com"]
}
```

### Beispiel: Kontakt mit mehreren Aliasen

```json
{
  "id": "chef",
  "displayName": "Dr. Max Mustermann",
  "aliases": ["chef", "Chef", "Max", "max", "Dr. Mustermann"],
  "emails": ["max.mustermann@example.com"]
}
```

## Matching-Algorithmus

Der Contact Resolver verwendet einen intelligenten Matching-Algorithmus:

1. **Normalisierung**: Input und Kandidaten werden normalisiert (lowercase, trim, Satzzeichen entfernt)
2. **Stopwords entfernen**: Deutsche Artikel/Pronomen/Stopwords werden entfernt ("dem", "den", "der", "die", "das", "einem", "einen", "bitte", "mal", "kurz", "eben", "noch", "an", "für")
3. **Matching-Felder**: Es wird in `id`, `displayName` und allen `aliases` gesucht
4. **Scoring**:
   - Exakter Treffer: Score 1.00
   - Token-Overlap (Jaccard-Ähnlichkeit): Score 0..1
   - Prefix-Match: Boost
5. **Threshold**: Minimum-Score von 0.72 erforderlich
6. **Eindeutigkeit**: Wenn Top1 >= threshold und (Top1 - Top2) >= 0.08, wird akzeptiert, sonst None (ambiguous)

## Verwendung

Der Contact Resolver wird automatisch von Wizard4 verwendet:

1. Wenn `toName` vorhanden ist, aber `toEmail` fehlt
2. Wenn `sendMode === "sendNow"`
3. Resolver wird aufgerufen und füllt `toEmail` auf
4. AutoSend kann dann greifen

## Manuelles Testen

Du kannst den Contact Resolver auch manuell über den API-Endpoint testen:

```bash
GET /api/contacts/resolve?name=freiraumberatung
GET /api/contacts/resolve?name=dem freiraumberatung
GET /api/contacts/resolve?name=denis
```

Response:
```json
{
  "ok": true,
  "inputName": "freiraumberatung",
  "email": "freiraumberatung@web.de",
  "matchedContact": {
    "id": "freiraumberatung",
    "displayName": "Freiraumberatung",
    "aliases": ["freiraumberatung", "freiraum"],
    "emails": ["freiraumberatung@web.de"]
  },
  "debug": {
    "normalizedInput": "freiraumberatung",
    "candidatesScored": [...],
    "topScore": 1.0,
    "secondScore": null
  }
}
```

## Auto-Reload

Die Kontaktdatei wird automatisch neu geladen, wenn sie geändert wird (basierend auf mtime). Es ist kein Neustart des Backends erforderlich.





