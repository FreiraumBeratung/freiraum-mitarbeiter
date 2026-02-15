import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router sentence-delete-last-n", () => {
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

  it("Lösche die letzten 2 Sätze -> sentence-delete-last-n(n=2)", () => {
    const intent = routeVoiceIntent("Lösche die letzten 2 Sätze.");
    expect(intent.type).toBe("sentence-delete-last-n");
    if (intent.type === "sentence-delete-last-n") expect(intent.payload.n).toBe(2);
  });

  it("Entferne bitte die letzten drei Sätze -> sentence-delete-last-n(n=3)", () => {
    const intent = routeVoiceIntent("Entferne bitte die letzten drei Sätze.");
    expect(intent.type).toBe("sentence-delete-last-n");
    if (intent.type === "sentence-delete-last-n") expect(intent.payload.n).toBe(3);
  });

  it("Mach die letzten 4 Sätze weg -> sentence-delete-last-n(n=4)", () => {
    const intent = routeVoiceIntent("Mach die letzten 4 Sätze weg.");
    expect(intent.type).toBe("sentence-delete-last-n");
    if (intent.type === "sentence-delete-last-n") expect(intent.payload.n).toBe(4);
  });

  it("Lösch die letzten fünf Sätze -> sentence-delete-last-n(n=5)", () => {
    const intent = routeVoiceIntent("Lösch die letzten fünf Sätze.");
    expect(intent.type).toBe("sentence-delete-last-n");
    if (intent.type === "sentence-delete-last-n") expect(intent.payload.n).toBe(5);
  });

  it("Lösche den letzten Satz -> bestehender delete-last bleibt", () => {
    const intent = routeVoiceIntent("Lösche den letzten Satz.");
    expect(intent.type).toBe("email-body-delete-last-sentence");
    if (intent.type === "email-body-delete-last-sentence") expect(intent.payload.n).toBe(1);
  });
});

