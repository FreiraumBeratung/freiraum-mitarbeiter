import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";

const noop = () => {};
const fakeNavigate = noop as any;

describe("applyVoiceIntent explicit subject current compose", () => {
  let subject = "Termin morgen";
  let body = "";
  let to = "";
  let setSubject: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    subject = "Termin morgen";
    body = "";
    to = "";
    setSubject = vi.fn((next: string) => {
      subject = next;
    });
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_get_mail_subject = vi.fn(() => subject);
    (globalThis as any).window.__fm_set_mail_subject = setSubject;
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => body);
    (globalThis as any).window.__fm_set_mail_body = vi.fn((next: string) => {
      body = next;
    });
    (globalThis as any).window.__fm_get_mail_to = vi.fn(() => to);
    (globalThis as any).window.__fm_set_mail_to = vi.fn((next: string) => {
      to = next;
    });
    (globalThis as any).window.__fm_subject_locked = true;
    (globalThis as any).window.__fm_subject_locked_value = "Termin morgen";
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_get_mail_subject;
    delete (globalThis as any).window.__fm_set_mail_subject;
    delete (globalThis as any).window.__fm_get_mail_body;
    delete (globalThis as any).window.__fm_set_mail_body;
    delete (globalThis as any).window.__fm_get_mail_to;
    delete (globalThis as any).window.__fm_set_mail_to;
    delete (globalThis as any).window.__fm_subject_locked;
    delete (globalThis as any).window.__fm_subject_locked_value;
  });

  it("explicit subject from current compose overrides stale locked subject", async () => {
    processVoiceCommand(
      "Schreib bitte folgende Nachricht an Thomas. Betreff Rückruf Hi Thomas, ich bin gerade im Termin.",
      fakeNavigate
    );
    await new Promise((r) => setTimeout(r, 900));
    expect(subject).toBe("Rückruf");
    expect(setSubject.mock.calls.some((c) => String(c[0]).trim() === "Rückruf")).toBe(true);
  });
});

