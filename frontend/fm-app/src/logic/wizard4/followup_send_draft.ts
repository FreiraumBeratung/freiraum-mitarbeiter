/**
 * Prüft ob der MailCompose UI-Hook zum Senden verfügbar ist (Draft offen).
 */
export function isUiDraftAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as any).__fm_send_mail_now === "function";
}

/**
 * Erkennt "Follow-up Send Current Draft" Trigger.
 * Nur wenn KEIN Empfängername erwähnt wird und kein neuer Inhalt folgt.
 */

const FOLLOWUP_SEND_TRIGGERS = [
  'schick die nachricht aus',
  'schick die nachricht raus',
  'schick sie aus',
  'schick sie raus',
  'abschicken',
  'jetzt abschicken',
  'raus damit',
  'sende sie',
];

/** Normalisiert für Abgleich: lowercase, Whitespace kollabieren, Satzzeichen am Ende entfernen */
function normalizeForMatch(t: string): string {
  return (t || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,:;!?]+$/g, '')
    .trim();
}

/**
 * Prüft ob der Text ein Follow-up "sende aktuellen Draft" Befehl ist.
 * @param rawText - Roher Transkript- oder Intent-Text
 * @returns true wenn exakt ein Trigger getroffen wird (ohne Empfänger, ohne zusätzlichen Inhalt)
 */
export function isFollowUpSendCurrentDraft(rawText: string): boolean {
  const n = normalizeForMatch(rawText || '');
  if (!n) return false;
  return FOLLOWUP_SEND_TRIGGERS.some((t) => n === t);
}
