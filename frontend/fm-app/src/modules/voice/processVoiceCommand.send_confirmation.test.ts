import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";
import { clearSelectedMailContext, setSelectedMailContext } from "../mail/selectedMailContext";
import { setSendReviewMode } from "./send_review_mode";

const fakeNavigate = (() => {}) as any;

describe("processVoiceCommand explicit send confirmation", () => {
  let sendNowSpy: ReturnType<typeof vi.fn>;
  let setBodySpy: ReturnType<typeof vi.fn>;
  let mailTo = "ctx@example.com";
  let mailSubject = "AW: Test";
  let mailBody = "Entwurfstext.";

  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    mailTo = "ctx@example.com";
    mailSubject = "AW: Test";
    mailBody = "Entwurfstext.";
    sendNowSpy = vi.fn();
    setBodySpy = vi.fn((next: string) => {
      mailBody = next;
    });
    (globalThis as any).window.__fm_send_mail_now = sendNowSpy;
    (globalThis as any).window.__fm_get_mail_to = vi.fn(() => mailTo);
    (globalThis as any).window.__fm_get_mail_subject = vi.fn(() => mailSubject);
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => mailBody);
    (globalThis as any).window.__fm_set_mail_to = vi.fn((next: string) => {
      mailTo = next;
    });
    (globalThis as any).window.__fm_set_mail_subject = vi.fn((next: string) => {
      mailSubject = next;
    });
    (globalThis as any).window.__fm_set_mail_body = setBodySpy;
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
    delete (globalThis as any).window.__fm_set_mail_to;
    delete (globalThis as any).window.__fm_set_mail_subject;
    delete (globalThis as any).window.__fm_set_mail_body;
  });

  it('sends immediately for explicit context confirmation ("jetzt senden")', async () => {
    processVoiceCommand("Jetzt senden", fakeNavigate);
    await new Promise((r) => setTimeout(r, 80));
    expect(sendNowSpy).toHaveBeenCalledTimes(1);
  });

  it('treats "Direkt Ja." as direct context reply and strips leading question marks from body', async () => {
    processVoiceCommand("Direkt ? Ja.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 500));
    expect(setBodySpy).toHaveBeenCalledWith("Ja.");
    expect(sendNowSpy).toHaveBeenCalledTimes(1);
  });

  it("Sofort + offene Mail: diktierten Text direkt senden", async () => {
    (globalThis as any).window.__fm_mobile_shell = true;
    setSendReviewMode("sofort");
    processVoiceCommand("Ich komme morgen um zehn auf die Baustelle.", fakeNavigate);
    await new Promise((r) => setTimeout(r, 800));
    expect(setBodySpy).toHaveBeenCalled();
    const lastBody = String(setBodySpy.mock.calls.at(-1)?.[0] || "");
    expect(lastBody.toLowerCase()).toContain("baustelle");
    expect(sendNowSpy).toHaveBeenCalled();
    setSendReviewMode("pruefen");
    delete (globalThis as any).window.__fm_mobile_shell;
  });
});

