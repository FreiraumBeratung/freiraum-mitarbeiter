import { describe, it, expect } from 'vitest';
import { stripTrailingSendPhrases, hasNoSendNegation } from "../intent/send_phrase_strip";

describe("stripTrailingSendPhrases", () => {
  it("removes 'und los' at end", () => {
    const r = stripTrailingSendPhrases("Hi Thomas, ich komme später und los.");
    expect(r.text).toBe("Hi Thomas, ich komme später");
    expect(r.stripped).toBe(true);
  });

  it("removes 'und schick es direkt los' at end", () => {
    const r = stripTrailingSendPhrases("Hi Thomas, ich komme 15 Minuten später und schick es direkt los.");
    expect(r.text).toBe("Hi Thomas, ich komme 15 Minuten später");
    expect(r.stripped).toBe(true);
  });

  it("removes 'sofort senden' at end", () => {
    const r = stripTrailingSendPhrases("Hi Thomas, kurze Info, bin später da sofort senden.");
    expect(r.text).toBe("Hi Thomas, kurze Info, bin später da");
    expect(r.stripped).toBe(true);
  });

  it("does not change normal text", () => {
    const r = stripTrailingSendPhrases("Hi Thomas, ich komme später.");
    expect(r.text).toBe("Hi Thomas, ich komme später.");
    expect(r.stripped).toBe(false);
  });

  it("removes 'schick direkt raus' at end", () => {
    const r = stripTrailingSendPhrases("Ich bin gleich da, schick direkt raus.");
    expect(r.text).toBe("Ich bin gleich da");
    expect(r.stripped).toBe(true);
  });

  it("removes 'schick .' kaputten Stummel at end", () => {
    const r = stripTrailingSendPhrases("Ich bin gleich da, schick .");
    expect(r.text).toBe("Ich bin gleich da");
    expect(r.stripped).toBe(true);
  });

  it("does NOT change text with 'schick' in the middle", () => {
    const r = stripTrailingSendPhrases("Hey, ich schick dir gleich die Zahlen.");
    expect(r.text).toBe("Hey, ich schick dir gleich die Zahlen.");
    expect(r.stripped).toBe(false);
  });
});

describe("hasNoSendNegation", () => {
  it("detects negation", () => {
    expect(hasNoSendNegation("Lass Thomas wissen: ich komme später, aber nicht senden.")).toBe(true);
    expect(hasNoSendNegation("noch nicht abschicken bitte")).toBe(true);
  });

  it("does not false-positive", () => {
    expect(hasNoSendNegation("Hi Thomas, ich komme später.")).toBe(false);
  });
});
