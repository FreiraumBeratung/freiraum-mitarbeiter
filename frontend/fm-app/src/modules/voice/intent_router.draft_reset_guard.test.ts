import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("Draft-Reset-Guard (composer open + delete/reset phrase)", () => {
  let originalSendMailNow: unknown;

  beforeEach(() => {
    originalSendMailNow = (globalThis as any).window?.__fm_send_mail_now;
  });

  afterEach(() => {
    if (typeof (globalThis as any).window !== "undefined") {
      (globalThis as any).window.__fm_send_mail_now = originalSendMailNow;
    }
  });

  it("routes 'Text löschen' to mail-body-clear when composer is open", () => {
    (globalThis as any).window.__fm_send_mail_now = () => {};
    const intent = routeVoiceIntent("Text löschen");
    expect(intent.type).toBe("mail-body-clear");
  });

  it("routes 'Zurücksetzen' to mail-draft-reset when composer is open", () => {
    (globalThis as any).window.__fm_send_mail_now = () => {};
    const intent = routeVoiceIntent("Zurücksetzen.");
    expect(intent.type).toBe("mail-draft-reset");
  });

  it("routes ambiguous 'Löschen' to mail-delete-clarify when composer is open", () => {
    (globalThis as any).window.__fm_send_mail_now = () => {};
    const intent = routeVoiceIntent("Löschen");
    expect(intent.type).toBe("mail-delete-clarify");
  });

  it("does not route to mail-draft-reset when composer is closed", () => {
    delete (globalThis as any).window.__fm_send_mail_now;
    const intent = routeVoiceIntent("Text löschen");
    expect(intent.type).not.toBe("mail-body-clear");
  });
});

