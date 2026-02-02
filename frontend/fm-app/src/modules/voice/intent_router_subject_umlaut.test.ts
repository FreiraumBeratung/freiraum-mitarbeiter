import { describe, it, expect } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("subject umlaut fix", () => {
  it("converts Ruckruf to Rückruf when subject parsed from Betreff (draft-entwurf)", () => {
    const r = routeVoiceIntent("Entwurf an Thomas, Betreff Ruckruf Hi Thomas, Ruf mich bitte kurz zurück.");
    expect(r.type).toBe("email-compose");
    if (r.type === "email-compose") {
      expect(r.subjectHint).toBe("Rückruf");
    }
  });
});
