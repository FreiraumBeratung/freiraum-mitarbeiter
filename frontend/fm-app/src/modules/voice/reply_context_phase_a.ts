import type { SelectedMailContext } from "../mail/selectedMailContext";
import type { VoiceIntent } from "./intent_router";
import { hasCancelPhrase, stripCancelPhraseFromBody } from "../../logic/wizard4/cancel_phrase";
import { isImmediateSendMode } from "./send_review_mode";
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
  return /\b(antwort(?:e|en|et)?|beantwort(?:e|en|et)|zurückschreib(?:en)?|reagier(?:e|en)?|informier(?:e|en)?)\b/i.test(text);
}

function hasLeadingReplyCommand(text: string): boolean {
  return /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+|bitte\s+)*(?:antwort(?:e|en|et)?\b|beantwort(?:e|en|et)\b|zurückschreib(?:en)?\b|reagier(?:e|en)?\b|informier(?:e|en)?\b|schreib\s+zur(?:ue|[üu])ck|antwort(?:e|en)?\s*:|zur(?:ue|[üu])ck\s*:|direkt(?:e)?\s+antwort(?:\s*:)?|kurze?\s+antwort(?:\s*:)?)/i.test(
    text
  );
}

function hasContextWriteCommand(text: string): boolean {
  return /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*(?:bitte\s+)?(?:schreib(?:e)?(?!\s+zur(?:ue|[üu])ck)|verfass(?:e)?|formulier(?:e)?|erstell(?:e)?|erstelle|mach(?:e)?)\b/i.test(
    text
  );
}

function hasContextualReplyShortcut(text: string): boolean {
  return (
    /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*(?:bitte\s+)?(?:sag\s+(?:ihm|ihr|denen)(?:\s+bitte)?|schreib\s+zur(?:ue|[üu])ck|antwort(?:e|en)?\s+wie\s+folgt|antwort(?:e|en)?\s*:|zur(?:ue|[üu])ck\s*:|(?:mach(?:e)?|erstell(?:e)?|erstelle)\s+(?:eine|nen|einen)?\s*antwort|(?:mach(?:e)?|erstell(?:e)?|erstelle)\s+(?:auf|zu)\s+(?:diese|die)\s+(?:mail|e-?mail|email|nachricht)\s+(?:einen\s+)?entwurf)/i.test(
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

function hasCasualReplyShortcut(text: string): boolean {
  return (
    /^\s*(?:(?:äh+|hm+|he+|hey|hallo|also|ja)\s+)*(?:mal\s+|kurz\s+|bitte\s+)*(?:sag\s+(?:ihm|ihr|denen)\s+(?:bitte\s+|schnell\s+|mal\s+eben\s+|mal\s+|kurz\s+|direkt\s+|sofort\s+)?)/i.test(
      text
    ) ||
    /^\s*(?:(?:äh+|hm+|he+|hey|hallo|also|ja)\s+)*(?:mal\s+|kurz\s+|bitte\s+)*(?:la(?:ss|s)\s+(?:ihn|sie|ihm|ihr|denen)\s+(?:bitte\s+|schnell\s+|mal\s+eben\s+|mal\s+|kurz\s+|direkt\s+|sofort\s+)?wissen)/i.test(
      text
    ) ||
    /^\s*(?:(?:äh+|hm+|he+|hey|hallo|also|ja)\s+)*(?:mal\s+|kurz\s+|bitte\s+)*(?:(?:kannst|könntest|kann)\s+du\s+(?:ihm|ihr|denen)\s+(?:bitte\s+|schnell\s+|mal\s+eben\s+|mal\s+|kurz\s+|direkt\s+|sofort\s+)?(?:sagen|wissen\s+lassen))/i.test(
      text
    )
  );
}

function hasCasualDirectReplyTrigger(text: string): boolean {
  return (
    /^\s*(?:(?:äh+|hm+|he+|hey|hallo|also|ja)\s+)*(?:mal\s+|kurz\s+|bitte\s+)*(?:sag\s+(?:ihm|ihr|denen)\s+(?:bitte\s+)?(?:schnell|mal\s+eben|direkt|sofort)\b)/i.test(
      text
    ) ||
    /^\s*(?:(?:äh+|hm+|he+|hey|hallo|also|ja)\s+)*(?:mal\s+|kurz\s+|bitte\s+)*(?:la(?:ss|s)\s+(?:ihn|sie|ihm|ihr|denen)\s+(?:bitte\s+)?(?:schnell|mal\s+eben|direkt|sofort)\s+wissen)/i.test(
      text
    ) ||
    /^\s*(?:(?:äh+|hm+|he+|hey|hallo|also|ja)\s+)*(?:mal\s+|kurz\s+|bitte\s+)*(?:la(?:ss|s)\s+(?:ihn|sie|ihm|ihr|denen)\s+mal\s+eben\s+wissen)/i.test(
      text
    ) ||
    /^\s*(?:(?:äh+|hm+|he+|hey|hallo|also|ja)\s+)*(?:mal\s+|kurz\s+|bitte\s+)*(?:(?:kannst|könntest|kann)\s+du\s+(?:ihm|ihr|denen)\s+(?:bitte\s+)?(?:schnell|mal\s+eben|direkt|sofort)\s+(?:sagen|wissen\s+lassen))/i.test(
      text
    )
  );
}

function hasContextPronounDirective(text: string): boolean {
  return /^\s*(?:äh+\s+|hm+\s+|mal\s+|kurz\s+)*(?:bitte\s+)?(?:sag|gib|lass)\s+(?:ihm|ihr|denen)\b/i.test(text);
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
    /\b(?:antwort(?:e|en|et)?|beantwort(?:e|en|et)|zurückschreib(?:en)?|schreib\s+zur(?:ue|[üu])ck)\b[\s\S]*\b(?:direkt|sofort)\b/i.test(text) ||
    /\b(?:direkt|sofort)\s+(?:antwort(?:e|en|et)?|beantwort(?:e|en|et)|zurückschreib(?:en)?|zurück)\b/i.test(text) ||
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
  rest = rest.replace(/^\s*(?:(?:he+|hey|hallo|also|ja)\s+)+/i, "");
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:(?:kannst|könntest|kann)\s+du\s+(?:ihm|ihr|denen)\s+(?:bitte\s+|schnell\s+|mal\s+eben\s+|mal\s+|kurz\s+|direkt\s+|sofort\s+)*(?:sagen|wissen\s+lassen))(?:\s+(?:dass|daß))?\s*[:.,]?\s*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:sag\s+(?:ihm|ihr|denen)\s+(?:bitte\s+)?(?:schnell|mal\s+eben|mal|kurz)\b)(?:\s+bescheid)?(?:\s+(?:dass|daß))?\s*[:.,]?\s*/i,
    ""
  );
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:la(?:ss|s)\s+(?:ihn|sie|ihm|ihr|denen)\s+(?:bitte\s+|schnell\s+|mal\s+eben\s+|mal\s+|kurz\s+)+wissen(?:\s+lassen)?)(?:\s+(?:dass|daß))?\s*[:.,]?\s*/i,
    ""
  );

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
    /^\s*(?:bitte\s+)?(?:schreib(?:e)?(?!\s+zur(?:ue|[üu])ck)|verfass(?:e)?|formulier(?:e)?|erstell(?:e)?|erstelle|mach(?:e)?)\s+(?:bitte\s+)?(?:(?:eine|nen|einen)?\s*antwort\s*(?:auf\s+(?:diese|die)\s+(?:mail|e-?mail|email|nachricht))?|(?:(?:folgend(?:e|es)\s+)?(?:mail|e-?mail|email|nachricht)(?:\s+an\s+[^,.:;!?]+)?\s*)|(?:auf\s+(?:diese|die)\s+(?:mail|e-?mail|email|nachricht)\s+(?:einen\s+)?entwurf\s*))?(?:folgendes?|wie\s+folgt)?\s*[:.,\-]?\s*/i,
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
  rest = rest.replace(
    /^\s*(?:bitte\s+)?(?:sag|gib|lass)\s+(?:ihm|ihr|denen)(?:\s+bitte)?\s*(?:folgendes?|wie\s+folgt)?\s*[:.,\-]?\s*/i,
    ""
  );
  rest = rest.replace(/^\s*(?:direkt|sofort)\s+bescheid\b[\s,:\-]*/i, "");
  const stripLeadingReplyCommands = (value: string): string => {
    let out = value;
    out = out.replace(
      /^\s*(?:bitte\s+)?(?:antwort(?:e|en|et)?\b|beantwort(?:e|en|et)\b|zurückschreib(?:en)?\b|reagier(?:e|en)?\b)(?:\s+bitte)?\s+(?:direkt|sofort)[\s,.:;!?-]*/i,
      ""
    );
    // ASR: „Antwort ist sofort …“ (Wort „ist“ zwischen Trigger und Adverb)
    out = out.replace(
      /^\s*(?:bitte\s+)?(?:antwort(?:e|en|et)?\b|beantwort(?:e|en|et)\b|zurückschreib(?:en)?\b|reagier(?:e|en)?\b)\s+ist\s+(?:direkt|sofort|jetzt)[\s,.:;!?-]*/i,
      ""
    );
    out = out.replace(
      /^\s*(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?(?:antwort(?:e|en|et)?\b|beantwort(?:e|en|et)\b|zurückschreib(?:en)?\b|reagier(?:e|en)?\b)(?:\s*[,:-]\s*)?\s*/i,
      ""
    );
    return out;
  };
  // Versprecher/ASR-Dopplungen wie "Antworte, antworte bitte ..." robust entfernen.
  rest = stripLeadingReplyCommands(rest);
  rest = stripLeadingReplyCommands(rest);
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
  // Nach erneutem Strip kann "auf diese Mail ..." vorne stehen (z.B. bei Doppelkommando).
  rest = rest.replace(
    /^\s*(?:auf\s+(?:diese|die|die\s+ausgewählte|die\s+markierte)\s+(?:mail|e-?mail|email|nachricht)|darauf|hierauf)\s*/i,
    ""
  );
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
  const directRequested = hasDirectReplyTrigger(normalized) || hasCasualDirectReplyTrigger(normalized);
  const hasStrongReply =
    hasLeadingReplyCommand(normalized) ||
    hasContextWriteCommand(normalized) ||
    hasContextPronounDirective(normalized) ||
    (hasReplyVerb(normalized) &&
      (hasMailTargetHint(normalized) || /\bwie\s+folgt\b/i.test(normalized) || directRequested));
  const hasShortcut = hasContextualReplyShortcut(normalized) || hasCasualReplyShortcut(normalized);
  if (!hasStrongReply && !hasShortcut && !addressedSender) return null;

  let bodyHint = normalizeBodyHint(extractReplyBodyHint(normalized, selectedContext));
  if (
    /^\s*(?:bitte\s+)?(?:(?:direkt|sofort)\s+)?(?:antwort(?:e|en|et)\b|beantwort(?:e|en|et)\b|zurückschreib(?:en)?\b|reagier(?:e|en)?\b|informier(?:e|en)?\b)(?:\s+auf\s+(?:diese|die)\s+(?:mail|e-?mail|email|nachricht))?\s*[.!?]*\s*$/i.test(
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
  const toggleSend = isImmediateSendMode() && hasBodyForSend && !cancelRequested;
  const autoSend = (directRequested || toggleSend) && hasBodyForSend && !cancelRequested;
  const forcePreviewOnly = !autoSend || cancelRequested;
  const forcePreviewOnlyReason = cancelRequested
    ? "cancel_phrase"
    : !hasBodyForSend
      ? "missing_body"
      : undefined;

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
      ...(forcePreviewOnlyReason && { forcePreviewOnlyReason }),
      ...(cancelRequested && {
        cancelled: true,
        disableSendPhraseDetection: true,
      }),
      uiHint: bodyHint
        ? autoSend
          ? toggleSend
            ? "Sofort-Modus: Antwort wird direkt gesendet."
            : "Direktantwort erkannt. Ich sende sofort, sobald der Entwurf vollständig ist."
          : undefined
        : "Diktiere jetzt den Antworttext, ich erstelle den Entwurf.",
    },
  };
}

export function buildImmediateReplyIntentFromOpenMail(
  transcript: string,
  selectedContext: SelectedMailContext | null | undefined,
  existingReply?: EmailComposeIntent | null
): EmailComposeIntent | null {
  if (!selectedContext?.uid || !selectedContext.fromEmail) return null;
  const cancelRequested = hasCancelPhrase({
    raw: transcript,
    normalized: normalizeForCancelDetection(transcript),
  });
  if (cancelRequested) return null;

  if (isExplicitContextSendConfirmation(transcript)) return null;

  let bodyHint = normalizeBodyHint(existingReply?.bodyHint);
  if (!bodyHint) {
    bodyHint = normalizeBodyHint(extractReplyBodyHint(transcript, selectedContext));
  }
  if (!bodyHint) {
    bodyHint = normalizeBodyHint(normalizeCommandText(transcript));
  }
  if (!bodyHint || bodyHint.length < 2) return null;

  return {
    type: "email-compose",
    to: selectedContext.fromEmail,
    toRaw: selectedContext.fromName || selectedContext.fromEmail,
    subjectHint: normalizeReplySubject(selectedContext.subject),
    bodyHint,
    bodyHintRaw: bodyHint,
    meta: {
      source: "immediate-open-mail",
      autoSend: true,
      forcePreviewOnly: false,
      uiHint: "Sofort-Modus: Antwort wird direkt gesendet.",
    },
  };
}


