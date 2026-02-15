import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router email-body-replace-all", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_set_mail_body = vi.fn();
  });

  afterEach(() => {
    if ((globalThis as any).window) {
      delete (globalThis as any).window.__fm_set_mail_body;
      delete (globalThis as any).window.__fm_get_mail_body;
    }
  });

  it("matched 'Ersetze die Email durch folgende Nachricht. ...'", () => {
    const intent = routeVoiceIntent("Ersetze die Email durch folgende Nachricht. Hallo Thomas, ich melde mich später.");
    expect(intent.type).toBe("email-body-replace-all");
    if (intent.type === "email-body-replace-all") {
      expect(intent.payload.text).toBe("Hallo Thomas, ich melde mich später.");
      expect(intent.payload.bodyRaw).toBe("Hallo Thomas, ich melde mich später.");
    }
  });

  it("matched STT variant 'Er setzte den kompletten Text durch. ...'", () => {
    const intent = routeVoiceIntent("Er setzte den kompletten Text durch. Ich rufe dich morgen an.");
    expect(intent.type).toBe("email-body-replace-all");
    if (intent.type === "email-body-replace-all") {
      expect(intent.payload.text).toBe("Ich rufe dich morgen an.");
    }
  });

  it("matched 'Neue Nachricht stattdessen ...'", () => {
    const intent = routeVoiceIntent("Neue Nachricht stattdessen Hallo Thomas, bitte schick mir die Unterlagen.");
    expect(intent.type).toBe("email-body-replace-all");
    if (intent.type === "email-body-replace-all") {
      expect(intent.payload.text).toBe("Hallo Thomas, bitte schick mir die Unterlagen.");
      expect(intent.type).not.toBe("email-compose");
    }
  });

  it("matched 'Lösch die aktuelle Mail und schreibe stattdessen ...'", () => {
    const intent = routeVoiceIntent("Lösch die aktuelle Mail und schreibe stattdessen. Hi Thomas, melde mich später.");
    expect(intent.type).toBe("email-body-replace-all");
    if (intent.type === "email-body-replace-all") {
      expect(intent.payload.text).toBe("Hi Thomas, melde mich später.");
    }
  });

  it("matched 'Schreib stattdessen: Danke dir.'", () => {
    const intent = routeVoiceIntent("Schreib stattdessen: Danke dir.");
    expect(intent.type).toBe("email-body-replace-all");
    if (intent.type === "email-body-replace-all") {
      expect(intent.payload.text).toBe("Danke dir.");
    }
  });

  it("does not trigger replace-all when composer context is missing", () => {
    delete (globalThis as any).window.__fm_set_mail_body;
    delete (globalThis as any).window.__fm_get_mail_body;
    const intent = routeVoiceIntent("Ersetze die Email durch folgende. Hallo Thomas, ich melde mich später.");
    expect(intent.type).not.toBe("email-body-replace-all");
  });
});

