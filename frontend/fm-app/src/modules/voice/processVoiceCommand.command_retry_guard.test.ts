import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";
import { clearSelectedMailContext, setSelectedMailContext } from "../mail/selectedMailContext";

const fakeNavigate = (() => {}) as any;

describe("processVoiceCommand command retry guard", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_set_mail_body = vi.fn();
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => "Bestehender Text.");
    setSelectedMailContext({
      uid: "ctx-command-guard",
      messageId: "<ctx-command-guard@test>",
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

  it('routet "Löschersatz 1" als Satz-Delete im Composer-Kontext', async () => {
    processVoiceCommand("Löschersatz 1", fakeNavigate);
    await new Promise((r) => setTimeout(r, 50));
    expect((globalThis as any).window.__fm_set_mail_body).toHaveBeenCalledWith("");
  });

  it('routes merged ASR command "Textlöschen" to body clear', () => {
    processVoiceCommand("Textlöschen", fakeNavigate);
    expect((globalThis as any).window.__fm_set_mail_body).toHaveBeenCalledWith("");
  });
});

