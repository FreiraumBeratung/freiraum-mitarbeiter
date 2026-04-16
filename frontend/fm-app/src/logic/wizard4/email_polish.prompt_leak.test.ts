import { afterEach, describe, expect, it, vi } from "vitest";
import { polishEmailBody } from "./email_polish";

describe("polishEmailBody prompt-leak guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to original body when AI returns prompt instructions", async () => {
    const original = "Hi Thomas, ich melde mich morgen.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          reply:
            "Gib nur den korrigierten E-Mail-Body zurück, ohne Erklärungen, ohne Labels, ohne Meta-Wörter.",
        }),
      }))
    );

    const result = await polishEmailBody(original, { mode: "previewOnly" });
    expect(result.ok).toBe(false);
    expect(result.usedAi).toBe(false);
    expect(result.body).toBe(original);
    expect(result.reason).toBe("prompt_instruction_leak_detected");
  });
});
