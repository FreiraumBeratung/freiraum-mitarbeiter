import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router sentence-replace synonyms", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => "A. B. C.");
    (globalThis as any).window.__fm_set_mail_body = vi.fn();
  });

  afterEach(() => {
    if ((globalThis as any).window) {
      delete (globalThis as any).window.__fm_get_mail_body;
      delete (globalThis as any).window.__fm_set_mail_body;
    }
  });

  it("Mach aus Satz 2 ... -> sentence-replace-n", () => {
    const intent = routeVoiceIntent("Mach aus Satz 2 Ich rufe dich morgen an");
    expect(intent.type).toBe("sentence-replace-n");
    if (intent.type === "sentence-replace-n") {
      expect(intent.payload.n).toBe(2);
      expect(intent.payload.text.length).toBeGreaterThan(0);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Mach aus Satz 2. ... -> sentence-replace-n", () => {
    const intent = routeVoiceIntent("Mach aus Satz 2. Ich rufe dich morgen an");
    expect(intent.type).toBe("sentence-replace-n");
    if (intent.type === "sentence-replace-n") {
      expect(intent.payload.n).toBe(2);
      expect(intent.payload.text.length).toBeGreaterThan(0);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Mach aus Satz 2 folgendes ... -> sentence-replace-n", () => {
    const intent = routeVoiceIntent("Mach aus Satz 2 folgendes Ich rufe dich morgen an");
    expect(intent.type).toBe("sentence-replace-n");
    if (intent.type === "sentence-replace-n") {
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Mach aus Satz 2. -> no-op, kein AI-Fallback", () => {
    const intent = routeVoiceIntent("Mach aus Satz 2.");
    expect(intent.type).toBe("unknown");
    expect(intent.type).not.toBe("email-compose");
  });

  it("Ändere Satz 2 zu Ich rufe dich morgen an -> sentence-replace-n", () => {
    const intent = routeVoiceIntent("Ändere Satz 2 zu Ich rufe dich morgen an");
    expect(intent.type).toBe("sentence-replace-n");
    if (intent.type === "sentence-replace-n") {
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Ändere Satz 2 zu. Ich rufe dich morgen an -> sentence-replace-n", () => {
    const intent = routeVoiceIntent("Ändere Satz 2 zu. Ich rufe dich morgen an");
    expect(intent.type).toBe("sentence-replace-n");
    if (intent.type === "sentence-replace-n") {
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Formuliere Satz 2 um Ich rufe dich morgen an -> sentence-replace-n", () => {
    const intent = routeVoiceIntent("Formuliere Satz 2 um Ich rufe dich morgen an");
    expect(intent.type).toBe("sentence-replace-n");
    if (intent.type === "sentence-replace-n") {
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Ersetze Satz 2 durch Ich rufe dich morgen an -> sentence-replace-n", () => {
    const intent = routeVoiceIntent("Ersetze Satz 2 durch Ich rufe dich morgen an");
    expect(intent.type).toBe("sentence-replace-n");
    if (intent.type === "sentence-replace-n") {
      expect(intent.payload.n).toBe(2);
    }
    expect(intent.type).not.toBe("email-compose");
  });

  it("Ändere Satz 2 zu. -> NO-OP", () => {
    const intent = routeVoiceIntent("Ändere Satz 2 zu.");
    expect(intent.type).toBe("unknown");
    expect(intent.type).not.toBe("email-compose");
  });
});

