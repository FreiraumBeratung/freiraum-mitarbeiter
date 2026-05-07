import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";
import { clearSelectedMailContext, setSelectedMailContext } from "../mail/selectedMailContext";

const fakeNavigate = (() => {}) as any;

describe("processVoiceCommand explicit send confirmation", () => {
  let sendNowSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    sendNowSpy = vi.fn();
    (globalThis as any).window.__fm_send_mail_now = sendNowSpy;
    (globalThis as any).window.__fm_get_mail_to = vi.fn(() => "ctx@example.com");
    (globalThis as any).window.__fm_get_mail_subject = vi.fn(() => "AW: Test");
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => "Entwurfstext.");
    (globalThis as any).window.__fm_set_mail_body = vi.fn();
    setSelectedMailContext({
      uid: "ctx-send-confirm",
      messageId: "<ctx-send-confirm@test>",
      subject: "AW: Test",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });
  });

  afterEach(() => {
    clearSelectedMailContext();
    delete (globalThis as any).window.__fm_send_mail_now;
    delete (globalThis as any).window.__fm_get_mail_to;
    delete (globalThis as any).window.__fm_get_mail_subject;
    delete (globalThis as any).window.__fm_get_mail_body;
    delete (globalThis as any).window.__fm_set_mail_body;
  });

  it('sends immediately for explicit context confirmation ("jetzt senden")', async () => {
    processVoiceCommand("Jetzt senden", fakeNavigate);
    await new Promise((r) => setTimeout(r, 80));
    expect(sendNowSpy).toHaveBeenCalledTimes(1);
  });
});

