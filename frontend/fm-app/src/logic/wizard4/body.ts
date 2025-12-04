/**
 * Wizard 4.0 Body Generator (Version 4.2)
 * 
 * Generiert automatisch passende E-Mail-Texte (Body) basierend auf dem
 * geparsten Intent (Wizard4IntentResult).
 * 
 * OHNE Anrede, OHNE Grußformel, OHNE Signatur.
 * Einfaches, freundliches Deutsch mit verbesserter Grammatik.
 * Satzanfang großgeschrieben, lockerer Ton mit "–", professionell glatt.
 * 
 * KEINE UI, KEIN BACKEND, KEINE SIDE-EFFECTS.
 */

import type { Wizard4IntentResult } from './intent';

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

/**
 * Normalisiert Whitespace (mehrfache Leerzeichen entfernen)
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Wandelt typische "dass ich ..." / "dass wir ..." Muster in glattere Sätze um
 * und versucht einfache Fälle wie "ich ... komme" → "ich komme ..." zu verbessern.
 */
function normalizeBaseSentence(raw: string): string {
  let t = raw.trim();

  // führendes Komma entfernen: ", dass ich ..." -> "dass ich ..."
  if (t.startsWith(',')) {
    t = t.slice(1).trim();
  }

  // Satzzeichen am Ende für die Struktur-Analyse temporär entfernen
  t = t.replace(/[.!?]+$/u, '').trim();

  let lower = t.toLowerCase();

  // "dass ich ..." -> "ich ..."
  const prefixDassIch = 'dass ich ';
  const prefixDassWir = 'dass wir ';

  if (lower.startsWith(prefixDassIch)) {
    t = 'ich ' + t.slice(prefixDassIch.length);
    lower = t.toLowerCase();
  } else if (lower.startsWith(prefixDassWir)) {
    t = 'wir ' + t.slice(prefixDassWir.length);
    lower = t.toLowerCase();
  }

  // Einfache Re-Order-Regel: "ich ... komme" -> "ich komme ..."
  // Beispiel: "ich morgen später komme" -> "ich komme morgen später"
  const ichMatch = /^ich\s+(.+)\s+komme$/i.exec(t);
  if (ichMatch && ichMatch[1].trim().length > 0) {
    const inner = ichMatch[1].trim();
    t = `ich komme ${inner}`;
    lower = t.toLowerCase();
  }

  // Gleiches für "wir ... kommen"
  const wirMatch = /^wir\s+(.+)\s+kommen$/i.exec(t);
  if (wirMatch && wirMatch[1].trim().length > 0) {
    const inner = wirMatch[1].trim();
    t = `wir kommen ${inner}`;
    lower = t.toLowerCase();
  }

  t = normalizeWhitespace(t);

  return t;
}

/**
 * Sorgt dafür, dass der Satz sauber beendet wird:
 * - keine doppelten ".," am Ende
 * - Punkt anhängen, wenn keiner da ist
 */
function ensureSentenceFinished(text: string): string {
  let t = text.trim();

  // Doppelzeichen am Ende bereinigen, z. B. "komme.," -> "komme"
  t = t.replace(/[.,!?;:]+$/u, () => {
    // Wir entfernen am Ende alle Satzzeichen, hängen später einen Punkt ggf. wieder an.
    return '';
  }).trim();

  // Wenn gar kein abschließendes Satzzeichen vorhanden ist, einen Punkt setzen
  if (!/[.!?]$/u.test(t)) {
    t = t + '.';
  }

  return t;
}

/**
 * Sorgt dafür, dass der erste Buchstabe groß geschrieben wird
 */
function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ============================================================
// HAUPTFUNKTION
// ============================================================

/**
 * Generiert einen passenden E-Mail-Body basierend auf dem Intent
 * 
 * Version 4.2:
 * - Verbesserte Grammatik und Satzstellung
 * - "dass ich ..." → "ich ..."
 * - "ich ... komme" → "ich komme ..."
 * - Saubere Satzzeichen ohne Doppelungen
 * - Satzanfang großgeschrieben
 * - Lockerer Ton mit "–" statt ","
 * - Professionelle Sprache glatter
 * 
 * Berücksichtigt:
 * - Nachrichteninhalt (message)
 * - Tonfall (tone)
 * - Mail-Typ (mailType)
 * 
 * @param intent - Das geparste Wizard4IntentResult
 * @returns Ein lesbarer E-Mail-Body-Text
 * 
 * @example
 * generateWizard4Body({
 *   message: 'dass ich morgen später komme.',
 *   tone: 'locker',
 *   mailType: 'new',
 *   // ...
 * })
 * // => "Ich komme morgen später – nur als kurze Info."
 */
export function generateWizard4Body(intent: Wizard4IntentResult): string {
  const tone = intent.tone;
  let text = intent.message ? intent.message.trim() : '';

  if (!text) {
    text = intent.rawInput.trim();
  }

  // Basis-Satzstruktur normalisieren (z. B. "dass ich ..." -> "ich ...")
  text = normalizeBaseSentence(text);
  
  // Whitespace und Kapitalisierung normalisieren
  text = normalizeWhitespace(text);
  text = capitalizeFirst(text);

  // MAILTYPE-spezifische Anpassungen (leicht gehalten)
  if (intent.mailType === 'reply') {
    const lower = text.toLowerCase();
    if (!lower.includes('bezüglich') && !lower.includes('wegen ihrer nachricht')) {
      text = `bezüglich Ihrer letzten Nachricht: ${text}`;
    }
  } else if (intent.mailType === 'reminder') {
    const lower = text.toLowerCase();
    if (!lower.includes('erinnerung')) {
      text = `${text} das ist nur eine kurze erinnerung.`;
    }
  }

  // Tonfall-bezogene Nuancen
  const lowerAfter = text.toLowerCase();

  if (tone === 'locker') {
    // Satzende entfernen und später definieren
    let cleaned = text.replace(/[.!?]+$/u, '').trim();
    
    // Wenn der Satz nicht bereits Info enthält
    if (!cleaned.toLowerCase().includes('info')) {
      text = `${cleaned} – nur als kurze Info.`;
    } else {
      text = `${cleaned}.`;
    }
  } else if (tone === 'freundlich') {
    text = ensureSentenceFinished(text);
    if (!text.toLowerCase().includes('danke')) {
      text = `${text} Vielen Dank!`;
    }
  } else {
    // Professionell/neutral → glatte Satzform
    text = ensureSentenceFinished(text);
  }

  // Whitespace final säubern
  text = normalizeWhitespace(text);

  // Falls alles schief geht, Fallback
  if (!text) {
    text = intent.message.trim() || intent.rawInput.trim() || '';
    text = normalizeWhitespace(text);
    if (text && !/[.!?]$/u.test(text)) {
      text += '.';
    }
  }

  // Final capitalize
  text = capitalizeFirst(text);

  return text;
}

// ============================================================
// DEBUG-BEISPIELE
// ============================================================
// Zum Testen in der Browser-Konsole:
//
// console.log(generateWizard4Body({
//   recipientName: 'Thomas',
//   recipientEmail: null,
//   tone: 'locker',
//   mailType: 'new',
//   message: 'dass ich morgen später komme.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Schreib Thomas eine lockere Mail, dass ich morgen später komme.'
// }));
// Erwartung: "ich komme morgen später, nur als kurze Info."
//
// console.log(generateWizard4Body({
//   recipientName: null,
//   recipientEmail: 'freiraumberatung@web.de',
//   tone: 'neutral',
//   mailType: 'reply',
//   message: 'machen wir so.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Antwort auf die letzte E-Mail von Müller: Machen wir so.'
// }));
// Erwartung: "bezüglich Ihrer letzten Nachricht: machen wir so."
//
// console.log(generateWizard4Body({
//   recipientName: 'Chef',
//   recipientEmail: null,
//   tone: 'freundlich',
//   mailType: 'new',
//   message: 'dass ich heute anrufen werde.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Schreib Chef eine freundliche Mail, dass ich heute anrufen werde.'
// }));
// Erwartung: "ich werde heute anrufen. Vielen Dank!"
//
// console.log(generateWizard4Body({
//   recipientName: 'Kunde',
//   recipientEmail: null,
//   tone: 'professionell',
//   mailType: 'followup',
//   message: 'wegen dem Angebot von letzter Woche.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Follow-up zu dem Angebot von letzter Woche.'
// }));
// Erwartung: "wegen dem Angebot von letzter Woche."
//
// console.log(generateWizard4Body({
//   recipientName: 'Papa',
//   recipientEmail: null,
//   tone: 'locker',
//   mailType: 'reminder',
//   message: 'dass wir uns noch wegen dem Termin abstimmen müssen.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Erinnere Papa daran, dass wir uns noch wegen dem Termin abstimmen müssen.'
// }));
// Erwartung: "wir müssen uns noch wegen dem Termin abstimmen das ist nur eine kurze erinnerung."
//
// console.log(generateWizard4Body({
//   recipientName: 'Mirjeta',
//   recipientEmail: null,
//   tone: 'streng',
//   mailType: 'new',
//   message: 'dass die Unterlagen bis morgen fertig sein müssen.',
//   sendMode: 'sendNow',
//   contextRef: null,
//   rawInput: 'Schreib Mirjeta eine strenge Mail, dass die Unterlagen bis morgen fertig sein müssen.'
// }));
// Erwartung: "die Unterlagen bis morgen fertig sein müssen."
