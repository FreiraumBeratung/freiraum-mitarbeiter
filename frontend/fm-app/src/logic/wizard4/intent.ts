/**
 * Wizard 4.1 Intent Parser
 * 
 * Intent 4.1: Umgangssprachliche deutsche Sprachbefehle werden zuverlässig
 * in ein normiertes EmailIntentV4-Objekt umgewandelt.
 * 
 * KEINE UI, KEIN BACKEND, KEINE SIDE-EFFECTS.
 * Reines Parsing ohne AutoSend-Logik.
 */

// ============================================================
// TYP-DEFINITIONEN (Intent 4.1)
// ============================================================

/**
 * EmailIntentV4 - Normiertes Intent-Objekt für Wizard 4.1
 */
export interface EmailIntentV4 {
  /** Gereinigte Nachricht ohne Befehlswörter */
  message: string;
  
  /** Empfänger-Informationen */
  recipient: {
    /** Roher Empfänger-Text (wie im Input) */
    raw: string | null;
    /** Extrahierte E-Mail-Adresse */
    email: string | null;
    /** Extrahierter Name (NICHT aus Domain) */
    name: string | null;
  };
  
  /** Sende-Modus: "sendNow" (Standard) oder "draft" */
  sendMode: "sendNow" | "draft";
  
  /** Tonfall: "locker", "neutral" oder "formell" */
  tone: "locker" | "neutral" | "formell";
}

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

/**
 * Normalisiert umgangssprachliche Befehle zu einheitlichen Formen
 * 
 * Beispiele:
 * - "hau raus" → "schreibe"
 * - "schick mal" → "schreibe"
 * - "mach ne mail" → "schreibe mail"
 * - "sag ihm" → "schreibe"
 */
export function normalizeText(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  let text = input.trim();
  
  // Umgangssprachliche Befehle normalisieren
  const normalizations: Array<[RegExp, string]> = [
    // "hau raus", "hau mal raus" → "schreibe"
    [/hau\s+(mal\s+)?raus/gi, 'schreibe'],
    // "schick mal", "schick", "schicke" → "schreibe"
    [/schick(e)?\s+(mal\s+)?/gi, 'schreibe '],
    // "mach ne mail", "mach eine mail" → "schreibe mail"
    [/mach(e)?\s+(ne\s+|eine\s+)?mail/gi, 'schreibe mail'],
    // "sag ihm", "sag ihr", "sage" → "schreibe"
    [/sag(e)?\s+(ihm|ihr|dem|der|den)\s+/gi, 'schreibe '],
    // "schreib mal", "schreibe mal" → "schreibe"
    [/schreib(e)?\s+mal\s+/gi, 'schreibe '],
    // "schreib ne", "schreibe eine" → "schreibe"
    [/schreib(e)?\s+(ne\s+|eine\s+)/gi, 'schreibe '],
    // "verfasse", "verfasse eine" → "schreibe"
    [/verfass(e)?\s+(eine\s+)?/gi, 'schreibe '],
    // "sende", "sende eine" → "schreibe"
    [/sende\s+(eine\s+)?/gi, 'schreibe '],
  ];
  
  for (const [pattern, replacement] of normalizations) {
    text = text.replace(pattern, replacement);
  }
  
  // Mehrfache Leerzeichen normalisieren
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Erkennt den Sende-Modus aus dem Text
 * 
 * Default: "sendNow"
 * "nicht senden", "nur vorbereiten" → "draft"
 */
export function detectSendMode(text: string): "sendNow" | "draft" {
  if (!text || typeof text !== 'string') return "sendNow";
  
  const lower = text.toLowerCase();
  
  // Draft-Trigger
  const draftPatterns = [
    /nicht\s+senden/gi,
    /nicht\s+abschicken/gi,
    /nicht\s+verschicken/gi,
    /nur\s+vorbereiten/gi,
    /nur\s+vorbereitung/gi,
    /erstmal\s+vorbereiten/gi,
    /erst\s+mal\s+vorbereiten/gi,
    /nur\s+entwurf/gi,
    /nur\s+draft/gi,
    /als\s+entwurf/gi,
    /als\s+draft/gi,
  ];
  
  for (const pattern of draftPatterns) {
    if (pattern.test(lower)) {
      return "draft";
    }
  }
  
  return "sendNow";
}

/**
 * Erkennt den Tonfall aus dem Text
 * 
 * Mögliche Werte: "locker", "neutral", "formell"
 * Default: "neutral"
 */
export function detectTone(text: string): "locker" | "neutral" | "formell" {
  if (!text || typeof text !== 'string') return "neutral";
  
  const lower = text.toLowerCase();
  
  // Locker-Trigger (spezifisch zuerst)
  const lockerPatterns = [
    /locker/gi,
    /entspannt/gi,
    /kurz\s+halten/gi,
    /kurz\s+und\s+knapp/gi,
    /lockere/gi,
    /lockeren/gi,
  ];
  
  for (const pattern of lockerPatterns) {
    if (pattern.test(lower)) {
      return "locker";
    }
  }
  
  // Formell-Trigger
  const formellPatterns = [
    /formell/gi,
    /formelle/gi,
    /formellen/gi,
    /professionell/gi,
    /professionelle/gi,
    /professionellen/gi,
    /offiziell/gi,
    /offizielle/gi,
    /offiziellen/gi,
    /geschäftlich/gi,
    /geschäftliche/gi,
    /geschäftlichen/gi,
  ];
  
  for (const pattern of formellPatterns) {
    if (pattern.test(lower)) {
      return "formell";
    }
  }
  
  // Default: neutral
  return "neutral";
}

/**
 * Extrahiert die eigentliche Nachricht aus dem Text
 * 
 * WICHTIG: Entfernt ALLE Befehlswörter und Trigger-Phrasen.
 * Wenn kein Text extrahierbar ist → leere Zeichenkette.
 */
export function extractMessage(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  let message = text.trim();
  
  // 1. Einleitende Befehlswörter entfernen
  const commandPatterns = [
    /^schreib(e)?\s+/i,
    /^sag(e)?\s+/i,
    /^mach(e)?\s+(bitte\s+)?/i,
    /^verfass(e)?\s+/i,
    /^sende\s+/i,
    /^hau\s+(mal\s+)?raus\s+/i,
    /^schick(e)?\s+(mal\s+)?/i,
    /schreib(e)?\s+eine\s+(e-?mail|mail)\s+/i,
    /schreib(e)?\s+(ne\s+|eine\s+)?mail\s+/i,
    /mach(e)?\s+(ne\s+|eine\s+)?mail\s+/i,
  ];
  
  for (const pattern of commandPatterns) {
    message = message.replace(pattern, '');
  }
  
  // 2. Empfänger-Phrasen entfernen (nach Befehlswörtern)
  const recipientPatterns = [
    /\b(an|zu|für)\s+[a-zäöüß]+\s+/gi,
    /\b(an|zu|für)\s+[a-zäöüß]+\s+eine\s+mail\s+/gi,
    /\b(an|zu|für)\s+[a-zäöüß]+\s+eine\s+e-?mail\s+/gi,
  ];
  
  for (const pattern of recipientPatterns) {
    message = message.replace(pattern, '');
  }
  
  // 3. E-Mail-Adressen entfernen
  const emailPattern = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;
  message = message.replace(emailPattern, '');
  
  // 4. Tonfall-Marker entfernen
  const toneMarkers = [
    /\blocker(e|en)?\b/gi,
    /\bentspannt(e|en)?\b/gi,
    /\bkurz\s+halten\b/gi,
    /\bkurz\s+und\s+knapp\b/gi,
    /\bformell(e|en)?\b/gi,
    /\bprofessionell(e|en)?\b/gi,
    /\boffiziell(e|en)?\b/gi,
    /\bgeschäftlich(e|en)?\b/gi,
    /\bfreundlich(e|en)?\b/gi,
    /\bneutral(e|en)?\b/gi,
  ];
  
  for (const marker of toneMarkers) {
    message = message.replace(marker, '');
  }
  
  // 5. Send-Mode-Marker entfernen
  const sendModeMarkers = [
    /\bnicht\s+senden\b/gi,
    /\bnicht\s+abschicken\b/gi,
    /\bnicht\s+verschicken\b/gi,
    /\bnur\s+vorbereiten\b/gi,
    /\bnur\s+vorbereitung\b/gi,
    /\berstmal\s+vorbereiten\b/gi,
    /\berst\s+mal\s+vorbereiten\b/gi,
    /\bnur\s+entwurf\b/gi,
    /\bnur\s+draft\b/gi,
    /\bals\s+entwurf\b/gi,
    /\bals\s+draft\b/gi,
  ];
  
  for (const marker of sendModeMarkers) {
    message = message.replace(marker, '');
  }
  
  // 6. Weitere Trigger-Phrasen entfernen
  const otherPatterns = [
    /\beine\s+(e-?mail|mail)\b/gi,
    /\b(e-?mail|mail)\s+wegen\b/gi,
    /\bwegen\s+dem\b/gi,
    /\bwegen\s+der\b/gi,
    /\bwegen\s+den\b/gi,
    /\bwegen\s+des\b/gi,
    /\bwegen\b/gi,
    /\bbezüglich\b/gi,
    /\bbezug\b/gi,
  ];
  
  for (const pattern of otherPatterns) {
    message = message.replace(pattern, '');
  }
  
  // 7. Aufräumen: mehrfache Leerzeichen, Satzzeichen am Anfang/Ende
  message = message.replace(/\s+/g, ' ').trim();
  message = message.replace(/^[,:;\s\-–—]+/, '').trim();
  message = message.replace(/[,:;\s\-–—]+$/, '').trim();
  
  // 8. Wenn nichts übrig ist, leere Zeichenkette zurückgeben
  if (!message || message.length === 0) {
    return '';
  }
  
  return message;
}

/**
 * Extrahiert Empfänger-Informationen aus dem Text
 * 
 * @returns Objekt mit raw, email und name
 * - email: E-Mail-Adresse per Regex extrahiert
 * - name: Name extrahiert (NICHT aus Domain)
 * - raw: Roher Empfänger-Text
 */
export function extractRecipient(text: string): {
  raw: string | null;
  email: string | null;
  name: string | null;
} {
  if (!text || typeof text !== 'string') {
    return { raw: null, email: null, name: null };
  }
  
  let email: string | null = null;
  let name: string | null = null;
  let raw: string | null = null;
  
  // 1. E-Mail-Adresse per Regex extrahieren
  const emailRegex = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = text.match(emailRegex);
  
  if (emailMatch) {
    email = emailMatch[0];
    raw = emailMatch[0];
  }
  
  // 2. Name extrahieren (NICHT aus Domain)
  // Pattern: "schreibe [NAME]", "an [NAME]", "für [NAME]"
  const namePatterns = [
    /(?:schreib(e)?|sag(e)?|mach(e)?|verfass(e)?|sende)\s+(?:eine\s+(?:e-?mail|mail)\s+)?(?:an\s+|zu\s+|für\s+)?([A-ZÄÖÜß][a-zäöüß]+)/i,
    /(?:an|zu|für)\s+([A-ZÄÖÜß][a-zäöüß]+)/i,
    /(?:schreib(e)?|sag(e)?)\s+([A-ZÄÖÜß][a-zäöüß]+)/i,
  ];
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[match.length - 1]) {
      const candidate = match[match.length - 1].trim();
      
      // Prüfe, ob es KEINE E-Mail-Adresse ist
      if (!emailRegex.test(candidate)) {
        // Prüfe, ob es kein bekanntes Befehlswort ist
        const stopWords = [
          'mail', 'email', 'e-mail', 'eine', 'ne', 'mal', 'bitte',
          'locker', 'formell', 'neutral', 'entspannt', 'professionell',
          'senden', 'abschicken', 'verschicken', 'vorbereiten',
        ];
        
        if (!stopWords.includes(candidate.toLowerCase())) {
          name = candidate;
          if (!raw) {
            raw = candidate;
          }
          break;
        }
      }
    }
  }
  
  // 3. Bekannte Namen/Rollen erkennen (falls noch kein Name gefunden)
  if (!name) {
    const knownNames = [
      'papa', 'vater', 'mama', 'mutter',
      'chef', 'chefin',
      'thomas', 'dario', 'mirjeta',
      'kunde', 'kundin', 'client', 'klient',
    ];
    
    const lower = text.toLowerCase();
    for (const knownName of knownNames) {
      const regex = new RegExp(`\\b${knownName}\\b`, 'i');
      const match = text.match(regex);
      if (match) {
        // Prüfe, dass es nicht Teil einer E-Mail-Adresse ist
        const before = text.substring(Math.max(0, match.index! - 10), match.index!);
        const after = text.substring(match.index! + match[0].length, match.index! + match[0].length + 10);
        
        if (!before.includes('@') && !after.includes('@')) {
          name = match[0];
          if (!raw) {
            raw = match[0];
          }
          break;
        }
      }
    }
  }
  
  return { raw, email, name };
}

// ============================================================
// HAUPTFUNKTION
// ============================================================

/**
 * Parst umgangssprachliche deutsche Sprachbefehle in ein normiertes EmailIntentV4-Objekt
 * 
 * Intent 4.1: Zuverlässige Umwandlung von natürlicher Sprache in strukturierte Intent-Daten.
 * 
 * @param rawText - Die umgangssprachliche Eingabe
 * @returns EmailIntentV4 mit allen extrahierten Informationen
 * 
 * @example
 * parseEmailIntentV4("Schreib Thomas eine lockere Mail, dass ich morgen später komme.")
 * // => {
 * //   message: "dass ich morgen später komme",
 * //   recipient: { raw: "Thomas", email: null, name: "Thomas" },
 * //   sendMode: "sendNow",
 * //   tone: "locker"
 * // }
 * 
 * @example
 * parseEmailIntentV4("Hau raus an freiraumberatung@web.de: Ich komme morgen. Nicht senden.")
 * // => {
 * //   message: "Ich komme morgen",
 * //   recipient: { raw: "freiraumberatung@web.de", email: "freiraumberatung@web.de", name: null },
 * //   sendMode: "draft",
 * //   tone: "neutral"
 * // }
 */
export function parseEmailIntentV4(rawText: string): EmailIntentV4 {
  if (!rawText || typeof rawText !== 'string') {
    return {
      message: '',
      recipient: { raw: null, email: null, name: null },
      sendMode: 'sendNow',
      tone: 'neutral',
    };
  }
  
  // 1. Text normalisieren (umgangssprachliche Befehle vereinheitlichen)
  const normalized = normalizeText(rawText);
  
  // 2. Empfänger extrahieren
  const recipient = extractRecipient(normalized);
  
  // 3. Nachricht extrahieren (OHNE Befehlswörter)
  const message = extractMessage(normalized);
  
  // 4. Sende-Modus erkennen
  const sendMode = detectSendMode(normalized);
  
  // 5. Tonfall erkennen
  const tone = detectTone(normalized);
  
  // 6. Intent-Objekt zusammenbauen
  return {
    message,
    recipient,
    sendMode,
    tone,
  };
}

// ============================================================
// RÜCKWÄRTSKOMPATIBILITÄT (Wizard 4.0)
// ============================================================
// Die folgenden Typen und Funktionen bleiben für bestehende Logik erhalten

export type Wizard4Tone =
  | 'locker'
  | 'freundlich'
  | 'neutral'
  | 'streng'
  | 'professionell';

export type Wizard4MailType =
  | 'new'
  | 'reply'
  | 'followup'
  | 'reminder';

export type Wizard4SendMode =
  | 'sendNow'
  | 'previewOnly'
  | 'dontSend';

export interface Wizard4IntentResult {
  recipientName: string | null;
  recipientEmail: string | null;
  tone: Wizard4Tone;
  mailType: Wizard4MailType;
  message: string;
  sendMode: Wizard4SendMode;
  contextRef: string | null;
  rawInput: string;
}

/**
 * @deprecated Verwende stattdessen parseEmailIntentV4 für Intent 4.1
 * Diese Funktion bleibt für Rückwärtskompatibilität erhalten.
 */
export function parseWizard4Intent(input: string): Wizard4IntentResult {
  // Konvertiere Intent 4.1 zu Wizard4IntentResult für Kompatibilität
  const intentV4 = parseEmailIntentV4(input);
  
  // Konvertiere tone
  let tone: Wizard4Tone = 'neutral';
  if (intentV4.tone === 'locker') {
    tone = 'locker';
  } else if (intentV4.tone === 'formell') {
    tone = 'professionell';
  }
  
  // Konvertiere sendMode
  let sendMode: Wizard4SendMode = 'sendNow';
  if (intentV4.sendMode === 'draft') {
    sendMode = 'previewOnly';
  }
  
  return {
    recipientName: intentV4.recipient.name,
    recipientEmail: intentV4.recipient.email,
    tone,
    mailType: 'new', // Default, da Intent 4.1 keine Mail-Typ-Erkennung hat
    message: intentV4.message,
    sendMode,
    contextRef: null, // Intent 4.1 hat keine contextRef
    rawInput: input,
  };
}

// ============================================================
// BROWSER-EXPORT FÜR KONSOLEN-TESTS
// ============================================================
if (typeof window !== 'undefined') {
  (window as any).parseEmailIntentV4 = parseEmailIntentV4;
  (window as any).parseWizard4Intent = parseWizard4Intent;
}
