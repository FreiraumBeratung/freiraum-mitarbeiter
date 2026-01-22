/**
 * Parser für "Schreib (an|für|fur|fuer) <name> (aber )?nicht senden <text>"
 * 
 * Erkennt Preview-only Email-Intents mit "schreib ... nicht senden" Phrase.
 * Normalized Text ist bereits lowercase und ohne Umlaute.
 */

export function tryParseWritePreview(normalized: string): null | { toName: string; bodyHint: string } {
  if (!normalized || typeof normalized !== 'string') {
    return null;
  }

  const text = normalized.trim();
  if (!text) {
    return null;
  }

  // Pattern: "schreib " + (an|für|fur|fuer) + <name> + optional "aber" + "nicht senden" oder "nicht schicken" + <rest>
  // Akzeptiere auch mit optionalen Satzzeichen nach "nicht senden"
  const patterns = [
    // "schreib an <name> aber nicht senden <rest>"
    /^schreib\s+(?:an|für|fur|fuer)\s+([a-zß-]+)\s+(?:aber\s+)?nicht\s+(?:senden|schicken)\s*[,.:\-\s]*\s*(.+)$/i,
    // "schreib an <name> nicht senden <rest>" (ohne "aber")
    /^schreib\s+(?:an|für|fur|fuer)\s+([a-zß-]+)\s+nicht\s+(?:senden|schicken)\s*[,.:\-\s]*\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      const toName = match[1].trim();
      let bodyHint = match[2].trim();

      // Wenn body leer ist, kein Intent
      if (!bodyHint || bodyHint.length === 0) {
        continue;
      }

      // Entferne führende Kommata, Doppelpunkte, Bindestriche, Leerzeichen
      bodyHint = bodyHint.replace(/^[,.:\-\s]+/, '').trim();

      if (!bodyHint || bodyHint.length === 0) {
        continue;
      }

      // Erste Buchstabe groß
      bodyHint = bodyHint.charAt(0).toUpperCase() + bodyHint.slice(1);

      // Stelle sicher, dass Body mit Satzzeichen endet
      if (!/[.!?]$/.test(bodyHint)) {
        bodyHint += '.';
      }

      return {
        toName: toName,
        bodyHint: bodyHint,
      };
    }
  }

  return null;
}
