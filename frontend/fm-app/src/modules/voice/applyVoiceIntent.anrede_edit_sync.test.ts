import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";

const fakeNavigate = (() => {}) as any;

describe("applyVoiceIntent anrede edit sync", () => {
  let bodyState = "";

  beforeEach(() => {
    bodyState = "Hi Dennis,\n\nMir geht's gut.";
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => bodyState);
    (globalThis as any).window.__fm_set_mail_body = vi.fn((next: string) => {
      bodyState = next;
    });
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_get_mail_body;
    delete (globalThis as any).window.__fm_set_mail_body;
    delete (globalThis as any).window.__fm_pending_body_replace;
  });

  it('updates body greeting for "Ändere die Anrede zu Hallo"', async () => {
    processVoiceCommand("Ändere die Anrede zu Hallo.", fakeNavigate);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(bodyState.startsWith("Hallo")).toBe(true);
    expect(bodyState).toContain("Mir geht's gut.");
  });
});

