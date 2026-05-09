import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router sentence-delete-nth", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_get_mail_body = vi.fn(() => "A. B. C. D. E.");
    (globalThis as any).window.__fm_set_mail_body = vi.fn();
  });

  afterEach(() => {
    if ((globalThis as any).window) {
      delete (globalThis as any).window.__fm_get_mail_body;
      delete (globalThis as any).window.__fm_set_mail_body;
    }
  });

  it("Lösche Satz 3 -> sentence-delete-nth(n=3)", () => {
    const intent = routeVoiceIntent("Lösche Satz 3.");
    expect(intent.type).toBe("sentence-delete-nth");
    if (intent.type === "sentence-delete-nth") expect(intent.payload.n).toBe(3);
  });

  it("Lösche den dritten Satz -> sentence-delete-nth(n=3)", () => {
    const intent = routeVoiceIntent("Lösche den dritten Satz.");
    expect(intent.type).toBe("sentence-delete-nth");
    if (intent.type === "sentence-delete-nth") expect(intent.payload.n).toBe(3);
  });

  it("Lösche den 3. Satz -> sentence-delete-nth(n=3)", () => {
    const intent = routeVoiceIntent("Lösche den 3. Satz.");
    expect(intent.type).toBe("sentence-delete-nth");
    if (intent.type === "sentence-delete-nth") expect(intent.payload.n).toBe(3);
  });

  it("Entferne Satz 1 -> sentence-delete-nth(n=1)", () => {
    const intent = routeVoiceIntent("Entferne Satz 1");
    expect(intent.type).toBe("sentence-delete-nth");
    if (intent.type === "sentence-delete-nth") expect(intent.payload.n).toBe(1);
  });

  it("Nimm Satz 3 raus -> sentence-delete-nth(n=3)", () => {
    const intent = routeVoiceIntent("Nimm Satz 3 raus");
    expect(intent.type).toBe("sentence-delete-nth");
    if (intent.type === "sentence-delete-nth") expect(intent.payload.n).toBe(3);
  });

  it("ASR alias Blöschesatz 2 -> sentence-delete-nth(n=2)", () => {
    const intent = routeVoiceIntent("Blöschesatz 2");
    expect(intent.type).toBe("sentence-delete-nth");
    if (intent.type === "sentence-delete-nth") expect(intent.payload.n).toBe(2);
  });

  it("Lösche Satz 99 -> sentence-delete-nth (execute no-op later)", () => {
    const intent = routeVoiceIntent("Lösche Satz 99");
    expect(intent.type).toBe("sentence-delete-nth");
  });

  it("Ersetze nicht in email-compose-fallback", () => {
    const intent = routeVoiceIntent("Lösche den dritten Satz.");
    expect(intent.type).not.toBe("email-compose");
  });
});

