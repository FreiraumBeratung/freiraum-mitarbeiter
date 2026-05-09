import { describe, it, expect } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router: nachricht an <name> (optional betreff)", () => {
  it("trennt Empfängernamen robust vor 'betreff' in freier Diktion", () => {
    const r = routeVoiceIntent(
      "Sendefolge Nachricht an Peter, betreff Baustelle. Hi Peter, ich komme morgen um 15 Uhr."
    );
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toBe("peter");
    expect((intent.subjectHint ?? "").toLowerCase()).toContain("baustelle");
  });

  it("matches nachricht an <name> with betreff and avoids ai fallback", () => {
    const r = routeVoiceIntent("Nachricht an Thomas, Betreff Rückruf Hi Thomas, hier ist Dennis.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toContain("thomas");

    const subj = intent.subjectHint;
    expect(subj).toBe("Rückruf");

    const body = intent.bodyHint ?? "";
    expect(body.length).toBeGreaterThan(0);
  });

  it("keeps default subject when betreff is missing", () => {
    const r = routeVoiceIntent("Nachricht an Thomas Hi Thomas, kurze Info ich bin im Termin.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toContain("thomas");
    expect(intent.bodyHint?.length).toBeGreaterThan(0);
  });

  it("strips 'nur anzeigen' from body: Mail an Thomas nur anzeigen ich melde mich später.", () => {
    const r = routeVoiceIntent("Mail an Thomas nur anzeigen ich melde mich später.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toContain("thomas");
    expect(intent.meta?.autoSend).toBe(false);
    const body = (intent.bodyHint ?? "").toLowerCase();
    expect(body).toMatch(/ich melde mich\s+sp[aäe]ter/);
    expect(body).not.toContain("nur anzeigen");
  });

  it("strips 'bloß anzeigen' from body: Mail an Thomas bloß anzeigen. Ich bin im Termin.", () => {
    const r = routeVoiceIntent("Mail an Thomas bloß anzeigen. Ich bin im Termin.");
    const intent = r.type === "email-compose" ? r : null;
    expect(intent).toBeTruthy();
    if (!intent) return;
    expect(intent.type).toBe("email-compose");
    expect((intent.toRaw ?? "").toLowerCase()).toContain("thomas");
    expect(intent.meta?.autoSend).toBe(false);
    const body = (intent.bodyHint ?? "").toLowerCase();
    expect(body).toMatch(/ich bin im termin/);
    expect(body).not.toContain("bloß anzeigen");
    expect(body).not.toContain("bloss anzeigen");
  });
});
