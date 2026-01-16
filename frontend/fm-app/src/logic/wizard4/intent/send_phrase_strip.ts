export type StripSendPhraseResult = {
  text: string;
  stripped: boolean;
  reason?: string;
};

const NEGATION_RE =
  /\b(nicht|noch\s+nicht|blo(ß|ss)\s+nicht|auf\s+keinen\s+fall)\b.*\b(senden|abschicken|losschicken|rausschicken|schicken|versenden)\b/i;

/**
 * Detects if user explicitly says NOT to send.
 * Examples:
 * - "aber nicht senden"
 * - "noch nicht abschicken"
 */
export function hasNoSendNegation(raw: string): boolean {
  if (!raw) return false;
  return NEGATION_RE.test(raw);
}

/**
 * Removes trailing send / autosend phrases from a message body.
 * This is used AFTER we detect body start marker (e.g. "Hi Thomas ...")
 * so that "und schick es direkt los" does NOT end up inside the body.
 *
 * IMPORTANT: Only matches at the END of the string ($ anchor) to avoid false positives
 * in the middle like "ich schick dir gleich die zahlen".
 *
 * We intentionally handle variants:
 * - "und schick es direkt los"
 * - "und schick das direkt ab"
 * - "bitte direkt senden"
 * - "sofort senden"
 * - "und los"
 * - "schick ab"
 * - "schick ." (kaputter Stummel)
 */
export function stripTrailingSendPhrases(input: string): StripSendPhraseResult {
  const original = input ?? "";
  let text = original.trim();

  if (!text) {
    return { text: original, stripped: false };
  }

  // 1) First "nicht senden" should NOT be stripped (Negation handled elsewhere)
  // -> here we only remove trailing send tails (anchored to end with $)

  // Remove trailing send tails (anchored to $)
  const patterns: RegExp[] = [
    // ", und schick es/das/die mail direkt los/raus/ab" - mit Objekt
    /(?:[,;:]?\s*(?:und\s+)?(?:bitte\s+)?(?:schick(?:e)?|sende)\s+(?:es|das|dies|die\s+(?:mail|nachricht|email))\s+(?:bitte\s+)?(?:direkt\s+)?(?:sofort\s+)?(?:los|raus|ab)\b[.!?]*)\s*$/i,
    
    // ", schick direkt raus/los/ab" / "und schick direkt los" / "sofort senden" / "jetzt abschicken" etc. - ohne Objekt
    /(?:[,;:]?\s*(?:und\s+)?(?:bitte\s+)?(?:sofort\s+|jetzt\s+|gleich\s+|direkt\s+)?(?:raus\s+|los\s+|ab\s+)?(?:senden|schicken|abschicken|rausschicken|verschicken|versenden|ab)\b[.!?]*)\s*$/i,
    
    // "schick(e) los/raus/ab" / "sende los/raus/ab" direkt
    /(?:[,;:]?\s*(?:und\s+)?(?:bitte\s+)?(?:schick(?:e)?|sende)\s+(?:bitte\s+)?(?:direkt\s+)?(?:sofort\s+)?(?:los|raus|ab)\b[.!?]*)\s*$/i,
    
    // kaputter Stummel: ", schick ." / " schick" am Ende
    /(?:[,;:]?\s*(?:und\s+)?(?:bitte\s+)?schick(?:e|en)?\b[.!?]*)\s*$/i,
    
    // "und los" am Ende
    /(?:[,;:]?\s*(?:und\s+)?los\b[.!?]*)\s*$/i,
  ];

  let stripped = false;
  let matched: string | undefined;

  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      matched = m[0];
      text = text.replace(re, "").trim();
      stripped = true;
      break;
    }
  }

  // Cleanup trailing punctuation left behind
  text = text.replace(/[,;:]\s*$/g, "").trim();

  return { text, stripped, reason: stripped ? "trailing-send-phrase" : undefined };
}
