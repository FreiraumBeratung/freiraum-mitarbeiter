import type { SelectedMailContext } from "../mail/selectedMailContext";
import type { VoiceIntent } from "./intent_router";
import { hasCancelPhrase, stripCancelPhraseFromBody } from "../../logic/wizard4/cancel_phrase";
type EmailComposeIntent = Extract<VoiceIntent, { type: "email-compose" }>;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCommandText(text: string): string {
  return (text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/zurueck/gi, "zurück");
}

function normalizeForCancelDetection(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function senderAliases(context: SelectedMailContext | null | undefined): string[] {
  const fromName = (context?.fromName ?? "").trim();
  if (!fromName) return [];
  const parts = fromName.split(/\s+/).filter(Boolean);
  const aliases = new Set<string>();
  aliases.add(fromName);
  if (parts[0]) aliases.add(parts[0]);
  return [...aliases].filter((v) => v.length >= 3);
}

function hasAddressedSenderDirective(text: string, context: SelectedMailContext | null | undefined): boolean {
  const aliases = senderAliases(context);
  if (!aliases.length) return false;
  return aliases.some((name) => {
    const n = escapeRegex(name);
    return new RegExp(
      `^\\s*(?:äh+\\s+|hm+\\s+|mal\\s+|kurz\\s+|bitte\\s+)*(?:(?:sende|schick(?:e)?)\\s+)?${n}\\b(?:\\s*(?:,|:)\\s*|\\s+)(?:bitte\\s+)?(?:folgendes?|wie\\s+folgt|direkt|sofort|antwort|antworte|beantworte|zurück|zurückschreiben)?`,
      "i"
    ).test(text);
  });
}

function hasReplyVerb(text: string): boolean {
  return /\b(antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?|reagier(?:e|en)?|informier(?:e|en)?)\b/i.test(text);
}

function hasLeadingReplyCommand(text: string): boolean {
  return /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+|bitte\s+)*(?:antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?|reagier(?:e|en)?|informier(?:e|en)?|schreib\s+zur(?:ue|[üu])ck|antwort(?:e|en)?\s*:|zur(?:ue|[üu])ck\s*:|direkt(?:e)?\s+antwort(?:\s*:)?|kurze?\s+antwort(?:\s*:)?)/i.test(
    text
  );
}

function hasContextWriteCommand(text: string): boolean {
  return /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*(?:bitte\s+)?(?:schreib(?:e)?(?!\s+zur(?:ue|[üu])ck)|verfass(?:e)?|formulier(?:e)?)\b/i.test(
    text
  );
}

function hasContextualReplyShortcut(text: string): boolean {
  return (
    /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*(?:bitte\s+)?(?:sag\s+(?:ihm|ihr|denen)(?:\s+bitte)?|schreib\s+zur(?:ue|[üu])ck|antwort(?:e|en)?\s+wie\s+folgt|antwort(?:e|en)?\s*:|zur(?:ue|[üu])ck\s*:)/i.test(
      text
    ) ||
    /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*(?:bitte\s+)?(?:direkt(?:e)?\s+antwort|kurze?\s+antwort|antwort\s+direkt|direkt(?:e)?\s+r[üu]ckmeldung)\b/i.test(
      text
    ) ||
    /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*(?:bitte\s+)?(?:la(?:ss|s)\s+(?:ihn|sie|ihm|ihr|denen)\s+(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?wissen|gib\s+(?:ihm|ihr|denen)\s+(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?durch|sag\s+(?:ihm|ihr|denen)\s+(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?bescheid)\b/i.test(
      text
    ) ||
    /\bantwort\s+wie\s+folgt\b/i.test(text)
  );
}

function hasMailTargetHint(text: string): boolean {
  return (
    /\b(darauf|hierauf)\b/i.test(text) ||
    /\bauf\s+(?:diese|die|die\s+ausgewählte|die\s+markierte)\s+(?:mail|e-?mail|email|nachricht)\b/i.test(text) ||
    /\b(mail|e-?mail|email|nachricht)\b/i.test(text)
  );
}

function hasDirectReplyTrigger(text: string): boolean {
  return (
    /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*(?:bitte\s+)?(?:antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?)\s+bitte\b/i.test(text) ||
    /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*bitte\s+(?:antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?)\b/i.test(text) ||
    /\b(?:antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?|schreib\s+zur(?:ue|[üu])ck)\b[\s\S]*\b(?:direkt|sofort)\b/i.test(text) ||
    /\b(?:direkt|sofort)\s+(?:antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?|zurück)\b/i.test(text) ||
    /\b(?:sende|schick(?:e)?)\b[\s\S]*\b(?:direkt|sofort)\b/i.test(text) ||
    /\bdirekt(?:e)?\s+antwort\b/i.test(text) ||
    /\b(?:la(?:ss|s)\s+(?:ihn|sie|ihm|ihr|denen)\s+(?:bitte\s+)?)?(?:direkt|sofort)\s+wissen\b/i.test(text) ||
    /\b(?:gib|sag)\s+(?:ihm|ihr|denen)\s+(?:bitte\s+)?(?:direkt|sofort)\s+(?:durch|bescheid)\b/i.test(text)
  );
}

function normalizeBodyHint(bodyHint: string | undefined): string | undefined {
  if (!bodyHint) return undefined;
  const trimmed = bodyHint.trim();
  if (!trimmed) return undefined;
  const low = trimmed.toLowerCase();
  const canonical = low.replace(/[.!?]+$/g, "").trim();
  if (
    /^(?:auf\s+)?(?:diese|die)\s+(?:mail|e-?mail|email|nachricht|antwort)$/.test(canonical) ||
    /^(?:mail|e-?mail|email|nachricht|antwort)$/.test(canonical) ||
    /^(?:(?:bitte|direkt|sofort)\s+)*(?:antwort(?:e|en)?|antworte|beantworte|zurück(?:schreiben|schreib)?)(?:\s+auf)?\s*(?:diese|die)?\s*(?:mail|e-?mail|email|nachricht|antwort)?$/.test(
      canonical
    ) ||
    /^(?:(?:bitte|direkt|sofort)\s+)*(?:antworten?|antworte|beantworte|zurück(?:schreiben|schreib)?)?(?:\s+auf)?\s*(?:diese|die)?\s*(?:mail|e-?mail|email|nachricht|antwort)?$/.test(
      canonical
    )
  ) {
    return undefined;
  }
  return trimmed;
}

function normalizeReplySubject(subject: string | null | undefined): string {
  const cleaned = (subject ?? "").trim();
  if (!cleaned) return "AW: Ihre Nachricht";
  if (/^(aw|re)\s*:/i.test(cleaned)) return cleaned;
  return `AW: ${cleaned}`;
}

export function extractReplyBodyHint(
  transcript: string,
  selectedContext?: SelectedMailContext | null
): string | undefined {
  if (!transcript) return undefined;
  let rest = normalizeCommandText(transcript);
  const aliases = senderAliases(selectedContext);

  rest = rest.replace(/^\s*(?:äh+|hm+)\s*/i, "");
  rest = rest.replace(/^\s*(?:mal|kurz)\s+/i, "");

  for (const alias of aliases) {
    const a = escapeRegex(alias);
    rest = rest.replace(
      new RegExp(
        `^\\s*(?:(?:sende|schick(?:e)?)\\s+)?${a}\\b(?:\\s*(?:,|:)\\s*|\\s+)(?:bitte\\s+)?(?:folgendes?|wie\\s+folgt|direkt|sofort|antwort|antworte|beantworte|zurück|zurückschreiben)?(?:\\s+zu)?[\\s,:\\-]*`,
        "i"
      ),
      ""
    );
  }

  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:schreib(?:e)?(?!\s+zur(?:ue|[üu])ck)|verfass(?:e)?|formulier(?:e)?)\s+(?:bitte\s+)?(?:(?:folgend(?:e|es)\s+)?(?:mail|e-?mail|email|nachricht)(?:\s+an\s+[^,.:;!?]+)?\s*)?(?:folgendes?|wie\s+folgt)?\s*[:.,\-]?\s*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:sag\s+(?:ihm|ihr|denen)(?:\s+bitte)?|schreib\s+zur(?:ue|[üu])ck|antwort(?:e|en)?\s+wie\s+folgt|antwort(?:e|en)?\s*:|zur(?:ue|[üu])ck\s*:)[\s,:\-]*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:direkt(?:e)?\s+antwort|kurze?\s+antwort|antwort\s+direkt|direkt(?:e)?\s+r[üu]ckmeldung)\s*[:\-]?\s*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:la(?:ss|s)\s+(?:ihn|sie|ihm|ihr|denen)\s+(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?wissen|gib\s+(?:ihm|ihr|denen)\s+(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?durch|sag\s+(?:ihm|ihr|denen)\s+(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?bescheid)\s*[:\-]?\s*/i,
    ""
  );
  rest = rest.replace(/^\s*(?:direkt|sofort)\s+bescheid\b[\s,:\-]*/i, "");
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?|reagier(?:e|en)?)(?:\s+bitte)?\s+(?:direkt|sofort)\s*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?(?:antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?|reagier(?:e|en)?)\s*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:sende|schick(?:e)?)\s+(?:bitte\s+)?(?:direkt|sofort)?\s*(?:zu|an)?\s*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:auf\s+(?:diese|die|die\s+ausgewählte|die\s+markierte)\s+(?:mail|e-?mail|email|nachricht)|darauf|hierauf)\s*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:direkt|sofort|mal|kurz|mit|dass|folgendes?|folgender\s+nachricht|antwort)\b[\s,:\-]*/i,
    ""
  );
  rest = rest.replace(/^\s*(?:bitte)\b[\s,:\-]*/i, "");
  rest = rest.replace(/^[\s,:\-.]+/, "").trim();

  return rest.length ? rest : undefined;
}

export function isExplicitContextSendConfirmation(transcript: string): boolean {
  if (!transcript) return false;
  const t = transcript.trim().toLowerCase();
  return (
    /^(?:ja[,\s]*)?(?:bitte\s+)?(?:jetzt\s+)?(?:senden|abschicken|rausschicken|schick(?:\s+(?:sie|die\s+mail|die\s+antwort))?\s+raus)\b/.test(t) ||
    /^(?:ja[,\s]*)?(?:die\s+)?antwort\s+(?:jetzt\s+)?(?:senden|abschicken|rausschicken)\b/.test(t)
  );
}

export function buildReplyIntentFromSelectedMailContext(
  transcript: string,
  selectedContext: SelectedMailContext | null | undefined
): EmailComposeIntent | null {
  if (!selectedContext?.uid || !selectedContext.fromEmail) return null;
  const normalized = normalizeCommandText(transcript);
  const addressedSender = hasAddressedSenderDirective(normalized, selectedContext);
  const directRequested = hasDirectReplyTrigger(normalized);
  const hasStrongReply =
    hasLeadingReplyCommand(normalized) ||
    hasContextWriteCommand(normalized) ||
    (hasReplyVerb(normalized) &&
      (hasMailTargetHint(normalized) || /\bwie\s+folgt\b/i.test(normalized) || directRequested));
  const hasShortcut = hasContextualReplyShortcut(normalized);
  if (!hasStrongReply && !hasShortcut && !addressedSender) return null;

  let bodyHint = normalizeBodyHint(extractReplyBodyHint(normalized, selectedContext));
  if (
    /^\s*(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?(?:antworte(?:n)?|beantworte(?:n)?|zurückschreib(?:en)?|reagier(?:e|en)?|informier(?:e|en)?)(?:\s+auf\s+(?:diese|die)\s+(?:mail|e-?mail|email|nachricht))?\s*[.!?]*\s*$/i.test(
      normalized
    )
  ) {
    bodyHint = undefined;
  }
  const rawBodyHint = bodyHint;
  if (bodyHint) {
    const stripped = stripCancelPhraseFromBody(bodyHint).trim();
    bodyHint = stripped.length > 0 ? stripped : bodyHint;
  }
  const cancelRequested = hasCancelPhrase({
    raw: transcript,
    normalized: normalizeForCancelDetection(transcript),
  });
  const hasBodyForSend = !!bodyHint;
  const autoSend = directRequested && hasBodyForSend && !cancelRequested;
  const forcePreviewOnly = !autoSend || cancelRequested;

  return {
    type: "email-compose",
    to: selectedContext.fromEmail,
    toRaw: selectedContext.fromName || selectedContext.fromEmail,
    subjectHint: normalizeReplySubject(selectedContext.subject),
    bodyHint,
    bodyHintRaw: rawBodyHint,
    meta: {
      source: directRequested
        ? "exchange-context-reply-direct"
        : "exchange-context-reply-phase-a",
      autoSend,
      forcePreviewOnly,
      ...(cancelRequested && {
        cancelled: true,
        disableSendPhraseDetection: true,
        forcePreviewOnlyReason: "cancel_phrase",
      }),
      uiHint: bodyHint
        ? autoSend
          ? "Direktantwort erkannt. Ich sende sofort, sobald der Entwurf vollständig ist."
          : undefined
        : "Mail-Kontext aktiv. Diktiere jetzt den Antworttext, ich erstelle den Entwurf.",
    },
  };
}

