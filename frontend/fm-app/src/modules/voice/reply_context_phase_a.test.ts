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

  it("extracts body for ASR 'Antwort ist sofort, …' ohne 'Ist sofort'-Rest", () => {
    const body = extractReplyBodyHint("Antwort ist sofort, guten Morgen.");
    expect(body).toBe("guten Morgen.");
  });

  it("sendNow bei aktivem Kontext wenn 'Antwort ist sofort' mit Body", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antwort ist sofort, guten Morgen.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBe("guten Morgen.");
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.forcePreviewOnly).toBe(false);
    }
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

  it("supports context write command 'Schreibe bitte ...' and keeps dictated body", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Schreibe bitte sei selber ruhig.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("thomas@example.com");
      expect(intent.subjectHint).toBe("AW: Projektupdate Q4");
      expect(intent.bodyHint).toBe("sei selber ruhig.");
      expect(intent.meta?.forcePreviewOnly).toBe(true);
    }
  });

  it("supports colloquial context write 'Erstelle auf diese Mail einen Entwurf ...'", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Erstelle auf diese Mail einen Entwurf Hallo Thomas, passt fuer mich.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("thomas@example.com");
      expect(intent.subjectHint).toBe("AW: Projektupdate Q4");
      expect(intent.bodyHint).toBe("Hallo Thomas, passt fuer mich.");
      expect(intent.meta?.forcePreviewOnly).toBe(true);
    }
  });

  it("supports colloquial context write 'Mach eine Antwort ...'", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Mach eine Antwort Hallo, wir liefern morgen.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.bodyHint).toBe("Hallo, wir liefern morgen.");
      expect(intent.meta?.forcePreviewOnly).toBe(true);
    }
  });

  it("supports context write command with recipient phrase and keeps only message body", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Schreibe folgende Mail an Bruder. Hallo Bruder.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("thomas@example.com");
      expect(intent.subjectHint).toBe("AW: Projektupdate Q4");
      expect(intent.bodyHint).toBe("Hallo Bruder.");
    }
  });

  it("strips duplicated reply command in context and keeps only dictated body", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antworte, antworte bitte auf diese Mail. Hallo.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("thomas@example.com");
      expect(intent.subjectHint).toBe("AW: Projektupdate Q4");
      expect(intent.bodyHint).toBe("Hallo.");
      expect(intent.meta?.autoSend).toBe(false);
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

  it("sendet bei 'antworte direkt es läuft sehr gut' mit offener Mail", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "antworte direkt es läuft sehr gut",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.source).toBe("exchange-context-reply-direct");
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.forcePreviewOnly).toBe(false);
      expect(intent.to).toBe("thomas@example.com");
      expect(intent.bodyHint?.toLowerCase()).toContain("läuft sehr gut");
      expect(intent.bodyHint?.toLowerCase()).not.toContain("antworte");
      expect(intent.bodyHint?.toLowerCase()).not.toContain("direkt");
    }
  });

  it("bleibt in der Vorschau wenn 'direkt' fehlt (Prüfen-Pfad)", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "antworte es läuft sehr gut",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(false);
      expect(intent.meta?.forcePreviewOnly).toBe(true);
      expect(intent.bodyHint?.toLowerCase()).toContain("läuft sehr gut");
    }
  });

  it("handles ASR variant 'Antwortet direkt. ...' without body leak", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antwortet direkt. Ich komme übermorgen.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.source).toBe("exchange-context-reply-direct");
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.forcePreviewOnly).toBe(false);
      expect(intent.bodyHint).toBe("Ich komme übermorgen.");
    }
  });

  it("keeps preview for 'Antworte bitte ...' without direkt/sofort", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antworte bitte, mir geht es gut.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.source).toBe("exchange-context-reply-phase-a");
      expect(intent.meta?.autoSend).toBe(false);
      expect(intent.meta?.forcePreviewOnly).toBe(true);
      expect(intent.bodyHint).toBe("mir geht es gut.");
    }
  });

  it("forces preview-only for context direct reply when cancel phrase is present", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Antworte bitte direkt, wir melden uns morgen lieber doch nicht.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(false);
      expect(intent.meta?.forcePreviewOnly).toBe(true);
      expect(intent.meta?.cancelled).toBe(true);
      expect(intent.meta?.disableSendPhraseDetection).toBe(true);
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

  it("supports pronoun shortcut 'Sag ihm ...' and keeps only dictated body", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "Sag ihm Hallo Thomas, ich habe es gesehen.",
      baseContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("thomas@example.com");
      expect(intent.bodyHint).toBe("Hallo Thomas, ich habe es gesehen.");
      expect(intent.meta?.autoSend).toBe(false);
      expect(intent.meta?.forcePreviewOnly).toBe(true);
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
      expect(intent.meta?.forcePreviewOnlyReason).toBe("missing_body");
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

