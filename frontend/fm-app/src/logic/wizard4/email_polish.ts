/**
 * KI-Polishing für E-Mail-Bodies: Korrigiert nur Rechtschreibung, Satzzeichen, Groß/Klein, Kommas.
 * KEINE inhaltlichen Änderungen, KEINE neuen Fakten, KEIN Umschreiben.
 */

// Falls es bereits eine zentrale API-Base gibt, diese nutzen.
// Ansonsten hier hart auf localhost:30521 verweisen.
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  "http://127.0.0.1:30521";

export interface PolishEmailBodyOptions {
  timeoutMs?: number; // Optional: Default basierend auf mode
  mode?: "previewOnly" | "sendNow"; // Mode: previewOnly (kurzer Timeout) oder sendNow (langer Timeout)
  sendNow?: boolean; // Deprecated: Verwende stattdessen mode. Flag, ob bei sendNow ein Fallback passiert ist
  shortPrompt?: boolean; // Für Retry: kürzerer Prompt (nur Satzzeichen+Groß/Klein)
}

export interface PolishEmailBodyResult {
  ok: boolean;
  body: string;
  usedAi: boolean;
  reason?: string;
  sentWithoutPolish?: boolean; // Flag, ob bei sendNow ohne Polish gesendet wird
}

/**
 * Poliert einen E-Mail-Body mit KI: Nur Rechtschreibung, Satzzeichen, Groß/Klein, Kommas.
 * Keine inhaltlichen Änderungen, kein Umschreiben.
 * 
 * @param body - Original E-Mail-Body Text
 * @param opts - Options mit timeoutMs (Timeout in Millisekunden)
 * @returns Promise mit poliertem Body (oder Original bei Fehler/Timeout)
 */
export async function polishEmailBody(
  body: string,
  opts: PolishEmailBodyOptions = {}
): Promise<PolishEmailBodyResult> {
  // Wenn body leer oder nur whitespace => return original
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return {
      ok: false,
      body: body || '',
      usedAi: false,
      reason: 'body empty or whitespace only'
    };
  }

  // Edgecase: Wenn body extrem kurz ist (< 10 Zeichen), skip polish
  if (body.trim().length < 10) {
    return {
      ok: false,
      body: body.trim(),
      usedAi: false,
      reason: 'body too short (< 10 characters)'
    };
  }

  const originalBody = body.trim();
  
  // Bestimme mode und timeout
  // Legacy support: sendNow flag wird zu mode konvertiert
  const mode = opts.mode || (opts.sendNow === true ? "sendNow" : "previewOnly");
  // Timeout: sendNow bekommt 3500ms (wie vom Benutzer gefordert), previewOnly 3000ms
  const timeoutMs = opts.timeoutMs ?? (mode === "sendNow" ? 3500 : 3000);

  // Prompt basierend auf shortPrompt Flag (für Retry)
  const polishPrompt = opts.shortPrompt
    ? `Du bist ein deutscher Korrektor. Korrigiere NUR Satzzeichen, Groß-/Kleinschreibung am Satzanfang, und füge fehlende Punkte am Ende hinzu. KEINE stilistischen Änderungen, KEIN Umschreiben.

WICHTIG: Gib ausschließlich den finalen E-Mail-Body zurück.
- Keine Einleitung, keine Labels (Betreff/An/Senden), kein Markdown, keine Quotes.
- Erhalte die Anrede, aber erfinde keine neuen Empfänger.

Text:
${originalBody}

Korrigierter Text:`
    : `Du bist ein deutscher Korrektor.

Aufgabe: Korrigiere AUSSCHLIESSLICH Rechtschreibung, Satzzeichen, Groß-/Kleinschreibung und offensichtliche Tippfehler.

WICHTIG: Erzeuge korrekt kapitalisierte Sätze:
- Satzanfänge müssen großgeschrieben werden.
- Eigennamen müssen großgeschrieben werden.
- Jeder Satz muss mit einem Satzende enden (Punkt, Fragezeichen, Ausrufezeichen).
- Kommas müssen korrekt gesetzt werden.

ABSOLUTE REGELN (STRENG EINHALTEN):
- Gib ausschließlich den finalen E-Mail-Body zurück.
- Keine Einleitung, keine Labels (Betreff/An/Senden), kein Markdown, keine Quotes.
- Erhalte die Anrede, aber erfinde keine neuen Empfänger.
- NUR Rechtschreibung, Satzzeichen, Groß-/Kleinschreibung korrigieren.
- KEINE stilistischen Änderungen.
- KEIN Umschreiben des Tons (z.B. "Sehr geehrter" NICHT hinzufügen).
- KEINE komplett neuen Formulierungen.
- KEINE formelle Umwandlung (z.B. "hi" bleibt "hi", wird NICHT zu "Sehr geehrter").
- Inhalt, Ton, Bedeutung, Stil NICHT verändern.
- Keine zusätzlichen Sätze hinzufügen.
- Keine Anrede hinzufügen (falls nicht vorhanden).
- Keine Signatur hinzufügen (kein Name, keine Firma, keine Kontaktdaten).
- Struktur erhalten (Zeilenumbrüche nicht zerstören).
- Keine Erklärungen, keine Kommentare.
- Der Text soll inhaltlich und stilistisch IDENTISCH bleiben, nur orthografisch korrekt.

Text zum Korrigieren:
${originalBody}

Gib NUR den korrigierten E-Mail-Body zurück, ohne Erklärungen, ohne Labels, ohne Meta-Wörter. Ändere KEINEN Stil, KEINE Formulierungen. Forme den Text in korrekte Sätze mit korrekter Groß-/Kleinschreibung und Satzzeichen.`;

  const payload = {
    message: polishPrompt,
    context: "E-Mail-Body Polishing: NUR Rechtschreibung/Satzzeichen/Groß-Klein korrigieren. KEINE stilistischen Änderungen, KEIN Umschreiben des Tons, KEINE neuen Formulierungen."
  };

  // AbortController für Timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, opts.timeoutMs);

  try {
    console.log('[email-polish] Request an /api/ai/chat gesendet', {
      mode,
      timeoutMs,
      bodyLength: originalBody.length,
      shortPrompt: opts.shortPrompt || false
    });

    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      const isSendNow = mode === 'sendNow';
      console.error('[email-polish] KI-Request fehlgeschlagen:', res.status, errorText, { mode, bodyLength: originalBody.length });
      if (isSendNow) {
        console.warn('[email-polish] fallback -> sending without polish (sendNow=true, API error:', res.status, ')');
      }
      return {
        ok: false,
        body: originalBody,
        usedAi: false,
        reason: `API error: ${res.status}`,
        sentWithoutPolish: isSendNow // Flag nur bei sendNow setzen
      };
    }

    const data = await res.json() as { reply: string };
    let polishedBody = (data.reply || '').trim();

    // Validierung: Wenn polierter Body leer ist oder zu kurz (fehlerhaft), fallback
    if (!polishedBody || polishedBody.length < originalBody.length * 0.5) {
      const isSendNow = mode === 'sendNow';
      console.warn('[email-polish] Polished body zu kurz oder leer, fallback auf original', { mode, bodyLength: originalBody.length });
      if (isSendNow) {
        console.warn('[email-polish] fallback -> sending without polish (sendNow=true, polished body invalid)');
      }
      return {
        ok: false,
        body: originalBody,
        usedAi: false,
        reason: 'polished body too short or empty',
        sentWithoutPolish: isSendNow // Flag nur bei sendNow setzen
      };
    }

    // Quality-Guard: Prüfe, ob AI-Output zu schlecht ist (z.B. alles lowercase, keine Satzzeichen)
    if (looksUnpolished(polishedBody)) {
      console.warn('[email-polish] AI-Output wirkt unpolished, wende minimale lokale Korrektur an');
      polishedBody = applyMinimalLocalFix(polishedBody);
      console.log('[email-polish] quality-guard applied');
    }

    // Sanitize: Entferne Meta-Wörter wie "Senden.", "Betreff:", "An:" etc. UND Command-Artefakte wie "Schreiben."
    const beforeSanitize = polishedBody;
    polishedBody = sanitizePolishedEmailBody(polishedBody);
    if (beforeSanitize !== polishedBody) {
      console.log('[ai-polish][sanitize] removed leading meta-tokens/command-artifacts', {
        beforeLength: beforeSanitize.length,
        afterLength: polishedBody.length,
        removed: beforeSanitize.substring(0, 50)
      });
    }

    console.log('[email-polish] Body erfolgreich poliert', {
      mode,
      timeoutMs,
      originalLength: originalBody.length,
      polishedLength: polishedBody.length,
      bodyLength: originalBody.length
    });

    return {
      ok: true,
      body: polishedBody,
      usedAi: true
    };

  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      const isSendNow = mode === 'sendNow';
      if (isSendNow) {
        console.warn('[email-polish] fallback -> sending without polish (sendNow=true, timeout nach', timeoutMs, 'ms)', { mode, bodyLength: originalBody.length });
      } else {
        console.warn('[email-polish] Request abgebrochen (Timeout nach', timeoutMs, 'ms)', { mode, bodyLength: originalBody.length });
      }
      return {
        ok: false,
        body: originalBody,
        usedAi: false,
        reason: 'timeout',
        sentWithoutPolish: isSendNow // Flag nur bei sendNow setzen
      };
    }

    console.error('[email-polish] Fehler beim Polishing:', err, { mode, bodyLength: originalBody.length });
    const isSendNow = mode === 'sendNow';
    if (isSendNow) {
      console.warn('[email-polish] fallback -> sending without polish (sendNow=true, error:', err.message || 'unknown', ')');
    }
    return {
      ok: false,
      body: originalBody,
      usedAi: false,
      reason: `error: ${err.message || 'unknown'}`,
      sentWithoutPolish: isSendNow // Flag nur bei sendNow setzen
    };
  }
}

/**
 * Entfernt führende Command-Artefakte wie "Schreiben.", "Senden.", "Schick." etc.
 * @param text - Text zum Bereinigen
 * @returns Text ohne führende Command-Artefakte
 */
function stripLeadingCommandArtifact(text: string): string {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  let cleaned = text.trim();
  let maxIterations = 2; // Safety: Maximal 2x hintereinander strip
  let iteration = 0;

  while (iteration < maxIterations) {
    const before = cleaned;
    
    // Entferne NUR am Anfang ein einzelnes Kommando-Wort mit optionalem Punkt/Komma/Doppelpunkt/Bindestrich dahinter
    // Pattern: "Schreiben." / "Senden." / "Schick." / "Schicke." / "Mail." / "Mailen." / "Nachricht." / "Zukommen." etc.
    cleaned = cleaned.replace(/^\s*(senden|schreiben|schick|schicke|mail|mailen|nachricht|zukommen)\s*[\.\:\-,]\s+/i, '');
    
    // Trim links nach jedem Strip
    cleaned = cleaned.trimLeft();
    
    // Wenn nichts entfernt wurde, breche ab
    if (before === cleaned) {
      break;
    }
    
    iteration++;
  }

  return cleaned;
}

/**
 * Normalisiert E-Mail-Body nach AI-Polish: Entfernt Command-Artefakte und Meta-Sätze vor Greetings
 * @param text - Polierter Body-Text
 * @returns Normalisierter Body-Text
 */
export function normalizeEmailBodyAfterPolish(text: string): string {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  let t = text.trimStart();

  // STEP 1: Remove simple leading commands (wie bisher)
  t = stripLeadingCommandArtifact(t);

  // STEP 2: Greeting-Anker-Strip
  // Suche erste Begrüßung im Text
  // Pattern: (^|[\n\r\s]) erlaubt Zeilenanfang oder Whitespace davor
  const greetingRegex = /(^|[\n\r\s])((hi|hallo|hey|guten\s+tag|guten\s+morgen|guten\s+abend|moin|servus)\b)/i;
  const greetingMatch = t.match(greetingRegex);

  if (greetingMatch && greetingMatch.index !== undefined) {
    // greetingMatch.index zeigt auf den Start von (^|[\n\r\s])
    // greetingMatch[2] ist das eigentliche Greeting ("hi", "hallo", etc.)
    // Finde den Start des Greetings (nach optionalem Whitespace)
    let greetingIndex = greetingMatch.index;
    // Wenn das Match mit Whitespace beginnt, startet das Greeting direkt danach
    if (greetingMatch[1] && greetingMatch[1].trim() === '') {
      // Whitespace gefunden, Greeting startet direkt danach
      greetingIndex = greetingMatch.index + greetingMatch[1].length;
    }
    
    if (greetingIndex > 0) {
      const prefix = t.slice(0, greetingIndex).trim();
      const bodyFromGreeting = t.slice(greetingIndex).trimStart();

      // Bedingung zum Abschneiden:
      // - prefix.length <= 160 (wie in Anforderung)
      // - und prefix enthält Command-Wörter (inkl. "zukommen")
      const cmdRe = /\b(schreib(?:e|en)?|schreibe|mail|e-?mail|email|nachricht|sende(?:n)?|send|versende(?:n)?|schick(?:e|en|t)?|verschick(?:en)?|los|direkt|sofort|zukommen|zukommen\s+lassen)\b/i;
      
      if (prefix.length > 0 && prefix.length <= 160 && cmdRe.test(prefix)) {
        // Entferne alles vor dem Greeting
        let cleaned = bodyFromGreeting;
        // Zusätzlich leading punctuation entfernen:
        cleaned = cleaned.replace(/^[,.\-–—:;]+\s*/g, "");
        return cleaned.trim();
      }
    }
  }

  return t.trim();
}

/**
 * Sanitized polierten E-Mail-Body: Entfernt Meta-Wörter wie "Senden.", "Betreff:", "An:" etc.
 * @param text - Polierter Body-Text
 * @returns Sanitized Body-Text ohne Meta-Wörter
 */
function sanitizePolishedEmailBody(text: string): string {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  let sanitized = text.trim();

  // STEP 1: Entferne führende Command-Artefakte (z.B. "Schreiben.", "Senden.", "Schick.")
  sanitized = stripLeadingCommandArtifact(sanitized);

  // STEP 2: Entferne führende Meta-Zeilen/Token (case-insensitive, deutsch/englisch)
  // Pattern a): "Senden." / "Send." / "Verschieken." etc. (mit Punkt/Doppelpunkt/Bindestrich/Gedankenstrich)
  sanitized = sanitized.replace(/^\s*(senden|send|verschicken|abschicken|sende)\s*[\.\:\-–—]\s*/i, '');

  // Pattern b): "Betreff:" / "Subject:" / "An:" / "To:" mit optionalem Wert bis Zeilenende oder Leerzeichen
  sanitized = sanitized.replace(/^\s*(betreff|subject|an|to)\s*[\:\-–—]\s*[^\n]*\n?/i, '');

  // Pattern c): "Email:" / "E-Mail:" am Anfang
  sanitized = sanitized.replace(/^\s*(email|e-mail)\s*[\:\-–—]\s*/i, '');

  // Entferne doppelte Leerzeilen am Anfang
  sanitized = sanitized.replace(/^\s*\n\s*\n+/, '\n');

  // Trim am Ende
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Prüft, ob ein Text "unpolished" wirkt (z.B. alles lowercase, keine Satzzeichen).
 * @param text - Text zum Prüfen
 * @returns true, wenn Text unpolished wirkt
 */
function looksUnpolished(text: string): boolean {
  if (!text || text.length < 10) return false;
  
  const trimmed = text.trim();
  
  // Prüfe: >70% lowercase Buchstaben (ohne Leerzeichen)
  const letters = trimmed.replace(/[^a-zäöüßA-ZÄÖÜ]/g, '');
  if (letters.length === 0) return false;
  
  const lowercaseCount = (letters.match(/[a-zäöüß]/g) || []).length;
  const lowercaseRatio = lowercaseCount / letters.length;
  
  // Prüfe: Keine Satzzeichen (.?!) vorhanden
  const hasSentenceEnd = /[.!?]/.test(trimmed);
  
  // Prüfe: Kein Großbuchstabe am Anfang
  const startsWithCapital = /^[A-ZÄÖÜ]/.test(trimmed);
  
  // Wenn >70% lowercase UND (keine Satzzeichen ODER kein Großbuchstabe am Anfang)
  if (lowercaseRatio > 0.7 && (!hasSentenceEnd || !startsWithCapital)) {
    return true;
  }
  
  return false;
}

/**
 * Wendet minimale lokale Korrekturen an:
 * - trim
 * - erstes Zeichen groß
 * - wenn kein Satzende vorhanden: Punkt ans Ende
 * - ersetze mehrfach Spaces
 * @param text - Text zum Korrigieren
 * @returns Korrigierter Text
 */
function applyMinimalLocalFix(text: string): string {
  let fixed = text.trim();
  
  // Erstes Zeichen groß
  if (fixed.length > 0) {
    fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
  }
  
  // Wenn kein Satzende vorhanden: Punkt ans Ende
  if (!/[.!?]$/.test(fixed)) {
    fixed = fixed + '.';
  }
  
  // Mehrfach Spaces ersetzen
  fixed = fixed.replace(/\s+/g, ' ');
  
  return fixed.trim();
}

// ============================================================
// SELF-TEST: Sanitizer-Testcases (dev-only, hinter Flag)
// ============================================================
if (typeof process !== 'undefined' && (process.env.NODE_ENV === 'development' || import.meta.env?.DEV)) {
  function runSanitizerTests() {
    const testCases = [
      { input: "Senden. Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "Schreiben. Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "Schreiben: Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "Senden: Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "Schick. Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "Schick: Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "Betreff: Test\nHi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "An: Thomas\nHi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "  SEND: Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "send: Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." },
      { input: "Hi Thomas, hier ist Dennis.", expected: "Hi Thomas, hier ist Dennis." }, // normaler Text bleibt gleich
      { input: "", expected: "" }, // leerer Text bleibt leer
    ];

    console.log('[ai-polish][self-test] Running sanitizer tests...');
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < testCases.length; i++) {
      const test = testCases[i];
      const result = sanitizePolishedEmailBody(test.input);
      const success = result === test.expected;
      
      if (success) {
        passed++;
        console.log(`[ai-polish][self-test] ✓ Test ${i + 1} passed: "${test.input.substring(0, 30)}..." -> "${result.substring(0, 30)}..."`);
      } else {
        failed++;
        console.error(`[ai-polish][self-test] ✗ Test ${i + 1} failed: expected "${test.expected}", got "${result}"`);
      }
    }

    console.log(`[ai-polish][self-test] Tests completed: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
      console.warn('[ai-polish][self-test] Some tests failed - sanitizer may need adjustment');
    }
  }

  // Führe Tests einmalig beim Modul-Load aus (nur in Dev)
  if (typeof window === 'undefined' || window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1') {
    try {
      runSanitizerTests();
    } catch (err) {
      // Ignoriere Test-Fehler in Produktion
    }
  }
}

