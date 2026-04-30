import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router append follow-up mode", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => "Hallo.");
    (globalThis as any).window.__fm_set_mail_body = vi.fn();
    (globalThis as any).window.__fm_append_followup_pending = null;
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_get_mail_body;
    delete (globalThis as any).window.__fm_set_mail_body;
    delete (globalThis as any).window.__fm_append_followup_pending;
  });

  it('"text fortführen" aktiviert append follow-up prompt', () => {
    const intent = routeVoiceIntent("Text fortführen");
    expect(intent.type).toBe("email-append");
    if (intent.type === "email-append") {
      expect(intent.payload.appendText).toBe("");
    }
    expect((globalThis as any).window.__fm_append_followup_pending).toBeTruthy();
  });

  it("nächste freie Diktat-Äußerung wird als email-append geroutet", () => {
    (globalThis as any).window.__fm_append_followup_pending = { ts: Date.now() };
    const intent = routeVoiceIntent("ich bringe morgen den Schotter mit");
    expect(intent.type).toBe("email-append");
    if (intent.type === "email-append") {
      expect(intent.payload.appendText.toLowerCase()).toContain("schotter");
    }
    expect((globalThis as any).window.__fm_append_followup_pending).toBeNull();
  });

  it("abbrechen löscht append follow-up pending", () => {
    (globalThis as any).window.__fm_append_followup_pending = { ts: Date.now() };
    const intent = routeVoiceIntent("abbrechen");
    expect(intent.type).not.toBe("email-append");
    expect((globalThis as any).window.__fm_append_followup_pending).toBeNull();
  });
});

