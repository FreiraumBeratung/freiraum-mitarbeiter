import {
  FreeDictationMeta,
  parseFreeDictation,
} from "../../logic/wizard4/free_dictation";
import {
  buildStatusEmailBody,
  detectStatusCategory,
  type StatusCategory,
  type StatusBrainInput,
} from "../../logic/wizard4/status_brain";
import {
  hasNoSendNegation,
  stripTrailingSendPhrases as stripTrailingSendPhrasesV4,
} from "../../logic/wizard4/intent/send_phrase_strip";

export type Wizard3OneShotPayload = {
  rawText: string; // komplette Original-Sprachnachricht
};

export type VoiceIntent =
  | { type: "navigate"; target: "control-center" | "lead-radar" | "leads" | "mail-compose" | "voice-diagnostics" }
  | { type: "email-compose"; toRaw?: string; to?: string; subjectHint?: string; bodyHint?: string; bodyHintRaw?: string; meta?: { statusEmail?: { isStatus: boolean; rawText: string; toNameRaw: string | null; statusText: string | null; autoSend?: boolean }; statusBrain?: { category: StatusCategory; usedTemplate: boolean }; freeDictationMeta?: FreeDictationMeta; source?: string; autoSend?: boolean } }
  | { type: "email-append"; meta?: { autoSend?: boolean }; payload: { appendText: string } }
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
 * Entfernt AutoSend-Phrasen am Ende des appendText (z.B. "und schick sie direkt los", "und sende es sofort los").
 * Arbeitet auf RAW-Text, um sauberes Stripping zu ermöglichen.
 */
/**
 * Entfernt trailing Send-Phrasen am Ende des Body-Texts (z.B. "und los", "und sofort senden").
 * Arbeitet NUR am Satzende, um falsch-positive Matches zu vermeiden.
 * 
 * @param body - Body-Text, aus dem trailing Send-Phrasen entfernt werden sollen
 * @returns { body: string; stripped: boolean } - Bereinigter Body und Flag ob etwas entfernt wurde
 */
function stripTrailingSendPhrasesLegacy(body: string): { body: string; stripped: boolean } {
  if (!body || typeof body !== 'string') {
    return { body: body || '', stripped: false };
  }

  let cleaned = body.trim();
  const original = cleaned;
  let stripped = false;
  let maxIterations = 2; // Maximal 2x hintereinander (falls "und los sofort" etc.)
  let iteration = 0;

  // Liste von Patterns, die NUR am Ende matched werden (trailing send phrases)
  const trailingSendPatterns = [
    // "und los" / "los"
    /(\s*(und\s+)?los\s*[.!?]?)$/i,
    // "und direkt ab"
    /(\s*(und\s+)?direkt\s+ab\s*[.!?]?)$/i,
    // "und sofort" / "sofort"
    /(\s*(und\s+)?sofort\s*[.!?]?)$/i,
    // "und jetzt" / "jetzt"
    /(\s*(und\s+)?jetzt\s*[.!?]?)$/i,
    // "und sofort senden" / "sofort senden" / "senden"
    /(\s*(und\s+)?(sofort\s+)?senden\s*[.!?]?)$/i,
    // "und schick die mail ab" / "schick ab"
    /(\s*(und\s+)?schick\s*(die\s+mail\s+)?(direkt\s+)?ab\s*[.!?]?)$/i,
    // "und sende es/die mail jetzt/sofort ab/los"
    /(\s*(und\s+)?sende\s*(es|die\s+mail)?\s*(jetzt|sofort)?\s*(ab|los)?\s*[.!?]?)$/i,
    // "und schick es/die mail jetzt/sofort ab/los"
    /(\s*(und\s+)?schick\s*(es|die\s+mail)?\s*(jetzt|sofort)?\s*(ab|los)?\s*[.!?]?)$/i,
    // "und schicke es/die mail jetzt/sofort ab/los"
    /(\s*(und\s+)?schicke\s*(es|die\s+mail)?\s*(jetzt|sofort)?\s*(ab|los)?\s*[.!?]?)$/i,
  ];

  while (iteration < maxIterations) {
    let matched = false;
    
    for (const pattern of trailingSendPatterns) {
      const before = cleaned;
      cleaned = cleaned.replace(pattern, '').trim();
      
      if (cleaned !== before) {
        matched = true;
        stripped = true;
        break; // Nur ein Pattern pro Iteration
      }
    }
    
    if (!matched) {
      break; // Nichts mehr gefunden, abbrechen
    }
    
    iteration++;
  }

  return { body: cleaned.trim(), stripped };
}

function stripAutoSendFromAppendText(raw: string): string {
  if (!raw) return raw;
  let s = String(raw);

  // Entferne typische Autosend-Enden komplett (inkl. "und" davor)
  // Beispiele:
  // "..., und schick sie direkt los."
  // "..., schick es jetzt ab"
  // "..., sende sie sofort"
  // "..., und sende das jetzt"
  // "..., und sende es sofort los"
  // "..., sende es sofort los"
  // "..., und sende sie sofort los"
  // "..., und schick die mail direkt los"
  
  // Pattern 1: "schick/schicke/schickt" Varianten
  const schickPattern =
    /(\s*(?:,|\.)?\s*(?:und\s+)?)\b(schick(?:e|en|t)?)\s+(?:es|sie|die\s+(?:mail|email|e-?mail))?\s*(?:jetzt|sofort|direkt)?\s*(?:ab|los|raus)?\b\s*\.?\s*$/i;
  
  // Pattern 2: "sende/send/versende/verschick" Varianten (erweitert)
  const sendePattern =
    /(\s*(?:,|\.)?\s*(?:und\s+)?)\b(sende(?:n)?|send|versende(?:n)?|verschick(?:en)?)\s+(?:es|sie|die\s+(?:mail|email|e-?mail))?\s*(?:jetzt|sofort|direkt)?\s*(?:ab|los|raus)?\b\s*\.?\s*$/i;
  
  // Pattern 3: "direkt los", "sofort los", "jetzt los" am Ende (mit optionalem Verb davor)
  const direktSofortPattern =
    /(\s*(?:,|\.)?\s*(?:und\s+)?)\b(?:sende(?:n)?|send|schick(?:e|en|t)?|versende(?:n)?)\s+(?:es|sie|die\s+(?:mail|email))?\s+(direkt|sofort|jetzt)\s+(los|ab|raus)\b\s*\.?\s*$/i;
  
  // Pattern 4: "sofort senden", "jetzt senden" am Ende
  const sofortSendenPattern =
    /(\s*(?:,|\.)?\s*(?:und\s+)?)(sofort|jetzt)\s+senden\b\s*\.?\s*$/i;

  // nur am Ende strippen (damit wir nicht mitten im Satz etwas entfernen)
  let originalLength = s.length;
  
  // Apply patterns in order (most specific first)
  s = s.replace(direktSofortPattern, "");
  if (s.length !== originalLength) {
    return s.trim();
  }
  
  s = s.replace(sofortSendenPattern, "");
  if (s.length !== originalLength) {
    return s.trim();
  }
  
  s = s.replace(sendePattern, "");
  if (s.length !== originalLength) {
    return s.trim();
  }
  
  s = s.replace(schickPattern, "");
  
  return s.trim();
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
 * Extrahiert Body aus raw Text, behält Groß-/Kleinschreibung und Satzzeichen.
 * Versucht, den Body ab einem Dictation-Marker zu finden (z.B. "folgende Nachricht", "folgende Mail").
 * 
 * @param rawText - Original Text (mit Groß-/Kleinschreibung)
 * @param normalizedText - Normalisierter Text (lowercase, für Fallback-Logik)
 * @param bodyHintNormalized - Bereits extrahierter Body aus normalized Text (für Fallback)
 * @returns Body aus raw Text oder Fallback auf bodyHintNormalized
 */
function extractBodyFromRaw(
  rawText: string,
  normalizedText: string,
  bodyHintNormalized: string
): string {
  if (!rawText || typeof rawText !== 'string') {
    return bodyHintNormalized || '';
  }

  const trimmedRaw = rawText.trim();
  
  // Dictation-Marker (case-insensitive im rawText suchen, aber original case behalten)
  const dictationMarkers = [
    /folgende\s+nachricht/i,
    /folgende\s+mail/i,
    /folgende\s+e-?mail/i,
    /folgende\s+email/i,
    /folgendes/i,
  ];

  // Suche nach Marker im rawText
  for (const markerPattern of dictationMarkers) {
    const match = trimmedRaw.match(markerPattern);
    if (match && match.index !== undefined) {
      // Body startet nach dem Marker
      let bodyStart = match.index + match[0].length;
      let bodyCandidate = trimmedRaw.substring(bodyStart).trim();
      
      // Entferne optionales "an|zu|dem|den|der <name>" nach dem Marker
      // Aber nur bis zum ersten echten Body-Token (Hi, Hey, Hallo, etc.)
      const namePattern = /^(?:an|zu|dem|den|der)\s+[a-zäöüß]+\s+/i;
      if (namePattern.test(bodyCandidate)) {
        const nameMatch = bodyCandidate.match(namePattern);
        if (nameMatch) {
          bodyCandidate = bodyCandidate.substring(nameMatch[0].length).trim();
        }
      }
      
      // Entferne führende Satzzeichen/Bindewörter nach dem Marker
      bodyCandidate = bodyCandidate.replace(/^[:,\s.]+/, '').trim();
      
      // Validierung: Body sollte ähnlich lang sein wie normalized (mindestens 50% der Länge)
      if (bodyCandidate.length >= (bodyHintNormalized.length * 0.5)) {
        console.debug('[intent-router][body-raw] Extracted body from raw text (dictation marker found):', bodyCandidate.slice(0, 120));
        return bodyCandidate;
      }
    }
  }

  // Fallback: Suche nach Greeting-Token (Hi, Hey, Hallo, etc.)
  const greetingTokens = [
    /\bhi\s+/i,
    /\bhey\s+/i,
    /\bhallo\s+/i,
    /\bmoin\s+/i,
    /\bguten\s+(morgen|tag|abend)\s+/i,
    /\bsehr\s+geehrter?\s+/i,
    /\blieber?\s+/i,
    /\bliebe\s+/i,
  ];

  for (const greetingPattern of greetingTokens) {
    const match = trimmedRaw.match(greetingPattern);
    if (match && match.index !== undefined) {
      const bodyCandidate = trimmedRaw.substring(match.index).trim();
      if (bodyCandidate.length >= (bodyHintNormalized.length * 0.5)) {
        console.debug('[intent-router][body-raw] Extracted body from raw text (greeting token found):', bodyCandidate.slice(0, 120));
        return bodyCandidate;
      }
    }
  }

  // Fallback: Suche nach dem ersten "." nach einem Kommando-Wort
  const commandPatterns = [
    /(?:schreib|schreibe|sende|send|schick|schicke)\s+.*?folgende\s+(?:nachricht|mail|email|e-?mail)/i,
    /(?:schreib|schreibe|sende|send|schick|schicke)\s+.*?folgendes/i,
  ];

  for (const pattern of commandPatterns) {
    const match = trimmedRaw.match(pattern);
    if (match && match.index !== undefined) {
      const afterCommand = trimmedRaw.substring(match.index + match[0].length);
      const dotIndex = afterCommand.indexOf('.');
      
      if (dotIndex >= 0) {
        let bodyCandidate = afterCommand.substring(dotIndex + 1).trim();
        // Entferne führende Satzzeichen
        bodyCandidate = bodyCandidate.replace(/^[:,\s]+/, '').trim();
        
        if (bodyCandidate.length >= (bodyHintNormalized.length * 0.5)) {
          console.debug('[intent-router][body-raw] Extracted body from raw text (after command + dot):', bodyCandidate.slice(0, 120));
          return bodyCandidate;
        }
      }
    }
  }

  // Finaler Fallback: Verwende bodyHintNormalized
  console.debug('[intent-router][body-raw] Using normalized body as fallback');
  return bodyHintNormalized || '';
}

/**
 * Bereinigt Body-Text von Steuer-Phrasen und extrahiert nur die eigentliche Nachricht.
 * 
 * Regeln:
 * A) Wenn ein Nachricht-Startmarker gefunden wird: starte Body ab diesem Marker
 * B) Falls kein Marker: entferne führende Steuerteile
 * C) Aufräumen: trim, Satzzeichen, Mehrfachspaces
 * 
 * @param rawBodyText - Der rohe Body-Text (kann Steuer-Phrasen enthalten)
 * @param toNameRaw - Der extrahierte Empfängername (optional, für bessere Bereinigung)
 * @returns Bereinigter Body-Text ohne Steuer-Phrasen
 * 
 * @example
 * cleanEmailBodyFromCommand("an thomas hi thomas hier ist dennis", "thomas")
 * // => "Hi thomas hier ist dennis"
 */
export function cleanEmailBodyFromCommand(rawBodyText: string, toNameRaw?: string | null): string {
  if (!rawBodyText || typeof rawBodyText !== 'string') {
    return '';
  }

  let text = rawBodyText.trim();
  const beforeCleaning = text;

  // ============================================================
  // REGEL A: Suche nach Nachricht-Startmarkern (auch nach Punkten)
  // ============================================================
  // FIX 1: Unterstütze Marker auch nach Punkten (z.B. "folgende mail. hi thomas ...")
  const messageStartMarkers = [
    /\bhi\s+/i,
    /\bhey\s+/i,
    /\bhallo\s+/i,
    /\bmoin\s+/i,
    /\bservus\s+/i,
    /\bguten\s+morgen\s+/i,
    /\bguten\s+tag\s+/i,
    /\bguten\s+abend\s+/i,
    /\blieber\s+/i,
    /\bliebe\s+/i,
  ];

  for (const marker of messageStartMarkers) {
    const match = text.match(marker);
    if (match && match.index !== undefined) {
      // Body startet ab diesem Marker
      text = text.slice(match.index).trim();
      console.log('[intent-router][body-clean] Nachricht-Startmarker gefunden, Body ab Marker:', text.substring(0, 50));
      break;
    }
  }
  
  // FIX 1: Falls kein Marker gefunden, aber "folgende mail/nachricht" vorhanden ist,
  // entferne alles bis nach dem Marker (inkl. Punkt nach "mail/nachricht")
  // Erweitert um "zu" und "an" Varianten
  if (text === beforeCleaning) {
    const folgendePatterns = [
      /^.*?folgende\s+(?:mail|e-mail|email|nachricht)\s+(?:an|zu)\s+[a-zäöüß]+\s*\.?\s*/i,
      /^.*?folgende\s+(?:mail|e-mail|email|nachricht)\s*\.?\s*/i,
      /^.*?folgende\s+(?:mail|e-mail|email|nachricht)\s+/i,
      /^.*?folgenden\s+text\s+(?:an|zu)\s+[a-zäöüß]+\s*\.?\s*/i,
      /^.*?folgenden\s+text\s*\.?\s*/i,
    ];
    
    for (const pattern of folgendePatterns) {
      if (pattern.test(text)) {
        text = text.replace(pattern, '').trim();
        console.log('[intent-router][body-clean] "folgende mail/nachricht" entfernt, Body ab:', text.substring(0, 50));
        break;
      }
    }
  }

  // ============================================================
  // REGEL B: Falls kein Marker gefunden, entferne Steuerteile
  // ============================================================
  if (text === beforeCleaning) {
    // Kein Marker gefunden, entferne Steuerteile manuell
    
    // 1. Entferne führende Steuerteile: "an <name>" (inkl. optionaler Artikel und Satzzeichen)
    if (toNameRaw) {
      const name = toNameRaw.trim();
      // Escapen von Sonderzeichen im Namen für Regex
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Entferne "an <name>" oder "an dem/den/die <name>" mit optionalen Satzzeichen
      const namePattern = new RegExp(`^an\\s+(?:dem\\s+|den\\s+|die\\s+)?${escapedName}\\s*[\\.:,\\-]?\\s+`, 'i');
      text = text.replace(namePattern, '').trim();
      // Fallback: Auch ohne Leerzeichen nach Satzzeichen (z.B. "an thomas.")
      const namePatternAlt = new RegExp(`^an\\s+(?:dem\\s+|den\\s+|die\\s+)?${escapedName}[\\.:,\\-]\\s*`, 'i');
      text = text.replace(namePatternAlt, '').trim();
    }
    // Generisches "an <name>" Pattern (auch wenn toNameRaw nicht vorhanden)
    text = text.replace(/^an\s+[a-zäöüß]+\s+/i, '').trim();
    // Generisches "an <name>." / "an <name>:" Pattern (auch wenn toNameRaw nicht vorhanden)
    text = text.replace(/^an\s+[a-zäöüß]+[\\.:,\\-]\s*/i, '').trim();

    // 2. Entferne führende Steuerteile: "dem/den/der <name>"
    if (toNameRaw) {
      const demPattern = new RegExp(`^(?:dem|den|der|die|das)\\s+${toNameRaw}\\s+`, 'i');
      text = text.replace(demPattern, '').trim();
    }
    text = text.replace(/^(?:dem|den|der|die|das)\s+[a-zäöüß]+\s+/i, '').trim();

    // 3. Entferne führende Steuerteile: "schreibe/schreib/sende/schick ... mail/email/nachricht" (inkl. Punkt-Support)
    text = text.replace(/^(?:schreib|schreibe|sende|send|schick|schicke)\s+(?:bitte\s+)?(?:folgende\s+)?(?:mail|email|e-mail|nachricht)\s+(?:an|zu)\s+[a-zäöüß]+\s*\.?\s*/i, '').trim();
    text = text.replace(/^(?:schreib|schreibe|sende|send|schick|schicke)\s+(?:bitte\s+)?(?:folgende\s+)?(?:mail|email|e-mail|nachricht)\s*\.?\s*/i, '').trim();
    text = text.replace(/^(?:folgende\s+)?(?:mail|email|e-mail|nachricht)\s+(?:an|zu)\s+[a-zäöüß]+\s*\.?\s*/i, '').trim();
    text = text.replace(/^(?:folgende\s+)?(?:mail|email|e-mail|nachricht)\s*\.?\s*/i, '').trim();
    text = text.replace(/^folgenden\s+text\s+(?:an|zu)\s+[a-zäöüß]+\s*\.?\s*/i, '').trim();
    text = text.replace(/^folgenden\s+text\s*\.?\s*/i, '').trim();

    // 4. Entferne AutoSend-Phrasen am Anfang oder Ende (erweitert um neue Imperativ-Phrasen)
    const autoSendPhrases = [
      /\s*und\s+(?:schick|schicke|sende|send)\s+(?:sie|es|die\s+(?:email|mail|nachricht))?\s+(?:dann\s+)?(?:auch\s+)?(?:direkt|sofort|jetzt)\s+(?:raus|los|weg|zu\s+(?:ihm|ihr|ihn))\s*/gi,
      /\s*schick(?:e)?\s+(?:sie|es|die\s+(?:email|mail|nachricht))?\s+(?:dann\s+)?(?:auch\s+)?(?:direkt|sofort|jetzt)\s+(?:raus|los|weg|zu\s+(?:ihm|ihr|ihn))\s*/gi,
      /\s*sende(?:n)?\s+(?:sie|es|die\s+(?:email|mail|nachricht))?\s+(?:dann\s+)?(?:auch\s+)?(?:direkt|sofort|jetzt)\s+(?:raus|los|weg|zu\s+(?:ihm|ihr|ihn))\s*/gi,
      /\s*(?:direkt|sofort|jetzt)\s+(?:raus|los|senden|schicken|abschicken|rausschicken)\s*/gi,
      /\s*und\s+(?:sende|send|schick|schicke)\s+(?:bitte\s+)?(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\s*/gi,
      /\s*und\s+(?:sende|send|schick|schicke)\s+das\s*/gi,
      /\s*lass\s+uns\s+.*\s+(?:senden|abschicken|rausschicken|verschicken)\s*/gi,
      /\s*lass\s+[a-zäöüß]+\s+(?:bitte\s+)?wissen\s*/gi,
      /\s*und\s+sende\s+(?:bitte\s+)?(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\s*/gi,
    ];

    for (const pattern of autoSendPhrases) {
      text = text.replace(pattern, ' ').trim();
    }

    // 5. Prüfe, ob nach dem Entfernen noch sinnvoller Inhalt vorhanden ist (> 3 Wörter)
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < 3) {
      // Zu wenig Inhalt, versuche es mit dem ursprünglichen Text (nach Marker-Suche)
      text = beforeCleaning.trim();
    }
  }

  // ============================================================
  // REGEL C: Aufräumen
  // ============================================================
  // Trim
  text = text.trim();

  // Entferne führende Satzzeichen/Kommas
  text = text.replace(/^[,.;:!?]+\s*/, '').trim();

  // Ersetze Mehrfachspaces durch Single space
  text = text.replace(/\s+/g, ' ').trim();

  // Debug-Log
  if (beforeCleaning !== text) {
    console.log('[intent-router][body-clean] before:', beforeCleaning.substring(0, 100));
    console.log('[intent-router][body-clean] after:', text.substring(0, 100));
  }

  return text;
}

type StripTailResult = { text: string; stripped: boolean; matched?: string };

/**
 * Entfernt NUR am Ende (tail-only) Negations-Kontrollphrasen wie:
 * ", aber nicht senden", "aber nicht schicken", "nicht abschicken", "noch nicht senden"
 * 
 * Wichtig: NICHT mitten im Satz anfassen (tail-only mit $ anchor).
 * 
 * @param input - Body-Text, aus dem trailing Negations-Phrasen entfernt werden sollen
 * @returns StripTailResult mit bereinigtem Text und Flag ob etwas entfernt wurde
 * 
 * @example
 * stripTrailingNegationSendPhrases("Ich bin gleich da, aber nicht senden.")
 * // => { text: "Ich bin gleich da.", stripped: true, matched: ", aber nicht senden." }
 */
function stripTrailingNegationSendPhrases(input: string): StripTailResult {
  const original = input ?? "";
  let text = original.trim();

  if (!text) {
    return { text: original, stripped: false };
  }

  // Pattern: tail-only Negations-Kontrollphrase
  // Optional: Komma/Punkt + optional "aber" + optional "bitte" + "nicht"/"noch nicht" + Send-Verb
  const negationPattern = /(\s*(?:,|\.)?\s*(?:aber\s+)?(?:bitte\s+)?(?:noch\s+)?nicht\s+(?:senden|schicken|abschicken|absenden|rausschicken|verschicken|versenden)\s*[.!?]?\s*)$/i;

  const match = text.match(negationPattern);
  if (match && match[1]) {
    const matched = match[1];
    text = text.replace(negationPattern, "").trim();

    // Cleanup: Entferne tail-only Reste wie ", aber" / "aber" / ", und" / "und" am Ende
    text = text.replace(/(?:,\s*)?(?:aber|und)\s*$/i, "").trim();

    return { text, stripped: true, matched };
  }

  return { text, stripped: false };
}

/**
 * Parst umgangssprachliche Status-E-Mail-Befehle.
 * Erwartet z.B.: "schreib dem thomas dass ich spater komme"
 * Entfernt führende Verben, Artikel und extrahiert Name + Status-Text.
 * 
 * TASK 3: Improved name extraction to prevent garbage strings like
 * "folgendenachrichtanthomashithomas..."
 */
function parseColloquialStatusEmailCommand(normalized: string, original?: string): {
  toNameRaw: string | null;
  statusText: string | null;
} {
  // Erwartet z.B.: "schreib dem thomas dass ich spater komme"
  let text = normalized.trim();
  const origText = (original || normalized).trim();

  // NEW PATTERN: "bitte folgende nachricht/mail/email <name> (an)? schicken/senden/rausschicken..."
  // Example: "Bitte folgende Nachricht Thomas schicken Hi Thomas, hier ist Dennis..."
  const folgendeNachrichtSchickenMatch = text.match(/\bfolgende\s+(?:nachricht|mail|email|e-?mail)\s+(?:an\s+)?([a-z0-9äöüß]+)\s+(schicken|senden|rausschicken|verschicken|zusenden|abschicken|zukommen\s+lassen|zukommenlassen)/i);
  if (folgendeNachrichtSchickenMatch && folgendeNachrichtSchickenMatch[1]) {
    const name = folgendeNachrichtSchickenMatch[1].trim();
    const verbMatch = folgendeNachrichtSchickenMatch[2];
    
    // Find the body start: after the matched pattern in normalized text
    const matchEndIndex = folgendeNachrichtSchickenMatch.index! + folgendeNachrichtSchickenMatch[0].length;
    let rawBodyTextNormalized = text.slice(matchEndIndex).trim();
    
    // Also extract from original text for better case/punctuation preservation
    // Try to find equivalent position in original text
    // First, find the pattern in original (case-insensitive)
    const originalPattern = new RegExp(`folgende\\s+(?:nachricht|mail|email|e-?mail)\\s+(?:an\\s+)?${name}\\s+(?:${verbMatch})`, 'i');
    const originalMatch = origText.match(originalPattern);
    let rawBodyTextOriginal = origText;
    if (originalMatch && originalMatch.index !== undefined) {
      const originalMatchEnd = originalMatch.index + originalMatch[0].length;
      rawBodyTextOriginal = origText.slice(originalMatchEnd).trim();
    } else {
      // Fallback: use normalized extraction
      rawBodyTextOriginal = rawBodyTextNormalized;
    }
    
    // Clean body text from command phrases (prefer original for better quality)
    const bodyText = cleanEmailBodyFromCommand(rawBodyTextOriginal || rawBodyTextNormalized, name);
    
    console.log('[intent-router][intent4.2][schicken-form] "Schicken-Form" erkannt', {
      name,
      verb: verbMatch,
      bodyPreview: bodyText ? bodyText.substring(0, 60) : null
    });
    
    return {
      toNameRaw: name,
      statusText: bodyText || null,
    };
  }

  // TASK 3: Special handling for "folgende nachricht an <name>" patterns
  // Extract name directly after "an" to prevent garbage strings
  const folgendeNachrichtAnMatch = text.match(/\bfolgende\s+nachricht\s+an\s+([a-z0-9äöüß]+)\b/i);
  if (folgendeNachrichtAnMatch && folgendeNachrichtAnMatch[1]) {
    const name = folgendeNachrichtAnMatch[1].trim();
    // Extract body: everything after the matched pattern
    const bodyStart = folgendeNachrichtAnMatch[0].length;
    const rawBodyText = text.slice(bodyStart).trim();
    // Clean body text from command phrases
    const bodyText = cleanEmailBodyFromCommand(rawBodyText, name);
    
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
    const rawBodyText = text.slice(bodyStart).trim();
    // Clean body text from command phrases
    const bodyText = cleanEmailBodyFromCommand(rawBodyText, name);
    
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
    const rawBodyText = text.slice(bodyStart).trim();
    // Clean body text from command phrases
    const bodyText = cleanEmailBodyFromCommand(rawBodyText, name);
    
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
      const rawStatusText = statusTokens.join(" ").trim() || null;
      // Clean body text from command phrases
      const statusText = rawStatusText ? cleanEmailBodyFromCommand(rawStatusText, name) : null;
      
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
  const rawStatusText = statusTokens.join(" ").trim() || null;
  // Clean body text from command phrases
  const statusText = rawStatusText ? cleanEmailBodyFromCommand(rawStatusText, toNameRaw) : null;

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
 * Erkennt "lass <name> bitte folgendes wissen" Pattern für explicit-body (Wizard4).
 * 
 * Varianten:
 * - "Lass Thomas bitte folgendes wissen, Thomas, hier ist Dennis. Ich komme 15 Minuten später."
 * - "Lass Thomas folgendes wissen: Hi Thomas, ich komme 10 Minuten später."
 * - "Lass Thomas wissen: Ich komme 5 Minuten später."
 * - "Lass Thomas bitte folgendes wissen Hi Thomas, hier ist Dennis."
 * 
 * @param normalized - Normalisierter Text (lowercase, keine Sonderzeichen)
 * @param original - Originaler Text (für bessere Extraktion)
 * @returns VoiceIntent | null - Email-Compose Intent mit bodyHint oder null
 */
function detectLassWissenCommand(normalized: string, original: string): VoiceIntent | null {
  const text = normalized.trim().toLowerCase();
  const origText = original.trim();

  // Pattern für "lass <name> (bitte)? folgendes wissen" oder "lass <name> wissen:"
  // Unterstützt Trennzeichen: ".", ",", ":" nach "wissen"
  const patterns = [
    // "lass <name> bitte folgendes wissen ..." (mit Punkt, Komma oder Doppelpunkt)
    /^lass\s+([a-z0-9äöüß]+)\s+bitte\s+folgendes\s+wissen[:\s,\.]+(.+)$/i,
    // "lass <name> folgendes wissen ..." (mit Punkt, Komma oder Doppelpunkt)
    /^lass\s+([a-z0-9äöüß]+)\s+folgendes\s+wissen[:\s,\.]+(.+)$/i,
    // "lass <name> wissen: ..." (mit Punkt, Komma oder Doppelpunkt)
    /^lass\s+([a-z0-9äöüß]+)\s+wissen[:\s,\.]+(.+)$/i,
    // "lass <name> bitte wissen ..." (ohne "folgendes", mit Punkt, Komma oder Doppelpunkt)
    /^lass\s+([a-z0-9äöüß]+)\s+bitte\s+wissen[:\s,\.]+(.+)$/i,
  ];

  let match: RegExpMatchArray | null = null;
  let toNameRaw: string | null = null;
  let rawBodyText: string | null = null;

  for (const pattern of patterns) {
    match = origText.match(pattern);
    if (match && match[1] && match[2]) {
      toNameRaw = match[1].trim();
      rawBodyText = match[2].trim();
      break;
    }
  }

  if (!toNameRaw || !rawBodyText || rawBodyText.length < 3) {
    return null;
  }

  // Validiere Name (nicht "uns", "eine", "der", etc.)
  const invalidNames = ['uns', 'eine', 'der', 'die', 'das', 'mal', 'bitte', 'folgendes', 'wissen'];
  if (invalidNames.includes(toNameRaw.toLowerCase())) {
    return null;
  }

  // BodyPart-Extraktion: rawBodyText wurde bereits aus den Patterns extrahiert
  // (alles nach "wissen" mit Trennzeichen)
  // Verwende rawBodyText direkt - es enthält bereits den korrekten Body
  let bodyPart = (rawBodyText || '').trim();

  // 1. Strip trailing send phrases NACH Extraktion
  const beforeStrip = bodyPart.trim();
  const stripped = stripTrailingSendPhrasesV4(beforeStrip);

  // DEBUG LOGS
  console.debug("[intent-router][lass-wissen][debug] body beforeStrip:", beforeStrip);
  console.debug("[intent-router][lass-wissen][debug] strip matched:", stripped.matched ?? null);
  console.debug("[intent-router][lass-wissen][debug] body afterStrip:", stripped.text);

  // 2. Strip trailing negation send phrases (z.B. ", aber nicht senden")
  // Dies entfernt die komplette Negations-Phrase, nicht nur das Verb
  const negStripped = stripTrailingNegationSendPhrases(stripped.text);
  console.debug("[intent-router][lass-wissen][debug] negation-strip matched:", negStripped.matched ?? null);
  console.debug("[intent-router][lass-wissen][debug] body afterNegationStrip:", negStripped.text);

  // Guard: Wenn negStripped.text leer ist, abbrechen
  if (!negStripped.text || negStripped.text.trim().length < 3) {
    console.debug("[intent-router][lass-wissen] body empty after stripping -> abort");
    return null;
  }

  // bodyHint ist jetzt der finale Body (OHNE trailing send phrases UND OHNE negation phrases)
  let bodyHint = negStripped.text.trim();

  // Optional: Entferne Name-Duplikat am Anfang (case-insensitive)
  // Wenn bodyHint mit dem Namen startet (z.B. "Thomas, hier ist Dennis..."), entferne es
  if (bodyHint) {
    const namePattern = new RegExp(`^${toNameRaw}\\s*[,.:]?\\s+`, 'i');
    bodyHint = bodyHint.replace(namePattern, '').trim();
  }

  // 3. AutoSend-Erkennung
  // AUTOSEND-REGEL:
  // - Für "lass <name> ... wissen" setze autoSend=true, WENN:
  //   a) das Wort "bitte" im Satz vorkommt ODER
  //   b) eine klare Send-Phrase vorkommt (schick los / sende sofort / direkt raus / und los / schick direkt ab)
  // - Sonst: autoSend=false
  // - AutoSend darf NICHT passieren, wenn im Satz ein klares "nicht senden / nur zeigen / Entwurf / vorlesen / preview" vorkommt

  let autoSend = false;

  // Prüfe zuerst auf Negation (höchste Priorität)
  const hasNegationPreview = checkFalsePositiveExclusion(text);
  const negation = hasNoSendNegation(origText) || hasNoSendNegation(text);
  if (hasNegationPreview || negation) {
    autoSend = false;
    console.debug("[intent-router][autosend] disabled due to negation");
    console.log('[intent-router][lass-wissen] AutoSend blocked - negation/preview detected');
  } else {
    // Prüfe auf "bitte"
    const hasBitte = /\bbitte\b/i.test(origText);
    
    // Prüfe auf Send-Phrasen (senden/schicken/abschicken/rausschicken/los)
    // Aber VORSICHT: nicht "schick dir ..." false-positive
    const sendPhrases = [
      /\b(?:senden|schicken|abschicken|rausschicken|verschicken|losschicken)\b/i,
      /\b(?:schick|schicke|sende|send)\s+(?:los|direkt\s+(?:los|raus|ab)|sofort|jetzt|ab)\b/i,
      /\b(?:direkt|sofort)\s+(?:raus|los|ab)\b/i,
      /\b(?:direkt\s+)?los\b/i,  // "direkt los" oder "los"
      /\bund\s+(?:los|raus)\b/i,
      /\bschick\s+(?:direkt\s+)?ab\b/i,  // "schick ab" oder "schick direkt ab"
      /\braus\s+damit\b/i,  // "raus damit"
      /\bsende\s+jetzt\b/i,  // "sende jetzt"
    ];
    // Guard: Nicht false-positive wie "schick dir", "schick mir"
    const falsePositiveGuard = !/^(?:schick|schicke|sende|send)\s+(?:dir|mir|uns|ihr|euch)\b/i.test(origText);
    const hasSendPhrase = falsePositiveGuard && sendPhrases.some(pattern => pattern.test(origText));

    if (hasBitte || hasSendPhrase) {
      autoSend = true;
      console.log('[intent-router][lass-wissen] AutoSend enabled', {
        hasBitte,
        hasSendPhrase,
      });
    } else {
      autoSend = false;
      console.log('[intent-router][lass-wissen] AutoSend disabled - no "bitte" and no send phrase');
    }
  }

  // bodyHint ist jetzt final (ohne trailing send phrases, ohne Name-Duplikat)
  // bodyHint behält Groß-/Kleinschreibung für bodyHintRaw
  const bodyHintRaw = bodyHint;
  const bodyHintNormalized = bodyHint.toLowerCase();

  const freeDictationMeta: FreeDictationMeta = {
    normalized: text,
    toNameRaw: toNameRaw,
    bodyText: bodyHintNormalized,
    autoSend: autoSend,
  };

  // IMMER email-compose Intent zurückgeben (wenn Body vorhanden)
  const intent: VoiceIntent = {
    type: "email-compose",
    toRaw: toNameRaw,
    subjectHint: undefined,
    bodyHintRaw: bodyHintRaw,
    bodyHint: bodyHintNormalized,
    meta: {
      freeDictationMeta: freeDictationMeta,
      source: 'lass-wissen',
      autoSend: autoSend,
    },
  };

  console.log('[intent-router][lass-wissen] Created email-compose intent', {
    toNameRaw,
    bodyPreview: bodyHint.substring(0, 60),
    autoSend,
  });

  return intent;
}

/**
 * STATUS-BRAIN: Erkennt schnelle Status-Nachrichten VOR der Diktier-Engine.
 * 
 * Erkennt semantische Status-Befehle wie:
 * - "Schreib Thomas, dass ich krank bin"
 * - "Sag Dennis, ich komme später"
 * - "Lass Thomas wissen, dass ich heute nicht komme"
 * 
 * Greift NICHT bei expliziten Text-Diktaten:
 * - "folgende Nachricht/Mail"
 * - Doppelpunkt ":"
 * - Anführungszeichen
 * - Freier Text nach Marker
 * 
 * @param normalized - Normalisierter Text (lowercase, keine Sonderzeichen)
 * @param original - Originaler Text (für bessere Extraktion)
 * @returns VoiceIntent | null - Email-Compose Intent mit fertigem Template-Body oder null
 */
function detectStatusBrainCommand(normalized: string, original: string): VoiceIntent | null {
  const text = normalized.trim();
  const origText = original.trim();

  // ============================================================
  // EXCLUSION: Status-Brain DARF NICHT greifen bei expliziten Text-Markern
  // ============================================================
  // Prüfe auf Marker, die explizites Text-Diktat signalisieren
  const hasExplicitDictationMarker = 
    /\bfolgende\s+(?:nachricht|mail|email|e-mail)\b/i.test(origText) ||
    /\bfolgendes\b/i.test(origText) ||
    /:\s*[A-ZÄÖÜ]/i.test(origText) || // Doppelpunkt gefolgt von Großbuchstabe (z.B. "Thomas: Hi ...")
    /\bhi\s+[a-zäöüß]+\s*,/i.test(origText) || // "Hi Thomas," - explizite Anrede deutet auf Diktat hin
    /["'][^"']*["']/i.test(origText); // Anführungszeichen mit Inhalt

  if (hasExplicitDictationMarker) {
    // Explizites Diktat erkannt → Status-Brain nicht zuständig
    console.log('[status-brain] excluded - explicit dictation marker found');
    return null;
  }

  // ============================================================
  // INCLUSION: Status-Brain Patterns - semantische Status-Befehle
  // ============================================================
  type StatusMatch = {
    toNameRaw: string;
    statusText: string;
  };

  const tryStatusPatterns = (): StatusMatch | null => {
    // Pattern 1: "schreib(e) X, dass ..."
    const match1 = text.match(/^(?:schreib|schreibe)\s+(?:dem\s+|den\s+)?([a-zäöüß]+)\s*[,]?\s*dass\s+(.+)$/i);
    if (match1 && match1[1] && match1[2]) {
      const name = match1[1].trim();
      const statusText = match1[2].trim();
      // Exclude common words that are not names
      if (!['uns', 'eine', 'der', 'die', 'das', 'mal', 'bitte'].includes(name.toLowerCase())) {
        return { toNameRaw: name, statusText };
      }
    }

    // Pattern 2: "schreib(e) X, ich ..."
    const match2 = text.match(/^(?:schreib|schreibe)\s+(?:dem\s+|den\s+)?([a-zäöüß]+)\s*[,]?\s*ich\s+(.+)$/i);
    if (match2 && match2[1] && match2[2]) {
      const name = match2[1].trim();
      const statusText = `ich ${match2[2].trim()}`;
      if (!['uns', 'eine', 'der', 'die', 'das', 'mal', 'bitte'].includes(name.toLowerCase())) {
        return { toNameRaw: name, statusText };
      }
    }

    // Pattern 3: "sag(e) X, ..."
    const match3 = text.match(/^(?:sag|sage)\s+(?:dem\s+|den\s+)?([a-zäöüß]+)\s*[,]?\s*(.+)$/i);
    if (match3 && match3[1] && match3[2]) {
      const name = match3[1].trim();
      const statusText = match3[2].trim();
      if (!['uns', 'eine', 'der', 'die', 'das', 'mal', 'bitte'].includes(name.toLowerCase())) {
        return { toNameRaw: name, statusText };
      }
    }

    // Pattern 4: "lass X wissen, dass ..."
    const match4 = text.match(/^lass\s+([a-zäöüß]+)\s+wissen\s*[,]?\s*dass\s+(.+)$/i);
    if (match4 && match4[1] && match4[2]) {
      const name = match4[1].trim();
      const statusText = match4[2].trim();
      if (!['uns', 'eine', 'der', 'die', 'das'].includes(name.toLowerCase())) {
        return { toNameRaw: name, statusText };
      }
    }

    // Pattern 5: "informiere X, dass ..."
    const match5 = text.match(/^informiere\s+([a-zäöüß]+)\s*[,]?\s*dass\s+(.+)$/i);
    if (match5 && match5[1] && match5[2]) {
      const name = match5[1].trim();
      const statusText = match5[2].trim();
      if (!['uns', 'eine', 'der', 'die', 'das'].includes(name.toLowerCase())) {
        return { toNameRaw: name, statusText };
      }
    }

    // Pattern 6: "schreib(e) X, ..." (ohne "dass" oder "ich", direkt Status-Text)
    // Aber nur wenn Status-Keywords vorhanden sind
    const statusKeywords = /(?:krank|später|spater|spät|spat|verspätet|verspatet|nicht|komme|kommt|termin|absagen|verschieben)/i;
    const match6 = text.match(/^(?:schreib|schreibe)\s+(?:dem\s+|den\s+)?([a-zäöüß]+)\s*[,]?\s*(.+)$/i);
    if (match6 && match6[1] && match6[2] && statusKeywords.test(match6[2])) {
      const name = match6[1].trim();
      const statusText = match6[2].trim();
      if (!['uns', 'eine', 'der', 'die', 'das', 'mal', 'bitte'].includes(name.toLowerCase())) {
        return { toNameRaw: name, statusText };
      }
    }

    return null;
  };

  const match = tryStatusPatterns();
  if (!match) {
    return null;
  }

  let { toNameRaw, statusText } = match;

  // Minimaler Validitätscheck
  if (!toNameRaw || toNameRaw.length < 2 || !statusText || statusText.length < 5) {
    return null;
  }

  // ============================================================
  // AutoSend-Erkennung (MUSS VOR Bereinigung des Status-Texts erfolgen)
  // ============================================================
  const autoSend = detectExtendedAutoSend(text);

  // ============================================================
  // Status-Text von Send-Phrasen bereinigen (für saubere Template-Generierung)
  // ============================================================
  // Entferne Send-Phrasen aus dem Status-Text, damit "und schick das sofort raus"
  // nicht in den Status-Text/Status-Kategorie einfließt
  // ABER: AutoSend wurde bereits oben erkannt, also bleibt sendMode=sendNow
  const cleanedStatusText = statusText
    // Entferne alles ab "und (schick|schicke|sende|send)" bis Satzende
    .replace(/\s+und\s+(schick|schicke|sende|send|senden)\b.*$/i, "")
    // Entferne "sofort raus", "direkt raus", "jetzt", "sofort" am Ende
    .replace(/\s+\b(sofort|jetzt|direkt)\s+(?:raus|ab|los)\b\s*$/i, "")
    .replace(/\s+\b(sofort|jetzt|direkt)\b\s*$/i, "")
    // Entferne "und sende das/die/es" Phrasen
    .replace(/\s+und\s+(?:sende|schick|schicke)\s+(?:das|die|es|sie)\b.*$/i, "")
    // Trim
    .trim();

  // Verwende bereinigten Status-Text, falls vorhanden und nicht zu kurz
  const finalStatusText = (cleanedStatusText && cleanedStatusText.length >= 3) ? cleanedStatusText : statusText;

  console.log('[status-brain] extracted recipient:', toNameRaw);
  console.log('[status-brain] extracted status text (raw):', statusText.substring(0, 50));
  if (cleanedStatusText !== statusText) {
    console.log('[status-brain] cleaned status text (Send-Phrase removed):', finalStatusText.substring(0, 50));
  }

  // ============================================================
  // Status-Kategorie erkennen und Body aus Template generieren
  // ============================================================
  const statusInput: StatusBrainInput = {
    rawText: origText,
    statusText: finalStatusText, // Bereinigter Status-Text ohne Send-Phrasen
    toDisplayName: null, // Wird später vom Contact Resolver gesetzt
  };

  const category = detectStatusCategory(statusInput);
  console.log('[status-brain] detected category:', category);

  // Body aus Template generieren (OHNE expliziten bodyHint aus Nutzereingabe)
  const templateBody = buildStatusEmailBody(statusInput);
  console.log('[status-brain] generated body from template:', templateBody.substring(0, 100));

  // ============================================================
  // Email-Compose Intent mit fertigem Template-Body
  // ============================================================
  const intent: VoiceIntent = {
    type: "email-compose",
    toRaw: toNameRaw,
    subjectHint: undefined,
    bodyHint: templateBody, // Fertiger Template-Body, KEIN expliziter Text aus Eingabe
    meta: {
      statusEmail: {
        isStatus: true,
        rawText: origText,
        toNameRaw: toNameRaw,
        statusText: finalStatusText, // Bereinigter Status-Text (ohne Send-Phrasen)
        autoSend: autoSend,
      },
      statusBrain: {
        category: category,
        usedTemplate: true,
      },
      source: "status-brain", // AUFGABE A: Eindeutige Source-Flag für Status-Brain
      autoSend: autoSend,
    },
  };

  // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
  const extractedEmail = extractEmailAddress(original);
  if (extractedEmail) {
    intent.to = extractedEmail;
    console.log('[status-brain] E-Mail-Adresse extrahiert:', extractedEmail);
  }

  return intent;
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
      // z.B.: "sende folgende email an thomas. bitte ruf mich zurück"
      regex: /^sende(?:\s+bitte)?\s+folgende(?:\s+e[- ]?mail)?\s+an\s+(?:den\s+|die\s+|dem\s+)?([a-zäöüß]+)\s*(?:[\.:,\-]\s*)?(.+)$/i,
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
 * Parst "schick/sende <NAME> eine kurze mail, <BODY>" Muster für Intent-4.2 Fallback.
 * Unterstützt Varianten:
 * - "schick Thomas eine kurze mail, ich komme 10 Minuten später"
 * - "schick Thomas 'ne kurze mail, ich komme 10 Minuten später"
 * - "schick Thomas eine mail, ich komme 10 Minuten später"
 * - "sende Thomas eine kurze mail, ich komme 10 Minuten später"
 * - Optional: Trennzeichen auch ":" oder "." (z.B. "... mail: <BODY>")
 * 
 * @param original - Originaler Text (mit Groß-/Kleinschreibung)
 * @returns { toRaw: string, bodyHint?: string } | null
 */
function parseSchickMailPattern(original: string): { toRaw: string; bodyHint?: string } | null {
  const text = original.trim();
  if (!text) return null;

  const lowered = text.toLowerCase();

  // Pattern: Imperativ-Verb + <NAME> + (eine|'ne) + (kurze)? + (mail|email|e-mail) + Trennzeichen + <BODY>
  // Verben: schick, schicke, sende, send
  const patterns = [
    // "schick Thomas eine kurze mail, ..."
    /^(schick|schicke|sende|send)\s+([a-zäöüß]+)\s+(?:eine|'ne)\s+(?:kurze\s+)?(?:mail|email|e-?mail)\s*[,:\.]\s*(.+)$/i,
    // "schick Thomas eine kurze mail ..." (ohne explizites Trennzeichen, aber danach kommt Text)
    /^(schick|schicke|sende|send)\s+([a-zäöüß]+)\s+(?:eine|'ne)\s+(?:kurze\s+)?(?:mail|email|e-?mail)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    // Groups: match[1] = verb, match[2] = name, match[3] = body
    if (match && match[2] && match[3]) {
      const toNameRaw = match[2].trim();
      let bodyHint = match[3].trim();

      // Body-Hint bereinigen: Entferne trailing "aber nicht senden" / "nicht senden" etc.
      // Aber NICHT aggressive Füllwort-Stripping
      const negationPattern = /\s*(?:,\s*)?(?:aber\s+)?(?:bitte\s+)?(?:noch\s+)?nicht\s+(?:senden|schicken|abschicken|rausschicken)\s*[.!?]?\s*$/i;
      bodyHint = bodyHint.replace(negationPattern, '').trim();

      // Entferne führendes "dass" nur wenn es wirklich führend ist
      bodyHint = bodyHint.replace(/^dass\s+/i, '').trim();

      // Wenn bodyHint nach Trimmen leer ist, nicht setzen
      if (!bodyHint || bodyHint.length === 0) {
        return { toRaw: toNameRaw };
      }

      return {
        toRaw: toNameRaw,
        bodyHint: bodyHint,
      };
    }
  }

  return null;
}

/**
 * Erkennt kurzes Imperativ-Pattern: "sende <name> bitte, <body>" oder "schick <name>, <body>"
 * 
 * Unterstützt Muster:
 * - "sende <name> bitte, <body>"
 * - "sende <name>, <body>"
 * - "schick <name> bitte, <body>"
 * - "schick <name>, <body>"
 * 
 * Separatoren: "," ":" "."
 * Pronomen werden blockiert (mir/dir/uns/euch/ihm/ihr)
 * 
 * @param original - Originaler Text (mit Groß-/Kleinschreibung)
 * @param normalized - Normalisierter Text (lowercase)
 * @returns { toRaw: string; bodyHint: string; bodyHintRaw: string } | null
 */
function detectShortImperativePattern(original: string, normalized: string): { 
  toRaw: string; 
  bodyHint: string; 
  bodyHintRaw: string;
} | null {
  const text = original.trim();
  if (!text) return null;

  // Blockierte Pronomen (Empfänger darf nicht Pronomen sein)
  const blockedPronouns = ['mir', 'dir', 'uns', 'euch', 'ihm', 'ihr', 'mich', 'dich', 'sich'];

  // Pattern: Imperativ-Verb + optional "bitte" + <NAME> + optional "bitte" + Separator + <BODY>
  // Verben: sende, send, schick, schicke
  // Separatoren: ",", ":", "."
  const patterns = [
    // "sende <name> bitte, <body>"
    /^(sende|send|schick|schicke)\s+([a-zäöüß]+(?:\s+[a-zäöüß]+)?)\s+bitte\s*[,:\.]\s*(.+)$/i,
    // "sende <name>, <body>"
    /^(sende|send|schick|schicke)\s+([a-zäöüß]+(?:\s+[a-zäöüß]+)?)\s*[,:\.]\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[2] && match[3]) {
      const toNameRaw = match[2].trim();
      const toNameLower = toNameRaw.toLowerCase();

      // Blockiere Pronomen
      if (blockedPronouns.includes(toNameLower)) {
        continue;
      }

      // Blockiere mehr als 2 Tokens (zu lang für Name)
      const nameTokens = toNameRaw.split(/\s+/);
      if (nameTokens.length > 2) {
        continue;
      }

      let bodyHintRaw = match[3].trim();
      
      // Wenn body leer ist, kein Match
      if (!bodyHintRaw || bodyHintRaw.length === 0) {
        continue;
      }

      // Body normalisieren für bodyHint (lowercase, aber Struktur behalten)
      let bodyHint = bodyHintRaw.toLowerCase();

      // Entferne trailing Negation/Preview-Phrasen aus bodyHint
      const negationPattern = /\s*(?:,\s*)?(?:aber\s+)?(?:bitte\s+)?(?:noch\s+)?nicht\s+(?:senden|schicken|abschicken|rausschicken)\s*[.!?]?\s*$/i;
      bodyHint = bodyHint.replace(negationPattern, '').trim();
      bodyHintRaw = bodyHintRaw.replace(negationPattern, '').trim();

      // Wenn body nach Bereinigung leer ist, kein Match
      if (!bodyHint || bodyHint.length === 0) {
        continue;
      }

      return {
        toRaw: toNameRaw.toLowerCase(), // Normalisiert für toRaw
        bodyHint: bodyHint,
        bodyHintRaw: bodyHintRaw, // Original mit Groß-/Kleinschreibung
      };
    }
  }

  return null;
}

/**
 * Erkennt "passive send" Pattern: "bitte sofort an <name> senden. <body>"
 * 
 * Unterstützt Muster:
 * - "bitte sofort an <name> senden. <body>"
 * - "sofort an <name> senden. <body>"
 * - "bitte an <name> senden. <body>"
 * 
 * Separatoren: ".", ":", ","
 * Pronomen werden blockiert (mir/dir/uns/euch/ihm/ihr/sie/er)
 * 
 * @param original - Originaler Text (mit Groß-/Kleinschreibung)
 * @param normalized - Normalisierter Text (lowercase)
 * @returns { toRaw: string; bodyHint: string; bodyHintRaw: string; hasAutoSendTrigger: boolean } | null
 */
function detectPassiveSendPattern(original: string, normalized: string): { 
  toRaw: string; 
  bodyHint: string; 
  bodyHintRaw: string;
  hasAutoSendTrigger: boolean;
} | null {
  const text = original.trim();
  if (!text) return null;

  // Blockierte Pronomen (Empfänger darf nicht Pronomen sein)
  const blockedPronouns = ['mir', 'dir', 'uns', 'euch', 'ihm', 'ihr', 'sie', 'er', 'mich', 'dich', 'sich'];

  // Pattern: optional "bitte" + optional (sofort|direkt|jetzt) + "an" + <NAME> + "senden" + Separator + <BODY>
  // Separatoren: ".", ":", ","
  const patterns = [
    // "bitte sofort an <name> senden. <body>"
    /^(?:bitte\s+)?(?:sofort|direkt|jetzt)\s+an\s+([a-zäöüß]+(?:\s+[a-zäöüß]+)?)\s+senden\s*[,:\.]\s*(.+)$/i,
    // "bitte an <name> senden. <body>" (ohne sofort/direkt/jetzt)
    /^bitte\s+an\s+([a-zäöüß]+(?:\s+[a-zäöüß]+)?)\s+senden\s*[,:\.]\s*(.+)$/i,
    // "sofort an <name> senden. <body>" (ohne bitte)
    /^(?:sofort|direkt|jetzt)\s+an\s+([a-zäöüß]+(?:\s+[a-zäöüß]+)?)\s+senden\s*[,:\.]\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      const toNameRaw = match[1].trim();
      const toNameLower = toNameRaw.toLowerCase();

      // Blockiere Pronomen
      if (blockedPronouns.includes(toNameLower)) {
        continue;
      }

      // Blockiere mehr als 2 Tokens (zu lang für Name)
      const nameTokens = toNameRaw.split(/\s+/);
      if (nameTokens.length > 2) {
        continue;
      }

      let bodyHintRaw = match[2].trim();
      
      // Wenn body leer ist, kein Match
      if (!bodyHintRaw || bodyHintRaw.length === 0) {
        continue;
      }

      // Body normalisieren für bodyHint (lowercase, Unicode clean)
      let bodyHint = normalize(bodyHintRaw);

      // Entferne trailing Negation/Preview-Phrasen aus bodyHint
      const negationPattern = /\s*(?:,\s*)?(?:aber\s+)?(?:bitte\s+)?(?:noch\s+)?nicht\s+(?:senden|schicken|abschicken|rausschicken)\s*[.!?]?\s*$/i;
      bodyHint = bodyHint.replace(negationPattern, '').trim();
      bodyHintRaw = bodyHintRaw.replace(negationPattern, '').trim();

      // Wenn body nach Bereinigung leer ist, kein Match
      if (!bodyHint || bodyHint.length === 0) {
        continue;
      }

      // Prüfe, ob AutoSend-Trigger im Command-Teil vorhanden ist
      const commandPart = match[0].substring(0, match[0].length - match[2].length).toLowerCase();
      const hasAutoSendTrigger = /\b(sofort|direkt|jetzt)\b/.test(commandPart);

      return {
        toRaw: toNameRaw.toLowerCase(), // Normalisiert für toRaw
        bodyHint: bodyHint,
        bodyHintRaw: bodyHintRaw, // Original mit Groß-/Kleinschreibung
        hasAutoSendTrigger: hasAutoSendTrigger,
      };
    }
  }

  return null;
}

/**
 * Erkennt "schick-an-direct" Pattern: "schick das direkt an thomas bin im termin"
 * 
 * Unterstützt Muster:
 * - "schick das direkt an thomas bin im termin"
 * - "schick bitte an thomas ich ruf später an"
 * - "schick an thomas bin gleich da"
 * - "sende das direkt an thomas ..."
 * 
 * Kein Separator erforderlich - Body ist alles nach dem Empfängernamen.
 * 
 * @param original - Originaler Text (mit Groß-/Kleinschreibung)
 * @param normalized - Normalisierter Text (lowercase)
 * @returns { toRaw: string; bodyHint: string; bodyHintRaw: string; hasAutoSendTrigger: boolean } | null
 */
function detectSchickAnDirectPattern(original: string, normalized: string): { 
  toRaw: string; 
  bodyHint: string; 
  bodyHintRaw: string;
  hasAutoSendTrigger: boolean;
} | null {
  const text = original.trim();
  if (!text) return null;

  // Blockierte Pronomen (Empfänger darf nicht Pronomen sein)
  const blockedPronouns = ['mir', 'dir', 'uns', 'euch', 'ihm', 'ihr', 'sie', 'er', 'mich', 'dich', 'sich'];

  // Pattern: (schick|schicke|schicken|sende|send) + optional "das" + optional "bitte" + optional (direkt|sofort|jetzt) + "an" + <NAME> + <BODY>
  // Body ist alles nach dem Namen (kein Separator erforderlich)
  // WICHTIG: Name ist 1 Token (z.B. "thomas") oder 2 Tokens (z.B. "thomas müller"), danach kommt Body
  // Pattern erfasst Name-Gruppe separat, dann Body-Gruppe
  const patterns = [
    // "schick das direkt an <name> <body>"
    // Name: 1 Token, dann optional 1 weiteres Token (nur wenn es wie ein Name aussieht)
    /^(schick|schicke|schicken|sende|send)\s+das\s+(?:bitte\s+)?(?:direkt|sofort|jetzt)\s+an\s+([a-zäöüß]+)(?:\s+([a-zäöüß]+))?\s+(.+)$/i,
    // "schick bitte an <name> <body>"
    /^(schick|schicke|schicken|sende|send)\s+bitte\s+an\s+([a-zäöüß]+)(?:\s+([a-zäöüß]+))?\s+(.+)$/i,
    // "schick an <name> <body>"
    /^(schick|schicke|schicken|sende|send)\s+an\s+([a-zäöüß]+)(?:\s+([a-zäöüß]+))?\s+(.+)$/i,
    // "schick das an <name> <body>"
    /^(schick|schicke|schicken|sende|send)\s+das\s+an\s+([a-zäöüß]+)(?:\s+([a-zäöüß]+))?\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    // Groups: match[1] = verb, match[2] = first name token, match[3] = optional second name token, match[4] = body
    if (match && match[2] && match[4]) {
      // Baue Name aus Tokens zusammen
      const firstNameToken = match[2].trim();
      const secondNameToken = match[3]?.trim();
      
      // Prüfe, ob zweites Token ein Verb/Präposition ist (dann ist es Teil des Body, nicht des Namens)
      const bodyStartWords = ['bin', 'ist', 'sind', 'habe', 'hat', 'haben', 'komme', 'kommt', 'kommst', 'ruf', 'rufe', 'ruft', 'ich', 'wir', 'er', 'sie', 'es', 'im', 'in', 'am', 'an', 'auf', 'zu', 'für', 'mit', 'von'];
      const isSecondTokenBodyStart = secondNameToken && bodyStartWords.includes(secondNameToken.toLowerCase());
      
      let toNameRaw: string;
      let bodyHintRaw: string;
      
      if (isSecondTokenBodyStart || !secondNameToken) {
        // Zweites Token ist Body-Start oder nicht vorhanden -> Name ist nur erstes Token
        toNameRaw = firstNameToken;
        bodyHintRaw = (secondNameToken ? secondNameToken + ' ' : '') + match[4].trim();
      } else {
        // Zweites Token ist Teil des Namens (z.B. "Thomas Müller")
        toNameRaw = firstNameToken + ' ' + secondNameToken;
        bodyHintRaw = match[4].trim();
      }
      
      const toNameLower = toNameRaw.toLowerCase();

      // Blockiere Pronomen
      if (blockedPronouns.includes(toNameLower)) {
        continue;
      }

      // Wenn body leer ist, kein Match
      if (!bodyHintRaw || bodyHintRaw.length === 0) {
        continue;
      }

      // Body normalisieren für bodyHint (lowercase, Unicode clean)
      let bodyHint = normalize(bodyHintRaw);

      // Entferne trailing Negation/Preview-Phrasen aus bodyHint
      const negationPattern = /\s*(?:,\s*)?(?:aber\s+)?(?:bitte\s+)?(?:noch\s+)?nicht\s+(?:senden|schicken|abschicken|rausschicken)\s*[.!?]?\s*$/i;
      bodyHint = bodyHint.replace(negationPattern, '').trim();
      bodyHintRaw = bodyHintRaw.replace(negationPattern, '').trim();

      // Wenn body nach Bereinigung leer ist, kein Match
      if (!bodyHint || bodyHint.length === 0) {
        continue;
      }

      // Prüfe, ob AutoSend-Trigger im Command-Teil vorhanden ist
      const commandPart = match[0].substring(0, match[0].length - bodyHintRaw.length).toLowerCase();
      const hasAutoSendTrigger = /\b(sofort|direkt|jetzt)\b/.test(commandPart) || 
                                  /\b(schick|schicke)\b/.test(commandPart.toLowerCase());

      return {
        toRaw: toNameRaw.toLowerCase(), // Normalisiert für toRaw
        bodyHint: bodyHint,
        bodyHintRaw: bodyHintRaw, // Original mit Groß-/Kleinschreibung
        hasAutoSendTrigger: hasAutoSendTrigger,
      };
    }
  }

  return null;
}

/**
 * Helper-Funktion: Entfernt führendes "an <name>" mit optionalen Artikeln und Satzzeichen.
 * Nur am Anfang (^), case-insensitive.
 * @param body - Body-Text, der bereinigt werden soll
 * @param toNameRaw - Empfängername (wird regex-sicher escaped)
 * @returns Bereinigter Body-Text
 */
function stripLeadingAnName(body: string, toNameRaw?: string | null): string {
  if (!body || typeof body !== 'string') {
    return body || '';
  }

  if (!toNameRaw) {
    return body;
  }

  const name = toNameRaw.trim();
  if (!name) {
    return body;
  }

  // Escapen von Sonderzeichen im Namen für Regex
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Entferne "an <name>" oder "an dem/den/die <name>" mit optionalen Satzzeichen
  // Pattern 1: Mit Leerzeichen nach Satzzeichen (z.B. "An Thomas. Bitte...")
  const pattern1 = new RegExp(`^an\\s+(?:dem\\s+|den\\s+|die\\s+)?${escapedName}\\s*[\\.:,\\-]?\\s+`, 'i');
  let cleaned = body.replace(pattern1, '').trim();

  // Pattern 2: Ohne Leerzeichen nach Satzzeichen (z.B. "an thomas. Bitte...")
  const pattern2 = new RegExp(`^an\\s+(?:dem\\s+|den\\s+|die\\s+)?${escapedName}[\\.:,\\-]\\s*`, 'i');
  cleaned = cleaned.replace(pattern2, '').trim();

  return cleaned;
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
 * FIX 1: Detects imperative "sende/schick/zusenden/rausschicken/zukommen lassen" commands at the beginning of the text.
 * Specifically checks for "sende/schick(e) bitte folgende nachricht/mail an/zu <name>..." patterns.
 * 
 * @param normalized - Normalized text (lowercase, trimmed)
 * @returns true if imperative send command detected, false otherwise
 */
function detectImperativeSendAutosend(normalized: string): boolean {
  const text = normalized.trim();

  // Guard: False-positive detection - MUST be checked FIRST
  // Exclude "ich sende", "wir senden", "ich schicke", "wir schicken", etc.
  const falsePositivePatterns = [
    /^(ich|wir)\s+(sende|send|senden|schicke|schicken|schickt|schickst|zusenden|rausschicken|abschicken)\b/i,
    /^(ich|wir)\s+(werde|wollen|wollten)\s+(senden|schicken|zusenden|rausschicken|abschicken)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(text)) {
      return false;
    }
  }

  // Check if text starts with imperative send verb (erweitert um neue Verben)
  const imperativeStartPattern = /^(sende|send|senden|schick|schicke|schickt|schicken|zusenden|rausschicken|abschicken)\b/i;
  const lassZukommenPattern = /^lass\s+[a-zäöüß]+\s+(?:bitte\s+)?folgende\s+(?:nachricht|mail|email|e-mail)\s+zukommen/i;
  
  const hasImperativeVerb = imperativeStartPattern.test(text);
  const hasLassZukommen = lassZukommenPattern.test(text);
  
  if (!hasImperativeVerb && !hasLassZukommen) {
    return false;
  }

  // Must be a clear mail/message command - at least one of these criteria:
  // 1. Contains "nachricht", "mail", "e-mail", "email"
  // 2. Contains "an <name>" or "zu <name>" pattern (e.g., "an thomas", "zu thomas")
  // 3. Contains "folgende" (folgende nachricht/mail)
  // 4. Contains "zukommen lassen" in Mail-Kontext
  const isMailCommand = 
    /\b(nachricht|mail|e-mail|email)\b/i.test(text) ||
    /\b(an|zu)\s+[a-zäöüß]+\b/i.test(text) ||
    /\bfolgende\b/i.test(text) ||
    (hasLassZukommen && /\b(nachricht|mail|e-mail|email|folgende)\b/i.test(text));

  // Guard: Wenn "später" im Satz ist UND kein eindeutiger Empfänger/Email-Kontext vorhanden => NO AUTOSEND
  if (/\bspäter\b/i.test(text) && !isMailCommand) {
    return false;
  }

  if (isMailCommand) {
    // Ermittle das erkannte Verb für Logging
    let detectedVerb = 'sende';
    const verbMatch = text.match(/^(sende|send|senden|schick|schicke|schickt|schicken|zusenden|rausschicken|abschicken)/i);
    if (verbMatch) {
      detectedVerb = verbMatch[1].toLowerCase();
    } else if (hasLassZukommen) {
      detectedVerb = 'zukommen lassen';
    }
    console.log(`[intent-router][autosend-imperative] AutoSend detected (imperative "${detectedVerb}") - intent.meta.autoSend=true`);
    return true;
  }

  return false;
}

/**
 * Checks if the text contains false-positive patterns that should exclude AutoSend.
 * Returns true if a false-positive is detected (AutoSend should be blocked).
 * 
 * @param normalized - Normalized text (lowercase, trimmed)
 * @returns true if false-positive detected (AutoSend should be blocked), false otherwise
 */
function checkFalsePositiveExclusion(normalized: string): boolean {
  const text = normalized.toLowerCase().trim();

  // False-positive patterns that should block AutoSend
  const falsePositivePatterns = [
    /\b(ich|wir)\s+(sende|send|senden|schicke|schicken)\b/i,
    /\b(ich|wir)\s+(werde|wollen|wollten)\s+(senden|schicken)\b/i,
    /\b(kannst|könntest|würdest|kann|könnte|würde)\s+du\s+.*\b(senden|schicken)\b/i,
    /\b(bitte\s+)?an\s+mich\s+(senden|schicken)\b/i,
    /\b(bitte\s+)?mir\s+(senden|schicken)\b/i,
    /\b(sende|schick|schicke)\s+(dir|mir|uns|ihr|euch)\b/i, // "sende dir", "schick mir" = not a command to send mail
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(text)) {
      console.log('[autosend-extended] excluded false-positive:', pattern);
      return true; // false-positive detected
    }
  }

  // Negation/Preview patterns that should block AutoSend (höchste Priorität)
  const negationPreviewPatterns = [
    /\bnicht\s+(?:senden|schicken|abschicken|rausschicken|verschicken)\b/i,
    /\b(?:nur|bloß)\s+(?:zeigen|vorzeigen|anzeigen|darstellen)\b/i,
    /\b(?:nur|bloß)\s+entwurf\b/i,
    /\bentwurf\s+(?:nur|bloß|zeigen)\b/i,
    /\b(?:vorlesen|vorlese|vorliest)\b/i,
    /\b(?:preview|vorschau|vorschauen)\b/i,
    /\b(?:zeige|zeig|zeigen)\s+mir\b/i,
    /\b(?:zeige|zeig|zeigen)\s+(?:nur|bloß)\b/i,
  ];

  for (const pattern of negationPreviewPatterns) {
    if (pattern.test(text)) {
      console.log('[autosend-extended] excluded - negation/preview pattern detected:', pattern);
      return true; // negation/preview detected - block AutoSend
    }
  }

  return false; // no false-positive
}

/**
 * TASK 3: Reusable extended AutoSend detection helper
 * Detects AutoSend phrases like "sende sie direkt", "schick sie direkt raus", etc.
 * Can be used by both A3.4 free-dictation and "lass-uns" intents.
 * 
 * Extended with imperative send/notify phrases and false-positive guards.
 */
function detectExtendedAutoSend(normalized: string): boolean {
  const text = normalized.toLowerCase().trim();

  // ============================================================
  // GUARD: False-Positive Detection - MUST be checked FIRST
  // ============================================================
  // Exclude non-imperative uses of "sende/schick"
  if (checkFalsePositiveExclusion(normalized)) {
    return false;
  }

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
    console.log('[autosend-extended] matched exact phrase');
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
      console.log('[autosend-extended] matched extended pattern');
      return true;
    }
  }

  // ============================================================
  // NEW: Imperative send/notify phrases
  // ============================================================
  // Pattern A: Imperative "sende/send/senden" (only if in imperative context)
  // Check if text starts with imperative or contains "bitte" near the verb
  const isImperativeContext = (txt: string): boolean => {
    // Starts with "sende|send|schick|schicke|lass"
    if (/^(sende|send|senden|schick|schicke|lass)\b/i.test(txt)) {
      return true;
    }
    // Contains "bitte" within 3 words of "sende|schick"
    if (/\b(bitte\s+)?(sende|send|senden|schick|schicke)\b/i.test(txt) || 
        /\b(sende|send|senden|schick|schicke)\s+bitte\b/i.test(txt)) {
      return true;
    }
    // Contains "lass uns" pattern
    if (/\blass\s+uns\b/i.test(txt)) {
      return true;
    }
    return false;
  };

  // Imperative "sende/send/senden" (only if not false-positive)
  if (isImperativeContext(text)) {
    const imperativeSendPatterns = [
      /\b(sende|send|senden)\s+bitte\s+(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\b/i,
      /\b(sende|send|senden)\s+(?:bitte\s+)?(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\s+(?:direkt|sofort|jetzt)\b/i,
      /\b(sende|send|senden)\b.*\b(?:direkt|sofort|jetzt)\s+(?:raus|ab|los)\b/i,
      /\b(sende|send|senden)\b.*\b(?:direkt|sofort|jetzt)\b/i,
    ];

    for (const pattern of imperativeSendPatterns) {
      if (pattern.test(text)) {
        console.log('[autosend-extended] matched imperative send pattern');
        return true;
      }
    }
  }

  // Pattern B: Imperative "schick/schicke/schickt" (schickt = STT 3. Person, toleriert als Imperativ-Variante)
  if (isImperativeContext(text)) {
    const imperativeSchickPatterns = [
      /\b(schick|schicke|schickt)\s+bitte\s+(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\b/i,
      /\b(schick|schicke|schickt)\s+(?:bitte\s+)?(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\s+(?:direkt|sofort|jetzt)\b/i,
      /\b(schick|schicke|schickt)\b.*\b(?:direkt|sofort|jetzt)\s+(?:raus|ab|los)\b/i,
    ];

    for (const pattern of imperativeSchickPatterns) {
      if (pattern.test(text)) {
        console.log('[autosend-extended] matched imperative schick pattern');
        return true;
      }
    }
  }

  // Pattern C: "lass <name> wissen" / "lass <name> bitte wissen"
  const lassWissenPattern = /\blass\s+([a-zäöüß]+)\s+(?:bitte\s+)?wissen\b/i;
  if (lassWissenPattern.test(text)) {
    console.log('[autosend-extended] matched "lass <name> wissen" pattern');
    return true;
  }

  // Pattern D: "lass uns ... senden/abschicken/rausschicken"
  const lassUnsSendenPattern = /\blass\s+uns\b.*\b(senden|abschicken|rausschicken|verschicken)\b/i;
  if (lassUnsSendenPattern.test(text)) {
    console.log('[autosend-extended] matched "lass uns ... senden" pattern');
    return true;
  }

  // Pattern E: "sende/schick/schickt ... direkt raus / sofort / jetzt"
  const direktSofortPatterns = [
    /\b(sende|schick|schicke|schickt)\b.*\b(?:direkt|sofort|jetzt)\s+(?:raus|ab|los)\b/i,
    /\b(sende|schick|schicke|schickt)\s+(?:bitte\s+)?(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\s+(?:direkt|sofort|jetzt)\b/i,
  ];

  for (const pattern of direktSofortPatterns) {
    if (pattern.test(text)) {
      console.log('[autosend-extended] matched "direkt/sofort" pattern');
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

  // AutoSend-Erkennung: Kombiniere erweiterte Funktion UND imperative "sende" Erkennung
  // FIX 1: "Sende bitte folgende Nachricht/Mail an <Name>..." muss AutoSend auslösen
  const hasExtendedAutoSend = detectExtendedAutoSend(text);
  const hasImperativeAutoSend = detectImperativeSendAutosend(normalized);
  const hasAutoSendPhrase = hasExtendedAutoSend || hasImperativeAutoSend;

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

      // FIX 1: "sende thomas folgende nachricht/mail/email ..." (Name VOR "folgende")
      /^(?:sende|send)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende nachricht(?:\.|\s+)(?<body>.+)$/,
      /^(?:sende|send)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende mail(?:\.|\s+)(?<body>.+)$/,
      /^(?:sende|send)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende email(?:\.|\s+)(?<body>.+)$/,
      /^(?:sende|send)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende e-mail(?:\.|\s+)(?<body>.+)$/,

      // FIX 2: "schick(e) bitte folgende nachricht/mail/email (an|zu) thomas ..."
      /^(?:schick|schicke)\s+(?:bitte\s+)?folgende nachricht\s+(?:an|zu)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:schick|schicke)\s+folgende nachricht\s+(?:an|zu)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:schick|schicke)\s+(?:bitte\s+)?folgende mail\s+(?:an|zu)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:schick|schicke)\s+folgende mail\s+(?:an|zu)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:schick|schicke)\s+(?:bitte\s+)?folgende email\s+(?:an|zu)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,
      /^(?:schick|schicke)\s+folgende email\s+(?:an|zu)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?<body>.+)$/,

      // FIX 2: "schick(e) thomas bitte folgende nachricht/mail ..." (Name VOR "folgende")
      /^(?:schick|schicke)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende nachricht(?:\.|\s+)(?<body>.+)$/,
      /^(?:schick|schicke)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende mail(?:\.|\s+)(?<body>.+)$/,
      /^(?:schick|schicke)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende email(?:\.|\s+)(?<body>.+)$/,
      /^(?:schick|schicke)\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende e-mail(?:\.|\s+)(?<body>.+)$/,

      // FIX 2: "lass thomas bitte folgende nachricht/mail zukommen ..."
      /^lass\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende nachricht\s+zukommen\s+(?<body>.+)$/,
      /^lass\s+(?<name>[a-z0-9äöüß ]+?)\s+(?:bitte\s+)?folgende mail\s+zukommen\s+(?<body>.+)$/,
      /^lass\s+(?<name>[a-z0-9äöüß ]+?)\s+folgende nachricht\s+zukommen\s+(?<body>.+)$/,
      /^lass\s+(?<name>[a-z0-9äöüß ]+?)\s+folgende mail\s+zukommen\s+(?<body>.+)$/,

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

      // FIX 1: "sende (dem) thomas folgende nachricht/mail/email ..." (mit oder ohne "dem")
      /^(?:sende|send)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende nachricht(?:\.|\s+)(?<body>.+)$/,
      /^(?:sende|send)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende mail(?:\.|\s+)(?<body>.+)$/,
      /^(?:sende|send)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende email(?:\.|\s+)(?<body>.+)$/,
      /^(?:sende|send)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende e-mail(?:\.|\s+)(?<body>.+)$/,

      // FIX 2: "schick(e) (dem) thomas folgende nachricht/mail/email ..." (mit oder ohne "dem")
      /^(?:schick|schicke)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende nachricht(?:\.|\s+)(?<body>.+)$/,
      /^(?:schick|schicke)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende mail(?:\.|\s+)(?<body>.+)$/,
      /^(?:schick|schicke)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende email(?:\.|\s+)(?<body>.+)$/,
      /^(?:schick|schicke)\s+(?:dem\s+)?(?<name>[a-z0-9äöüß ]+)\s+(?:bitte\s+)?folgende e-mail(?:\.|\s+)(?<body>.+)$/,
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

  // Clean body text from command phrases using the robust cleaning function
  bodyText = cleanEmailBodyFromCommand(bodyText, toNameRaw);
  // Additional guard: Remove leading "an <name>" with optional articles and punctuation
  bodyText = stripLeadingAnName(bodyText, toNameRaw);
  bodyText = bodyText.trim();

  console.log('[intent-router][A3.4][debug] body after clean:', bodyText.substring(0, 80));

  // FIX 2: Sicherstellen, dass autoSend korrekt gesetzt wird (inkl. imperative detection)
  const autoSend = hasAutoSendPhrase;

  // Extract bodyHintRaw from original raw text (behält Groß-/Kleinschreibung)
  // routeVoiceIntent bekommt raw und normalized, wir müssen es hier übergeben
  // Da parseFreeDictationA34 nur normalized bekommt, müssen wir raw separat übergeben
  // Für jetzt: bodyHintRaw wird in routeVoiceIntent gesetzt, nachdem parseFreeDictationA34 aufgerufen wurde

  // Wir liefern ein Email-Intent-Objekt zurück
  // Wichtig: toRaw enthält NUR den Namen (z.B. "thomas"), NICHT "folgende nachricht an thomas"
  // Der Contact Resolver erhält damit nur den reinen Namen
  const intent: VoiceIntent = {
    type: "email-compose",
    toRaw: toNameRaw,
    subjectHint: undefined,
    bodyHint: bodyText,
    // bodyHintRaw wird in routeVoiceIntent gesetzt (siehe unten)
    meta: {
      freeDictationMeta: {
        normalized: text,
        toNameRaw,
        bodyText,
        autoSend: autoSend, // FIX 2: Explizit setzen
      },
      source: 'free-dictation-a3.4',
      autoSend: autoSend, // FIX 2: Auch in meta.autoSend setzen (wichtig für index.ts)
    },
  };

  if (autoSend) {
    if (hasImperativeAutoSend) {
      console.log('[intent-router][A3.4][autosend-imperative] AutoSend detected (imperative "sende") - intent.meta.autoSend=true');
    } else {
      console.log('[intent-router][A3.4][autosend-extended] AutoSend detected for Free-Dictation - intent.meta.autoSend=true');
    }
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

  // ============================================================
  // AUTO-SEND FALSE-POSITIVE EXCLUSION FLAG
  // ============================================================
  // Prüfe früh, ob ein false-positive Pattern erkannt wurde.
  // Wenn ja, muss autoSend IMMER false bleiben, auch wenn später
  // Intent-Handler AutoSend erkennen.
  const autoSendExcludedByFalsePositive = checkFalsePositiveExclusion(text);

  // --------------------------------------------------
  // LASS-WISSEN: "lass <name> bitte folgendes wissen" (Wizard4 explicit-body)
  // Muss VOR Status-Brain kommen, da es explizites Text-Diktat ist.
  // Erkennt Varianten:
  // - "Lass Thomas bitte folgendes wissen, Thomas, hier ist Dennis. Ich komme 15 Minuten später."
  // - "Lass Thomas folgendes wissen: Hi Thomas, ich komme 10 Minuten später."
  // - "Lass Thomas wissen: Ich komme 5 Minuten später."
  // --------------------------------------------------
  const lassWissenIntent = detectLassWissenCommand(text, original);
  if (lassWissenIntent) {
    // Block AutoSend if false-positive exclusion was detected
    if (autoSendExcludedByFalsePositive && lassWissenIntent.meta?.autoSend) {
      lassWissenIntent.meta.autoSend = false;
      if (lassWissenIntent.meta.freeDictationMeta) {
        lassWissenIntent.meta.freeDictationMeta.autoSend = false;
      }
      console.log('[intent-router][lass-wissen] AutoSend blocked - false-positive exclusion');
    }
    console.log('[intent-router][lass-wissen] matched:', {
      toName: lassWissenIntent.toRaw,
      autoSend: lassWissenIntent.meta?.autoSend,
    });
    return lassWissenIntent;
  }

  // --------------------------------------------------
  // STATUS-BRAIN: Schnelle Status-Nachrichten (VOR Diktier-Engine)
  // Erkennt semantische Status-Befehle wie:
  // - "Schreib Thomas, dass ich krank bin"
  // - "Sag Dennis, ich komme später"
  // - "Lass Thomas wissen, dass ich heute nicht komme"
  // Greift NICHT bei expliziten Text-Diktaten (folgende Nachricht, :, etc.)
  // --------------------------------------------------
  const statusBrainIntent = detectStatusBrainCommand(text, original);
  if (statusBrainIntent) {
    console.log('[status-brain] matched:', { toName: statusBrainIntent.toRaw, category: statusBrainIntent.meta?.statusBrain?.category });
    return statusBrainIntent;
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
    
    // Extract bodyHintRaw from original raw text (behält Groß-/Kleinschreibung)
    if (fdIntent.bodyHint) {
      fdIntent.bodyHintRaw = extractBodyFromRaw(original, text, fdIntent.bodyHint);
      console.log('[intent-router][body-raw] bodyHintRaw extracted for A3.4:', {
        rawLength: fdIntent.bodyHintRaw?.length,
        normalizedLength: fdIntent.bodyHint.length
      });
    }
    
    console.log(
      "[intent-router][free-dictation][A3.4] Freitext-Diktat erkannt:",
      {
        normalized: text,
        toNameRaw: fdIntent.toRaw,
        bodyText: fdIntent.bodyHint?.substring(0, 50),
        bodyHintRaw: fdIntent.bodyHintRaw?.substring(0, 50),
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

  // ============================================================
  // NEU: "Schicken-Form" Pattern: "folgende nachricht/mail/email <name> schicken/senden..."
  // ============================================================
  // Pattern: "bitte folgende nachricht/mail/email <name> (an)? schicken/senden/rausschicken..."
  // Example: "Bitte folgende Nachricht Thomas schicken Hi Thomas, hier ist Dennis..."
  // Muss VOR "schreib ..." Block kommen, da diese Sätze NICHT mit "schreib" beginnen
  const folgendeNachrichtSchickenMatch = text.match(/\bfolgende\s+(?:nachricht|mail|email|e-?mail)\s+(?:an\s+)?([a-z0-9äöüß]+)\s+(schicken|senden|rausschicken|verschicken|zusenden|abschicken|zukommen\s+lassen|zukommenlassen)/i);
  if (folgendeNachrichtSchickenMatch && folgendeNachrichtSchickenMatch[1]) {
    const name = folgendeNachrichtSchickenMatch[1].trim();
    const verbMatch = folgendeNachrichtSchickenMatch[2];
    
    // Extract body from original text (better case/punctuation preservation)
    const originalPattern = new RegExp(`folgende\\s+(?:nachricht|mail|email|e-?mail)\\s+(?:an\\s+)?${name}\\s+(?:${verbMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
    const originalMatch = original.match(originalPattern);
    let rawBodyTextOriginal = original;
    if (originalMatch && originalMatch.index !== undefined) {
      const originalMatchEnd = originalMatch.index + originalMatch[0].length;
      rawBodyTextOriginal = original.slice(originalMatchEnd).trim();
    } else {
      // Fallback: extract from normalized
      const matchEndIndex = folgendeNachrichtSchickenMatch.index! + folgendeNachrichtSchickenMatch[0].length;
      rawBodyTextOriginal = text.slice(matchEndIndex).trim();
    }
    
    // Clean body text from command phrases
    const bodyText = cleanEmailBodyFromCommand(rawBodyTextOriginal, name);
    
    // AutoSend detection: conservative - only if verb is explicit send verb
    let autoSend = false;
    if (/\b(schicken|senden|rausschicken|verschicken|zusenden|abschicken)\b/i.test(verbMatch)) {
      // Additional guard: Check for "direkt", "sofort", "jetzt" for more confidence (optional)
      // For now, we set autoSend if the verb is a send verb (conservative)
      autoSend = true;
    }
    
    // Block AutoSend if false-positive exclusion was detected
    if (autoSendExcludedByFalsePositive) {
      autoSend = false;
      console.log('[intent-router][autosend-guard] autosend blocked due to false-positive exclusion');
    }
    
    console.log('[intent-router][intent-4.2][schicken-form] "Schicken-Form" erkannt', {
      name,
      verb: verbMatch,
      bodyPreview: bodyText ? bodyText.substring(0, 60) : null,
      autoSend
    });
    
    const intent: VoiceIntent = {
      type: "email-compose",
      toRaw: name,
      subjectHint: undefined,
      bodyHint: bodyText || undefined,
      meta: {
        statusEmail: {
          isStatus: true,
          rawText: text,
          toNameRaw: name,
          statusText: bodyText || null,
          autoSend: autoSend,
        },
        autoSend: autoSend,
      },
    };
    
    // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
    const extractedEmail = extractEmailAddress(original);
    if (extractedEmail) {
      intent.to = extractedEmail;
      console.log("[intent-router][intent-4.2][schicken-form] E-Mail-Adresse extrahiert:", extractedEmail);
    }
    
    return intent;
  }

  // Spezial-Route: ALLE Sätze mit "schreib ..."
  // Diese Route muss FRÜH kommen, damit sie vor anderen email-compose-Intents greift
  // Erkennt ALLE Varianten: "schreib dem ...", "schreib Freiraum ...", "schreib thomas ...", etc.
  // BUT: Skip if it's an append trigger ("schreib noch dazu")
  const isAppendTrigger = /^schreib\s+noch\s+dazu\s*/i.test(text);
  if (
    !isAppendTrigger &&
    (text.startsWith("schreib ") ||
    text.startsWith("schreibe ") ||
    text.startsWith("schreib mal ") ||
    text.startsWith("schreibe mal "))
  ) {
    console.log(
      "[intent-router][intent-4.2] Umgangssprache-Mail erkannt:",
      text
    );

    const parsed = parseColloquialStatusEmailCommand(text, original);
    const toNameRaw = parsed.toNameRaw;
    const statusText = parsed.statusText;
    // AutoSend: Check if "schicken|senden|rausschicken|verschicken|zusenden|abschicken|zukommen lassen" was detected
    let autoSend = detectAutoSendFromText(text);
    // Also check for verbs like "schicken", "senden" in the text (conservative: only if explicit)
    if (!autoSend && /\b(schicken|senden|rausschicken|verschicken|zusenden|abschicken|zukommen\s+lassen|zukommenlassen)\b/i.test(text)) {
      // Additional guard: Check for "direkt", "sofort", "jetzt" for more confidence
      if (/\b(direkt|sofort|jetzt)\s+(?:schicken|senden|raus)/i.test(text) || /\bfolgende\s+(?:nachricht|mail|email)\s+.*\s+(schicken|senden|rausschicken|verschicken|zusenden|abschicken)\b/i.test(text)) {
        autoSend = true;
        console.log('[intent-router][intent-4.2][autosend] AutoSend detected via "schicken/senden" verb');
      }
    }

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

  // ============================================================
  // OVERRULE: Append+AutoSend Detection VOR email-send
  // Verhindert, dass "Ergänze noch bring ... und schick die Mail direkt los" als email-send gematched wird
  // ============================================================
  {
    // Check if text contains append triggers
    const appendTriggers = [
      /^füge\s+noch\s+folgendes\s+hinzu\s*[:.]?\s*/i,
      /^fuge\s+noch\s+folgendes\s+hinzu\s*[:.]?\s*/i,
      /^fuge\s+bitte\s+noch\s+folgendes\s+hinzu\s*[:.]?\s*/i,
      /^füge\s+noch\s+hinzu\s*[:.]?\s*/i,
      /^fuge\s+noch\s+hinzu\s*[:.]?\s*/i,
      /^fuge\s+bitte\s+noch\s+hinzu\s*[:.]?\s*/i,
      /^ergänze\s+noch\s*[:.]?\s*/i,
      /^erganze\s+noch\s*[:.]?\s*/i,
      /^erganze\s+bitte\s+noch\s*[:.]?\s*/i,
      /^häng\s+noch\s+dran\s*[:.]?\s*/i,
      /^hang\s+noch\s+dran\s*[:.]?\s*/i,
      /^häng(?:e|en)?\s+(?:bitte\s+)?(?:noch\s+)?an/i,
      /^hang(?:e|en)?\s+(?:bitte\s+)?(?:noch\s+)?an/i,
      /^schreib\s+noch\s+dazu\s*[:.]?\s*/i,
      /^füge\s+hinzu\s*[:.]?\s*/i,
      /^fuge\s+hinzu\s*[:.]?\s*/i,
      /^ergänze\s*[:.]?\s*/i,
      /^erganze\s*[:.]?\s*/i,
    ];
    
    let matchedAppendTrigger: RegExpMatchArray | null = null;
    let appendTriggerIndex = -1;
    
    for (const trigger of appendTriggers) {
      const match = text.match(trigger);
      if (match) {
        matchedAppendTrigger = match;
        appendTriggerIndex = match.index! + match[0].length;
        break;
      }
    }
    
    if (matchedAppendTrigger && appendTriggerIndex >= 0) {
      // Append trigger found - check for AutoSend
      const hasAutoSendLike = detectExtendedAutoSend(text);
      
      if (hasAutoSendLike) {
        // Extract appendText candidate (similar to email-append block)
        const normalizedTriggerMatch = text.match(matchedAppendTrigger[0].toLowerCase());
        let originalTriggerIndex = -1;
        if (normalizedTriggerMatch) {
          const triggerPattern = new RegExp(matchedAppendTrigger[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          const originalMatch = original.match(triggerPattern);
          if (originalMatch && originalMatch.index !== undefined) {
            originalTriggerIndex = originalMatch.index + originalMatch[0].length;
          }
        }
        
        const extractIndex = originalTriggerIndex >= 0 ? originalTriggerIndex : appendTriggerIndex;
        let appendTextRaw = original.substring(extractIndex).trim();
        appendTextRaw = appendTextRaw.replace(/^[,.:;!?\s]+/, '').trim();
        
        // Strip AutoSend phrases
        let content = stripAutoSendFromAppendText(appendTextRaw);
        content = content.trim();
        
        if (content.length >= 8) {
          console.log("[email-append][override-send] append+autosend detected -> routing to email-append", { contentPreview: content.slice(0, 60) });
          
          const intent: VoiceIntent = {
            type: "email-append",
            meta: {
              autoSend: true,
            },
            payload: {
              appendText: content,
            },
          };
          return intent;
        }
      }
    }
  }

  // ============================================================
  // COMPOSE-PRECEDENCE GUARD: Compose + Send Detection VOR email-send
  // ============================================================
  // Verhindert, dass Sätze mit Compose-Inhalt (Empfänger + Body) + Send-Wunsch
  // als email-send geroutet werden, sondern als email-compose mit autoSend=true
  // Beispiel: "Bitte Thomas schicken Hi Thomas, hier ist Dennis. Ich hoffe dir gehts gut und sofort senden."
  {
    // Define SEND_PATTERNS locally (before it's defined later in the file)
    const SEND_PATTERNS_LOCAL = [
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
      "email senden",
      "e mail senden",
      "mail senden",
    ];
    
    // Check for send candidate: imperative send patterns
    const sendCandidate = SEND_PATTERNS_LOCAL.some((p) => text.includes(p)) || detectExtendedAutoSend(text);
    
    if (sendCandidate) {
      // Check for compose candidate:
      // a) schicken-direct pattern could be recognized (<name> schicken|senden at start)
      const schickenDirectCandidate = /^(?:bitte\s+)?([a-z0-9äöüß]+)\s+(schicken|senden)\b/i.test(text);
      
      // b) Greeting/Startmarker present (hi/hallo/hey/guten tag/moin/servus etc.)
      const greetingMarkerPattern = /\b(hi|hallo|hey|guten\s+tag|guten\s+morgen|guten\s+abend|moin|servus|lieber|liebe)\s+/i;
      const hasGreetingMarker = greetingMarkerPattern.test(original);
      
      // c) body-clean would find a message start marker
      // (We simulate this by checking if cleanEmailBodyFromCommand would find something)
      let bodyCleanCandidate = false;
      try {
        // Test if body-clean would extract meaningful content (not just command phrases)
        const testBody = cleanEmailBodyFromCommand(original, null);
        // If body-clean found a greeting marker or extracted substantial content
        const testBodyLower = testBody.toLowerCase();
        bodyCleanCandidate = greetingMarkerPattern.test(testBody) || 
                            (testBody.length > 20 && !testBodyLower.match(/^(schick|sende|mail|email|nachricht)\s*/i));
      } catch {
        // If body-clean fails, assume no compose candidate
      }
      
      const composeCandidate = schickenDirectCandidate || hasGreetingMarker || bodyCleanCandidate;
      
      if (composeCandidate && sendCandidate) {
        // Route to email-compose with autoSend=true
        // Extract toNameRaw and bodyHint using schicken-direct logic if applicable
        
        let toNameRaw: string | null = null;
        let bodyHint: string | undefined = undefined;
        
        // Try schicken-direct pattern extraction first
        const schickenDirectMatch = text.match(/^(?:bitte\s+)?([a-z0-9äöüß]+)\s+(schicken|senden)\b/i);
        if (schickenDirectMatch && schickenDirectMatch[1]) {
          toNameRaw = schickenDirectMatch[1].trim();
          const verbMatch = schickenDirectMatch[2];
          
          // Extract body from original text
          const originalPattern = new RegExp(`^(?:bitte\\s+)?${toNameRaw}\\s+(?:${verbMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
          const originalMatch = original.match(originalPattern);
          let rawBodyTextOriginal = original;
          if (originalMatch && originalMatch.index !== undefined) {
            const originalMatchEnd = originalMatch.index + originalMatch[0].length;
            rawBodyTextOriginal = original.slice(originalMatchEnd).trim();
            rawBodyTextOriginal = rawBodyTextOriginal.replace(/^[,.\-–—:;]+\s*/, '').trim();
          } else {
            const matchEndIndex = schickenDirectMatch.index! + schickenDirectMatch[0].length;
            rawBodyTextOriginal = text.slice(matchEndIndex).trim();
            rawBodyTextOriginal = rawBodyTextOriginal.replace(/^[,.\-–—:;]+\s*/, '').trim();
          }
          
          // Clean body text and strip send phrases
          bodyHint = cleanEmailBodyFromCommand(rawBodyTextOriginal, toNameRaw);
          // Also strip send phrases from end
          bodyHint = stripAutoSendFromAppendText(bodyHint);
        } else {
          // Fallback: Extract using body-clean and try to find name from text
          // Try to extract name from beginning of text
          const nameMatch = text.match(/^(?:bitte\s+)?([a-z0-9äöüß]{2,20})\s+/i);
          if (nameMatch && nameMatch[1]) {
            toNameRaw = nameMatch[1].trim();
          }
          
          // Use body-clean to extract body
          bodyHint = cleanEmailBodyFromCommand(original, toNameRaw);
          // Strip trailing send phrases from end
          const strippedResult = stripTrailingSendPhrasesV4(bodyHint || '');
          bodyHint = strippedResult.text;
          if (strippedResult.stripped) {
            console.debug('[intent-router][strip-trailing-send] removed trailing send phrase from bodyHint');
          }
        }
        
          // Only proceed if we have meaningful content
          if (bodyHint && bodyHint.trim().length > 5) {
            // Block AutoSend if false-positive exclusion was detected
            const finalAutoSend = autoSendExcludedByFalsePositive ? false : true;
            if (autoSendExcludedByFalsePositive) {
              console.log('[intent-router][autosend-guard] autosend blocked due to false-positive exclusion');
            }
            
            console.log('[intent-router][compose-precedence] compose+send detected -> routing to email-compose (autoSend=' + finalAutoSend + ')', {
              toNameRaw,
              bodyPreview: bodyHint.substring(0, 60),
            });
            
            const intent: VoiceIntent = {
              type: "email-compose",
              toRaw: toNameRaw || undefined,
              subjectHint: undefined,
              bodyHint: bodyHint,
              meta: {
                statusEmail: {
                  isStatus: true,
                  rawText: text,
                  toNameRaw: toNameRaw,
                  statusText: bodyHint,
                  autoSend: finalAutoSend,
                },
                autoSend: finalAutoSend,
              },
            };
          
          // Versuche auch, E-Mail-Adresse zu extrahieren
          const extractedEmail = extractEmailAddress(original);
          if (extractedEmail) {
            intent.to = extractedEmail;
            console.log("[intent-router][compose-precedence] E-Mail-Adresse extrahiert:", extractedEmail);
          }
          
          return intent;
        }
      }
    }
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
    // Guard: Wenn AutoSend-Phrase matched UND Inhalt vorhanden ist, dann email-append statt email-send
    try {
      const { getLastAction } = require("./voice_action_store");
      const lastAction = getLastAction();
      const isEmailContext = lastAction && (lastAction.kind === "email-compose" || lastAction.kind === "email-append");
      
      if (isEmailContext) {
        // Prüfe auf AutoSend-Phrasen (die auch in email-append verwendet werden)
        const hasAutoSendPhrase = /schick.*(?:die\s+)?(?:mail|email).*direkt\s+los|sende.*(?:die\s+)?(?:mail|email).*direkt|schick.*direkt\s+(?:los|raus)|sende.*direkt\s+(?:los|raus)/i.test(text);
        
        if (hasAutoSendPhrase) {
          // Extrahiere Content-Kandidat (ohne Send-Phrase)
          let contentCandidate = stripAutoSendFromAppendText(original);
          
          // Entferne leichte Füllwörter am Anfang/Ende
          contentCandidate = contentCandidate
            .replace(/^(bitte|die\s+mail|mail|e-mail|email|jetzt|sofort|gleich)\s+/i, '')
            .replace(/\s+(bitte|die\s+mail|mail|e-mail|email|jetzt|sofort|gleich)$/i, '')
            .trim();
          
          // Wenn noch substantieller Inhalt vorhanden ist (>= 12 Zeichen), dann email-append
          if (contentCandidate.length >= 12) {
            console.log("[fm-voice] email-send guard: content detected, routing as email-append", { contentCandidate: contentCandidate.substring(0, 50) });
            
            // Route als email-append mit AutoSend
            const intent: VoiceIntent = {
              type: "email-append",
              meta: {
                autoSend: true,
              },
              payload: {
                appendText: contentCandidate,
              },
            };
            return intent;
          }
        }
      }
    } catch {
      // getLastAction nicht verfügbar, fallback zu email-send
    }
    
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

  // ============================================================
  // EMAIL-APPEND: Text an bestehenden E-Mail-Draft anhängen
  // MUST run BEFORE wizard2 to prevent "schreib noch dazu" from being caught by wizard2-rewrite-body
  // ============================================================
  {
    const appendTriggers = [
      // Full forms with "noch" and "folgendes"
      /^füge\s+noch\s+folgendes\s+hinzu\s*[:.]?\s*/i,
      /^fuge\s+noch\s+folgendes\s+hinzu\s*[:.]?\s*/i, // umlaut-less
      /^fuge\s+bitte\s+noch\s+folgendes\s+hinzu\s*[:.]?\s*/i, // "fuge bitte noch folgendes hinzu"
      // Full forms with "noch"
      /^füge\s+noch\s+hinzu\s*[:.]?\s*/i,
      /^fuge\s+noch\s+hinzu\s*[:.]?\s*/i, // umlaut-less
      /^fuge\s+bitte\s+noch\s+hinzu\s*[:.]?\s*/i, // "fuge bitte noch hinzu"
      /^ergänze\s+noch\s*[:.]?\s*/i,
      /^erganze\s+noch\s*[:.]?\s*/i, // umlaut-less
      /^erganze\s+bitte\s+noch\s*[:.]?\s*/i, // "erganze bitte noch"
      /^häng\s+noch\s+dran\s*[:.]?\s*/i,
      /^hang\s+noch\s+dran\s*[:.]?\s*/i, // umlaut-less
      /^häng(?:e|en)?\s+(?:bitte\s+)?(?:noch\s+)?an/i, // "hänge noch an", "häng an", "hänge anruf..." (ohne \b für "anruf" tolerance)
      /^hang(?:e|en)?\s+(?:bitte\s+)?(?:noch\s+)?an/i, // umlaut-less (ohne "n" in "hang")
      /^schreib\s+noch\s+dazu\s*[:.]?\s*/i,
      /^und\s+außerdem\s*[:.]?\s*/i,
      /^und\s+ausserdem\s*[:.]?\s*/i, // umlaut-less
      // Short forms (without "noch")
      /^füge\s+hinzu\s*[:.]?\s*/i,
      /^fuge\s+hinzu\s*[:.]?\s*/i, // umlaut-less
      /^ergänze\s*[:.]?\s*/i,
      /^erganze\s*[:.]?\s*/i, // umlaut-less
      // Extended synonyms
      /^erganze\s+das\s+um\s*[:.]?\s*/i, // "erganze das um"
      /^erweitere\s+das\s+um\s*[:.]?\s*/i, // "erweitere das um"
      /^pack\s+noch\s+dazu\s*[:.]?\s*/i, // "pack noch dazu"
      /^setz\s+noch\s+dahinter\s*[:.]?\s*/i, // "setz noch dahinter"
      /^mach\s+noch\s+dazu\s*[:.]?\s*/i, // "mach noch dazu"
      /^hau\s+noch\s+dran\s*[:.]?\s*/i, // "hau noch dran"
    ];

    let matchedTrigger: RegExpMatchArray | null = null;
    let triggerIndex = -1;

    for (const trigger of appendTriggers) {
      const match = text.match(trigger);
      if (match) {
        matchedTrigger = match;
        triggerIndex = match.index! + match[0].length;
        break;
      }
    }

    if (matchedTrigger && triggerIndex >= 0) {
      console.log('[email-append] detected');

      // Extract appendText from ORIGINAL text (preserve capitalization)
      // Find corresponding position in original text
      const normalizedTriggerMatch = text.match(matchedTrigger[0].toLowerCase());
      let originalTriggerIndex = -1;
      if (normalizedTriggerMatch) {
        // Find the trigger in original text (case-insensitive search)
        const triggerPattern = new RegExp(matchedTrigger[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const originalMatch = original.match(triggerPattern);
        if (originalMatch && originalMatch.index !== undefined) {
          originalTriggerIndex = originalMatch.index + originalMatch[0].length;
        }
      }

      // Fallback: use normalized index if original match fails
      const extractIndex = originalTriggerIndex >= 0 ? originalTriggerIndex : triggerIndex;
      let appendTextRaw = original.substring(extractIndex).trim();
      
      // Trim punctuation/leading commas/colons
      appendTextRaw = appendTextRaw.replace(/^[,.:;!?\s]+/, '').trim();

      // Detect AutoSend phrases (MUST be done BEFORE sanitization, use normalized for detection)
      const normalizedAppendText = appendTextRaw.toLowerCase();
      const sendTriggers = [
        /\bund\s+schick(?:t|e)?\s+(?:es|sie|die\s+(?:mail|email))\s+(?:direkt\s+)?(?:los|ab|raus)\b/i,
        /\bund\s+schick(?:t|e)?\s+es\s+ab\b/i,
        /\bund\s+sende\s+(?:es|sie)\s+(?:direkt\s+)?(?:los|ab|raus)\b/i,
        /\bund\s+sende\s+es\b/i,
        /\bund\s+sende\s+es\s+jetzt\b/i,
        /\bund\s+raus\s+damit\b/i,
        /\bund\s+schick\s+es\s+(?:jetzt|sofort)\s*(?:ab|raus)?\b/i,
        /\bund\s+sende\s+(?:es|sie)\s+(?:jetzt|sofort|ab|raus)\b/i,
        /\bsofort\s+raus\b/i, // "sofort raus" standalone
      ];

      let hasAutoSend = false;
      for (const sendTrigger of sendTriggers) {
        if (sendTrigger.test(normalizedAppendText)) {
          hasAutoSend = true;
          break;
        }
      }

      // Strip AutoSend phrases from appendText using robust helper
      let appendText = stripAutoSendFromAppendText(appendTextRaw);

      // Fallback: AGGRESSIVE Sanitization if helper didn't catch everything
      // These words MUST NEVER appear in the email body
      appendText = appendText
        .replace(/\s*und\s+schick\s+(?:es|sie)\s+(?:direkt\s+)?(?:los|ab|raus)\s*/gi, '')
        .replace(/\s*und\s+schicke\s+(?:es|sie)\s+(?:direkt\s+)?(?:los|ab|raus)\s*/gi, '')
        .replace(/\s*und\s+schick\s+es\s+ab\s*/gi, '')
        .replace(/\s*und\s+sende\s+(?:es|sie)\s+(?:direkt\s+)?(?:los|ab|raus)\s*/gi, '')
        .replace(/\s*und\s+sende\s+es\s*(?:jetzt|sofort)?\s*/gi, '')
        .replace(/\s*und\s+raus\s+damit\s*/gi, '')
        .replace(/\s*und\s+schick\s+es\s+(?:jetzt|sofort)?\s*(?:ab|raus)?\s*/gi, '')
        .replace(/\s*und\s+sende\s+(?:es|sie)\s+(?:jetzt|sofort|ab|raus)\s*/gi, '')
        .replace(/\bsofort\s+raus\b/gi, '') // Remove "sofort raus" standalone
        .replace(/\bsenden\b/gi, '')
        .replace(/\bsend\b/gi, '')
        .replace(/\bschick\s+(?:es|sie)\b/gi, '')
        .replace(/\braus\s+damit\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (appendText.length > 0) {
        const intent: VoiceIntent = {
          type: "email-append",
          meta: {
            autoSend: hasAutoSend,
          },
          payload: {
            appendText: appendText,
          },
        };

        console.log('[email-append] appendText=' + appendText.substring(0, 50) + (appendText.length > 50 ? '...' : ''));
        console.log('[email-append] autoSend=' + hasAutoSend);

        return intent;
      } else {
        // If appendText is empty after sanitization, do NOT create intent
        // This prevents fallthrough to fm-ai
        console.log('[email-append] detected but appendText empty after extraction, ignoring');
        return { type: "unknown" }; // Return unknown instead of falling through to ai-chat
      }
    }
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
        // Try to extract body text after "schreiben" or use original text and let cleaning function handle it
        let bodyHint: string | undefined;
        
        // Method 1: Find "schreiben" and extract everything after it
        const schreibenMatch = /schreiben\s+(.+)/i.exec(original);
        if (schreibenMatch && schreibenMatch[1]) {
          const rawBodyText = schreibenMatch[1].trim();
          bodyHint = cleanEmailBodyFromCommand(rawBodyText, toNameRaw);
        }
        
        // Fallback: Method 2 - Split by first period (.)
        if (!bodyHint) {
          const dotIndex = original.indexOf('.');
          if (dotIndex >= 0) {
            const afterDot = original.slice(dotIndex + 1).trim();
            if (afterDot.length > 0) {
              bodyHint = cleanEmailBodyFromCommand(afterDot, toNameRaw);
            }
          }
        }
        
        // Fallback: Method 3 - Use original text and let cleaning function extract the body
        // (this will use greeting markers if available)
        if (!bodyHint) {
          bodyHint = cleanEmailBodyFromCommand(original, toNameRaw);
        }
        
        if (bodyHint) {
          const preview = bodyHint.length > 80 ? bodyHint.substring(0, 80) + '...' : bodyHint;
          console.log('[intent-router][lass-uns] bodyCandidate extracted:', preview);
        }
        
        // Use reusable AutoSend detection
        const hasExtendedAutoSend = detectExtendedAutoSend(normalized);
        
        // FIX 3: "Lass uns ... senden" AutoSend - prüfe explizit auf "senden" im Kontext
        let hasSendenAutoSend = false;
        // Prüfe auf SEND-Wörter im Kontext der Mail (nicht nur "schreiben")
        const sendWords = /\b(senden|abschicken|rausschicken|verschicken)\b/i;
        const direktSenden = /\bdirekt\s+(?:senden|schicken)\b/i;
        
        // Wenn "senden" vorkommt UND es um eine Mail/Nachricht geht (nicht nur Zusammenarbeit)
        if (sendWords.test(original) || direktSenden.test(original)) {
          // Guard: Nicht false-positive wie "ich sende", "wir senden"
          if (!/^(?:ich|wir)\s+(?:sende|senden|schicke|schicken)\b/i.test(original)) {
            hasSendenAutoSend = true;
            console.log('[intent-router][lass-uns][autosend] autoSend=true because "senden" detected');
          }
        }
        
        const autoSend = hasExtendedAutoSend || hasSendenAutoSend;
        
        // TASK 1: Create email-compose intent with same shape as A3.4
        // Use FreeDictationMeta structure so Wizard4 treats it the same way
        const freeDictationMeta: FreeDictationMeta = {
          normalized: normalized,
          toNameRaw: toNameRaw,
          bodyText: bodyHint || "",
          autoSend: autoSend,
        };
        
        // Extract bodyHintRaw from original raw text (behält Groß-/Kleinschreibung)
        const bodyHintRaw = bodyHint ? extractBodyFromRaw(original, normalized, bodyHint) : undefined;
        
        const intent: VoiceIntent = {
          type: "email-compose",
          toRaw: toNameRaw,
          subjectHint: undefined,
          bodyHint: bodyHint, // Top-level field, same as A3.4
          bodyHintRaw: bodyHintRaw, // Raw version with capitalization preserved
          meta: {
            freeDictationMeta: freeDictationMeta, // Same structure as A3.4
            source: 'lass-uns',
            autoSend: autoSend, // FIX 3: Explizit in meta.autoSend setzen
          },
        };
        
        console.log('[intent-router][lass-uns] Created email-compose intent:', {
          toRaw: toNameRaw,
          hasBodyHint: !!bodyHint,
          hasBodyHintRaw: !!bodyHintRaw,
          bodyHintPreview: bodyHint ? bodyHint.substring(0, 50) : undefined,
          bodyHintRawPreview: bodyHintRaw ? bodyHintRaw.substring(0, 50) : undefined,
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
      
      // Prüfe zuerst auf "schick/sende <NAME> eine kurze mail, <BODY>" Muster
      const schickMailParsed = parseSchickMailPattern(original);
      let toRaw: string | undefined;
      let bodyHint: string | undefined;
      let bodyHintRaw: string | undefined;

      if (schickMailParsed) {
        // Neues Pattern erkannt - verwende dieses
        toRaw = schickMailParsed.toRaw;
        bodyHint = schickMailParsed.bodyHint;
        bodyHintRaw = schickMailParsed.bodyHint; // Für jetzt gleich wie bodyHint
        console.log('[intent-router][intent-4.2][schick-mail-pattern] Pattern erkannt:', {
          toRaw,
          bodyHintPreview: bodyHint?.substring(0, 50)
        });
      } else {
        // Fallback: Versuche parseEmailCompose (für "schreib ..." Varianten)
        const emailParsed = parseEmailCompose(original);
        toRaw = emailParsed?.toRaw;
        bodyHint = emailParsed?.bodyHint;
      }

      // Prüfe auf Imperativ am Anfang für AutoSend
      const imperativePattern = /^(schick|schicke|sende|send)\b/i;
      const hasImperative = imperativePattern.test(text);
      
      // Prüfe auf Negation/Preview (höchste Priorität)
      const negationPatterns = [
        /\bnicht\s+(?:senden|schicken|abschicken|rausschicken)\b/i,
        /\b(?:nur|bloß)\s+(?:zeigen|vorzeigen|anzeigen|darstellen)\b/i,
        /\b(?:nur|bloß)\s+entwurf\b/i,
        /\bentwurf\s+(?:nur|bloß|zeigen)\b/i,
        /\b(?:vorlesen|vorlese|vorliest)\b/i,
        /\b(?:preview|vorschau|vorschauen)\b/i,
      ];
      const hasNegation = negationPatterns.some(pattern => pattern.test(text));
      
      // AutoSend-Entscheidung: true wenn Imperativ UND keine Negation UND kein False-Positive
      const autoSend = hasImperative && !hasNegation && !autoSendExcludedByFalsePositive;

      // Erstelle email-compose Intent
      const intent: VoiceIntent = {
        type: "email-compose",
        toRaw: toRaw,
        subjectHint: undefined,
        bodyHint: bodyHint,
        bodyHintRaw: bodyHintRaw,
        meta: {
          source: 'intent-4.2-umgangssprache',
          autoSend: autoSend,
        },
      };
      
      // Wenn eine E-Mail-Adresse per Regex gefunden wurde, diese als 'to' setzen
      const extractedEmail = extractEmailAddress(original);
      if (extractedEmail) {
        intent.to = extractedEmail;
        console.log("[intent-router][intent-4.2] E-Mail-Adresse extrahiert:", extractedEmail);
      }

      console.log('[intent-router][intent-4.2] Intent erstellt:', {
        toRaw,
        hasBodyHint: !!bodyHint,
        bodyHintPreview: bodyHint?.substring(0, 50),
        autoSend,
        hasImperative,
        hasNegation
      });
      
      return intent;
    }
  }

  // ============================================================
  // INTENT 4.2: "Schicken-Direct" Pattern: "<Name> schicken/senden ..."
  // ============================================================
  // Pattern: "<toName> schicken/senden <body>"
  // Examples:
  // - "Thomas schicken ich komme 10 minuten später"
  // - "Thomas schicken Hi Thomas, ich komme 10 minuten später"
  // - "bitte Thomas schicken. Hi Thomas, ..."
  // Must run AFTER status-brain and other email intents, but BEFORE ai-chat fallback
  {
    // Match: start of text (or after "bitte") contains "<name> schicken" or "<name> senden"
    // Pattern: (optional "bitte") <name> (schicken|senden) <rest>
    const schickenDirectMatch = text.match(/^(?:bitte\s+)?([a-z0-9äöüß]+)\s+(schicken|senden)\b/i);
    if (schickenDirectMatch && schickenDirectMatch[1] && schickenDirectMatch[2]) {
      const toNameRaw = schickenDirectMatch[1].trim();
      const verbMatch = schickenDirectMatch[2];
      
      // Extract rest text (body) from original text
      // Find the pattern in original (case-insensitive) for better case preservation
      const originalPattern = new RegExp(`^(?:bitte\\s+)?${toNameRaw}\\s+(?:${verbMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
      const originalMatch = original.match(originalPattern);
      let rawBodyTextOriginal = original;
      if (originalMatch && originalMatch.index !== undefined) {
        const originalMatchEnd = originalMatch.index + originalMatch[0].length;
        rawBodyTextOriginal = original.slice(originalMatchEnd).trim();
        // Remove leading comma/punctuation if present
        rawBodyTextOriginal = rawBodyTextOriginal.replace(/^[,.\-–—:;]+\s*/, '').trim();
      } else {
        // Fallback: extract from normalized
        const matchEndIndex = schickenDirectMatch.index! + schickenDirectMatch[0].length;
        rawBodyTextOriginal = text.slice(matchEndIndex).trim();
        rawBodyTextOriginal = rawBodyTextOriginal.replace(/^[,.\-–—:;]+\s*/, '').trim();
      }
      
      // Clean body text using existing body-clean mechanism (handles greeting markers)
      let bodyText = cleanEmailBodyFromCommand(rawBodyTextOriginal, toNameRaw);
      
      // Strip trailing send phrases from end
      const strippedResult = stripTrailingSendPhrasesV4(bodyText);
      bodyText = strippedResult.text;
      if (strippedResult.stripped) {
        console.debug('[intent-router][strip-trailing-send] removed trailing send phrase from bodyHint');
      }
      
      // Validierungs-Check: Wenn bodyText nach stripping leer wird, kein email-compose erstellen
      if (!bodyText || bodyText.trim().length < 3) {
        console.debug("[intent-router] bodyHint empty after stripping, ignoring compose");
        // Continue to next matcher/fallback - don't create intent
        return { type: "unknown" };
      }
      
      // AutoSend: This pattern semantically indicates a send request
      // BUT: Block if false-positive exclusion was detected OR negation present
      let autoSend = true;
      if (autoSendExcludedByFalsePositive) {
        autoSend = false;
        console.log('[intent-router][autosend-guard] autosend blocked due to false-positive exclusion');
      }
      
      // Prüfe auf Negation (höchste Priorität)
      const hasNegation = hasNoSendNegation(original) || hasNoSendNegation(text);
      if (hasNegation) {
        autoSend = false;
        console.debug("[intent-router][autosend] disabled due to negation");
      }
      
      console.log('[intent-router][intent-4.2][schicken-direct] erkannt', {
        toNameRaw,
        verb: verbMatch,
        bodyPreview: bodyText ? bodyText.substring(0, 60) : null,
        autoSend
      });
      console.log('[intent-router][intent-4.2][schicken-direct] toNameRaw:', toNameRaw);
      console.log('[intent-router][intent-4.2][schicken-direct] bodyHint:', bodyText ? bodyText.substring(0, 80) : null);
      console.log('[intent-router][intent-4.2][schicken-direct] autoSend=' + autoSend);
      
      const intent: VoiceIntent = {
        type: "email-compose",
        toRaw: toNameRaw,
        subjectHint: undefined,
        bodyHint: bodyText || undefined,
        meta: {
          statusEmail: {
            isStatus: true,
            rawText: text,
            toNameRaw: toNameRaw,
            statusText: bodyText || null,
            autoSend: autoSend,
          },
          autoSend: autoSend,
        },
      };
      
      // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
      const extractedEmail = extractEmailAddress(original);
      if (extractedEmail) {
        intent.to = extractedEmail;
        console.log("[intent-router][intent-4.2][schicken-direct] E-Mail-Adresse extrahiert:", extractedEmail);
      }
      
      return intent;
    }
  }

  // ============================================================
  // SHORT IMPERATIVE PATTERN: "sende <name> bitte, <body>"
  // ============================================================
  // Erkennt kurze Imperativ-Sätze wie:
  // - "Sende Thomas bitte, ich melde mich später nochmal."
  // - "Schick Thomas, ich bin gleich da."
  // Muss VOR AI-Fallback kommen, aber NACH allen anderen Email-Intents
  {
    const shortImperativeMatch = detectShortImperativePattern(original, text);
    if (shortImperativeMatch) {
      const { toRaw, bodyHint, bodyHintRaw } = shortImperativeMatch;

      // Prüfe auf Negation/Preview (höchste Priorität)
      const negationPatterns = [
        /\bnicht\s+(?:senden|schicken|abschicken|rausschicken)\b/i,
        /\b(?:nur|bloß)\s+(?:zeigen|vorzeigen|anzeigen|darstellen)\b/i,
        /\b(?:nur|bloß)\s+entwurf\b/i,
        /\bentwurf\s+(?:nur|bloß|zeigen)\b/i,
        /\b(?:vorlesen|vorlese|vorliest)\b/i,
        /\b(?:preview|vorschau|vorschauen)\b/i,
      ];
      const hasNegation = negationPatterns.some(pattern => pattern.test(original) || pattern.test(text));

      // AutoSend: true wenn Imperativ UND keine Negation UND kein False-Positive
      const autoSend = !hasNegation && !autoSendExcludedByFalsePositive;

      const intent: VoiceIntent = {
        type: "email-compose",
        toRaw: toRaw,
        subjectHint: undefined,
        bodyHint: bodyHint,
        bodyHintRaw: bodyHintRaw,
        meta: {
          source: 'short-imperative',
          autoSend: autoSend,
        },
      };

      // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
      const extractedEmail = extractEmailAddress(original);
      if (extractedEmail) {
        intent.to = extractedEmail;
        console.log("[intent-router][short-imperative] E-Mail-Adresse extrahiert:", extractedEmail);
      }

      console.log('[intent-router][short-imperative] matched', {
        toNameRaw: toRaw,
        bodyPreview: bodyHint.substring(0, 50),
        bodyHintRawPreview: bodyHintRaw.substring(0, 50),
        autoSend: autoSend,
        hasNegation: hasNegation,
        excludedByFalsePositive: autoSendExcludedByFalsePositive
      });

      return intent;
    }
  }

  // ============================================================
  // PASSIVE SEND PATTERN: "bitte sofort an <name> senden. <body>"
  // ============================================================
  // Erkennt passive Send-Sätze wie:
  // - "Bitte sofort an Thomas senden. Kurze Info verzögert sich etwas."
  // - "Sofort an Thomas senden: Bin in 5 Minuten da."
  // - "Bitte an Thomas senden. Kurze Info verzögert sich etwas." (ohne sofort -> previewOnly)
  // Muss VOR AI-Fallback kommen, aber NACH allen anderen Email-Intents
  {
    const passiveSendMatch = detectPassiveSendPattern(original, text);
    if (passiveSendMatch) {
      const { toRaw, bodyHint, bodyHintRaw, hasAutoSendTrigger } = passiveSendMatch;

      // Prüfe auf Negation/Preview (höchste Priorität)
      const negationPatterns = [
        /\bnicht\s+(?:senden|schicken|abschicken|rausschicken)\b/i,
        /\b(?:nur|bloß)\s+(?:zeigen|vorzeigen|anzeigen|darstellen)\b/i,
        /\b(?:nur|bloß)\s+entwurf\b/i,
        /\bentwurf\s+(?:nur|bloß|zeigen)\b/i,
        /\b(?:vorlesen|vorlese|vorliest)\b/i,
        /\b(?:preview|vorschau|vorschauen)\b/i,
      ];
      const hasNegation = negationPatterns.some(pattern => pattern.test(original) || pattern.test(text));

      // AutoSend: true wenn AutoSend-Trigger vorhanden UND keine Negation UND kein False-Positive
      // default: false (wenn kein "sofort|direkt|jetzt" im Command)
      const autoSend = hasAutoSendTrigger && !hasNegation && !autoSendExcludedByFalsePositive;

      const intent: VoiceIntent = {
        type: "email-compose",
        toRaw: toRaw,
        subjectHint: undefined,
        bodyHint: bodyHint,
        bodyHintRaw: bodyHintRaw,
        meta: {
          source: 'passive-send',
          autoSend: autoSend,
        },
      };

      // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
      const extractedEmail = extractEmailAddress(original);
      if (extractedEmail) {
        intent.to = extractedEmail;
        console.log("[intent-router][passive-send] E-Mail-Adresse extrahiert:", extractedEmail);
      }

      // Extrahiere Command-Teil für Logging
      const commandMatch = original.match(/^(?:bitte\s+)?(?:sofort|direkt|jetzt)?\s*an\s+[^,.:]+\s+senden/i);
      const commandPreview = commandMatch ? commandMatch[0].substring(0, 50) : 'unknown';

      console.debug('[intent-router][passive-send] matched', {
        toNameRaw: toRaw,
        bodyPreview: bodyHint.substring(0, 50),
        autoSend: autoSend,
        commandPreview: commandPreview,
        hasAutoSendTrigger: hasAutoSendTrigger,
        hasNegation: hasNegation,
        excludedByFalsePositive: autoSendExcludedByFalsePositive
      });

      return intent;
    }
  }

  // ============================================================
  // SCHICK-AN-DIRECT PATTERN: "schick das direkt an thomas bin im termin"
  // ============================================================
  // Erkennt direkte "schick an <name> <body>" Sätze ohne Separator:
  // - "Schick das direkt an Thomas bin im Termin."
  // - "Schick bitte an Thomas ich ruf später an"
  // - "Schick an Thomas bin gleich da"
  // Muss VOR AI-Fallback kommen, aber NACH allen anderen Email-Intents
  {
    const schickAnDirectMatch = detectSchickAnDirectPattern(original, text);
    if (schickAnDirectMatch) {
      const { toRaw, bodyHint, bodyHintRaw, hasAutoSendTrigger } = schickAnDirectMatch;

      // Prüfe auf Negation/Preview (höchste Priorität)
      const negationPatterns = [
        /\bnicht\s+(?:senden|schicken|abschicken|rausschicken)\b/i,
        /\b(?:nur|bloß)\s+(?:zeigen|vorzeigen|anzeigen|darstellen)\b/i,
        /\b(?:nur|bloß)\s+entwurf\b/i,
        /\bentwurf\s+(?:nur|bloß|zeigen)\b/i,
        /\b(?:vorlesen|vorlese|vorliest)\b/i,
        /\b(?:preview|vorschau|vorschauen)\b/i,
      ];
      const hasNegation = negationPatterns.some(pattern => pattern.test(original) || pattern.test(text));

      // AutoSend: true wenn AutoSend-Trigger vorhanden UND keine Negation UND kein False-Positive
      // Wenn "schick" verwendet wird, setze autoSend=true (wie bei anderen schick-Patterns)
      const autoSend = hasAutoSendTrigger && !hasNegation && !autoSendExcludedByFalsePositive;

      const intent: VoiceIntent = {
        type: "email-compose",
        toRaw: toRaw,
        subjectHint: undefined,
        bodyHint: bodyHint,
        bodyHintRaw: bodyHintRaw,
        meta: {
          source: 'schick-an-direct',
          autoSend: autoSend,
        },
      };

      // Versuche auch, E-Mail-Adresse zu extrahieren (falls vorhanden)
      const extractedEmail = extractEmailAddress(original);
      if (extractedEmail) {
        intent.to = extractedEmail;
        console.log("[intent-router][schick-an-direct] E-Mail-Adresse extrahiert:", extractedEmail);
      }

      console.debug('[intent-router][schick-an-direct] matched', {
        toNameRaw: toRaw,
        bodyPreview: bodyHint.substring(0, 50),
        normalizedPreview: text.substring(0, 80),
        autoSend: autoSend,
        hasAutoSendTrigger: hasAutoSendTrigger,
        hasNegation: hasNegation,
        excludedByFalsePositive: autoSendExcludedByFalsePositive
      });

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
