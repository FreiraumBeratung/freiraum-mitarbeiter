import {
  FreeDictationMeta,
  parseFreeDictation,
} from "../../logic/wizard4/free_dictation";

export type Wizard3OneShotPayload = {
  rawText: string; // komplette Original-Sprachnachricht
};

export type VoiceIntent =
  | { type: "navigate"; target: "control-center" | "lead-radar" | "leads" | "mail-compose" | "voice-diagnostics" }
  | { type: "email-compose"; toRaw?: string; to?: string; subjectHint?: string; bodyHint?: string; meta?: { statusEmail?: { isStatus: boolean; rawText: string; toNameRaw: string | null; statusText: string | null; autoSend?: boolean }; freeDictationMeta?: FreeDictationMeta } }
  | { type: "wizard3-one-shot"; payload: Wizard3OneShotPayload }
  | { type: "wizard2-edit-anrede"; newAnrede: string }
  | { type: "wizard2-edit-subject"; newSubject: string }
  | { type: "wizard2-rewrite-body"; instruction: string }
  | { type: "wizard2-edit-anrede-and-rewrite"; newAnrede: string; instruction: string }
  | { type: "email-send" }
  | { type: "email-preview" }
  | { type: "leads-filter"; range: "today" | "yesterday" | "week" }
  | { type: "last-action" }
  | { type: "ai-chat"; query: string }
  | { type: "unknown" };

const DISABLE_WIZARD3_ONESHOT_FOR_TESTING = true;

// ============================================================
// INTENT 4.2: Umgangssprachliche E-Mail-Befehle erkennen
// ============================================================

/**
 * Mail-Verben: Umgangssprachliche Befehle zum Schreiben/Senden von E-Mails
 */
const MAIL_VERBS = [
  "schreib", "schreibe", "schicken", "schick", "hau", "mach", "mache",
  "setz", "setze", "tippe", "tipp", "sende", "send"
];

/**
 * Mail-Nomen: Begriffe für E-Mail/Nachricht
 */
const MAIL_NOUNS = [
  "mail", "email", "e-mail", "nachricht"
];

/**
 * Soft-Words: Füllwörter, die ignoriert werden sollen
 */
const SOFT_WORDS = [
  "mal", "eben", "kurz", "bitte", "mir", "uns", "doch"
];

/**
 * Artikel: Präpositionen/Artikel, die ignoriert werden können
 */
const ARTICLES = [
  "dem", "den", "der", "die", "das", "an", "für"
];

function normalize(text: string) {
  let normalized = (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  // Intent 4.2: Soft-Words entfernen (für flexiblere Erkennung)
  for (const softWord of SOFT_WORDS) {
    const re = new RegExp(`\\b${softWord}\\b`, 'gi');
    normalized = normalized.replace(re, '');
  }
  
  // Mehrfachspaces nach Soft-Word-Entfernung wieder normalisieren
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

const matchAny = (text: string, candidates: string[]) => candidates.some((c) => text.includes(c));

/**
 * Extrahiert eine E-Mail-Adresse aus einem Text per Regex.
 * Gibt die erste gefundene E-Mail-Adresse zurück oder null.
 */
function extractEmailAddress(text: string): string | null {
  if (!text) return null;
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : null;
}

function normalizeRecipient(raw: string): string {
  const original = (raw || "").trim();
  if (!original) return original;

  const lowered = original.toLowerCase();

  // Nur anfassen, wenn es nach E-Mail klingt
  if (
    !lowered.includes(" at ") &&
    !lowered.includes("@") &&
    !lowered.includes(" punkt ")
  ) {
    return original;
  }

  let s = lowered;

  s = s.replace(/\s+at\s+/g, "@");

  s = s.replace(/\s+punkt\s+de\b/g, ".de");
  s = s.replace(/\s+punkt\s+com\b/g, ".com");
  s = s.replace(/\s+punkt\s+net\b/g, ".net");
  s = s.replace(/\s+punkt\s+org\b/g, ".org");

  s = s.replace(/\s+punkt\s+/g, ".");

  s = s.replace(/\s+/g, "");

  return s;
}

/**
 * Prüft, ob ein Sprachbefehl eine E-Mail mit Inhalt beschreibt (Wizard3-OneShot).
 * Erkennt sowohl klassische Befehle ("Schreibe X eine Mail wegen Y") als auch lockere Formulierungen
 * ("Meine Freiraum Beratung mit web.de eine Mail. Es geht um Pizza.").
 */
function detectWizard3OneShot(raw: string, normalized: string): VoiceIntent | null {
  const n = normalized.trim();

  // Hilfsflags für die Erkennung
  const hasMailKeyword =
    n.includes(" mail") ||
    n.includes("email") ||
    n.includes("e mail") ||
    n.includes("eine mail");

  // Varianten, wie sie im Log vorkommen:
  // - "freiraum beratung at web punkt d"
  // - "freiraum beratung mit web de"
  // - "freiraumberatung@web.de"
  const hasFreiraumAddress =
    n.includes("freiraum beratung") ||
    n.includes("freiraumberatung") ||
    n.includes("freiraum, beratung") ||
    n.includes("freiraum beratung mit web de") ||
    n.includes("freiraum beratung mit web punkt d") ||
    n.includes("freiraum beratung at web punkt d") ||
    n.includes("freiraumberatung web de") ||
    n.includes("freiraumberatung@web.de") ||
    n.includes("freiraum beratung mit web punkt de");

  // Klassische „schreib(e) eine Mail"-Formulierungen
  const hasCommandVerb =
    n.startsWith("schreibe ") ||
    n.startsWith("schreib ") ||
    n.includes("schreibe eine mail") ||
    n.includes("schreib eine mail") ||
    n.includes("schreib mal eine mail");

  // Inhaltliche Hinweise (zeigt, dass es um eine Mail mit Inhalt geht)
  const hasContentHint =
    /\bwegen\b/.test(n) ||
    /\bsag\b/.test(n) ||
    /\bfrag\b/.test(n) ||
    /\bdass\b/.test(n) ||
    /\btermin\b/.test(n) ||
    /\bangebot\b/.test(n) ||
    /\bes geht um\b/.test(n) ||
    /\bgeht um\b/.test(n) ||
    /\bum\b/.test(n);

  // STARKES Muster: klassischer Befehl
  const strongPattern = hasMailKeyword && hasFreiraumAddress && hasCommandVerb && hasContentHint;

  // ENTSPANNTERES Muster: lockere Formulierungen wie
  // "meine freiraum beratung mit web de eine mail ..."
  // oder "freiraum beratung mit web de eine mail. es geht um pizza."
  const relaxedPattern =
    hasMailKeyword &&
    hasFreiraumAddress &&
    hasContentHint &&
    !hasCommandVerb; // Kein explizites "schreibe", aber trotzdem Mail + Adresse + Inhalt

  if (!strongPattern && !relaxedPattern) {
    return null;
  }

  // Wenn wir hier sind, behandeln wir den Befehl als Wizard3-OneShot-Mail
  console.log("[fm-voice] detectWizard3OneShot: Wizard3-OneShot erkannt für:", raw);

  return {
    type: "wizard3-one-shot",
    payload: {
      rawText: raw.trim(),
    },
  };
}

/**
 * Parst umgangssprachliche Status-E-Mail-Befehle.
 * Erwartet z.B.: "schreib dem thomas dass ich spater komme"
 * Entfernt führende Verben, Artikel und extrahiert Name + Status-Text.
 * 
 * TASK 3: Improved name extraction to prevent garbage strings like
 * "folgendenachrichtanthomashithomas..."
 */
function parseColloquialStatusEmailCommand(normalized: string): {
  toNameRaw: string | null;
  statusText: string | null;
} {
  // Erwartet z.B.: "schreib dem thomas dass ich spater komme"
  let text = normalized.trim();

  // TASK 3: Special handling for "folgende nachricht an <name>" patterns
  // Extract name directly after "an" to prevent garbage strings
  const folgendeNachrichtAnMatch = text.match(/\bfolgende\s+nachricht\s+an\s+([a-z0-9äöüß]+)\b/i);
  if (folgendeNachrichtAnMatch && folgendeNachrichtAnMatch[1]) {
    const name = folgendeNachrichtAnMatch[1].trim();
    // Extract body: everything after the matched pattern
    const bodyStart = folgendeNachrichtAnMatch[0].length;
    const bodyText = text.slice(bodyStart).trim();
    
    console.log('[intent-router][intent4.2][fixed-name] Extracted name from "folgende nachricht an":', name);
    return {
      toNameRaw: name,
      statusText: bodyText || null,
    };
  }

  // Similar pattern for "folgende email an <name>"
  const folgendeEmailAnMatch = text.match(/\bfolgende\s+(?:email|mail|e-mail)\s+an\s+([a-z0-9äöüß]+)\b/i);
  if (folgendeEmailAnMatch && folgendeEmailAnMatch[1]) {
    const name = folgendeEmailAnMatch[1].trim();
    const bodyStart = folgendeEmailAnMatch[0].length;
    const bodyText = text.slice(bodyStart).trim();
    
    console.log('[intent-router][intent4.2][fixed-name] Extracted name from "folgende email/mail an":', name);
    return {
      toNameRaw: name,
      statusText: bodyText || null,
    };
  }

  // TASK 3: Pattern "an <name>"
  const anNameMatch = text.match(/\ban\s+([a-z0-9äöüß]+)\b/i);
  if (anNameMatch && anNameMatch[1]) {
    const name = anNameMatch[1].trim();
    // Extract body: everything after "an <name>"
    const bodyStart = anNameMatch.index! + anNameMatch[0].length;
    const bodyText = text.slice(bodyStart).trim();
    
    console.log('[intent-router][intent4.2][fixed-name] Extracted name from "an <name>":', name);
    return {
      toNameRaw: name,
      statusText: bodyText || null,
    };
  }

  // Original logic as fallback
  // Führende Schlüsselwörter entfernen
  const prefixes = ["schreib ", "schreibe ", "schreib mal ", "schreibe mal "];
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length);
      break;
    }
  }

  // Kommas durch Leerzeichen ersetzen, damit das Tokenizing einfacher ist
  text = text.replace(/,/g, " ");

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { toNameRaw: null, statusText: null };
  }

  const articles = new Set(["dem", "den", "der", "die", "das"]);

  let idx = 0;

  // TASK 3: Pattern "dem <name>"
  if (idx < tokens.length && articles.has(tokens[idx])) {
    idx++;
    // Next token should be the name
    if (idx < tokens.length) {
      const name = tokens[idx].trim();
      // Skip to body (after "dass" or similar)
      idx++;
      while (idx < tokens.length && tokens[idx] !== "dass" && tokens[idx] !== "dass,") {
        // Skip mail words
        if (!["mail", "email", "e-mail"].includes(tokens[idx].toLowerCase())) {
          idx++;
        } else {
          idx++;
          break;
        }
      }
      if (idx < tokens.length && (tokens[idx] === "dass" || tokens[idx] === "dass,")) {
        idx++;
      }
      const statusTokens = tokens.slice(idx);
      const statusText = statusTokens.join(" ").trim() || null;
      
      console.log('[intent-router][intent4.2][fixed-name] Extracted name from "dem <name>":', name);
      return {
        toNameRaw: name,
        statusText: statusText,
      };
    }
  }

  // Name-Tokens sammeln bis "mail" / "email" / "e-mail" / "dass"
  const mailWords = new Set(["mail", "email", "e-mail", "e-mail.", "mail.", "email."]);
  const nameTokens: string[] = [];
  while (
    idx < tokens.length &&
    !mailWords.has(tokens[idx]) &&
    tokens[idx] !== "dass" &&
    tokens[idx] !== "dass,"
  ) {
    // TASK 3: Stop if we hit common body-start words to prevent garbage
    if (tokens[idx] === "folgende" || tokens[idx] === "nachricht" || tokens[idx] === "an") {
      break;
    }
    nameTokens.push(tokens[idx]);
    idx++;
  }

  // Falls ein "mail"/"email" kommt → überspringen
  while (idx < tokens.length && mailWords.has(tokens[idx])) {
    idx++;
  }

  // Falls Komma oder "dass" nach dem Namen kommt
  if (idx < tokens.length && (tokens[idx] === "dass" || tokens[idx] === "dass,")) {
    idx++;
  }

  const statusTokens = tokens.slice(idx);
  const toNameRaw = nameTokens.join(" ").trim() || null;
  const statusText = statusTokens.join(" ").trim() || null;

  // TASK 3: Clean up toNameRaw - remove common garbage prefixes/suffixes
  let cleanName = toNameRaw;
  if (cleanName) {
    // Remove patterns like "folgendenachrichtan" from the beginning
    cleanName = cleanName.replace(/^folgendenachrichtan/i, '');
    cleanName = cleanName.replace(/^folgendeemailan/i, '');
    cleanName = cleanName.replace(/^folgendemailan/i, '');
    // Only keep if it looks like a real name (at least 2 chars, not starting with numbers)
    if (cleanName && cleanName.length >= 2 && !/^\d/.test(cleanName)) {
      return { toNameRaw: cleanName, statusText };
    }
  }

  return { toNameRaw: cleanName, statusText };
}

/**
 * A3.1 – Parst Free-Diktat-E-Mail-Befehle.
 * Erwartet z.B.: "schreib bitte folgendes an thomas: hi thomas, hier ist denis..."
 * Extrahiert Name und Body-Text (1:1).
 */
/**
 * A3.3 – Parse-Result für Free-Dictation-Commands.
 */
type FreeDictationParseResult = {
  toNameRaw: string;
  bodyText: string;
  autoSend: boolean;
};

/**
 * A3.3 – Parst Free-Dictation-Kommandos aus normalisiertem Text.
 * Erkennt verschiedene Sprechweisen und entfernt AutoSend-Phrasen aus dem Kommando-Teil.
 */
function parseFreeDictationCommand(normalized: string): FreeDictationParseResult | null {
  const text = normalized.trim();

  // Schneller Exit: nichts mit "folgend..." drin => kein Freitext-Diktat
  if (!text.includes("folgenden") && !text.includes("folgendes") && !text.includes("folgende nachricht") && !text.includes("folgende email") && !text.includes("folgende mail")) {
    return null;
  }

  // 1. AutoSend-Phrasen aus dem Kommando entfernen (falls vorhanden)
  const autosendPhrases = [
    "und schick sie direkt raus",
    "und schick sie sofort raus",
    "und schickt sie direkt raus",
    "und schickt sie sofort raus",
    "und schick die nachricht direkt raus",
    "und schick die nachricht sofort raus",
    "und schickt die nachricht direkt raus",
    "und schickt die nachricht sofort raus",
    "und schick die mail direkt raus",
    "und schick die mail sofort raus",
    "und schickt die mail direkt raus",
    "und schickt die mail sofort raus",
    "und schick die email direkt raus",
    "und schick die email sofort raus",
    "und schickt die email direkt raus",
    "und schickt die email sofort raus",
  ];

  let work = text;
  let autoSend = false;

  for (const phrase of autosendPhrases) {
    const idx = work.indexOf(phrase);
    if (idx !== -1) {
      autoSend = true;
      // AutoSend-Phrase aus dem String entfernen
      work = (work.slice(0, idx) + work.slice(idx + phrase.length)).trim();
      break;
    }
  }

  // 2. Mögliche Mustervarianten definieren
  // Achtung: Wir arbeiten hier mit bereits normalisierten Strings (nur a-z und Leerzeichen).
  const patterns: RegExp[] = [
    // "sende (bitte) folgende nachricht/email/mail an thomas <body>"
    // Unterstützt auch mehrteilige Namen wie "freiraum beratung"
    /^sende (?:bitte )?folgende (?:nachricht|email|mail) an ([a-z ]+?) (.+)$/u,

    // "schreib bitte folgendes an thomas <body>"
    // Unterstützt auch mehrteilige Namen
    /^schreib bitte folgendes an ([a-z ]+?) (.+)$/u,

    // "schreib thomas bitte folgendes <body>"
    // Unterstützt auch mehrteilige Namen
    /^schreib ([a-z ]+?) bitte folgendes (.+)$/u,

    // "schreib thomas folgendes <body>"
    // Unterstützt auch mehrteilige Namen
    /^schreib ([a-z ]+?) folgendes (.+)$/u,

    // "schreib bitte thomas folgendes <body>"
    // Unterstützt auch mehrteilige Namen
    /^schreib bitte ([a-z ]+?) folgendes (.+)$/u,
  ];

  for (const pattern of patterns) {
    const match = work.match(pattern);
    if (match && match[1] && match[2]) {
      let toNameRaw = match[1].trim();
      let bodyText = match[2].trim();

      // Doppelpunkt am Ende des Namens entfernen (falls vorhanden)
      if (toNameRaw.endsWith(":")) {
        toNameRaw = toNameRaw.slice(0, -1).trim();
      }

      // Doppelpunkt am Anfang des Body-Texts entfernen (falls vorhanden)
      if (bodyText.startsWith(":")) {
        bodyText = bodyText.slice(1).trim();
      }

      if (!toNameRaw || !bodyText) {
        continue;
      }

      return {
        toNameRaw,
        bodyText,
        autoSend,
      };
    }
  }

  return null;
}

/**
 * A3.3 – Hilfsfunktion: Erkennt Body-Text und AutoSend-Wunsch aus rohem Body-Text.
 * (Wird nicht mehr verwendet, bleibt für Rückwärtskompatibilität)
 */
function detectFreeDictationBodyAndAutoSend(rawBody: string): {
  bodyText: string;
  autoSendWanted: boolean;
} {
  const FREE_DICTATION_AUTOSEND_PHRASES = [
    "und schick sie direkt raus",
    "und schick sie sofort raus",
    "und schick die nachricht direkt raus",
    "und schick die nachricht sofort raus",
    "und schick die mail direkt raus",
    "und schick die mail sofort raus",
    "und sende sie direkt raus",
    "und sende sie sofort raus",
    "und sende die nachricht direkt raus",
    "und sende die nachricht sofort raus",
  ];

  const normalizedBody = (rawBody || "").toLowerCase().trim();
  let autoSendWanted = false;

  // Prüfe auf AutoSend-Phrasen
  for (const phrase of FREE_DICTATION_AUTOSEND_PHRASES) {
    if (normalizedBody.includes(phrase)) {
      autoSendWanted = true;
      break;
    }
  }

  // Body bereinigen (AutoSend-Phrasen entfernen)
  let bodyText = stripAutoSendPhrasesFromBody(rawBody);

  return {
    bodyText,
    autoSendWanted,
  };
}

function parseFreeDictationEmailCommand(normalized: string): {
  toNameRaw: string | null;
  bodyText: string | null;
  autoSendWanted?: boolean;
} {
  let text = normalized.trim();

  // A3.3 – Neue Patterns für erweiterte Alltagssprache
  type FreeDictationPattern = {
    kind: "schreib-name-bitte" | "schreib-name-nachricht" | "sende-email-an";
    regex: RegExp;
  };

  const FREE_DICTATION_PATTERNS: FreeDictationPattern[] = [
    {
      kind: "schreib-name-bitte",
      // z.B.: "schreib thomas bitte folgendes hi thomas ..."
      regex: /^schreib(?:e)?\s+(?:dem\s+|der\s+|den\s+)?([a-zäöüß]+)\s+bitte\s+folgendes\s+(.*)$/i,
    },
    {
      kind: "schreib-name-nachricht",
      // z.B.: "schreib thomas folgende nachricht hi thomas ..."
      regex: /^schreib(?:e)?\s+(?:dem\s+|der\s+|den\s+)?([a-zäöüß]+)\s+folgende(?:\s+nachricht)?\s+(.*)$/i,
    },
    {
      kind: "sende-email-an",
      // z.B.: "sende bitte folgende email an thomas hi thomas ..."
      regex: /^sende(?:\s+bitte)?\s+folgende(?:\s+e[- ]?mail)?\s+an\s+(?:den\s+|die\s+|dem\s+)?([a-zäöüß]+)\s+(.*)$/i,
    },
  ];

  // Prüfe zuerst neue Patterns
  for (const pattern of FREE_DICTATION_PATTERNS) {
    const m = text.match(pattern.regex);
    if (!m) continue;

    const toNameRaw = m[1]?.trim() || "";
    const rawBody = m[2]?.trim() || "";

    if (!toNameRaw) continue;

    const { bodyText, autoSendWanted } = detectFreeDictationBodyAndAutoSend(rawBody);

    console.log(
      `[intent-router][free-dictation][pattern-${pattern.kind}] Pattern erkannt:`,
      { toNameRaw, bodyText: bodyText.substring(0, 50), autoSendWanted }
    );

    return {
      toNameRaw,
      bodyText,
      autoSendWanted,
    };
  }

  // Bestehende Prefixe (Fallback für alte Kommandos - NICHT ändern)
  const prefixes = [
    "schreib bitte folgendes an ",
    "schreibe bitte folgendes an ",
    "schreib folgendes an ",
    "schreibe folgendes an ",
    "sende bitte folgende nachricht an ",
    "sende folgende nachricht an ",
  ];

  let usedPrefix: string | null = null;
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      usedPrefix = prefix;
      break;
    }
  }

  if (!usedPrefix) {
    return { toNameRaw: null, bodyText: null };
  }

  // Prefix entfernen
  text = text.slice(usedPrefix.length).trim();

  // Wir erwarten jetzt: "<name> ... <rest>"
  // Name ist alles bis zu einem Doppelpunkt oder bis wir eine klare Trennung erkennen.
  // Vereinfachung: Name = erstes Wort, wenn danach ein ":" kommt;
  // oder Name bis zum ersten ":".
  let namePart = text;
  let bodyPart = "";

  const colonIndex = text.indexOf(":");
  if (colonIndex >= 0) {
    namePart = text.slice(0, colonIndex).trim();
    bodyPart = text.slice(colonIndex + 1).trim();
  } else {
    // Kein Doppelpunkt: heuristisch
    // Name = erstes Wort, Body = Rest
    const tokens = text.split(/\s+/);
    if (tokens.length > 1) {
      namePart = tokens[0];
      bodyPart = tokens.slice(1).join(" ").trim();
    } else {
      namePart = text;
      bodyPart = "";
    }
  }

  // kleinere Bereinigung
  namePart = namePart.replace(/,/g, " ").trim();

  if (!namePart) {
    return { toNameRaw: null, bodyText: null };
  }

  // Für bestehende Patterns: AutoSend-Wunsch auch erkennen
  const { bodyText: cleanedBodyPart, autoSendWanted } = detectFreeDictationBodyAndAutoSend(bodyPart);

  return {
    toNameRaw: namePart || null,
    bodyText: cleanedBodyPart || null,
    autoSendWanted,
  };
}

/**
 * A3.2 – Erkennt AutoSend für Free-Diktat-Befehle.
 * Prüft sowohl Prefixe ("sende folgende nachricht") als auch Endings ("und schick sie direkt raus").
 */
function detectFreeDictationAutoSend(normalized: string, bodyText?: string | null): boolean {
  const text = (normalized || "").toLowerCase();

  const sendPrefixes = [
    "sende folgende nachricht an ",
    "sende bitte folgende nachricht an ",
    "sende bitte folgendes an ",
  ];

  const sendEndings = [
    " und schick sie direkt raus",
    " und schick sie sofort raus",
    " und schick die nachricht direkt raus",
    " und schick die nachricht sofort raus",
    " und schick die mail direkt raus",
    " und schick die mail sofort raus",
    " und sende sie direkt raus",
    " und sende sie sofort raus",
    " und sende die nachricht direkt raus",
    " und sende die nachricht sofort raus",
    " bitte direkt abschicken",
    " direkt abschicken",
  ];

  // 1) Prefix-Check
  for (const prefix of sendPrefixes) {
    if (text.startsWith(prefix)) {
      return true;
    }
  }

  // 2) Ending-Check in Normalized
  for (const ending of sendEndings) {
    if (text.endsWith(ending)) {
      return true;
    }
  }

  // 3) Optional: noch BodyText prüfen
  if (bodyText) {
    const body = bodyText.toLowerCase().trim();
    for (const ending of sendEndings) {
      if (body.endsWith(ending)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * A3.2 – Entfernt AutoSend-Phrasen aus dem Body-Text.
 * Entfernt Phrasen sowohl am Anfang als auch am Ende des Body-Texts.
 */
function stripAutoSendPhrasesFromBody(body: string): string {
  if (!body) return body;

  const phrases = [
    "und schick sie direkt raus",
    "und schick sie sofort raus",
    "und schick die nachricht direkt raus",
    "und schick die nachricht sofort raus",
    "und schick die mail direkt raus",
    "und schick die mail sofort raus",
    "und sende sie direkt raus",
    "und sende sie sofort raus",
    "und sende die nachricht direkt raus",
    "und sende die nachricht sofort raus",
    "bitte direkt abschicken",
    "direkt abschicken",
  ];

  let result = body.trim();

  // Wir arbeiten mit einer separaten lowerCase-Kopie für die Checks,
  // schneiden aber immer am Originalstring.
  const stripOnce = (input: string): string => {
    let out = input.trim();
    let lower = out.toLowerCase();

    // 1) Am Anfang entfernen
    for (const phrase of phrases) {
      const p = phrase.toLowerCase();
      if (lower.startsWith(p + " ")) {
        out = out.slice(p.length + 1).trim();
        lower = out.toLowerCase();
        break;
      }
      if (lower.startsWith(p)) {
        out = out.slice(p.length).trim();
        lower = out.toLowerCase();
        break;
      }
    }

    // 2) Am Ende entfernen
    for (const phrase of phrases) {
      const p = phrase.toLowerCase();
      if (lower.endsWith(" " + p)) {
        out = out.slice(0, out.length - (p.length + 1)).trim();
        lower = out.toLowerCase();
        break;
      }
      if (lower.endsWith(p)) {
        out = out.slice(0, out.length - p.length).trim();
        lower = out.toLowerCase();
        break;
      }
    }

    return out.trim();
  };

  // Einmal vorne/hinten aufräumen
  result = stripOnce(result);

  return result.trim();
}

/**
 * Erkennt AutoSend-Trigger im normalisierten Text.
 */
function detectAutoSendFromText(normalized: string): boolean {
  const autoSendTriggers = [
    "schick sie sofort raus",
    "schicke sie sofort raus",
    "schick die mail sofort raus",
    "schick die nachricht sofort raus",
    "sende die mail direkt raus",
    "sende die nachricht direkt raus",
    "direkt rausschicken",
    "sofort senden",
    "direkt senden",
    "schick sie los",
    "schick die nachricht los",
    "schick die mail los",
    "und schick sie los",
    "und sende sie los",
    "bitte direkt rausschicken",
    "bitte direkt senden",
    "schick die mail direkt raus",
    "schick die nachricht direkt raus",
    // >>> NEU für Varianten mit "direkt los" <<<
    "schick die nachricht direkt los",
    "schick die mail direkt los",
    "schick sie direkt los",
    // >>> NEU für "abschicken" Varianten <<<
    "bitte abschicken",
    "abschicken",
    "direkt abschicken",
    "bitte direkt abschicken"
  ];

  for (const trigger of autoSendTriggers) {
    if (normalized.includes(trigger)) {
      return true;
    }
  }
  return false;
}

/**
 * Extrahiert eine Anrede aus dem rohen Text.
 * Beispiele: "Anrede auf Guten Tag" -> "Guten Tag"
 */
function extractGreetingFromRaw(raw: string): string | null {
  const text = raw.trim();

  // Muster: "Anrede auf X", "Anrede in X", "Anrede zu X"
  // Wir stoppen bei Komma, Punkt, "und" oder Satzende.
  const re = /anrede\s+(?:auf|in|zu)\s+(.+?)(?:,|\.|\bund\b|$)/i;
  const match = text.match(re);
  if (!match) {
    return null;
  }

  let greeting = match[1].trim();

  // Beispiel: "Mahlzeit" oder "Guten Tag"
  // Eventuelle Rest-Wörter wie "und" am Ende entfernen:
  greeting = greeting.replace(/\bund\b.*$/i, "").trim();

  if (!greeting) {
    return null;
  }

  // Ersten Buchstaben groß schreiben (Rest so lassen)
  greeting = greeting[0].toUpperCase() + greeting.slice(1);

  return greeting;
}

/**
 * Extrahiert einen Betreff aus dem rohen Text.
 * Beispiele: "Betreff auf Termin" -> "Termin"
 */
function extractSubjectFromRaw(raw: string): string | null {
  const text = raw.trim();

  // Muster: "Betreff auf X" oder "Betreff zu X"
  const re = /betreff\s+(?:auf|zu)\s+(.+?)(?:,|\.|$)/i;
  const match = text.match(re);
  if (!match) {
    return null;
  }

  let subject = match[1].trim();

  if (!subject) {
    return null;
  }

  // Punkt am Ende entfernen
  subject = subject.replace(/[.!?]\s*$/g, "").trim();

  // ersten Buchstaben groß machen (z.B. "termin" -> "Termin")
  subject = subject[0].toUpperCase() + subject.slice(1);

  return subject;
}

/**
 * Extrahiert die Anweisung für Text-Umschreibung aus dem rohen Text.
 * Findet Marker wie "mach den text" und extrahiert alles danach.
 */
function extractInstructionFromRaw(raw: string): string | null {
  const lower = raw.toLowerCase();

  const markers = [
    "mach den text",
    "macht den text",
    "mach mal den text",
    "mache den text",
    "mach den text ein bisschen",
    "macht den text ein bisschen",
    "füge hinzu",
    "fuge hinzu",
    "füge noch hinzu",
    "erwähne",
    "erwaehne",
    "erwähnen",
    "erwaehnen",
    "schreib die mail",
    "schreibe die mail",
    "schreib die e mail",
    "schreib die email"
  ];

  let idx = -1;
  for (const marker of markers) {
    const i = lower.indexOf(marker);
    if (i !== -1 && (idx === -1 || i < idx)) {
      idx = i;
    }
  }

  // Kein Marker gefunden -> keine klare Instruktion
  if (idx === -1) {
    return null;
  }

  let instruction = raw.slice(idx).trim();

  // Typische Füllwörter am Anfang entfernen
  instruction = instruction.replace(/^(und\s+)?/i, "").trim();

  // Punkt/Satzzeichen am Ende entfernen
  instruction = instruction.replace(/[.!?]\s*$/g, "").trim();

  return instruction || null;
}

/**
 * Hilfsfunktion: Ersten Buchstaben groß schreiben.
 */
function capitalizeFirstWord(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Normalisiert eine Anrede-Phrase: Extrahiert nur die eigentliche Anrede,
 * max. 3 Wörter, ohne "und/aber" usw.
 * Erkennt konkrete Grußformen wie "Guten Tag", "Hallo", etc.
 */
function normalizeGreeting(input: string): string | null {
  const s = input.toLowerCase().trim();
  
  // Nur konkrete Grußformen erkennen, keine Stilbeschreibungen wie "locker", "formell", etc.
  // z.B. "guten morgen macht den text aber kurz" → "guten morgen"
  const candidates: { key: string; value: string }[] = [
    { key: "guten tag", value: "Guten Tag" },
    { key: "guten morgen", value: "Guten Morgen" },
    { key: "guten abend", value: "Guten Abend" },
    { key: "hallo", value: "Hallo" },
    { key: "moin", value: "Moin" },
    { key: "mahlzeit", value: "Mahlzeit" },
    { key: "servus", value: "Servus" },
    { key: "hi", value: "Hi" },
    { key: "hey", value: "Hey" },
  ];

  for (const c of candidates) {
    if (s.startsWith(c.key)) {
      return c.value;
    }
  }

  // Keine bekannte Grußform erkannt -> null zurückgeben
  // (z.B. "locker", "formell", "ernst" sind keine Grußformen)
  return null;
}

/**
 * Erkennt Wizard2-Intents (Anrede/Betreff/Text bearbeiten).
 * Robuste Erkennung für umgangssprachliche Formulierungen.
 * 
 * Unterstützt:
 * - Betreff-Änderungen ("ändere den Betreff auf X")
 * - Anrede-Änderungen ("ändere die Anrede auf X" oder "die Anrede auf X")
 * - Text-Umschreibungen ("mach den Text lockerer")
 * - Kombinationen ("ändere die Anrede auf X und mach den Text Y")
 * - Löschen des gesamten Textes ("lösche den gesamten Text")
 * - Unterscheidung zwischen konkreter Anrede vs. Stilbeschreibung
 */
function detectWizard2Intent(normalized: string, raw: string): VoiceIntent | null {
  // 1) Normalisieren
  let n = normalized.toLowerCase().trim();
  const rawTrimmed = raw.trim();

  // Prüfung: Termin-Intent darf NICHT auslösen, wenn E-Mail-Kontext vorhanden ist
  const lower = n;
  const isEmailContext =
    lower.includes("mail") ||
    lower.includes("e-mail") ||
    lower.includes("email") ||
    lower.includes("schreibe") ||
    lower.includes("schreib");
  const mentionsTermin = lower.includes("termin");

  if (mentionsTermin && isEmailContext) {
    // Termin im E-Mail-Kontext -> Wizard3 soll übernehmen, nicht Wizard2
    return null;
  }

  // typische STT-Fehler glätten
  n = n.replace(/\bdie andere\b/g, "die anrede"); // "die andere" -> "die anrede"
  n = n.replace(/\bandere die andere\b/g, "ändere die anrede");
  // Optional: "Anträge" -> "Anrede" (STT-Fehler)
  n = n.replace(/\bantrage\b/g, "anrede");
  n = n.replace(/\banträge\b/g, "anrede");

  // 2) Löschen des gesamten Textes (ganz früh prüfen)
  if (n.includes("losche den gesamten text") || n.includes("lösche den gesamten text")) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Lösche gesamten Text):", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed, // volle Original-Aussage als Anweisung
    };
  }

  // 3) --- Betreff ändern ---
  // Beispiele aus Logs:
  // - "ändere den betreff auf termin morgen"
  // - "andere den betreff zu pizza"
  // - "änder den betreff in xyz"
  // - "mach den betreff zu pizza"
  // - "mach den betreff auf xyz"

  // Variante 1: "ändere/ander/andere den betreff ..."
  {
    const subjectMatch = n.match(
      /(ander|ändere|aendere|änder|andere)\s+den\s+betreff\s*(?:auf|zu|in)?\s+(.+)/
    );
    if (subjectMatch) {
      const subjectRaw = subjectMatch[2].trim();
      if (subjectRaw) {
        // Entferne Satzzeichen am Ende
        const cleanSubject = subjectRaw.replace(/[.,!?]\s*$/, "").trim();
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-subject:", cleanSubject);
        return {
          type: "wizard2-edit-subject",
          newSubject: cleanSubject,
        };
      }
    }
  }

  // Variante 2: "mach den betreff ..."
  {
    const subjectMatch2 = n.match(
      /mach\s+den\s+betreff\s*(?:auf|zu|in)?\s+(.+)/
    );
    if (subjectMatch2) {
      const subjectRaw = subjectMatch2[1].trim();
      if (subjectRaw) {
        // Entferne Satzzeichen am Ende
        const cleanSubject = subjectRaw.replace(/[.,!?]\s*$/, "").trim();
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-subject (mach):", cleanSubject);
        return {
          type: "wizard2-edit-subject",
          newSubject: cleanSubject,
        };
      }
    }
  }

  // 4) --- Text komplett oder teilweise ändern ---
  // Beispiel:
  // "ändere den text komplett in eine kleine geschichte"
  // "ander den text in ..."
  // "andere den text komplett ..."
  if (n.startsWith("andere den text") || n.startsWith("änder den text") || n.startsWith("ändere den text")) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Text ändern):", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed,
    };
  }

  // 5) Keywords für Text-Änderungen
  const textKeywords = [
    "mach den text",
    "macht den text",
    "den text etwas",
    "den text sehr",
    "text lockerer",
    "text formell",
    "text formeller",
    "text lustiger",
    "text kurzer",
    "text kurz",
    "füge hinzu",
    "fuge hinzu",
    "erwähne",
    "erwahne",
    "erzähle einen witz",
    "erzahle einen witz",
    "witz im text",
    "lustige geschichte",
    "sehr lustige geschichte",
  ];

  const hasTextRewriteKeyword = textKeywords.some((k) => n.includes(k));

  // 6) --- "Schreib in die Anrede X und in den Text ..." ---
  {
    const m = n.match(/schreib in die anrede (.+?) und in den text (.+)/);
    if (m) {
      const anredeRaw = m[1].trim();
      const greeting = normalizeGreeting(anredeRaw);
      const instruction = rawTrimmed;

      if (greeting) {
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite (Schreib in die Anrede):", { newAnrede: greeting, instruction });
        return {
          type: "wizard2-edit-anrede-and-rewrite",
          newAnrede: greeting,
          instruction,
        };
      }
      // falls kein gültiges Greeting -> späterer rewrite-body-Fallback
    }
  }

  // 7) --- "Mach als Anrede Guten Morgen, lösche den bestehenden Text ..." ---
  {
    const m = n.match(/mach als anrede (.+?),(.*)/);
    if (m) {
      const anredeRaw = m[1].trim();
      const greeting = normalizeGreeting(anredeRaw);
      const instruction = rawTrimmed;

      if (greeting) {
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite (Mach als Anrede mit Komma):", { newAnrede: greeting, instruction });
        return {
          type: "wizard2-edit-anrede-and-rewrite",
          newAnrede: greeting,
          instruction,
        };
      }
    }
  }

  // 8) --- "Mach als Anrede Guten Morgen ..." (ohne Komma) ---
  {
    const m = n.match(/mach als anrede (guten morgen|guten tag|guten abend|moin|mahlzeit|hallo|servus|hi|hey)(.*)/);
    if (m) {
      const anredeRaw = m[1].trim();
      const greeting = normalizeGreeting(anredeRaw);
      const instruction = rawTrimmed;

      if (greeting) {
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite (Mach als Anrede ohne Komma):", { newAnrede: greeting, instruction });
        return {
          type: "wizard2-edit-anrede-and-rewrite",
          newAnrede: greeting,
          instruction,
        };
      }
    }
  }

  // 9) --- Stil-Anrede + Text-Stil ohne konkrete Grußform ---
  // Beispiel: "mach die anrede locker und den text ernst"
  // -> KEINE konkrete Grußform ("Locker" ist kein Greeting)
  //    deshalb: nur Rewrite
  const matchAnredeTextStyle = n.match(/mach die anrede (.+?) und den text (.+)/);
  if (matchAnredeTextStyle) {
    const anredePart = matchAnredeTextStyle[1].trim(); // z.B. "locker"
    const textPart = matchAnredeTextStyle[2].trim();   // z.B. "ernst"

    const greeting = normalizeGreeting(anredePart);
    if (!greeting) {
      // Stil-Anweisung, keine echte Anrede -> Rewrite des gesamten Textes
      console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Stil-Anrede ohne konkrete Grußform):", rawTrimmed);
      return {
        type: "wizard2-rewrite-body",
        instruction: rawTrimmed,
      };
    }
    // Falls echte Anrede erkannt wurde (z.B. "mach die anrede guten tag und den text ernst"),
    // wird das später in der Anrede-Basis-Match-Logik behandelt
  }

  // 10) --- Anrede + Text gleichzeitig ändern ---
  // Beispiele:
  // - "ändere die anrede auf mahlzeit und füge dann im text hinzu, dass ich telefonisch erreichbar bin"
  // - "ändere die anrede auf guten tag und erwähne im text, dass ich telefonisch erreichbar bin"
  {
    const m = n.match(
      /(andere|ändere|aendere)\s+die\s+anrede\s+auf\s+(.+?)\s+und\s+(.+)/
    );
    if (m) {
      const greetingRaw = m[2].trim();
      const greeting =
        normalizeGreeting(greetingRaw) ||
        (greetingRaw.length > 0
          ? greetingRaw.charAt(0).toUpperCase() + greetingRaw.slice(1)
          : greetingRaw);

      const instruction = rawTrimmed;

      if (greeting) {
        console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite (Anrede+Text-Kombi):", { newAnrede: greeting, instruction });
        return {
          type: "wizard2-edit-anrede-and-rewrite",
          newAnrede: greeting,
          instruction,
        };
      }
      // Falls greeting nicht erkannt werden kann, kümmert sich späterer Fallback
    }
  }

  // 11) --- Stil-Änderung für Anrede + Text (verschiedene Varianten) ---
  // Beispiele:
  // - "mache die anrede und text formeller"
  // - "mach die anrede und text formeller"
  // - "mache den text und die anrede formeller"
  // - "mach den text und die anrede formeller"
  // - "mach die texte und die anrede formeller"
  if (
    n.includes("mache die anrede und text formeller") ||
    n.includes("mach die anrede und text formeller") ||
    n.includes("mache den text und die anrede formeller") ||
    n.includes("mach den text und die anrede formeller") ||
    n.includes("mach die texte und die anrede formeller")
  ) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Stil: Anrede+Text formeller):", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed,
    };
  }

  // 12) Spezialfall:
  // "mach die anrede und den text ..." -> NUR Rewrite, Anrede bleibt erhalten
  if (n.includes("mach die anrede und den text") || n.includes("mach die anrede und text")) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (Anrede+Text ohne neue Anrede):", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed,
    };
  }

  // 13) Short-Form-Anrede ("die anrede auf X" ohne "ändere")
  const anredeShortMatch = n.match(/die\s+anrede\s+auf\s+(.+)/);
  if (anredeShortMatch) {
    const anredeRaw = anredeShortMatch[1].trim();
    const greeting = normalizeGreeting(anredeRaw);
    if (greeting) {
      // Nur Anrede (keine Text-Komponente prüfen, das wird später behandelt)
      console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede (Short-Form):", greeting);
      return {
        type: "wizard2-edit-anrede",
        newAnrede: greeting,
      };
    }
    // Wenn kein Greeting erkannt wird, lassen wir das hier durchfallen,
    // und ggf. später als rewrite-body behandeln.
  }

  // 14) Anrede-Basis-Match (mit "ändere" oder "mach")
  // Wir versuchen, den Teil nach "die anrede" zu greifen.
  // Beispiele:
  // - ändere die anrede auf guten tag und mach den text formeller
  // - ändere die anrede guten morgen und füge hinzu, dass ...
  // - mach die anrede locker und den text ernst (wird bereits in Schritt 6 behandelt)
  const anredeBaseMatch = n.match(
    /(?:ander|ändere|aendere|änder|mach|mache)\s+die\s+anrede(?:\s+auf)?\s+(.+)/
  );

  let greetingPhrase: string | null = null;
  let instructionFromAnredePart: string | null = null;

  if (anredeBaseMatch) {
    const rest = anredeBaseMatch[1].trim();

    // versuche, an "und"/"aber"/"," zu splitten,
    // um Anrede und Rest-Anweisung zu trennen
    const split = rest.split(/\b(?:und|aber)\b/);
    const rawGreeting = split[0].trim();
    
    // Prüfe, ob es eine konkrete Anrede ist oder nur Stilbeschreibung
    greetingPhrase = normalizeGreeting(rawGreeting);
    
    // Wenn normalizeGreeting null zurückgibt, ist es keine konkrete Anrede
    // (z.B. "formell", "locker", "sehr ernst")
    if (!greetingPhrase) {
      // KEINE echte Grußform, z.B. "formell, den text auch sehr formell"
      // → kein edit-anrede, nur rewrite
      console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body (keine konkrete Anrede, nur Stil):", rawTrimmed);
      return {
        type: "wizard2-rewrite-body",
        instruction: rawTrimmed,
      };
    }

    if (split.length > 1) {
      // alles nach dem ersten "und/aber" als Instruktion
      instructionFromAnredePart = rest.slice(rest.indexOf(split[1])).trim();
    }
  }

  // 15) Wenn wir Anrede + Text-Keywords haben -> Kombi-Intent
  if (greetingPhrase && hasTextRewriteKeyword) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede-and-rewrite:", { newAnrede: greetingPhrase, instruction: instructionFromAnredePart || rawTrimmed });
    return {
      type: "wizard2-edit-anrede-and-rewrite",
      newAnrede: greetingPhrase,
      instruction: instructionFromAnredePart || rawTrimmed,
    };
  }

  // 16) Nur Anrede (ohne Text-Keywords)
  if (greetingPhrase && !hasTextRewriteKeyword) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-edit-anrede:", greetingPhrase);
    return {
      type: "wizard2-edit-anrede",
      newAnrede: greetingPhrase,
    };
  }

  // 17) Nur Text-Änderung (ohne explizite Anrede-Änderung)
  if (!greetingPhrase && hasTextRewriteKeyword) {
    console.log("[fm-voice] detectWizard2Intent -> wizard2-rewrite-body:", rawTrimmed);
    return {
      type: "wizard2-rewrite-body",
      instruction: rawTrimmed,
    };
  }

  // 11) Wenn nichts passt -> kein Wizard2
  return null;
}

/**
 * Versucht, einen E-Mail-Compose-Befehl aus dem gesprochenen Text zu extrahieren.
 * Beispiele:
 *  - "schreibe freiraumberatung@web.de eine email"
 *  - "schreibe freiraum beratung at web punkt de eine mail"
 *  - "schreib max mustermann eine mail wegen angebot"
 */
function parseEmailCompose(text: string): { toRaw: string; bodyHint?: string } | null {
  const original = text.trim();
  if (!original) return null;

  const lowered = original.toLowerCase();

  if (!lowered.startsWith("schreib")) {
    return null;
  }

  // Schlagwörter für "mail"
  const mailKeywords = [" email", " e-mail", " mail"];

  const idxMail = mailKeywords
      .map((kw) => lowered.indexOf(kw))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    
    if (idxMail === undefined) {
      return null;
  }

  // Alles zwischen "schreibe" und "email/mail" ist der Empfänger-Teil
  // "schreibe freiraumberatung@web.de eine email"
  // lowered: "schreibe freiraumberatung@web.de eine email"
  // -> nach "schreibe " bis " email"
    const afterVerb = lowered.replace(/^schreib(e)?\s+/, "");
    const beforeMail = afterVerb.split(/\s+(email|e-?mail|mail)\b/)[0];
    
  const rawRecipient = beforeMail.trim();
    if (!rawRecipient) return null;

  let toRaw = normalizeRecipient(rawRecipient);
  
  // Alles NACH dem Mail-Keyword als bodyHint verwenden (optional)
  // Beispiel: "schreibe max mustermann eine email wegen angebot heizung"
  const restAfterMailMatch = afterVerb.split(/\s+(email|e-?mail|mail)\b/)[2] || "";
  const bodyHint = restAfterMailMatch.trim() || undefined;

  return {
    toRaw,
    bodyHint,
  };
}

/**
 * A3.4 – Erweiterte Free-Dictation-Erkennung für Umgangssprache.
 * Erkennt Varianten wie:
 * - "schreib bitte folgendes an thomas ..."
 * - "schreib dem thomas bitte folgende nachricht ..."
 * - "sende bitte folgende email direkt an thomas ..."
 * - "lass uns folgende nachricht an thomas schreiben ..."
 * - "lass uns thomas eine email schreiben ..."
 */
type FreeDictationResultA34 = {
  normalized: string;
  toNameRaw: string;
  bodyText: string;
  autoSend: boolean;
};

/**
 * TASK 3: Reusable extended AutoSend detection helper
 * Detects AutoSend phrases like "sende sie direkt", "schick sie direkt raus", etc.
 * Can be used by both A3.4 free-dictation and "lass-uns" intents.
 */
function detectExtendedAutoSend(normalized: string): boolean {
  const text = normalized.toLowerCase();

  // Exact phrase matches (fast check)
  const autoSendPhrases = [
    'schick sie direkt raus',
    'schick die nachricht direkt los',
    'sende sie direkt raus',
    'sende die nachricht sofort raus',
    'schick sie sofort los',
    'schick die email direkt raus',
    'sende sie dann auch direkt zu ihm',
    'sende sie dann auch direkt zu ihr',
    'schick sie dann auch direkt zu ihm',
    'schick sie dann auch direkt zu ihr',
    // Zusätzliche Varianten für bessere Abdeckung
    'und schick sie direkt raus',
    'und schicke sie direkt raus',
    'und schick es direkt raus',
    'und schicke es direkt raus',
    'und schicke es dann auch direkt los',
    'und schick es dann auch direkt los',
    'und schick sie dann auch direkt los',
    'und schicke sie dann auch direkt los',
    'und sende sie dann auch direkt zu ihm',
    'und sende sie direkt zu ihm',
    'und sende sie direkt an ihn',
    'und sende die email sofort raus',
    'und sende die mail sofort raus',
  ];

  if (autoSendPhrases.some(p => text.includes(p))) {
    return true;
  }

  // Extended regex-based patterns for more flexible detection
  // - "sende sie direkt"
  // - "sende sie dann direkt"
  // - "sende sie direkt zu ihm/ihr"
  // - "sende die nachricht direkt"
  // - "schicke es direkt"
  const extendedPatterns = [
    /\bsende\s+sie\s+direkt\b/i,
    /\bsende\s+sie\s+dann\s+direkt\b/i,
    /\bsende\s+sie\s+direkt\s+zu\s+(?:ihm|ihr)\b/i,
    /\bsende\s+die\s+nachricht\s+direkt\b/i,
    /\bsende\s+es\s+direkt\b/i,
    /\bsende\s+es\s+jetzt\s+direkt\b/i,
    /\bschicke\s+es\s+direkt\b/i,
    /\bschicke\s+sie\s+direkt\b/i,
  ];

  for (const pattern of extendedPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use detectExtendedAutoSend instead
 */
function detectAutoSendFromTextA34(normalized: string): boolean {
  return detectExtendedAutoSend(normalized);
}

function parseFreeDictationA34(normalized: string): VoiceIntent | null {
  const text = normalized.trim().toLowerCase();

  // AutoSend-Erkennung mit erweiterter Funktion
  const hasAutoSendPhrase = detectExtendedAutoSend(text);

  // ------------------------------------------------------------
  // 2. Patterns für Freitext-Diktat
  // ------------------------------------------------------------
  // Wir unterscheiden zwei Gruppen:
  //  A) Name NACH dem Trigger:
  //     - "schreib bitte folgendes an thomas ..."
  //     - "sende bitte folgende nachricht an thomas ..."
  //     - "sende bitte folgende email direkt an thomas ..."
  //
  //  B) Name VOR dem Trigger:
  //     - "schreib dem thomas bitte folgende nachricht ..."
  //     - "schreib thomas bitte folgende nachricht ..."
  //
  // In beiden Fällen wollen wir:
  //   - toNameRaw = "thomas"
  //   - bodyText  = der komplette diktierte Text nach dem Trigger.

  type MatchResult = {
    toNameRaw: string;
    bodyText: string;
  };

  const tryPatterns = (): MatchResult | null => {
    // ---------------------------
    // A) Trigger VOR Name
    // ---------------------------
    const patternsNameAfter: RegExp[] = [
      // "schreib bitte folgende nachricht an thomas ..."
      /^(?:schreib|schreibe)\s+(?:bitte\s+)?folgende nachricht an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,

      // "schreib bitte folgendes an thomas ..."
      /^(?:schreib|schreibe)\s+(?:bitte\s+)?folgendes an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:schreib|schreibe)\s+folgendes an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,

      // "sende bitte folgende nachricht an thomas ..."
      /^(?:sende|send)\s+(?:bitte\s+)?folgende nachricht an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:sende|send)\s+folgende nachricht an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,

      // "sende bitte folgende email (direkt )?an thomas ..."
      /^(?:sende|send)\s+(?:bitte\s+)?folgende email(?: direkt)? an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:sende|send)\s+folgende email(?: direkt)? an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,

      // "sende bitte folgende mail (direkt )?an thomas ..."
      /^(?:sende|send)\s+(?:bitte\s+)?folgende mail(?: direkt)? an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:sende|send)\s+folgende mail(?: direkt)? an\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,

      // NEU: "lass uns folgende nachricht an thomas schreiben ..."
      /^lass uns\s+(?:bitte\s+)?folgende nachricht an\s+(?<name>[a-z0-9äöüß ]+?)\s+schreiben\s+(?<body>.+)$/,

      // NEU: "lass uns thomas folgende nachricht schreiben ..."
      /^lass uns\s+(?:bitte\s+)?(?<name>[a-z0-9äöüß ]+)\s+folgende nachricht\s+schreiben\s+(?<body>.+)$/,

      // NEU: "lass uns thomas eine email schreiben ..."
      /^lass uns\s+(?:bitte\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:eine\s+)?(?:email|e-mail)\s+schreiben\s+(?<body>.+)$/,

      // NEU: "lass uns eine email an thomas schreiben ..."
      /^lass uns\s+(?:bitte\s+)?(?:eine\s+)?(?:email|e-mail)\s+an\s+(?<name>[a-z0-9äöüß ]+)\s+schreiben\s+(?<body>.+)$/,

      // NEU: "lass uns eine mail an thomas schreiben ..."
      /^lass uns\s+(?:bitte\s+)?(?:eine\s+)?mail\s+an\s+(?<name>[a-z0-9äöüß ]+)\s+schreiben\s+(?<body>.+)$/,
    ];

    for (const pattern of patternsNameAfter) {
      const m = text.match(pattern);
      if (m && (m as any).groups) {
        const g = (m as any).groups;
        const toNameRaw = (g.name || '').trim();
        const bodyText = (g.body || '').trim();

        if (!toNameRaw || !bodyText) continue;

        return { toNameRaw, bodyText };
      }
    }

    // ---------------------------
    // B) Name VOR Trigger
    // ---------------------------
    const patternsNameBefore: RegExp[] = [
      // "schreib dem thomas bitte folgende nachricht ..."
      // Unterstützt auch mehrteilige Namen wie "freiraum beratung"
      /^(?:schreib|schreibe)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende nachricht(?:\.|\s+)(?<body>.+)$/,
      /^(?:schreib|schreibe)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende email(?:\.|\s+)(?<body>.+)$/,
      /^(?:schreib|schreibe)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende mail(?:\.|\s+)(?<body>.+)$/,

      // etwas softer:
      // "schreib (dem) thomas bitte folgendes ..."
      /^(?:schreib|schreibe)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgendes\s+(?<body>.+)$/,
    ];

    for (const pattern of patternsNameBefore) {
      const m = text.match(pattern);
      if (m && (m as any).groups) {
        const g = (m as any).groups;
        const toNameRaw = (g.name || '').trim();
        const bodyText = (g.body || '').trim();

        if (!toNameRaw || !bodyText) continue;

        return { toNameRaw, bodyText };
      }
    }

    return null;
  };

  const match = tryPatterns();
  if (!match) {
    // Kein Freitext-Match → A3.4 hier nicht zuständig
    return null;
  }

  const toNameRaw = match.toNameRaw;
  let bodyText = match.bodyText;

  // Minimale Sicherheitschecks
  if (!toNameRaw || bodyText.length < 5) {
    return null;
  }

  // AutoSend-Phrasen aus dem Body entfernen (falls sie dort stehen)
  // Entferne alle Varianten der AutoSend-Phrasen
  const autosendPhrasePatterns = [
    /\s*und\s+(?:schick|schicke|schickt|sende)\s+(?:sie|es|die\s+(?:email|mail|nachricht))?\s+(?:dann\s+)?(?:auch\s+)?(?:direkt|sofort)\s+(?:raus|los|weg|zu\s+(?:ihm|ihr|ihn))\s*/gi,
    /\s*schick\s+sie\s+(?:direkt|sofort)\s+(?:raus|los)\s*/gi,
    /\s*schick\s+die\s+nachricht\s+(?:direkt|sofort)\s+(?:raus|los)\s*/gi,
    /\s*sende\s+sie\s+(?:direkt|sofort)\s+(?:raus|los)\s*/gi,
    /\s*sende\s+die\s+nachricht\s+(?:direkt|sofort)\s+(?:raus|los)\s*/gi,
    /\s*schick\s+die\s+email\s+(?:direkt|sofort)\s+(?:raus|los)\s*/gi,
    /\s*sende\s+sie\s+dann\s+(?:auch\s+)?(?:direkt|sofort)\s+zu\s+(?:ihm|ihr)\s*/gi,
    /\s*schick\s+sie\s+dann\s+(?:auch\s+)?(?:direkt|sofort)\s+zu\s+(?:ihm|ihr)\s*/gi,
  ];

  for (const pattern of autosendPhrasePatterns) {
    bodyText = bodyText.replace(pattern, " ").trim();
  }

  bodyText = bodyText.replace(/\s+/g, " ").trim();

  const autoSend = hasAutoSendPhrase;

  // Wir liefern ein Email-Intent-Objekt zurück
  // Wichtig: toRaw enthält NUR den Namen (z.B. "thomas"), NICHT "folgende nachricht an thomas"
  // Der Contact Resolver erhält damit nur den reinen Namen
  const intent: VoiceIntent = {
    type: "email-compose",
    toRaw: toNameRaw,
    subjectHint: undefined,
    bodyHint: bodyText,
    meta: {
      freeDictationMeta: {
        normalized: text,
        toNameRaw,
        bodyText,
        autoSend,
      },
      source: 'free-dictation-a3.4',
      autoSend: autoSend,
    },
  };

  if (autoSend) {
    console.log('[intent-router][A3.4][autosend-extended] AutoSend detected for Free-Dictation');
  }

  return intent;
}

/**
 * Routet Voice-Intents basierend auf dem gesprochenen Text.
 * 
 * Reihenfolge:
 * 1. Wizard3-OneShot (E-Mail mit Inhalt aus einem Satz)
 * 2. E-Mail-Compose (einfache E-Mail-Erstellung)
 * 3. Navigation/Leads/etc.
 * 4. E-Mail-Send/Preview
 * 5. Wizard2 (Anrede/Betreff/Text bearbeiten) - bevorzugt wenn E-Mail-Kontext aktiv
 * 6. ai-chat Fallback
 * 
 * E-Mail-bezogene Voice-Kommandos (Anrede/Betreff/Text) im E-Mail-Kontext
 * laufen immer zuerst durch Wizard2, bevor sie in ai-chat fallen.
 */
export function routeVoiceIntent(raw: string): VoiceIntent {
  const original = (raw || "").trim();
  const text = normalize(original);

  console.log("[fm-voice] routeVoiceIntent raw:", original);
  console.log("[fm-voice] routeVoiceIntent normalized:", text);

  if (!text) {
    return { type: "unknown" };
  }

  // --------------------------------------------------
  // A3.4: Free-Dictation-Parser (Freitext-Sprachdiktat) - Erweiterte Umgangssprache
  // Versucht, Sätze wie
  // - "sende bitte folgende nachricht an thomas ..."
  // - "sende bitte folgende email direkt an thomas ..."
  // - "schreib bitte folgendes an thomas ..."
  // - "schreib thomas bitte folgendes ..."
  // - "schreib dem thomas bitte folgende nachricht ..."
  // als Freitext-Diktat zu interpretieren.
  // --------------------------------------------------
  const fdIntent = parseFreeDictationA34(text);
  if (fdIntent) {
    const freeDictationData = fdIntent.meta?.freeDictationMeta;
    console.log(
      "[intent-router][free-dictation][A3.4] Freitext-Diktat erkannt:",
      {
        normalized: text,
        toNameRaw: fdIntent.toRaw,
        bodyText: fdIntent.bodyHint?.substring(0, 50),
        autoSend: freeDictationData?.autoSend || (fdIntent.meta as any)?.autoSend || false
      }
    );

    // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
    const extractedEmail = extractEmailAddress(original);
    if (extractedEmail) {
      fdIntent.to = extractedEmail;
      console.log("[intent-router][free-dictation][A3.4] E-Mail-Adresse extrahiert:", extractedEmail);
    }

    return fdIntent;
  }

  // Fallback: Bisherige parseFreeDictation aus free_dictation.ts
  const freeDictation = parseFreeDictation(text);
  if (freeDictation) {
    console.log(
      "[intent-router][free-dictation][A3.4] Freitext-Diktat erkannt (Fallback):",
      { normalized: freeDictation.normalized, toNameRaw: freeDictation.toNameRaw, bodyText: freeDictation.bodyText.substring(0, 50), autoSend: freeDictation.autoSend }
    );

    const emailIntent: VoiceIntent = {
      type: "email-compose",
      toRaw: freeDictation.toNameRaw,
      subjectHint: undefined,
      bodyHint: freeDictation.bodyText,
      meta: {
        freeDictationMeta: freeDictation,
      },
    };

    // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
    const extractedEmail = extractEmailAddress(original);
    if (extractedEmail) {
      emailIntent.to = extractedEmail;
      console.log("[intent-router][free-dictation][A3.4] E-Mail-Adresse extrahiert:", extractedEmail);
    }

    return emailIntent;
  }

  // Spezial-Route: ALLE Sätze mit "schreib ..."
  // Diese Route muss FRÜH kommen, damit sie vor anderen email-compose-Intents greift
  // Erkennt ALLE Varianten: "schreib dem ...", "schreib Freiraum ...", "schreib thomas ...", etc.
  if (
    text.startsWith("schreib ") ||
    text.startsWith("schreibe ") ||
    text.startsWith("schreib mal ") ||
    text.startsWith("schreibe mal ")
  ) {
    console.log(
      "[intent-router][intent-4.2] Umgangssprache-Mail erkannt:",
      text
    );

    const parsed = parseColloquialStatusEmailCommand(text);
    const toNameRaw = parsed.toNameRaw;
    const statusText = parsed.statusText;
    const autoSend = detectAutoSendFromText(text);

    // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
    const extractedEmail = extractEmailAddress(original);

    const meta: any = {
      statusEmail: {
        isStatus: true,
        rawText: text,
        toNameRaw: toNameRaw,
        statusText: statusText,
        autoSend: autoSend,
      },
    };

    const intent: VoiceIntent = {
      type: "email-compose",
      toRaw: toNameRaw || undefined,
      subjectHint: undefined,
      bodyHint: statusText || undefined,
      meta,
    };

    // Wenn eine E-Mail-Adresse per Regex gefunden wurde, diese als 'to' setzen
    if (extractedEmail) {
      intent.to = extractedEmail;
      console.log("[intent-router][intent-4.2] E-Mail-Adresse extrahiert:", extractedEmail);
    }

    return intent;
  }

  // 1) Wizard3-OneShot: E-Mail mit Inhalt erkennen (VOR email-compose)
  if (!DISABLE_WIZARD3_ONESHOT_FOR_TESTING) {
    const wizard3 = detectWizard3OneShot(original, text);
    if (wizard3) {
      console.log("[fm-voice] routeVoiceIntent -> wizard3-one-shot (E-Mail + Inhalt erkannt)");
      return wizard3;
    }
  }

  // 2) E-Mail-Compose Versuch mit einfacher Heuristik (nur wenn kein Wizard3)
  const emailParsed = parseEmailCompose(original);
  if (emailParsed) {
    console.log("[fm-voice] routeVoiceIntent -> email-compose (parsed):", emailParsed);
    
    // Zusätzlich: E-Mail-Adresse per Regex extrahieren (falls vorhanden)
    const extractedEmail = extractEmailAddress(original);
    
    const intent: VoiceIntent = {
      type: "email-compose",
      toRaw: emailParsed.toRaw,
      subjectHint: undefined,
      bodyHint: emailParsed.bodyHint,
    };
    
    // Wenn eine E-Mail-Adresse per Regex gefunden wurde, diese als 'to' setzen
    if (extractedEmail) {
      intent.to = extractedEmail;
      console.log("[fm-voice] E-Mail-Adresse per Regex extrahiert:", extractedEmail);
    }
    
    return intent;
  }

  // navigation
  if (matchAny(text, ["control center", "kontrollzentrum", "kontroll zentrum", "startseite", "dashboard", "uebersicht"])) {
    return { type: "navigate", target: "control-center" };
  }

  if (
    matchAny(text, ["lead radar", "leadradar", "leads radar", "lied radar", "liedradar", "lead scoring", "scoring ansicht"]) ||
    (text.includes("radar") && (text.includes("lead") || text.includes("lied")))
  ) {
    return { type: "navigate", target: "lead-radar" };
  }

  if (
    matchAny(text, ["leads", "zeige leads", "meine leads", "kontakte", "kontakte anzeigen", "kundenliste", "kunden anzeigen"])
  ) {
    return { type: "navigate", target: "leads" };
  }

  if (
    matchAny(text, [
      "voice diagnostics",
      "mikrofon test",
      "mikrofontest",
      "sprach diagnose",
      "sprache testen",
      "mikrofon einstellen",
    ])
  ) {
    return { type: "navigate", target: "voice-diagnostics" };
  }

  if (
    matchAny(text, [
      "email schreiben",
      "schreibe eine email",
      "schreib eine email",
      "schreibe eine mail",
      "schreib eine mail",
      "mail verfassen",
      "neue email",
    ]) &&
    !text.includes(" an ")
  ) {
      return { type: "navigate", target: "mail-compose" };
  }

  // leads filters
  if (
    (text.includes("leads") || text.includes("kunden") || text.includes("kontakte")) &&
    (text.includes("heute") || text.includes("von heute"))
  ) {
    return { type: "leads-filter", range: "today" };
  }
  if (
    (text.includes("leads") || text.includes("kunden") || text.includes("kontakte")) &&
    (text.includes("gestern") || text.includes("von gestern"))
  ) {
    return { type: "leads-filter", range: "yesterday" };
  }
  if (
    (text.includes("leads") || text.includes("kunden") || text.includes("kontakte")) &&
    (text.includes("diese woche") || text.includes("in dieser woche"))
  ) {
    return { type: "leads-filter", range: "week" };
  }

  if (
    text.includes("letzte aktion") ||
    text.includes("was war meine letzte aktion") ||
    text.includes("was habe ich zuletzt gemacht") ||
    text.includes("was war das letzte was ich gemacht habe")
  ) {
    return { type: "last-action" };
  }

  // --- E-Mail Senden / Vorschau ---
  // Beispiele:
  // "sende die mail"
  // "schick die email los"
  // "schicke die mail bitte"
  // "mach eine vorschau"
  // "zeige mir die email-vorschau"
  const SEND_PATTERNS = [
    "sende die mail bitte",
    "sende die email bitte",
    "schick die mail los",
    "schicke die mail los",
    "schick die email los",
    "schicke die email los",
    "schicke bitte die mail ab",
    "schicke bitte die email ab",
    "schick die mail ab",
    "schick die email ab",
    "sofort senden",
    "mail jetzt senden",
    "email jetzt senden",
    "schick sie los",
    "schicke sie los",
    "sende die mail",
    "sende die email",
    "schick die mail",
    "schicke die mail",
    "schick die email",
    "schicke die email",
    "schick email los",
    "schick die mail los",
    "schick die email los",
    "email senden",
    "e mail senden",
    "mail senden",
  ];

  if (SEND_PATTERNS.some((p) => text.includes(p))) {
    console.log("[fm-voice] intent matched: email-send", { normalizedText: text });
    return { type: "email-send" };
  }

  if (
    text.includes("mach eine vorschau") ||
    text.includes("mach die vorschau") ||
    text.includes("zeige mir die vorschau") ||
    text.includes("zeig mir die vorschau") ||
    text.includes("zeige mir die email vorschau") ||
    text.includes("zeig mir die email vorschau")
  ) {
    console.log("[fm-voice] routeVoiceIntent -> email-preview");
    return { type: "email-preview" };
  }

  // 5) Wizard2-Intents (Anrede/Betreff/Text bearbeiten)
  // Prüfe E-Mail-Kontext (wenn verfügbar)
  let isEmailContext = false;
  try {
    // Dynamischer Import, um Zirkelabhängigkeiten zu vermeiden
    const { getLastAction } = require("./voice_action_store");
    const lastAction = getLastAction();
    isEmailContext = lastAction && lastAction.kind === "email-compose";
  } catch {
    // getLastAction nicht verfügbar, ignoriere
  }

  const hasEmailEditKeyword =
    text.includes("anrede") ||
    text.includes("betreff") ||
    text.includes("text ") ||
    text.includes("mach den text") ||
    text.includes("mach die anrede") ||
    text.includes("mach als anrede") ||
    text.includes("schreib in die anrede") ||
    text.includes("losche den gesamten text") ||
    text.includes("lösche den gesamten text");

  // Wenn E-Mail-Kontext aktiv ist und E-Mail-Edit-Keywords vorhanden, bevorzuge Wizard2
  if (isEmailContext && hasEmailEditKeyword) {
    const wizard2 = detectWizard2Intent(text, original);
    if (wizard2) {
      console.log("[fm-voice] routeVoiceIntent -> Wizard2 (E-Mail-Kontext erkannt)");
      return wizard2;
    }
  }

  // Wizard2-Fallback: Auch ohne expliziten E-Mail-Kontext prüfen
  const wizard2Fallback = detectWizard2Intent(text, original);
  if (wizard2Fallback) {
    console.log("[fm-voice] routeVoiceIntent -> Wizard2 (Fallback)");
    return wizard2Fallback;
  }

  // ============================================================
  // "Lass uns ... schreiben" Email Intent Detection
  // MUST run BEFORE intent-4.2 fallback to catch "lass thomas eine mail schreiben"
  // ============================================================
  // Detects collaboration phrases like:
  // - "lass uns folgende nachricht an thomas schreiben..."
  // - "lass uns thomas eine mail schreiben..."
  // - "lass thomas eine mail schreiben..." (STT-damaged, missing "uns")
  {
    const normalized = text.toLowerCase();
    
    // Extended detection logic
    // Check if sentence starts with "lass " and contains email-related keywords
    const startsWithLass = normalized.startsWith('lass ');
    const hasNachrichtAn = normalized.includes('nachricht an ');
    const hasMailAn = normalized.includes('mail an ') || normalized.includes('eine mail an ');
    const hasEineMailSchreib = normalized.includes(' eine mail schreiben');
    
    // Condition a): "lass uns folgende nachricht an thomas schreiben"
    const conditionA = startsWithLass && (hasNachrichtAn || hasMailAn);
    
    // Condition b): "lass thomas eine mail schreiben" (STT-damaged, missing "uns")
    const conditionB = startsWithLass && hasEineMailSchreib;
    
    if (conditionA || conditionB) {
      console.log('[intent-router][lass-uns] Email collaboration phrase detected');
      
      // Determine toNameRaw with improved extraction
      let toNameRaw: string | undefined;
      
      // Priority 1: "nachricht an <name>"
      const matchNachrichtAn = /nachricht\s+an\s+([a-zäöüß]+)/.exec(normalized);
      if (matchNachrichtAn && matchNachrichtAn[1]) {
        toNameRaw = matchNachrichtAn[1].trim();
      }
      
      // Priority 2: "mail an <name>"
      if (!toNameRaw) {
        const matchMailAn = /mail\s+an\s+([a-zäöüß]+)/.exec(normalized);
        if (matchMailAn && matchMailAn[1]) {
          toNameRaw = matchMailAn[1].trim();
        }
      }
      
      // Priority 3: "lass <name> eine mail schreiben" (STT-damaged variant)
      if (!toNameRaw) {
        const matchLassMail = /^lass\s+([a-zäöüß]+)\s+eine\s+mail\s+schreiben/.exec(normalized);
        if (matchLassMail && matchLassMail[1]) {
          const candidate = matchLassMail[1].trim();
          // Exclude common words
          if (!['uns', 'eine', 'der', 'die', 'das', 'dem', 'den'].includes(candidate.toLowerCase())) {
            toNameRaw = candidate;
          }
        }
      }
      
      // If we still don't have a name, don't create "lass-uns" intent
      // Let the fallback logic handle it
      if (!toNameRaw) {
        // Continue to next intent handler
      } else {
        console.log('[intent-router][lass-uns] toNameRaw:', toNameRaw);
        
        // Extract bodyHint correctly from rawText
        let bodyHint: string | undefined;
        
        // Method 1: Split by first period (.)
        const dotIndex = original.indexOf('.');
        if (dotIndex >= 0) {
          const afterDot = original.slice(dotIndex + 1).trim();
          if (afterDot.length > 0) {
            bodyHint = afterDot;
          }
        }
        
        // Method 2: Detect greeting word as starting point (if no period found)
        if (!bodyHint) {
          const greetingPatterns = [
            /\bhi\s+/i,
            /\bhey\s+/i,
            /\bhallo\s+/i,
            /\bguten\s+morgen\s+/i,
            /\bguten\s+tag\s+/i,
            /\bguten\s+abend\s+/i,
            /\blieber\s+/i,
            /\bliebe\s+/i,
          ];
          
          for (const pattern of greetingPatterns) {
            const match = original.toLowerCase().match(pattern);
            if (match && match.index !== undefined) {
              bodyHint = original.slice(match.index).trim();
              break;
            }
          }
        }
        
        if (bodyHint) {
          const preview = bodyHint.length > 80 ? bodyHint.substring(0, 80) + '...' : bodyHint;
          console.log('[intent-router][lass-uns] bodyCandidate extracted:', preview);
        }
        
        // Use reusable AutoSend detection
        const autoSend = detectExtendedAutoSend(normalized);
        
        // TASK 1: Create email-compose intent with same shape as A3.4
        // Use FreeDictationMeta structure so Wizard4 treats it the same way
        const freeDictationMeta: FreeDictationMeta = {
          normalized: normalized,
          toNameRaw: toNameRaw,
          bodyText: bodyHint || "",
          autoSend: autoSend,
        };
        
        const intent: VoiceIntent = {
          type: "email-compose",
          toRaw: toNameRaw,
          subjectHint: undefined,
          bodyHint: bodyHint, // Top-level field, same as A3.4
          meta: {
            freeDictationMeta: freeDictationMeta, // Same structure as A3.4
            source: 'lass-uns',
            autoSend: autoSend,
          },
        };
        
        console.log('[intent-router][lass-uns] Created email-compose intent:', {
          toRaw: toNameRaw,
          hasBodyHint: !!bodyHint,
          bodyHintPreview: bodyHint ? bodyHint.substring(0, 50) : undefined,
          autoSend: autoSend
        });
        console.log('[intent-router][lass-uns] intent bodyHint field:', intent.bodyHint);
        
        return intent;
      }
    }
  }

  // ============================================================
  // INTENT 4.2: Umgangssprachliche E-Mail-Befehle erkennen (Fallback)
  // ============================================================
  // Diese Regel greift für Fälle, die nicht mit "schreib ..." beginnen,
  // aber trotzdem Mail-Verb + Mail-Nomen enthalten.
  // Beispiel: "Hau dem Thomas eine Mail raus"
  {
    const hasMailVerb = MAIL_VERBS.some(verb => {
      // Prüfe, ob das Verb als Wortgrenze vorkommt (nicht als Teil eines anderen Wortes)
      const re = new RegExp(`\\b${verb}\\b`, 'i');
      return re.test(text);
    });
    
    const hasMailNoun = MAIL_NOUNS.some(noun => {
      // Prüfe, ob das Nomen als Wortgrenze vorkommt
      const re = new RegExp(`\\b${noun}\\b`, 'i');
      return re.test(text);
    });
    
    // Nur wenn NICHT mit "schreib" beginnt (dann hätte der frühe Block schon gegriffen)
    const startsWithSchreib = /^schreib(e)?(\s+(mal|bitte|kurz|eben))?\s+/i.test(text);
    
    if (hasMailVerb && hasMailNoun && !startsWithSchreib) {
      console.log(
        "[intent-router][intent-4.2] Umgangssprache-Mail erkannt (Fallback):",
        text
      );
      
      // Versuche, Empfänger und Body-Hint zu extrahieren
      const emailParsed = parseEmailCompose(original);
      const extractedEmail = extractEmailAddress(original);
      
      // Erstelle email-compose Intent
      const intent: VoiceIntent = {
        type: "email-compose",
        toRaw: emailParsed?.toRaw,
        subjectHint: undefined,
        bodyHint: emailParsed?.bodyHint,
      };
      
      // Wenn eine E-Mail-Adresse per Regex gefunden wurde, diese als 'to' setzen
      if (extractedEmail) {
        intent.to = extractedEmail;
        console.log("[intent-router][intent-4.2] E-Mail-Adresse extrahiert:", extractedEmail);
      }
      
      return intent;
    }
  }

  // Fallback: alles, was nicht gematcht wurde, geht an die KI
  // (Wir erlauben der KI damit, freie Fragen, Smalltalk und komplexe Aufgaben zu beantworten.)
  return {
    type: "ai-chat",
    query: original,
  };

  // return { type: "unknown" };  // dieser Return wird dadurch effektiv nie erreicht
}
