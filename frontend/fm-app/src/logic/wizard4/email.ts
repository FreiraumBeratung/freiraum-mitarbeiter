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
  
  /** Originaler vom Nutzer gesprochener Satz (Rohtext) */
  sourceText?: string;
}

// ============================================================
// HELPER-FUNKTIONEN FÜR BODY-AUS UMGANGSSPRACHE
// ============================================================

/**
 * Normalisiert Text für die Verarbeitung
 */
function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

/**
 * Entfernt SendNow-Phrasen aus dem Text
 */
function stripSendNowPhrases(text: string): string {
  if (!text) {
    return "";
  }

  let result = text;

  const patterns: RegExp[] = [
    /[,.\s]*schick sie sofort raus[.!]?/gi,
    /[,.\s]*schick sie raus[.!]?/gi,
    /[,.\s]*schick sie[.!]?/gi,
    /[,.\s]*sofort raus[.!]?/gi,
    /[,.\s]*hau sie raus[.!]?/gi,
    /[,.\s]*hau raus[.!]?/gi,
  ];

  for (const pattern of patterns) {
    result = result.replace(pattern, "");
  }

  return result.trim();
}

type SourceMarker = "dass" | "wegen" | "free" | null;

/**
 * Extrahiert den Kern-Inhalt aus dem Source-Text
 */
function extractContentFromSource(source: string): { core: string | null; marker: SourceMarker } {
  if (!source) {
    return { core: null, marker: null };
  }

  const original = source;
  const normalized = normalizeText(source);

  // a) "dass ..."
  const idxDass = normalized.indexOf("dass ");
  if (idxDass >= 0) {
    // Index im ORIGINAL bestimmen
    const prefixNorm = normalized.slice(0, idxDass + 5); // "dass "
    const prefixOrigLength = original.length * (prefixNorm.length / normalized.length);
    // zur Vereinfachung: wir suchen "dass " im Original
    const originalIdxDass = original.toLowerCase().indexOf("dass ");
    const coreOrig = originalIdxDass >= 0 ? original.slice(originalIdxDass + "dass ".length) : original.slice(idxDass + 5);

    const stripped = stripSendNowPhrases(coreOrig);
    const cleaned = stripped.trim();
    if (!cleaned) {
      return { core: null, marker: null };
    }

    return { core: cleaned, marker: "dass" };
  }

  // b) "wegen ..."
  const idxWegen = normalized.indexOf("wegen ");
  if (idxWegen >= 0) {
    const originalIdxWegen = original.toLowerCase().indexOf("wegen ");
    const coreOrig = originalIdxWegen >= 0 ? original.slice(originalIdxWegen) : original.slice(idxWegen);

    const stripped = stripSendNowPhrases(coreOrig);
    const cleaned = stripped.trim();
    if (!cleaned) {
      return { core: null, marker: null };
    }

    return { core: cleaned, marker: "wegen" };
  }

  // c) ":" im Original
  const colonIdx = original.indexOf(":");
  if (colonIdx >= 0 && colonIdx < original.length - 1) {
    const coreOrig = original.slice(colonIdx + 1);
    const stripped = stripSendNowPhrases(coreOrig);
    const cleaned = stripped.trim();
    if (!cleaned) {
      return { core: null, marker: null };
    }

    return { core: cleaned, marker: "free" };
  }

  // d) Inhalt hinter "mail"/"email"/"e-mail"
  const mailMatch = /(mail|email|e-mail)/i.exec(normalized);
  if (mailMatch) {
    const idxMail = mailMatch.index + mailMatch[0].length;
    // Mapping Normalized -> Original über Länge
    const approxStart = Math.floor((idxMail / normalized.length) * original.length);
    const coreOrig = original.slice(approxStart);

    const stripped = stripSendNowPhrases(coreOrig);
    const cleaned = stripped.trim().replace(/^[,.\s]+/, "");
    if (!cleaned) {
      return { core: null, marker: null };
    }

    return { core: cleaned, marker: "free" };
  }

  return { core: null, marker: null };
}

/**
 * Formatiert einen Empfängernamen für die Anrede
 */
function formatRecipientName(raw?: string | null): string {
  if (!raw) return "dir";
  
  // Trim und in lowercase umwandeln
  let text = raw.trim().toLowerCase();
  
  if (!text) return "dir";
  
  // Mehrfach-Spaces reduzieren
  text = text.replace(/\s+/g, " ");
  
  // Spezielle Fälle mappen
  if (text === "freiraum beratung") {
    return "Freiraum Beratung";
  }
  if (text === "freiraumberatung") {
    return "Freiraumberatung";
  }
  
  // Standard: jedes Wort erster Buchstabe groß
  const parts = text.split(" ");
  const formatted = parts
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  
  return formatted || "dir";
}

/**
 * Stellt sicher, dass ein Satz mit einem Satzzeichen endet
 */
function ensureSentenceEnds(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const last = trimmed[trimmed.length - 1];
  if ([".", "!", "?"].includes(last)) {
    return trimmed;
  }
  return `${trimmed}.`;
}

/**
 * Prüft, ob ein Body bereits sinnvollen Inhalt hat
 */
function hasMeaningfulBody(body?: string | null): boolean {
  if (!body) return false;
  const trimmed = body.trim();
  if (trimmed.length < 5) return false;

  const lower = trimmed.toLowerCase();

  // Phrasen, die wir NICHT als sinnvollen Inhalt werten
  const trivialPatterns = [
    "sofort raus",
    "sie sofort raus",
    "schick sie sofort raus",
    "schick sofort raus",
    "schick raus",
    "hau raus"
  ];

  if (trivialPatterns.some((p) => lower === p || lower.includes(p))) {
    return false;
  }

  return true;
}

/**
 * Baut einen Body-Text aus dem Source-Text
 */
function buildBodyFromSource(sourceText: string, toName?: string): string | null {
  if (!sourceText) {
    return null;
  }

  const { core, marker } = extractContentFromSource(sourceText);
  if (!core || !marker) {
    return null;
  }

  // freundlicher Name
  const rawName = (toName || "").trim();
  const name =
    rawName && !/^(dem|der|die|den|das)\b/i.test(rawName)
      ? rawName
      : "dir";

  const ensureSentence = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return "";
    if (/[.!?]$/.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}.`;
  };

  let bodyMain: string;

  if (marker === "dass") {
    bodyMain = `ich wollte dir nur kurz Bescheid geben, dass ${core}`;
  } else if (marker === "wegen") {
    bodyMain = `ich wollte dir kurz wegen ${core} schreiben`;
  } else {
    // free
    bodyMain = core;
  }

  const sentence = ensureSentence(bodyMain);

  const greetingLine = name === "dir" ? "Hi," : `Hi ${name},`;

  return `${greetingLine}\n\n${sentence}`;
}

/**
 * Bereinigt den finalen Body von Sende-Phrasen-Markern (z.B. "Schick sie." am Ende)
 */
function cleanupSendMarkersInBody(text: string | undefined | null): string {
  if (text == null) {
    return "";
  }

  const raw = String(text);

  if (!raw.trim()) {
    return raw;
  }

  // Sende-Phrasen am Ende abschneiden,
  // z.B. "Schick sie.", "schick sie raus.", "schick sie sofort raus."
  const cleaned = raw.replace(
    /\s*schick sie(\s+(sofort\s+raus|raus))?[.!]?\s*$/i,
    ""
  );

  // Überflüssige Leerzeichen/Zeilenumbrüche am Ende entfernen,
  // aber normale Formatierung sonst unangetastet lassen
  return cleaned.replace(/\s+$/s, "");
}

/**
 * Generiert den Body für einen Wizard4-Draft
 */
function generateWizard4Body(draft: Wizard4EmailDraft): string {
  const currentBody =
    typeof draft.body === "string" ? draft.body : draft.body ? String(draft.body) : "";

  let body = currentBody.trim();

  // 1) Wenn wir sourceText haben, versuchen wir IMMER zuerst,
  //    einen schönen Body daraus zu bauen.
  if (draft.sourceText) {
    const built = buildBodyFromSource(draft.sourceText, draft.toName ?? undefined);
    if (built && built.trim().length > 0) {
      body = built.trim();
    }
  }

  // 2) Wenn nach dem Versuch noch kein Text da ist, nehmen wir evtl. existing body
  if (!body && currentBody) {
    body = currentBody.trim();
  }

  // 3) Wenn immer noch nichts Sinnvolles da ist, aber sendMode == sendNow,
  //    setzen wir einen neutralen Standardtext.
  if (!body && draft.sendMode === "sendNow") {
    body = "Moin,\n\nkurze Info.";
  }

  // 4) Body im Draft aktualisieren und zurückgeben
  draft.body = body;
  return body;
}

/**
 * Generiert/ensured den Body für einen Wizard4-Draft
 */
export function ensureWizard4Body(draft: Wizard4EmailDraft): void {
  // ruft nur generateWizard4Body auf, wenn der Body noch nicht gebaut wurde
  if (!draft.body || `${draft.body}`.trim().length === 0 || draft.sourceText) {
    generateWizard4Body(draft);
  }
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
  let body = generateWizard4Body(intent);
  
  // 4) Empfängerfelder bestimmen
  const toName = intent.recipientName;
  const toEmail = intent.recipientEmail;
  
  // 5) Sende-Modus bestimmen
  const sendMode = intent.sendMode;
  
  // 6) Draft-Objekt erstellen
  const draft: Wizard4EmailDraft = {
    toName,
    toEmail,
    subject,
    body,
    sendMode,
    intent,
    sourceText: rawInput,
  };
  
  // 7) Body generieren/ensuren (unabhängig vom sendMode)
  ensureWizard4Body(draft);
  
  // 8) Finalen Body von Sende-Phrasen wie "schick sie ..." säubern
  const safeBody = cleanupSendMarkersInBody(draft.body);
  draft.body = safeBody;
  
  // 9) Fertigen Entwurf zurückgeben
  return draft;
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








