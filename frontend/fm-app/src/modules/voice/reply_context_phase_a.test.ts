import { describe, expect, it } from "vitest";
import {
  buildReplyIntentFromSelectedMailContext,
  extractReplyBodyHint,
  isExplicitContextSendConfirmation,
} from "./reply_context_phase_a";

describe("reply_context_phase_a", () => {
  const baseContext = {
    uid: "123",
    messageId: "<abc@test>",
    subject: "Projektupdate Q4",
    fromEmail: "thomas@example.com",
    fromName: "Thomas",
    receivedAt: "2026-01-15T10:30:00.000Z",
  };

  it("builds email-compose intent from active selected mail context", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antworte auf diese Mail mit Hallo Thomas, danke fuer dein Update.",
      baseContext
    );

    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("thomas@example.com");
      expect(intent.subjectHint).toBe("AW: Projektupdate Q4");
      expect(intent.bodyHint).toBe("Hallo Thomas, danke fuer dein Update.");
      expect(intent.meta?.source).toBe("exchange-context-reply-phase-a");
      expect(intent.meta?.autoSend).toBe(false);
      expect(intent.meta?.forcePreviewOnly).toBe(true);
    }
  });

  it("keeps existing AW subject without duplicate prefix", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Beantworte diese E-Mail mit danke.",
      { ...baseContext, subject: "AW: Projektupdate Q4" }
    );

    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.subjectHint).toBe("AW: Projektupdate Q4");
    }
  });

  it("returns null without selected context", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antworte auf diese Mail mit danke.",
      null
    );
    expect(intent).toBeNull();
  });

  it("extracts empty body as undefined", () => {
    const body = extractReplyBodyHint("Antworte auf diese Mail");
    expect(body).toBeUndefined();
  });

  it("extracts body for 'antworte bitte direkt. ...' without context hint words", () => {
    const body = extractReplyBodyHint("Antworte bitte direkt. Bei mir ist die Lage sehr gut.");
    expect(body).toBe("Bei mir ist die Lage sehr gut.");
  });

  it("supports natural shortcut phrasing 'sag ihm bitte ...'", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Sag ihm bitte wir schicken die Unterlagen bis heute Abend.",
      baseContext
    );

    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBe("wir schicken die Unterlagen bis heute Abend.");
      expect(intent.to).toBe("thomas@example.com");
      expect(intent.meta?.forcePreviewOnly).toBe(true);
    }
  });

  it("supports natural shortcut phrasing 'schreib zurueck ...'", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Schreib zurueck dass wir morgen um 10 Uhr starten.",
      baseContext
    );

    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBe("wir morgen um 10 Uhr starten.");
      expect(intent.meta?.forcePreviewOnly).toBe(true);
    }
  });

  it("supports compact short command 'Antwort: ...' in active context", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antwort: Ich melde mich bis 15 Uhr.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBe("Ich melde mich bis 15 Uhr.");
      expect(intent.to).toBe("thomas@example.com");
    }
  });

  it("supports compact short command 'Zurück: ...' in active context", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Zurück: Danke, ich habe es gesehen.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBe("Danke, ich habe es gesehen.");
    }
  });

  it("supports compact command with lowercase and filler words", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "hm antwort: ich melde mich spaeter",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBe("ich melde mich spaeter");
      expect(intent.meta?.forcePreviewOnly).toBe(true);
    }
  });

  it("supports filler words at command start", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Äh bitte antworte auf diese Mail mit wir prüfen das heute.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBe("wir prüfen das heute.");
    }
  });

  it("sets direct autosend when explicit direct reply is requested", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antworte bitte direkt auf diese Mail mit wir geben heute final Bescheid.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.source).toBe("exchange-context-reply-direct");
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.forcePreviewOnly).toBe(false);
      expect(intent.bodyHint).toBe("wir geben heute final Bescheid.");
    }
  });

  it("sets direct autosend for 'antworte bitte direkt. ...' phrase", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antworte bitte direkt. Bei mir ist die Lage sehr gut.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.source).toBe("exchange-context-reply-direct");
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.bodyHint).toBe("Bei mir ist die Lage sehr gut.");
    }
  });

  it("supports sender-addressed command 'Dennis bitte folgendes ...'", () => {
    const dennisContext = { ...baseContext, fromName: "Dennis Schuster", fromEmail: "dennis@example.com" };
    const intent = buildReplyIntentFromSelectedMailContext(
      "Dennis bitte folgendes: Wir haben den Termin auf morgen verschoben.",
      dennisContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("dennis@example.com");
      expect(intent.bodyHint).toBe("Wir haben den Termin auf morgen verschoben.");
    }
  });

  it("supports sender-addressed direct command with send verb", () => {
    const dennisContext = { ...baseContext, fromName: "Dennis Schuster", fromEmail: "dennis@example.com" };
    const intent = buildReplyIntentFromSelectedMailContext(
      "Sende Dennis bitte direkt Wir starten um 14 Uhr.",
      dennisContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.forcePreviewOnly).toBe(false);
      expect(intent.bodyHint).toBe("Wir starten um 14 Uhr.");
    }
  });

  it("supports sender-addressed direct command with trailing 'zu'", () => {
    const dennisContext = { ...baseContext, fromName: "Dennis", fromEmail: "dennis@example.com" };
    const intent = buildReplyIntentFromSelectedMailContext(
      "Sende Dennis bitte direkt zu Wir melden uns gleich.",
      dennisContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.bodyHint).toBe("Wir melden uns gleich.");
    }
  });

  it("supports informal shortcut 'direkte Antwort ...' in active context", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Direkte Antwort: Bei mir ist alles gut.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.forcePreviewOnly).toBe(false);
      expect(intent.bodyHint).toBe("Bei mir ist alles gut.");
    }
  });

  it("supports informal shortcut 'lass ihn sofort wissen ...'", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Lass ihn sofort wissen, wir sind startklar.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.forcePreviewOnly).toBe(false);
      expect(intent.bodyHint).toBe("wir sind startklar.");
    }
  });

  it("supports informal shortcut 'gib ihm direkt durch ...'", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Gib ihm direkt durch, wir melden uns in 10 Minuten.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.bodyHint).toBe("wir melden uns in 10 Minuten.");
    }
  });

  it("supports informal shortcut 'sag ihm direkt Bescheid ...'", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Sag ihm direkt Bescheid, der Termin steht.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.bodyHint).toBe("der Termin steht.");
    }
  });

  it("keeps preview mode when direct reply requested without body", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Bitte direkt antworten auf diese Mail",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(false);
      expect(intent.meta?.forcePreviewOnly).toBe(true);
      expect(intent.bodyHint).toBeUndefined();
    }
  });

  it("does not match non-reply text even with selected context", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Öffne bitte den Lead Radar.",
      baseContext
    );
    expect(intent).toBeNull();
  });

  it("does not create direct autosend for plain 'senden' phrase", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Senden bitte jetzt",
      baseContext
    );
    expect(intent).toBeNull();
  });

  it("falls back to preview for sender-addressed phrase without message", () => {
    const dennisContext = { ...baseContext, fromName: "Dennis", fromEmail: "dennis@example.com" };
    const intent = buildReplyIntentFromSelectedMailContext(
      "Dennis bitte folgendes",
      dennisContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBeUndefined();
      expect(intent.meta?.autoSend).toBe(false);
      expect(intent.meta?.forcePreviewOnly).toBe(true);
    }
  });

  it("detects explicit context send confirmation phrases", () => {
    expect(isExplicitContextSendConfirmation("Ja, jetzt senden")).toBe(true);
    expect(isExplicitContextSendConfirmation("schick die antwort raus")).toBe(true);
    expect(isExplicitContextSendConfirmation("bitte abschicken")).toBe(true);
    expect(isExplicitContextSendConfirmation("antworte auf diese mail mit danke")).toBe(false);
  });
});

