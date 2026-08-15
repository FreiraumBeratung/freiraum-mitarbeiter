const DICTATION_NAME_STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "einem",
  "einen",
  "einer",
  "mein",
  "meine",
  "dein",
  "eure",
  "unser",
  "unsere",
  "zusammen",
  "team",
  "alle",
  "euch",
  "dir",
  "uns",
  "ihr",
  "ihm",
  "mir",
  "mal",
  "doch",
  "auch",
  "noch",
  "kurz",
  "bitte",
  "text",
  "termin",
  "stand",
  "status",
  "update",
  "info",
]);

function capitalizeDictationToken(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function isLikelyDictationName(token: string): boolean {
  const normalized = (token || "").trim().toLowerCase();
  if (normalized.length < 2) return false;
  if (DICTATION_NAME_STOPWORDS.has(normalized)) return false;
  return true;
}

const ASR_EXACT_WORD_FIXES: Record<string, string> = {
  schones: "schönes",
  schoenes: "schönes",
  schoene: "schöne",
  schoenem: "schönem",
  schoenen: "schönen",
  schoener: "schöner",
  schoen: "schön",
  schonem: "schönem",
  schonere: "schönere",
  schonsten: "schönsten",
  schonste: "schönste",
  fuer: "für",
  ueber: "über",
  spaet: "spät",
  spaeter: "später",
  naechste: "nächste",
  naechsten: "nächsten",
  moeglich: "möglich",
  koennen: "können",
  muesste: "müsste",
  wuerde: "würde",
  groses: "großes",
  grosses: "großes",
};

const POSSESSIVE_NOUNS = new Set([
  "frau",
  "mann",
  "sohn",
  "tochter",
  "kind",
  "kinder",
  "chef",
  "chefin",
  "kollege",
  "kollegin",
  "firma",
  "baustelle",
  "angebot",
  "rechnung",
  "projekt",
]);

function applyCasedReplacement(original: string, replacement: string): string {
  if (!original) return replacement;
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original.charAt(0) === original.charAt(0).toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyAsrDictationFixes(input: string): string {
  if (!input) return input;
  let out = input;

  out = out.replace(/\bgeht\s+s\b/gi, (m) => (m.charAt(0) === "G" ? "Geht's" : "geht's"));
  out = out.replace(/\bgehts\b/gi, (m) => (m.charAt(0) === "G" ? "Geht's" : "geht's"));

  out = out.replace(/\b[A-Za-zÄÖÜäöüß]+/g, (word) => {
    const lower = word.toLowerCase();
    const fixed = ASR_EXACT_WORD_FIXES[lower];
    if (!fixed) return word;
    return applyCasedReplacement(word, fixed);
  });

  out = out.replace(
    /\b(mein|meine|dein|deine|sein|seine|ihr|ihre|unser|unsere|euer|eure)\s+([a-zäöüß]+)\b/gi,
    (full, det: string, noun: string) => {
      if (!POSSESSIVE_NOUNS.has(noun.toLowerCase())) return full;
      return `${det} ${capitalizeDictationToken(noun)}`;
    }
  );

  out = out.replace(/\b(was|etwas|nichts)\s+schönes\b/gi, (_m, lead: string) => `${lead} Schönes`);
  out = out.replace(/\bhat\s+schönes\s+gekocht\b/gi, "hat Schönes gekocht");

  return out;
}

function applySpokenDictationOrthography(input: string): string {
  if (!input) return input;
  let out = input;

  out = out.replace(
    /\b(guten\s+(?:tag|morgen|abend)|hi|hallo|hey|moin|servus|liebe[rn]?)\s+([a-zäöüß][a-zäöüß\-']*)\b/gi,
    (full, greet: string, name: string) => {
      if (!isLikelyDictationName(name)) return full;
      const greetCased = greet.replace(/(^|\s)([a-zäöüß])/g, (_m: string, sp: string, ch: string) => sp + ch.toUpperCase());
      return `${greetCased} ${capitalizeDictationToken(name)}`;
    }
  );

  out = out.replace(
    /\b(hier\s+ist)\s+([a-zäöüß][a-zäöüß\-']*)\b/gi,
    (full, prefix: string, name: string) => {
      if (!isLikelyDictationName(name)) return full;
      return `${prefix} ${capitalizeDictationToken(name)}`;
    }
  );

  out = out.replace(
    /\b(Hi|Hallo|Hey|Moin|Servus)\s+([A-ZÄÖÜ][a-zäöüß\-']*)\s+(hier\s+ist)\b/g,
    "$1 $2, $3"
  );

  out = out.replace(
    /\b(hier\s+ist\s+[A-ZÄÖÜ][a-zäöüß\-']*)\s+(ich|wir)\b/g,
    "$1. $2"
  );

  out = out.replace(/([.!?]\s+)([a-zäöüß])/g, (_m, prefix: string, ch: string) => prefix + ch.toUpperCase());

  return out;
}

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

    return applySpokenDictationOrthography(applyAsrDictationFixes(out));
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



