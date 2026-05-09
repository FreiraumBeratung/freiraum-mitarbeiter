import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";
import { clearSelectedMailContext, setSelectedMailContext } from "../mail/selectedMailContext";

const fakeNavigate = (() => {}) as any;

describe("processVoiceCommand noise guard", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_set_mail_body = vi.fn();
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => "Bestehender Text.");
    setSelectedMailContext({
      uid: "ctx-noise",
      messageId: "<ctx-noise@test>",
      subject: "AW: Test",
      fromEmail: "ctx@example.com",
      fromName: "Context User",
    });
  });

  afterEach(() => {
    clearSelectedMailContext();
    delete (globalThis as any).window.__fm_set_mail_body;
    delete (globalThis as any).window.__fm_get_mail_body;
    delete (globalThis as any).window.__fm_last_hint;
  });

  it("ignores one-letter noise utterance in active compose context", () => {
    processVoiceCommand("Z.", fakeNavigate);
    const hint = (globalThis as any).window.__fm_last_hint;
    expect(hint?.kind).toBe("voice_noise_retry");
  });

  it('blocks unclear ai-chat fallback in active compose context ("Text-Glaschen")', () => {
    processVoiceCommand("Text-Glaschen.", fakeNavigate);
    const hint = (globalThis as any).window.__fm_last_hint;
    expect(hint?.kind).toBe("voice_command_retry");
  });

  it('blocks unclear compose fallback in active context ("Schiss Satz 1")', () => {
    processVoiceCommand("Schiss Satz 1", fakeNavigate);
    const hint = (globalThis as any).window.__fm_last_hint;
    expect(hint?.kind).toBe("voice_command_retry");
    expect((globalThis as any).window.__fm_set_mail_body).not.toHaveBeenCalled();
  });
});
