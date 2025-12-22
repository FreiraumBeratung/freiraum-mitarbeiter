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
 * BODY 4.5: Deterministischer Mail-Body-Transformer
 * 
 * Transformiert umgangssprachliche Voice-Inputs in saubere, geschäftstaugliche E-Mail-Texte.
 * 
 * Pipeline:
 * 1. Command Strip - Befehle entfernen
 * 2. Address Strip - Empfänger-Referenzen entfernen
 * 3. Filler Kill - Füllwörter entfernen
 * 4. Semantic Rebuild - Grammatik korrigieren, Umgangssprache normalisieren
 * 5. Tone Polish - Groß-/Kleinschreibung, Satzzeichen
 * 6. No-Content-Gate - Prüft auf echten Inhalt
 */
function cleanBodyMessage(raw: string): string {
  let s = String(raw || '').trim();
  
  if (!s || s.length === 0) {
    return '';
  }

  // ============================================================
  // 1️⃣ COMMAND STRIP - Befehle an den Assistenten entfernen
  // ============================================================
  const commands = [
    'schreib', 'schreibe', 'setz', 'setze', 'mach', 'mache',
    'hau', 'kannst du', 'bitte', 'setz mir', 'mach mir',
    'schick', 'schicke', 'sende', 'send', 'tippe', 'tipp',
    'mach mal', 'hau mal', 'schreib mal', 'schreibe mal'
  ];
  
  for (const cmd of commands) {
    // Entferne Befehl als eigenständiges Wort (mit Wortgrenzen)
    const re = new RegExp(`\\b${cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    s = s.replace(re, '');
  }
  
  // Entferne "mail"/"e-mail" Einleitungen
  s = s.replace(/^(schreib(e)?|schick|sende|mail(e)?|e-?mail)\b.*?\b(e-?mail|mail)\b[: ]*/i, '');
  s = s.replace(/\beine\s+(e-?mail|mail)\b/gi, '');
  s = s.replace(/\bne\s+(e-?mail|mail)\b/gi, '');
  
  // ============================================================
  // 2️⃣ ADDRESS STRIP - Empfänger-Referenzen entfernen
  // ============================================================
  
  // E-Mail-Adressen entfernen
  s = s.replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, '');
  
  // "at web punkt ..." Fragmente entfernen
  s = s.replace(/\b(at|ät)\b\s+web\b\s+punkt\b\s+[a-z]\b/gi, '');
  s = s.replace(/\bweb\b\s+punkt\b\s+[a-z]\b/gi, '');
  
  // Namen nach Präpositionen entfernen: "an Thomas", "dem Thomas", "für Max"
  s = s.replace(/\b(an|dem|den|der|die|das|für|zu)\s+[A-ZÄÖÜ][a-zäöüß]+(\s+[A-ZÄÖÜ][a-zäöüß]+)?\b/gi, '');
  
  // Namen am Satzanfang entfernen: "Thomas , dass ..." oder "Thomas, ..."
  s = s.replace(/^[A-ZÄÖÜ][a-zäöüß]+(\s+[A-ZÄÖÜ][a-zäöüß]+)?\s*[,.:;-]\s*/i, '');
  
  // Firmenwörter entfernen (STT-Reste)
  const stopPrefixes = [
    'beratung', 'freiraum', 'freiraumberatung', 'firma', 'unternehmen',
    'team', 'gmbh', 'ug', 'kg', 'ohg', 'ag', 'chef', 'chefin'
  ];
  
  while (true) {
    const before = s;
    for (const p of stopPrefixes) {
      const re = new RegExp(`\\b${p}\\b[\\s\\-–—,:]*`, 'gi');
      s = s.replace(re, '');
    }
    s = s.replace(/^[\s\.,;:\-–—]+/, '').trim();
    if (s === before) break;
  }
  
  // ============================================================
  // 3️⃣ FILLER KILL - Sprachliche Füllwörter entfernen
  // ============================================================
  const fillers = [
    'mal', 'eben', 'halt', 'eigentlich', 'sozusagen', 'kurz',
    'aber', 'und', 'also', 'bitte', 'doch', 'ja', 'nein',
    'mir', 'uns', 'dir', 'euch'
  ];
  
  for (const filler of fillers) {
    const re = new RegExp(`\\b${filler}\\b`, 'gi');
    s = s.replace(re, '');
  }
  
  // ============================================================
  // 4️⃣ SEMANTIC REBUILD - Inhaltliche Normalisierung
  // ============================================================
  
  // "dass ich ..." → "Ich ..."
  s = s.replace(/^\s*dass\s+ich\s+/i, 'Ich ');
  s = s.replace(/^\s*[,.:;-]\s*dass\s+ich\s+/i, 'Ich ');
  
  // "dass wir ..." → "Wir ..."
  s = s.replace(/^\s*dass\s+wir\s+/i, 'Wir ');
  
  // "ich komm" → "ich komme"
  s = s.replace(/\bich\s+komm\b/gi, 'ich komme');
  s = s.replace(/\bIch\s+komm\b/g, 'Ich komme');
  
  // "ich komm morgen später" → "ich komme morgen etwas später"
  s = s.replace(/\bich\s+komme\s+morgen\s+später\b/gi, 'ich komme morgen etwas später');
  s = s.replace(/\bIch\s+komme\s+morgen\s+später\b/g, 'Ich komme morgen etwas später');
  
  // "bin unterwegs" → "Ich bin aktuell unterwegs"
  s = s.replace(/^\s*bin\s+unterwegs\b/gi, 'Ich bin aktuell unterwegs');
  
  // "meld mich" → "Ich melde mich später"
  s = s.replace(/^\s*meld\s+mich\b/gi, 'Ich melde mich später');
  
  // "ich ... komme" → "ich komme ..." (Re-Order)
  const ichMatch = /^ich\s+(.+)\s+komme$/i.exec(s);
  if (ichMatch && ichMatch[1].trim().length > 0) {
    const inner = ichMatch[1].trim();
    s = `ich komme ${inner}`;
  }
  
  // Control-Phrasen entfernen (Preview/Draft)
  const controlPhrases = [
    'nicht senden', 'nur vorbereiten', 'bitte nur vorbereiten',
    'nur als entwurf', 'als entwurf', 'nicht abschicken',
    'nicht raus schicken', 'nicht rausschicken', 'nicht verschicken',
    'zeig mir die mail', 'zeige mir die mail', 'mail nur anzeigen',
    'nur anzeigen', 'bitte prüfen', 'zum prüfen', 'vorbereiten'
  ];
  
  for (const phrase of controlPhrases) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    s = s.replace(re, '');
  }
  
  // ============================================================
  // 5️⃣ TONE POLISH - Groß-/Kleinschreibung, Satzzeichen
  // ============================================================
  
  // Führende Satzzeichen entfernen
  s = s.replace(/^[\s\.,;:\-–—]+/, '');
  
  // Mehrfachspaces normalisieren
  s = s.replace(/\s{2,}/g, ' ').trim();
  
  // "ich" am Anfang groß machen
  s = s.replace(/^ich\b/, 'Ich');
  
  // Ersten Buchstaben groß machen (falls noch klein)
  if (s.length > 0 && /^[a-zäöü]/.test(s)) {
    s = s[0].toUpperCase() + s.slice(1);
  }
  
  // Punkt am Ende setzen (wenn noch keiner vorhanden)
  s = s.trim();
  if (s.length > 0 && !/[.!?]$/.test(s)) {
    s = s + '.';
  }
  
  // Komma-Spaces fixen
  s = s.replace(/\s+\./g, '.').trim();
  
  // ============================================================
  // 6️⃣ NO-CONTENT-GATE - Prüft auf echten Inhalt
  // ============================================================
  
  // STOPWORDS/NOISE: Wörter, die keinen echten Inhalt darstellen
  const NOISE_WORDS = [
    'auf', 'raus', 'mail', 'e-mail', 'email', 'bitte', 'mal', 'kurz', 'eben',
    'dem', 'den', 'der', 'die', 'das', 'eine', 'ne', 'mir', 'dir', 'mich',
    'dich', 'uns', 'euch', 'ihm', 'ihr', 'ihnen', 'an', 'für', 'zu', 'von',
    'aber', 'und', 'oder', 'also', 'doch', 'ja', 'nein', 'nur', 'schon'
  ];
  
  // Prüfe, ob Text nur aus Noise besteht
  const words = s.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const meaningfulWords = words.filter(w => {
    // Entferne Satzzeichen
    const clean = w.replace(/[.,:;!?\-–—]/g, '');
    // Prüfe, ob es kein Noise-Wort ist
    return clean.length > 0 && !NOISE_WORDS.includes(clean);
  });
  
  // Wenn weniger als 3 Buchstaben oder nur Noise-Wörter -> leer
  const totalLetters = s.replace(/[^a-zäöüß]/gi, '').length;
  if (totalLetters < 3 || meaningfulWords.length === 0) {
    return '';
  }
  
  // Wenn nur Satzzeichen oder Whitespace -> leer
  if (!s || s.length === 0 || /^[.,:;\s\-–—]+$/.test(s)) {
    return '';
  }
  
  return s;
}

/**
 * BODY 4.5: Erweiterte Command-Stripping-Funktion
 * Entfernt umgangssprachliche E-Mail-Befehle und Phrasen
 */
function stripEmailCommandPhrases(text: string): string {
  let s = String(text || '').trim();
  if (!s) return '';
  
  // Komplexe Command-Patterns (case-insensitive)
  const commandPatterns = [
    // "hau ... (kurz )?(ne|eine) mail raus"
    /hau\s+.*?\s+(kurz\s+)?(ne|eine)\s+mail\s+raus/gi,
    /hau\s+.*?\s+mail\s+raus/gi,
    // "schreib(e)? ... (ne|eine) mail"
    /schreib(e)?\s+.*?\s+(ne|eine)\s+mail/gi,
    // "setz(e)? ... mail auf"
    /setz(e)?\s+.*?\s+mail\s+auf/gi,
    // "mach ... (ne|eine) mail"
    /mach\s+.*?\s+(ne|eine)\s+mail/gi,
    // "schick ... (ne|eine) mail"
    /schick\s+.*?\s+(ne|eine)\s+mail/gi,
    // "mail an" / "eine mail an" (nur als Command-Teil, nicht Email-Adresse)
    /\bmail\s+an\b/gi,
    /\beine\s+mail\s+an\b/gi,
    /\bne\s+mail\s+an\b/gi,
  ];
  
  for (const pattern of commandPatterns) {
    s = s.replace(pattern, '');
  }
  
  // Einzelne Command-Wörter entfernen (mit Wortgrenzen)
  const singleCommands = [
    'schreib', 'schreibe', 'setz', 'setze', 'mach', 'mache',
    'hau', 'schick', 'schicke', 'sende', 'send', 'tippe', 'tipp',
    'kannst du', 'bitte', 'setz mir', 'mach mir'
  ];
  
  for (const cmd of singleCommands) {
    const re = new RegExp(`\\b${cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    s = s.replace(re, '');
  }
  
  // Füllwörter am Anfang entfernen
  s = s.replace(/^\s*(mal|kurz|bitte|eben)\s+/i, '');
  
  // Adressaten-Namen am Anfang entfernen (wenn isoliert und danach nur Komma/Leerzeichen)
  // "Thomas , dass..." -> entferne "Thomas ,"
  s = s.replace(/^[A-ZÄÖÜ][a-zäöüß]+(\s+[A-ZÄÖÜ][a-zäöüß]+)?\s*[,.:;-]\s*/i, '');
  
  return s;
}

/**
 * BODY 4.5: Entfernt Send-Mode-Phrasen (Preview/Draft/Control)
 */
function stripSendModePhrases(text: string): string {
  let s = String(text || '').trim();
  if (!s) return '';
  
  const sendModePhrases = [
    'nicht senden', 'nur vorbereiten', 'bitte nur vorbereiten',
    'nur als entwurf', 'als entwurf', 'nur draft', 'als draft',
    'nicht abschicken', 'nicht raus schicken', 'nicht rausschicken',
    'nicht verschicken', 'zeig mir die mail', 'zeige mir die mail',
    'mail nur anzeigen', 'nur anzeigen', 'bitte prüfen', 'zum prüfen',
    'vorbereiten', 'nur vorbereitung'
  ];
  
  for (const phrase of sendModePhrases) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    s = s.replace(re, '');
  }
  
  return s;
}

/**
 * BODY 4.5: Bereinigt Satzzeichen (führende, doppelte, etc.)
 */
function cleanupPunctuation(text: string): string {
  let s = String(text || '').trim();
  if (!s) return '';
  
  // Führende Satzzeichen entfernen
  s = s.replace(/^[\s\.,;:\-–—]+/, '');
  
  // Mehrfache Satzzeichen am Ende normalisieren
  s = s.replace(/[.,!?;:]+$/u, '');
  
  // Mehrfachspaces normalisieren
  s = s.replace(/\s{2,}/g, ' ').trim();
  
  return s;
}

/**
 * BODY 4.5: Extrahiert den besten "Content"-Satz aus mehreren Sätzen
 * Bevorzugt Sätze mit Verben/Infos wie komme/bin/bitte/ich/wir/morgen/heute/Termin/unterwegs
 */
function extractMeaningfulSentence(text: string): string {
  let s = String(text || '').trim();
  if (!s) return '';
  
  // Wenn nur ein Satz, direkt zurückgeben
  const sentences = s.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length <= 1) {
    return s;
  }
  
  // Content-Indikatoren: Wörter, die auf echten Inhalt hinweisen
  const contentIndicators = [
    'komme', 'komm', 'bin', 'bist', 'ist', 'sind', 'werde', 'wird',
    'ich', 'wir', 'du', 'er', 'sie', 'es',
    'morgen', 'heute', 'später', 'jetzt', 'gleich',
    'termin', 'unterwegs', 'anrufen', 'melden', 'schreiben',
    'bitte', 'danke', 'vielen', 'dank'
  ];
  
  // Bewerte jeden Satz
  let bestSentence = '';
  let bestScore = 0;
  
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    let score = 0;
    
    // Zähle Content-Indikatoren
    for (const indicator of contentIndicators) {
      if (lower.includes(indicator)) {
        score += 1;
      }
    }
    
    // Bonus für längere Sätze (mehr Inhalt)
    if (sentence.length > 10) {
      score += 1;
    }
    
    // Minus-Punkte für Command-Reste
    if (/\b(mach|setz|hau|schreib|mail|raus|auf)\b/i.test(sentence)) {
      score -= 2;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }
  
  // Wenn kein Satz einen positiven Score hat, nimm den letzten (meist der Inhalt)
  if (bestScore <= 0 && sentences.length > 0) {
    bestSentence = sentences[sentences.length - 1];
  }
  
  return bestSentence || s;
}

/**
 * BODY 4.5: Finalisiert den Satz (Trim, Großschreibung, Satzzeichen)
 */
function finalizeSentence(text: string): string {
  let s = String(text || '').trim();
  if (!s) return '';
  
  // Führende Satzzeichen entfernen
  s = s.replace(/^[\s\.,;:\-–—]+/, '');
  
  // Mehrfachspaces normalisieren
  s = s.replace(/\s{2,}/g, ' ').trim();
  
  // "ich" am Anfang groß machen
  s = s.replace(/^ich\b/, 'Ich');
  
  // Ersten Buchstaben groß machen (falls noch klein)
  if (s.length > 0 && /^[a-zäöü]/.test(s)) {
    s = s[0].toUpperCase() + s.slice(1);
  }
  
  // Punkt am Ende setzen (wenn noch keiner vorhanden)
  s = s.trim();
  if (s.length > 0 && !/[.!?]$/.test(s)) {
    s = s + '.';
  }
  
  // Komma-Spaces fixen
  s = s.replace(/\s+\./g, '.').trim();
  
  return s;
}

/**
 * BODY 4.5: Prüft, ob Text keinen echten Inhalt hat
 */
function isNonContent(text: string): boolean {
  if (!text || text.length === 0) return true;
  
  const s = text.trim();
  
  // Nur Satzzeichen oder Whitespace
  if (/^[.,:;\s\-–—]+$/.test(s)) return true;
  
  // STOPWORDS/NOISE
  const NOISE_WORDS = [
    'auf', 'raus', 'mail', 'e-mail', 'email', 'bitte', 'mal', 'kurz', 'eben',
    'dem', 'den', 'der', 'die', 'das', 'eine', 'ne', 'mir', 'dir', 'mich',
    'dich', 'uns', 'euch', 'ihm', 'ihr', 'ihnen', 'an', 'für', 'zu', 'von',
    'aber', 'und', 'oder', 'also', 'doch', 'ja', 'nein', 'nur', 'schon'
  ];
  
  const words = s.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const meaningfulWords = words.filter(w => {
    const clean = w.replace(/[.,:;!?\-–—]/g, '');
    return clean.length > 0 && !NOISE_WORDS.includes(clean);
  });
  
  // Wenn weniger als 3 Buchstaben oder nur Noise-Wörter
  const totalLetters = s.replace(/[^a-zäöüß]/gi, '').length;
  if (totalLetters < 3 || meaningfulWords.length === 0) {
    return true;
  }
  
  return false;
}

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
  // 1) Harte Regel: Wenn previewOnly, sofort "" zurückgeben
  if (intent.sendMode === 'previewOnly') {
    return '';
  }

  const tone = intent.tone;
  
  // 2) Body-Quelle strikt festlegen: rawInput || message || bodyHint || ""
  // bodyHint ist optional und kann in Wizard4IntentResult fehlen, daher mit ?? prüfen
  const bodyHint = (intent as any).bodyHint;
  let raw = (intent.rawInput ?? '').trim() || (intent.message ?? '').trim() || (bodyHint ?? '').trim() || '';

  // Wenn keine Basis vorhanden, sofort "" zurückgeben
  if (!raw || raw.length === 0) {
    return '';
  }

  // ============================================================
  // BODY 4.5 PIPELINE
  // ============================================================
  
  // Schritt 1: Whitespace normalisieren
  let text = normalizeWhitespace(raw);
  
  // Schritt 2: E-Mail-Command-Phrasen entfernen
  text = stripEmailCommandPhrases(text);
  
  // Schritt 3: Send-Mode-Phrasen entfernen
  text = stripSendModePhrases(text);
  
  // Schritt 4: Satzzeichen bereinigen
  text = cleanupPunctuation(text);
  
  // Schritt 5: Besten Content-Satz extrahieren (wenn mehrere Sätze)
  text = extractMeaningfulSentence(text);
  
  // Schritt 6: Body 4.4 Cleaner anwenden (Address Strip, Filler Kill, Semantic Rebuild)
  text = cleanBodyMessage(text);
  
  // Schritt 7: Satz finalisieren (Trim, Großschreibung, Satzzeichen)
  text = finalizeSentence(text);
  
  // Schritt 8: No-Content-Gate - Prüft auf echten Inhalt
  if (isNonContent(text)) {
    return '';
  }

  // Wenn nach der BODY 4.5 Pipeline nichts übrig ist, "" zurückgeben
  if (!text || text.length === 0) {
    return '';
  }
  
  // Basis-Satzstruktur normalisieren (z. B. "dass ich ..." -> "ich ...")
  text = normalizeBaseSentence(text);
  
  // Wenn nach normalizeBaseSentence nichts übrig ist, "" zurückgeben
  if (!text || text.length === 0) {
    return '';
  }
  
  // Whitespace und Kapitalisierung normalisieren
  text = normalizeWhitespace(text);
  text = capitalizeFirst(text);
  
  // Wenn nach Normalisierung nichts übrig ist, "" zurückgeben
  if (!text || text.length === 0) {
    return '';
  }

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

  // Wenn nach allen Schritten nichts übrig ist, "" zurückgeben
  // KEIN Fallback auf rawInput, KEIN Punkt, KEINE "Kurze Info"
  if (!text || text.length === 0 || /^[.,:;\s\-–—]+$/.test(text)) {
    return '';
  }

  // 7) Final capitalize und Punkt am Ende sicherstellen
  text = capitalizeFirst(text);
  
  // Stelle sicher, dass der Satz mit "." endet
  text = text.trim();
  if (text.length > 0 && !/[.!?]$/.test(text)) {
    text = text + '.';
  }

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

// ============================================================
// BODY 4.5 TEST-BEISPIELE
// ============================================================
// Zum Testen in der Browser-Konsole mit buildWizard4EmailFromInput:
//
// Test A: "Hau dem Thomas kurz ne Mail raus. Ich komme morgen später."
// buildWizard4EmailFromInput("Hau dem Thomas kurz ne Mail raus. Ich komme morgen später.")
// Erwartung: body = "Ich komme morgen später." (kein "Raus.", kein Kleinschreibung-Fehler)
//
// Test B: "Setz mir bitte eine Mail auf."
// buildWizard4EmailFromInput("Setz mir bitte eine Mail auf.")
// Erwartung: body = "" (leer, weil kein echter Inhalt)
//
// Test C: "Mach mal ne Mail an freiraumberatung@web.de. Ich bin unterwegs."
// buildWizard4EmailFromInput("Mach mal ne Mail an freiraumberatung@web.de. Ich bin unterwegs.")
// Erwartung: body = "Ich bin unterwegs." (oder "Ich bin aktuell unterwegs.")
//
// Test D: "Schreib Thomas eine Mail, aber nur vorbereiten, nicht senden."
// buildWizard4EmailFromInput("Schreib Thomas eine Mail, aber nur vorbereiten, nicht senden.")
// Erwartung: body = "" (weil kein echter Inhalt außer Anweisung)
//
// Weitere Beispiele:
//
// "Hau raus an Thomas, ich komm morgen später."
// Erwartung: body = "Ich komme morgen etwas später."
//
// "Schick dem Marcel eine mail ich komme spaeter"
// Erwartung: body = "Ich komme später."
//
// "Setz mir bitte ne mail auf, dass ich heute anrufe."
// Erwartung: body = "Ich rufe heute an." (oder ähnlich)
