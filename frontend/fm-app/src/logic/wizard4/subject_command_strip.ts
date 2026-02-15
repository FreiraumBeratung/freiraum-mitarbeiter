/**
 * Extrahiert expliziten "Betreff X" aus Text und entfernt die Phrase.
 * Unterstützt Umlaute und normalisierte Strings.
 * Unterstützt Form mit und ohne Komma: "betreff X, body" und "betreff X body".
 * Bei Form ohne Komma: Multiword-Betreff (max. 2 Wörter), Body-Start-Wörter als Grenze.
 */

const BODY_START_WORDS = new Set([
  'ruf', 'rufe', 'schreib', 'schreibe', 'sende', 'schick', 'schicke',
  'kannst', 'kannste', 'bitte', 'melde', 'gib', 'sag', 'erinnere',
  'wir', 'ich', 'hi', 'hallo', 'hey', 'moin', 'servus', 'guten', 'hier'  // Satzstart ("wir müssen", "ich komme")
]);

function isBodyStartWord(w: string): boolean {
  return w && BODY_START_WORDS.has(w.toLowerCase().trim());
}

/**
 * Erkennt "Betreff <subject>" (case-insensitiv), optional mit Kommas/Punkt davor/danach.
 * Bei Form ohne Komma: 1–2 Wörter als Subject; wenn 2. Wort Body-Start-Wort, nur 1 Wort.
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

  let subjectCandidate = match[1].trim();
  if (!subjectCandidate || subjectCandidate.length === 0) {
    return { text: input };
  }

  const phraseStart = match.index!;
  const phraseEnd = match.index! + match[0].length;
  let before = s.slice(0, phraseStart).trim();
  let after = s.slice(phraseEnd).trim();

  before = before.replace(/\s*[,.;:!?]\s*$/, '').trim();
  after = after.replace(/^\s*[,.;:!?]\s*/, '').trim();

  let subject: string;
  let restText: string;

  const words = subjectCandidate.split(/\s+/).filter(Boolean);

  if (words.length > 1) {
    // Form ohne Komma: subject = 1 oder 2 Wörter; bei Body-Startwort früh stoppen
    let subjectWordCount = 2;
    for (let i = 1; i < words.length; i += 1) {
      if (isBodyStartWord(words[i])) {
        subjectWordCount = Math.min(subjectWordCount, i);
        break;
      }
    }
    subjectWordCount = Math.min(subjectWordCount, words.length);
    subject = words.slice(0, subjectWordCount).join(' ');
    restText = words.slice(subjectWordCount).join(' ') + (after ? ' ' + after : '');
    const trailingPunct = s.match(/[.;!?]$/)?.[0] ?? '';
    if (trailingPunct && !restText.endsWith(trailingPunct)) {
      restText = restText.trimEnd() + trailingPunct;
    }
  } else {
    subject = subjectCandidate;
    restText = [before, after].filter(Boolean).join(', ').trim();
  }

  // Fallback: restText darf nicht leer sein, wenn Input sinnvollen Text enthält
  if (!restText || !restText.trim()) {
    const stripped = s.replace(/\b(?:betreff|titel|subject)\b\s*/gi, '').trim();
    const esc = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    restText = stripped.replace(new RegExp(`^${esc}\\s*`, 'i'), '').trim();
    if (!restText || !restText.trim()) {
      restText = input;
    }
  }

  const text = restText.replace(/\s+/g, ' ').trim();

  const subjectCap = subject.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
  return { text, explicitSubject: subjectCap };
}
