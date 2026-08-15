import { describe, expect, it, beforeEach } from "vitest";
import {
  isColloquialNotifySendPhrase,
  isPoliteAssistantMailCommand,
  parseColloquialNotifyCommand,
} from "./colloquial_notify";
import { routeVoiceIntent } from "./intent_router";
import {
  buildImmediateReplyIntentFromOpenMail,
  buildReplyIntentFromSelectedMailContext,
  extractReplyBodyHint,
} from "./reply_context_phase_a";
import { getSendReviewMode, isImmediateSendMode, setSendReviewMode } from "./send_review_mode";

const mailContext = {
  uid: "123",
  messageId: "<abc@test>",
  subject: "Projektupdate Q4",
  fromEmail: "sarah@example.com",
  fromName: "Sarah",
  receivedAt: "2026-01-15T10:30:00.000Z",
};

describe("colloquial notify commands", () => {
  it("erkennt kannst du Thomas bitte wissen lassen", () => {
    const match = parseColloquialNotifyCommand(
      "Kannst du Thomas bitte wissen lassen dass ich morgen um 15:00 Uhr komme"
    );
    expect(match?.toName.toLowerCase()).toBe("thomas");
    expect(match?.bodyRaw.toLowerCase()).toContain("ich morgen um 15:00");
    expect(match?.autoSend).toBe(true);
  });

  it("erkennt kannst du Sarah schnell sagen", () => {
    const match = parseColloquialNotifyCommand(
      "Kannst du Sarah schnell sagen dass ich morgen um 19:00 Uhr komme und keine Pizza mitbringe"
    );
    expect(match?.toName.toLowerCase()).toBe("sarah");
    expect(match?.bodyRaw.toLowerCase()).toContain("keine pizza");
    expect(match?.autoSend).toBe(true);
  });

  it("erkennt He lass Sarah bitte wissen", () => {
    const result = routeVoiceIntent("He lass Sarah bitte wissen dass ich um 18:00 Uhr komme");
    expect(result.type).toBe("email-compose");
    if (result.type === "email-compose") {
      expect(result.toRaw?.toLowerCase()).toBe("sarah");
      expect(result.bodyHint?.toLowerCase()).toContain("komme");
      expect(result.meta?.autoSend).toBe(true);
    }
  });

  it("routet kannst du Marcel wissen lassen über den Intent-Router", () => {
    const result = routeVoiceIntent(
      "Kannst du Marcel wissen lassen dass ich morgen um 15 Uhr komme"
    );
    expect(result.type).toBe("email-compose");
    if (result.type === "email-compose") {
      expect(result.toRaw?.toLowerCase()).toBe("marcel");
      expect(result.meta?.autoSend).toBe(true);
      expect(result.meta?.source).toBe("colloquial-notify");
    }
  });

  it("greift nicht in Pizza-Diktat mit kannst du im Body", () => {
    const match = parseColloquialNotifyCommand(
      "Thomas Betreff Pizza Hi Thomas, kannst du morgen Pizza mitbringen?"
    );
    expect(match).toBeNull();
    expect(isColloquialNotifySendPhrase("Hi Thomas, kannst du morgen Pizza mitbringen?")).toBe(
      false
    );
  });

  it("blockiert kannst du mir das senden weiterhin als False-Positive", () => {
    expect(isPoliteAssistantMailCommand("kannst du mir das senden")).toBe(false);
  });

  it("erlaubt kannst du folgende Nachricht senden", () => {
    expect(
      isPoliteAssistantMailCommand("kannst du folgende Nachricht an Peter senden")
    ).toBe(true);
  });
});

describe("bestehende lass-wissen Regeln bleiben", () => {
  it("kein AutoSend ohne bitte und ohne Send-Phrase", () => {
    const result = routeVoiceIntent("Lass Thomas folgendes wissen: Hi Thomas, ich komme 10 Minuten später.");
    expect(result.type).toBe("email-compose");
    if (result.type === "email-compose") {
      expect(result.meta?.autoSend).toBe(false);
    }
  });
});

describe("reply context umgangssprache", () => {
  it("lass sie mal eben wissen sendet bei offener Mail", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "lass sie mal eben wissen dass ich um 18 Uhr komme",
      mailContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("sarah@example.com");
      expect(intent.bodyHint?.toLowerCase()).toContain("ich um 18");
      expect(intent.meta?.autoSend).toBe(true);
    }
  });

  it("sag ihr schnell sendet bei offener Mail", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "sag ihr schnell ich komme um 19 Uhr und bringe keine Pizza mit",
      mailContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.bodyHint?.toLowerCase()).toContain("keine pizza");
    }
  });

  it("antwortet direkt bleibt Direktantwort", () => {
    const intent = buildReplyIntentFromSelectedMailContext(
      "antwortet direkt ich bin morgen um 15 Uhr da",
      mailContext
    );
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.bodyHint?.toLowerCase()).toContain("morgen um 15");
    }
  });

  it("extrahiert Body ohne Kommando-Reste", () => {
    expect(extractReplyBodyHint("sag ihr schnell ich komme später").toLowerCase()).toContain(
      "ich komme später"
    );
  });
});

describe("Sofort-Modus bei offener Mail", () => {
  it("nimmt den gesprochenen Text als Antwort und sendet", () => {
    const intent = buildImmediateReplyIntentFromOpenMail("Ich komme morgen um 18 Uhr.", mailContext);
    expect(intent?.type).toBe("email-compose");
    if (intent?.type === "email-compose") {
      expect(intent.to).toBe("sarah@example.com");
      expect(intent.bodyHint?.toLowerCase()).toContain("komme morgen um 18");
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.forcePreviewOnly).toBe(false);
    }
  });

  it("sendet nicht bei nicht senden", () => {
    const intent = buildImmediateReplyIntentFromOpenMail(
      "Ich komme morgen, aber nicht senden",
      mailContext
    );
    expect(intent).toBeNull();
  });
});

describe("send review mode", () => {
  beforeEach(() => {
    setSendReviewMode("pruefen");
  });

  it("ist standardmäßig Prüfen", () => {
    expect(getSendReviewMode()).toBe("pruefen");
    expect(isImmediateSendMode()).toBe(false);
  });

  it("schaltet auf Sofort", () => {
    setSendReviewMode("sofort");
    expect(getSendReviewMode()).toBe("sofort");
    expect(isImmediateSendMode()).toBe(true);
  });
});
