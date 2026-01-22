/**
 * Cancel-Phrase Detection und Body-Cleaning
 * 
 * Erkennt Cancel-Phrasen, die AutoSend überschreiben sollen (Preview-only).
 * Normalized Text ist bereits lowercase und ohne Umlaute.
 */

/**
 * Prüft, ob der Text eine Cancel-Phrase enthält.
 * 
 * @param params - { raw: Original-Text, normalized: Normalisierter Text (lowercase, ohne Umlaute) }
 * @returns true wenn Cancel-Phrase erkannt wurde
 */
export function hasCancelPhrase(params: { raw: string; normalized: string }): boolean {
  const { raw, normalized } = params;
  
  if (!normalized || typeof normalized !== 'string') {
    return false;
  }
  if (!raw || typeof raw !== 'string') {
    return false;
  }

  const normalizedLower = normalized.trim().toLowerCase();
  const rawLower = raw.trim().toLowerCase();
  
  if (!normalizedLower && !rawLower) {
    return false;
  }

  // A) Normalized: "nicht senden/schicken/abschicken/rausschicken/verschicken"
  const negationPattern = /\bnicht\s+(?:senden|schicken|abschicken|rausschicken|verschicken)\b/i;
  if (negationPattern.test(normalizedLower)) {
    return true;
  }

  // B) Normalized: "schick(e/en) sie/das (doch )?nicht raus"
  const schickNichtRausPattern = /\bschick(?:e|en)?\s+(?:sie|das)\s+(?:doch\s+)?nicht\s+raus\b/i;
  if (schickNichtRausPattern.test(normalizedLower)) {
    return true;
  }

  // C) Raw TRAILING (am Ende!): "doch nicht" oder "lieber nicht"
  // WICHTIG: Nur am Ende, nicht mitten im Text
  const dochNichtTrailing = /(?:^|[.!?]\s*|,\s*)\b(?:doch\s+nicht|lieber\s+nicht)\b\s*[.!?]?\s*$/i;
  if (dochNichtTrailing.test(rawLower)) {
    return true;
  }

  // D) Raw TRAILING: "schick sie (doch) nicht raus"
  const schickSieNichtRausTrailing = /(?:^|[.!?]\s*|,\s*)\bschick\s+sie\s+(?:doch\s+)?nicht\s+raus\b\s*[.!?]?\s*$/i;
  if (schickSieNichtRausTrailing.test(rawLower)) {
    return true;
  }

  // E) Raw TRAILING: "nicht senden/abschicken/schicken"
  const nichtSendenTrailing = /(?:^|[.!?]\s*|,\s*)\b(?:nicht\s+senden|nicht\s+abschicken|nicht\s+schicken)\b\s*[.!?]?\s*$/i;
  if (nichtSendenTrailing.test(rawLower)) {
    return true;
  }

  // F) Raw TRAILING: Umgangssprachliche Cancel-Phrasen (nur am Ende!)
  // "ach nein", "nee", "nein", "doch nicht", "besser doch nicht", "lieber doch nicht", "ah nein", "ah nee"
  // WICHTIG: Nur am Ende, nicht mitten im Text (z.B. "Das stimmt nicht" -> false)
  const trailingColloquialCancel = /(?:^|[.!?]\s*|,\s*)\b(?:ah\s+nein|ah\s+nee|ach\s+nein|ach\s+nee|nee|nein|doch\s+nicht|besser\s+doch\s+nicht|lieber\s+doch\s+nicht)\b\s*[.!?]?\s*$/i;
  if (trailingColloquialCancel.test(rawLower)) {
    return true;
  }

  return false;
}

/**
 * Entfernt Cancel-Phrasen am Ende des Body-Textes.
 * 
 * @param body - Body-Text (kann Original-Case haben)
 * @returns Bereinigter Body-Text
 */
export function stripCancelPhraseFromBody(body: string): string {
  if (!body || typeof body !== 'string') {
    return body || '';
  }

  let cleaned = body.trim();
  if (!cleaned) {
    return body; // Safety: gib ursprünglichen Body zurück wenn leer
  }

  // Entferne trailing Cancel-Phrasen (nur am Ende)
  // WICHTIG: Reihenfolge ist wichtig - längere Phrasen zuerst
  const cancelPhrases = [
    // "Schick sie nicht raus." / "Schick sie doch nicht raus."
    /\s*[.,]?\s*schick(?:e|en)?\s+(?:sie|das)\s+(?:doch\s+)?nicht\s+raus\s*[.!?]?\s*$/i,
    // "Besser doch nicht." / "Lieber doch nicht."
    /\s*[.,]?\s*(?:besser\s+doch\s+nicht|lieber\s+doch\s+nicht)\s*[.!?]?\s*$/i,
    // "Ah nein." / "Ah nee." / "Ach nein." / "Ach nee."
    /\s*[.,]?\s*(?:ah\s+nein|ah\s+nee|ach\s+nein|ach\s+nee)\s*[.!?]?\s*$/i,
    // "Doch nicht." / "Lieber nicht."
    /\s*[.,]?\s*(?:doch\s+nicht|lieber\s+nicht)\s*[.!?]?\s*$/i,
    // "Nee." / "Nein."
    /\s*[.,]?\s*(?:nee|nein)\s*[.!?]?\s*$/i,
    // "Nicht senden." / "Nicht abschicken." / "Nicht schicken."
    /\s*[.,]?\s*nicht\s+(?:senden|abschicken|schicken)\s*[.!?]?\s*$/i,
  ];

  for (const phrase of cancelPhrases) {
    const before = cleaned;
    cleaned = cleaned.replace(phrase, '').trim();
    // Wenn eine Phrase entfernt wurde, entferne auch trailing Punkt/Komma falls vorhanden
    if (cleaned !== before && /[.,]\s*$/.test(cleaned)) {
      cleaned = cleaned.replace(/[.,]\s*$/, '').trim();
    }
  }

  // Bereinige doppelte Leerzeichen
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Safety: Wenn Body nach Bereinigung leer wäre, gib ursprünglichen Body zurück
  if (!cleaned || cleaned.length === 0) {
    return body;
  }

  return cleaned;
}
