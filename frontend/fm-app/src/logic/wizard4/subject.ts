/**
 * Wizard 4.0 Subject Generator
 *
 * Generiert automatisch passende E-Mail-Betreffs basierend auf dem
 * geparsten Intent (Wizard4IntentResult).
 *
 * KEINE UI, KEIN BACKEND, KEINE SIDE-EFFECTS.
 */

import type { Wizard4IntentResult } from './intent';

const DEFAULT_SUBJECT = "Kurze Info";

/**
 * Generiert einen passenden E-Mail-Betreff basierend auf dem Intent.
 *
 * Kein Keyword-Guessing aus dem Fließtext (z. B. "morgen" → "Termin morgen").
 * Ohne expliziten Betreff bleibt es bei "Kurze Info".
 */
export function generateWizard4Subject(intent: Wizard4IntentResult): string {
  if (intent.mailType === 'reply') {
    return "Rückmeldung";
  }

  if (intent.mailType === 'followup') {
    return "Kurze Nachfrage";
  }

  if (intent.mailType === 'reminder') {
    return "Erinnerung";
  }

  return DEFAULT_SUBJECT;
}
