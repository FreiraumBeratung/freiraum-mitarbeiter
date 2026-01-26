/**
 * Entfernt Füllwörter/Hesitation-Starts am Satzanfang
 * 
 * Beispiele:
 * - "Ähm, bin im Termin." -> "Bin im Termin."
 * - "Ahm, bin im Termin." -> "Bin im Termin."
 * - "Also, ich komme später." -> "Ich komme später."
 */

/**
 * Entfernt führende Füllwörter am Satzanfang und nach Satztrennern
 * 
 * @param text - Text, aus dem Füllwörter entfernt werden sollen
 * @returns Bereinigter Text (mit korrekter Großschreibung)
 */
export function stripLeadingFillerWords(text: string): string {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  let cleaned = text.trim();
  if (!cleaned) {
    return text;
  }

  // VORSTUFE: Entferne "bitte"-Doppelungen am Satzanfang und nach Satztrennern
  // "Bitte bitte, ich komme gleich." -> "Bitte, ich komme gleich."
  // "bitte, bitte ich komme gleich" -> "Bitte, ich komme gleich."
  
  // Am Satzanfang: ^\s*(bitte)(?:\s*,?\s*\1)+\s*[,.:;!?-]?\s*
  const leadingBitteDuplicate = /^\s*(bitte)(?:\s*,?\s*\1)+\s*[,.:;!?-]?\s*/i;
  cleaned = cleaned.replace(leadingBitteDuplicate, 'Bitte, ');
  
  // Nach Satztrennern: ([.!?]\s+)(bitte)(?:\s*,?\s*\2)+\s*[,.:;!?-]?\s*
  const afterPunctBitteDuplicate = /([.!?]\s+)(bitte)(?:\s*,?\s*\2)+\s*[,.:;!?-]?\s*/gi;
  cleaned = cleaned.replace(afterPunctBitteDuplicate, '$1Bitte, ');

  // Füllwörter-Liste (lowercase für Matching)
  const fillerWords = ['ähm', 'äh', 'ahm', 'hm', 'hmm', 'also', 'naja', 'okay', 'ok', 'tja'];
  
  // Pattern für Satzanfang: ^\s*(?:filler)\s*[,.:;!?-]?\s*
  const leadingPattern = new RegExp(
    `^\\s*(?:${fillerWords.join('|')})\\s*[,.:;!?-]?\\s*`,
    'i'
  );
  
  // Pattern nach Satztrennern: ([.!?]\s+)(?:filler)\s*[,.:;!?-]?\s*
  const afterPunctuationPattern = new RegExp(
    `([.!?]\\s+)(?:${fillerWords.join('|')})\\s*[,.:;!?-]?\\s*`,
    'gi'
  );

  // Wiederhole max. 3x, damit "Ähm ähm" auch weg ist
  let iterations = 0;
  let previousCleaned = cleaned;
  
  while (iterations < 3) {
    // Entferne am Satzanfang
    cleaned = cleaned.replace(leadingPattern, '');
    
    // Entferne nach Satztrennern (behalte den Satztrenner)
    cleaned = cleaned.replace(afterPunctuationPattern, '$1');
    
    // Wenn sich nichts geändert hat, abbrechen
    if (cleaned === previousCleaned) {
      break;
    }
    
    previousCleaned = cleaned;
    iterations++;
  }

  // Bereinige doppelte Leerzeichen
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Bereinige " ,", " ." etc.
  cleaned = cleaned.replace(/\s+([,.:;!?-])/g, '$1');
  
  // Bereinige doppelte Kommas nach "Bitte,"
  cleaned = cleaned.replace(/Bitte,\s*,+/g, 'Bitte, ');
  
  // Trim
  cleaned = cleaned.trim();
  
  // Wenn Ergebnis leer, ursprünglichen Text zurückgeben
  if (!cleaned || cleaned.length === 0) {
    return text;
  }

  // Erste Buchstabe großschreiben (falls nicht bereits groß)
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}
