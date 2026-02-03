import { describe, it, expect } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router: nachricht an <name> (optional betreff)", () => {
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
});
