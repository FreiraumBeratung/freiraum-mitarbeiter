/**
 * Wizard 4.0 Intent Parser
 * 
 * One-Shot Intent Parser für natürlichsprachliche Eingaben.
 * Erkennt Empfänger, Tonfall, Mail-Typ, Sende-Modus und extrahiert die Nachricht.
 * 
 * KEINE UI, KEIN BACKEND, KEINE SIDE-EFFECTS.
 */

// ============================================================
// TYP-DEFINITIONEN
// ============================================================

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
  /** z. B. "Thomas", "Papa", "Chef" */
  recipientName: string | null;
  
  /** Falls im Text direkt eine Mailadresse vorkommt, z. B. "freiraumberatung@web.de" */
  recipientEmail: string | null;
  
  /** Tonfall der Mail */
  tone: Wizard4Tone;
  
  /** Art der Mail (neu, Antwort, Follow-Up, Erinnerung) */
  mailType: Wizard4MailType;
  
  /** Gereinigt: eigentliche Nachricht ohne Triggerwörter, ohne Grußformel, ohne Signatur */
  message: string;
  
  /** Sende-Modus (Standard: sendNow) */
  sendMode: Wizard4SendMode;
  
  /** Kontext-Referenz, z. B. "ihm", "ihr", "dem kunden" */
  contextRef: string | null;
  
  /** Originaleingabe als Referenz */
  rawInput: string;
}

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

/**
 * Normalisiert einen String: Kleinbuchstaben, mehrfache Leerzeichen entfernen
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Sucht nach einer E-Mail-Adresse im Text
 */
function extractEmail(text: string): string | null {
  const emailRegex = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0] : null;
}

/**
 * Sucht nach einem Empfänger-Namen im Text
 * Prüft auf Pattern wie "schreib Thomas", "sag Papa", etc.
 */
function extractRecipientName(text: string, normalized: string): string | null {
  // Standard-Rollen und bekannte Namen
  const knownRecipients = [
    'papa', 'vater', 'mama', 'mutter',
    'chef', 'chefin',
    'thomas', 'dario', 'mirjeta'
  ];
  
  // Pattern: "schreib/schreibe/sag/sage [NAME]"
  const triggerPattern = /(?:schreib|schreibe|sag|sage)\s+(\w+)/i;
  const match = text.match(triggerPattern);
  
  if (match && match[1]) {
    return match[1];
  }
  
  // Suche nach bekannten Empfängern im Text
  for (const recipient of knownRecipients) {
    if (normalized.includes(recipient)) {
      // Versuche, die Original-Schreibweise zu finden
      const regex = new RegExp(`\\b${recipient}\\b`, 'i');
      const originalMatch = text.match(regex);
      if (originalMatch) {
        return originalMatch[0];
      }
    }
  }
  
  return null;
}

/**
 * Sucht nach Kontext-Referenzen wie "ihm", "ihr", "dem kunden"
 */
function extractContextRef(normalized: string): string | null {
  const contextPatterns = [
    'ihm', 'ihr',
    'dem kunden', 'dem kunde',
    'dem klienten', 'dem client'
  ];
  
  for (const pattern of contextPatterns) {
    if (normalized.includes(pattern)) {
      return pattern;
    }
  }
  
  return null;
}

/**
 * Erkennt den Mail-Typ aus dem Text
 */
function detectMailType(normalized: string): Wizard4MailType {
  // Reply-Trigger
  if (
    normalized.includes('antwort') ||
    normalized.includes('zurückschreiben') ||
    normalized.includes('zurück schreiben') ||
    normalized.includes('rückmeldung') ||
    normalized.includes('zurück melden')
  ) {
    return 'reply';
  }
  
  // Reminder-Trigger
  if (
    normalized.includes('erinnern') ||
    normalized.includes('erinnerung') ||
    normalized.includes('nochmal schreiben') ||
    normalized.includes('noch mal schreiben') ||
    /in \d+ tagen/i.test(normalized)
  ) {
    return 'reminder';
  }
  
  // Follow-up-Trigger
  if (
    normalized.includes('follow up') ||
    normalized.includes('followup') ||
    normalized.includes('nachhaken') ||
    normalized.includes('nach haken')
  ) {
    return 'followup';
  }
  
  return 'new';
}

/**
 * Erkennt den Tonfall aus dem Text
 */
function detectTone(normalized: string): Wizard4Tone {
  // Reihenfolge ist wichtig - spezifischere zuerst
  if (
    normalized.includes('locker') ||
    normalized.includes('entspannt') ||
    normalized.includes('kurz halten')
  ) {
    return 'locker';
  }
  
  if (
    normalized.includes('freundlich') ||
    normalized.includes('nett') ||
    normalized.includes('höflich')
  ) {
    return 'freundlich';
  }
  
  if (
    normalized.includes('streng') ||
    normalized.includes('deutlich') ||
    normalized.includes('kühl')
  ) {
    return 'streng';
  }
  
  if (
    normalized.includes('professionell') ||
    normalized.includes('formell')
  ) {
    return 'professionell';
  }
  
  return 'neutral';
}

/**
 * Erkennt den Sende-Modus aus dem Text
 */
function detectSendMode(normalized: string): Wizard4SendMode {
  // Don't send
  if (
    normalized.includes('nicht senden') ||
    normalized.includes('nicht abschicken') ||
    normalized.includes('nicht verschicken')
  ) {
    return 'dontSend';
  }
  
  // Preview only
  if (
    normalized.includes('nur zeigen') ||
    normalized.includes('erstmal anzeigen') ||
    normalized.includes('erst mal anzeigen') ||
    normalized.includes('nur vorbereiten')
  ) {
    return 'previewOnly';
  }
  
  return 'sendNow';
}

/**
 * Extrahiert die eigentliche Nachricht aus dem Text
 * Entfernt Trigger-Wörter, Empfänger, Tonfall-Marker, etc.
 */
function extractMessage(
  input: string,
  normalized: string,
  recipientName: string | null,
  recipientEmail: string | null
): string {
  let message = input;
  
  // Entferne einleitende Trigger-Wörter
  const triggerPatterns = [
    /^schreib(e)?\s+/i,
    /^sag(e)?\s+/i,
    /^mach(e)?\s+(bitte\s+)?/i,
    /schreib(e)?\s+eine\s+(e-)?mail\s+/i,
  ];
  
  for (const pattern of triggerPatterns) {
    message = message.replace(pattern, '');
  }
  
  // Entferne E-Mail-Adresse
  if (recipientEmail) {
    message = message.replace(recipientEmail, '');
  }
  
  // Entferne Empfänger-Namen (falls direkt nach Trigger)
  if (recipientName) {
    const namePattern = new RegExp(`\\b${recipientName}\\b`, 'i');
    message = message.replace(namePattern, '');
  }
  
  // Entferne Tonfall-Marker
  const toneMarkers = [
    'locker', 'lockere', 'lockeren',
    'freundlich', 'freundliche', 'freundlichen',
    'neutral', 'neutrale', 'neutralen',
    'streng', 'strenge', 'strengen',
    'professionell', 'professionelle', 'professionellen',
    'entspannt', 'nett', 'höflich', 'deutlich', 'kühl', 'formell'
  ];
  
  for (const marker of toneMarkers) {
    const markerPattern = new RegExp(`\\b${marker}(e|en)?\\b`, 'gi');
    message = message.replace(markerPattern, '');
  }
  
  // Entferne Mail-Type-Marker
  const typeMarkers = [
    'antwort', 'zurückschreiben', 'zurück schreiben',
    'rückmeldung', 'zurück melden',
    'erinnern', 'erinnerung', 'nochmal schreiben', 'noch mal schreiben',
    'follow up', 'followup', 'nachhaken', 'nach haken'
  ];
  
  for (const marker of typeMarkers) {
    const markerPattern = new RegExp(`\\b${marker}\\b`, 'gi');
    message = message.replace(markerPattern, '');
  }
  
  // Entferne Send-Mode-Marker
  const sendMarkers = [
    'nicht senden', 'nicht abschicken', 'nicht verschicken',
    'nur zeigen', 'erstmal anzeigen', 'erst mal anzeigen', 'nur vorbereiten'
  ];
  
  for (const marker of sendMarkers) {
    const markerPattern = new RegExp(marker, 'gi');
    message = message.replace(markerPattern, '');
  }
  
  // Entferne Pattern wie "eine Mail" oder "wegen"
  message = message.replace(/\beine\s+(e-)?mail\b/gi, '');
  message = message.replace(/\bwegen\b/gi, '');
  
  // Aufräumen: mehrfache Leerzeichen, Kommas am Anfang, etc.
  message = message.replace(/\s+/g, ' ').trim();
  message = message.replace(/^[,:\s]+/, '').trim();
  
  // Fallback: Wenn nichts übrig ist, nimm den Original-Input
  if (!message) {
    message = input.trim();
  }
  
  return message;
}

// ============================================================
// HAUPTFUNKTION
// ============================================================

/**
 * Parst natürlichsprachliche Eingabe und extrahiert Intent-Informationen
 * 
 * @param input - Die Benutzereingabe als String
 * @returns Wizard4IntentResult mit allen extrahierten Informationen
 * 
 * @example
 * parseWizard4Intent("Schreib Thomas eine lockere Mail, dass ich morgen später komme.")
 * // => { recipientName: "Thomas", tone: "locker", mailType: "new", ... }
 */
export function parseWizard4Intent(input: string): Wizard4IntentResult {
  // Normalisierte Version für Pattern-Matching
  const normalized = normalize(input);
  
  // A) E-Mail-Adresse erkennen
  const recipientEmail = extractEmail(input);
  
  // B) Empfänger-Namen erkennen
  const recipientName = extractRecipientName(input, normalized);
  
  // C) Kontext-Referenz erkennen
  const contextRef = extractContextRef(normalized);
  
  // D) Mail-Typ erkennen
  const mailType = detectMailType(normalized);
  
  // E) Tonfall erkennen
  const tone = detectTone(normalized);
  
  // F) Sende-Modus erkennen
  const sendMode = detectSendMode(normalized);
  
  // G) Nachricht extrahieren
  const message = extractMessage(input, normalized, recipientName, recipientEmail);
  
  return {
    recipientName,
    recipientEmail,
    tone,
    mailType,
    message,
    sendMode,
    contextRef,
    rawInput: input
  };
}

// ============================================================
// DEBUG-BEISPIELE
// ============================================================
// Zum Testen in der Browser-Konsole:
//
// console.log(parseWizard4Intent("Schreib Thomas eine lockere Mail, dass ich morgen später komme."));
// Erwartung: recipientName="Thomas", tone="locker", mailType="new", sendMode="sendNow"
//
// console.log(parseWizard4Intent("Schreibe freiraumberatung@web.de eine Mail wegen dem Termin morgen. Sag ihm, dass er mich morgen anrufen kann. Nicht senden."));
// Erwartung: recipientEmail="freiraumberatung@web.de", contextRef="ihm", sendMode="dontSend"
//
// console.log(parseWizard4Intent("Antwort auf die letzte E-Mail von Müller: Machen wir so. Kurz und freundlich."));
// Erwartung: mailType="reply", tone="freundlich", message="die letzte von Müller: Machen wir so."
//
// console.log(parseWizard4Intent("Erinner mich bitte dran, ihm in zwei Tagen nochmal zu schreiben."));
// Erwartung: mailType="reminder", contextRef="ihm"
//
// console.log(parseWizard4Intent("Schreibe Papa eine strenge Mail, dass er sich endlich melden soll."));
// Erwartung: recipientName="Papa", tone="streng", message="dass er sich endlich melden soll."
//
// console.log(parseWizard4Intent("Follow-up zu gestern: Haben Sie meine Unterlagen erhalten? Professionell bitte."));
// Erwartung: mailType="followup", tone="professionell"
//
// console.log(parseWizard4Intent("Schreib dem Kunden eine neutrale Mail nur vorbereiten."));
// Erwartung: contextRef="dem kunden", tone="neutral", sendMode="previewOnly"

// ============================================================
// BROWSER-EXPORT FÜR KONSOLEN-TESTS
// ============================================================
;(window as any).parseWizard4Intent = parseWizard4Intent;

