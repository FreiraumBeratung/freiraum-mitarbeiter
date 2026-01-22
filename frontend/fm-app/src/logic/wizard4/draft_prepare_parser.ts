/**
 * Parser für "Bitte an <name> vorbereiten <text>" und "Bitte für <name> vorbereiten <text>"
 * 
 * Erkennt Preview-only Email-Intents mit "vorbereiten" Phrase.
 * Normalized Text ist bereits lowercase und ohne Umlaute.
 */

export function tryParseDraftPrepare(normalized: string): null | { toName: string; bodyHint: string } {
  if (!normalized || typeof normalized !== 'string') {
    return null;
  }

  const text = normalized.trim();
  if (!text) {
    return null;
  }

  // Pattern: optional "bitte " + ("an " | "für " | "fur " | "fuer ") + <name> + " vorbereiten " + <rest>
  // "bitte" kann fehlen, da es in normalized entfernt werden kann
  // "für" wird in normalized zu "fur" oder "fuer" (Umlaut-Entfernung)
  const patterns = [
    // "bitte an <name> vorbereiten <rest>"
    /^(?:bitte\s+)?an\s+([a-zäöüß]+)\s+vorbereiten\s+(.+)$/i,
    // "bitte für <name> vorbereiten <rest>" (mit Umlaut)
    /^(?:bitte\s+)?für\s+([a-zäöüß]+)\s+vorbereiten\s+(.+)$/i,
    // "bitte fur <name> vorbereiten <rest>" (ohne Umlaut, normalized)
    /^(?:bitte\s+)?fur\s+([a-zäöüß]+)\s+vorbereiten\s+(.+)$/i,
    // "bitte fuer <name> vorbereiten <rest>" (alternative normalized)
    /^(?:bitte\s+)?fuer\s+([a-zäöüß]+)\s+vorbereiten\s+(.+)$/i,
    // "an <name> vorbereiten <rest>" (ohne bitte)
    /^an\s+([a-zäöüß]+)\s+vorbereiten\s+(.+)$/i,
    // "für <name> vorbereiten <rest>" (ohne bitte, mit Umlaut)
    /^für\s+([a-zäöüß]+)\s+vorbereiten\s+(.+)$/i,
    // "fur <name> vorbereiten <rest>" (ohne bitte, ohne Umlaut, normalized)
    /^fur\s+([a-zäöüß]+)\s+vorbereiten\s+(.+)$/i,
    // "fuer <name> vorbereiten <rest>" (ohne bitte, alternative normalized)
    /^fuer\s+([a-zäöüß]+)\s+vorbereiten\s+(.+)$/i,
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

      // Entferne führende Kommata, Doppelpunkte, Bindestriche
      bodyHint = bodyHint.replace(/^[,.:\-\s]+/, '').trim();

      if (!bodyHint || bodyHint.length === 0) {
        continue;
      }

      // Erste Buchstabe groß
      bodyHint = bodyHint.charAt(0).toUpperCase() + bodyHint.slice(1);

      // SPEZIAL-FIX: Prefix "Es " für bestimmte Phrasen
      const bodyHintLower = bodyHint.toLowerCase();
      if (bodyHintLower.startsWith('verschiebt sich')) {
        bodyHint = 'Es ' + bodyHint.charAt(0).toLowerCase() + bodyHint.slice(1);
      } else if (bodyHintLower.startsWith('verzögert sich')) {
        bodyHint = 'Es ' + bodyHint.charAt(0).toLowerCase() + bodyHint.slice(1);
      }

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
