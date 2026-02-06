import { describe, it, expect } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router: whatsapp-style (Name: body / Name body Send-Phrase)", () => {
  it("A) Thomas: Bin im Termin. Schick's raus. -> toName Thomas, bodyHint 'Bin im Termin', autoSend true", () => {
    const r = routeVoiceIntent("Thomas: Bin im Termin. Schick's raus.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toBe("thomas");
    const body = (intent.bodyHint ?? "").toLowerCase();
    expect(body).toContain("bin im termin");
    expect(intent.meta?.autoSend).toBe(true);
  });

  it("B) Thomas: 10 Minuten später. Jetzt senden. -> bodyHint '10 Minuten später', autoSend true", () => {
    const r = routeVoiceIntent("Thomas: 10 Minuten später. Jetzt senden.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toBe("thomas");
    const body = intent.bodyHint ?? "";
    expect(body).toContain("10 minuten spater");
    expect(intent.meta?.autoSend).toBe(true);
  });

  it("C) Thomas: Ruf mich zurück. Ab dafür. -> subject default, autoSend true", () => {
    const r = routeVoiceIntent("Thomas: Ruf mich zurück. Ab dafür.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toBe("thomas");
    expect((intent.bodyHint ?? "").toLowerCase()).toContain("ruf mich zuruck");
    expect(intent.meta?.autoSend).toBe(true);
  });

  it("D) Thomas bin im Termin (no colon, no send phrase) -> preview-smart match (previewOnly, kein AI-Fallback)", () => {
    const r = routeVoiceIntent("Thomas bin im Termin");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    expect(r.type).toBe("email-compose");
    expect((intent as { meta?: { source?: string } })?.meta?.source).toBe("whatsapp-style-preview-smart");
    expect((intent as { meta?: { autoSend?: boolean } })?.meta?.autoSend).toBe(false);
  });

  it("E) Thomas Betreff Pizza Hi Thomas, kannst du morgen Pizza mitbringen? Schick raus. -> subject Pizza, body mit Hi Thomas...", () => {
    const r = routeVoiceIntent("Thomas Betreff Pizza Hi Thomas, kannst du morgen Pizza mitbringen? Schick raus.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect(intent.meta?.autoSend).toBe(true);
    expect(intent.subjectHint).toBe("Pizza");
    const body = (intent.bodyHint ?? "").toLowerCase();
    expect(body).toContain("hi thomas");
    expect(body).toContain("kannst du morgen pizza mitbringen");
  });

  it("F) Thomas Betreff Rückruf Hi Thomas, ruf mich kurz zurück. Schick raus. -> subject Rückruf (Umlaut aus Raw), body mit Hi Thomas...", () => {
    const r = routeVoiceIntent("Thomas Betreff Rückruf Hi Thomas, ruf mich kurz zurück. Schick raus.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect(intent.subjectHint).toBe("Rückruf");
    const body = (intent.bodyHint ?? "").toLowerCase();
    expect(body).toContain("hi thomas");
    expect(body).toContain("ruf mich zuruck");
  });

  it("G) Thomas Betreff Pizza Hey Thomas, kannst du morgen Pizza mitbringen? Schick raus. -> subject Pizza, body mit Hey Thomas", () => {
    const r = routeVoiceIntent("Thomas Betreff Pizza Hey Thomas, kannst du morgen Pizza mitbringen? Schick raus.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect(intent.subjectHint).toBe("Pizza");
    const body = intent.bodyHint ?? intent.bodyHintRaw ?? "";
    expect(body).toMatch(/hey\s+thomas/i);
    expect(intent.subjectHint).not.toContain("Hey Thomas");
  });

  it("H) Thomas Betreff Pizza Moin Thomas, kannst du morgen Pizza mitbringen? Schick raus. -> subject Pizza, body mit Moin Thomas", () => {
    const r = routeVoiceIntent("Thomas Betreff Pizza Moin Thomas, kannst du morgen Pizza mitbringen? Schick raus.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect(intent.subjectHint).toBe("Pizza");
    const body = intent.bodyHint ?? intent.bodyHintRaw ?? "";
    expect(body).toMatch(/moin\s+thomas/i);
    expect(intent.subjectHint).not.toContain("Moin Thomas");
  });

  it("I) Thomas Betreff Pizza Grüß dich Thomas, kannst du morgen Pizza mitbringen? Schick raus. -> subject Pizza, body mit Grüß dich", () => {
    const r = routeVoiceIntent("Thomas Betreff Pizza Grüß dich Thomas, kannst du morgen Pizza mitbringen? Schick raus.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect(intent.subjectHint).toBe("Pizza");
    const body = (intent.bodyHint ?? intent.bodyHintRaw ?? "").toLowerCase();
    expect(body).toContain("dich");
    expect(intent.subjectHint).not.toContain("Grüß");
    expect(intent.subjectHint).not.toContain("dich");
  });
});
