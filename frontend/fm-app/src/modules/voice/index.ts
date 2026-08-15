import { backendBase } from "../../lib/backendBase";
import { parseIntentDE } from "./intent";
import { voiceState } from "./state";
import { recordAndTranscribe } from "../stt";
import { PartnerBotBus } from "../partnerbot";
import { triggerEmotion } from "../partnerbot/partnerbot_emotion";
import { showTransitionMessage } from "../../App";
import { routeVoiceIntent, type VoiceIntent } from "./intent_router";
import { getLastAction, setLastAction } from "./voice_action_store";
import type { NavigateFunction } from "react-router-dom";
import { askAssistant } from "../ai";
import { cleanEmailBodyFromAi } from "../../utils/email_text_utils";
import { parseWizard4Intent } from "../../logic/wizard4/intent";
import { generateWizard4Subject } from "../../logic/wizard4/subject";
import { generateWizard4Body } from "../../logic/wizard4/body";
import { buildWizard4EmailFromInput, ensureTerminalPunctuation, repairBodyAfterSendAdverbStrip, stripEndOfSentenceSendCommands, stripSendControlPhrasesFinal } from "../../logic/wizard4/email";
import { buildStatusEmailBody } from "../../logic/wizard4/status_brain";
import { polishEmailBody } from "../../logic/wizard4/email_polish";
import { normalizeEmailBodyAfterPolish } from "../../logic/wizard4/normalizeEmailBodyAfterPolish";
import { stripLeadingFillerWords } from "../../logic/wizard4/filler_words";
import { stripSubjectCommand } from "../../logic/wizard4/subject_command_strip";
import { stripLeadingSubjectEcho } from "../../logic/wizard4/strip_leading_subject_echo";
import { isFollowUpSendCurrentDraft, isUiDraftAvailable } from "../../logic/wizard4/followup_send_draft";
import { rewriteLeadingDassClause } from "./dass_rewrite";
import { getSelectedMailContext, type SelectedMailContext } from "../mail/selectedMailContext";
import {
  buildImmediateReplyIntentFromOpenMail,
  buildReplyIntentFromSelectedMailContext,
  isExplicitContextSendConfirmation,
} from "./reply_context_phase_a";
import {
  isColloquialNotifySendPhrase,
  isPoliteAssistantMailCommand,
} from "./colloquial_notify";
import { isImmediateSendMode } from "./send_review_mode";
import { hasCancelPhrase } from "../../logic/wizard4/cancel_phrase";
import {
  subjectSet,
  subjectAppend,
  subjectReplacePart,
  subjectClear,
} from "./subject_edit";
import {
  deleteLastNSentences,
  replaceFirstNSentences,
} from "../../utils/sentence_utils";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;
declare const speak: ((text: string) => Promise<void>) | undefined;

const VOICE_DEBUG_ENABLED =
  ((typeof import.meta !== "undefined" && Boolean((import.meta as any)?.env?.DEV)) ||
    (typeof window !== "undefined" && (window as any).__FM_VOICE_DEBUG__ === true));

function debugLog(...args: unknown[]) {
  if (!VOICE_DEBUG_ENABLED) return;
  console.log(...args);
}

type VoiceTiming = {
  id: string;
  startedAtMs: number;
  transcriptLength: number;
};

let voiceTimingSeq = 0;

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function createVoiceTiming(transcript: string): VoiceTiming {
  voiceTimingSeq += 1;
  return {
    id: `v${Date.now()}-${voiceTimingSeq}`,
    startedAtMs: nowMs(),
    transcriptLength: (transcript ?? "").length,
  };
}

function logVoiceTiming(
  timing: VoiceTiming | null | undefined,
  stage: string,
  extra?: Record<string, unknown>
) {
  if (!timing) return;
  const elapsedMs = Math.max(0, Math.round(nowMs() - timing.startedAtMs));
  const payload = {
    id: timing.id,
    stage,
    elapsedMs,
    transcriptLength: timing.transcriptLength,
    ...(extra ?? {}),
  };
  // Flache String-Ausgabe, damit in DevTools keine unlesbare [Object]-Ansicht entsteht.
  console.log(
    `[fm-voice][timing] id=${payload.id} stage=${payload.stage} elapsedMs=${payload.elapsedMs} transcriptLength=${payload.transcriptLength}`
  );
  console.log("[fm-voice][timing][json]", JSON.stringify(payload));
}

declare global {
  interface Window {
    __fm_set_mail_body?: (text: string) => void;
    __fm_set_mail_to?: (address: string) => void;
    __fm_set_mail_subject?: (subject: string) => void;
    __fm_get_mail_body?: () => string | null;
    __fm_get_mail_subject?: () => string | null;
    __fm_get_mail_to?: () => string | null;
    __fm_preview_mail?: () => void;
    __fm_send_mail_now?: () => void;
    __fm_reset_mail_draft?: () => void;
    __fm_subject_manually_edited?: boolean;
    __fm_pending_body_replace?: string | null;
    __fm_subject_locked?: boolean;
    __fm_subject_locked_value?: string | null;
    __fm_subject_lock_context_uid?: string | null;
    __fm_append_followup_pending?: { ts: number } | null;
    __fm_wizard4_last_draft?: any;
    __fm_reset_mail_flow?: () => void;
    __fm_guided_mail_context?: {
      stage: "need_recipient" | "recipient_set_choice" | "awaiting_new_text";
      bodyText: string;
      subjectHint?: string;
      recipientName?: string;
      recipientEmail?: string;
      ts: number;
    } | null;
  }
}

// Wizard4Intent global registrieren für Konsolen-Tests
(window as any).parseWizard4Intent = parseWizard4Intent;
debugLog('[fm-voice] Wizard4Intent global registriert.');
(window as any).generateWizard4Subject = generateWizard4Subject;
debugLog('[fm-voice] Wizard4Subject global registriert.');
(window as any).generateWizard4Body = generateWizard4Body;
debugLog('[fm-voice] Wizard4Body global registriert.');
(window as any).buildWizard4EmailFromInput = buildWizard4EmailFromInput;
debugLog('[fm-voice] Wizard4Email builder global registriert.');
(window as any).__fm_reset_mail_flow = resetMailVoiceFlowState;
debugLog('[fm-voice] Mail-Flow reset global registriert.');

// AutoSend 4.0 – globales Flag
const WIZARD4_AUTOSEND_ENABLED = true;
let pendingEmailSendConfirmationUntil = 0;
let allowNextEmailSendWithoutExtraConfirmationUntil = 0;

const BACKEND = backendBase();

function resetMailVoiceFlowState() {
  if (typeof window === "undefined") return;
  const w = window as any;
  pendingEmailSendConfirmationUntil = 0;
  allowNextEmailSendWithoutExtraConfirmationUntil = 0;
  w.__fm_pending_body_replace = null;
  w.__fm_guided_mail_context = null;
  w.__fm_wizard4_last_draft = null;
  w.__fm_subject_locked = false;
  w.__fm_subject_locked_value = null;
  w.__fm_subject_lock_context_uid = null;
  w.__fm_append_followup_pending = null;
  w.__fm_subject_manually_edited = false;
  w.__fm_last_hint = {
    kind: "draft_reset",
    message: "Entwurf zurückgesetzt.",
    ts: Date.now(),
  };
  if (typeof w.__fm_clear_selected_mail_context === "function") {
    try {
      w.__fm_clear_selected_mail_context();
    } catch {
      // ignore context clear failure
    }
  }
  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("fm-hint-update"));
  }
  setLastAction({ kind: "other", description: "Mail-Entwurf zurückgesetzt." });
  debugLog("[fm-voice][reset] mail + guided flow reset");
}

/**
 * Wartet bis __fm_send_mail_now am window verfügbar ist (Compose-UI gemountet).
 * @param timeoutMs Max. Wartezeit in ms (default 2000)
 * @param intervalMs Abstand zwischen Prüfungen in ms (default 150)
 * @returns Die Funktion oder null bei Timeout
 */
async function waitForSendNowFn(
  timeoutMs = 2000,
  intervalMs = 150
): Promise<null | ((...args: any) => any)> {
  if (typeof window === "undefined") return null;
  const w = window as any;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof w.__fm_send_mail_now === "function") return w.__fm_send_mail_now;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function waitForMailBodySetter(
  timeoutMs = 1500,
  intervalMs = 30
): Promise<{ setter: null | ((text: string) => void); waitedMs: number }> {
  if (typeof window === "undefined") return { setter: null, waitedMs: 0 };
  const w = window as any;
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (typeof w.__fm_set_mail_body === "function") {
      return { setter: w.__fm_set_mail_body as (text: string) => void, waitedMs: Date.now() - startedAt };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { setter: null, waitedMs: Date.now() - startedAt };
}

/**
 * Normalisiert Text für Parsing (lower, trim, spaces normalisieren, Komma/Punkt zu Space).
 */
function normalizeForParse(s: string): string {
  if (!s || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .trim()
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Extrahiert Empfängername aus Text.
 */
function extractToNameFromText(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const normalized = normalizeForParse(raw);
  // a) "an <name>" oder "für <name>"
  const match1 = normalized.match(/\b(?:an|für)\s+([a-zäöüß]+)\b/);
  if (match1 && match1[1]) return match1[1];
  // b) "schick <name>" oder "sende <name>" am Anfang
  const match2 = normalized.match(/^(?:schick|sende|send|schicks)\s+([a-zäöüß]+)\b/);
  if (match2 && match2[1]) return match2[1];
  return null;
}

/**
 * Entfernt Send-Control-Phrasen am Ende (für Body-Bereinigung).
 */
function stripSendControlPhrases(s: string): string {
  if (!s || typeof s !== "string") return s;
  let result = s.trim();
  // Send-Phrasen am Ende
  result = result.replace(/\s*(?:sofort\s+senden|direkt\s+senden|jetzt\s+senden|sofort\s+raus|schick\s+raus|schicks\s+raus|rausschicken|abschicken)[\s,.:;!?-]*$/i, "").trim();
  // Cancel-Phrasen am Ende
  result = result.replace(/\s*(?:doch\s+nicht|ach\s+nein|lieber\s+doch\s+nicht|besser\s+doch\s+nicht|ne\s+doch\s+nicht)[\s,.:;!?-]*$/i, "").trim();
  return result;
}

/** Entfernt führende Satzzeichen und Leerzeichen vom Append-Text. */
function normalizeAppend(s: string): string {
  if (!s || typeof s !== "string") return "";
  return s.trim().replace(/^[.,:;\s-]+/, "").trim();
}

// FM PATCH: Nur bei leerem Body den ersten alphabetischen Buchstaben im Append groß setzen.
function normalizeAppendWhenBodyEmpty(currentBody: string, appendText: string): string {
  const cur = (currentBody ?? "").toString();
  const add = (appendText ?? "").toString();
  if (cur.trim().length !== 0) return add;
  const trimmedLeading = add.replace(/^\s+/, "");
  const firstLetterMatch = /[A-Za-zÄÖÜäöüß]/.exec(trimmedLeading);
  if (!firstLetterMatch || firstLetterMatch.index < 0) return trimmedLeading;
  const i = firstLetterMatch.index;
  return trimmedLeading.slice(0, i) + trimmedLeading.charAt(i).toUpperCase() + trimmedLeading.slice(i + 1);
}

// FM PATCH: Expliziten Betreff von trailing Empfängernamen bereinigen ("Rückruf Thomas" -> "Rückruf").
function cleanupSubjectTrailingRecipient(subject: string, toName?: string): string {
  const subjRaw = (subject ?? "").toString().trim();
  const toRaw = (toName ?? "").toString().trim();
  if (!subjRaw || !toRaw) return subjRaw;

  const stripTailPunct = (s: string) => s.replace(/[\s.,:;\-]+$/g, "").trim();
  const subj = stripTailPunct(subjRaw);
  const name = stripTailPunct(toRaw);
  if (!subj || !name) return subjRaw;

  const subjLower = subj.toLowerCase();
  const nameLower = name.toLowerCase();
  if (!subjLower.endsWith(nameLower)) return subjRaw;

  const cutAt = subj.length - name.length;
  if (cutAt < 0) return subjRaw;
  if (cutAt > 0) {
    const prev = subj.charAt(cutAt - 1);
    if (prev !== " " && prev !== "\t") return subjRaw;
  }

  const cleaned = stripTailPunct(subj.slice(0, cutAt));
  return cleaned || subjRaw;
}

// FM PATCH: Expliziten Betreff aus aktuellem Compose-SourceText extrahieren.
function extractExplicitSubjectFromComposeSource(sourceText: string): string {
  const src = (sourceText ?? "").toString();
  if (!src.trim()) return "";
  const m = /\bbetreff\b/i.exec(src);
  if (!m || m.index == null) return "";
  let rest = src.slice(m.index + m[0].length).trim();
  rest = rest.replace(/^[:\-–—\s]+/, "").trim();
  if (!rest) return "";
  const bodyStarters = new Set(["hi", "hallo", "hey", "moin", "servus", "guten", "hier", "ich"]);
  const tokens = rest.split(/\s+/).filter(Boolean);
  const subjectTokens: string[] = [];
  for (const rawToken of tokens) {
    const token = rawToken.replace(/^[`"'„“‚‘]+|[`"'„“‚‘]+$/g, "").trim();
    if (!token) continue;
    const lower = token.toLowerCase();
    if (subjectTokens.length > 0 && bodyStarters.has(lower)) break;
    const endsSentence = /[.!?]+$/.test(token);
    const cleanedToken = token.replace(/[.!?]+$/g, "").trim();
    if (cleanedToken) subjectTokens.push(cleanedToken);
    if (endsSentence) break;
    if (subjectTokens.length >= 8) break;
  }
  return subjectTokens.join(" ").replace(/[,:;\-–—]+$/g, "").trim();
}

/** Fügt appendText nahtlos an current Body an (keine Extra-Leerzeilen). */
function mergeBodies(current: string, add: string): string {
  const currentTrimRight = (current ?? "").replace(/[ \t]+$/g, "");
  const addTrimLeft = (add ?? "").replace(/^\s+/, "").trim();
  if (!currentTrimRight) return addTrimLeft;
  let base: string;
  if (currentTrimRight.endsWith("\n\n")) {
    base = currentTrimRight.replace(/\n\n+$/, "\n") + addTrimLeft;
  } else if (currentTrimRight.endsWith("\n")) {
    base = currentTrimRight + addTrimLeft;
  } else if (/[.!?]$/.test(currentTrimRight)) {
    base = currentTrimRight + "\n" + addTrimLeft;
  } else {
    base = currentTrimRight + " " + addTrimLeft;
  }
  return base.replace(/\n{3,}/g, "\n\n").replace(/ \n/g, "\n");
}

/**
 * Bereinigt Body-Text aus email-send Intent (entfernt "An <name>", Send-Phrasen, etc.).
 */
function cleanBodyFromEmailSend(raw: string, toName?: string | null): string {
  if (!raw || typeof raw !== "string") return "Ich melde mich gleich.";
  let body = raw.trim();
  if (!toName || typeof toName !== "string") toName = null;
  const escapedName = toName ? toName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  // Entferne vorne: "an <name>", "für <name>", "<name>", "schick an <name>", "sende an <name>"
  if (escapedName) {
    body = body.replace(new RegExp(`^an\\s+${escapedName}\\b[:,]?\\s*`, "i"), "").trim();
    body = body.replace(new RegExp(`^für\\s+${escapedName}\\b[:,]?\\s*`, "i"), "").trim();
    body = body.replace(new RegExp(`^${escapedName}\\b[:,]?\\s*`, "i"), "").trim();
    body = body.replace(new RegExp(`^schick(?:'s)?\\s+(?:das\\s+)?(?:direkt\\s+)?an\\s+${escapedName}\\b[:,]?\\s*`, "i"), "").trim();
    body = body.replace(new RegExp(`^sende\\s+(?:das\\s+)?(?:direkt\\s+)?an\\s+${escapedName}\\b[:,]?\\s*`, "i"), "").trim();
  }
  // Entferne Send-Phrasen am Ende
  body = stripSendControlPhrases(body);
  // Entferne doppelte "bitte"
  body = body.replace(/\b(bitte)(\s+bitte)+\b/gi, "bitte");
  // Trim, entferne führende Komma/Punkt/Space, entferne doppelte Spaces
  body = body.trim().replace(/^[,.\s]+/, "").replace(/\s+/g, " ").trim();
  if (!body || body.length === 0) return "Ich melde mich gleich.";
  return body;
}

/**
 * Entfernt Send-Control-Phrasen am Anfang/Ende des Textes (für Degrade-SourceText).
 */
function stripSendControlsFromText(t: string): string {
  if (!t || typeof t !== "string") return t;
  let s = t.trim();
  const patterns = [
    /^\s*(?:sofort|direkt|jetzt)\s+senden\b[\s,.:;!?-]*/gi,
    /[\s,.:;!?-]*(?:sofort|direkt|jetzt)\s+senden\s*$/gi,
    /^\s*sofort\s+raus\b[\s,.:;!?-]*/gi,
    /[\s,.:;!?-]*sofort\s+raus\s*$/gi,
    /^\s*schick(?:s|'s)?\s+raus\b[\s,.:;!?-]*/gi,
    /[\s,.:;!?-]*schick(?:s|'s)?\s+raus\s*$/gi,
  ];
  for (const p of patterns) {
    s = s.replace(p, "").trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Erzeugt aus einem email-send Intent ein email-compose Intent (Preview-only, kein Versand).
 * Wird verwendet, wenn __fm_send_mail_now nicht verfügbar ist.
 */
function degradeEmailSendToCompose(intent: any): VoiceIntent {
  const toRaw = intent?.toRaw ?? intent?.toName ?? intent?.recipientName ?? undefined;
  const to = intent?.to ?? intent?.toEmail ?? undefined;
  const subjectHint = (intent?.subjectHint as string) ?? "Kurze Info";
  let bodyText = intent?.bodyHint ?? intent?.meta?.bodyHint ?? intent?.body ?? intent?.meta?.body ?? "";
  if (typeof bodyText !== "string") bodyText = "";
  if (!bodyText.trim()) {
    const fallback = intent?.sourceText ?? intent?.originalText ?? intent?.rawText ?? "";
    bodyText = typeof fallback === "string" ? fallback : "";
  }
  const cleanedSource = stripSendControlsFromText(intent?.sourceText ?? intent?.rawText ?? intent?.originalText ?? "");
  const meta: any = {
    autoSend: false,
    source: "email-send-degrade",
    forcePreviewOnly: true,
    sendModeOverride: "previewOnly",
    bodyHint: bodyText,
  };
  const out: any = {
    type: "email-compose",
    toRaw,
    to,
    subjectHint,
    bodyHint: bodyText || undefined,
    bodyHintRaw: bodyText || undefined,
    meta,
    sourceText: cleanedSource,
    originalText: cleanedSource,
    rawText: cleanedSource,
  };
  return out as VoiceIntent;
}

/**
 * Helper-Funktion: Entfernt führendes "an <name>" mit optionalen Artikeln und Satzzeichen.
 * Nur am Anfang (^), case-insensitive.
 * @param body - Body-Text, der bereinigt werden soll
 * @param recipientHints - Array von möglichen Empfängernamen (toRaw, resolvedToName, etc.)
 * @returns Bereinigter Body-Text
 */
function stripLeadingAnRecipient(body: string, recipientHints: string[]): string {
  if (!body || typeof body !== 'string') {
    return body || '';
  }

  if (!recipientHints || recipientHints.length === 0) {
    return body;
  }

  // Prüfe jeden möglichen Empfängernamen
  for (const hint of recipientHints) {
    if (!hint || typeof hint !== 'string') continue;
    
    const name = hint.trim();
    if (!name) continue;

    // Escapen von Sonderzeichen im Namen für Regex
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Entferne "an <name>" oder "an dem/den/die <name>" mit optionalen Satzzeichen
    // Pattern 1: Mit Leerzeichen nach Satzzeichen (z.B. "An Thomas. Bitte...")
    const pattern1 = new RegExp(`^an\\s+(?:dem\\s+|den\\s+|die\\s+)?${escapedName}\\s*[\\.:,\\-]?\\s+`, 'i');
    let cleaned = body.replace(pattern1, '').trim();

    // Pattern 2: Ohne Leerzeichen nach Satzzeichen (z.B. "an thomas. Bitte...")
    const pattern2 = new RegExp(`^an\\s+(?:dem\\s+|den\\s+|die\\s+)?${escapedName}[\\.:,\\-]\\s*`, 'i');
    cleaned = cleaned.replace(pattern2, '').trim();

    // Wenn etwas entfernt wurde, gib das Ergebnis zurück
    if (cleaned !== body) {
      return cleaned;
    }
  }

  return body;
}

/**
 * Extrahiert eine E-Mail-Adresse aus einem Text per Regex.
 * Gibt die erste gefundene E-Mail-Adresse zurück oder null.
 */
function extractEmailFromText(text: string): string | null {
  if (!text) return null;
  const t = String(text).trim();

  // 1) Standard-Regex: findet saubere E-Mail direkt im Text
  const m = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (m && m[0]) return m[0];

  // 2) TLD-Cut-Fallback: schneidet alles nach bekannten TLDs ab
  // Beispiel: "freiraumberatung@web.deine" -> "freiraumberatung@web.de"
  const lower = t.toLowerCase();
  const tlds = ['.de', '.com', '.net', '.org', '.eu', '.io'];

  const atPos = lower.indexOf('@');
  if (atPos < 1) return null;

  // nur ein begrenztes Fenster betrachten, damit keine riesigen Texte matchen
  const window = lower.slice(0, Math.min(lower.length, atPos + 64));

  let bestEnd = -1;
  for (const tld of tlds) {
    const idx = window.indexOf(tld, atPos);
    if (idx !== -1) {
      const end = idx + tld.length;
      if (end > bestEnd) bestEnd = end;
    }
  }

  if (bestEnd !== -1) {
    const candidate = t.slice(0, bestEnd);
    return candidate.trim();
  }

  return null;
}

/**
 * Prüft, ob eine E-Mail-Adresse strict gültig ist.
 * Verwendet eine solide Basis-Validierung für unsere Zwecke.
 */
function isStrictValidEmail(email: string): boolean {
  if (!email) return false;
  const e = email.trim();
  // sehr solide Basis-Validierung für unsere Zwecke
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

/**
 * FIX 2: Formatiert E-Mail-Body, um sicherzustellen, dass nach "Hi Name," eine Leerzeile kommt.
 * Wird NUR für Status-Brain Bodies verwendet, nicht für Free-Dictation.
 * 
 * @param body - E-Mail-Body Text
 * @returns Formatierten Body mit korrekter Leerzeile nach Greeting
 */
function formatGreetingBody(body: string): string {
  if (!body || typeof body !== 'string') {
    return body || '';
  }

  // Pattern 1: "Hi Name,\n..." -> "Hi Name,\n\n..." (wenn nur ein \n, füge ein weiteres hinzu)
  // Pattern 2: "Hi,\n..." -> "Hi,\n\n..." (wenn nur ein \n, füge ein weiteres hinzu)
  // Pattern 3: "Hi Name, " (mit Space statt \n) -> "Hi Name,\n\n"
  // Pattern 4: "Hi, " (mit Space statt \n) -> "Hi,\n\n"
  
  let formatted = body;

  // Ersetze "Hi Name,\n" durch "Hi Name,\n\n" (wenn nicht bereits \n\n vorhanden)
  // Regex: Match "Hi Name," oder "Hi," gefolgt von einem \n, aber nicht \n\n
  const greetingWithName = /^(Hi\s+[^,\n]+,)\s*\n(?!\n)/m;
  const greetingShort = /^(Hi,)\s*\n(?!\n)/m;

  if (greetingWithName.test(formatted)) {
    formatted = formatted.replace(greetingWithName, '$1\n\n');
  } else if (greetingShort.test(formatted)) {
    formatted = formatted.replace(greetingShort, '$1\n\n');
  } else {
    // Fallback: "Hi Name, " (mit Space) -> "Hi Name,\n\n"
    const greetingWithNameSpace = /^(Hi\s+[^,\n]+,)\s+/m;
    const greetingShortSpace = /^(Hi,)\s+/m;
    
    if (greetingWithNameSpace.test(formatted)) {
      formatted = formatted.replace(greetingWithNameSpace, '$1\n\n');
    } else if (greetingShortSpace.test(formatted)) {
      formatted = formatted.replace(greetingShortSpace, '$1\n\n');
    }
  }

  return formatted;
}

/**
 * Zentrale Funktion zur Erkennung expliziter SendNow-Befehle mit Guards gegen False-Positives.
 * Erweitert um Imperativ-Phrasen wie "sende ...", "schick ...", "lass ... wissen", etc.
 */
function isExplicitSendNowCommand(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  // ============================================================
  // GUARD: False-Positive Detection - MUST be checked FIRST
  // ============================================================
  const falsePositivePatterns = [
    /\b(ich|wir)\s+(sende|send|senden|schicke|schicken)\b/i,
    /\b(ich|wir)\s+(werde|wollen|wollten)\s+(senden|schicken)\b/i,
    /\b(bitte\s+)?an\s+mich\s+(senden|schicken)\b/i,
    /\b(bitte\s+)?mir\s+(senden|schicken)\b/i,
    /\b(sende|schick|schicke)\s+(dir|mir|uns|ihr|euch)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(normalized)) {
      console.log("[autosend] excluded false-positive:", pattern);
      return false;
    }
  }

  if (
    /\b(kannst|könntest|würdest|kann|könnte|würde)\s+du\s+.*\b(senden|schicken)\b/i.test(normalized) &&
    !isPoliteAssistantMailCommand(normalized)
  ) {
    console.log("[autosend] excluded false-positive: kannst-du senden");
    return false;
  }

  // ============================================================
  // Exact phrase matches (fast check) - bestehende Patterns
  // ============================================================
  const autoSendPhrases = [
    "schick sie direkt raus",
    "schick die nachricht direkt los",
    "sende sie direkt raus",
    "sende die nachricht sofort raus",
    "schick sie sofort los",
    "schick die email direkt raus",
    "sende sie dann auch direkt zu ihm",
    "sende sie dann auch direkt zu ihr",
    "schick sie dann auch direkt zu ihm",
    "schick sie dann auch direkt zu ihr",
    "und schick sie direkt raus",
    "und schicke sie direkt raus",
    "und schick es direkt raus",
    "und schicke es direkt raus",
    "und schicke es dann auch direkt los",
    "und schick es dann auch direkt los",
    "und schick sie dann auch direkt los",
    "und schicke sie dann auch direkt los",
    "und sende sie dann auch direkt zu ihm",
    "und sende sie direkt zu ihm",
    "und sende sie direkt an ihn",
    "und sende die email sofort raus",
    "und sende die mail sofort raus",
    "schick sie sofort raus",
    "schicke sie sofort raus",
    "schick die mail sofort raus",
    "schick die nachricht sofort raus",
    "direkt rausschicken",
    "sende die mail direkt raus",
    "sende die nachricht direkt raus",
    "schick sie los",
    "schick die nachricht los",
    "schick die mail los",
    "und schick sie los",
    "und sende sie los",
    "einfach direkt senden",
    "bitte direkt rausschicken",
    "schick die sofort raus",
    "schick sofort raus",
    "schick direkt raus",
    "direkt raushauen",
    "direkt losschicken",
    "hau raus",
    "schick die nachricht direkt los",
    "schick die mail direkt los",
    "schick sie direkt los",
    "direkt raus",
    "sofort raus",
    "sofort senden",
    "direkt senden",
    "bitte abschicken",
    "nachricht direkt los",
    "nachricht direkt raus",
    "mail direkt raus",
    "ohne vorschau senden",
  ];

  for (const phrase of autoSendPhrases) {
    if (normalized.includes(phrase)) {
      console.log("[autosend] matched exact phrase:", phrase);
      return true;
    }
  }

  // ============================================================
  // Extended regex patterns - bestehende Patterns
  // ============================================================
  const extendedPatterns = [
    /\bsende\s+sie\s+direkt\b/i,
    /\bsende\s+sie\s+dann\s+direkt\b/i,
    /\bsende\s+sie\s+direkt\s+zu\s+(?:ihm|ihr)\b/i,
    /\bsende\s+die\s+nachricht\s+direkt\b/i,
    /\bsende\s+es\s+direkt\b/i,
    /\bsende\s+es\s+jetzt\s+direkt\b/i,
    /\bschicke\s+es\s+direkt\b/i,
    /\bschicke\s+sie\s+direkt\b/i,
  ];

  for (const pattern of extendedPatterns) {
    if (pattern.test(normalized)) {
      console.log("[autosend] matched extended pattern");
      return true;
    }
  }

  // ============================================================
  // NEW: Imperative send/notify phrases
  // ============================================================
  // Check if text is in imperative context
  const isImperativeContext = (txt: string): boolean => {
    if (/^(sende|send|senden|schick|schicke|lass)\b/i.test(txt)) {
      return true;
    }
    if (/\b(bitte\s+)?(sende|send|senden|schick|schicke)\b/i.test(txt) || 
        /\b(sende|send|senden|schick|schicke)\s+bitte\b/i.test(txt)) {
      return true;
    }
    if (/\blass\s+uns\b/i.test(txt)) {
      return true;
    }
    return false;
  };

  // Imperative "sende/send/senden"
  if (isImperativeContext(normalized)) {
    const imperativeSendPatterns = [
      /\b(sende|send|senden)\s+(?:bitte\s+)?folgende\s+(?:nachricht|mail|email|e-mail)\b/i,
      /\b(sende|send|senden)\s+bitte\s+(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\b/i,
      /\b(sende|send|senden)\s+(?:bitte\s+)?(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\s+(?:direkt|sofort|jetzt)\b/i,
      /\b(sende|send|senden)\b.*\b(?:direkt|sofort|jetzt)\s+(?:raus|ab|los)\b/i,
      /\b(sende|send|senden)\b.*\b(?:direkt|sofort|jetzt)\b/i,
    ];

    for (const pattern of imperativeSendPatterns) {
      if (pattern.test(normalized)) {
        console.log("[autosend] matched imperative send pattern");
        return true;
      }
    }
  }

  // Imperative "schick/schicke"
  if (isImperativeContext(normalized)) {
    const imperativeSchickPatterns = [
      /\b(schick|schicke)\s+(?:bitte\s+)?folgende\s+(?:nachricht|mail|email|e-mail)\b/i,
      /\b(schick|schicke)\s+bitte\s+(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\b/i,
      /\b(schick|schicke)\s+(?:bitte\s+)?(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\s+(?:direkt|sofort|jetzt)\b/i,
      /\b(schick|schicke)\b.*\b(?:direkt|sofort|jetzt)\s+(?:raus|ab|los)\b/i,
    ];

    for (const pattern of imperativeSchickPatterns) {
      if (pattern.test(normalized)) {
        console.log("[autosend] matched imperative schick pattern");
        return true;
      }
    }
  }

  // Pattern: "lass <name> wissen" / "lass <name> bitte wissen" / ASR "las"
  const lassWissenPattern = /\bla(?:ss|s)\s+([a-zäöüß]+)\s+(?:bitte\s+|schnell\s+|mal\s+eben\s+)?wissen\b/i;
  if (lassWissenPattern.test(normalized)) {
    console.log("[autosend] matched 'lass <name> wissen' pattern");
    return true;
  }
  if (isColloquialNotifySendPhrase(text) || isColloquialNotifySendPhrase(normalized)) {
    console.log("[autosend] matched colloquial notify phrase");
    return true;
  }

  // Pattern: "lass uns ... senden/abschicken/rausschicken"
  const lassUnsSendenPattern = /\blass\s+uns\b.*\b(senden|abschicken|rausschicken|verschicken)\b/i;
  if (lassUnsSendenPattern.test(normalized)) {
    console.log("[autosend] matched 'lass uns ... senden' pattern");
    return true;
  }

  // Pattern: "sende/schick ... direkt raus / sofort / jetzt"
  const direktSofortPatterns = [
    /\b(sende|schick|schicke)\b.*\b(?:direkt|sofort|jetzt)\s+(?:raus|ab|los)\b/i,
    /\b(sende|schick|schicke)\s+(?:bitte\s+)?(?:folgende|die)\s+(?:nachricht|mail|email|e-mail)\s+(?:direkt|sofort|jetzt)\b/i,
  ];

  for (const pattern of direktSofortPatterns) {
    if (pattern.test(normalized)) {
      console.log("[autosend] matched 'direkt/sofort' pattern");
      return true;
    }
  }

  return false;
}

/**
 * Prüft, ob im sourceText eine klare "Sofort senden"-Phrase vorkommt.
 * Nur wenn eine dieser Phrasen enthalten ist, erlauben wir sendMode = "sendNow".
 * 
 * Delegiert an isExplicitSendNowCommand für konsistente Erkennung.
 */
function shouldSendNowFromSourceText(sourceText?: string): boolean {
  if (!sourceText) return false;
  if (isExplicitSendNowCommand(sourceText)) {
    return true;
  }
  // Umgangssprachlicher Reply-Trigger im aktiven Kontext:
  // "Antwort direkt ...", "Antworte sofort ...", "Antwortet jetzt ..."
  // wird wie ein expliziter SendNow-Wunsch behandelt.
  const normalized = sourceText.trim().toLowerCase().replace(/\s+/g, " ");
  // „Antwort ist sofort/direkt/jetzt“ (ASR) gleichwertig zu „Antwort sofort …“
  return /^\s*antwort(?:e|et|en)?(?:\s+ist)?\s*[\s,.:;!?-]*(direkt|sofort|jetzt)\b/.test(
    normalized
  );
}

function normalizeTranscriptForRouting(transcript: string): string {
  const raw = (transcript ?? "").toString();
  if (!raw.trim()) return raw;
  let normalized = raw.trim();

  // ASR-Aliase für Bearbeitungsbefehle im Composer.
  // Nur am Kommandoanfang normalisieren, um Freitext nicht zu verfälschen.
  normalized = normalized
    .replace(/^\s*ersätze\b/i, "ersetze")
    .replace(/^\s*(?:bitte\s+)?(?:lösch|loesch|losch)e?\s*satz\b/i, (m) =>
      m.replace(/e?\s*satz\b/i, " satz")
    )
    .replace(/^\s*(?:bitte\s+)?(?:lösch|loesch|losch)e?\s*esatz\b/i, (m) =>
      m.replace(/e?\s*esatz\b/i, " satz")
    )
    .replace(/^\s*(?:bitte\s+)?(?:lösch|loesch|losch)\s*atz\b/i, (m) =>
      m.replace(/(?:atz)\b/i, " satz")
    )
    .replace(/^\s*(?:bitte\s+)?(?:lösch|loesch|losch)satz\b/i, (m) =>
      m.replace(/satz\b/i, " satz")
    )
    .replace(/^\s*(?:bitte\s+)?(?:lösch|loesch|losch)\s+aus\b/i, (m) =>
      m.replace(/\saus\b/i, " satz")
    )
    .replace(/^\s*machaus\b/i, "mach aus")
    .replace(/^\s*mach\s+ausatz\b/i, "mach aus satz")
    .replace(/^\s*mach\s+aussatz\b/i, "mach aus satz")
    .replace(/^\s*aussatz\s+(\d{1,2})\b/i, "aus satz $1")
    .replace(/^\s*ausatz\s+(\d{1,2})\b/i, "aus satz $1")
    .replace(/^\s*ersetzte\b/i, "ersetze")
    .replace(/^\s*aendere\b/i, "ändere")
    .replace(/^\s*andere\b(?=\s+(?:im|den)\s+betreff\b)/i, "ändere")
    .replace(/^\s*ander\b(?=\s+(?:im|den)\s+betreff\b)/i, "ändere")
    .replace(/^\s*änder\s+im\s+betreff\b/i, "ändere im betreff")
    .replace(/^\s*ändere\s+im\s+betreff\b/i, "ändere den betreff")
    .replace(/^\s*(?:bitte\s+)?(?:im|den)\s+betreff\b/i, "ändere den betreff")
    .replace(/^\s*neue\s+texte?\b/i, "neuer text")
    .replace(/^\s*neuer\s+texte\b/i, "neuer text")
    .replace(/^\s*zenden\b/i, "senden");

  // ASR: „folgende Nachricht am Peter“ ≈ „folgende Nachricht an Peter“
  normalized = normalized.replace(/\bfolgende\s+nachricht\s+am\b/gi, "folgende nachricht an");

  // ASR: „Antwort ist direkt/sofort/jetzt …“ → „Antwort direkt|sofort|jetzt …“ (Komma/Zeilenumbruch nach Adverb bleiben)
  normalized = normalized.replace(
    /^\s*antwort(?:e|et|en)?\s+ist\s+(direkt|sofort|jetzt)(\b[\s,.:;!?-]*)/i,
    (_m, adv: string, tail: string) => `Antwort ${String(adv).toLowerCase()}${tail}`
  );

  // ASR-Korrektur für Reply-Befehle:
  // "Worte direkt/sofort/jetzt ..." -> "Antwort direkt/sofort/jetzt ..."
  normalized = normalized.replace(
    /^\s*worte?\b(?=\s+(direkt|sofort|jetzt)\b)/i,
    "Antwort"
  );
  // "im betreff X durch Y" -> expliziter Replace-Part-Befehl,
  // damit es nicht in allgemeine Compose-Fallbacks kippt.
  normalized = normalized.replace(
    /^\s*im\s+betreff\s+(.+?)\s+durch\s+(.+)\s*$/i,
    (_m, fromPart: string, toPart: string) =>
      `ersetze im betreff ${String(fromPart).trim()} durch ${String(toPart).trim()}`
  );
  normalized = normalized.replace(
    /^\s*ändere\s+den\s+betreff\s+(.+?)\s+durch\s+(.+)\s*$/i,
    (_m, fromPart: string, toPart: string) =>
      `ersetze im betreff ${String(fromPart).trim()} durch ${String(toPart).trim()}`
  );
  normalized = normalized.replace(
    /^\s*im\s+betreff\s+(.+?)\s+zu\s+(.+)\s*$/i,
    (_m, fromPart: string, toPart: string) =>
      `ersetze im betreff ${String(fromPart).trim()} durch ${String(toPart).trim()}`
  );
  normalized = normalized.replace(
    /^\s*ändere\s+(?:im|den)\s+betreff\s+(.+?)\s+zu\s+(.+)\s*$/i,
    (_m, fromPart: string, toPart: string) =>
      `ersetze im betreff ${String(fromPart).trim()} durch ${String(toPart).trim()}`
  );
  return normalized;
}

function isComposerPriorityIntentType(type: VoiceIntent["type"]): boolean {
  return [
    "email-send",
    "mail-body-clear",
    "mail-draft-reset",
    "email-subject-set",
    "email-subject-append",
    "email-subject-clear",
    "email-subject-replace",
    "email-subject-replace-part",
    "email-body-replace-all",
    "email-body-delete-last-sentence",
    "sentence-delete-last-n",
    "sentence-delete-nth",
    "sentence-insert-nth",
    "sentence-replace-first",
    "sentence-replace-last",
    "sentence-replace-nth",
    "sentence-replace-n",
    "email-body-replace-first-sentence",
  ].includes(type);
}

function isLikelyNoiseUtterance(input: string): boolean {
  const raw = (input ?? "").toString().trim();
  if (!raw) return true;
  const alnum = raw.replace(/[^A-Za-z0-9ÄÖÜäöüß]/g, "");
  if (alnum.length <= 1) return true;
  return false;
}

function isLikelyMisheardComposerCommand(input: string): boolean {
  const text = (input ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;
  return [
    /^löschersatz\b/,
    /^loeschersatz\b/,
    /^loschersatz\b/,
    /^ersätze\s+satz\b/,
    /^ersaetze\s+satz\b/,
    /^löschersatz\s+\d{1,2}\b/,
  ].some((pattern) => pattern.test(text));
}

function isLikelyUnclearComposeFallbackInContext(input: string): boolean {
  const text = (input ?? "").toString().trim();
  if (!text) return false;
  const normalized = text.replace(/["'`„“‚‘]/g, "").trim();
  const compact = normalized.toLowerCase().replace(/\s+/g, " ");
  if (!compact || compact.length > 28) return false;
  if (/^(antwort(?:e|et|en)?|direkt|sofort|jetzt)\b/.test(compact)) return false;
  if (
    /^(?:text|mailtext|mail text)\s+(?:löschen|loeschen|loschen)\b/.test(compact) ||
    /^(?:textlöschen|textloeschen|textloschen)\b/.test(compact)
  ) {
    return false;
  }
  if (/^(?:schiss|schiess|schieß)\s+satz\s+\d{1,2}\b/.test(compact)) return true;
  if (/^(?:kein\s+)?neuer\s+text\b/.test(compact)) return true;
  if (
    /\bsatz\s+\d{1,2}\b/.test(compact) &&
    !/\b(?:ersetz|ersätz|ersaetz|durch|lösch|loesch|losch|mach|aus)\b/.test(compact)
  ) {
    return true;
  }
  return false;
}

function normalizeContextDirectReplyTranscript(input: string): string {
  const raw = (input ?? "").toString().trim();
  if (!raw) return raw;
  if (/^\s*(?:direkt|sofort|jetzt)\b[\s,.:;!?-]+\S/i.test(raw)) {
    return `Antwort ${raw}`;
  }
  return raw;
}

function isMiniCommandIntentType(type: VoiceIntent["type"]): boolean {
  return [
    "mail-body-clear",
    "mail-draft-reset",
    "email-send",
    "email-subject-set",
    "email-subject-append",
    "email-subject-clear",
    "email-subject-replace",
    "email-subject-replace-part",
    "email-body-replace-all",
    "email-body-delete-last-sentence",
    "sentence-delete-last-n",
    "sentence-delete-nth",
    "sentence-insert-nth",
    "sentence-replace-first",
    "sentence-replace-last",
    "sentence-replace-nth",
    "sentence-replace-n",
    "email-body-replace-first-sentence",
  ].includes(type);
}

function isLikelyMiniCommandText(input: string): boolean {
  const text = (input ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;
  if (text.length <= 42) {
    if (
      /^(?:text|satz)\s+(?:löschen|loeschen|loschen)\b/.test(text) ||
      /^(?:lösche|loesche|losche)\s+satz\s+\d{1,2}\b/.test(text) ||
      /^aus\s+satz\s+\d{1,2}\b/.test(text) ||
      /^betreff\s+(?:löschen|loeschen|loschen)\b/.test(text)
    ) {
      return true;
    }
  }
  return false;
}

type ContactAmbiguityChoice = {
  index: number;
  displayName: string;
  email: string;
  label: string;
};

function parseAmbiguousContactChoiceIndex(input: string, maxChoices: number): number | null {
  const text = (input ?? "").toString().trim().toLowerCase();
  if (!text || maxChoices <= 0) return null;
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const patterns: Array<[RegExp, number]> = [
    [/\b(?:kontakt|person|nummer)\s*(?:nr\.?\s*)?1\b/, 1],
    [/\b(?:kontakt|person|nummer)\s*(?:nr\.?\s*)?2\b/, 2],
    [/\b(?:kontakt|person|nummer)\s*(?:nr\.?\s*)?3\b/, 3],
    [/\b(?:erste|erster|erstes)(?:\s+person)?\b/, 1],
    [/\b(?:zweite|zweiter|zweites)(?:\s+person)?\b/, 2],
    [/\b(?:dritte|dritter|drittes)(?:\s+person)?\b/, 3],
  ];
  for (const [re, n] of patterns) {
    if (re.test(normalized)) return n <= maxChoices ? n : null;
  }
  return null;
}

function extractFirstEmailAddress(input: string): string | null {
  const match = (input ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.trim().toLowerCase() || null;
}

function isAmbiguousChoiceSelectionAttempt(input: string): boolean {
  const text = (input ?? "").toString().toLowerCase();
  if (!text.trim()) return false;
  if (/@/.test(text)) return true;
  return /\b(?:kontakt|person|nummer|erste|erster|erstes|zweite|zweiter|zweites|dritte|dritter|drittes)\b/.test(text);
}

function resolveMiniCommandIntentFromText(input: string): VoiceIntent | null {
  const text = (input ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  if (
    /^(?:text|mailtext|mail text)\s+(?:löschen|loeschen|loschen)\.?$/.test(text) ||
    /^(?:textlöschen|textloeschen|textloschen)\.?$/.test(text) ||
    /^(?:lösche|loesche|losche)\s+(?:den\s+)?(?:text|mailtext|mail text)\b/.test(text)
  ) {
    return { type: "mail-body-clear" };
  }

  if (/^betreff\s+(?:löschen|loeschen|loschen)\.?$/.test(text)) {
    return { type: "email-subject-clear", payload: {} };
  }

  return null;
}

function isLikelyTruncatedDictation(text?: string): boolean {
  const value = (text ?? "").toString().trim();
  if (!value) return false;
  if (value.length < 80) return false;
  return value.endsWith("...") || value.endsWith("…");
}

function getDynamicPolishTimeoutMs(mode: "sendNow" | "previewOnly", bodyLength: number): number {
  const len = Math.max(0, bodyLength | 0);
  if (mode === "sendNow") {
    if (len <= 120) return 5000;
    if (len <= 300) return 12000;
    if (len <= 700) return 22000;
    return 30000;
  }
  if (len <= 120) return 3000;
  if (len <= 300) return 6000;
  return 10000;
}

function normalizeFallbackBodyForSend(rawBody: string): string {
  const input = (rawBody ?? "").toString();
  if (!input.trim()) return input;
  let out = normalizeEmailBodyAfterPolish(input);
  out = stripLeadingFillerWords(out);
  out = ensureTerminalPunctuation(out);
  return out.trim();
}

const LONG_DICTATION_POLISH_THRESHOLD = 260;
const LONG_DICTATION_POLISH_TIMEOUT_CAP_SEND_NOW_MS = 12000;
const LONG_DICTATION_POLISH_TIMEOUT_CAP_PREVIEW_MS = 7000;
const VERY_LONG_DICTATION_POLISH_THRESHOLD = 430;
const VERY_LONG_DICTATION_POLISH_TIMEOUT_CAP_SEND_NOW_MS = 15000;
const VERY_LONG_DICTATION_POLISH_TIMEOUT_CAP_PREVIEW_MS = 10000;

function getPolishRuntimeProfile(mode: "sendNow" | "previewOnly", bodyLength: number) {
  const len = Math.max(0, bodyLength | 0);
  const baseTimeoutMs = getDynamicPolishTimeoutMs(mode, len);
  const isLongDictation = len >= LONG_DICTATION_POLISH_THRESHOLD;
  const isVeryLongDictation = len >= VERY_LONG_DICTATION_POLISH_THRESHOLD;
  const modeCapMs = isVeryLongDictation
    ? (mode === "sendNow"
      ? VERY_LONG_DICTATION_POLISH_TIMEOUT_CAP_SEND_NOW_MS
      : VERY_LONG_DICTATION_POLISH_TIMEOUT_CAP_PREVIEW_MS)
    : (mode === "sendNow"
      ? LONG_DICTATION_POLISH_TIMEOUT_CAP_SEND_NOW_MS
      : LONG_DICTATION_POLISH_TIMEOUT_CAP_PREVIEW_MS);
  const timeoutMs = isLongDictation
    ? Math.min(baseTimeoutMs, modeCapMs)
    : baseTimeoutMs;
  return {
    timeoutMs,
    baseTimeoutMs,
    isLongDictation,
    isVeryLongDictation,
    shortPrompt: isLongDictation,
  };
}

function isMobileVoiceShell(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__fm_mobile_shell);
}

function isNamedComposeAwayFromOpenMail(
  intent: VoiceIntent,
  selectedContext: SelectedMailContext
): boolean {
  if (intent.type !== "email-compose") return false;
  const toEmail = String((intent as any).to || "").trim().toLowerCase();
  const openEmail = String(selectedContext.fromEmail || "").trim().toLowerCase();
  if (toEmail && openEmail && toEmail.includes("@") && toEmail !== openEmail) return true;

  const toRaw = String((intent as any).toRaw || "").trim().split(/\s+/)[0] || "";
  if (!toRaw || isInvalidRecipientToken(toRaw)) return false;
  const openName = String(selectedContext.fromName || "").trim().split(/\s+/)[0] || "";
  if (!openName) return true;
  return toRaw.toLowerCase() !== openName.toLowerCase();
}

function isHeuristicGuessedSubject(value: string): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "termin morgen" || normalized === "termin heute";
}

function isHardSendConfirmationPhrase(sourceText?: string): boolean {
  if (!sourceText) return false;
  const normalized = sourceText.trim().toLowerCase();
  const patterns = [
    /\b(jetzt|sofort|direkt)\b.*\b(senden|abschicken|rausschicken|raus|ab)\b/i,
    /\b(senden|abschicken|rausschicken)\b.*\b(jetzt|sofort|direkt)\b/i,
    /\b(wirklich|final)\b.*\b(senden|abschicken)\b/i,
  ];
  return patterns.some((re) => re.test(normalized));
}

/**
 * Prüft, ob ein Token ein ungültiger Empfänger-Name ist (Pronomen, zu kurz, etc.)
 * TASK 4: Extended to include "es" as pronoun
 */
function isInvalidRecipientToken(name: string): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim().toLowerCase();
  if (trimmed.length < 2) return true;
  const invalidTokens = ['sie', 'ihn', 'ihr', 'ihm', 'mir', 'mich', 'dir', 'dich', 'uns', 'euch', 'es', 'jemand', 'jemanden', 'irgendwen', 'irgendjemand'];
  return invalidTokens.includes(trimmed);
}

/**
 * Normalisiert wiederholte Empfängernamen.
 * Entfernt direkt aufeinanderfolgende Duplikate (case-insensitive).
 * Fallback: Wenn nach Normalisierung ein String ohne Leerzeichen entsteht,
 * der aus zwei identischen Hälften besteht, wird nur die erste Hälfte zurückgegeben.
 * 
 * @param raw - Roher Name (z.B. "Thomas Thomas" oder "thomasthomas")
 * @returns Normalisierter Name ohne Duplikate
 */
export function normalizeRepeatedRecipient(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    return raw || '';
  }

  // Trim und normalisiere Whitespace zu single spaces
  let text = raw.trim().replace(/\s+/g, ' ');

  if (!text) {
    return raw; // Defensiv: gib ursprüngliches raw zurück wenn leer
  }

  // Split in Tokens (space-separated)
  const tokens = text.split(' ').filter(Boolean);

  if (tokens.length === 0) {
    return raw; // Defensiv: gib ursprüngliches raw zurück
  }

  // Entferne direkt aufeinanderfolgende Duplikate (case-insensitive)
  const deduplicated: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i].toLowerCase();
    const previous = deduplicated.length > 0 ? deduplicated[deduplicated.length - 1].toLowerCase() : null;
    
    // Nur hinzufügen, wenn es nicht dasselbe wie das vorherige Token ist
    if (current !== previous) {
      deduplicated.push(tokens[i]); // Original-Case beibehalten
    }
  }

  // Join zurück mit single space
  const resultWithSpaces = deduplicated.join(' ').trim();

  if (!resultWithSpaces) {
    return raw; // Defensiv: gib ursprüngliches raw zurück wenn leer
  }

  // Fallback: Wenn nach finaler "clean/normalize" Verarbeitung (wo Spaces evtl. rausfliegen)
  // ein String ohne Leerzeichen entsteht, prüfe zusätzlich:
  // Wenn Länge gerade ist und firstHalf == secondHalf (case-insensitive), dann nimm firstHalf
  const withoutSpaces = resultWithSpaces.replace(/\s+/g, '');
  
  if (withoutSpaces.length > 0 && withoutSpaces.length % 2 === 0) {
    const halfLength = withoutSpaces.length / 2;
    const firstHalf = withoutSpaces.substring(0, halfLength).toLowerCase();
    const secondHalf = withoutSpaces.substring(halfLength).toLowerCase();
    
    if (firstHalf === secondHalf && firstHalf.length > 0) {
      // Gib die erste Hälfte zurück (mit Original-Case wenn möglich, sonst lowercase)
      const originalFirstHalf = resultWithSpaces.substring(0, Math.min(halfLength, resultWithSpaces.length));
      return originalFirstHalf || firstHalf;
    }
  }

  return resultWithSpaces;
}

/**
 * Bereinigt einen Namen für die Contact-Resolver-Anfrage
 * Entfernt führende Artikel/Präpositionen, nachgestellte Füllwörter, Kommata
 * Normalisiert für toleranteres Matching (z.B. "freiraum beratung" -> "freiraumberatung")
 * FIX: Entfernt auch doppelte Empfängernamen (z.B. "Thomas Thomas" -> "Thomas")
 */
function cleanNameForResolver(raw?: string | null): string | null {
  if (!raw) return null;

  // FIX: Normalisiere wiederholte Empfängernamen ZUERST
  const deduplicatedRaw = normalizeRepeatedRecipient(raw);
  const wasDeduplicated = deduplicatedRaw !== raw;

  // In Kleinbuchstaben umwandeln
  let text = deduplicatedRaw.trim().toLowerCase();

  if (!text) return null;

  // Kommata und Sonderzeichen entfernen (außer Leerzeichen)
  text = text.replace(/[,.;:!?]/g, " ");

  // Mehrfach-Spaces reduzieren
  text = text.replace(/\s+/g, " ");

  // Führende und nachgestellte Füllwörter entfernen
  const leadingStopWords = [
    "dem", "den", "der", "die", "das", "bei", "an", "am", "im", "in", "vom", "zum", "zur", "bitte",
    "folgende", "folgendes", "nachricht", "mail", "email", "e-mail",
  ];
  const trailingStopWords = [
    "eine", "einen", "ein", "ne", "nen", "kurze", "kurzen", "kurz", "mail", "email", "e-mail", "bitte",
    "folgende", "folgendes", "nachricht", "nachrichten",
  ];

  let parts = text.split(" ").filter(Boolean);

  // Vorne Stopwörter entfernen
  while (parts.length > 0 && leadingStopWords.includes(parts[0])) {
    parts.shift();
  }

  // Hinten Stopwörter entfernen
  while (parts.length > 0 && trailingStopWords.includes(parts[parts.length - 1])) {
    parts.pop();
  }

  if (parts.length === 0) {
    return null;
  }

  const cleaned = parts.join(" ").trim();
  if (!cleaned) return null;

  // Normalisierung für toleranteres Matching:
  // "freiraum beratung" -> "freiraumberatung" (Leerzeichen entfernen für besseres Matching)
  // ABER: nur wenn es ein zusammengesetzter Name ist (mehrere Wörter)
  // Für einzelne Namen wie "thomas" bleibt es bei "thomas"
  const normalizedForMatching = cleaned.replace(/\s+/g, "");

  // Log für Debugging (inkl. Deduplication-Info wenn relevant)
  const logData: any = {
    original: raw,
    cleaned: cleaned,
    normalizedForMatching: normalizedForMatching
  };
  
  if (wasDeduplicated) {
    logData.deduplicated = deduplicatedRaw;
    console.log('[fm-voice][wizard4][contact-resolver] normalized duplicates:', {
      original: raw,
      deduplicated: deduplicatedRaw
    });
  }
  
  console.log('[fm-voice][wizard4][contact-resolver] Name bereinigt:', logData);

  // Wir geben beide Varianten zurück - der Resolver kann beide versuchen
  // Für jetzt geben wir die normalisierte Version zurück (ohne Leerzeichen)
  // Das ermöglicht "freiraum beratung" -> "freiraumberatung" Matching
  return normalizedForMatching;
}

function isResolverPlaceholderName(value?: string | null): boolean {
  const raw = (value || "").toString().trim().toLowerCase();
  if (!raw) return true;
  const compact = raw.replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ").trim();
  if (!compact) return true;
  const singleToken = compact.split(" ").filter(Boolean).length === 1;
  if (
    singleToken &&
    [
      "gut",
      "morgen",
      "ja",
      "nein",
      "ok",
      "okay",
      "hallo",
      "hi",
      "hey",
      "servus",
      "moin",
      "antwort",
      "mail",
      "email",
      "nachricht",
      "text",
    ].includes(compact)
  ) {
    return true;
  }
  return [
    "folgende",
    "folgendes",
    "nachricht",
    "mail",
    "email",
    "e mail",
    "e-mail",
  ].includes(compact);
}

function extractNameAfterAn(source?: string | null): string | null {
  const text = (source || "").toString().trim();
  if (!text) return null;
  const match = text.match(/\ban\s+([^.!?,:\n]+)/i);
  if (!match?.[1]) return null;
  const rawSegment = match[1].trim();
  if (!rawSegment) return null;
  const tokens = rawSegment
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}-]/gu, "").trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const first = tokens[0];
  const second = tokens[1];
  const candidate = second && second.length > 1 ? `${first} ${second}` : first;
  const name = cleanNameForResolver(candidate);
  return name && !isResolverPlaceholderName(name) ? name : null;
}

/**
 * Extrahiert den Empfängernamen aus einem normalisierten Transcript.
 * Unterstützt umgangssprachliche Mail-Sätze auf Deutsch.
 * 
 * @param normalized - Bereits normalisierter Text (lowercase, ohne Satzzeichen)
 * @returns Extrahierter Name oder null
 */
function extractRecipientNameFromTranscript(normalized: string): string | null {
  if (!normalized || !normalized.trim()) return null;
  
  let text = normalized.trim().toLowerCase();
  
  // Entferne Satzzeichen und Kommas
  text = text.replace(/[.,;:!?]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  
  if (!text) return null;
  
  // Muster: "hau dem/den/der/die <NAME> ... mail"
  // Muster: "schreib dem/den <NAME> ... mail"
  const patterns = [
    /^(?:hau|schreib|schreibe|mach|mache)\s+(?:dem|den|der|die|das|einem|einen|an)\s+([^]+?)(?:\s+(?:ne|eine)\s+mail|\s+mail\s+|\s+e-mail|\s+email|\s+aber\s+|\s+und\s+|\s+bitte\s+|\s+nur\s+|\s+sofort\s+|\s+schick\s+)/i,
    /^(?:hau|schreib|schreibe|mach|mache)\s+(?:dem|den|der|die|das|einem|einen|an)\s+([^]+?)$/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      
      // Entferne führende Artikel/Stopwords
      name = name.replace(/^(dem|den|der|die|das|einem|einen|an)\s+/i, '');
      
      // Schneide an Konnektoren ab
      const connectors = [' aber ', ' und ', ' bitte ', ' nur ', ' sofort ', ' schick ', ' schicken ', ' raus ', ' rausschicken ', ' sie ', ' kurz ', ' kurze ', ' kurzen ', ' kurzne ', ' eben ', ' ne mail', ' eine mail', ' mail ', ' e mail ', ' e-mail ', ' email ', ' email'];
      for (const conn of connectors) {
        const idx = name.indexOf(conn);
        if (idx !== -1) {
          name = name.substring(0, idx);
        }
      }
      
      name = name.trim();
      if (name.length >= 2) {
        return name;
      }
    }
  }
  
  // Fallback: Muster "mail an <NAME>"
  const mailAnPattern = /mail\s+an\s+(?:dem|den|der|die|das|einem|einen)?\s*([^]+?)(?:\s+aber\s+|\s+und\s+|\s+bitte\s+|\s+nur\s+|\s+sofort\s+|$)/i;
  const mailAnMatch = text.match(mailAnPattern);
  if (mailAnMatch && mailAnMatch[1]) {
    let name = mailAnMatch[1].trim();
    name = name.replace(/^(dem|den|der|die|das|einem|einen)\s+/i, '');
    
    const connectors = [' aber ', ' und ', ' bitte ', ' nur ', ' sofort ', ' schick ', ' schicken ', ' raus ', ' rausschicken ', ' sie ', ' kurz ', ' kurze ', ' kurzen ', ' kurzne ', ' eben ', ' mail ', ' e mail ', ' e-mail ', ' email '];
    for (const conn of connectors) {
      const idx = name.indexOf(conn);
      if (idx !== -1) {
        name = name.substring(0, idx);
      }
    }
    
    name = name.trim();
    if (name.length >= 2) {
      return name;
    }
  }
  
  return null;
}

interface Wizard3ParseResult {
  to: string | null;
  subject: string | null;
  tone: string | null;
  bodyInstructions: string | null;
  extraInstructions: string | null;
}

export type VoiceState = "idle" | "listening" | "transcribing" | "acting" | "done" | "error";

function dispatchState(s: VoiceState) {
  document.dispatchEvent(new CustomEvent("voice-state", { detail: { state: s } }));
}

let recognition: BrowserSpeechRecognition | null = null;
let lastTranscript: string = ""; // Für Wizard4Intent-Parsing
let latestVoiceCommandRunId = 0;

function shouldUseBackendRecorder(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.__fm_backend_stt_ready);
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function getRecognition(): BrowserSpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const ctor = ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as
    | BrowserSpeechRecognitionCtor
    | undefined;
  if (!ctor) return null;
  if (!recognition) {
    recognition = new ctor();
  }
  recognition.lang = "de-DE";
  recognition.maxAlternatives = 1;
  const apple = isAppleTouchDevice();
  recognition.continuous = apple;
  recognition.interimResults = apple;
  return recognition;
}

export class VoiceController {
  state: VoiceState = "idle";
  lastText = "";
  private listening = false;
  private starting = false;
  private cancelStart = false;
  private recorderAbortController: AbortController | null = null;
  private routeStartedAtMs = 0;
  private captureMode: "none" | "backend" | "browser" = "none";
  private browserTranscript = "";

  setState(s: VoiceState) {
    this.state = s;
    dispatchState(s);
    if (s === "listening" || s === "transcribing") {
      PartnerBotBus.pose("listen");
    } else if (s === "acting") {
      PartnerBotBus.pose("speak");
    } else {
      PartnerBotBus.pose("idle");
    }
  }

  async start() {
    if (this.listening || this.starting) {
      return;
    }

    const tryBackend = shouldUseBackendRecorder();
    if (tryBackend) {
      console.warn("[fm-voice] SpeechRecognition nicht verfügbar – fallback auf Recorder.");
      this.listening = true;
      this.captureMode = "backend";
      this.setState("listening");
      const sttStartedAtMs = nowMs();
      const controller = new AbortController();
      this.recorderAbortController = controller;
      const text = await recordAndTranscribe(60000, controller.signal, {
        onListening: () => this.setState("listening"),
      });
      if (this.recorderAbortController === controller) {
        this.recorderAbortController = null;
      }
      console.log(
        `[fm-voice][timing] stage=stt-fallback-finished elapsedMs=${Math.max(0, Math.round(nowMs() - sttStartedAtMs))} textLength=${(text ?? "").length}`
      );
      this.listening = false;
      if (text) {
        this.captureMode = "none";
        this.handleTranscript(text);
        return;
      }
      this.captureMode = "none";
      const w = typeof window !== "undefined" ? (window as any) : null;
      const sttError = w?.__fm_stt_last_error ? String(w.__fm_stt_last_error) : "";
      if (w) {
        w.__fm_last_hint = {
          kind: "voice_retry",
          message:
            sttError === "microphone-unavailable"
              ? "Mikrofon wurde blockiert. Bitte antippen und den Zugriff erlauben."
              : sttError === "stt-unhealthy"
                ? "Sprache ist auf dem Server nicht bereit. Bitte später erneut versuchen."
                : "Ich habe nichts Verständliches erkannt. Bitte den Befehl kurz wiederholen.",
          ts: Date.now(),
        };
        if (typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("fm-hint-update"));
        }
      }
      this.setState(sttError === "microphone-unavailable" ? "error" : "idle");
      return;
    }

    const rec = getRecognition();
    if (!rec) {
      if (tryBackend) {
        this.setState("error");
        return;
      }
      this.listening = true;
      this.captureMode = "backend";
      this.setState("listening");
      const sttStartedAtMs = nowMs();
      const controller = new AbortController();
      this.recorderAbortController = controller;
      const text = await recordAndTranscribe(60000, controller.signal, {
        onListening: () => this.setState("listening"),
      });
      if (this.recorderAbortController === controller) {
        this.recorderAbortController = null;
      }
      console.log(
        `[fm-voice][timing] stage=stt-fallback-finished elapsedMs=${Math.max(0, Math.round(nowMs() - sttStartedAtMs))} textLength=${(text ?? "").length}`
      );
      this.listening = false;
      this.captureMode = "none";
      if (text) {
        this.handleTranscript(text);
      } else if (controller.signal.aborted) {
        this.setState("idle");
      } else {
        const w = typeof window !== "undefined" ? (window as any) : null;
        const sttError = w?.__fm_stt_last_error ? String(w.__fm_stt_last_error) : "";
        if (w) {
          w.__fm_last_hint = {
            kind: "voice_retry",
            message: sttError === "microphone-unavailable"
              ? "Mikrofon wurde blockiert. Bitte antippen und den Zugriff erlauben."
              : "Ich habe nichts Verständliches erkannt. Bitte den Befehl kurz wiederholen.",
            ts: Date.now(),
          };
          if (typeof window.dispatchEvent === "function") {
            window.dispatchEvent(new CustomEvent("fm-hint-update"));
          }
        }
        this.setState(sttError === "microphone-unavailable" ? "error" : "idle");
      }
      return;
    }

    if (this.listening || this.starting) {
      return;
    }

    this.starting = true;
    this.cancelStart = false;
    this.captureMode = "browser";
    this.browserTranscript = "";

    if (this.cancelStart) {
      this.starting = false;
      this.captureMode = "none";
      this.setState("idle");
      return;
    }

    this.listening = true;
    rec.onresult = this.handleResult;
    rec.onerror = this.handleError;
    rec.onend = this.handleEnd;

    try {
      rec.start();
      this.starting = false;
      this.setState("listening");
      debugLog("[fm-voice] recognition started");
    } catch (err) {
      console.warn("[fm-voice] recognition start failed:", err);
      this.starting = false;
      this.listening = false;
      this.captureMode = "none";
      this.setState("error");
    }
  }

  async stop() {
    if (this.starting && !this.listening) {
      this.cancelStart = true;
      this.setState("idle");
      return;
    }

    if (this.captureMode === "backend" || this.recorderAbortController) {
      const wasListening = this.listening || this.state === "listening";
      if (this.recorderAbortController) {
        this.recorderAbortController.abort();
        this.recorderAbortController = null;
      }
      this.listening = false;
      this.setState(wasListening ? "transcribing" : "idle");
      return;
    }

    const rec = getRecognition();
    if (!rec || !this.listening) {
      this.listening = false;
      this.captureMode = "none";
      this.setState("idle");
      return;
    }
    this.listening = false;
    try {
      rec.stop();
      debugLog("[fm-voice] recognition stop requested");
    } catch (err) {
      console.warn("[fm-voice] recognition stop failed:", err);
    }
  }

  private handleResult = (event: any) => {
    const results = event.results;
    if (!results || results.length === 0) return;
    let finalText = "";
    for (let i = 0; i < results.length; i += 1) {
      const piece = results[i];
      if (piece?.isFinal) {
        const next = String(piece?.[0]?.transcript || "").trim();
        if (next) finalText = finalText ? `${finalText} ${next}` : next;
      }
    }
    const last = results[results.length - 1];
    const lastText = last?.[0]?.transcript?.trim() || "";
    if (this.captureMode === "browser" && recognition?.continuous) {
      if (finalText) this.browserTranscript = finalText;
      else if (lastText) this.browserTranscript = lastText;
      return;
    }
    this.starting = false;
    this.listening = false;
    this.captureMode = "none";
    const transcript = finalText || lastText;
    if (!transcript) {
      this.setState("idle");
      return;
    }
    this.handleTranscript(transcript);
  };

  private handleError = (event: any) => {
    const errorCode = String(event?.error || "unknown");
    const errorMessage = String(event?.message || "");
    const normalizedError = errorCode.toLowerCase();
    const isBenign =
      normalizedError === "aborted" ||
      normalizedError === "no-speech" ||
      normalizedError === "network" ||
      normalizedError === "unknown";
    if (isBenign) {
      debugLog("[fm-voice] recognition transient error", {
        error: errorCode,
        message: errorMessage,
        raw: event,
      });
    } else {
      console.warn(
        `[fm-voice] recognition error code=${errorCode} message=${errorMessage || "-"}`,
        event
      );
    }
    this.starting = false;
    this.listening = false;
    this.captureMode = "none";
    if (normalizedError === "aborted" || normalizedError === "no-speech") {
      this.setState("idle");
      return;
    }
    if (normalizedError === "network" || normalizedError === "unknown") {
      recognition = null;
      this.setState("idle");
      return;
    }
    recognition = null;
    this.setState("error");
  };

  private handleEnd = () => {
    this.starting = false;
    if (this.captureMode === "browser") {
      const text = (this.browserTranscript || "").trim();
      this.browserTranscript = "";
      this.listening = false;
      this.captureMode = "none";
      if (text) {
        this.handleTranscript(text);
        return;
      }
      this.setState("idle");
      return;
    }
    if (this.listening) return;
    if (this.state === "listening") {
      this.setState("idle");
    }
  };

  private async handleTranscript(text: string) {
    this.lastText = text;
    debugLog("[fm-voice] Final transcript:", text);
    document.dispatchEvent(new CustomEvent("voice:final", { detail: { text } }));
    this.setState("transcribing");
    await this.route(text);
  }

  async route(text: string) {
    this.setState("acting");
    this.routeStartedAtMs = nowMs();
    try {
      const routingText = normalizeTranscriptForRouting(text || "");
      const intent = parseIntentDE(routingText);

      if (intent.type === "lead_hunt" && (intent.payload.category || intent.payload.location)) {
        try {
          const osmResp = await fetch(`${BACKEND}/voice/intent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: routingText }),
          })
            .then((r) => r.json())
            .catch(() => null);

          if (osmResp?.ok && osmResp?.result) {
            const found = osmResp.result.found || 0;
            voiceState.lastOSMResult = osmResp.result;
            document.dispatchEvent(
              new CustomEvent("voice-osm-success", {
                detail: { result: osmResp.result },
              })
            );
            if (typeof speak === "function") {
              await speak(`Gefunden: ${found} Leads. Ergebnisse werden angezeigt.`);
            } else {
              console.warn("[fm-voice] speak() not available");
            }
            return;
          }
        } catch {
          // Fällt zurück auf Legacy-Endpoint unten
        }
      }

      if (intent.type === "lead_hunt") {
        const payload: Record<string, string> = { category: intent.payload.category || "demo" };
        if (intent.payload.location) payload.location = intent.payload.location;
        const resp = await fetch(`${BACKEND}/lead_hunter/hunt_async`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then((r) => r.json())
          .catch(() => null);
        voiceState.lastLeadTaskId = resp?.task_id || null;
        if (voiceState.lastLeadTaskId) {
          await fetch(`${BACKEND}/api/lead_status/last/${voiceState.lastLeadTaskId}`, {
            method: "POST",
          }).catch(() => {});
        }
        if (typeof speak === "function") {
          await speak("Verstanden. Ich starte die Suche.");
        } else {
          console.warn("[fm-voice] speak() not available");
        }
      } else if (intent.type === "reminder") {
        // HINWEIS: Diese Ausgabe "Erledigt, Erinnerung ist gesetzt" gehört ausschließlich
        // zur Reminder-/Termin-Logik und darf NICHT im E-Mail-Kontext (Wizard 2/3) ausgelöst werden.
        
        // Prüfung: Wenn E-Mail-Kontext vorhanden ist, KEINEN Reminder setzen
        const lowerText = routingText.toLowerCase();
        const isEmailKeywordInText =
          lowerText.includes("mail") ||
          lowerText.includes("e-mail") ||
          lowerText.includes("email") ||
          lowerText.includes("schreibe") ||
          lowerText.includes("schreib");
        
        // Prüfe auch lastAction, um E-Mail-Kontext zu erkennen (z.B. bei Wizard-2-Befehlen im laufenden Composer)
        const lastAction = getLastAction();
        const isEmailContextFromAction =
          lastAction &&
          (lastAction.kind === "email-compose" ||
           lastAction.description.toLowerCase().includes("e-mail") ||
           lastAction.description.toLowerCase().includes("mail"));

        if (isEmailKeywordInText || isEmailContextFromAction) {
          // E-Mail-Kontext erkannt -> Reminder-Intent ignorieren, damit Wizard3 übernimmt
          console.log("[fm-voice] Reminder-Intent im E-Mail-Kontext erkannt – ignoriert, damit Wizard3 übernimmt");
          return;
        }

        const body: Record<string, unknown> = { title: intent.payload.title || "Nachfassung" };
        if (intent.payload.when) body.when = intent.payload.when;
        await fetch(`${BACKEND}/api/proactive/remember`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        try {
          await fetch(`${BACKEND}/api/proactive/trigger`, { method: "POST" });
        } catch {
          // optional trigger
        }
        if (typeof speak === "function") {
          await speak("Erledigt. Erinnerung ist gesetzt.");
        } else {
          console.warn("[fm-voice] speak() not available");
        }
      } else if (intent.type === "cancel") {
        if (voiceState.lastLeadTaskId) {
          await fetch(`${BACKEND}/lead_hunter/cancel/${voiceState.lastLeadTaskId}`, {
            method: "POST",
          }).catch(() => {});
          voiceState.lastLeadTaskId = null;
          if (typeof speak === "function") {
            await speak("Alles klar. Ich stoppe die letzte Suche.");
          } else {
            console.warn("[fm-voice] speak() not available");
          }
        } else {
          if (typeof speak === "function") {
            await speak("Es gibt nichts zu stoppen.");
          } else {
            console.warn("[fm-voice] speak() not available");
          }
        }
      } else {
        // Unknown intent – UI/PartnerBot informiert separat über Intent-Router
        return;
      }
    } catch (err) {
      console.warn("[fm-voice] route error:", err);
      this.setState("error");
      if (typeof speak === "function") {
        await speak("Da gab es ein Problem bei der Ausführung.");
      } else {
        console.warn("[fm-voice] speak() not available");
      }
      return;
    } finally {
      console.log(
        `[fm-voice][timing] stage=route-finished elapsedMs=${Math.max(0, Math.round(nowMs() - this.routeStartedAtMs))} state=${this.state}`
      );
      if (this.state !== "error") {
        this.setState("done");
      }
    }
  }
}

export const voice = new VoiceController();

/**
 * Entfernt Sende-Phrasen aus dem Body-Text (z.B. "Schick sie." am Ende)
 */
function stripSendPhraseFromBody(body: string | null | undefined): string {
  if (body == null) {
    return "";
  }

  const raw = String(body);

  if (!raw.trim()) {
    return raw;
  }

  // Entfernt End-Phrasen wie:
  // "Schick sie."
  // "schick sie raus."
  // "schick sie sofort raus."
  const cleaned = raw.replace(
    /\s*schick sie(\s+(sofort\s+raus|raus))?[.!]?\s*$/i,
    ""
  );

  // Überflüssige Leerzeichen/Zeilenumbrüche am Ende weg,
  // normale Formatierung bleibt.
  return cleaned.replace(/\s+$/s, "");
}

/**
 * Helper-Funktion zum Setzen der E-Mail-Daten in der MailCompose-UI.
 * Kann sowohl von email-compose als auch von wizard3-one-shot verwendet werden.
 */
function applyEmailToComposeUI(params: {
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  logPrefix?: string;
}) {
  const { to, subject, body, logPrefix = "[fm-voice] email-compose-apply" } = params;

  if (to && typeof window !== "undefined" && (window as any).__fm_set_mail_to) {
    // Normalisiere E-Mail-Adresse (falls nötig)
    const normalizedTo = to
      .replace(/\s+at\s+/gi, "@")
      .replace(/\s+punkt\s+de\b/gi, ".de")
      .replace(/\s+punkt\s+com\b/gi, ".com")
      .replace(/\s+punkt\s+net\b/gi, ".net")
      .replace(/\s+punkt\s+org\b/gi, ".org")
      .replace(/\s+punkt\s+/gi, ".")
      .replace(/\s+/g, "");
    console.log(`${logPrefix}: __fm_set_mail_to`, normalizedTo);
    (window as any).__fm_set_mail_to(normalizedTo);
  }

  if (subject && typeof window !== "undefined" && (window as any).__fm_set_mail_subject) {
    const currentSubject = ((window as any).__fm_get_mail_subject?.() ?? "").toString().trim();
    const nextSubject = String(subject).trim();
    if (currentSubject !== nextSubject) {
      console.log(`${logPrefix}: __fm_set_mail_subject setting subject=`, JSON.stringify(nextSubject), '(from resolvedSubject/draft)');
      (window as any).__fm_set_mail_subject(nextSubject);
    } else {
      console.log(`${logPrefix}: __fm_set_mail_subject skipped (unchanged)`);
    }
  }

  // Body setzen (auch wenn leer - wichtig für previewOnly)
  // body kann null, "" oder ein String sein - nur null sollte ignoriert werden
  if (body !== null && typeof window !== "undefined" && (window as any).__fm_set_mail_body) {
    const cleanedBody = stripSendPhraseFromBody(body);
    console.log(`${logPrefix}: __fm_set_mail_body gesetzt`, cleanedBody === '' ? '(leer)' : cleanedBody);
    (window as any).__fm_set_mail_body(cleanedBody);
  }
}

function applyVoiceIntent(intent: VoiceIntent, navigate: NavigateFunction) {
  const timing = ((intent as any)?.meta?.__fmTiming ?? null) as VoiceTiming | null;
  const timingMark = (stage: string, extra?: Record<string, unknown>) =>
    logVoiceTiming(timing, stage, extra);
  timingMark("applyVoiceIntent-enter", { intentType: intent.type });
  debugLog("[fm-voice] intent result:", intent);

  if (intent.type === "navigate") {
    switch (intent.target) {
      case "control-center":
        navigate("/control-center");
        showTransitionMessage("Öffne Dashboard …");
        triggerEmotion("success");
        PartnerBotBus.say("Ich wechsle zum Control Center.");
        setLastAction({ kind: "navigate", description: "Wechsel zum Control Center." });
        return;
      case "lead-radar":
        navigate("/lead-radar");
        showTransitionMessage("Wechsle zum Lead-Radar …");
        triggerEmotion("success");
        PartnerBotBus.say("Ich öffne den Lead-Radar für dich.");
        setLastAction({ kind: "navigate", description: "Lead-Radar geöffnet." });
        return;
      case "leads":
        navigate("/leads");
        showTransitionMessage("Zeige Leads …");
        triggerEmotion("success");
        PartnerBotBus.say("Hier sind deine Leads.");
        setLastAction({ kind: "navigate", description: "Leads-Übersicht geöffnet." });
        return;
      case "voice-diagnostics":
        navigate("/voice-diagnostics");
        showTransitionMessage("Öffne Sprachdiagnose …");
        triggerEmotion("greeting");
        PartnerBotBus.say("Ich öffne die Voice Diagnostics.");
        setLastAction({ kind: "navigate", description: "Voice Diagnostics geöffnet." });
        return;
      case "mail-compose":
        navigate("/mail/compose");
        showTransitionMessage("Öffne E-Mail …");
        triggerEmotion("idea");
        PartnerBotBus.say("Ich öffne den E-Mail-Composer.");
        setLastAction({ kind: "navigate", description: "E-Mail-Composer geöffnet." });
        return;
    }
  }

  if (intent.type === "wizard3-one-shot") {
    console.log("[fm-voice] wizard3-one-shot erkannt:", intent.payload);
    
    // Bot reagiert sofort
    PartnerBotBus.pose("thinking");
    PartnerBotBus.say("Ich analysiere deine E-Mail-Anfrage …");
    
    // Navigiere ZUERST zum Mail-Compose (damit die Komponente gemountet ist)
    navigate("/mail/compose");
    showTransitionMessage("E-Mail wird vorbereitet …");
    triggerEmotion("idea");
    
    // Asynchron den Wizard3-Flow starten
    wizard3Parse(intent.payload.rawText)
      .then(async (parsed) => {
        console.log("[fm-voice] Wizard3-OneShot Payload:", parsed);
        
        // Body generieren
        const body = await wizard3BuildEmail(
          parsed.bodyInstructions || "",
          parsed.tone,
          parsed.extraInstructions
        );
        
        console.log("[fm-voice] wizard3-one-shot: Body generiert:", body);
        
        // Warte kurz, damit die MailCompose-Komponente gemountet ist
        await new Promise((resolve) => setTimeout(resolve, 100));
        
        // Setze E-Mail-Felder über Helper-Funktion
        applyEmailToComposeUI({
          to: parsed.to,
          subject: parsed.subject,
          body: body,
          logPrefix: "[fm-voice] wizard3-one-shot",
        });
        
        // lastAction setzen
        const recipient = parsed.to || "Unbekannt";
        setLastAction({
          kind: "email-compose",
          description: `E-Mail an ${recipient} mit Inhalt erstellt.`,
        });
        
        // Bot bestätigt
        PartnerBotBus.pose("lightbulb");
        PartnerBotBus.say("Ich habe die E-Mail erstellt. Vorschau oder sofort senden?");
      })
      .catch((err) => {
        console.error("[fm-voice] wizard3-one-shot: Fehler:", err);
        PartnerBotBus.pose("confused");
        PartnerBotBus.say("Beim Erstellen der E-Mail ist ein Fehler aufgetreten. Bitte versuche es erneut.");
      });
    
    return;
  }

  function normalizeEmailForAutoSend(raw: string): string | null {
    if (!raw) return null;
    const text = String(raw).trim();

    // finde irgendwas, was wie eine mail beginnt
    const start = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/);
    if (!start) return null;

    const s = start[0];
    const lower = (s + text.slice(s.length)).toLowerCase();

    const tlds = ['.de', '.com', '.net', '.org', '.eu', '.io'];

    // suche die erste erlaubte tld NACH dem @
    const atPos = lower.indexOf('@');
    if (atPos < 1) return null;

    let bestEnd = -1;
    for (const tld of tlds) {
      const idx = lower.indexOf(tld, atPos);
      if (idx !== -1) {
        const end = idx + tld.length;
        if (end > bestEnd) bestEnd = end;
      }
    }
    if (bestEnd === -1) return null;

    const candidate = (s + text.slice(s.length)).slice(0, bestEnd).trim();

    // final strict check (keine spaces, genau ein @, dot tld vorhanden)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(candidate)) return null;

    // Zusätzlich: TLD muss in allowlist sein
    const candLower = candidate.toLowerCase();
    if (!tlds.some(t => candLower.endsWith(t))) return null;

    return candidate;
  }

  if (intent.type === "email-compose") {
    timingMark("email-compose-enter");
    console.log("[fm-voice] email-compose intent:", intent);
    
    // WICHTIG: Ganzer Block wird in async IIFE gepackt, damit Resolver awaited werden kann
    (async () => {
      const composeStartedAtMs = nowMs();
      const w = window as any;
      let didAutoSend = false;
      const commandRunId = Number(((intent as any)?.meta?.__fmRunId ?? 0) as number);
      const isStaleRun = () =>
        commandRunId > 0 && commandRunId !== latestVoiceCommandRunId;
      let completionSpoken = false;
      const sayPreparedOnce = (fallbackText: string) => {
        if (completionSpoken) return;
        completionSpoken = true;
        PartnerBotBus.say((intent as any)?.meta?.uiHint || fallbackText);
      };
      
      // ============================================================
      // FOLLOW-UP SEND: "Schick die Nachricht aus" etc. → aktuellen Draft im UI abschicken
      // ============================================================
      const rawTextForFollowUp = (intent as any)?.meta?.source === "email-send-degrade" && (intent as any).sourceText != null
        ? (intent as any).sourceText
        : (lastTranscript || intent.bodyHint || intent.toRaw || "");
      if (isFollowUpSendCurrentDraft(rawTextForFollowUp)) {
        timingMark("email-compose-followup-send-check");
        if (typeof w.__fm_send_mail_now === 'function') {
          try {
            w.__fm_send_mail_now();
            setLastAction({ kind: "email-compose", description: "E-Mail gesendet (Follow-up)." });
            console.log("[wizard4][followup-send] sending current draft from UI (no overwrite)");
          } catch (err) {
            console.error("[wizard4][followup-send] error calling __fm_send_mail_now:", err);
          }
        } else {
          console.log("[wizard4][followup-send] no UI draft available - ignored");
        }
        return;
      }

      // Safety-Guard: Reine Sendebestätigung darf niemals den Draft neu aufbauen/überschreiben.
      // Stattdessen immer den aktuellen UI-Entwurf senden.
      const normalizedSendText = String(rawTextForFollowUp || "")
        .toLowerCase()
        .replace(/[.,!?;:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const isPureSendConfirmation =
        !!(intent as any)?.meta?.autoSend &&
        /^(?:jetzt|sofort)\s+senden$/.test(normalizedSendText);
      if (isPureSendConfirmation && isUiDraftAvailable() && w) {
        timingMark("email-compose-pure-send-confirmation");
        const safeTo = typeof w.__fm_get_mail_to === "function" ? String(w.__fm_get_mail_to() || "").trim() : "";
        const safeBody = typeof w.__fm_get_mail_body === "function" ? String(w.__fm_get_mail_body() || "").trim() : "";
        if (!safeTo || !safeBody) {
          PartnerBotBus.say("Zum Senden fehlen Empfänger oder Text. Ich bleibe in der Vorschau.");
          return;
        }
        const now = Date.now();
        const hardConfirmation = isHardSendConfirmationPhrase(rawTextForFollowUp);
        const consumeBypass =
          allowNextEmailSendWithoutExtraConfirmationUntil >= now;
        if (consumeBypass) {
          allowNextEmailSendWithoutExtraConfirmationUntil = 0;
        }
        if (!hardConfirmation && !consumeBypass && pendingEmailSendConfirmationUntil < now && !isMobileVoiceShell()) {
          // 10s war bei lokaler STT zu knapp und führte zu Nachfrage-Loops.
          pendingEmailSendConfirmationUntil = now + 30000;
          PartnerBotBus.say("Sicherheitscheck: Bitte bestätige mit 'jetzt senden' oder 'sofort senden'.");
          return;
        }
        pendingEmailSendConfirmationUntil = 0;
        try {
          w.__fm_send_mail_now();
          if (typeof w !== "undefined") {
            w.__fm_guided_mail_context = null;
          }
          setLastAction({ kind: "email-compose", description: "E-Mail gesendet." });
          console.log("[wizard4][safety-send-confirm] sent current UI draft without overwrite");
        } catch (err) {
          console.error("[wizard4][safety-send-confirm] send error:", err);
        }
        return;
      }
      
      // ============================================================
      // PHASE 1: Basis-Draft aus Intent erstellen (OHNE finalen Body-Style)
      // ============================================================
      // AUFGABE B: Guard-Condition für Status-Brain - verhindert explicit-body Überschreibung VOR buildWizard4EmailFromInput
      const emailIntentCheck: any = intent;
      const intentSourceCheck = emailIntentCheck?.meta?.source;
      const isStatusBrain = intentSourceCheck === "status-brain";
      
      // EXPLICIT BODY WINS: bodyHint !== undefined = explizit (auch ""), damit leerer Body den Draft-Generator skippt
      const hasExplicitBody = (intent.bodyHint !== undefined);
      
      if (hasExplicitBody && !isStatusBrain) {
        console.log('[wizard4][explicit-body] bodyHint present -> will skip template/ai draft', {
          bodyHintPreview: (intent.bodyHint ?? '').substring(0, 80),
          isEmpty: (intent.bodyHint ?? '').trim().length === 0
        });
      } else if (isStatusBrain) {
        console.log('[wizard4][explicit-body] skipped due to status-brain source (early guard)');
      } else {
        console.log('[wizard4][explicit-body] no bodyHint -> allow draft generator');
      }
      
      const rawText = (emailIntentCheck?.meta?.source === "email-send-degrade" && (intent as any).sourceText != null)
        ? (intent as any).sourceText
        : (lastTranscript || intent.bodyHint || intent.toRaw || "");
      const explicitSubjectFromCurrentCompose = extractExplicitSubjectFromComposeSource(rawText);
      if (explicitSubjectFromCurrentCompose) {
        (intent as any).explicitSubject = explicitSubjectFromCurrentCompose;
        console.log(`[intent-router][subject-from-source] explicitSubject="${explicitSubjectFromCurrentCompose}"`);
      }
      let wizard4Draft: any = null;
      
      if (rawText && typeof w.buildWizard4EmailFromInput === 'function') {
        timingMark("email-compose-draft-build-start");
        try {
          wizard4Draft = w.buildWizard4EmailFromInput(rawText);
          // sourceText wird bereits in buildWizard4EmailFromInput gesetzt
          console.log('[fm-voice][wizard4] email draft from input:', rawText, wizard4Draft);
          console.log('[fm-voice][wizard4][debug] emailIntent snapshot', {
            to: (intent as any)?.to,
            toRaw: (intent as any)?.toRaw,
            draftToEmail: (wizard4Draft as any)?.toEmail,
            hasExplicitBody: hasExplicitBody && !isStatusBrain,
            isStatusBrain: isStatusBrain,
          });

          // Subject aus Intent übernehmen (höhere Priorität)
          const intentExplicitSubject = (
            explicitSubjectFromCurrentCompose ||
            ((intent as any)?.explicitSubject ?? "").toString()
          ).trim();
          const recipientForIntentSubjectCleanup =
            ((intent as any).toRaw ?? (intent as any).toName ?? wizard4Draft?.toName ?? "").toString();
          if (intentExplicitSubject && wizard4Draft) {
            const cleanedIntentExplicitSubject = cleanupSubjectTrailingRecipient(
              intentExplicitSubject,
              recipientForIntentSubjectCleanup
            );
            wizard4Draft.subject = cleanedIntentExplicitSubject;
            (wizard4Draft as any).hasExplicitSubject = true;
            (wizard4Draft as any).meta = { ...((wizard4Draft as any).meta ?? {}), subjectLocked: true };
            w.__fm_subject_locked = true;
            w.__fm_subject_locked_value = cleanedIntentExplicitSubject;
            console.log(`[wizard4][subject-lock] locked subject="${cleanedIntentExplicitSubject}"`);
            console.log('[wizard4][subject-from-intent-source] subject übernommen:', wizard4Draft.subject);
          } else {
            const intentSubject = (intent as any)?.subject ?? intent.subjectHint;
            if (intentSubject && typeof intentSubject === 'string' && intentSubject.trim() && wizard4Draft) {
              wizard4Draft.subject = intentSubject.trim();
              console.log('[wizard4][subject-from-intent] subject übernommen:', wizard4Draft.subject);
            }
          }
          
          // EXPLICIT BODY WINS: Wenn ein expliziter bodyHint vorhanden ist, überschreibe den generierten Body sofort
          // ABER: NICHT bei Status-Brain (dort wird Body später mit aufgelöstem Namen gesetzt)
          // bodyHint === "" oder fehlt -> draft.body = "", kein Generator/Template
          if (hasExplicitBody && !isStatusBrain) {
            let bodyHint = (intent.bodyHint ?? '').trim();
          const originalBodyHintForLog = bodyHint;
            
            // FIX: Rewrite führende "dass"-Klausel für autoSend-Intents
            // Wird VOR polish und VOR __fm_set_mail_body angewendet
            if (intent.meta?.autoSend && typeof bodyHint === 'string') {
              const rewritten = rewriteLeadingDassClause(bodyHint);
              if (rewritten !== bodyHint) {
                bodyHint = rewritten;
                // Aktualisiere auch intent.bodyHint für spätere Verwendung
                (intent as any).bodyHint = rewritten;
                console.log('[wizard4][dass-rewrite] Rewrote leading "dass" clause', {
                  original: originalBodyHintForLog.substring(0, 80),
                  rewritten: rewritten.substring(0, 80)
                });
                // Pronoun-Fix: "Ich ... ihn/ihm" -> "dich/dir" wenn Empfänger gesetzt (Mail an jemanden)
                const toName = (intent as any).toRaw ?? (intent as any).toName ?? wizard4Draft?.toName;
                if (toName && (typeof toName === 'string' && toName.trim().length > 0) && /^Ich\s/i.test(bodyHint) && !/^Wir\s/i.test(bodyHint)) {
                  const beforeFix = bodyHint;
                  bodyHint = bodyHint.replace(/\bihn\b/gi, 'dich').replace(/\bihm\b/gi, 'dir');
                  if (bodyHint !== beforeFix) {
                    (intent as any).bodyHint = bodyHint;
                    console.log('[wizard4][dass-rewrite][pronoun-fix] before:', beforeFix.slice(0, 80));
                    console.log('[wizard4][dass-rewrite][pronoun-fix] after:', bodyHint.slice(0, 80));
                  }
                }
                // STT formal guard: "Ihnen" (STT-Fehler für "ihn") -> "dich" nur bei "Ich "-Satz und Empfänger, ohne "Sie"
                if (toName && (typeof toName === 'string' && toName.trim().length > 0) && /^Ich\s/i.test(bodyHint) && /\bIhnen\b/i.test(bodyHint) && !/\bSie\b/.test(bodyHint)) {
                  const beforeGuard = bodyHint;
                  bodyHint = bodyHint.replace(/\bIhnen\b/gi, 'dich').replace(/\bihnen\b/gi, 'dich');
                  if (bodyHint !== beforeGuard) {
                    (intent as any).bodyHint = bodyHint;
                    console.log('[wizard4][dass-rewrite][stt-formal-guard] before:', beforeGuard.slice(0, 80));
                    console.log('[wizard4][dass-rewrite][stt-formal-guard] after:', bodyHint.slice(0, 80));
                  }
                }
              }
            }
            
            let sanitizedBody = bodyHint;
            sanitizedBody = sanitizedBody.replace(/^[\s?¿!.,:;]+(?=\S)/, "").trim();
            sanitizedBody = sanitizedBody.replace(/\s*(?:doch nicht|ach nein|lieber doch nicht|besser doch nicht|ne doch nicht)[\s,.:;!?-]*$/i, "").trim();
            sanitizedBody = stripSendControlPhrasesFinal(sanitizedBody);
            const recipientHints = [(intent as any).toRaw, (intent as any).toName, wizard4Draft?.toName].filter(Boolean) as string[];
            sanitizedBody = stripLeadingAnRecipient(sanitizedBody, recipientHints);
            sanitizedBody = stripEndOfSentenceSendCommands(sanitizedBody);
            // Leading Send-Adverb nur bei AutoSend entfernen (vor ensureTerminalPunctuation)
            if ((intent as any).meta?.autoSend === true && sanitizedBody?.trim()) {
              const trimmed = sanitizedBody.trim();
              const re = /^(sofort|jetzt|direkt)\b\s*[,:;.]?\s*/i;
              if (re.test(trimmed)) {
                const before = sanitizedBody;
                sanitizedBody = trimmed.replace(re, '').trim();
                console.log('[wizard4][send-control-strip][send-adverb-leading] before:', before.slice(0, 80));
                console.log('[wizard4][send-control-strip][send-adverb-leading] after:', sanitizedBody.slice(0, 80));
              }
            }
            if (sanitizedBody && sanitizedBody.trim().length > 0) {
              sanitizedBody = ensureTerminalPunctuation(sanitizedBody);
            } else if (!sanitizedBody || sanitizedBody.trim().length === 0) {
              (intent as any).meta = { ...(intent as any).meta, forcePreviewOnly: true, forcePreviewOnlyReason: 'missing_body', uiHint: "Empfänger erkannt, aber keine Nachricht. Sag den Text – oder sag 'schick jetzt raus', nachdem der Text da ist." };
            }
            console.log("[wizard4][explicit-body][sanitize] before:", bodyHint.slice(0, 120));
            console.log("[wizard4][explicit-body][sanitize] after:", sanitizedBody.slice(0, 120));

            // WICHTIG: stripSubjectCommand ausschließlich mit sanitized bodyHint, NIEMALS mit sourceText
            console.log('[wizard4][explicit-body][sanitize] stripSubjectCommand input from sanitized bodyHint (not sourceText)');
            const { text: bodyWithoutSubject, explicitSubject } = stripSubjectCommand(sanitizedBody);
            if (explicitSubject && bodyWithoutSubject !== sanitizedBody) {
              sanitizedBody = bodyWithoutSubject.trim();
              const recipientForSubjectCleanup =
                ((intent as any).toRaw ?? (intent as any).toName ?? wizard4Draft?.toName ?? "").toString();
              const subjectBeforeCleanup = explicitSubject;
              const cleanedExplicitSubject = cleanupSubjectTrailingRecipient(subjectBeforeCleanup, recipientForSubjectCleanup);
              if (cleanedExplicitSubject !== subjectBeforeCleanup) {
                console.log("[subject-cleanup] removed trailing recipient from subject", {
                  before: subjectBeforeCleanup,
                  after: cleanedExplicitSubject,
                });
              }
              wizard4Draft.subject = cleanedExplicitSubject;
              (wizard4Draft as any).hasExplicitSubject = true;
              (wizard4Draft as any).meta = { ...((wizard4Draft as any).meta ?? {}), subjectLocked: true };
              w.__fm_subject_locked = true;
              w.__fm_subject_locked_value = cleanedExplicitSubject;
              console.log(`[wizard4][subject-lock] locked subject="${cleanedExplicitSubject}"`);
              console.log('[wizard4][subject-command-strip] explicitSubject=', explicitSubject, 'draft.subject=', wizard4Draft.subject);
            }

            // KEIN sourceText-Fallback: appliedBodyHint darf NIEMALS aus sourceText/originalText kommen.
            // Wenn sanitizedBody leer bleibt, bleibt der Body leer (kein Zurückholen des Originalsatzes).

            // appliedBodyHint = sanitizedBody (aus stripSubjectCommand + sanitize, NIEMALS sourceText)
            let appliedBodyHint = sanitizedBody?.trim() ?? '';
            const currentSubjectForStrip = wizard4Draft?.subject ?? (intent as any).subjectHint ?? (intent as any).subject;
            appliedBodyHint = stripLeadingSubjectEcho(appliedBodyHint, currentSubjectForStrip);
            bodyHint = appliedBodyHint;
            (intent as any).bodyHint = appliedBodyHint;
            wizard4Draft.body = appliedBodyHint;
            console.log("[wizard4][explicit-body][sanitize] appliedBodyHint:", appliedBodyHint.slice(0, 120));
            console.log('[wizard4][explicit-body] Overwrote draft.body with explicit bodyHint', {
              newBodyPreview: appliedBodyHint.substring(0, 80)
            });
          }
          
          w.__fm_wizard4_last_draft = wizard4Draft;
        } catch (err) {
          console.error('[fm-voice][wizard4] Fehler beim Bauen des Wizard4EmailDraft:', err);
        } finally {
          timingMark("email-compose-draft-build-finished", {
            composeElapsedMs: Math.max(0, Math.round(nowMs() - composeStartedAtMs)),
            hasDraft: !!wizard4Draft,
          });
        }
      } else {
        console.log(
          '[fm-voice][wizard4] kein rawText oder buildWizard4EmailFromInput nicht verfügbar',
          { rawText }
        );
      }
      
      // TASK 4: Pronoun safety check
      // Prüfe ob toName ein Pronomen ist und setze auf null
      if (wizard4Draft && wizard4Draft.toName && isInvalidRecipientToken(wizard4Draft.toName)) {
        wizard4Draft.toName = null;
        console.log('[wizard4][safety-pronoun] toName invalid (pronoun) -> cleared:', wizard4Draft.toName);
      }
      
      // TASK 4: Also check intent.toRaw for pronouns
      if (intent && (intent as any).toRaw && isInvalidRecipientToken((intent as any).toRaw)) {
        console.log('[wizard4][safety-pronoun] intent.toRaw is pronoun -> cleared:', (intent as any).toRaw);
        (intent as any).toRaw = undefined;
        // Clear wizard4Draft.toName as well if it was set from toRaw
        if (wizard4Draft) {
          wizard4Draft.toName = null;
        }
      }
      
      // Fallback: Empfängername aus Transcript extrahieren, wenn intent.toRaw fehlt und draft.toName null
      if (wizard4Draft && (!(intent as any)?.toRaw || !(intent as any).toRaw.trim()) && (!wizard4Draft.toName || !wizard4Draft.toName.trim())) {
        const normalizedTranscript = (lastTranscript || "").toLowerCase().replace(/[.,;:!?]/g, ' ').replace(/\s+/g, ' ').trim();
        const candidateName = extractRecipientNameFromTranscript(normalizedTranscript);
        if (candidateName) {
          wizard4Draft.toName = candidateName;
          console.log('[fm-voice][wizard4][debug] extracted toName fallback:', candidateName);
        }
      }
      
      // ============================================================
      // SENDMODE-LOGIK: Priorität 1) Intent-Meta, 2) Text-Trigger
      // ============================================================
      if (wizard4Draft) {
        const emailIntent: any = intent;
        const statusMeta = emailIntent?.meta?.statusEmail;
        const freeDictationMeta = emailIntent?.meta?.freeDictationMeta || null;
        const hasExplicitSendNowPhrase = shouldSendNowFromSourceText(wizard4Draft.sourceText);
        
        // Standard: immer erstmal auf "previewOnly"
        let sendMode: "previewOnly" | "sendNow" = "previewOnly";
        const forcePreviewReason = emailIntent?.meta?.forcePreviewOnlyReason;
        const forcePreviewReasonText = String(forcePreviewReason || "").trim().toLowerCase();
        const intentSourceText = String(emailIntent?.meta?.source || "").trim().toLowerCase();
        const isContextReplyPreviewReason =
          forcePreviewReasonText === "context_reply_default" ||
          forcePreviewReasonText.startsWith("context_reply_");
        const allowExplicitSendOverride =
          hasExplicitSendNowPhrase &&
          emailIntent?.meta?.cancelled !== true &&
          emailIntent?.meta?.disableSendPhraseDetection !== true &&
          (isContextReplyPreviewReason ||
            intentSourceText.includes("exchange-context") ||
            intentSourceText.includes("reply-context"));
        if (allowExplicitSendOverride) {
          sendMode = "sendNow";
          console.log("[autosend] sendMode = sendNow (explicit phrase overrides context preview)", {
            sourceText: wizard4Draft.sourceText,
            forcePreviewOnlyReason: forcePreviewReason || null,
            source: emailIntent?.meta?.source || null,
          });
        } else if (emailIntent?.meta?.forcePreviewOnly || emailIntent?.meta?.cancelled || emailIntent?.meta?.disableSendPhraseDetection) {
          sendMode = "previewOnly";
          console.log("[autosend] forced previewOnly (cancel/forcePreviewOnly)", {
            forcePreviewOnly: !!emailIntent?.meta?.forcePreviewOnly,
            forcePreviewOnlyReason: forcePreviewReason || null,
            cancelled: !!emailIntent?.meta?.cancelled,
            disableSendPhraseDetection: !!emailIntent?.meta?.disableSendPhraseDetection,
            source: emailIntent?.meta?.source || null,
            sourceText: wizard4Draft.sourceText,
          });
        }
        // FIX 4: PRIORITÄT 1 - Intent-Meta autoSend (für ALLE Intent-Typen, auch Free-Dictation)
        // Dies muss ZUERST geprüft werden, damit es sich durchsetzt
        else if (emailIntent?.meta?.autoSend === true) {
          // TASK 4: Pronoun safety - prevent AutoSend if toName is a pronoun
          const currentToName = wizard4Draft?.toName || emailIntent?.toRaw || '';
          if (currentToName && isInvalidRecipientToken(currentToName)) {
            sendMode = "previewOnly";
            console.log('[wizard4][safety-pronoun] AutoSend cancelled: pronoun detected in toName/toRaw:', currentToName);
          } else {
            sendMode = "sendNow";
            console.log('[autosend] sendMode = sendNow (AutoSend aus Intent-Meta erkannt)');
          }
        }
        // Generische AutoSend-Erkennung nur, wenn KEIN Free-Diktat UND keine Intent-Meta autoSend
        else if (!freeDictationMeta) {
          // 1. Prio: explizites AutoSend aus dem Status-Meta (für Status-Brain)
          if (statusMeta?.autoSend) {
            sendMode = "sendNow";
            console.log('[autosend] sendMode = sendNow (AutoSend aus Status-Meta erkannt)');
          } else {
            // 2. Prio: bestehende Text-Trigger-Logik (massiv erweitert)
            if (shouldSendNowFromSourceText(wizard4Draft.sourceText)) {
              sendMode = "sendNow";
              console.log('[autosend] sendMode = sendNow (klare Send-Phrase im Text erkannt)');
            } else {
              sendMode = "previewOnly";
              console.log('[autosend] sendMode = previewOnly (keine klare Send-Phrase)');
            }
          }
        }
        // A3.4 – Free-Dictation: AutoSend optional erlauben (nur wenn Intent-Meta nicht bereits gesetzt)
        else if (freeDictationMeta && emailIntent?.meta?.autoSend !== true) {
          // Fallback: Prüfe freeDictationMeta.autoSend (für Rückwärtskompatibilität)
          // TASK 4: Pronoun safety - prevent AutoSend if toName is a pronoun
          const currentToName = wizard4Draft?.toName || emailIntent?.toRaw || '';
          if (freeDictationMeta.autoSend) {
            // Check if toName or toRaw is a pronoun
            if (currentToName && isInvalidRecipientToken(currentToName)) {
              sendMode = "previewOnly";
              console.log('[wizard4][safety-pronoun] AutoSend cancelled: pronoun detected in toName/toRaw:', currentToName);
            } else {
              sendMode = "sendNow";
              console.log('[autosend][free-dictation] AutoSend aktiv (A3.4 via freeDictationMeta), sendMode = sendNow.');
            }
          } else {
            sendMode = "previewOnly";
            console.log('[autosend][free-dictation] Kein AutoSend-Wunsch erkannt, sendMode = previewOnly.');
          }
        }
        
        // TASK 4: Final pronoun safety check - prevent AutoSend if toName is still a pronoun
        if (sendMode === "sendNow" && wizard4Draft) {
          const finalToName = wizard4Draft.toName || emailIntent?.toRaw || '';
          if (finalToName && isInvalidRecipientToken(finalToName)) {
            sendMode = "previewOnly";
            console.log('[wizard4][safety-pronoun] AutoSend cancelled (final check): pronoun detected:', finalToName);
          }
        }
        if (sendMode === "sendNow") {
          const truncationCandidate =
            String((intent as any)?.bodyHint ?? "").trim() ||
            String((wizard4Draft as any)?.body ?? "").trim() ||
            String(wizard4Draft.sourceText ?? "").trim();
          if (isLikelyTruncatedDictation(truncationCandidate)) {
            sendMode = "previewOnly";
            (intent as any).meta = {
              ...((intent as any).meta ?? {}),
              forcePreviewOnly: true,
              forcePreviewOnlyReason: "suspected_truncated_dictation",
              uiHint:
                "Das Diktat wirkt abgeschnitten. Bitte fortsetzen mit 'Neuer Text' oder erneut vollständig diktieren.",
            };
            console.log("[autosend] forced previewOnly (suspected truncated dictation)", {
              preview: truncationCandidate.slice(Math.max(0, truncationCandidate.length - 120)),
              length: truncationCandidate.length,
            });
          }
        }
        
        wizard4Draft.sendMode = sendMode;
        console.log('[autosend] final sendMode:', wizard4Draft.sendMode, 'sourceText:', wizard4Draft.sourceText);
        
        // UI-Hinweis: Wenn AutoSend erkannt wurde, aber trotzdem previewOnly gewählt wurde
        const metaAutoSend = !!emailIntent?.meta?.autoSend;
        const isPreviewOnly = (sendMode === "previewOnly");
        const intentSource = emailIntent?.meta?.source;
        
        // Guards: Kein Hinweis bei expliziten Preview-Intents oder Cancel
        const isExplicitPreviewIntent = [
          'draft-entwurf',
          'draft-prepare',
          'draft-folgende',
          'write-preview',
          'cancelled-send->preview'
        ].includes(intentSource);
        
        // Prüfe ob Cancel-Phrase erkannt wurde:
        // - Wenn meta.autoSend explizit false ist, obwohl es ursprünglich true war (durch applyCancelPhraseOverride)
        // - Oder wenn bodyHint bereinigt wurde (bodyHint !== bodyHintRaw)
        const wasCanceledByOverride = metaAutoSend && emailIntent?.meta?.autoSend === false;
        const hasCancelPhraseInBody = emailIntent?.bodyHint && emailIntent?.bodyHintRaw && 
          emailIntent.bodyHint !== emailIntent.bodyHintRaw;
        const hasCancelPhrase = wasCanceledByOverride || hasCancelPhraseInBody;
        
        if (emailIntent?.meta?.forcePreviewOnlyReason === 'missing_body') {
          (window as any).__fm_last_hint = {
            kind: "missing_body",
            message: emailIntent.meta.uiHint || "Empfänger erkannt, aber keine Nachricht. Sag den Text – oder sag 'schick jetzt raus', nachdem der Text da ist.",
            ts: Date.now()
          };
          console.log("[wizard4][ui-hint] missing_body -> hint set");
        } else if (emailIntent?.meta?.forcePreviewOnlyReason === "suspected_truncated_dictation") {
          (window as any).__fm_last_hint = {
            kind: "truncated_dictation",
            message:
              emailIntent.meta.uiHint ||
              "Das Diktat wirkt abgeschnitten. Bitte fortsetzen mit 'Neuer Text' oder erneut vollständig diktieren.",
            ts: Date.now(),
          };
          console.log("[wizard4][ui-hint] suspected_truncated_dictation -> hint set");
        } else if (metaAutoSend && isPreviewOnly && !isExplicitPreviewIntent && !hasCancelPhrase) {
          // Setze window-Flag für UI-Hinweis
          (window as any).__fm_last_hint = {
            kind: "autosend_safety_preview",
            message: 'Ich habe "Senden" erkannt, bleibe aber zur Sicherheit im Entwurf. Sag: "schick jetzt raus".',
            ts: Date.now()
          };
          console.log("[wizard4][ui-hint] autosend recognized but kept previewOnly -> hint shown");
        }
      }
      
      // ============================================================
      // PHASE 2: Contact Resolver anwenden (toEmail + toName aktualisieren)
      // ============================================================
      let finalToEmail: string | null = null;
      let safeAutoSendEmail: string | null = null;
      let recipientResolutionState: "not_attempted" | "resolved" | "ambiguous" | "no_match" | "api_error" = "not_attempted";
      let recipientAmbiguityChoices: string[] = [];
      let recipientResolutionInputRaw = "";
      
      try {
        // Kandidaten aus intent + draft extrahieren
        const fromIntentToRaw = (intent && typeof (intent as any).toRaw === 'string') 
          ? String((intent as any).toRaw).trim() 
          : '';
        const fromIntentTo = (intent && typeof (intent as any).to === 'string') 
          ? String((intent as any).to).trim() 
          : '';
        const fromDraftName = (wizard4Draft && typeof wizard4Draft.toName === 'string') 
          ? wizard4Draft.toName.trim() 
          : '';
        const fromDraftToEmail = (wizard4Draft && typeof wizard4Draft.toEmail === 'string') 
          ? wizard4Draft.toEmail.trim() 
          : '';
        
        // Resolver-Pipeline:
        // 1) intent.toEmail (falls im Intent direkt erkannt) -> direkt verwenden
        // 2) draft.toEmail (falls vorhanden) -> verwenden
        // 3) resolveContact(toName) via JSON -> verwenden
        // 4) sonst: kein AutoSend, Draft bleibt offen
        
        // Schritt 1 & 2: Prüfe auf vorhandene E-Mail
        const primary = fromIntentTo || fromDraftToEmail || fromIntentToRaw;
        const extracted = primary ? extractEmailFromText(primary) : null;
        
        if (extracted && isStrictValidEmail(extracted)) {
          finalToEmail = extracted;
        }
        
        // Basis-Zeichenkette für den Resolver in dieser Priorität:
        const baseForResolver = fromIntentToRaw || fromIntentTo || fromDraftName || fromDraftToEmail || '';
        
        // Bereinige diese Basis mit der Helper-Funktion
        const cleanedForResolver = cleanNameForResolver(baseForResolver);
        const fallbackFromSourceText =
          extractNameAfterAn((intent as any)?.sourceText || "") ||
          extractNameAfterAn((wizard4Draft as any)?.sourceText || "");
        const finalNameForResolver = !isResolverPlaceholderName(cleanedForResolver)
          ? cleanedForResolver
          : fallbackFromSourceText;
        recipientResolutionInputRaw = (
          fromIntentToRaw ||
          fromIntentTo ||
          fromDraftName ||
          finalNameForResolver ||
          ""
        ).toString().trim();

        if (wizard4Draft && finalNameForResolver && finalNameForResolver.trim()) {
          const existingName = (wizard4Draft.toName || "").toString().trim();
          if (!existingName || isResolverPlaceholderName(existingName)) {
            wizard4Draft.toName = finalNameForResolver;
          }
        }
        
        // Schritt 3: Contact Resolver (nur wenn noch keine E-Mail vorhanden) - JETZT MIT AWAIT
        const resolverStartedAtMs = nowMs();
        if (!finalToEmail && finalNameForResolver && finalNameForResolver.trim()) {
          timingMark("email-compose-resolver-start", {
            resolverInput: finalNameForResolver,
          });
          console.log('[fm-voice][wizard4][contact-resolver] Versuche Kontakt aufzulösen:', finalNameForResolver);
          
          try {
            const resolveUrl = `${backendBase()}/api/contacts/resolve?name=${encodeURIComponent(finalNameForResolver)}`;
            const fetchResolverWithTimeout = async (timeoutMs: number): Promise<Response> => {
              const resolverAbortController = new AbortController();
              const resolverTimeout = setTimeout(() => resolverAbortController.abort(), timeoutMs);
              return fetch(resolveUrl, {
                signal: resolverAbortController.signal,
              }).finally(() => clearTimeout(resolverTimeout));
            };
            const inputTokenCount = finalNameForResolver.trim().split(/\s+/).filter(Boolean).length;
            const firstTimeoutMs = isMobileVoiceShell() ? 4500 : 1200;
            const retryTimeoutMs = isMobileVoiceShell() ? 6000 : 2200;
            let resolveResponse: Response;
            try {
              resolveResponse = await fetchResolverWithTimeout(firstTimeoutMs);
            } catch (firstErr) {
              const firstAbort = (firstErr as any)?.name === "AbortError";
              const allowSingleRetry = firstAbort && inputTokenCount <= 2;
              if (!allowSingleRetry) throw firstErr;
              console.warn("[fm-voice][wizard4][contact-resolver] Timeout, retry once:", {
                input: finalNameForResolver,
                inputTokenCount,
              });
              resolveResponse = await fetchResolverWithTimeout(retryTimeoutMs);
            }
            
            if (resolveResponse.ok) {
              const contentType = (resolveResponse.headers.get("content-type") || "").toLowerCase();
              if (!contentType.includes("application/json")) {
                const raw = await resolveResponse.text().catch(() => "");
                console.warn(
                  '[fm-voice][wizard4][contact-resolver] Unerwarteter Response-Typ (kein JSON), Resolver wird uebersprungen:',
                  { contentType, preview: raw.slice(0, 120) }
                );
              } else {
                const resolveData = await resolveResponse.json();
                console.log('[fm-voice][wizard4][contact-resolver] Response:', resolveData);
                
                if (resolveData.ok && resolveData.email && isStrictValidEmail(resolveData.email)) {
                  finalToEmail = resolveData.email;
                  recipientResolutionState = "resolved";
                  (window as any).__fm_contact_ambiguity_choices = null;
                  console.log('[fm-voice][wizard4][contact-resolver] Kontakt aufgelöst:', finalNameForResolver, '->', finalToEmail);
                  
                  // Draft-Felder setzen, damit AutoSend-Guard die E-Mail erkennt
                  if (wizard4Draft) {
                    wizard4Draft.toEmail = resolveData.email;
                    if ((wizard4Draft as any).to !== undefined) {
                      (wizard4Draft as any).to = resolveData.email;
                    }
                    
                    // Anzeigenamen aus Resolver-Response übernehmen (für saubere Anrede)
                    const resolvedDisplayName =
                      resolveData?.matchedContact?.displayName ||
                      resolveData?.matchedContact?.name ||
                      wizard4Draft.toName;
                    
                    if (resolvedDisplayName && typeof resolvedDisplayName === 'string') {
                      wizard4Draft.toName = resolvedDisplayName;
                    }
                    
                    console.log('[fm-voice][wizard4][debug] resolver applied:', {
                      toEmail: wizard4Draft.toEmail,
                      to: (wizard4Draft as any).to,
                      toName: wizard4Draft.toName
                    });
                    
                    // safeAutoSendEmail aktualisieren, damit der Guard die E-Mail erkennt
                    safeAutoSendEmail = normalizeEmailForAutoSend(resolveData.email);
                    
                    // Debug-Info in Draft speichern (optional, für spätere UI-Anzeige)
                    (wizard4Draft as any).toResolvedFrom = finalNameForResolver;
                    (wizard4Draft as any).contactResolution = {
                      matchedContact: resolveData.matchedContact,
                      debug: resolveData.debug
                    };
                  }
                } else if (resolveData?.ambiguity?.choices?.length) {
                  const uniqueChoices = (resolveData.ambiguity.choices as Array<{ displayName?: string; email?: string }>)
                    .slice(0, 5)
                    .map((choice) => ({
                      displayName: (choice.displayName || "").trim(),
                      email: (choice.email || "").trim(),
                    }))
                    .filter((choice) => !!choice.email || !!choice.displayName)
                    .filter((choice, idx, arr) => {
                      const key = `${(choice.email || "").toLowerCase()}::${(choice.displayName || "").toLowerCase()}`;
                      return arr.findIndex((x) => `${(x.email || "").toLowerCase()}::${(x.displayName || "").toLowerCase()}` === key) === idx;
                    })
                    .slice(0, 3);
                  const choices = uniqueChoices.map((choice, idx) => {
                    const normalizedEmail = (choice.email || "").trim();
                    const displayRaw = (choice.displayName || "").trim();
                    const displayWithoutEmail = normalizedEmail
                      ? displayRaw
                          .replace(new RegExp(`\\(\\s*${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\)`, "ig"), "")
                          .replace(new RegExp(`\\b${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), "")
                          .replace(/\s+/g, " ")
                          .trim()
                      : displayRaw;
                    const baseLabel = displayWithoutEmail || normalizedEmail || `Kontakt ${idx + 1}`;
                    return `Kontakt ${idx + 1}: ${baseLabel}`;
                  });
                  recipientResolutionState = "ambiguous";
                  recipientAmbiguityChoices = choices;
                  if (choices.length > 0) {
                    const choiceText = choices.join(" oder ");
                    const hintMessage = "Mehrdeutiger Kontakt. Sag bitte Kontakt 1, Kontakt 2 oder Kontakt 3.";
                    (intent as any).meta = {
                      ...((intent as any).meta ?? {}),
                      forcePreviewOnly: true,
                      forcePreviewOnlyReason: "missing_recipient",
                      uiHint: `Ich habe mehrere Kontakte gefunden: ${choiceText}. Wen meinst du genau? Sag Kontakt 1, Kontakt 2 oder Kontakt 3.`,
                    };
                    (window as any).__fm_contact_ambiguity_choices = {
                      input: finalNameForResolver,
                      ts: Date.now(),
                      choices: uniqueChoices.map((choice, idx) => ({
                        index: idx + 1,
                        displayName: choice.displayName || choice.email || `Kontakt ${idx + 1}`,
                        email: choice.email || "",
                        label: choices[idx],
                      })),
                    };
                    (window as any).__fm_last_hint = {
                      kind: "contact_ambiguous",
                      message: hintMessage,
                      ts: Date.now(),
                    };
                    if (typeof window?.dispatchEvent === "function") {
                      window.dispatchEvent(new CustomEvent("fm-hint-update"));
                    }
                    console.log("[fm-voice][wizard4][contact-resolver] ambiguity detected", {
                      input: finalNameForResolver,
                      choices,
                    });
                  }
                } else {
                  recipientResolutionState = "no_match";
                  console.log('[fm-voice][wizard4][contact-resolver] Kein Match gefunden für:', finalNameForResolver, resolveData.debug?.result);
                }
              }
            } else {
              console.warn('[fm-voice][wizard4][contact-resolver] API-Fehler:', resolveResponse.status);
              recipientResolutionState = "api_error";
              if (resolveResponse.status >= 500) {
                (window as any).__fm_last_hint = {
                  kind: "contact_resolver_unavailable",
                  message: "Kontaktauflösung ist gerade nicht verfügbar. Bitte E-Mail-Adresse nennen oder später erneut versuchen.",
                  ts: Date.now(),
                };
                if (typeof window?.dispatchEvent === "function") {
                  window.dispatchEvent(new CustomEvent("fm-hint-update"));
                }
              }
            }
          } catch (err) {
            recipientResolutionState = "api_error";
            const isAbortError = (err as any)?.name === "AbortError";
            if (isAbortError) {
              console.warn('[fm-voice][wizard4][contact-resolver] Timeout beim Auflösen:', finalNameForResolver);
            } else {
              console.error('[fm-voice][wizard4][contact-resolver] Fehler beim Auflösen:', err);
            }
            // Fehler nicht blockierend, wir versuchen es einfach nicht
          }
        }
        timingMark("email-compose-resolver-finished", {
          resolverMs: Math.max(0, Math.round(nowMs() - resolverStartedAtMs)),
          recipientResolutionState,
          hasFinalToEmail: !!finalToEmail,
        });
        
        // AutoSend-safe Normalisierung
        safeAutoSendEmail = normalizeEmailForAutoSend(finalToEmail || primary || '');
        
        console.log('[fm-voice][wizard4][debug] to-resolver', {
          fromIntentToRaw,
          fromIntentTo,
          fromDraftName,
          fromDraftToEmail,
          primary,
          extracted,
          finalToEmail,
          safeAutoSendEmail,
          resolvedInput: finalNameForResolver,
          resolvedViaContactResolver: finalToEmail && wizard4Draft && finalNameForResolver && !fromIntentTo && !fromDraftToEmail,
        });

        if (finalToEmail) {
          const guided = (window as any).__fm_guided_mail_context;
          if (guided && typeof guided === "object") {
            (window as any).__fm_guided_mail_context = {
              ...guided,
              stage: "recipient_set_choice",
              recipientName: (wizard4Draft?.toName || fromIntentToRaw || "").toString().trim() || guided.recipientName,
              recipientEmail: finalToEmail,
              ts: Date.now(),
            };
          }
        }

        const draftBodyCandidate = ((wizard4Draft?.body ?? "") as string).toString().trim();
        const intentBodyCandidate = (((intent as any)?.bodyHint ?? "") as string).toString().trim();
        const hasBodyForGuidedRecipient = (intentBodyCandidate || draftBodyCandidate).length > 0;
        const unresolvedRecipient =
          !finalToEmail &&
          hasBodyForGuidedRecipient &&
          (!finalNameForResolver || !isStrictValidEmail(finalNameForResolver));
        if (unresolvedRecipient) {
          const guidedBodyText = intentBodyCandidate || draftBodyCandidate;
          const recipientInputLabel = recipientResolutionInputRaw || finalNameForResolver || "den Empfänger";
          const recipientHint = recipientResolutionState === "ambiguous" && recipientAmbiguityChoices.length > 0
            ? `Ich habe mehrere Kontakte gefunden: ${recipientAmbiguityChoices.join(" oder ")}. Wen meinst du genau?`
            : recipientResolutionState === "no_match" && !!finalNameForResolver
              ? `Ich finde keinen Kontakt zu "${recipientInputLabel}". Nenne bitte den vollen Namen oder die E-Mail-Adresse.`
              : recipientResolutionState === "api_error"
                ? "Kontaktauflösung dauert gerade zu lange. Nenne bitte den vollen Namen oder direkt die E-Mail-Adresse."
              : !finalNameForResolver
                ? "Entschuldigung, den Empfänger habe ich nicht sicher verstanden. Nenne bitte nur den Empfänger oder die E-Mail-Adresse."
                : intentBodyCandidate.length > 0
                  ? "Kein Empfänger erkannt. Nenne mir bitte den Empfänger oder die E-Mail-Adresse."
                  : "Kein Empfänger erkannt. Nenne mir bitte den Empfänger. Danach diktiere ich den Text.";
          const hintKind = recipientResolutionState === "ambiguous"
            ? "contact_ambiguous"
            : recipientResolutionState === "no_match"
              ? "contact_not_found"
              : "missing_to";
          (intent as any).meta = {
            ...((intent as any).meta ?? {}),
            forcePreviewOnly: true,
            forcePreviewOnlyReason: "missing_recipient",
            uiHint: recipientHint,
          };
          (window as any).__fm_last_hint = {
            kind: hintKind,
            message: recipientHint,
            ts: Date.now(),
          };
          if (typeof window?.dispatchEvent === "function") {
            window.dispatchEvent(new CustomEvent("fm-hint-update"));
          }
          try {
            (window as any).__fm_guided_mail_context = {
              stage: "need_recipient",
              bodyText: guidedBodyText,
              subjectHint: (wizard4Draft?.subject ?? "Kurze Info").toString(),
              ts: Date.now(),
            };
          } catch {
            // ignore guided context storage errors
          }
          console.log("[wizard4][ui-hint] missing_recipient -> hint set");
        }
      } catch (err) {
        console.error('[fm-voice][wizard4][debug] to-resolver error', err);
      }
      
      // ============================================================
      // PHASE 3: Body neu bauen MIT finalen toName/toEmail (nach Resolver)
      // ============================================================
      // Helper-Funktionen für Body-Bau (aus email.ts kopiert, da nicht exportiert)
      function normalizeTextForBody(text: string): string {
        let normalized = text.toLowerCase();
        normalized = normalized.replace(/\s+/g, ' ').trim();
        return normalized;
      }
      
      function stripSendNowPhrasesForBody(text: string): string {
        const sendNowPhrases = [
          'sofort raus',
          'schick sie sofort raus',
          'schick sofort raus',
          'schick raus',
          'hau raus'
        ];
        
        let result = text;
        for (const phrase of sendNowPhrases) {
          const idx = result.toLowerCase().indexOf(phrase.toLowerCase());
          if (idx !== -1) {
            result = result.substring(0, idx).trim();
            break;
          }
        }
        
        return result;
      }
      
      function extractContentFromSourceForBody(source: string): { core: string | null; marker: "dass" | "wegen" | "free" | null } {
        if (!source || !source.trim()) {
          return { core: null, marker: null };
        }
        
        const normalized = normalizeTextForBody(source);
        let core: string | null = null;
        let marker: "dass" | "wegen" | "free" | null = null;
        
        // a) "dass " im Satz
        const dassIdx = normalized.indexOf('dass ');
        if (dassIdx !== -1) {
          core = source.substring(dassIdx + 'dass '.length);
          core = stripSendNowPhrasesForBody(core);
          marker = 'dass';
        }
        // b) "wegen " im Satz
        else if (normalized.indexOf('wegen ') !== -1) {
          const wegenIdx = normalized.indexOf('wegen ');
          core = source.substring(wegenIdx + 'wegen '.length);
          core = stripSendNowPhrasesForBody(core);
          marker = 'wegen';
        }
        // c) ":" im originalen sourceText
        else if (source.includes(':')) {
          const colonIdx = source.indexOf(':');
          core = source.substring(colonIdx + 1);
          core = stripSendNowPhrasesForBody(core);
          marker = 'free';
        }
        // d) Nach "mail" noch Inhalt
        else {
          const mailPatterns = ['mail,', 'mail ', 'email ', 'e-mail ', 'mail.', 'email.', 'e-mail.'];
          let mailIdx = -1;
          for (const pattern of mailPatterns) {
            const idx = normalized.indexOf(pattern);
            if (idx !== -1) {
              mailIdx = idx + pattern.length;
              break;
            }
          }
          
          if (mailIdx !== -1 && mailIdx < source.length) {
            core = source.substring(mailIdx);
            core = stripSendNowPhrasesForBody(core);
            marker = 'free';
          }
        }
        
        // e) Wenn core nach trim leer ist
        if (!core || !core.trim()) {
          return { core: null, marker: null };
        }
        
        return { core: core.trim(), marker };
      }
      
      function formatRecipientNameForBody(raw?: string | null): string {
        if (!raw) return "dir";
        
        let text = raw.trim().toLowerCase();
        if (!text) return "dir";
        text = text.replace(/\s+/g, " ");
        if (text === "freiraum beratung") {
          return "Freiraum Beratung";
        }
        if (text === "freiraumberatung") {
          return "Freiraumberatung";
        }
        const parts = text.split(" ");
        const formatted = parts
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        return formatted || "dir";
      }
      
      function ensureSentenceEndsForBody(text: string): string {
        const trimmed = text.trim();
        if (!trimmed) return text;
        const last = trimmed[trimmed.length - 1];
        if ([".", "!", "?"].includes(last)) {
          return trimmed;
        }
        return `${trimmed}.`;
      }
      
      function buildBodyFromSource(sourceText: string, toName?: string | null): string | null {
        const extracted = extractContentFromSourceForBody(sourceText);
        
        if (!extracted.core || !extracted.marker) {
          return null;
        }
        
        let coreTrimmed = extracted.core.trim();
        if (!coreTrimmed) {
          return null;
        }
        
        if (coreTrimmed.endsWith(':')) {
          coreTrimmed = coreTrimmed.slice(0, -1).trim();
        }
        
        const name = formatRecipientNameForBody(toName);
        let body: string;
        
        if (extracted.marker === 'dass') {
          let inner = coreTrimmed.replace(/^,?\s*/, "");
          inner = inner.replace(/^dass\s+/i, "");
          inner = inner.trim();
          inner = inner.replace(/[.!?]+$/, "").trim();
          
          const sentence = `ich wollte dir nur kurz Bescheid geben, dass ${inner}`;
          body = `Hi ${name},\n\n${ensureSentenceEndsForBody(sentence)}`;
          
        } else if (extracted.marker === 'wegen') {
          let inner = coreTrimmed.replace(/^,?\s*/, "").trim();
          inner = inner.replace(/[.!?]+$/, "").trim();
          
          const sentence = `ich wollte dir kurz wegen ${inner} schreiben`;
          body = `Hi ${name},\n\n${ensureSentenceEndsForBody(sentence)}`;
          
        } else {
          let freeText = coreTrimmed;
          freeText = freeText.replace(/,\s+meld(e|st|en)/i, " und meld$1");
          
          body = `Hi ${name},\n\n${ensureSentenceEndsForBody(freeText)}`;
        }
        
        return body;
      }
      
      // JETZT Body neu bauen mit finalen toName/toEmail (nach Resolver)
      // EXPLICIT BODY WINS: Prüfe zuerst, ob ein expliziter bodyHint vorhanden ist
      // Wenn ja, überspringe alle Template/Status-Gehirn-Logik
      if (wizard4Draft && wizard4Draft.sourceText) {
        const source = wizard4Draft.sourceText.trim();
        if (source) {
          // AUFGABE B: Guard-Condition für Status-Brain - verhindert explicit-body Überschreibung
          const emailIntent: any = intent;
          const intentSource = emailIntent?.meta?.source;
          const statusBrain = emailIntent?.meta?.statusBrain;
          
          // Status-Brain: Template-Body bereits in bodyHint, aber Name muss noch vom Contact Resolver gesetzt werden
          if (intentSource === "status-brain" && statusBrain?.usedTemplate) {
            // Status-Brain Template-Body verwenden, aber Name vom Contact Resolver übernehmen
            const resolvedContactName = wizard4Draft.toName || "";
            const templateBody = intent.bodyHint && intent.bodyHint.trim().length > 0 ? intent.bodyHint.trim() : "";
            let finalBody = templateBody;
            
            if (resolvedContactName && finalBody) {
              // Ersetze "Hi," durch "Hi {Name}," wenn Name vorhanden ist
              // Wichtig: buildStatusEmailBody gibt bereits "Hi,\n\n..." zurück,
              // also müssen wir das \n\n beim Ersetzen erhalten
              finalBody = finalBody.replace(/^Hi,\s*\n\n/m, `Hi ${resolvedContactName},\n\n`);
              // Fallback: Falls nur ein \n vorhanden ist (sollte nicht passieren, aber sicherheitshalber)
              if (finalBody === templateBody && !finalBody.includes(`Hi ${resolvedContactName}`)) {
                finalBody = finalBody.replace(/^Hi,\s*\n/m, `Hi ${resolvedContactName},\n\n`);
              }
              // Fallback: Falls kein \n vorhanden ist (sollte nicht passieren)
              if (finalBody === templateBody && !finalBody.includes(`Hi ${resolvedContactName}`)) {
                finalBody = finalBody.replace(/^Hi,\s+/m, `Hi ${resolvedContactName},\n\n`);
              }
            }
            
            // FIX 2: Stelle sicher, dass nach "Hi Name," oder "Hi," eine Leerzeile kommt
            // (formatGreetingBody ist defensiv und prüft nochmal, falls etwas schiefging)
            finalBody = formatGreetingBody(finalBody);
            
            wizard4Draft.body = finalBody;
            console.log('[status-brain][wizard4] Using Status-Brain template body with resolved name', {
              toName: resolvedContactName,
              category: statusBrain.category,
              bodyPreview: finalBody.substring(0, 100)
            });
            console.log('[wizard4][explicit-body] skipped due to status-brain source');
          } else {
            // EXPLICIT BODY WINS: Höchste Priorität - wenn expliziter bodyHint vorhanden, verwende diesen IMMER
            // ABER: Nur wenn es NICHT von Status-Brain kommt
            const explicitBodyHint = intent.bodyHint && intent.bodyHint.trim().length > 0 ? intent.bodyHint.trim() : null;
            
            if (explicitBodyHint) {
              // Expliziter bodyHint (nicht von Status-Brain) - direkt verwenden
              wizard4Draft.body = explicitBodyHint;
              console.log('[wizard4][explicit-body] Explicit bodyHint found -> skip template/ai draft, using bodyHint directly', {
                bodyHintPreview: explicitBodyHint.substring(0, 100)
              });
            } else {
              // Nur wenn KEIN expliziter bodyHint vorhanden ist, verwende Template/Status-Gehirn
              // Prüfe, ob es eine Status-Mail ist (via meta.statusEmail)
              const emailIntent: any = intent;
              const statusMeta = emailIntent?.meta?.statusEmail;
              const freeDictationMeta = emailIntent?.meta?.freeDictationMeta;
              
              // Sicherstellen, dass Anrede NIEMALS "Hi dem," wird
              // Priorität: 1) Resolver-Name, 2) StatusMeta.toNameRaw (sauber extrahiert), 3) leer
              const resolvedContactName = wizard4Draft.toName || "";
              const toDisplayName = 
                resolvedContactName ||
                (statusMeta?.toNameRaw && statusMeta.toNameRaw.trim()) ||
                (freeDictationMeta?.toNameRaw && freeDictationMeta.toNameRaw.trim()) ||
                "";
              
              // A3.4 – Free-Diktat: Body 1:1 aus bodyHint übernehmen (kein Status-Gehirn)
              // Free-Diktat hat IMMER Priorität vor Status-Logik
              // Also handles "lass-uns" intents (which use the same freeDictationMeta structure)
              if (freeDictationMeta) {
                const freeDictationBody = freeDictationMeta.bodyText || intent.bodyHint || "";
                if (freeDictationBody.trim().length > 0) {
                  wizard4Draft.body = freeDictationBody.trim();
                  const intentSource = (emailIntent as any)?.meta?.source || 'free-dictation';
                  console.debug('[fm-voice][wizard4][body] Free-Diktat Body 1:1 übernommen', { 
                    sourceText: wizard4Draft.sourceText, 
                    toName: wizard4Draft.toName, 
                    resolvedContactName,
                    toDisplayName,
                    body: wizard4Draft.body,
                    isFreeDictation: true,
                    intentSource: intentSource
                  });
                }
              }
              // TASK 2: Also check for lass-uns intents that might not have freeDictationMeta
              // (fallback for any edge cases)
              else if ((emailIntent as any)?.meta?.source === 'lass-uns' && intent.bodyHint) {
                const lassUnsBody = intent.bodyHint.trim();
                if (lassUnsBody.length > 0) {
                  wizard4Draft.body = lassUnsBody;
                  console.debug('[fm-voice][wizard4][body] Lass-uns Body 1:1 übernommen', { 
                    sourceText: wizard4Draft.sourceText, 
                    toName: wizard4Draft.toName, 
                    resolvedContactName,
                    toDisplayName,
                    body: wizard4Draft.body,
                    isLassUns: true
                  });
                }
              }
              // Verwende das neue Status-Gehirn für Status-Mails (nur wenn KEIN Free-Diktat)
              else if (statusMeta?.isStatus && !freeDictationMeta) {
                const statusResult = buildStatusEmailBody({
                  rawText: statusMeta.rawText || source,
                  statusText: statusMeta.statusText || undefined,
                  toDisplayName: toDisplayName || undefined,
                });
                
                if (statusResult && statusResult.trim().length > 0) {
                  wizard4Draft.body = statusResult.trim();
                  console.debug('[fm-voice][wizard4][body] styled from Status-Gehirn nach Resolver', { 
                    sourceText: wizard4Draft.sourceText, 
                    toName: wizard4Draft.toName, 
                    resolvedContactName,
                    toDisplayName,
                    body: wizard4Draft.body,
                    isStatus: true
                  });
                }
              }
              // Fallback: Alte Logik für non-Status-Mails (nur wenn KEIN Free-Diktat)
              else if (!freeDictationMeta) {
                // Extrahiere bodyHint aus dem Intent (message-Feld)
                const bodyHint = wizard4Draft.intent?.message || null;
                
                const statusResult = buildStatusEmailBody({
                  rawText: source,
                  statusText: bodyHint || null,
                  toDisplayName: toDisplayName || undefined,
                });
                
                if (statusResult && statusResult.trim().length > 0) {
                  wizard4Draft.body = statusResult.trim();
                  console.debug('[fm-voice][wizard4][body] styled from Status-Gehirn nach Resolver', { 
                    sourceText: wizard4Draft.sourceText, 
                    toName: wizard4Draft.toName,
                    toDisplayName,
                    body: wizard4Draft.body
                  });
                }
              }
              // Wenn Body leer ist, bleibt der vorhandene Body erhalten (Fallback)
            }
          }
        }
      }
      
      console.debug('[fm-voice][wizard4][debug] draft nach Body-Build:', wizard4Draft);
      
      // Empfänger ins UI setzen (wenn möglich)
      if (finalToEmail && typeof (w as any).__fm_set_mail_to === 'function') {
        console.log('[fm-voice] email-compose (Wizard4): __fm_set_mail_to (resolved)', finalToEmail);
        try {
          (w as any).__fm_set_mail_to(finalToEmail);
        } catch (err) {
          console.error('[fm-voice] Fehler beim Setzen von __fm_set_mail_to (resolved):', err);
        }
      }
      
      // Betreff bestimmen: draft.subject / intent.subject behalten; Default "Kurze Info" nur wenn wirklich keiner gesetzt
      const emailIntentForSubject: any = intent;
      const freeDictationMetaForSubject = emailIntentForSubject?.meta?.freeDictationMeta;
      const hasExplicitSubject = !!(wizard4Draft as any)?.hasExplicitSubject && wizard4Draft?.subject?.trim();
      const intentExplicitSubjectTrimmed = (
        explicitSubjectFromCurrentCompose ||
        ((emailIntentForSubject?.explicitSubject && typeof emailIntentForSubject?.explicitSubject === 'string')
          ? String(emailIntentForSubject?.explicitSubject).trim()
          : '')
      ).trim();
      const draftSubjectTrimmed = wizard4Draft?.subject?.trim();
      const intentSubjectTrimmed = (emailIntentForSubject?.subject ?? emailIntentForSubject?.subjectHint) && typeof (emailIntentForSubject?.subject ?? emailIntentForSubject?.subjectHint) === 'string'
        ? String((emailIntentForSubject?.subject ?? emailIntentForSubject?.subjectHint)).trim()
        : '';
      const isSubjectLocked = !!w.__fm_subject_locked || !!(wizard4Draft as any)?.meta?.subjectLocked;
      const lockedSubjectValue = ((w.__fm_subject_locked_value ?? '') as string).toString().trim();
      const currentUiSubject = ((w.__fm_get_mail_subject?.() ?? '') as string).toString().trim();
      let forceSetExplicitCurrentCompose = false;
      let forceSetExplicitPrevious = currentUiSubject;
      let subject: string;

      if ((w as any).__fm_subject_manually_edited && typeof (w as any).__fm_get_mail_subject === 'function') {
        const uiSubject = ((w as any).__fm_get_mail_subject() ?? '').toString().trim();
        subject = uiSubject || 'Kurze Info';
        console.log('[wizard4][subject] keeping manual-edit, skip override:', subject);
      } else if (intentExplicitSubjectTrimmed) {
        subject = intentExplicitSubjectTrimmed;
        forceSetExplicitCurrentCompose = true;
        forceSetExplicitPrevious = currentUiSubject;
        w.__fm_subject_locked = true;
        w.__fm_subject_locked_value = intentExplicitSubjectTrimmed;
        const activeContextUid = getSelectedMailContext()?.uid ?? null;
        w.__fm_subject_lock_context_uid = activeContextUid ? String(activeContextUid) : null;
        (wizard4Draft as any).meta = { ...((wizard4Draft as any).meta ?? {}), subjectLocked: true };
        console.log(`[wizard4][subject-lock] locked subject="${intentExplicitSubjectTrimmed}"`);
        console.log('[wizard4][subject] using explicitSubject from source:', subject);
      } else if (hasExplicitSubject || draftSubjectTrimmed) {
        subject = (wizard4Draft!.subject ?? '').trim();
        console.log('[wizard4][subject] keeping explicitSubject/draft, skip override:', subject);
      } else if (isSubjectLocked) {
        subject = currentUiSubject || lockedSubjectValue || draftSubjectTrimmed || 'Kurze Info';
        (wizard4Draft as any).meta = { ...((wizard4Draft as any).meta ?? {}), subjectLocked: true };
        console.log('[wizard4][subject-lock] keep existing subject because locked');
        console.log('[wizard4][subject-lock] skip heuristic override because locked');
      } else if (intentSubjectTrimmed) {
        subject = intentSubjectTrimmed;
        console.log('[wizard4][subject] using intent subject:', subject);
      } else {
        subject = "Kurze Info";
        console.log("[wizard4][subject] no subject provided -> forcing default 'Kurze Info'");
      }
      if (!intentExplicitSubjectTrimmed && !hasExplicitSubject && isHeuristicGuessedSubject(subject)) {
        subject = "Kurze Info";
        console.log("[wizard4][subject] replaced heuristic guess with Kurze Info");
      }
      
      // FIX: Final-Body-Zuweisung - bodyForUi MUSS hier definiert werden, damit es immer verfügbar ist
      // AUFGABE B: Guard-Condition für Status-Brain - verhindert explicit-body Überschreibung
      const emailIntentForBody: any = intent;
      const intentSourceForBody = emailIntentForBody?.meta?.source;
      
      // FIX: bodyForUi MUSS hier definiert werden, damit es immer verfügbar ist (vor allen if-Blöcken)
      let bodyForUi = "";
      
      if (intentSourceForBody === "status-brain") {
        // Status-Brain: Verwende den bereits gesetzten Draft-Body (mit aufgelöstem Namen)
        bodyForUi = typeof wizard4Draft?.body === "string" && wizard4Draft.body.trim().length > 0
          ? wizard4Draft.body
          : (intent.bodyHint ?? "").trim();
        console.log('[wizard4][explicit-body] skipped due to status-brain source, using draft body');
      } else {
        // EXPLICIT BODY WINS: Prüfe zuerst, ob ein expliziter bodyHint vorhanden ist (nur bei Nicht-Status-Brain)
        let explicitBodyHint = intent.bodyHint && intent.bodyHint.trim().length > 0 ? intent.bodyHint.trim() : null;
        const explicitBodyHintForLog = explicitBodyHint || "";
        
        // FIX: Rewrite führende "dass"-Klausel für autoSend-Intents
        // Wird VOR polish und VOR __fm_set_mail_body angewendet
        if (explicitBodyHint && intent.meta?.autoSend && typeof explicitBodyHint === 'string') {
          const rewritten = rewriteLeadingDassClause(explicitBodyHint);
          if (rewritten !== explicitBodyHint) {
            explicitBodyHint = rewritten;
            // Aktualisiere auch intent.bodyHint für spätere Verwendung
            (intent as any).bodyHint = rewritten;
            console.log('[wizard4][dass-rewrite] Rewrote leading "dass" clause', {
              original: explicitBodyHintForLog.substring(0, 80),
              rewritten: rewritten.substring(0, 80)
            });
            // Pronoun-Fix: "Ich ... ihn/ihm" -> "dich/dir" wenn Empfänger gesetzt (Mail an jemanden)
            const toNameForFix = (intent as any).toRaw ?? (intent as any).toName ?? wizard4Draft?.toName;
            if (toNameForFix && (typeof toNameForFix === 'string' && toNameForFix.trim().length > 0) && /^Ich\s/i.test(explicitBodyHint) && !/^Wir\s/i.test(explicitBodyHint)) {
              const beforeFix = explicitBodyHint;
              explicitBodyHint = explicitBodyHint.replace(/\bihn\b/gi, 'dich').replace(/\bihm\b/gi, 'dir');
              if (explicitBodyHint !== beforeFix) {
                (intent as any).bodyHint = explicitBodyHint;
                console.log('[wizard4][dass-rewrite][pronoun-fix] before:', beforeFix.slice(0, 80));
                console.log('[wizard4][dass-rewrite][pronoun-fix] after:', explicitBodyHint.slice(0, 80));
              }
            }
            // STT formal guard: "Ihnen" (STT-Fehler für "ihn") -> "dich" nur bei "Ich "-Satz und Empfänger, ohne "Sie"
            if (toNameForFix && (typeof toNameForFix === 'string' && toNameForFix.trim().length > 0) && /^Ich\s/i.test(explicitBodyHint) && /\bIhnen\b/i.test(explicitBodyHint) && !/\bSie\b/.test(explicitBodyHint)) {
              const beforeGuard = explicitBodyHint;
              explicitBodyHint = explicitBodyHint.replace(/\bIhnen\b/gi, 'dich').replace(/\bihnen\b/gi, 'dich');
              if (explicitBodyHint !== beforeGuard) {
                (intent as any).bodyHint = explicitBodyHint;
                console.log('[wizard4][dass-rewrite][stt-formal-guard] before:', beforeGuard.slice(0, 80));
                console.log('[wizard4][dass-rewrite][stt-formal-guard] after:', explicitBodyHint.slice(0, 80));
              }
            }
          }
        }
        
        if (explicitBodyHint) {
          bodyForUi = stripLeadingSubjectEcho(explicitBodyHint, subject);
          console.log('[wizard4][explicit-body] Using explicit bodyHint as final body', {
            bodyPreview: bodyForUi.substring(0, 100)
          });
        } else {
          // Fallback: Verwende Draft-Body, falls vorhanden
          bodyForUi = typeof wizard4Draft?.body === "string" && wizard4Draft.body.trim().length > 0
            ? wizard4Draft.body
            : "";
          
          // Free-Diktat: Falls Body immer noch leer, direkt aus freeDictationMeta nehmen
          // Also handles "lass-uns" intents (which use the same freeDictationMeta structure)
          if (freeDictationMetaForSubject && (!bodyForUi || bodyForUi.trim().length === 0)) {
            bodyForUi = freeDictationMetaForSubject.bodyText || "";
            const intentSource = (emailIntentForSubject as any)?.meta?.source || 'free-dictation';
            console.log('[fm-voice][wizard4][free-dictation] Body aus meta.freeDictationMeta.bodyText übernommen:', bodyForUi.substring(0, 80), 'source:', intentSource);
          }
          // TASK 2: Fallback for lass-uns intents without freeDictationMeta (edge case)
          if (!freeDictationMetaForSubject && (emailIntentForSubject as any)?.meta?.source === 'lass-uns' && intent.bodyHint && (!bodyForUi || bodyForUi.trim().length === 0)) {
            bodyForUi = intent.bodyHint;
            console.log('[fm-voice][wizard4][lass-uns] Body aus intent.bodyHint übernommen:', bodyForUi.substring(0, 80));
          }
        }
      }
      
      // MISSING_BODY LOCK: Bei missing_body Body garantiert leer, kein Template/Draft
      if ((intent as any)?.meta?.forcePreviewOnlyReason === 'missing_body') {
        bodyForUi = "";
        if (wizard4Draft) wizard4Draft.body = "";
        console.log('[wizard4][missing-body-lock] forcing empty bodyForUi, skipping draft/template');
      }
      
      // FIX: Stelle sicher, dass bodyForUi IMMER ein String ist (defensive programming)
      bodyForUi = (bodyForUi ?? "").toString();
      
      // Sicherheitsregel: kein Placeholder-Body für sendNow.
      // Bei leerem Body immer previewOnly statt Versand.
      let body: string | null = bodyForUi || null;
      if (wizard4Draft?.sendMode === 'sendNow' && (!body || body.trim().length === 0)) {
        wizard4Draft.sendMode = 'previewOnly';
        (wizard4Draft as any).forcePreviewOnlyReason = 'missing_body';
        console.warn('[fm-voice][wizard4] sendNow blockiert: body leer -> previewOnly');
      }
      
      // ============================================================
      // POLISH FRÜH STARTEN: Starte Polish parallel, bevor UI gesetzt wird
      // ============================================================
      // FIX: Wenn bodyHint vorhanden ist (explicit-body), verwende IMMER bodyHint für Polish
      // bodyHintRaw oder sourceText dürfen NICHT verwendet werden, wenn bodyHint existiert
      let rawBodyForPolish = (intent.bodyHint && intent.bodyHint.trim().length > 0)
        ? intent.bodyHint.trim()
        : ((intent.bodyHintRaw && intent.bodyHintRaw.trim().length > 0) 
          ? intent.bodyHintRaw 
          : (body || ''));
      
      // Entferne führende Füllwörter vor Polish
      const cleanedBodyForPolish = stripLeadingFillerWords(rawBodyForPolish);
      if (cleanedBodyForPolish !== rawBodyForPolish) {
        console.log('[wizard4][filler-strip] applied', {
          before: rawBodyForPolish.substring(0, 50),
          after: cleanedBodyForPolish.substring(0, 50)
        });
        rawBodyForPolish = cleanedBodyForPolish;
      }
      
      console.log('[wizard4][explicit-body][polish-input] bodyHint present:', !!(intent.bodyHint && intent.bodyHint.trim().length > 0), {
        usingBodyHint: !!(intent.bodyHint && intent.bodyHint.trim().length > 0),
        bodyHintPreview: intent.bodyHint?.substring(0, 50),
        bodyHintRawPreview: intent.bodyHintRaw?.substring(0, 50),
        rawBodyForPolishPreview: rawBodyForPolish.substring(0, 50)
      });
      
      // Detect Status-Brain Quelle: KEIN Polish für Status-Brain Templates (sind bereits sauber)
      // Wiederverwende isStatusBrain aus früherem Block, falls vorhanden, sonst neu berechnen
      const intentSourceForPolish = (intent as any)?.meta?.source;
      const isStatusBrainForPolish = intentSourceForPolish === "status-brain";
      const hasStatusBrainTemplateForPolish = (intent as any)?.meta?.statusBrain?.usedTemplate === true;
      
      // Guard: Kein Polish bei missing_body oder Body < 5 Zeichen (kein /api/ai/chat, kein Template)
      const isMissingBodyOrTooShort =
        (intent as any)?.meta?.forcePreviewOnlyReason === 'missing_body' ||
        rawBodyForPolish.trim().length < 5;
      
      // Prüfe, ob wir polishen sollten
      const shouldPolish = 
        rawBodyForPolish.trim().length > 0 && 
        wizard4Draft && 
        !isStatusBrainForPolish &&
        !hasStatusBrainTemplateForPolish &&
        !isMissingBodyOrTooShort;
      
      // Starte Polish früh (parallel), speichere Promise
      let polishPromise: Promise<any> | null = null;
      let polishStartedAtMs = 0;
      let polishRuntimeProfile: ReturnType<typeof getPolishRuntimeProfile> | null = null;
      if (shouldPolish) {
        const sendMode = wizard4Draft.sendMode || 'previewOnly';
        const mode = sendMode === 'sendNow' ? 'sendNow' : 'previewOnly';
        polishRuntimeProfile = getPolishRuntimeProfile(mode, rawBodyForPolish.length);
        
        polishStartedAtMs = nowMs();
        timingMark("email-compose-polish-start", {
          mode,
          timeoutMs: polishRuntimeProfile.timeoutMs,
          baseTimeoutMs: polishRuntimeProfile.baseTimeoutMs,
          longDictation: polishRuntimeProfile.isLongDictation,
          veryLongDictation: polishRuntimeProfile.isVeryLongDictation,
          shortPrompt: polishRuntimeProfile.shortPrompt,
          bodyLength: rawBodyForPolish.length,
        });
        console.log('[wizard4][ai-polish] Starte Polish früh (parallel)', {
          mode,
          timeoutMs: polishRuntimeProfile.timeoutMs,
          baseTimeoutMs: polishRuntimeProfile.baseTimeoutMs,
          longDictation: polishRuntimeProfile.isLongDictation,
          veryLongDictation: polishRuntimeProfile.isVeryLongDictation,
          shortPrompt: polishRuntimeProfile.shortPrompt,
          bodyLength: rawBodyForPolish.length,
        });
        polishPromise = polishEmailBody(rawBodyForPolish, {
          mode,
          timeoutMs: polishRuntimeProfile.timeoutMs,
          shortPrompt: polishRuntimeProfile.shortPrompt,
        });
      } else {
        if (isMissingBodyOrTooShort) {
          console.log('[wizard4][ai-polish] skipped (missing_body or too_short)');
        } else if (isStatusBrainForPolish || hasStatusBrainTemplateForPolish) {
          console.log('[wizard4][ai-polish] skipped - Status-Brain Template (kein Polish nötig)');
        } else {
          console.log('[wizard4][ai-polish] skipped - body empty or other reason');
        }
      }
      if (!polishPromise) {
        timingMark("email-compose-polish-skipped", {
          longDictation: rawBodyForPolish.trim().length >= LONG_DICTATION_POLISH_THRESHOLD,
          veryLongDictation: rawBodyForPolish.trim().length >= VERY_LONG_DICTATION_POLISH_THRESHOLD,
          isMissingBodyOrTooShort,
          isStatusBrainForPolish,
          hasStatusBrainTemplateForPolish,
        });
      }
      
      // ============================================================
      // PHASE 4: UI-Updates und AutoSend
      // ============================================================
      
      // URL-Parameter für Navigation (optional, für Fallback-Rendering)
      const params = new URLSearchParams();
      if (finalToEmail) params.set("to", finalToEmail);
      if (subject) params.set("subject", subject);
      if (body) params.set("body", body);
      const qs = params.toString();
      
      navigate(`/mail/compose${qs ? `?${qs}` : ""}`);
      showTransitionMessage("Bereite E-Mail vor …");
      triggerEmotion("idea");
      
      // lastAction setzen für spätere KI-Integration
      const recipient = finalToEmail || (wizard4Draft && wizard4Draft.toName) || "Unbekannt";
      const description = `E-Mail an ${recipient}.`;
      setLastAction({ kind: "email-compose", description });
      
      // Warte kurz, damit die MailCompose-Komponente gemountet ist
      setTimeout(async () => {
        if (isStaleRun()) {
          console.log("[fm-voice][stale-run-guard] skip stale email-compose run before UI update", {
            runId: commandRunId,
            latestRunId: latestVoiceCommandRunId,
          });
          timingMark("email-compose-skipped-stale-run", {
            runId: commandRunId,
            latestRunId: latestVoiceCommandRunId,
          });
          return;
        }
        // ============================================================
        // KI-POLISHING: Warte auf Polish (bei sendNow) oder nutze Ergebnis (bei previewOnly)
        // WICHTIG: Bei sendNow wird hier AUSDRÜCKLICH auf Polish gewartet, bevor AutoSend startet
        // ============================================================
        // FIX: rawBodyForUi MUSS hier definiert werden für Logging (später verwendet)
        // rawBodyForPolish ist bereits außerhalb des setTimeout definiert
        const rawBodyForUi = rawBodyForPolish || body || '';
        let finalBodyForUi = rawBodyForUi;
        
        // ROBUSTE POLISH+AutoSend Pipeline
        if (polishPromise) {
          try {
            const sendMode = wizard4Draft.sendMode || 'previewOnly';
            const isSendNow = sendMode === 'sendNow';
            
            let polishResult = await polishPromise;
            
            // Optionaler Retry bei sendNow + timeout (nur für kurze Bodies, um Lastspitzen zu vermeiden)
            if (!polishResult.ok && polishResult.reason === 'timeout' && isSendNow) {
              console.log('[wizard4][ai-polish] Timeout bei sendNow, versuche Retry mit kürzerem Prompt', { bodyLength: rawBodyForUi.length });
              try {
                const retryTimeoutMs = Math.min(
                  8000,
                  getDynamicPolishTimeoutMs('sendNow', Math.max(40, Math.floor(rawBodyForUi.length * 0.55)))
                );
                polishResult = await polishEmailBody(rawBodyForUi, { mode: 'sendNow', timeoutMs: retryTimeoutMs, shortPrompt: true });
              } catch (retryErr) {
                console.warn('[wizard4][ai-polish] Retry fehlgeschlagen, verwende Original', retryErr);
              }
            }
            
            if (polishResult.ok && polishResult.usedAi && polishResult.body.trim().length > 0) {
              // Der Body wurde bereits in polishEmailBody sanitized, normalisiere zusätzlich
              const polished = polishResult.body;
              let normalizedBody = normalizeEmailBodyAfterPolish(polished);
              
              // Entferne Füllwörter auch nach Polish (falls welche durch Polish wieder eingefügt wurden)
              const cleanedAfterPolish = stripLeadingFillerWords(normalizedBody);
              if (cleanedAfterPolish !== normalizedBody) {
                normalizedBody = cleanedAfterPolish;
              }
              
              // Debug-Logs für Post-Polish-Normalisierung
              console.log("[wizard4][post-polish-normalize] before:", polished.slice(0, 180));
              console.log("[wizard4][post-polish-normalize] after:", normalizedBody.slice(0, 180));
              
              // Safety-Net: Entferne führendes "An <Name>." nach Polish
              const recipientHints = [
                intent.toRaw,
                wizard4Draft?.toName,
                finalToEmail?.split('@')[0], // E-Mail-Local-Part als Fallback
              ].filter(Boolean) as string[];
              
              finalBodyForUi = stripLeadingAnRecipient(normalizedBody, recipientHints);
              
              if (finalBodyForUi !== normalizedBody) {
                console.log('[wizard4][safety-net] Removed leading "An <Name>" after polish', {
                  before: normalizedBody.substring(0, 50),
                  after: finalBodyForUi.substring(0, 50)
                });
              }
              
              console.debug("[wizard4][ai-polish][normalize] before:", polished.substring(0, 100));
              console.debug("[wizard4][ai-polish][normalize] after:", finalBodyForUi.substring(0, 100));
              console.log('[wizard4][ai-polish] body polished (nach await)', { 
                sendMode, 
                mode: isSendNow ? 'sendNow' : 'previewOnly',
                originalLength: rawBodyForUi.length, 
                polishedLength: finalBodyForUi.length
              });
            } else {
              // Fallback: Original + lokale Rechtschreibung (immer, jede Länge)
              finalBodyForUi = rawBodyForUi;
              const locallyNormalized = normalizeFallbackBodyForSend(finalBodyForUi);
              if (locallyNormalized && locallyNormalized !== finalBodyForUi) {
                console.log("[wizard4][ai-polish] local fallback normalization applied", {
                  reason: polishResult.reason,
                  beforeLength: finalBodyForUi.length,
                  afterLength: locallyNormalized.length,
                });
                finalBodyForUi = locallyNormalized;
              }
              
              // Safety-Net: Entferne führendes "An <Name>." auch im no-polish Fallback
              const recipientHints = [
                intent.toRaw,
                wizard4Draft?.toName,
                finalToEmail?.split('@')[0], // E-Mail-Local-Part als Fallback
              ].filter(Boolean) as string[];
              
              finalBodyForUi = stripLeadingAnRecipient(finalBodyForUi, recipientHints);
              
              if (finalBodyForUi !== rawBodyForUi) {
                console.log('[wizard4][safety-net] Removed leading "An <Name>" in no-polish fallback', {
                  before: rawBodyForUi.substring(0, 50),
                  after: finalBodyForUi.substring(0, 50)
                });
              }
              
              // Verbessertes Logging für Fallback
              const logData: any = { 
                sendMode, 
                mode: isSendNow ? 'sendNow' : 'previewOnly',
                reason: polishResult.reason || 'not used',
                ok: polishResult.ok
              };
              
              // Bei sendNow und sentWithoutPolish Flag deutlich loggen
              if (isSendNow && polishResult.sentWithoutPolish === true) {
                console.warn('[wizard4][ai-polish] fallback reason:', polishResult.reason, '-> sending without polish (sendNow=true)', logData);
              } else {
                console.log('[wizard4][ai-polish] skipped/fallback', logData);
              }
            }
          } catch (err: any) {
            // DEFENSIV: Bei jedem Fehler Fallback auf Original, keine Exceptions werfen
            console.error('[wizard4][ai-polish] error during polishing, using original body:', err);
            finalBodyForUi = rawBodyForUi; // Sicherstellen, dass finalBodyForUi gesetzt ist
            const locallyNormalized = normalizeFallbackBodyForSend(finalBodyForUi);
            if (locallyNormalized && locallyNormalized !== finalBodyForUi) {
              finalBodyForUi = locallyNormalized;
              console.log("[wizard4][ai-polish] local fallback normalization applied after exception", {
                beforeLength: rawBodyForUi.length,
                afterLength: finalBodyForUi.length,
              });
            }
            
            // Safety-Net: Entferne führendes "An <Name>." auch im Error-Fallback
            const recipientHints = [
              intent.toRaw,
              wizard4Draft?.toName,
              finalToEmail?.split('@')[0], // E-Mail-Local-Part als Fallback
            ].filter(Boolean) as string[];
            
            finalBodyForUi = stripLeadingAnRecipient(finalBodyForUi, recipientHints);
            const sendMode = wizard4Draft.sendMode || 'previewOnly';
            const isSendNow = sendMode === 'sendNow';
            if (isSendNow) {
              console.warn('[wizard4][ai-polish] fallback -> sending without polish (sendNow=true, exception occurred):', err.message || 'unknown');
            }
          }
        }
        if (!polishPromise && shouldPolish) {
          const localBody = normalizeFallbackBodyForSend(rawBodyForUi);
          if (localBody) {
            finalBodyForUi = localBody;
            console.log('[wizard4][ai-polish] local spelling pass applied (no AI run)', {
              beforeLength: rawBodyForUi.length,
              afterLength: localBody.length,
            });
          }
        }
        if (finalBodyForUi?.trim()) {
          const spellingPass = normalizeFallbackBodyForSend(finalBodyForUi);
          if (spellingPass) {
            finalBodyForUi = spellingPass;
          }
        }
        if (polishPromise) {
          timingMark("email-compose-polish-finished", {
            polishMs: Math.max(0, Math.round(nowMs() - polishStartedAtMs)),
            usedFastPath: false,
            longDictation: !!polishRuntimeProfile?.isLongDictation,
            veryLongDictation: !!polishRuntimeProfile?.isVeryLongDictation,
            shortPrompt: !!polishRuntimeProfile?.shortPrompt,
            timeoutMs: polishRuntimeProfile?.timeoutMs ?? null,
            baseTimeoutMs: polishRuntimeProfile?.baseTimeoutMs ?? null,
          });
        } else {
          timingMark("email-compose-polish-finished", {
            polishMs: 0,
            usedFastPath: false,
            longDictation: rawBodyForPolish.trim().length >= LONG_DICTATION_POLISH_THRESHOLD,
            veryLongDictation: rawBodyForPolish.trim().length >= VERY_LONG_DICTATION_POLISH_THRESHOLD,
            shortPrompt: false,
            timeoutMs: null,
            baseTimeoutMs: null,
          });
        }
        
        // ============================================================
        // UI-UPDATE: Setze E-Mail-Felder (NACH Polishing, VOR AutoSend)
        // WICHTIG: Bei sendNow wurde hier bereits auf Polish gewartet (await)
        // ============================================================
        // Edgecase: Prüfe, ob UI noch gemountet ist (nicht unmounted)
        if (typeof window === 'undefined' || !w.__fm_set_mail_body) {
          console.warn('[wizard4][ai-polish] UI unmounted oder __fm_set_mail_body nicht verfügbar, überspringe UI-Update und AutoSend');
          return; // Beende den Callback, wenn UI nicht verfügbar
        }
        
        // MISSING_BODY LOCK: Kurz vor UI-Setzen – Body garantiert leer, __fm_set_mail_body("")
        if ((intent as any)?.meta?.forcePreviewOnlyReason === 'missing_body') {
          finalBodyForUi = '';
          body = '';
          if (wizard4Draft) wizard4Draft.body = '';
          console.log('[wizard4][missing-body-lock] forcing empty body, skipping any draft/template');
        }
        
        // Post-Polish: Führende Send-Adverbien entfernen (AI-Polish fügt sie ggf. wieder ein)
        const isSendNow = wizard4Draft?.sendMode === 'sendNow';
        if (isSendNow && finalBodyForUi?.trim()) {
          const re = /^(sofort|jetzt|direkt)\b\s*[,:;.]?\s*/i;
          if (re.test(finalBodyForUi.trim())) {
            const before = finalBodyForUi;
            finalBodyForUi = finalBodyForUi.trim().replace(re, '').trim();
            if (finalBodyForUi) finalBodyForUi = ensureTerminalPunctuation(finalBodyForUi);
            console.log('[wizard4][send-control-strip][send-adverb-leading][post-polish] before:', before.slice(0, 80));
            console.log('[wizard4][send-control-strip][send-adverb-leading][post-polish] after:', finalBodyForUi.slice(0, 80));

            if (finalBodyForUi?.trim()) {
              const beforeRepair = finalBodyForUi;
              const repaired = repairBodyAfterSendAdverbStrip(finalBodyForUi);
              if (repaired !== beforeRepair) {
                finalBodyForUi = repaired;
                console.log('[wizard4][send-control-strip][send-adverb-leading][repair] applied', { before: beforeRepair.slice(0, 80), after: finalBodyForUi.slice(0, 80) });
              }
            }
          }
        }
        
        // Sicherheitsnetz: Send-Steuerphrasen entfernen, bevor Body ins UI geht
        finalBodyForUi = stripSendControlPhrasesFinal(finalBodyForUi);
        if (wizard4Draft?.sendMode === 'previewOnly' && finalBodyForUi?.trim()) {
          const beforePreviewStrip = finalBodyForUi;
          finalBodyForUi = finalBodyForUi
            .replace(/\b(?:nur|bloß|bloss)\s+(?:zeigen|vorzeigen|anzeigen|darstellen)\b/gi, '')
            .replace(/\bals\s+entwurf\b/gi, '')
            .replace(/\bnur\s+vorbereiten\b/gi, '')
            .replace(/\s*,\s*\./g, '.')
            .replace(/\s*,\s*,+/g, ', ')
            .replace(/\s+,/g, ',')
            .replace(/,\s+/g, ', ')
            .replace(/,\s*$/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
          if (finalBodyForUi !== beforePreviewStrip) {
            console.log('[wizard4][preview-body-strip] removed preview commands', { before: beforePreviewStrip.slice(0, 60), after: finalBodyForUi.slice(0, 60) });
          }
        }
        // FIX: Stelle sicher, dass finalBodyForUi wirklich verwendet wird
        // Aktualisiere auch body und wizard4Draft.body, damit AutoSend den polierten Body verwendet
        body = finalBodyForUi;
        if (wizard4Draft) {
          wizard4Draft.body = finalBodyForUi;
        }
        const uiSetStartedAtMs = nowMs();
        
        // Setze E-Mail-Felder über Helper-Funktion mit Wizard4-Daten (mit poliertem Body)
        applyEmailToComposeUI({
          to: finalToEmail,
          subject: subject,
          body: finalBodyForUi,
          logPrefix: "[fm-voice] email-compose (Wizard4)",
        });
        timingMark("email-compose-ui-set-finished", {
          uiSetMs: Math.max(0, Math.round(nowMs() - uiSetStartedAtMs)),
          hasTo: !!finalToEmail,
          hasSubject: !!subject,
          bodyLength: finalBodyForUi.length,
        });
        if (forceSetExplicitCurrentCompose && typeof w.__fm_set_mail_subject === "function") {
          const prev = (forceSetExplicitPrevious ?? "").toString().trim();
          const next = (subject ?? "").toString().trim();
          if (next && prev !== next) {
            console.log(`[wizard4][subject-explicit-current-compose] force subject="${next}" previous="${prev}"`);
            try {
              w.__fm_set_mail_subject(next);
            } catch (err) {
              console.error("[wizard4][subject-explicit-current-compose] force set failed", err);
            }
          }
        }
        
        // Stelle sicher, dass finalToEmail IMMER gesetzt wird (auch wenn schon gesetzt)
        if (finalToEmail && typeof w.__fm_set_mail_to === 'function') {
          try {
            w.__fm_set_mail_to(finalToEmail);
            console.log('[fm-voice][wizard4] __fm_set_mail_to aufgerufen (nach Polish, vor AutoSend):', finalToEmail);
          } catch (err) {
            console.error('[fm-voice] Fehler beim Setzen von __fm_set_mail_to (nach Polish, vor AutoSend):', err);
          }
        }
        
        // Zusätzliches Logging für Debugging
        if (wizard4Draft) {
          // Logge den FINALEN Body, der wirklich ins UI gesetzt wurde (inkl. Polishing)
          console.log('[fm-voice][wizard4] Email-Felder gesetzt (nach Polish, vor AutoSend):', {
            to: finalToEmail,
            subject: subject,
            body: finalBodyForUi,
            sendMode: wizard4Draft.sendMode,
            toName: wizard4Draft.toName,
            draftBody: wizard4Draft.body,
            usedBodyHint: !wizard4Draft && !!intent.bodyHint,
            usedBodyHintRaw: !wizard4Draft && !!intent.bodyHintRaw,
            bodyPolished: finalBodyForUi !== rawBodyForUi
          });
          
          if (wizard4Draft.toName && !finalToEmail) {
            console.log('[fm-voice][wizard4] Hinweis: Nur Name erkannt, keine E-Mail-Adresse:', wizard4Draft.toName);
          }
        }
        
        // -----------------------------
        // AutoSend 4.0 – Wizard 4 (mit Retry-Logik)
        // WICHTIG: Startet NACH Polishing (await wurde bereits abgewartet)
        // -----------------------------
        const autoSendStartedAtMs = nowMs();
        try {
          timingMark("email-compose-autosend-start");
          // Edgecase: Prüfe nochmal, ob UI noch verfügbar ist (UI könnte zwischenzeitlich unmounted sein)
          if (typeof window === 'undefined' || !w.__fm_send_mail_now) {
            console.warn('[wizard4][autosend] UI unmounted oder __fm_send_mail_now nicht verfügbar, überspringe AutoSend');
            timingMark("email-compose-autosend-finished", {
              autosendMs: Math.max(0, Math.round(nowMs() - autoSendStartedAtMs)),
              reason: "ui_unavailable",
            });
            return;
          }
          
          const canAutoSend =
            WIZARD4_AUTOSEND_ENABLED &&
            wizard4Draft &&
            wizard4Draft.sendMode === 'sendNow' &&
            typeof w.__fm_send_mail_now === 'function' &&
            safeAutoSendEmail !== null &&
            finalBodyForUi.trim().length > 0;
          
          if (canAutoSend) {
            console.log('[fm-voice][wizard4] AutoSend: starte Retry-Logik (NACH Polish).', {
              to: safeAutoSendEmail,
              subject: wizard4Draft.subject,
              sendMode: wizard4Draft.sendMode,
              bodyLength: finalBodyForUi.length,
              bodyPolished: finalBodyForUi !== rawBodyForUi
            });
            
            // Retry-Logik: Warte bis Empfänger wirklich im UI steht
            let retryCount = 0;
            const maxRetries = 5;
            
            const trySend = () => {
              if (isStaleRun()) {
                console.log("[fm-voice][stale-run-guard] cancel stale autosend attempt", {
                  runId: commandRunId,
                  latestRunId: latestVoiceCommandRunId,
                  retryCount,
                });
                timingMark("email-compose-autosend-cancelled-stale-run", {
                  runId: commandRunId,
                  latestRunId: latestVoiceCommandRunId,
                  retryCount,
                });
                return;
              }
              try {
                // Stelle sicher, dass safeAutoSendEmail im UI steht
                if (safeAutoSendEmail && typeof w.__fm_set_mail_to === 'function') {
                  try {
                    w.__fm_set_mail_to(safeAutoSendEmail);
                    console.log('[fm-voice][wizard4] AutoSend: safeAutoSendEmail ins UI gesetzt:', safeAutoSendEmail);
                  } catch (err) {
                    console.error('[fm-voice][wizard4] AutoSend: Fehler beim Setzen von safeAutoSendEmail:', err);
                  }
                }
                
                const currentTo = (typeof w.__fm_get_mail_to === 'function') ? String(w.__fm_get_mail_to() || '') : '';
                
                if (currentTo && currentTo.includes('@')) {
                  console.log('[fm-voice][wizard4] AutoSend: Empfänger steht im UI, sende jetzt.', { currentTo, safeAutoSendEmail, bodyLength: finalBodyForUi.length });
                  didAutoSend = true;
                  
                  // DEFENSIV: Wrappe __fm_send_mail_now in try/catch, um Crashes zu verhindern
                  try {
                    if (typeof w.__fm_send_mail_now === 'function') {
                      w.__fm_send_mail_now();
                      console.log('[fm-voice][wizard4] AutoSend: __fm_send_mail_now erfolgreich aufgerufen');
                      timingMark("email-compose-autosend-sent", {
                        autosendMs: Math.max(0, Math.round(nowMs() - autoSendStartedAtMs)),
                        totalMs: timing ? Math.max(0, Math.round(nowMs() - timing.startedAtMs)) : null,
                      });
                    } else {
                      console.error('[fm-voice][wizard4] AutoSend: __fm_send_mail_now ist keine Funktion');
                    }
                  } catch (sendErr: any) {
                    console.error('[fm-voice][wizard4] AutoSend: Fehler beim Aufruf von __fm_send_mail_now:', sendErr);
                    // Fallback: Zeige prepared-Nachricht
                    PartnerBotBus.say("E-Mail konnte nicht automatisch gesendet werden. Bitte manuell senden.");
                  }
                } else if (retryCount < maxRetries) {
                  retryCount++;
                  console.log('[fm-voice][wizard4] AutoSend: Empfänger noch nicht im UI, retry in 200ms.', { 
                    currentTo, 
                    retryCount, 
                    maxRetries,
                    safeAutoSendEmail
                  });
                  setTimeout(trySend, 200);
                } else {
                  console.warn('[fm-voice][wizard4] AutoSend: Abbruch nach', maxRetries, 'Retries. Empfänger nicht im UI gesetzt.', { 
                    currentTo,
                    expectedTo: safeAutoSendEmail
                  });
                  // AutoSend fehlgeschlagen, zeige prepared-Nachricht
                  if (!didAutoSend) {
                    sayPreparedOnce("Alles klar, ich habe die E-Mail vorbereitet. Du kannst sie jetzt prüfen oder senden.");
                  }
                }
              } catch (err: any) {
                // DEFENSIV: Fange alle Exceptions ab, damit kein "Uncaught (in promise)" auftritt
                console.error('[fm-voice][wizard4] AutoSend: Unerwarteter Fehler in trySend:', err);
                if (!didAutoSend) {
                  sayPreparedOnce("E-Mail vorbereitet. Bitte prüfen und manuell senden.");
                }
              }
            };
            
            // Starte Retry-Logik nach kurzer Verzögerung
            setTimeout(trySend, 150);
          } else {
            console.log('[fm-voice][wizard4] AutoSend nicht ausgeführt.', {
              autosendEnabled: WIZARD4_AUTOSEND_ENABLED,
              hasDraft: !!wizard4Draft,
              sendMode: wizard4Draft ? wizard4Draft.sendMode : null,
              hasSafeAutoSendEmail: safeAutoSendEmail !== null,
              hasSendFn: typeof w.__fm_send_mail_now === 'function',
            });
            timingMark("email-compose-autosend-finished", {
              autosendMs: Math.max(0, Math.round(nowMs() - autoSendStartedAtMs)),
              reason: "not_executed",
            });
            // AutoSend nicht ausgeführt, zeige prepared-Nachricht
            if (!didAutoSend) {
              sayPreparedOnce("Alles klar, ich habe die E-Mail vorbereitet. Du kannst sie jetzt prüfen oder senden.");
            }
          }
        } catch (err) {
          console.error('[fm-voice][wizard4] Fehler beim AutoSend:', err);
          timingMark("email-compose-autosend-finished", {
            autosendMs: Math.max(0, Math.round(nowMs() - autoSendStartedAtMs)),
            reason: "exception",
          });
          // Bei Fehler zeige prepared-Nachricht
          if (!didAutoSend) {
            sayPreparedOnce("Alles klar, ich habe die E-Mail vorbereitet. Du kannst sie jetzt prüfen oder senden.");
          }
        }
        timingMark("email-compose-finished", {
          composeMs: Math.max(0, Math.round(nowMs() - composeStartedAtMs)),
          totalMs: timing ? Math.max(0, Math.round(nowMs() - timing.startedAtMs)) : null,
          didAutoSend,
        });
      }, 100);
    })();
    return;
  }

  if (intent.type === "leads-filter") {
    const params = new URLSearchParams({ range: intent.range });
    navigate(`/leads?${params.toString()}`);

    const message =
      intent.range === "today"
        ? "Ich zeige dir die Leads von heute."
        : intent.range === "yesterday"
          ? "Ich zeige dir die Leads von gestern."
          : "Ich zeige dir die Leads dieser Woche.";
    triggerEmotion("success");
    PartnerBotBus.say(message);
    setLastAction({ kind: "other", description: message });
    return;
  }

  if (intent.type === "last-action") {
    triggerEmotion("thinking");
    const last = getLastAction();
    if (!last) {
      PartnerBotBus.say(
        "Ich habe noch keine letzte Aktion gespeichert. Nutze zuerst eine Sprachaktion, zum Beispiel: Öffne den Lead-Radar.",
      );
      return;
    }
    PartnerBotBus.say(`Deine letzte Aktion war: ${last.description}`);
    return;
  }

  if (intent.type === "email-body-replace-all") {
    console.log("[sentence] edit intent -> subject untouched");
    const payload = intent.payload as { text?: string; bodyRaw?: string };
    const requestedRaw = (payload?.text ?? payload?.bodyRaw ?? "").toString();
    const cleaned = requestedRaw.replace(/^\.+/, "").trim();

    if (!cleaned) {
      const w = typeof window !== "undefined" ? (window as any) : null;
      const guidedStage = w?.__fm_guided_mail_context?.stage;
      const guidedPrompt = guidedStage === "awaiting_new_text";
      const message = guidedPrompt
        ? "Okay, wie lautet der Text?"
        : "Kein Text erkannt. Sag den neuen Mailtext bitte nochmal.";
      if (w) {
        w.__fm_last_hint = { kind: "missing_body", message, ts: Date.now() };
      }
      if (typeof window?.dispatchEvent === "function") window.dispatchEvent(new CustomEvent("fm-hint-update"));
      PartnerBotBus.say(message);
      return;
    }

    const w = typeof window !== "undefined" ? (window as any) : null;
    const hadSetterBefore = !!w?.__fm_set_mail_body && typeof w.__fm_set_mail_body === "function";
    (async () => {
      const wasGuidedNewTextFlow = w?.__fm_guided_mail_context?.stage === "awaiting_new_text";
      let totalWaitMs = 0;
      let waitResult = await waitForMailBodySetter(1500, 30);
      totalWaitMs += waitResult.waitedMs;
      let setter = waitResult.setter;

      if (!setter) {
        console.log("[body-replace] composer setter missing, opening compose fallback");
        try {
          navigate("/mail/compose");
        } catch {}
        waitResult = await waitForMailBodySetter(1500, 30);
        totalWaitMs += waitResult.waitedMs;
        setter = waitResult.setter;
      }

      console.log(`[body-replace] composerFnsAvailable=${!!setter}, waitedMs=${totalWaitMs}, hadSetterBefore=${hadSetterBefore}`);

      if (setter) {
        let bodyForApply = cleaned;
        try {
          const polishResult = await polishEmailBody(cleaned, { mode: "previewOnly", timeoutMs: 3000 });
          if (polishResult.ok && typeof polishResult.body === "string" && polishResult.body.trim().length > 0) {
            const normalized = normalizeEmailBodyAfterPolish(polishResult.body).trim();
            if (normalized.length > 0) {
              bodyForApply = normalized;
            }
          }
          console.log("[body-replace][polish]", {
            ok: polishResult.ok,
            usedAi: polishResult.usedAi,
            reason: polishResult.reason || null,
            beforeLength: cleaned.length,
            afterLength: bodyForApply.length,
          });
        } catch (err) {
          console.warn("[body-replace][polish] failed, fallback to original replace text", err);
        }

        const beforeBody = (window as any).__fm_get_mail_body?.() ?? "";
        (window as any).__fm_set_mail_body?.(bodyForApply);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const afterBody = (window as any).__fm_get_mail_body?.() ?? "";
        console.log("[body-replace] requested=", cleaned);
        console.log("[body-replace] before=", beforeBody);
        console.log("[body-replace] after=", afterBody);
        if ((String(afterBody).trim()) === bodyForApply.trim()) {
          console.log("[body-replace] applied ok");
        } else {
          console.warn("[body-replace] mismatch detected");
        }
        if (wasGuidedNewTextFlow && w?.__fm_guided_mail_context?.stage === "awaiting_new_text") {
          w.__fm_guided_mail_context = {
            ...w.__fm_guided_mail_context,
            stage: "recipient_set_choice",
            bodyText: bodyForApply,
            ts: Date.now(),
          };
        }
      } else if (w) {
        w.__fm_pending_body_replace = cleaned;
        console.warn("[body-replace] setter unavailable after wait, stored pending body replace");
      }

      triggerEmotion("success");
      PartnerBotBus.say(
        wasGuidedNewTextFlow
          ? "Okay, Text gesetzt. Soll ich senden oder möchtest du noch etwas ändern?"
          : "Text ersetzt."
      );
    })().catch((err) => {
      console.error("[body-replace] apply failed", err);
      if (w) w.__fm_pending_body_replace = cleaned;
      triggerEmotion("error");
      PartnerBotBus.say("Fehler beim Ersetzen des Textes.");
    });
    return;
  }

  if (intent.type === "email-body-delete-last-sentence") {
    const w = typeof window !== "undefined" ? (window as any) : null;
    const nRaw = (intent.payload as { n?: number })?.n;
    const n = Math.max(1, Math.min(5, Number.isFinite(nRaw as number) ? Math.floor(nRaw as number) : 1));
    const before = (w?.__fm_get_mail_body?.() ?? "").toString();
    if (!before.trim()) {
      console.warn("[sentence] delete-last no-op (empty body)");
      return;
    }
    const { after } = deleteLastNSentences(before, n);
    w?.__fm_set_mail_body?.(after);
    (async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const afterUi = (w?.__fm_get_mail_body?.() ?? "").toString();
      console.log("[sentence] delete-last", {
        n,
        beforePreview: before.slice(0, 120),
        afterPreview: afterUi.slice(0, 120),
      });
    })();
    return;
  }

  if (intent.type === "sentence-delete-last-n") {
    const w = typeof window !== "undefined" ? (window as any) : null;
    const nRaw = (intent.payload as { n?: number })?.n;
    const n = Math.max(1, Math.min(5, Number.isFinite(nRaw as number) ? Math.floor(nRaw as number) : 1));
    const before = (w?.__fm_get_mail_body?.() ?? "").toString();

    const protectAbbreviations = (text: string): string =>
      text.replace(/\bz\.\s*b\./gi, (m) => m.replace(/\./g, "__DOT__"));
    const restoreAbbreviations = (text: string): string =>
      text.replace(/__DOT__/g, ".");

    const splitSentences = (text: string): string[] => {
      const src = (text ?? "").replace(/\r\n/g, "\n").trim();
      if (!src) return [];
      const protectedText = protectAbbreviations(src);
      const parts = protectedText
        .split(/(?<=[.!?]+)\s+|\n+/g)
        .map((s) => restoreAbbreviations(s).trim())
        .filter(Boolean);
      return parts;
    };

    const sentences = splitSentences(before);
    const sentenceCount = sentences.length;
    let targetAfter = "";

    if (sentenceCount === 0) {
      targetAfter = "";
    } else if (n >= sentenceCount) {
      targetAfter = "";
    } else {
      targetAfter = sentences.slice(0, sentenceCount - n).join(" ").replace(/\s+/g, " ").trim();
    }

    console.info(
      `[sentence] delete-last-n n=${n} sentences=${sentenceCount} beforeLen=${before.length} afterLen=${targetAfter.length} before="${before.slice(0, 80)}" after="${targetAfter.slice(0, 80)}"`
    );

    if (typeof w?.__fm_set_mail_body === "function") {
      w.__fm_set_mail_body(targetAfter);
    } else {
      console.warn("[sentence] delete-last-n setter missing");
      return;
    }
    (async () => {
      // FM PATCH: Readback stabilisieren (kurzes Wait + 1 Retry)
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      let waitedMs = 0;
      await sleep(80);
      waitedMs += 80;

      const hasGetter = typeof w?.__fm_get_mail_body === "function";
      let readback = hasGetter ? (w.__fm_get_mail_body?.() ?? "").toString() : targetAfter;
      if (hasGetter && readback.trim() !== targetAfter.trim()) {
        await sleep(120);
        waitedMs += 120;
        readback = (w.__fm_get_mail_body?.() ?? "").toString();
      }

      const ok = readback.trim() === targetAfter.trim();
      console.info(
        `[sentence] delete-last-n verify ok=${ok} waitedMs=${waitedMs} n=${n} sentences=${sentenceCount} beforeLen=${before.length} computedAfterLen=${targetAfter.length} readbackLen=${readback.length} readback="${readback.slice(0, 80)}"`
      );
    })();
    return;
  }

  if (intent.type === "sentence-delete-nth") {
    const w = typeof window !== "undefined" ? (window as any) : null;
    const nRaw = (intent.payload as { n?: number })?.n;
    const n = Math.max(1, Math.min(20, Number.isFinite(nRaw as number) ? Math.floor(nRaw as number) : 1));
    const before = (w?.__fm_get_mail_body?.() ?? "").toString();

    const protectAbbreviations = (text: string): string =>
      text.replace(/\bz\.\s*b\./gi, (m) => m.replace(/\./g, "__DOT__"));
    const restoreAbbreviations = (text: string): string =>
      text.replace(/__DOT__/g, ".");
    const splitSentences = (text: string): string[] => {
      const src = (text ?? "").replace(/\r\n/g, "\n").trim();
      if (!src) return [];
      const protectedText = protectAbbreviations(src);
      return protectedText
        .split(/(?<=[.!?]+)\s+|\n+/g)
        .map((s) => restoreAbbreviations(s).trim())
        .filter(Boolean);
    };
    const normalizeSentenceForJoin = (raw: string): string => {
      let s = (raw ?? "").toString().trim();
      s = s.replace(/^[\s\.,:;\-–—"'„“‚‘`]+/g, "").trim();
      if (!s) return "";
      s = s.replace(/\s+/g, " ");
      if (!/[.!?]$/.test(s)) s = `${s}.`;
      return s;
    };

    const sentences = splitSentences(before);
    const idx = n - 1;
    if (idx < 0 || idx >= sentences.length) {
      console.warn(`[sentence] delete-nth invalid index n=${n} len=${sentences.length}`);
      return;
    }

    const after = sentences
      .filter((_, i) => i !== idx)
      .map(normalizeSentenceForJoin)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    console.info(
      `[sentence] delete-nth n=${n} idx=${idx} sentencesBefore=${sentences.length} sentencesAfter=${Math.max(0, sentences.length - 1)} beforeLen=${before.length} afterLen=${after.length}`
    );

    if (typeof w?.__fm_set_mail_body === "function") {
      w.__fm_set_mail_body(after);
    } else {
      console.warn("[sentence] delete-nth setter missing");
      return;
    }
    (async () => {
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      let waitedMs = 0;
      await sleep(80);
      waitedMs += 80;
      const hasGetter = typeof w?.__fm_get_mail_body === "function";
      let readback = hasGetter ? (w.__fm_get_mail_body?.() ?? "").toString() : after;
      if (hasGetter && readback.trim() !== after.trim()) {
        await sleep(120);
        waitedMs += 120;
        readback = (w.__fm_get_mail_body?.() ?? "").toString();
      }
      const ok = readback.trim() === after.trim();
      console.info(`[sentence] delete-nth verify ok=${ok} waitedMs=${waitedMs} readbackLen=${readback.length} computedAfterLen=${after.length}`);
    })();
    return;
  }

  if (intent.type === "sentence-insert-nth") {
    console.log("[sentence] edit intent -> subject untouched");
    const w = typeof window !== "undefined" ? (window as any) : null;
    const p = intent.payload as { position?: "after" | "before"; n?: number; text?: string };
    const position = p?.position === "before" ? "before" : "after";
    const n = Math.max(1, Math.min(20, Number.isFinite(p?.n as number) ? Math.floor(p!.n as number) : 1));
    const before = (w?.__fm_get_mail_body?.() ?? "").toString();

    const protectAbbreviations = (text: string): string =>
      text.replace(/\bz\.\s*b\./gi, (m) => m.replace(/\./g, "__DOT__"));
    const restoreAbbreviations = (text: string): string =>
      text.replace(/__DOT__/g, ".");
    const splitSentences = (text: string): string[] => {
      const src = (text ?? "").replace(/\r\n/g, "\n").trim();
      if (!src) return [];
      const protectedText = protectAbbreviations(src);
      return protectedText
        .split(/(?<=[.!?]+)\s+|\n+/g)
        .map((s) => restoreAbbreviations(s).trim())
        .filter(Boolean);
    };
    const sanitizeInsertionText = (raw: string): string => {
      let s = (raw ?? "").toString().trim();
      s = s.replace(/^[\s\.,:;\-–—"'„“‚‘`]+/g, "").trim();
      if (!s) return "";
      const m = /[A-Za-zÄÖÜäöüß]/.exec(s);
      if (m && m.index >= 0) {
        const i = m.index;
        s = s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
      }
      return s;
    };
    const normalizeSentenceForJoin = (raw: string): string => {
      let s = (raw ?? "").toString().trim();
      s = s.replace(/^[\s\.,:;\-–—"'„“‚‘`]+/g, "").trim();
      if (!s) return "";
      s = s.replace(/\s+/g, " ");
      if (!/[.!?]$/.test(s)) s = `${s}.`;
      return s;
    };

    const sentences = splitSentences(before);
    const len = sentences.length;
    if (n < 1 || n > len) {
      console.warn(`[sentence] insert-nth invalid index position=${position} n=${n} len=${len}`);
      return;
    }

    const insertText = sanitizeInsertionText((p?.text ?? "").toString());
    if (!insertText) {
      console.warn("[sentence] insert-nth no-op (empty insertion)");
      return;
    }

    const insertIndex = position === "after" ? n : (n - 1);
    const out = [...sentences];
    out.splice(insertIndex, 0, insertText);
    const after = out
      .map(normalizeSentenceForJoin)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    console.info(
      `[sentence] insert-nth position=${position} n=${n} idx=${insertIndex} sentencesBefore=${len} sentencesAfter=${out.length} beforeLen=${before.length} afterLen=${after.length}`
    );

    if (typeof w?.__fm_set_mail_body === "function") {
      w.__fm_set_mail_body(after);
    } else {
      console.warn("[sentence] insert-nth setter missing");
      return;
    }
    (async () => {
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      let waitedMs = 0;
      await sleep(80);
      waitedMs += 80;
      const hasGetter = typeof w?.__fm_get_mail_body === "function";
      let readback = hasGetter ? (w.__fm_get_mail_body?.() ?? "").toString() : after;
      if (hasGetter && readback.trim() !== after.trim()) {
        await sleep(120);
        waitedMs += 120;
        readback = (w.__fm_get_mail_body?.() ?? "").toString();
      }
      const ok = readback.trim() === after.trim();
      console.info(`[sentence] insert-nth verify ok=${ok} waitedMs=${waitedMs} readbackLen=${readback.length} computedAfterLen=${after.length}`);
    })();
    return;
  }

  // FM PATCH: Step 2 sentence-replace (first/last/n)
  const applySentenceReplace = async (
    mode: "first" | "last" | "n",
    payload: { text?: string; n?: number }
  ) => {
    console.log("[sentence] edit intent -> subject untouched");
    const w = typeof window !== "undefined" ? (window as any) : null;
    if (!w || typeof w.__fm_get_mail_body !== "function" || typeof w.__fm_set_mail_body !== "function") {
      console.warn("[sentence] replace no-op (composer fns missing)");
      return;
    }

    const before = (w.__fm_get_mail_body?.() ?? "").toString();
    const sanitizeReplacementText = (raw: string): string => {
      let s = (raw ?? "")
        .toString()
        .trim()
        .replace(/^[\s\.,:;\-–—"'„“‚‘`]+/g, "")
        .replace(/[\s"'„“‚‘`]+$/g, "")
        .trim();
      if (!s) return "";
      s = s.replace(/["'„“‚‘`]+([.!?])$/g, "$1");
      s = s.replace(/[.!?]{2,}$/g, (m) => m.slice(0, 1));
      const m = /[A-Za-zÄÖÜäöüß]/.exec(s);
      if (m && m.index >= 0) {
        const i = m.index;
        s = s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
      }
      return s.trim();
    };
    const replacement = sanitizeReplacementText((payload?.text ?? "").toString());
    const n = Math.max(1, Math.min(20, Number.isFinite(payload?.n as number) ? Math.floor(payload!.n as number) : 1));
    if (!replacement) {
      console.warn("[sentence] replace no-op (empty replacement)");
      return;
    }

    const protectAbbreviations = (text: string): string =>
      text.replace(/\bz\.\s*b\./gi, (m) => m.replace(/\./g, "__DOT__"));
    const restoreAbbreviations = (text: string): string =>
      text.replace(/__DOT__/g, ".");
    const splitSentences = (text: string): string[] => {
      const src = (text ?? "").replace(/\r\n/g, "\n").trim();
      if (!src) return [];
      const protectedText = protectAbbreviations(src);
      return protectedText
        .split(/(?<=[.!?]+)\s+|\n+/g)
        .map((s) => restoreAbbreviations(s).trim())
        .filter(Boolean);
    };

    const normalizeSentenceForJoin = (raw: string): string => {
      let s = (raw ?? "").toString().trim();
      s = s.replace(/^[\s\.,:;\-–—"'„“‚‘`]+/g, "").trim();
      if (!s) return "";
      s = s.replace(/\s+/g, " ");
      if (!/[.!?]$/.test(s)) s = `${s}.`;
      return s;
    };

    const sentences = splitSentences(before);
    if (sentences.length === 0) {
      console.warn("[sentence] replace no-op (empty body)");
      return;
    }

    let targetIndex = 0;
    if (mode === "first") targetIndex = 0;
    else if (mode === "last") targetIndex = sentences.length - 1;
    else targetIndex = n - 1;

    if (targetIndex < 0 || targetIndex >= sentences.length) {
      console.warn("[sentence] replace invalid index", { index: targetIndex, sentenceCount: sentences.length, mode, n });
      return;
    }

    const out = [...sentences];
    out[targetIndex] = replacement;
    const computedAfter = out
      .map(normalizeSentenceForJoin)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    console.log(`[sentence] replace mode=${mode} n=${n} sentences=${sentences.length} beforeLen=${before.length} afterLen=${computedAfter.length} targetIndex=${targetIndex} before="${before.slice(0, 80)}" after="${computedAfter.slice(0, 80)}"`);

    w.__fm_set_mail_body?.(computedAfter);

    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    let waitedMs = 0;
    await sleep(80);
    waitedMs += 80;
    let readback = (w.__fm_get_mail_body?.() ?? "").toString();
    if (readback.trim() !== computedAfter.trim()) {
      await sleep(120);
      waitedMs += 120;
      readback = (w.__fm_get_mail_body?.() ?? "").toString();
    }
    const ok = readback.trim() === computedAfter.trim();
    console.log(`[sentence] replace verify ok=${ok} waitedMs=${waitedMs} readbackLen=${readback.length} computedAfterLen=${computedAfter.length}`);
  };

  if (intent.type === "sentence-replace-first") {
    (async () => {
      await applySentenceReplace("first", { text: (intent.payload as { text?: string })?.text });
    })();
    return;
  }

  if (intent.type === "sentence-replace-last") {
    (async () => {
      await applySentenceReplace("last", { text: (intent.payload as { text?: string })?.text });
    })();
    return;
  }

  if (intent.type === "sentence-replace-n") {
    (async () => {
      await applySentenceReplace("n", {
        text: (intent.payload as { text?: string; n?: number })?.text,
        n: (intent.payload as { text?: string; n?: number })?.n,
      });
    })();
    return;
  }

  if (intent.type === "sentence-replace-nth") {
    const w = typeof window !== "undefined" ? (window as any) : null;
    const p = intent.payload as { n?: number; text?: string };
    const n = Math.max(1, Math.min(20, Number.isFinite(p?.n as number) ? Math.floor(p!.n as number) : 1));
    const sanitizeReplacementText = (raw: string): string => {
      let s = (raw ?? "")
        .toString()
        .trim()
        .replace(/^[\s\.,:;\-–—"'„“‚‘`]+/g, "")
        .replace(/[\s"'„“‚‘`]+$/g, "")
        .trim();
      if (!s) return "";
      s = s.replace(/["'„“‚‘`]+([.!?])$/g, "$1");
      s = s.replace(/[.!?]{2,}$/g, (m) => m.slice(0, 1));
      const m = /[A-Za-zÄÖÜäöüß]/.exec(s);
      if (m && m.index >= 0) {
        const i = m.index;
        s = s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
      }
      return s.trim();
    };
    const replacement = sanitizeReplacementText((p?.text ?? "").toString());
    if (!replacement) {
      console.warn("[sentence] replace-nth no-op (empty replacement)");
      return;
    }

    const before = (w?.__fm_get_mail_body?.() ?? "").toString();
    const protectAbbreviations = (text: string): string =>
      text.replace(/\bz\.\s*b\./gi, (m) => m.replace(/\./g, "__DOT__"));
    const restoreAbbreviations = (text: string): string =>
      text.replace(/__DOT__/g, ".");
    const splitSentences = (text: string): string[] => {
      const src = (text ?? "").replace(/\r\n/g, "\n").trim();
      if (!src) return [];
      const protectedText = protectAbbreviations(src);
      return protectedText
        .split(/(?<=[.!?]+)\s+|\n+/g)
        .map((s) => restoreAbbreviations(s).trim())
        .filter(Boolean);
    };
    const normalizeSentenceForJoin = (raw: string): string => {
      let s = (raw ?? "").toString().trim();
      s = s.replace(/^[\s\.,:;\-–—"'„“‚‘`]+/g, "").trim();
      if (!s) return "";
      s = s.replace(/\s+/g, " ");
      if (!/[.!?]$/.test(s)) s = `${s}.`;
      return s;
    };

    const sentences = splitSentences(before);
    const idx = n - 1;
    if (idx < 0 || idx >= sentences.length) {
      console.warn("[sentence] replace-nth no-op (index out of range)");
      return;
    }

    const out = [...sentences];
    out[idx] = replacement;
    const after = out
      .map(normalizeSentenceForJoin)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    console.info(`[sentence] replace-nth n=${n} idx=${idx} sentencesBefore=${sentences.length} sentencesAfter=${out.length}`);

    if (typeof w?.__fm_set_mail_body === "function") {
      w.__fm_set_mail_body(after);
    } else {
      console.warn("[sentence] replace-nth setter missing");
      return;
    }

    (async () => {
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      await sleep(80);
      let readback = (w?.__fm_get_mail_body?.() ?? "").toString();
      if (readback.trim() !== after.trim()) {
        await sleep(120);
        readback = (w?.__fm_get_mail_body?.() ?? "").toString();
      }
      const ok = readback.trim() === after.trim();
      console.info(`[sentence] replace-nth verify ok=${ok}`);
    })();
    return;
  }

  if (intent.type === "email-body-replace-first-sentence") {
    const w = typeof window !== "undefined" ? (window as any) : null;
    const p = intent.payload as { n?: number; replacement?: string };
    const nRaw = p?.n;
    const n = Math.max(1, Math.min(5, Number.isFinite(nRaw as number) ? Math.floor(nRaw as number) : 1));
    const sanitizeReplacementText = (raw: string): string =>
      (raw ?? "")
        .toString()
        .trim()
        .replace(/^[\s\.,:;\-–—"'„“‚‘`]+/g, "")
        .trim();
    const replacement = sanitizeReplacementText((p?.replacement ?? "").toString());
    if (!replacement) {
      console.warn("[sentence] replace-first no-op (empty replacement)");
      return;
    }

    const before = (w?.__fm_get_mail_body?.() ?? "").toString();
    if (!before.trim()) {
      console.warn("[sentence] replace-first empty_before -> set replacement as body");
      w?.__fm_set_mail_body?.(replacement);
      (async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const afterUi = (w?.__fm_get_mail_body?.() ?? "").toString();
        console.log("[sentence] replace-first", {
          n,
          replacementPreview: replacement.slice(0, 120),
          beforePreview: before.slice(0, 120),
          afterPreview: afterUi.slice(0, 120),
        });
      })();
      return;
    }

    const { after } = replaceFirstNSentences(before, n, replacement);
    w?.__fm_set_mail_body?.(after);
    (async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const afterUi = (w?.__fm_get_mail_body?.() ?? "").toString();
      console.log("[sentence] replace-first", {
        n,
        replacementPreview: replacement.slice(0, 120),
        beforePreview: before.slice(0, 120),
        afterPreview: afterUi.slice(0, 120),
      });
    })();
    return;
  }

  if (intent.type === "email-append") {
    console.log("[sentence] edit intent -> subject untouched");
    console.log("[fm-voice] applyVoiceIntent(email-append) executed");
    const w = window as any;

    // PRECONDITION: Composer offen (Bridge vorhanden). Wenn nicht → kein Append, kein AI-Fallback.
    if (typeof w.__fm_get_mail_body !== 'function' || typeof w.__fm_set_mail_body !== 'function') {
      console.warn('[email-append] Composer not open, skipping append (__fm_get_mail_body/__fm_set_mail_body missing)');
      return;
    }

    let appendText = (intent.payload?.appendText ?? '').trim();

    // Kein Zusatztext → Hint "Zusatz erkannt – sag den Text, den ich anhängen soll.", Body unverändert.
    if (appendText.length === 0) {
      const hintMessage = "Zusatz erkannt – sag den Text, den ich anhängen soll.";
      w.__fm_last_hint = { kind: "append_missing_text", message: hintMessage, ts: Date.now() };
      w.__fm_append_followup_pending = { ts: Date.now() };
      console.log("[fm-voice][ui-hint] append_missing_text -> hint set");
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("fm-hint-update"));
      }
      PartnerBotBus.say(hintMessage);
      return;
    }

    // APPEND-GUARD: einfacher Merge ohne AI (kein subject/to, kein polish)
    const isAppendGuard = intent.meta?.source === 'append-guard';
    if (isAppendGuard) {
      const getBody = w.__fm_get_mail_body;
      const setBody = w.__fm_set_mail_body;
      const current = (getBody?.() ?? '').toString();
      // FM PATCH: Bei leerem Body Append-Anfang groß schreiben.
      const appendForApply = normalizeAppendWhenBodyEmpty(current, appendText);
      const add = normalizeAppend(appendForApply);
      (async () => {
        try {
          const polishResult = await polishEmailBody(add, { mode: 'previewOnly', timeoutMs: 3000 });
          const polishedAppend =
            polishResult.ok && typeof polishResult.body === 'string' && polishResult.body.trim().length > 0
              ? normalizeEmailBodyAfterPolish(polishResult.body).trim()
              : add;
          const merged = mergeBodies(current, polishedAppend || add);
          const lenBefore = current.length;
          const lenAfter = merged.length;
          setBody?.(merged);
          w.__fm_append_followup_pending = null;
          console.log("[fm-voice][email-append] applied", { lenBefore, lenAfter });
          console.log("[email-append][append-guard][polish]", {
            ok: polishResult.ok,
            usedAi: polishResult.usedAi,
            reason: polishResult.reason || null,
          });
          triggerEmotion("success");
          PartnerBotBus.say("Text hinzugefügt.");
        } catch (err) {
          console.warn("[email-append][append-guard][polish] failed, fallback to raw append", err);
          const merged = mergeBodies(current, add);
          setBody?.(merged);
          w.__fm_append_followup_pending = null;
          triggerEmotion("success");
          PartnerBotBus.say("Text hinzugefügt.");
        }
      })();
      return;
    }

    const currentBody = w.__fm_get_mail_body();
    // FM PATCH: Bei leerem Body Append-Anfang groß schreiben.
    appendText = normalizeAppendWhenBodyEmpty((typeof currentBody === 'string' ? currentBody : ''), appendText);
    const bodyBefore = typeof currentBody === 'string' ? currentBody : '';
    const bodyBeforeLen = bodyBefore.length;
    console.log('[email-append] before body length=' + bodyBeforeLen);

    // Handle append asynchronously (polish the appended text)
    (async () => {
      try {
        // Body leer → setze Body = appendedText; sonst Body + "\n\n" + appendedText (Spec)
        const trimmedBody = (typeof currentBody === 'string' ? currentBody : '').trim();
        const endsWithPunctuation = /[.!?]$/.test(trimmedBody);
        const endsWithNewline = /\n$/.test(bodyBefore);
        const separator = (trimmedBody.length === 0) ? '' : ((endsWithPunctuation || endsWithNewline) ? '\n\n' : '\n\n');

        // Polish ONLY the appended text
        const polishResult = await polishEmailBody(appendText, { mode: 'previewOnly', timeoutMs: 3000 });
        let polishedAppend = polishResult.ok && polishResult.usedAi ? polishResult.body : appendText;
        polishedAppend = normalizeEmailBodyAfterPolish(polishedAppend);

        const finalBody = trimmedBody.length === 0
          ? polishedAppend.trim()
          : trimmedBody + separator + polishedAppend.trim();

        console.log('[email-append] after body length=' + finalBody.length);

        if (typeof w.__fm_set_mail_body === 'function') {
          w.__fm_set_mail_body(finalBody);
          w.__fm_append_followup_pending = null;
          console.log('[email-append] body updated in UI');
        }

        // Append ist Bearbeitung, niemals senden (Spec). Kein AutoSend.
        triggerEmotion("success");
        PartnerBotBus.say("Text hinzugefügt.");
      } catch (err: any) {
        console.error('[email-append] error:', err);
        triggerEmotion("error");
        PartnerBotBus.say("Fehler beim Hinzufügen des Textes.");
      }
    })();

    return;
  }

  if (intent.type === "email-send") {
    console.log("[fm-voice] applyVoiceIntent(email-send) – verarbeite email-send Intent");
    (async () => {
      const w = typeof window !== "undefined" ? (window as any) : null;
      if (isUiDraftAvailable() && w) {
        const safeTo = typeof w.__fm_get_mail_to === "function" ? String(w.__fm_get_mail_to() || "").trim() : "";
        const safeBody = typeof w.__fm_get_mail_body === "function" ? String(w.__fm_get_mail_body() || "").trim() : "";
        if (!safeTo || !safeBody) {
          PartnerBotBus.say("Zum Senden fehlen Empfänger oder Text. Ich bleibe in der Vorschau.");
          return;
        }

        const now = Date.now();
        const sendSourceText =
          ((intent as any)?.sourceText ?? (intent as any)?.rawText ?? (intent as any)?.originalText ?? lastTranscript ?? "").toString();
        const hardConfirmation = isHardSendConfirmationPhrase(sendSourceText);
        const consumeBypass =
          allowNextEmailSendWithoutExtraConfirmationUntil >= now;
        if (consumeBypass) {
          allowNextEmailSendWithoutExtraConfirmationUntil = 0;
        }
        if (!hardConfirmation && !consumeBypass && pendingEmailSendConfirmationUntil < now && !isMobileVoiceShell()) {
          // 10s war bei lokaler STT zu knapp und führte zu Nachfrage-Loops.
          pendingEmailSendConfirmationUntil = now + 30000;
          PartnerBotBus.say("Sicherheitscheck: Bitte bestätige mit 'jetzt senden' oder 'sofort senden'.");
          return;
        }
        pendingEmailSendConfirmationUntil = 0;

        try {
          w.__fm_send_mail_now();
          setLastAction({ kind: "email-compose", description: "E-Mail gesendet." });
          console.log("[wizard4][email-send] sending current UI draft (no overwrite)");
        } catch (err) {
          console.error("[wizard4][email-send] send error:", err);
        }
        return;
      }
      if (w) {
        w.__fm_last_hint = { kind: "no_draft_open", message: "Kein Entwurf geöffnet – erstelle zuerst eine E-Mail.", ts: Date.now() };
        if (typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("fm-hint-update"));
        }
      }
      console.log("[wizard4][email-send] no UI draft available - ignored");
      return;
    })();
    return;
  }

  if (intent.type === "mail-draft-reset") {
    const w = typeof window !== "undefined" ? (window as any) : null;
    try {
      if (w && typeof w.__fm_reset_mail_draft === "function") {
        w.__fm_reset_mail_draft();
      } else {
        w?.__fm_set_mail_to?.("");
        w?.__fm_set_mail_subject?.("");
        w?.__fm_set_mail_body?.("");
        resetMailVoiceFlowState();
        PartnerBotBus.say("Entwurf zurückgesetzt.");
      }
    } catch (err) {
      console.error("[fm-voice][reset] failed:", err);
      PartnerBotBus.say("Zurücksetzen fehlgeschlagen.");
    }
    return;
  }

  if (intent.type === "mail-body-clear") {
    const w = typeof window !== "undefined" ? (window as any) : null;
    try {
      w?.__fm_set_mail_body?.("");
      if (w?.__fm_guided_mail_context && typeof w.__fm_guided_mail_context === "object") {
        w.__fm_guided_mail_context = {
          ...w.__fm_guided_mail_context,
          bodyText: "",
          stage: "awaiting_new_text",
          ts: Date.now(),
        };
      }
      w.__fm_pending_body_replace = null;
      w.__fm_last_hint = {
        kind: "body_cleared",
        message: "Text gelöscht. Diktiere mir den neuen Text.",
        ts: Date.now(),
      };
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("fm-hint-update"));
      }
      PartnerBotBus.say("Text gelöscht. Diktiere mir den neuen Text.");
    } catch (err) {
      console.error("[fm-voice][body-clear] failed:", err);
      PartnerBotBus.say("Text konnte nicht gelöscht werden.");
    }
    return;
  }

  if (intent.type === "mail-delete-clarify") {
    PartnerBotBus.say("Soll ich nur den Text löschen oder den kompletten Entwurf zurücksetzen?");
    return;
  }

  if (intent.type === "email-preview") {
    const last = getLastAction();
    if (last && last.kind === "email-compose" && typeof window !== "undefined" && window.__fm_preview_mail) {
      PartnerBotBus.pose("lightbulb");
      PartnerBotBus.say("Ich zeige dir die E-Mail-Vorschau.");
      window.__fm_preview_mail();
    } else {
      PartnerBotBus.pose("confused");
      PartnerBotBus.say(
        "Ich sehe gerade keine E-Mail, für die ich eine Vorschau anzeigen kann.",
      );
    }
    return;
  }

  // -----------------------
  // Subject-Edit: Betreff setzen/anhaengen/loeschen/ersetzen (nur __fm_set_mail_subject, kein to/body)
  // -----------------------
  if (
    intent.type === "email-subject-set" ||
    intent.type === "email-subject-append" ||
    intent.type === "email-subject-clear" ||
    intent.type === "email-subject-replace" ||
    intent.type === "email-subject-replace-part"
  ) {
    const w = typeof window !== "undefined" ? (window as any) : null;
    if (!w?.__fm_set_mail_subject) {
      if (w) { w.__fm_last_hint = { kind: "no_draft_open", message: "Kein Entwurf geöffnet – erstelle zuerst eine E-Mail.", ts: Date.now() }; }
      if (typeof window?.dispatchEvent === "function") window.dispatchEvent(new CustomEvent("fm-hint-update"));
      PartnerBotBus.say("Kein Entwurf geöffnet. Erstelle zuerst eine E-Mail.");
      return;
    }
    const current = (w?.__fm_get_mail_subject?.() ?? "").toString().trim();
    const rawCmd = (intent.payload as { rawCommand?: string })?.rawCommand ?? "";
    let newSubject: string;
    if (intent.type === "email-subject-set") {
      newSubject = subjectSet(intent.payload?.subject ?? "");
    } else if (intent.type === "email-subject-append") {
      newSubject = subjectAppend(current, intent.payload?.append ?? "", rawCmd);
    } else if (intent.type === "email-subject-clear") {
      newSubject = subjectClear();
    } else if (intent.type === "email-subject-replace") {
      newSubject = subjectSet(intent.payload?.subject ?? "");
    } else if (intent.type === "email-subject-replace-part") {
      newSubject = subjectReplacePart(
        current,
        intent.payload?.from ?? "",
        intent.payload?.to ?? "",
        rawCmd
      );
    } else {
      newSubject = subjectClear();
    }
    w.__fm_set_mail_subject(newSubject);
    w.__fm_subject_locked = true;
    w.__fm_subject_locked_value = newSubject;
    const activeContextUid = getSelectedMailContext()?.uid ?? null;
    w.__fm_subject_lock_context_uid = activeContextUid ? String(activeContextUid) : null;
    if (w.__fm_wizard4_last_draft && typeof w.__fm_wizard4_last_draft === "object") {
      w.__fm_wizard4_last_draft.meta = {
        ...(w.__fm_wizard4_last_draft.meta ?? {}),
        subjectLocked: true,
      };
    }
    console.log(`[wizard4][subject-lock] locked subject="${newSubject}"`);
    w.__fm_subject_manually_edited = true;
    triggerEmotion("success");
    if (intent.type === "email-subject-clear") PartnerBotBus.say("Betreff gelöscht.");
    else if (intent.type === "email-subject-append") PartnerBotBus.say("Betreff ergänzt.");
    else PartnerBotBus.say("Betreff aktualisiert.");
    return;
  }

  // -----------------------
  // WIZARD 2 – Nur Anrede ändern
  // -----------------------
  if (intent.type === "wizard2-edit-anrede") {
    console.log("[fm-voice] applyVoiceIntent(wizard2-edit-anrede)", intent.newAnrede);
    handleWizard2EditAnrede(intent.newAnrede).catch((err) => {
      console.error("[fm-voice] handleWizard2EditAnrede Fehler:", err);
    });
    return;
  }

  // -----------------------
  // WIZARD 2 – Nur Body umschreiben
  // -----------------------
  if (intent.type === "wizard2-rewrite-body") {
    console.log("[fm-voice] applyVoiceIntent(wizard2-rewrite-body)", intent.instruction);
    handleWizard2RewriteBody(intent.instruction).catch((err) => {
      console.error("[fm-voice] handleWizard2RewriteBody Fehler:", err);
    });
    return;
  }

  // -----------------------
  // WIZARD 2 – Anrede ändern + Body umschreiben
  // -----------------------
  if (intent.type === "wizard2-edit-anrede-and-rewrite") {
    console.log(
      "[fm-voice] applyVoiceIntent(wizard2-edit-anrede-and-rewrite)",
      { newAnrede: intent.newAnrede, instruction: intent.instruction }
    );
    
    // Nur Rewrite mit forcedGreetingLine aufrufen (kein doppeltes Anrede-Handling)
    handleWizard2RewriteBody(intent.instruction, intent.newAnrede)
      .then(() => {
        // Nur EINE kombinierte Rückmeldung
        PartnerBotBus.say("Anrede und Text wurden aktualisiert.");
      })
      .catch((err) => {
        console.error("[fm-voice] handleWizard2EditAnredeAndRewrite Fehler:", err);
        PartnerBotBus.say("Beim Aktualisieren ist ein Fehler aufgetreten.");
      });
    return;
  }

  // -----------------------
  // WIZARD 2 – Betreff ändern
  // -----------------------
  if (intent.type === "wizard2-edit-subject") {
    console.log("[fm-voice] applyVoiceIntent(wizard2-edit-subject)", intent.newSubject);
    handleWizard2EditSubject(intent.newSubject);
    return;
  }

  if (intent.type === "ai-chat") {
    const query = intent.query;
    console.log("[fm-ai] KI-Anfrage ausgelöst:", query);

    // WICHTIG: Prüfe die VORHERIGE Aktion, BEVOR wir die neue setzen
    const lastActionBefore = getLastAction();
    const hadEmailBefore = lastActionBefore && lastActionBefore.kind === "email-compose";

    // lastAction speichern
    setLastAction({
      kind: "other",
      description: `KI-Anfrage: "${query}"`,
    });

    // Bot reagiert sofort, damit es sich responsiv anfühlt
    PartnerBotBus.pose("thinking");
    PartnerBotBus.say("Ich denke kurz nach …");

    // Asynchron die KI fragen
    // WICHTIG: Wenn eine E-Mail vorher geöffnet war, soll die KI NUR reinen E-Mail-Text zurückgeben
    const enhancedMessage = hadEmailBefore
      ? `Du bist ein E-Mail-Assistent. Erzeuge einen höflichen E-Mail-Text basierend auf der folgenden Anweisung.

Formuliere eine E-Mail, die folgendes ausdrückt:
"${query}"

REGELN:
- Füge KEINE Grußformel am Ende hinzu (z.B. "Viele Grüße", "Mit freundlichen Grüßen" usw.).
- Schreibe KEINE Signatur (kein Name, keine Firma, keine Kontaktdaten).
- Antworte NUR mit dem Text der E-Mail (Anrede + Haupttext), ohne Betreff.
- Keine Erklärungen, keine Einleitungen wie "Natürlich", "Gerne" oder "Hier ist eine mögliche Formulierung".
- Keine Fragen an mich zurück.
- Kein Markdown, keine Anführungszeichen um den gesamten Text.

Antworte ausschließlich mit dem reinen E-Mail-Text, ohne Erklärungen.`.trim()
      : query;

    const enhancedContext = hadEmailBefore
      ? "Dies ist ein Voice-Befehl im Freiraum-Mitarbeiter. Antworte nur mit E-Mail-Text."
      : "Dies ist ein Voice-Befehl im Freiraum-Mitarbeiter.";

    askAssistant(enhancedMessage, {
      context: enhancedContext,
    })
      .then((reply) => {
        // Prüfe, ob eine E-Mail vorher geöffnet war
        if (hadEmailBefore && typeof window !== "undefined" && window.__fm_set_mail_body) {
          // KI-Antwort filtern, bevor sie in den Body geschrieben wird
          const cleaned = cleanEmailBodyFromAi(reply);

          console.log("[fm-mail] AI-Reply raw:", reply);
          console.log("[fm-mail] AI-Reply cleaned:", cleaned);

          // Gefilterte KI-Antwort direkt in den E-Mail-Body schreiben
          window.__fm_set_mail_body(cleaned);

          // Bot reagiert passend
          PartnerBotBus.pose("lightbulb");
          PartnerBotBus.say(
            "Ich habe dir den Text in die E-Mail geschrieben. Vorschau oder sofort senden?",
          );
        } else {
          // Standardverhalten: nur vorlesen / anzeigen
          PartnerBotBus.pose("lightbulb");
          PartnerBotBus.say(reply);
        }
      })
      .catch((err) => {
        console.error("[fm-voice] KI-Fehler:", err);
        PartnerBotBus.pose("confused");
        PartnerBotBus.say(
          "Die KI-Antwort konnte gerade nicht geladen werden. Versuche es bitte später erneut.",
        );
      });

    return;
  }

  // UNKNOWN-FALL kann als absoluter Notfall-Fallback bleiben
  triggerEmotion("error");
  PartnerBotBus.say('Das habe ich nicht verstanden. Sag z. B. "Gehe zum Lead-Radar".');
}

/**
 * Parst einen Sprachbefehl für eine E-Mail mit Inhalt (Wizard3-OneShot).
 * Verwendet AI mit Context "Wizard3-OneShot-Parse" um to, subject, tone, bodyInstructions zu extrahieren.
 */
async function wizard3Parse(raw: string): Promise<Wizard3ParseResult> {
  console.log("[fm-voice] wizard3Parse: Starte AI-Parse Request für:", raw);

  const message = `
Du bist ein Parser für deutsche Sprachbefehle, die eine E-Mail beschreiben.

DU BEKOMMST:
- Einen deutschen Sprachbefehl eines Nutzers (z.B. "Schreibe freiraumberatung at web punkt de eine Mail wegen dem Termin morgen und sag ihm, dass er mich anrufen kann.")
- Der Befehl kann umgangssprachlich, unvollständig oder etwas durcheinander sein.

DEINE AUFGABE:
- Analysiere den vollständigen Sprachbefehl.
- Extrahiere folgende Felder:

  - "to": die E-Mail-Adresse des Empfängers (z.B. "freiraumberatung@web.de").
    - Wenn der Nutzer sie nur beschreibt ("at web punkt de"), normalisiere sie in eine echte Adresse.
  - "subject": einen kurzen, sinnvollen Betreff, der zum gesamten Inhalt passt.
  - "tone": eine grobe Tonalität der Mail, z.B. "freundlich", "professionell", "locker".
  - "bodyInstructions": eine kompakte, aber vollständige Beschreibung dessen, was im eigentlichen E-Mail-Text stehen soll.
    - Hier müssen ALLE wichtigen Inhalte des Sprachbefehls enthalten sein:
      - Worum geht es? (z.B. Termin morgen, Angebot, Rückfrage)
      - Was soll gesagt oder gefragt werden? (z.B. "bitte um Rückruf", "bestätige den Termin", "frage nach einer Uhrzeit")
      - Besondere Hinweise ("kurz halten", "locker", "sehr höflich" etc.)
  - "extraInstructions": optional, nur falls es zusätzliche, feinere Hinweise gibt, die nicht gut in "bodyInstructions" passen.

SEHR WICHTIG – KEINE NAMEN ERFINDEN:
- Du DARFST KEINE neuen Personennamen erfinden.
- Verwende nur Personennamen, die im Sprachbefehl WÖRTLICH vorkommen.
- Wenn im Sprachbefehl nur Pronomen wie "er", "sie", "ihm", "ihn", "ihr" vorkommen,
  dann formuliere bodyInstructions neutral, z.B.:
  - "bitte darum, dass er mich morgen anruft"
  - "frage nach, ob sie Zeit hat"
- Ersetze solche Pronomen NICHT durch konkrete Namen wie "Dennis", "Marvin" usw., wenn diese Namen im Sprachbefehl NICHT vorkommen.
- Wenn der Nutzer ausdrücklich einen Namen nennt (z.B. "sag Dennis, dass er mich anrufen kann"),
  dann darfst du diesen Namen in bodyInstructions verwenden.

WEITERE REGELN:
- Wirf KEINE relevanten Inhalte aus dem Sprachbefehl weg.
- Fasse den Befehl zusammen, aber so, dass keine wichtige Information verloren geht.
- Du darfst Formulierungen leicht glätten, aber der Sinn muss identisch bleiben.

ANTWORTFORMAT:
- Gib ausschließlich ein JSON-Objekt mit GENAU diesen Schlüsseln zurück:
  {
    "to": string | null,
    "subject": string | null,
    "tone": string | null,
    "bodyInstructions": string | null,
    "extraInstructions": string | null
  }

Beispiele (nur zur Orientierung):

- Befehl: "Schreibe freiraumberatung at web punkt de eine Mail wegen dem Termin morgen und sag ihm, dass er mich anrufen kann."
  ➜ bodyInstructions: "Es geht um den Termin morgen. Bitte darum, dass er mich anruft."

- Befehl: "Schreibe freiraumberatung at web punkt de eine Mail wegen dem Termin morgen und sag Dennis, dass er mich anrufen kann."
  ➜ bodyInstructions: "Es geht um den Termin morgen. Bitte Dennis, dich morgen anzurufen."

Sprachbefehl:
${raw}
`.trim();

  try {
    const reply = await askAssistant(message, {
      context: "Wizard3-OneShot-Parse",
    });

    console.log("[fm-voice] wizard3Parse: AI-Reply raw:", reply);

    // Versuche JSON aus der Antwort zu extrahieren
    let parsed: Wizard3ParseResult;
    try {
      // Entferne mögliche Markdown-Code-Blöcke
      const cleaned = reply
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn("[fm-voice] wizard3Parse: JSON-Parse fehlgeschlagen, versuche Fallback:", parseErr);
      // Fallback: Versuche JSON-Objekt aus dem Text zu extrahieren
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Kein gültiges JSON in AI-Antwort gefunden");
      }
    }

    console.log("[fm-voice] wizard3Parse: Parsed Result:", parsed);
    return parsed;
  } catch (err) {
    console.error("[fm-voice] wizard3Parse: Fehler:", err);
    throw err;
  }
}

/**
 * Generiert den E-Mail-Body basierend auf bodyInstructions und tone.
 */
async function wizard3BuildEmail(
  bodyInstructions: string,
  tone?: string | null,
  extraInstructions?: string | null
): Promise<string> {
  const body = [
    bodyInstructions,
    tone ? `Tonalität: ${tone}` : null,
    extraInstructions ? `Zusätzliche Hinweise: ${extraInstructions}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const aiPrompt = `
Du bist ein deutscher E-Mail-Assistent.

Du schreibst nur Anrede und Haupttext einer E-Mail, aber KEINE Grußformel und KEINE Signatur am Ende.

REGELN FÜR DIE ANREDE:

1) Wenn im Abschnitt "Kontext" ein Vorname EXPLIZIT wörtlich vorkommt
   (z.B. "Dennis", "Denis", "Marvin", "Leon", "Julian", "Jannik"),
   dann verwende eine persönliche Anrede wie z.B.:
   - "Hallo Dennis," oder
   - "Guten Morgen Marvin," usw.

2) Wenn im Kontext KEIN Vorname vorkommt:
   - Verwende KEINE Anrede mit Namen.
   - Nutze in diesem Fall nur neutrale Anreden wie:
     - "Guten Tag," oder
     - "Guten Morgen," oder
     - "Hallo," (OHNE Namen).
   - Du darfst in diesem Fall KEINEN Namen dazuerfinden.

3) Ignoriere E-Mail-Adressen, Domains und Firmennamen bei der Wahl der Anrede vollständig.
   Beispiele:
   - Aus "freiraumberatung@web.de" darfst du KEINEN Namen ableiten.
   - Aus "Freiraum Beratung" darfst du KEINEN Vornamen ableiten.
   - Nutze ausschliesslich Vornamen, die im Klartext im Kontext vorkommen.

4) Verwende NIEMALS einen Namen in der Anrede, der nicht wortwörtlich im Kontext steht.
   Errate oder erfinde keine Vornamen.

FORMAT-REGELN:

- Füge am Ende KEINE Zeile mit "Viele Grüße", "Mit freundlichen Grüßen",
  "Herzliche Grüße" oder ähnlichen Grußformeln an.
- Schreibe NICHT den Namen des Absenders am Ende.
- Antworte NUR mit dem E-Mail-Text (ohne Erklärungen, ohne JSON, nur reinen Text).
- Schreibe KEINE Betreffzeile und verwende NICHT das Wort "Betreff:".
- Der Betreff wird separat gesetzt, du erzeugst nur den eigentlichen E-Mail-Text (Anrede + Haupttext).

Kontext:
${bodyInstructions}

${tone ? `Tonalität: ${tone}` : ""}
${extraInstructions ? `Zusätzliche Hinweise: ${extraInstructions}` : ""}
`.trim();

  console.log("[fm-voice] wizard3BuildEmail: Starte Body-Generierung mit Prompt:", aiPrompt);

  try {
    const reply = await askAssistant(aiPrompt, {
      context: "Wizard3-BuildEmail",
    });

    // Entferne mögliche Grußformeln am Ende (Fallback)
    const cleaned = cleanEmailBodyFromAi(reply);
    console.log("[fm-voice] wizard3BuildEmail: Body generiert:", cleaned);
    return cleaned;
  } catch (err) {
    console.error("[fm-voice] wizard3BuildEmail: Fehler:", err);
    throw err;
  }
}

/**
 * Holt den aktuellen E-Mail-Body aus der UI.
 */
function getCurrentMailBody(): string | null {
  if (typeof window === "undefined") return null;
  
  // Versuche über globale Getter-Funktion
  if ((window as any).__fm_get_mail_body) {
    return (window as any).__fm_get_mail_body();
  }
  
  // Fallback: Versuche Textarea direkt zu finden
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Nachricht"], textarea[placeholder*="Message"]');
  if (textarea) {
    return textarea.value || null;
  }
  
  return null;
}

/**
 * Holt den aktuellen E-Mail-Betreff aus der UI.
 */
function getCurrentMailSubject(): string | null {
  if (typeof window === "undefined") return null;
  
  // Versuche über globale Getter-Funktion
  if ((window as any).__fm_get_mail_subject) {
    return (window as any).__fm_get_mail_subject();
  }
  
  // Fallback: Versuche Input direkt zu finden
  const input = document.querySelector<HTMLInputElement>('input[placeholder*="Betreff"], input[placeholder*="Subject"]');
  if (input) {
    return input.value || null;
  }
  
  return null;
}

/**
 * Extrahiert die erste Zeile (Anrede) aus einem E-Mail-Body.
 */
function extractGreetingLine(body: string): string | null {
  if (!body) return null;
  const lines = body.split("\n");
  const firstLine = lines[0]?.trim();
  if (firstLine && firstLine.length > 0 && !firstLine.includes("Betreff:")) {
    return firstLine;
  }
  return null;
}

/**
 * Entfernt die erste Zeile (Anrede) aus einem E-Mail-Body.
 */
function removeGreetingLine(body: string): string {
  if (!body) return body;
  const lines = body.split("\n");
  if (lines.length <= 1) return body;
  return lines.slice(1).join("\n").trimStart();
}

/**
 * Wizard2: Ändert nur die Anrede im E-Mail-Body.
 */
async function handleWizard2EditAnrede(newAnrede: string, options?: { silent?: boolean }): Promise<void> {
  console.log("[fm-voice] handleWizard2EditAnrede: newAnrede:", newAnrede);
  
  const currentBody = getCurrentMailBody();
  if (!currentBody) {
    console.warn("[fm-voice] handleWizard2EditAnrede: Kein Body gefunden");
    if (!options?.silent) {
      PartnerBotBus.say("Ich sehe gerade keine E-Mail, die ich bearbeiten kann.");
    }
    return;
  }
  
  // Entferne alte Anrede, füge neue hinzu
  const bodyWithoutGreeting = removeGreetingLine(currentBody);
  const newBody = `${newAnrede}\n\n${bodyWithoutGreeting}`.trim();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  
  if (typeof window !== "undefined" && typeof window.__fm_set_mail_body === "function") {
    window.__fm_set_mail_body(newBody);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    let readback = (window.__fm_get_mail_body?.() ?? "").toString();

    // Sync-Fix: Wenn der Composer-State den Body nicht sofort übernimmt, einmal kontrolliert nachsetzen.
    if (readback.trim() !== newBody.trim()) {
      console.warn("[fm-voice] handleWizard2EditAnrede: readback mismatch after first set, retrying", {
        expectedPreview: newBody.slice(0, 80),
        readbackPreview: readback.slice(0, 80),
      });
      await sleep(120);
      window.__fm_set_mail_body(newBody);
      await sleep(120);
      readback = (window.__fm_get_mail_body?.() ?? "").toString();
    }

    if (readback.trim() !== newBody.trim()) {
      (window as any).__fm_pending_body_replace = newBody;
      console.warn("[fm-voice] handleWizard2EditAnrede: readback still mismatched, stored pending body replace");
    }

    console.log("[fm-voice] handleWizard2EditAnrede: Body aktualisiert", {
      readbackMatches: readback.trim() === newBody.trim(),
    });
    if (!options?.silent) PartnerBotBus.say("Anrede wurde aktualisiert.");
  }
}

/**
 * Wizard2: Schreibt den E-Mail-Body um basierend auf einer Anweisung.
 */
async function handleWizard2RewriteBody(
  instruction: string,
  forcedGreetingLine?: string
) {
  if (!window.__fm_get_mail_body || !window.__fm_set_mail_body) {
    return;
  }

  const currentBody = (window.__fm_get_mail_body() || "").trim();

  // 1) Anrede + Resttext trennen
  let originalGreeting = "";
  let originalText = "";

  if (currentBody.length > 0) {
    const parts = currentBody.split(/\n\s*\n/);

    if (parts.length === 1) {
      originalGreeting = "";
      originalText = currentBody;
    } else {
      originalGreeting = parts[0].trim();
      originalText = parts.slice(1).join("\n\n").trim();
    }
  }

  // 2) prüfen ob Instruction die Anrede erwähnt
  const lowerInstr = instruction.toLowerCase();
  const mentionsAnrede = lowerInstr.includes("anrede");

  // 3) keepGreeting = true → Anrede bleibt
  const keepGreeting = !mentionsAnrede && !forcedGreetingLine;

  const prompt = `
Du bist ein deutscher E-Mail-Assistent.

Du bekommst:
- die bisherige Anrede in "OriginalAnrede"
- den bisherigen Resttext in "OriginalText"
- eine Anweisung, wie du den Text umschreiben sollst
- optional eine erzwungene neue Anrede ("forcedGreetingLine")
- ein Flag "keepGreeting", das angibt, ob die vorhandene Anrede exakt übernommen werden muss.

REGELN:

1) Antworte NUR mit dem kompletten E-Mail-Text (Anrede + Haupttext),
   ohne Erklärungen, ohne Betreff und OHNE Grußformel am Ende.
   Keine "Viele Grüße", "Mit freundlichen Grüßen", kein Name.
   Kein "Betreff:" schreiben.

2) Wenn keepGreeting = true:
   - Übernimm "OriginalAnrede" 1:1 als Anrede.
   - Schreibe NUR den Haupttext ("OriginalText") entsprechend der Anweisung um.
   - Wenn die Originalanrede leer ist, darfst du eine passende wählen.

3) Wenn keepGreeting = false UND forcedGreetingLine NICHT leer:
   - Verwende forcedGreetingLine 1:1 als Anrede.
   - Schreibe den Text gemäss der Anweisung um.

4) Wenn keepGreeting = false UND forcedGreetingLine leer ist:
   - Du darfst Anrede + Text komplett neu schreiben.

Daten:

OriginalAnrede:
${originalGreeting || "(leer)"}

OriginalText:
${originalText || "(leer)"}

forcedGreetingLine:
${forcedGreetingLine || "(leer)"}

keepGreeting:
${keepGreeting ? "true" : "false"}

Anweisung:
${instruction}
`.trim();

  const aiResponse = await askAssistant(prompt, {
    context: "Wizard2-Rewrite-Body",
  });

  const newBody = (aiResponse || "").trim();
  if (!newBody) {
    console.warn("[fm-voice] handleWizard2RewriteBody: AI-Antwort ist leer");
    return;
  }

  if (typeof window !== "undefined" && typeof window.__fm_set_mail_body === "function") {
    window.__fm_set_mail_body(newBody);
    console.log("[fm-voice] handleWizard2RewriteBody: Body aktualisiert und ins UI geschrieben");
  } else {
    console.warn(
      "[fm-voice] handleWizard2RewriteBody: __fm_set_mail_body nicht verfügbar – Body im UI konnte nicht aktualisiert werden."
    );
  }
}

/**
 * Wizard2: Ändert den Betreff.
 */
function handleWizard2EditSubject(newSubject: string) {
  if (!window.__fm_set_mail_subject) return;

  if (!newSubject) {
    window.__fm_set_mail_subject("");
    return;
  }

  const trimmed = newSubject.trim();
  if (trimmed.length === 0) {
    window.__fm_set_mail_subject("");
    return;
  }

  // Nur ersten Buchstaben groß – Rest unverändert
  const normalized =
    trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  window.__fm_set_mail_subject(normalized);
}

export function syncSubjectLockWithContext(selectedContext: { uid?: string | null } | null) {
  if (typeof window === "undefined") return;
  const w = window as any;
  const currentContextUid = selectedContext?.uid ? String(selectedContext.uid) : null;
  const lockContextUid = w.__fm_subject_lock_context_uid ? String(w.__fm_subject_lock_context_uid) : null;

  if (!currentContextUid) {
    w.__fm_subject_lock_context_uid = null;
    return;
  }

  if (!lockContextUid) {
    w.__fm_subject_lock_context_uid = currentContextUid;
    return;
  }

  if (lockContextUid === currentContextUid) return;

  if (w.__fm_subject_locked || w.__fm_subject_manually_edited) {
    w.__fm_subject_locked = false;
    w.__fm_subject_locked_value = null;
    w.__fm_subject_manually_edited = false;
    if (w.__fm_wizard4_last_draft && typeof w.__fm_wizard4_last_draft === "object") {
      w.__fm_wizard4_last_draft.meta = {
        ...(w.__fm_wizard4_last_draft.meta ?? {}),
        subjectLocked: false,
      };
    }
    console.log("[wizard4][subject-lock] reset on context switch", {
      fromContextUid: lockContextUid,
      toContextUid: currentContextUid,
    });
  }

  w.__fm_subject_lock_context_uid = currentContextUid;
}

export function processVoiceCommand(transcript: string, navigate: NavigateFunction) {
  const commandRunId = ++latestVoiceCommandRunId;
  const commandTiming = createVoiceTiming(transcript ?? "");
  logVoiceTiming(commandTiming, "command-received");
  const normalizeContextReplySubject = (rawSubject: string | null | undefined): string => {
    const cleaned = (rawSubject ?? "").trim();
    if (!cleaned) return "AW: Ihre Nachricht";
    if (/^(aw|re)\s*:/i.test(cleaned)) return cleaned;
    return `AW: ${cleaned}`;
  };

  const routingTranscript = normalizeTranscriptForRouting(transcript);
  logVoiceTiming(commandTiming, "transcript-normalized", {
    changed: routingTranscript !== transcript,
  });
  if (routingTranscript !== transcript) {
    console.log("[fm-voice][normalize] transcript adjusted for routing", {
      before: transcript,
      after: routingTranscript,
    });
  }
  lastTranscript = routingTranscript; // Für Wizard4Intent-Parsing speichern
  const selectedContext = getSelectedMailContext();
  logVoiceTiming(commandTiming, "context-loaded", {
    hasContext: !!selectedContext,
  });
  syncSubjectLockWithContext(selectedContext);
  const w = typeof window !== "undefined" ? (window as any) : null;
  const pendingAmbiguity = w?.__fm_contact_ambiguity_choices;
  if (
    pendingAmbiguity &&
    Array.isArray(pendingAmbiguity.choices) &&
    pendingAmbiguity.choices.length > 0 &&
    w?.__fm_last_hint?.kind === "contact_ambiguous"
  ) {
    const choices = pendingAmbiguity.choices as ContactAmbiguityChoice[];
    const selectedIndex = parseAmbiguousContactChoiceIndex(routingTranscript, choices.length);
    const spokenEmail = extractFirstEmailAddress(routingTranscript);
    const selectedByIndex = selectedIndex ? choices.find((c) => c.index === selectedIndex) ?? null : null;
    const selectedByEmail = spokenEmail
      ? choices.find((c) => (c.email || "").trim().toLowerCase() === spokenEmail) ?? null
      : null;
    const selectedChoice = selectedByIndex ?? selectedByEmail;
    if (selectedChoice && typeof w.__fm_set_mail_to === "function") {
      w.__fm_set_mail_to(selectedChoice.email);
      w.__fm_contact_ambiguity_choices = null;
      w.__fm_last_hint = {
        kind: "contact_ambiguous_resolved",
        message: `Empfänger gesetzt: ${selectedChoice.displayName || selectedChoice.email}.`,
        ts: Date.now(),
      };
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("fm-hint-update"));
      }
      PartnerBotBus.say(`Alles klar. Ich nehme Kontakt ${selectedChoice.index}.`);
      logVoiceTiming(commandTiming, "contact-ambiguity-choice-resolved", {
        selectedIndex: selectedChoice.index,
        selectedEmail: selectedChoice.email,
      });
      return;
    }
    if (isAmbiguousChoiceSelectionAttempt(routingTranscript)) {
      const maxChoice = Math.min(choices.length, 3);
      const hintMessage = `Bitte wähle eindeutig mit Kontakt 1 bis ${maxChoice}.`;
      w.__fm_last_hint = {
        kind: "contact_ambiguous",
        message: hintMessage,
        ts: Date.now(),
      };
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("fm-hint-update"));
      }
      PartnerBotBus.say(hintMessage);
      logVoiceTiming(commandTiming, "contact-ambiguity-choice-invalid", {
        transcript: routingTranscript,
      });
      return;
    }
  }
  if (selectedContext && isExplicitContextSendConfirmation(routingTranscript)) {
    const to = String(w?.__fm_get_mail_to?.() ?? "").trim();
    const subject = String(w?.__fm_get_mail_subject?.() ?? "").trim();
    const body = String(w?.__fm_get_mail_body?.() ?? "").trim();
    const isValidDraft = !!to && !!subject && body.length > 0;

    if (!isValidDraft) {
      if (w) {
        w.__fm_last_hint = {
          kind: "reply_send_needs_draft",
          message: "Zum Senden fehlt noch ein vollständiger Antwortentwurf. Diktiere bitte zuerst den Antworttext.",
          ts: Date.now(),
        };
        if (typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("fm-hint-update"));
        }
      }
      PartnerBotBus.say("Zum Senden fehlt noch ein vollständiger Antwortentwurf. Diktiere bitte zuerst den Antworttext.");
      return;
    }

    console.log("[fm-voice][exchange-context] explicit send confirmation accepted", {
      contextUid: selectedContext.uid,
      to,
      subject,
      bodyLength: body.length,
    });
    allowNextEmailSendWithoutExtraConfirmationUntil = Date.now() + 30000;
    applyVoiceIntent(
      {
        type: "email-send",
        sourceText: routingTranscript,
        meta: {
          __fmTiming: commandTiming,
          __fmRunId: commandRunId,
        },
      } as any,
      navigate
    );
    return;
  }

  const contextRoutingTranscript = selectedContext
    ? normalizeContextDirectReplyTranscript(routingTranscript)
    : routingTranscript;
  const replyIntent = buildReplyIntentFromSelectedMailContext(contextRoutingTranscript, selectedContext);
  if (replyIntent) {
    console.log("[fm-voice][exchange-context] reply intent from active mail context", {
      contextUid: selectedContext?.uid ?? null,
      hasBodyHint: "bodyHint" in replyIntent && !!replyIntent.bodyHint,
    });
  }
  const miniCommandIntent = resolveMiniCommandIntentFromText(routingTranscript);
  const routedIntent = miniCommandIntent ?? routeVoiceIntent(contextRoutingTranscript);
  const hasComposerContext =
    typeof window !== "undefined" &&
    typeof (window as any).__fm_set_mail_body === "function" &&
    typeof (window as any).__fm_get_mail_body === "function";
  const shouldHardBypassContext =
    isComposerPriorityIntentType(routedIntent.type) ||
    (isLikelyMiniCommandText(routingTranscript) && isMiniCommandIntentType(routedIntent.type));
  if (shouldHardBypassContext && replyIntent) {
    console.log("[fm-voice][exchange-context] hard bypass: prefer routed mini/editor command", {
      routedType: routedIntent.type,
      replyType: replyIntent.type,
      transcript: contextRoutingTranscript,
    });
  }

  const immediateOpenMail =
    isMobileVoiceShell() &&
    isImmediateSendMode() &&
    !!selectedContext?.uid &&
    !!selectedContext?.fromEmail;

  if (
    immediateOpenMail &&
    selectedContext &&
    !shouldHardBypassContext &&
    routedIntent.type !== "email-append"
  ) {
    const namedAway = isNamedComposeAwayFromOpenMail(routedIntent, selectedContext);
    const cancelRequested = hasCancelPhrase({
      raw: routingTranscript,
      normalized: routingTranscript.toLowerCase(),
    });
    if (!namedAway && !cancelRequested && !isLikelyNoiseUtterance(routingTranscript)) {
      const immediateIntent = buildImmediateReplyIntentFromOpenMail(
        contextRoutingTranscript,
        selectedContext,
        replyIntent
      );
      if (immediateIntent) {
        console.log("[fm-voice][immediate-open-mail] sending spoken reply", {
          contextUid: selectedContext.uid,
          bodyLength: immediateIntent.bodyHint?.length ?? 0,
        });
        const intentWithTiming: any = {
          ...immediateIntent,
          meta: {
            ...(immediateIntent.meta ?? {}),
            __fmTiming: commandTiming,
            __fmRunId: commandRunId,
          },
        };
        applyVoiceIntent(intentWithTiming, navigate);
        return;
      }
    }
  }

  if (routedIntent.type === "ai-chat" && (selectedContext?.uid || hasComposerContext)) {
    const w = typeof window !== "undefined" ? (window as any) : null;
    const isNoise = isLikelyNoiseUtterance(routingTranscript);
    const commandLikeMisheard = isLikelyMisheardComposerCommand(routingTranscript);
    const isUnclearInComposeContext = !isNoise && !commandLikeMisheard;
    const canUseReplyContextFallback = !!selectedContext?.uid && !!replyIntent;
    const shouldBlockAiFallback =
      isNoise ||
      commandLikeMisheard ||
      !canUseReplyContextFallback;
    if (!shouldBlockAiFallback) {
      logVoiceTiming(commandTiming, "compose-ai-fallback-allowed-context-reply", {
        transcript: contextRoutingTranscript,
      });
    } else {
    if (w) {
      w.__fm_last_hint = {
        kind: isNoise ? "voice_noise_retry" : "voice_command_retry",
        message: commandLikeMisheard
          ? "Das klang wie ein Bearbeitungsbefehl, aber unklar. Bitte wiederhole den Befehl deutlich."
          : isNoise
            ? "Ich habe nur einen kurzen Laut verstanden. Wiederhole bitte den Befehl."
            : "Unklar verstanden. Bitte formuliere den Befehl erneut, zum Beispiel: 'Text löschen' oder 'Satz 2 ersetzen ...'.",
        ts: Date.now(),
      };
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("fm-hint-update"));
      }
    }
    PartnerBotBus.say(
      commandLikeMisheard
        ? "Ich habe den Bearbeitungsbefehl nicht sicher verstanden. Bitte wiederholen."
        : isNoise
          ? "Ich habe nur einen kurzen Laut verstanden. Bitte wiederholen."
          : "Ich habe den Befehl nicht sicher verstanden. Bitte wiederhole ihn klar."
    );
    logVoiceTiming(commandTiming, "compose-ai-fallback-blocked", {
      transcript: contextRoutingTranscript,
      commandLikeMisheard,
      isNoise,
      isUnclearInComposeContext,
    });
    return;
    }
  }
  if (
    routedIntent.type === "email-compose" &&
    (selectedContext?.uid || hasComposerContext) &&
    isLikelyUnclearComposeFallbackInContext(routingTranscript) &&
    !shouldSendNowFromSourceText(contextRoutingTranscript) &&
    !immediateOpenMail
  ) {
    const w = typeof window !== "undefined" ? (window as any) : null;
    if (w) {
      w.__fm_last_hint = {
        kind: "voice_command_retry",
        message:
          "Das klang wie ein unklarer Bearbeitungsbefehl. Bitte wiederhole klar, z. B. 'Text löschen' oder 'Satz 2 ersetzen ...'.",
        ts: Date.now(),
      };
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("fm-hint-update"));
      }
    }
    PartnerBotBus.say("Ich habe den Bearbeitungsbefehl nicht sicher verstanden. Bitte wiederholen.");
    logVoiceTiming(commandTiming, "compose-fallback-guard-blocked", {
      transcript: contextRoutingTranscript,
    });
    return;
  }
  let intent = shouldHardBypassContext ? routedIntent : (replyIntent ?? routedIntent);
  const preferRoutedIntentInContext =
    !!selectedContext?.uid &&
    !!replyIntent &&
    isComposerPriorityIntentType(routedIntent.type);
  if (preferRoutedIntentInContext) {
    intent = routedIntent;
    console.log("[fm-voice][exchange-context] routed intent has priority over context reply", {
      routedType: routedIntent.type,
      replyType: replyIntent.type,
    });
  }
  logVoiceTiming(commandTiming, "intent-routed", {
    intentType: (intent as any)?.type ?? "unknown",
  });

  // Kontext-Fallback: Wenn eine Mail ausgewählt ist und ein allgemeiner Compose-Intent erkannt wurde,
  // antworte standardmäßig auf den ausgewählten Kontext (Empfänger + Betreff aus Kontext).
  if (
    !replyIntent &&
    selectedContext?.uid &&
    selectedContext?.fromEmail &&
    intent.type === "email-compose"
  ) {
    const explicitSendNowRequested =
      shouldSendNowFromSourceText(contextRoutingTranscript) || intent?.meta?.autoSend === true;
    const normalizedSubject = normalizeContextReplySubject(selectedContext.subject);
    const nextMeta: any = {
      ...(intent.meta ?? {}),
      source: "exchange-context-compose-fallback",
      uiHint: intent.meta?.uiHint || "Ich habe einen Antwort-Entwurf vorbereitet.",
    };
    if (explicitSendNowRequested) {
      nextMeta.autoSend = true;
      nextMeta.forcePreviewOnly = false;
      nextMeta.forcePreviewOnlyReason = undefined;
    } else {
      nextMeta.forcePreviewOnly = true;
      nextMeta.forcePreviewOnlyReason = "context_reply_default";
    }
    intent = {
      ...intent,
      to: selectedContext.fromEmail,
      toRaw: selectedContext.fromName || selectedContext.fromEmail,
      subjectHint: normalizedSubject,
      meta: nextMeta,
    };
    console.log("[fm-voice][exchange-context] compose fallback applied", {
      contextUid: selectedContext.uid,
      to: selectedContext.fromEmail,
      subjectHint: normalizedSubject,
      explicitSendNowRequested,
    });
  }

  const intentWithTiming: any = {
    ...(intent as any),
    meta: {
      ...(((intent as any)?.meta ?? {}) as Record<string, unknown>),
      __fmTiming: commandTiming,
      __fmRunId: commandRunId,
    },
  };
  logVoiceTiming(commandTiming, "apply-intent-start", {
    intentType: (intentWithTiming as any)?.type ?? "unknown",
  });
  applyVoiceIntent(intentWithTiming, navigate);
}