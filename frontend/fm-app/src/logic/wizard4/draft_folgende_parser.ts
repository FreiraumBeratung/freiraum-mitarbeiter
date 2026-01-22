/**
 * Parser für "Folgende Mail/Nachricht an <name> <body> (doch) nicht rausschicken"
 * 
 * Erkennt Preview-only Email-Intents mit "folgende mail/nachricht an <name>" Pattern.
 * Normalized Text ist bereits lowercase und ohne Umlaute.
 */

import { stripCancelPhraseFromBody } from './cancel_phrase';

export function tryParseDraftFolgende(normalized: string): null | { toName: string; bodyHint: string } {
  if (!normalized || typeof normalized !== 'string') {
    return null;
  }

  const text = normalized.trim();
  if (!text) {
    return null;
  }

  // Pattern: "folgende mail/nachricht an <name> <rest>"
  // Akzeptiere "mail" oder "nachricht"
  const pattern = /^folgende\s+(?:mail|nachricht)\s+an\s+([a-zß-]+)\s+(.+)$/i;
  const match = text.match(pattern);
  
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const toName = match[1].trim();
  let bodyHint = match[2].trim();

  // Wenn body leer ist, kein Intent
  if (!bodyHint || bodyHint.length === 0) {
    return null;
  }

  // Entferne trailing Cancel-Formulierungen am Ende (nur am Ende)
  // Pattern: "(, )?(doch )?nicht (rausschicken|schicken|senden|abschicken).?"
  const cancelPattern = /(,\s*)?(?:doch\s+)?nicht\s+(?:rausschicken|schicken|senden|abschicken)\.?\s*$/i;
  bodyHint = bodyHint.replace(cancelPattern, '').trim();

  // Nach Entfernen: Wenn leer, kein Intent
  if (!bodyHint || bodyHint.length === 0) {
    return null;
  }

  // Zusätzlich: Nutze stripCancelPhraseFromBody für robustere Bereinigung
  // (falls noch Reste vorhanden sind, z.B. "doch nicht" am Ende)
  bodyHint = stripCancelPhraseFromBody(bodyHint);

  // Nach Bereinigung: Wenn leer, kein Intent
  if (!bodyHint || bodyHint.trim().length === 0) {
    return null;
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
