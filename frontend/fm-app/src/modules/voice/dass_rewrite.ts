/**
 * Rewrite-Logik für führende "dass"-Klauseln in E-Mail-Body-Texten.
 * 
 * Konvertiert Nebensätze wie "Dass wir 15 Minuten später starten." 
 * in Hauptsätze wie "Wir starten 15 Minuten später."
 * 
 * Wird nur für autoSend-Intents angewendet.
 */

/**
 * Trennt führende Satzzeichen vom Ende eines Wortes.
 * 
 * @param word - Eingabewort (z.B. "verzögert." oder "anrufe!")
 * @returns Objekt mit Kern-Wort und Satzzeichen
 */
function splitTrailingPunct(word: string): { core: string; punct: string } {
  if (!word || typeof word !== 'string') {
    return { core: word || '', punct: '' };
  }
  
  const match = word.match(/^(.+?)([.!?…,]+)?$/);
  if (match) {
    return {
      core: match[1] || word,
      punct: match[2] || ''
    };
  }
  
  return { core: word, punct: '' };
}

/**
 * Konvertiert einen Nebensatz (verb-final) zu einem Hauptsatz (V2-Wortstellung).
 * 
 * @param clause - Einzelner Satz OHNE führendes "dass" (z.B. "Wir 15 Minuten später starten.")
 * @returns Transformierter Hauptsatz (z.B. "Wir starten 15 Minuten später.")
 */
function v2FromVerbFinalClause(clause: string): string {
  if (!clause || typeof clause !== 'string') {
    return clause;
  }

  // Normalisiere Whitespace
  let text = clause.trim().replace(/\s+/g, ' ');
  if (!text) {
    return clause;
  }

  // Tokenisiere
  const tokens = text.split(/\s+/).filter(t => t.length > 0);
  
  // Mindestens 3 Tokens erforderlich: Subject, Middle, Verb
  if (tokens.length < 3) {
    return clause; // Nicht genug Information, unverändert zurückgeben
  }

  // Letztes Token = Verb (kann Satzzeichen enthalten)
  const lastTokenRaw = tokens[tokens.length - 1];
  const { core: verbCandidate, punct: lastPunct } = splitTrailingPunct(lastTokenRaw);
  
  // Prüfe, ob erste zwei Tokens ein Artikel+Nomen-Subjekt bilden (z.B. "Der Termin", "Die Besprechung")
  // Artikel: der, die, das, ein, eine
  const articles = ['der', 'die', 'das', 'ein', 'eine', 'den', 'dem', 'einer', 'einen'];
  let subjectStart = 0;
  let subjectEnd = 1;
  
  if (tokens.length >= 2 && articles.includes(tokens[0].toLowerCase())) {
    // Erstes Token ist Artikel, zweites ist wahrscheinlich Nomen
    subjectStart = 0;
    subjectEnd = 2; // Subject = Artikel + Nomen
  } else {
    // Subject = nur erstes Token
    subjectStart = 0;
    subjectEnd = 1;
  }
  
  // Subject = erste 1-2 Tokens
  const subject = tokens.slice(subjectStart, subjectEnd).join(' ');
  
  // Middle = alles zwischen Subject und Verb
  const middle = tokens.slice(subjectEnd, -1);

  // Prüfe auf trennbare Verben (case-insensitive)
  // Liste häufiger trennbarer Verben mit ihren Präfixen
  const separableVerbs: { [key: string]: { main: string; tail: string } } = {
    // anrufen
    'anrufe': { main: 'rufe', tail: 'an' },
    'anrufst': { main: 'rufst', tail: 'an' },
    'anruft': { main: 'ruft', tail: 'an' },
    'anrufen': { main: 'rufen', tail: 'an' },
    // ausfällen (ausfällt)
    'ausfällt': { main: 'fällt', tail: 'aus' },
    'ausfalle': { main: 'falle', tail: 'aus' },
    'ausfällst': { main: 'fällst', tail: 'aus' },
    'ausfallen': { main: 'fallen', tail: 'aus' },
  };

  // Prüfe, ob Verb-Kandidat wie ein Verb aussieht (nur Buchstaben, inkl. Umlaute)
  const isVerbLike = /^[a-zA-ZäöüÄÖÜß]+$/.test(verbCandidate);
  const isKnownSeparable = separableVerbs.hasOwnProperty(verbCandidate.toLowerCase());
  
  // Nur transformieren wenn letztes Token wie ein Verb aussieht oder ein bekanntes trennbares Verb ist
  if (!isVerbLike && !isKnownSeparable) {
    return clause; // Kein Verb-ähnliches Token, unverändert zurückgeben
  }

  const verbLower = verbCandidate.toLowerCase();
  let verbMain: string;
  let verbTail: string;

  if (separableVerbs[verbLower]) {
    // Trennbare Verbform
    verbMain = separableVerbs[verbLower].main;
    verbTail = separableVerbs[verbLower].tail;
  } else {
    // Normales Verb: kein Trennpräfix
    verbMain = verbCandidate;
    verbTail = '';
  }

  // Kapitalisiere Subject wenn es ein Pronomen ist
  const pronouns: { [key: string]: string } = {
    'ich': 'Ich',
    'du': 'Du',
    'er': 'Er',
    'sie': 'Sie',
    'es': 'Es',
    'wir': 'Wir',
    'ihr': 'Ihr',
  };
  
  let finalSubject = subject;
  const subjectLower = subject.toLowerCase();
  if (pronouns[subjectLower]) {
    finalSubject = pronouns[subjectLower];
  }

  // Baue V2-Hauptsatz: Subject + Verb + Middle + VerbTail + Punctuation
  let result = finalSubject + ' ' + verbMain;
  if (middle.length > 0) {
    result += ' ' + middle.join(' ');
  }
  if (verbTail) {
    result += ' ' + verbTail;
  }
  
  // Verwende ursprüngliche Satzzeichen oder Standard-Punkt
  const punctuation = lastPunct || '.';
  result += punctuation;

  return result.trim();
}

/**
 * Rewrite führende "dass"-Klausel zu einem Hauptsatz.
 * 
 * @param input - Eingabetext (kann mit "dass " beginnen)
 * @returns Rewriteter Text oder unveränderter Input
 */
export function rewriteLeadingDassClause(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let text = input.trim();
  if (!text) {
    return input;
  }

  // Prüfe, ob Text mit "dass " beginnt (case-insensitive)
  const dassPattern = /^dass\s+/i;
  if (!dassPattern.test(text)) {
    return input; // Keine "dass"-Klausel, unverändert zurückgeben
  }

  // Entferne führendes "dass " (case-insensitive)
  let remainder = text.replace(dassPattern, '').trim();

  if (!remainder) {
    return input; // Kein Rest nach "dass", unverändert zurückgeben
  }

  // Bestimme Pronomen basierend auf dem Rest
  let rewritten: string;
  
  // Prüfe auf Pronomen am Anfang des Rests (case-insensitive)
  // WICHTIG: Ersetze das Pronomen durch die großgeschriebene Version, entferne es NICHT
  if (/^ich\s+/i.test(remainder)) {
    // "dass ich ..." -> "Ich ..." (ersetze "ich" durch "Ich")
    rewritten = remainder.replace(/^ich\s+/i, 'Ich ');
  } else if (/^wir\s+/i.test(remainder)) {
    // "dass wir ..." -> "Wir ..." (ersetze "wir" durch "Wir")
    rewritten = remainder.replace(/^wir\s+/i, 'Wir ');
  } else if (/^es\s+/i.test(remainder)) {
    // "dass es ..." -> "Es ..." (ersetze "es" durch "Es")
    rewritten = remainder.replace(/^es\s+/i, 'Es ');
  } else if (/^der\s+/i.test(remainder)) {
    // "dass der ..." -> "Der ..." (ersetze "der" durch "Der")
    rewritten = remainder.replace(/^der\s+/i, 'Der ');
  } else if (/^die\s+/i.test(remainder)) {
    // "dass die ..." -> "Die ..." (ersetze "die" durch "Die")
    rewritten = remainder.replace(/^die\s+/i, 'Die ');
  } else if (/^das\s+/i.test(remainder)) {
    // "dass das ..." -> "Das ..." (ersetze "das" durch "Das")
    rewritten = remainder.replace(/^das\s+/i, 'Das ');
  } else {
    // Kein bekanntes Pronomen, einfach ersten Buchstaben großschreiben
    rewritten = remainder.charAt(0).toUpperCase() + remainder.slice(1);
  }

  // Stelle sicher, dass Satzzeichen vorhanden ist
  if (!/[.!?]$/.test(rewritten)) {
    rewritten += '.';
  }

  // V2-TRANSFORMATION: Konvertiere verb-final (Nebensatz) zu V2-Wortstellung (Hauptsatz)
  // IMMER anwenden wenn genug Tokens vorhanden
  const tokens = rewritten.trim().split(/\s+/);
  
  // Prüfe letztes Token (ohne Satzzeichen) ob es wie ein Verb aussieht
  if (tokens.length >= 3) {
    const lastTokenRaw = tokens[tokens.length - 1];
    const { core: lastCore } = splitTrailingPunct(lastTokenRaw);
    const isVerbLike = /^[a-zA-ZäöüÄÖÜß]+$/.test(lastCore);
    const isKnownSeparable = ['anrufe', 'anrufst', 'anruft', 'anrufen', 'ausfällt', 'ausfalle', 'ausfällst', 'ausfallen'].includes(lastCore.toLowerCase());
    
    if (isVerbLike || isKnownSeparable) {
      // Wende V2-Transformation an
      rewritten = v2FromVerbFinalClause(rewritten);
    } else {
      // Kollabiere doppelte Leerzeichen (nur wenn keine V2-Transformation)
      rewritten = rewritten.replace(/\s+/g, ' ').trim();
    }
  } else {
    // Kollabiere doppelte Leerzeichen
    rewritten = rewritten.replace(/\s+/g, ' ').trim();
  }

  return rewritten;
}
