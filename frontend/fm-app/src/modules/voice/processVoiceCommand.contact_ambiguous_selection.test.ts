import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVoiceCommand } from "./index";

const fakeNavigate = (() => {}) as any;

describe("processVoiceCommand contact ambiguous selection", () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__fm_set_mail_to = vi.fn();
    (globalThis as any).window.__fm_last_hint = {
      kind: "contact_ambiguous",
      message: "Mehrdeutiger Kontakt",
      ts: Date.now(),
    };
    (globalThis as any).window.__fm_contact_ambiguity_choices = {
      input: "peter",
      ts: Date.now(),
      choices: [
        {
          index: 1,
          displayName: "Peter A",
          email: "peter.a@example.com",
          label: "Kontakt 1: Peter A (peter.a@example.com)",
        },
        {
          index: 2,
          displayName: "Peter B",
          email: "peter.b@example.com",
          label: "Kontakt 2: Peter B (peter.b@example.com)",
        },
      ],
    };
  });

  afterEach(() => {
    delete (globalThis as any).window.__fm_set_mail_to;
    delete (globalThis as any).window.__fm_last_hint;
    delete (globalThis as any).window.__fm_contact_ambiguity_choices;
  });

  it("accepts 'Kontakt 2' and sets selected recipient", () => {
    processVoiceCommand("Kontakt 2", fakeNavigate);
    expect((globalThis as any).window.__fm_set_mail_to).toHaveBeenCalledWith("peter.b@example.com");
    expect((globalThis as any).window.__fm_last_hint?.kind).toBe("contact_ambiguous_resolved");
    expect((globalThis as any).window.__fm_contact_ambiguity_choices).toBeNull();
  });

  it("accepts 'erste Person' and sets first recipient", () => {
    processVoiceCommand("erste Person", fakeNavigate);
    expect((globalThis as any).window.__fm_set_mail_to).toHaveBeenCalledWith("peter.a@example.com");
    expect((globalThis as any).window.__fm_last_hint?.kind).toBe("contact_ambiguous_resolved");
    expect((globalThis as any).window.__fm_contact_ambiguity_choices).toBeNull();
  });

  it("does not auto-select on unrelated phrase with number ('Fakt 1')", () => {
    processVoiceCommand("Fakt 1", fakeNavigate);
    expect((globalThis as any).window.__fm_set_mail_to).not.toHaveBeenCalled();
    expect((globalThis as any).window.__fm_last_hint?.kind).toBe("contact_ambiguous");
    expect((globalThis as any).window.__fm_contact_ambiguity_choices?.choices?.length).toBe(2);
  });
});

