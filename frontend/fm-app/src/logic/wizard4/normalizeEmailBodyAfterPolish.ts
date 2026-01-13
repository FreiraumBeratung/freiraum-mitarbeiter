export function normalizeEmailBodyAfterPolish(input: string): string {
  if (!input) return input;

  const text = String(input).replace(/\r\n/g, "\n");

  // Find earliest greeting marker
  // We keep it conservative to avoid false positives in non-email texts.
  const greetingRegex =
    /\b(hi|hallo|hey|guten\s+tag|guten\s+morgen|guten\s+abend|moin|servus|grüß(?:e| dich| euch)?|grues(?:se|s)?|gru(?:ß|ss)(?:e| dich| euch)?)\b/i;

  const match = greetingRegex.exec(text);
  if (!match || match.index == null) return text.trim();

  const idx = match.index;
  if (idx <= 0) return text.trim();

  const prefix = text.slice(0, idx).trim();
  const rest = text.slice(idx).trim();

  // Only cut short prefixes to prevent removing meaningful content.
  // 160 gives more room than 120 for punctuation / polite intro artifacts.
  if (prefix.length === 0 || prefix.length > 160) return text.trim();

  // Detect typical command/meta words that belong to the voice instruction,
  // NOT to the actual email content.
  const commandRegex =
    /\b(schreib(?:e|en)?|verfass(?:e|en)?|formulier(?:e|en)?|schicke|sende(?:n)?|mail|e-?mail|nachricht|direkt\s+los|sofort|jetzt\s+(?:raus|absenden|senden)|los(?:\s+)?(?:senden)?)\b/i;

  if (!commandRegex.test(prefix)) return text.trim();

  // If we reach here: greeting exists, prefix is short, and prefix contains command words.
  // Remove everything before the greeting.
  return rest;
}

