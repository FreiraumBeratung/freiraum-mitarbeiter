import { describe, it, expect } from "vitest";
import { normalizeEmailBodyAfterPolish } from "./normalizeEmailBodyAfterPolish";

describe("normalizeEmailBodyAfterPolish", () => {
  it("removes short command prefix before greeting", () => {
    const input =
      "Schreiben und sende Sie direkt los. Hi Thomas, hier ist Dennis. Ich hoffe, dir geht es gut.";
    const out = normalizeEmailBodyAfterPolish(input);
    expect(out).toBe("Hi Thomas, hier ist Dennis. Ich hoffe, dir geht es gut.");
  });

  it("keeps body if greeting is already at start", () => {
    const input = "Hi Thomas, hier ist Dennis. Ich hoffe, dir geht es gut.";
    const out = normalizeEmailBodyAfterPolish(input);
    expect(out).toBe(input);
  });

  it("keeps body if there is no greeting", () => {
    const input = "Bitte sende die Unterlagen. Danke dir.";
    const out = normalizeEmailBodyAfterPolish(input);
    expect(out).toBe(input);
  });

  it("keeps body if prefix is long (safety)", () => {
    const longPrefix = "schreiben ".repeat(40); // >160 chars
    const input = `${longPrefix} Hi Thomas, hier ist Dennis.`;
    const out = normalizeEmailBodyAfterPolish(input);
    expect(out).toBe(input.trim());
  });

  it("keeps body if prefix does not look like a command", () => {
    const input =
      "Zur Info vorab: Hi Thomas, hier ist Dennis. Ich hoffe, dir geht es gut.";
    const out = normalizeEmailBodyAfterPolish(input);
    expect(out).toBe(input.trim());
  });

  it("handles common greetings like Hallo/Guten Tag", () => {
    const input = "Bitte jetzt sofort senden. Guten Tag Thomas, ich habe eine Frage.";
    const out = normalizeEmailBodyAfterPolish(input);
    expect(out).toBe("Guten Tag Thomas, ich habe eine Frage.");
  });
});



