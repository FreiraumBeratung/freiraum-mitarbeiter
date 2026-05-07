export function normalizeEmailBodyAfterPolish(input: string): string {
  if (!input) return input;

  const applyClockAndUmlautNormalization = (value: string): string => {
    let out = value;

    // Zeitformat normalisieren: "20 Uhr 30" / "20 30 Uhr" -> "20:30 Uhr"
    out = out.replace(
      /\b([01]?\d|2[0-3])\s*uhr\s+([0-5]\d)\b/gi,
      (_m, hh: string, mm: string) => `${String(hh)}:${String(mm)} Uhr`
    );
    out = out.replace(
      /\b([01]?\d|2[0-3])\s+([0-5]\d)\s*uhr\b/gi,
      (_m, hh: string, mm: string) => `${String(hh)}:${String(mm)} Uhr`
    );
    out = out.replace(
      /\b([01]?\d|2[0-3])[.:]([0-5]\d)\s*uhr\b/gi,
      (_m, hh: string, mm: string) => `${String(hh)}:${String(mm)} Uhr`
    );

    // Kleine, sichere Umlaut-Restitution für häufige Begriffe aus Diktaten.
    out = out.replace(/\bdoenermann\b/gi, (m: string) =>
      /^[A-ZÄÖÜ]/.test(m) ? "Dönermann" : "dönermann"
    );
    out = out.replace(/\bdonermann\b/gi, (m: string) =>
      /^[A-ZÄÖÜ]/.test(m) ? "Dönermann" : "dönermann"
    );

    return out;
  };

  const text = String(input).replace(/\r\n/g, "\n");

  // Find earliest greeting marker
  // We keep it conservative to avoid false positives in non-email texts.
  const greetingRegex =
    /\b(hi|hallo|hey|guten\s+tag|guten\s+morgen|guten\s+abend|moin|servus|grüß(?:e| dich| euch)?|grues(?:se|s)?|gru(?:ß|ss)(?:e| dich| euch)?)\b/i;

  const match = greetingRegex.exec(text);
  if (!match || match.index == null) return applyClockAndUmlautNormalization(text.trim());

  const idx = match.index;
  if (idx <= 0) return applyClockAndUmlautNormalization(text.trim());

  const prefix = text.slice(0, idx).trim();
  const rest = text.slice(idx).trim();

  // Only cut short prefixes to prevent removing meaningful content.
  // 160 gives more room than 120 for punctuation / polite intro artifacts.
  if (prefix.length === 0 || prefix.length > 160) {
    return applyClockAndUmlautNormalization(text.trim());
  }

  // Detect typical command/meta words that belong to the voice instruction,
  // NOT to the actual email content.
  const commandRegex =
    /\b(schreib(?:e|en)?|verfass(?:e|en)?|formulier(?:e|en)?|schicke|sende(?:n)?|mail|e-?mail|nachricht|zukommen(?:\s+lassen)?|direkt\s+los|sofort|jetzt\s+(?:raus|absenden|senden)|los(?:\s+)?(?:senden)?)\b/i;

  if (!commandRegex.test(prefix)) return applyClockAndUmlautNormalization(text.trim());

  // If we reach here: greeting exists, prefix is short, and prefix contains command words.
  // Remove everything before the greeting.
  return applyClockAndUmlautNormalization(rest);
}



