import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router sentence-replace ASR seit->satz", () => {
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

  it("Er setzte seit 2 durch. Hey Thomas. -> sentence-replace-n (kein compose fallback)", () => {
    const intent = routeVoiceIntent("Er setzte seit 2 durch. Hey Thomas.");
    expect(intent.type).toBe("sentence-replace-n");
    expect(intent.type).not.toBe("email-compose");
    if (intent.type === "sentence-replace-n") {
      expect(intent.payload.n).toBe(2);
      expect(intent.payload.text.length).toBeGreaterThan(0);
    }
  });
});

