/**
 * Wizard 4.0 Email Builder
 * 
 * Zentraler Builder, der alle Wizard4-Module zusammenführt:
 * - Intent-Parsing (intent.ts)
 * - Subject-Generierung (subject.ts)
 * - Body-Generierung (body.ts)
 * 
 * One-Shot: Aus einer natürlichsprachlichen Eingabe wird ein
 * vollständiger E-Mail-Entwurf erstellt.
 * 
 * KEINE UI, KEIN BACKEND, KEINE SIDE-EFFECTS.
 */

import type { Wizard4IntentResult, Wizard4SendMode } from './intent';
import { parseWizard4Intent } from './intent';
import { generateWizard4Subject } from './subject';
import { generateWizard4Body } from './body';

// ============================================================
// TYP-DEFINITIONEN
// ============================================================

/**
 * Fertiger E-Mail-Entwurf, generiert aus Wizard4-Logik
 */
export interface Wizard4EmailDraft {
  /** Name des Empfängers (z. B. "Thomas", "Papa", "Chef") oder null */
  toName: string | null;
  
  /** E-Mail-Adresse des Empfängers oder null */
  toEmail: string | null;
  
  /** Generierter Betreff */
  subject: string;
  
  /** Generierter Body (ohne Anrede/Grußformel) */
  body: string;
  
  /** Sende-Modus (sendNow, previewOnly, dontSend) */
  sendMode: Wizard4SendMode;
  
  /** Der vollständige geparste Intent (für Debugging/Erweiterungen) */
  intent: Wizard4IntentResult;
}

// ============================================================
// HAUPTFUNKTION
// ============================================================

/**
 * Baut einen vollständigen E-Mail-Entwurf aus natürlichsprachlicher Eingabe
 * 
 * Workflow:
 * 1. Intent parsen (parseWizard4Intent)
 * 2. Betreff generieren (generateWizard4Subject)
 * 3. Body generieren (generateWizard4Body)
 * 4. Alles zusammenfügen
 * 
 * @param rawInput - Die natürlichsprachliche Benutzereingabe
 * @returns Ein vollständiger E-Mail-Entwurf (Wizard4EmailDraft)
 * 
 * @example
 * buildWizard4EmailFromInput(
 *   "Schreib Thomas eine lockere Mail, dass ich morgen später komme."
 * )
 * // => {
 * //   toName: "Thomas",
 * //   toEmail: null,
 * //   subject: "Termin morgen",
 * //   body: "ich morgen später komme, nur als kurze Info.",
 * //   sendMode: "sendNow",
 * //   intent: { ... }
 * // }
 */
export function buildWizard4EmailFromInput(rawInput: string): Wizard4EmailDraft {
  // 1) Intent parsen
  const intent = parseWizard4Intent(rawInput);
  
  // 2) Betreff generieren
  const subject = generateWizard4Subject(intent);
  
  // 3) Body generieren
  const body = generateWizard4Body(intent);
  
  // 4) Empfängerfelder bestimmen
  const toName = intent.recipientName;
  const toEmail = intent.recipientEmail;
  
  // 5) Sende-Modus bestimmen
  const sendMode = intent.sendMode;
  
  // 6) Fertigen Entwurf zurückgeben
  return {
    toName,
    toEmail,
    subject,
    body,
    sendMode,
    intent,
  };
}

// ============================================================
// DEBUG-BEISPIELE
// ============================================================
// Zum Testen in der Browser-Konsole:
//
// console.log(buildWizard4EmailFromInput(
//   "Schreib Thomas eine lockere Mail, dass ich morgen später komme."
// ));
// Erwartung:
// {
//   toName: "Thomas",
//   toEmail: null,
//   subject: "Termin morgen",
//   body: "ich morgen später komme, nur als kurze Info.",
//   sendMode: "sendNow",
//   intent: { ... }
// }
//
// console.log(buildWizard4EmailFromInput(
//   "Schreibe freiraumberatung@web.de eine Mail wegen dem Termin morgen. Sag ihm, dass er mich morgen anrufen kann. Nicht senden."
// ));
// Erwartung:
// {
//   toName: null,
//   toEmail: "freiraumberatung@web.de",
//   subject: "Termin morgen",
//   body: "dem Termin morgen. Sag ihm, dass er mich morgen anrufen kann.",
//   sendMode: "dontSend",
//   intent: { ... }
// }
//
// console.log(buildWizard4EmailFromInput(
//   "Antwort auf die letzte E-Mail von Müller: Machen wir so. Kurz und freundlich."
// ));
// Erwartung:
// {
//   toName: "Müller",
//   toEmail: null,
//   subject: "Rückmeldung",
//   body: "bezüglich Ihrer letzten Nachricht: ...",
//   sendMode: "sendNow",
//   intent: { ... }
// }
//
// console.log(buildWizard4EmailFromInput(
//   "Erinner Papa daran, dass wir uns noch wegen dem Termin abstimmen müssen."
// ));
// Erwartung:
// {
//   toName: "Papa",
//   toEmail: null,
//   subject: "Erinnerung",
//   body: "wir uns noch wegen dem Termin abstimmen müssen. Das ist nur eine kurze Erinnerung.",
//   sendMode: "sendNow",
//   intent: { ... }
// }
//
// console.log(buildWizard4EmailFromInput(
//   "Schreib dem Kunden eine professionelle Mail wegen dem Projekt. Nur vorbereiten."
// ));
// Erwartung:
// {
//   toName: null,
//   toEmail: null,
//   subject: "Update zum Projekt",
//   body: "dem Projekt.",
//   sendMode: "previewOnly",
//   intent: { contextRef: "dem kunden", ... }
// }

