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

  it("D) Thomas Bitte als Entwurf. Ich komme gleich. => preview-smart, body ohne „Als Entwurf“", () => {
    const r = routeVoiceIntent("Thomas Bitte als Entwurf. Ich komme gleich.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").trim()).toBe("Thomas");
    expect(intent.meta?.autoSend).toBe(false);
    expect(intent.meta?.source).toBe("whatsapp-style-preview-smart");
    const body = (intent.bodyHint ?? "").toLowerCase();
    expect(body).toContain("ich komme gleich");
    expect(body).not.toContain("als entwurf");
    expect(body).not.toContain("bitte als entwurf");
  });

  it("E) Nur vorbereiten für Thomas. Ich melde mich später. => draft-prepare (toRaw Thomas, body „Ich melde mich später.“)", () => {
    const r = routeVoiceIntent("Nur vorbereiten für Thomas. Ich melde mich später.");
    expect(r.type).toBe("email-compose");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect((intent.toRaw ?? "").trim()).toBe("Thomas");
    expect(intent.meta?.source).toBe("draft-prepare");
    expect(intent.meta?.autoSend).toBe(false);
    expect((intent.bodyHint ?? "").toLowerCase()).toContain("ich melde mich");
    expect((intent.bodyHint ?? "").toLowerCase()).toMatch(/sp[aäe]ter/);
    expect((intent.bodyHint ?? "").toLowerCase()).not.toContain("vorbereiten für thomas");
  });

  it("F) Mail an Thomas nur anzeigen. Ich schreibe später. => preview-only, body ohne „Nur anzeigen“", () => {
    const r = routeVoiceIntent("Mail an Thomas nur anzeigen. Ich schreibe später.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toContain("thomas");
    expect(intent.meta?.autoSend).toBe(false);
    const body = (intent.bodyHint ?? "").toLowerCase();
    expect(body).toMatch(/ich schreibe\s+sp[aäe]ter/);
    expect(body).not.toContain("nur anzeigen");
  });
});
