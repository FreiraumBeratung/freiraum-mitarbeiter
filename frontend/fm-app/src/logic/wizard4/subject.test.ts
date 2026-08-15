import { describe, it, expect } from "vitest";
import { generateWizard4Subject } from "./subject";
import type { Wizard4IntentResult } from "./intent";

function baseIntent(overrides: Partial<Wizard4IntentResult> = {}): Wizard4IntentResult {
  return {
    recipientName: "Peter",
    recipientEmail: null,
    tone: "locker",
    mailType: "new",
    message: "Hi Peter, hier ist Dennis. Ich hoffe dir geht es gut.",
    sendMode: "sendNow",
    contextRef: null,
    rawInput: "Sende folgende Nachricht an Peter Hi Peter hier ist Dennis Ich hoffe dir geht es gut",
    ...overrides,
  };
}

describe("generateWizard4Subject", () => {
  it("does not guess Termin morgen from a greeting without any appointment", () => {
    expect(generateWizard4Subject(baseIntent())).toBe("Kurze Info");
  });

  it("does not guess Termin morgen just because the body contains morgen/heute/uhr", () => {
    expect(
      generateWizard4Subject(
        baseIntent({
          message: "Hi Peter, hier ist Dennis. Ich hoffe dir geht es morgen gut und wir sehen uns heute um 10 Uhr.",
        })
      )
    ).toBe("Kurze Info");
  });

  it("does not guess Termin morgen from ich bin im Termin", () => {
    expect(generateWizard4Subject(baseIntent({ message: "ich bin im termin" }))).toBe("Kurze Info");
  });

  it("keeps type-specific subjects", () => {
    expect(generateWizard4Subject(baseIntent({ mailType: "reply" }))).toBe("Rückmeldung");
    expect(generateWizard4Subject(baseIntent({ mailType: "followup" }))).toBe("Kurze Nachfrage");
    expect(generateWizard4Subject(baseIntent({ mailType: "reminder" }))).toBe("Erinnerung");
  });
});
