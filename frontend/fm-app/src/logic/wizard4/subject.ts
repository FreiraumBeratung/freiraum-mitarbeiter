/**
 * Wizard 4.0 Subject Generator
 * 
 * Generiert automatisch passende E-Mail-Betreffs basierend auf dem
 * geparsten Intent (Wizard4IntentResult).
 * 
 * KEINE UI, KEIN BACKEND, KEINE SIDE-EFFECTS.
 */

import type { Wizard4IntentResult } from './intent';

// ============================================================
// HAUPTFUNKTION
// ============================================================

/**
 * Generiert einen passenden E-Mail-Betreff basierend auf dem Intent
 * 
 * Entscheidungslogik:
 * 1. MailType-spezifisch (reply, followup, reminder)
 * 2. Keyword-basiert (nur bei mailType='new')
 * 3. Fallback: "Kurze Info"
 * 
 * @param intent - Das geparste Wizard4IntentResult
 * @returns Ein passender Betreff-String
 * 
 * @example
 * generateWizard4Subject({
 *   mailType: 'new',
 *   message: 'dass wir morgen um 10 uhr starten können.',
 *   // ...
 * })
 * // => "Termin morgen"
 */
export function generateWizard4Subject(intent: Wizard4IntentResult): string {
  const normalized = intent.message.toLowerCase();
  
  // ============================================================
  // A) MAILTYPE-SPEZIFISCH
  // ============================================================
  
  if (intent.mailType === 'reply') {
    return "Rückmeldung";
  }
  
  if (intent.mailType === 'followup') {
    return "Kurze Nachfrage";
  }
  
  if (intent.mailType === 'reminder') {
    return "Erinnerung";
  }
  
  // ============================================================
  // B) KEYWORDS (nur bei mailType === 'new')
  // ============================================================
  
  if (intent.mailType === 'new') {
    // Termin-Keywords
    if (
      normalized.includes('termin') ||
      normalized.includes('uhr') ||
      normalized.includes('morgen') ||
      normalized.includes('heute')
    ) {
      return "Termin morgen";
    }
    
    // Anruf-Keywords
    if (
      normalized.includes('anruf') ||
      normalized.includes('anrufen') ||
      normalized.includes('rückruf') ||
      normalized.includes('zurückrufen')
    ) {
      return "Rückruf";
    }
    
    // Angebot-Keywords
    if (normalized.includes('angebot')) {
      return "Anfrage zum Angebot";
    }
    
    // Projekt-Keywords
    if (
      normalized.includes('projekt') ||
      normalized.includes('baustelle') ||
      normalized.includes('auftrag')
    ) {
      return "Update zum Projekt";
    }
    
    // Rechnung-Keywords
    if (
      normalized.includes('rechnung') ||
      normalized.includes('zahlung') ||
      normalized.includes('überweisung')
    ) {
      return "Rückfrage zur Rechnung";
    }
  }
  
  // ============================================================
  // C) FALLBACK
  // ============================================================
  
  return "Kurze Info";
}

// ============================================================
// DEBUG-BEISPIELE
// ============================================================
// Zum Testen in der Browser-Konsole:
//
// console.log(generateWizard4Subject({
//   recipientName: 'Thomas',
//   recipientEmail: null,
//   tone: 'locker',
//   mailType: 'new',
//   message: 'dass wir morgen um 10 uhr starten können.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Schreib Thomas eine lockere Mail, dass wir morgen um 10 Uhr starten können.'
// }));
// Erwartung: "Termin morgen"
//
// console.log(generateWizard4Subject({
//   recipientName: null,
//   recipientEmail: 'freiraumberatung@web.de',
//   tone: 'neutral',
//   mailType: 'reply',
//   message: 'machen wir so.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Antwort auf die letzte E-Mail von Müller: Machen wir so.'
// }));
// Erwartung: "Rückmeldung"
//
// console.log(generateWizard4Subject({
//   recipientName: 'Chef',
//   recipientEmail: null,
//   tone: 'freundlich',
//   mailType: 'new',
//   message: 'dass ich heute anrufen soll.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Schreib Chef eine freundliche Mail, dass ich heute anrufen soll.'
// }));
// Erwartung: "Rückruf"
//
// console.log(generateWizard4Subject({
//   recipientName: 'Kunde',
//   recipientEmail: null,
//   tone: 'professionell',
//   mailType: 'followup',
//   message: 'wegen dem Angebot von letzter Woche.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Follow-up zu dem Angebot von letzter Woche.'
// }));
// Erwartung: "Kurze Nachfrage"
//
// console.log(generateWizard4Subject({
//   recipientName: 'Papa',
//   recipientEmail: null,
//   tone: 'locker',
//   mailType: 'new',
//   message: 'dass das Projekt gut läuft.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Schreib Papa eine lockere Mail, dass das Projekt gut läuft.'
// }));
// Erwartung: "Update zum Projekt"
//
// console.log(generateWizard4Subject({
//   recipientName: null,
//   recipientEmail: 'buchhaltung@firma.de',
//   tone: 'neutral',
//   mailType: 'new',
//   message: 'wegen der Rechnung von letztem Monat.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Schreibe buchhaltung@firma.de eine Mail wegen der Rechnung von letztem Monat.'
// }));
// Erwartung: "Rückfrage zur Rechnung"
//
// console.log(generateWizard4Subject({
//   recipientName: 'Mirjeta',
//   recipientEmail: null,
//   tone: 'freundlich',
//   mailType: 'new',
//   message: 'dass alles klar geht.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Schreib Mirjeta eine freundliche Mail, dass alles klar geht.'
// }));
// Erwartung: "Kurze Info" (Fallback)

