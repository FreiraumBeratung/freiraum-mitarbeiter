import { describe, it, expect } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router: whatsapp-style-preview (<name>, ...)", () => {
  it("A) Thomas, bin im Termin. => whatsapp-style-preview match, toRaw Thomas, autoSend false, body enthält bin im termin", () => {
    const r = routeVoiceIntent("Thomas, bin im Termin.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").trim()).toBe("Thomas");
    expect(intent.meta?.source).toBe("whatsapp-style-preview-smart");
    expect(intent.meta?.autoSend).toBe(false);
    expect((intent.bodyHint ?? "").toLowerCase()).toContain("bin im termin");
  });

  it("B) Thomas, Betreff Pizza Hi Thomas, kannst du morgen Pizza mitbringen? => preview, subject Pizza, autoSend false, body enthält hi thomas", () => {
    const r = routeVoiceIntent("Thomas, Betreff Pizza Hi Thomas, kannst du morgen Pizza mitbringen?");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect(intent.meta?.source).toBe("whatsapp-style-preview-smart");
    expect(intent.meta?.autoSend).toBe(false);
    expect(intent.subjectHint).toBe("Pizza");
    expect((intent.bodyHint ?? "").toLowerCase()).toContain("hi thomas");
    expect((intent.bodyHint ?? "").toLowerCase()).toContain("kannst du morgen pizza mitbringen");
  });

  it("C) Thomas bin im Termin. (ohne Komma) => whatsapp-style-preview-smart match (previewOnly, kein AI-Fallback)", () => {
    const r = routeVoiceIntent("Thomas bin im Termin.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.meta?.source).toBe("whatsapp-style-preview-smart");
    expect(intent.meta?.autoSend).toBe(false);
    expect((intent.toRaw ?? "").trim()).toBe("Thomas");
    expect((intent.bodyHint ?? "").toLowerCase()).toContain("bin im termin");
  });
});
