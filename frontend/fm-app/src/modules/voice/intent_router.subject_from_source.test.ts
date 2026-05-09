import { describe, expect, it } from "vitest";
import { routeVoiceIntent } from "./intent_router";

describe("intent_router subject-from-source", () => {
  it("nimmt explicitSubject aus sourceText trotz body-clean", () => {
    const intent = routeVoiceIntent(
      "Schreib bitte folgende Nachricht an Thomas. Betreff Rückruf Hi Thomas, ich habe deine Nachricht gesehen."
    );
    expect(intent.type).toBe("email-compose");
    if (intent.type === "email-compose") {
      expect((intent as any).explicitSubject).toBe("Rückruf");
      expect(((intent as any).explicitSubject ?? "").length).toBeGreaterThan(0);
    }
  });

  it("erkennt explicitSubject auch bei ASR-Variante 'betrefft'", () => {
    const intent = routeVoiceIntent(
      "Sende folgende Nachricht an Peter betrefft Baustelle. Hi Peter, ich komme morgen."
    );
    expect(intent.type).toBe("email-compose");
    if (intent.type === "email-compose") {
      expect(((intent as any).explicitSubject ?? "").toLowerCase()).toContain("baustelle");
      expect((intent.subjectHint ?? "").toLowerCase()).toContain("baustelle");
    }
  });
});

