/**
 * Extrahiert expliziten "Betreff X" aus Text und entfernt die Phrase.
 * Unterstützt Umlaute und normalisierte Strings.
 */

/**
 * Erkennt "Betreff <subject>" (case-insensitiv), optional mit Kommas/Punkt davor/danach.
 * Extrahiert subject bis zum nächsten Trennzeichen (Komma, Punkt, Semikolon, !, ?) oder String-Ende.
 * Entfernt die gesamte Phrase aus dem Text.
 *
 * @param input - Roher oder normalisierter Text
 * @returns { text: restlicher Text ohne Phrase; explicitSubject?: extrahierter Betreff }
 */
export function stripSubjectCommand(input: string): { text: string; explicitSubject?: string } {
  if (!input || typeof input !== 'string') {
    return { text: input || '' };
  }
  const s = input.trim();
  if (!s) return { text: input };

  const re = /\b(?:betreff|titel|subject)(?!\s*,\s*\S)\s*[,:.]?\s*([^,.;!?]+?)(?=\s*[,.;!?]|$)/i;
  const match = s.match(re);
  if (!match || !match[1]) {
    return { text: input };
  }

  const subject = match[1].trim();
  if (!subject || subject.length === 0) {
    return { text: input };
  }

  const phraseStart = match.index!;
  const phraseEnd = match.index! + match[0].length;
  let before = s.slice(0, phraseStart).trim();
  let after = s.slice(phraseEnd).trim();

  before = before.replace(/\s*[,.;:!?]\s*$/, '').trim();
  after = after.replace(/^\s*[,.;:!?]\s*/, '').trim();

  const rest = [before, after].filter(Boolean).join(', ').trim();
  const text = rest || '';

  const subjectCap = subject.charAt(0).toUpperCase() + subject.slice(1).trim();
  return { text, explicitSubject: subjectCap };
}
